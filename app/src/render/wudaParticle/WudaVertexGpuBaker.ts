/**
 * Scheme C GPU baker: per-mesh compact vertex batches + explicit TSL skin compute.
 * Bone/bind uniforms reference live mesh/skeleton objects (no stale copies).
 * Formula aligned with three Skinning.js getSkinnedPosition / applyBoneTransform.
 * Dual world-position history for velocity (Skinner / NoiseCrime Smrvfx semantics).
 */
import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { AttachedBindMode } from 'three/webgpu';
import {
  Fn,
  add,
  buffer,
  instanceIndex,
  instancedArray,
  storage,
  uniform,
  vec4,
} from 'three/tsl';
import {
  extractVertexSkinAttrs,
  type WudaVertexSample,
} from './WudaVertexIndexBake';

const _local = new THREE.Vector3();
const _world = new THREE.Vector3();

/** TSL nodes are loosely typed — three generics are brittle. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslAny = any;

type MeshBatch = {
  meshIndex: number;
  source: THREE.SkinnedMesh;
  /** Global slot indices into samples / currWorld (same order as batch-local verts). */
  globalSlots: number[];
  /** Pose frozen at bakeGpu start — safe across async readback yields. */
  boneMatricesCopy: Float32Array;
  bindMatrixFrozen: THREE.Matrix4;
  bindMatrixInverseFrozen: THREE.Matrix4;
  matrixWorldFrozen: THREE.Matrix4;
  boneMatricesNode: TslAny;
  bindMatrixUniform: TslAny;
  bindMatrixInverseUniform: TslAny | null;
  /**
   * AttachedBindMode: compute outputs **world** positions via algebraic cancel
   * `boneBlend * bindMatrix * pos` (avoids GPU inv(MW)·MW drift vs CPU).
   * Detached: compute outputs skinned local; then × matrixWorldFrozen.
   */
  outputsWorld: boolean;
  currStorage: TslAny;
  computeNode: unknown;
  localScratch: Float32Array;
};

export type WudaWorldErrorStats = {
  max: number;
  p95: number;
  mean: number;
  count: number;
};

export type WudaGpuBakeResult = {
  world: Float32Array;
  /** max |gpu-cpu| on a subset, computed at the **same** skeleton pose as the GPU bake. */
  samePoseErr: number;
  samePoseStats: WudaWorldErrorStats;
};

export class WudaVertexGpuBaker {
  private sourceMesh: THREE.SkinnedMesh | null = null;
  private sourceMeshes: THREE.SkinnedMesh[] = [];
  private samples: WudaVertexSample[] = [];
  private batches: MeshBatch[] = [];
  private currWorld = new Float32Array(0);
  private prevWorld = new Float32Array(0);
  /** Side buffer written by async bakeGpu — never race with currWorld on the sim thread. */
  private gpuOut = new Float32Array(0);
  /** CPU gold captured inside bakeGpu after the same skeleton.update(). */
  private cpuSnap = new Float32Array(0);
  private frameIndex = 0;
  private gpuDegraded = false;
  lastBakeMs = 0;
  lastSamePoseErr = 0;
  lastSamePoseStats: WudaWorldErrorStats = {
    max: 0,
    p95: 0,
    mean: 0,
    count: 0,
  };
  lastCount = 0;
  /** `gpu` | `cpu` — last committed bake path used for simulate. */
  lastBakePath: 'gpu' | 'cpu' = 'cpu';

  get count(): number {
    return this.samples.length;
  }

  get isReady(): boolean {
    return this.samples.length > 0 && this.sourceMeshes.length > 0;
  }

  get hasGpu(): boolean {
    return this.batches.length > 0 && !this.gpuDegraded;
  }

  get gpuBatchCount(): number {
    return this.batches.length;
  }

  get isGpuDegraded(): boolean {
    return this.gpuDegraded;
  }

  /**
   * Build compact proxy mesh bound to the same skeleton as `source`.
   * TRAP-SHARED-SKELETON: dispose() must not call skeleton.dispose().
   */
  build(source: THREE.SkinnedMesh, samples: WudaVertexSample[]): boolean {
    return this.buildFromMeshes([source], samples);
  }

  /**
   * Multi-mesh build: one GPU batch per source mesh that contributes samples.
   * Shared bone objects are fine; each mesh keeps its own Skeleton.boneMatrices
   * + bindMatrix / matrixWorld.
   */
  buildFromMeshes(
    meshes: THREE.SkinnedMesh[],
    samples: WudaVertexSample[],
  ): boolean {
    this.disposeBatchesOnly();
    const list = meshes.filter((m) => m?.skeleton && m.geometry);
    this.sourceMeshes = list;
    this.sourceMesh = list[0] ?? null;
    this.samples = samples.slice();
    this.frameIndex = 0;
    this.lastCount = samples.length;
    this.gpuDegraded = false;
    this.lastBakePath = 'cpu';
    this.lastSamePoseErr = 0;
    this.lastSamePoseStats = { max: 0, p95: 0, mean: 0, count: 0 };

    if (list.length === 0 || samples.length === 0) return false;

    const n = samples.length;
    this.currWorld = new Float32Array(n * 3);
    this.prevWorld = new Float32Array(n * 3);
    this.gpuOut = new Float32Array(n * 3);
    this.cpuSnap = new Float32Array(n * 3);

    // Group global sample indices by meshIndex.
    const byMesh = new Map<number, number[]>();
    for (let gi = 0; gi < samples.length; gi++) {
      const mi = Math.max(
        0,
        Math.min(list.length - 1, samples[gi]!.meshIndex ?? 0),
      );
      let arr = byMesh.get(mi);
      if (!arr) {
        arr = [];
        byMesh.set(mi, arr);
      }
      arr.push(gi);
    }

    for (const [meshIndex, globalSlots] of byMesh) {
      const source = list[meshIndex];
      if (!source?.skeleton) continue;
      const batchSamples = globalSlots.map((gi) => samples[gi]!);
      const batch = this.createBatch(source, meshIndex, batchSamples, globalSlots);
      if (batch) this.batches.push(batch);
    }

    // Structural OK even if GPU batches failed to compile — CPU path still works.
    return true;
  }

  private createBatch(
    source: THREE.SkinnedMesh,
    meshIndex: number,
    batchSamples: WudaVertexSample[],
    globalSlots: number[],
  ): MeshBatch | null {
    if (!source.skeleton || batchSamples.length === 0) return null;
    const attrs = extractVertexSkinAttrs(source.geometry, batchSamples);
    if (!attrs) return null;

    const n = batchSamples.length;
    const boneCount = source.skeleton.bones.length;
    if (boneCount <= 0 || !source.skeleton.boneMatrices) return null;

    // Frozen pose buffers — filled at each bakeGpu start. Live skeleton arrays must
    // NOT be referenced: 17× await readback yields let the mixer advance bones and
    // desync CPU snap (taken at T0) from later batches (~15cm same-pose false fail).
    const boneMatricesCopy = new Float32Array(boneCount * 16);
    boneMatricesCopy.set(source.skeleton.boneMatrices);
    const bindMatrixFrozen = source.bindMatrix.clone();
    const bindMatrixInverseFrozen = source.bindMatrixInverse.clone();
    const matrixWorldFrozen = source.matrixWorld.clone();

    const bindMatrixUniform: TslAny = uniform(bindMatrixFrozen, 'mat4');
    const boneMatricesNode: TslAny = buffer(boneMatricesCopy, 'mat4', boneCount);

    // AttachedBindMode: bindMatrixInverse is inv(matrixWorld) every frame.
    // Algebra: world = MW * inv(MW) * boneBlend * bind * p = boneBlend * bind * p.
    const outputsWorld = source.bindMode === AttachedBindMode;
    const bindMatrixInverseUniform: TslAny | null = outputsWorld
      ? null
      : (uniform(bindMatrixInverseFrozen, 'mat4') as TslAny);

    const posAttr = new THREE.InstancedBufferAttribute(attrs.positions, 3);
    const skinIndexU32 = new Uint32Array(n * 4);
    for (let i = 0; i < n * 4; i++) {
      skinIndexU32[i] = attrs.skinIndex[i] ?? 0;
    }
    const skinIndexAttr = new THREE.InstancedBufferAttribute(skinIndexU32, 4);
    const skinWeightAttr = new THREE.InstancedBufferAttribute(attrs.skinWeight, 4);

    const posStorage = storage(posAttr, 'vec3', n).setPBO(true).toReadOnly();
    const skinIndexStorage = storage(skinIndexAttr, 'uvec4', n)
      .setPBO(true)
      .toReadOnly();
    const skinWeightStorage = storage(skinWeightAttr, 'vec4', n)
      .setPBO(true)
      .toReadOnly();
    // vec4 avoids WGSL array<vec3> 16-byte stride surprises on readback.
    const outStorage: TslAny = instancedArray(n, 'vec4');

    const computeNode = outputsWorld
      ? Fn(() => {
          const position = posStorage.element(instanceIndex);
          const skinIndex = skinIndexStorage.element(instanceIndex);
          const skinWeight = skinWeightStorage.element(instanceIndex);
          const boneMatX = boneMatricesNode.element(skinIndex.x);
          const boneMatY = boneMatricesNode.element(skinIndex.y);
          const boneMatZ = boneMatricesNode.element(skinIndex.z);
          const boneMatW = boneMatricesNode.element(skinIndex.w);
          const skinVertex = bindMatrixUniform.mul(position);
          const skinned: TslAny = add(
            boneMatX.mul(skinWeight.x).mul(skinVertex),
            boneMatY.mul(skinWeight.y).mul(skinVertex),
            boneMatZ.mul(skinWeight.z).mul(skinVertex),
            boneMatW.mul(skinWeight.w).mul(skinVertex),
          );
          // Already world for AttachedBindMode (see comment above).
          outStorage.element(instanceIndex).assign(vec4(skinned.xyz, 1));
        })().compute(n)
      : Fn(() => {
          const position = posStorage.element(instanceIndex);
          const skinIndex = skinIndexStorage.element(instanceIndex);
          const skinWeight = skinWeightStorage.element(instanceIndex);
          const boneMatX = boneMatricesNode.element(skinIndex.x);
          const boneMatY = boneMatricesNode.element(skinIndex.y);
          const boneMatZ = boneMatricesNode.element(skinIndex.z);
          const boneMatW = boneMatricesNode.element(skinIndex.w);
          const skinVertex = bindMatrixUniform.mul(position);
          const skinned = add(
            boneMatX.mul(skinWeight.x).mul(skinVertex),
            boneMatY.mul(skinWeight.y).mul(skinVertex),
            boneMatZ.mul(skinWeight.z).mul(skinVertex),
            boneMatW.mul(skinWeight.w).mul(skinVertex),
          );
          const skinPosition = bindMatrixInverseUniform!.mul(skinned).xyz;
          outStorage.element(instanceIndex).assign(vec4(skinPosition, 1));
        })().compute(n);

    return {
      meshIndex,
      source,
      globalSlots: globalSlots.slice(),
      boneMatricesCopy,
      bindMatrixFrozen,
      bindMatrixInverseFrozen,
      matrixWorldFrozen,
      boneMatricesNode,
      bindMatrixUniform,
      bindMatrixInverseUniform,
      outputsWorld,
      currStorage: outStorage,
      computeNode,
      localScratch: new Float32Array(n * 4),
    };
  }

  /**
   * CPU gold-standard world positions (applyBoneTransform + matrixWorld).
   * Used for tests and GPU vs CPU subset checks.
   */
  bakeCpuWorld(out: Float32Array): void {
    if (this.sourceMeshes.length === 0) return;
    const n = this.samples.length;
    if (out.length < n * 3) return;
    const updated = new Set<THREE.Skeleton>();
    for (const mesh of this.sourceMeshes) {
      if (!mesh.skeleton || updated.has(mesh.skeleton)) continue;
      mesh.skeleton.update();
      updated.add(mesh.skeleton);
    }
    for (let i = 0; i < n; i++) {
      const sample = this.samples[i]!;
      const meshIndex = Math.max(
        0,
        Math.min(this.sourceMeshes.length - 1, sample.meshIndex ?? 0),
      );
      const mesh = this.sourceMeshes[meshIndex]!;
      const srcPos = mesh.geometry.getAttribute('position');
      const vi = sample.vertexIndex;
      _local.fromBufferAttribute(srcPos, vi);
      mesh.applyBoneTransform(vi, _local);
      _world.copy(_local).applyMatrix4(mesh.matrixWorld);
      out[i * 3] = _world.x;
      out[i * 3 + 1] = _world.y;
      out[i * 3 + 2] = _world.z;
    }
  }

  /**
   * True when GPU world positions look like an origin dump (failed compute/readback).
   * Screenshot failure mode: cloud piled at the character root between the feet.
   */
  gpuWorldLooksDegenerate(world: Float32Array): boolean {
    const n = this.samples.length;
    if (n <= 0 || world.length < n * 3) return true;

    let nearOrigin = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const sample = this.samples[i]!;
      const meshIndex = Math.max(
        0,
        Math.min(this.sourceMeshes.length - 1, sample.meshIndex ?? 0),
      );
      const mesh = this.sourceMeshes[meshIndex] ?? this.sourceMesh;
      if (!mesh) {
        nearOrigin++;
        continue;
      }
      const ox = mesh.matrixWorld.elements[12]!;
      const oy = mesh.matrixWorld.elements[13]!;
      const oz = mesh.matrixWorld.elements[14]!;
      const x = world[i * 3]!;
      const y = world[i * 3 + 1]!;
      const z = world[i * 3 + 2]!;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        nearOrigin++;
        continue;
      }
      const dx = x - ox;
      const dy = y - oy;
      const dz = z - oz;
      if (dx * dx + dy * dy + dz * dz < 0.04) nearOrigin++;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (nearOrigin > n * 0.5) return true;
    // Animated body should span well over 0.3m in Y; a flat blob at the root is bad.
    if (maxY - minY < 0.25) return true;
    return false;
  }

  worldErrorStats(
    a: Float32Array,
    b: Float32Array,
    sampleLimit = 24,
  ): WudaWorldErrorStats {
    const n = this.samples.length;
    if (n <= 0 || a.length < n * 3 || b.length < n * 3) {
      return { max: Infinity, p95: Infinity, mean: Infinity, count: 0 };
    }
    const step = Math.max(1, Math.floor(n / sampleLimit));
    const errors: number[] = [];
    for (let i = 0; i < n; i += step) {
      const dx = a[i * 3]! - b[i * 3]!;
      const dy = a[i * 3 + 1]! - b[i * 3 + 1]!;
      const dz = a[i * 3 + 2]! - b[i * 3 + 2]!;
      errors.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    errors.sort((x, y) => x - y);
    const count = errors.length;
    const max = errors[count - 1] ?? Infinity;
    const p95 = errors[Math.min(count - 1, Math.floor(count * 0.95))] ?? max;
    let sum = 0;
    for (const e of errors) sum += e;
    return { max, p95, mean: count > 0 ? sum / count : Infinity, count };
  }

  maxWorldError(a: Float32Array, b: Float32Array, sampleLimit = 12): number {
    return this.worldErrorStats(a, b, sampleLimit).max;
  }

  /**
   * Max |gpu-cpu| vs a **fresh** CPU bake at the caller's current pose.
   * Prefer samePoseErr from bakeGpu for live validation (async-safe).
   */
  maxWorldErrorVsCpu(gpuWorld: Float32Array, sampleLimit = 12): number {
    const n = this.samples.length;
    if (n <= 0 || gpuWorld.length < n * 3) return Infinity;
    const cpu = new Float32Array(n * 3);
    this.bakeCpuWorld(cpu);
    return this.maxWorldError(gpuWorld, cpu, sampleLimit);
  }

  /**
   * Accept GPU if typical verts are tight and worst-case is still coat-usable.
   * p95 < 6cm and max < 25cm (rejects true broken skinning, allows Attached FP).
   */
  static gpuSamePoseAcceptable(stats: WudaWorldErrorStats): boolean {
    return (
      Number.isFinite(stats.p95) &&
      Number.isFinite(stats.max) &&
      stats.p95 < 0.06 &&
      stats.max < 0.25
    );
  }

  /**
   * GPU compute skinning + readback into `gpuOut`.
   *
   * Pose is **frozen** into per-batch copies before any await. All `compute`s run
   * synchronously first; only then do we await readbacks. That way 17 batches cannot
   * straddle mixer ticks (which previously produced ~15cm same-pose false fails).
   */
  async bakeGpu(renderer: WebGPURenderer): Promise<WudaGpuBakeResult> {
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (this.batches.length === 0 || this.gpuOut.length < 3) {
      this.bakeCpuWorld(this.gpuOut);
      this.cpuSnap.set(this.gpuOut);
      this.lastSamePoseStats = { max: 0, p95: 0, mean: 0, count: 0 };
      this.lastSamePoseErr = 0;
      this.lastBakeMs =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        t0;
      return {
        world: this.gpuOut,
        samePoseErr: 0,
        samePoseStats: this.lastSamePoseStats,
      };
    }

    const updated = new Set<THREE.Skeleton>();
    for (const batch of this.batches) {
      const sk = batch.source.skeleton;
      if (!sk || updated.has(sk)) continue;
      sk.update();
      updated.add(sk);
    }

    // Freeze pose for every batch while still on the sync section of this call.
    for (const batch of this.batches) {
      const sk = batch.source.skeleton;
      if (sk?.boneMatrices) {
        batch.boneMatricesCopy.set(sk.boneMatrices);
      }
      batch.bindMatrixFrozen.copy(batch.source.bindMatrix);
      batch.bindMatrixInverseFrozen.copy(batch.source.bindMatrixInverse);
      batch.matrixWorldFrozen.copy(batch.source.matrixWorld);
      batch.boneMatricesNode.value = batch.boneMatricesCopy;
      batch.boneMatricesNode.clearUpdateRanges?.();
      batch.boneMatricesNode.addUpdateRange?.(0, batch.boneMatricesCopy.length);
    }

    // CPU gold at the same frozen moment (before any await).
    this.bakeCpuWorldAfterSkeletonUpdated(this.cpuSnap);

    // Dispatch all skin computes synchronously — results land in storage buffers.
    for (const batch of this.batches) {
      const compute = batch.computeNode as never;
      if (typeof renderer.compute === 'function') {
        renderer.compute(compute);
      } else {
        await renderer.computeAsync(compute);
      }
    }

    // Readbacks may yield; storages already hold T0 results.
    for (const batch of this.batches) {
      const ab = await renderer.getArrayBufferAsync(
        batch.currStorage.value as never,
      );
      const src = new Float32Array(ab);
      const bn = batch.globalSlots.length;
      const need = bn * 4;
      if (batch.localScratch.length < need) {
        batch.localScratch = new Float32Array(need);
      }
      batch.localScratch.set(src.subarray(0, need));

      const mw = batch.matrixWorldFrozen;
      for (let li = 0; li < bn; li++) {
        const gi = batch.globalSlots[li]!;
        _local.set(
          batch.localScratch[li * 4]!,
          batch.localScratch[li * 4 + 1]!,
          batch.localScratch[li * 4 + 2]!,
        );
        if (batch.outputsWorld) {
          this.gpuOut[gi * 3] = _local.x;
          this.gpuOut[gi * 3 + 1] = _local.y;
          this.gpuOut[gi * 3 + 2] = _local.z;
        } else {
          _world.copy(_local).applyMatrix4(mw);
          this.gpuOut[gi * 3] = _world.x;
          this.gpuOut[gi * 3 + 1] = _world.y;
          this.gpuOut[gi * 3 + 2] = _world.z;
        }
      }
    }

    this.lastSamePoseStats = this.worldErrorStats(this.gpuOut, this.cpuSnap, 48);
    this.lastSamePoseErr = this.lastSamePoseStats.max;
    this.lastBakeMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
      t0;
    return {
      world: this.gpuOut,
      samePoseErr: this.lastSamePoseErr,
      samePoseStats: this.lastSamePoseStats,
    };
  }

  /** Like bakeCpuWorld but assumes skeletons were already updated this tick. */
  private bakeCpuWorldAfterSkeletonUpdated(out: Float32Array): void {
    if (this.sourceMeshes.length === 0) return;
    const n = this.samples.length;
    if (out.length < n * 3) return;
    for (let i = 0; i < n; i++) {
      const sample = this.samples[i]!;
      const meshIndex = Math.max(
        0,
        Math.min(this.sourceMeshes.length - 1, sample.meshIndex ?? 0),
      );
      const mesh = this.sourceMeshes[meshIndex]!;
      const srcPos = mesh.geometry.getAttribute('position');
      const vi = sample.vertexIndex;
      _local.fromBufferAttribute(srcPos, vi);
      mesh.applyBoneTransform(vi, _local);
      _world.copy(_local).applyMatrix4(mesh.matrixWorld);
      out[i * 3] = _world.x;
      out[i * 3 + 1] = _world.y;
      out[i * 3 + 2] = _world.z;
    }
  }

  /** Mark GPU unusable for this baker lifetime (until rebuild). */
  markGpuDegraded(): void {
    this.gpuDegraded = true;
  }

  /** Commit a world buffer into currWorld for simulate (GPU pending or external). */
  commitWorldFrom(src: Float32Array, path: 'gpu' | 'cpu'): void {
    const n = this.currWorld.length;
    if (src.length < n) return;
    this.currWorld.set(src.subarray(0, n));
    this.frameIndex++;
    this.lastBakePath = path;
  }

  /**
   * Synchronous CPU bake into currWorld (fallback when GPU unavailable / degraded).
   */
  bakeCpuIntoCurr(): Float32Array {
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.bakeCpuWorld(this.currWorld);
    this.frameIndex++;
    this.lastBakePath = 'cpu';
    this.lastBakeMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
      t0;
    return this.currWorld;
  }

  /** Skinner isReady: need ≥1 previous frame before velocity/detach. */
  get hasPrevFrame(): boolean {
    return this.frameIndex >= 2;
  }

  /** At least one bake has filled currWorld. */
  get hasBakedFrame(): boolean {
    return this.frameIndex >= 1;
  }

  getCurrWorld(): Float32Array {
    return this.currWorld;
  }

  getPrevWorld(): Float32Array {
    return this.prevWorld;
  }

  /** After velocity computed: prev ← curr (double-buffer). */
  commitPrev(): void {
    this.prevWorld.set(this.currWorld);
  }

  /** Seed prev=curr on first valid frame (TRAP-V0). */
  seedPrevFromCurr(): void {
    this.prevWorld.set(this.currWorld);
  }

  private disposeBatchesOnly(): void {
    this.batches = [];
    this.samples = [];
    this.sourceMesh = null;
    this.sourceMeshes = [];
    this.frameIndex = 0;
    this.gpuDegraded = false;
  }

  dispose(): void {
    this.disposeBatchesOnly();
    this.currWorld = new Float32Array(0);
    this.prevWorld = new Float32Array(0);
    this.gpuOut = new Float32Array(0);
    this.cpuSnap = new Float32Array(0);
  }
}

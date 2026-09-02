/**
 * Scheme C GPU baker: proxy SkinnedMesh (N verts) + TSL computeSkinning → StorageBuffer.
 * Formula aligned with SkinnedMesh.applyBoneTransform (three r185 Skinning.js).
 * Dual world-position history for velocity (Skinner / NoiseCrime Smrvfx semantics).
 * docs/plans/ai-execution-plan-wuda-particle-scheme-c-vertex-gpu-bake-v0.md Step 3
 *
 * Import paths (Step 0 verified on three@0.185):
 *   three/webgpu → WebGPURenderer, SkinnedMesh, StorageInstancedBufferAttribute
 *   three/tsl → computeSkinning, instancedArray, instanceIndex
 */
import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { computeSkinning, instancedArray, instanceIndex } from 'three/tsl';
import {
  extractVertexSkinAttrs,
  type WudaVertexSample,
} from './WudaVertexIndexBake';

const _local = new THREE.Vector3();
const _world = new THREE.Vector3();

export class WudaVertexGpuBaker {
  private sourceMesh: THREE.SkinnedMesh | null = null;
  /** Multi-mesh cover list (same order as sample.meshIndex). */
  private sourceMeshes: THREE.SkinnedMesh[] = [];
  /** Proxy shares source.skeleton — never dispose that skeleton (TRAP-BONE-TEX-DISPOSE). */
  private proxy: THREE.SkinnedMesh | null = null;
  private samples: WudaVertexSample[] = [];
  /** TSL StorageBufferNode<'vec3'>; typed loosely — three TSL generics are brittle. */
  private currStorage: { value: THREE.BufferAttribute; element: (i: unknown) => unknown } | null =
    null;
  private computeNode: unknown = null;
  /** Reused readback target (TRAP-READBACK-GC). */
  private localScratch = new Float32Array(0);
  private currWorld = new Float32Array(0);
  private prevWorld = new Float32Array(0);
  private frameIndex = 0;
  lastBakeMs = 0;
  lastCount = 0;

  get count(): number {
    return this.samples.length;
  }

  get isReady(): boolean {
    return this.samples.length > 0 && this.sourceMeshes.length > 0;
  }

  /**
   * Build compact proxy mesh bound to the same skeleton as `source`.
   * TRAP-SHARED-SKELETON: dispose() must not call skeleton.dispose().
   */
  build(source: THREE.SkinnedMesh, samples: WudaVertexSample[]): boolean {
    return this.buildFromMeshes([source], samples);
  }

  /**
   * Multi-mesh build. Live tracking uses CPU applyBoneTransform per mesh;
   * GPU proxy is only created for the single-mesh case.
   */
  buildFromMeshes(
    meshes: THREE.SkinnedMesh[],
    samples: WudaVertexSample[],
  ): boolean {
    this.disposeProxyOnly();
    const list = meshes.filter((m) => m?.skeleton && m.geometry);
    this.sourceMeshes = list;
    this.sourceMesh = list[0] ?? null;
    this.samples = samples.slice();
    this.frameIndex = 0;
    this.lastCount = samples.length;

    if (list.length === 0 || samples.length === 0) return false;

    const n = samples.length;
    this.currWorld = new Float32Array(n * 3);
    this.prevWorld = new Float32Array(n * 3);
    this.localScratch = new Float32Array(n * 3);

    // Multi-mesh: CPU path only (skeletons / bind matrices may differ).
    if (list.length > 1) {
      this.proxy = null;
      this.currStorage = null;
      this.computeNode = null;
      return true;
    }

    const source = list[0]!;
    if (!source.skeleton) return false;

    const attrs = extractVertexSkinAttrs(source.geometry, samples);
    if (!attrs) return false;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(attrs.positions, 3),
    );
    geo.setAttribute(
      'skinIndex',
      new THREE.BufferAttribute(attrs.skinIndex, 4),
    );
    geo.setAttribute(
      'skinWeight',
      new THREE.BufferAttribute(attrs.skinWeight, 4),
    );

    // Dummy material — proxy is never rendered, only used by computeSkinning.
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const proxy = new THREE.SkinnedMesh(geo, mat);
    proxy.name = 'WudaVertexGpuBakeProxy';
    proxy.bind(source.skeleton, source.bindMatrix);
    proxy.bindMatrixInverse.copy(source.bindMatrixInverse);
    proxy.frustumCulled = false;
    this.proxy = proxy;

    const storageNode = instancedArray(n, 'vec3');
    this.currStorage = storageNode as unknown as {
      value: THREE.BufferAttribute;
      element: (i: unknown) => unknown;
    };
    // Official TSL compute skinning → write local skinned positions.
    // three/src/nodes/accessors/Skinning.js computeSkinning
    // Cast: Fn typing marks return as void when assign target is passed.
    const skinCompute = computeSkinning as unknown as (
      mesh: THREE.SkinnedMesh,
      toPos: unknown,
    ) => { compute: (count: number) => unknown };
    this.computeNode = skinCompute(
      proxy,
      storageNode.element(instanceIndex),
    ).compute(n);

    return true;
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
    const mesh = this.sourceMesh;
    const n = this.samples.length;
    if (!mesh || n <= 0 || world.length < n * 3) return true;
    const ox = mesh.matrixWorld.elements[12];
    const oy = mesh.matrixWorld.elements[13];
    const oz = mesh.matrixWorld.elements[14];
    let nearOrigin = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
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

  /**
   * GPU compute skinning + readback + world transform.
   * Updates currWorld; swaps into prevWorld after caller consumes velocity.
   */
  async bakeGpu(renderer: WebGPURenderer): Promise<Float32Array> {
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const mesh = this.sourceMesh;
    const proxy = this.proxy;
    const storage = this.currStorage;
    if (!mesh || !proxy || !storage || !this.computeNode) {
      return this.currWorld;
    }

    // Same as scheme B WudaCoatRuntime: boneMatrices are filled here, not at
    // GPU render time. computeSkinning's OnObjectUpdate never runs because the
    // proxy is not in the scene (Discourse #34210 analogue).
    mesh.skeleton.update();
    proxy.bindMatrix.copy(mesh.bindMatrix);
    proxy.bindMatrixInverse.copy(mesh.bindMatrixInverse);

    await renderer.computeAsync(this.computeNode as never);

    const ab = await renderer.getArrayBufferAsync(
      storage.value as never,
    );
    const src = new Float32Array(ab);
    const n = this.samples.length;
    const need = n * 3;
    if (this.localScratch.length < need) {
      this.localScratch = new Float32Array(need);
    }
    this.localScratch.set(src.subarray(0, need));

    for (let i = 0; i < n; i++) {
      _local.set(
        this.localScratch[i * 3]!,
        this.localScratch[i * 3 + 1]!,
        this.localScratch[i * 3 + 2]!,
      );
      _world.copy(_local).applyMatrix4(mesh.matrixWorld);
      this.currWorld[i * 3] = _world.x;
      this.currWorld[i * 3 + 1] = _world.y;
      this.currWorld[i * 3 + 2] = _world.z;
    }

    this.frameIndex++;
    this.lastBakeMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
      t0;
    return this.currWorld;
  }

  /**
   * Synchronous CPU bake into currWorld (fallback when GPU unavailable in tests).
   * Not sufficient alone to claim full Scheme C in production.
   */
  bakeCpuIntoCurr(): Float32Array {
    this.bakeCpuWorld(this.currWorld);
    this.frameIndex++;
    this.lastBakeMs = 0;
    return this.currWorld;
  }

  /** Skinner isReady: need ≥1 previous frame before velocity/detach. */
  get hasPrevFrame(): boolean {
    return this.frameIndex >= 2;
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

  private disposeProxyOnly(): void {
    if (this.proxy) {
      this.proxy.geometry.dispose();
      (this.proxy.material as THREE.Material).dispose();
      // Do NOT dispose shared skeleton.
      this.proxy = null;
    }
    this.currStorage = null;
    this.computeNode = null;
    this.samples = [];
    this.sourceMesh = null;
    this.sourceMeshes = [];
    this.frameIndex = 0;
  }

  dispose(): void {
    this.disposeProxyOnly();
    this.localScratch = new Float32Array(0);
    this.currWorld = new Float32Array(0);
    this.prevWorld = new Float32Array(0);
  }
}

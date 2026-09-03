/**
 * Scheme C runtime: vertex-index slots + GPU bake + existing detach/flight math.
 * docs/plans/ai-execution-plan-wuda-particle-scheme-c-vertex-gpu-bake-v0.md Step 4
 */
import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import type { MutableSimConfig } from '../../config/constants';
import { createMulberry32 } from '../hitVfx/mulberry32';
import {
  clampWudaDeltaSec,
  computeSurfaceVelocity,
  freeLifetimeFromSpeed,
  integrateFreeParticle,
  shouldDetachWithLock,
} from './wudaCoatMath';
import type { WudaCoatStats, WudaParticleState } from './wudaTypes';
import type { WudaPlumeBurst } from './WudaPlumeBurst';
import { bakeWudaVertexSamplesForMeshes } from './WudaVertexIndexBake';
import {
  WudaVertexGpuBaker,
  type WudaGpuValidateMode,
} from './WudaVertexGpuBaker';
import {
  resolveWudaRegionWeightsForSide,
  type WudaFighterSide,
  type WudaRegionWeights,
} from './wudaBodyRegions';

/** After first full GPU validate, spot-check every N simulate frames. */
const WUDA_GPU_SPOT_VALIDATE_INTERVAL = 30;

type Slot = {
  vertexIndex: number;
  meshIndex: number;
  state: WudaParticleState;
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  vel: THREE.Vector3;
  prevVel: THREE.Vector3;
  life: number;
  prevValid: boolean;
};

const _vel = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _gravity = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();
const _tmpPos = new THREE.Vector3();

/**
 * Async GPU pending is only safe for the intended 1-frame lag.
 * Older results are discarded; the stable GPU path **holds** the last GPU
 * world instead of mixing in a fresh CPU bake (which caused ghost flashes).
 */
export const WUDA_GPU_PENDING_MAX_AGE_FRAMES = 1;

/** True when a bake kicked at `kickFrame` is still usable on `simFrame`. */
export function isWudaGpuPendingFresh(
  simFrame: number,
  kickFrame: number,
  maxAge = WUDA_GPU_PENDING_MAX_AGE_FRAMES,
): boolean {
  return kickFrame >= 0 && simFrame - kickFrame <= maxAge;
}

export class WudaVertexCoatRuntime {
  private meshes: THREE.SkinnedMesh[] = [];
  private slots: Slot[] = [];
  private bakeKey = '';
  private instanced: THREE.InstancedMesh | null = null;
  private parent: THREE.Object3D | null = null;
  private camera: THREE.Camera | null = null;
  private baker = new WudaVertexGpuBaker();
  private lastStats: WudaCoatStats = { stuck: 0, free: 0, dead: 0 };
  private side: WudaFighterSide = 'p1';
  private dummy = new THREE.Object3D();
  private readonly _color = new THREE.Color();
  private plumeBurst: WudaPlumeBurst | null = null;
  private lastBakeMs = 0;
  private sourceVertexCount = 0;
  private renderer: WebGPURenderer | null = null;
  /** In-flight async GPU bake (fills pendingGpuWorld; never blocks simulate). */
  private bakeInFlight: Promise<void> | null = null;
  /** Completed GPU world for *next* simulate; copied out of baker.gpuOut. */
  private pendingGpuWorld: Float32Array | null = null;
  /** `simFrame` when the in-flight/pending bake was kicked (pose freeze time). */
  private pendingGpuKickFrame = -1;
  /** Monotonic simulate frame counter for pending age checks. */
  private simFrame = 0;
  private gpuValidated = false;
  /** True after the first successful GPU commit — hold stream, never mix CPU. */
  private gpuStreamActive = false;
  private lastStatsLogMs = 0;
  private degradedLogged = false;
  private stalePendingDiscardCount = 0;

  get isBound(): boolean {
    return this.meshes.length > 0;
  }

  getLastStats(): WudaCoatStats {
    return this.lastStats;
  }

  setPlumeBurst(burst: WudaPlumeBurst | null): void {
    this.plumeBurst = burst;
  }

  setRenderer(renderer: WebGPURenderer | null): void {
    this.renderer = renderer;
  }

  bind(
    meshOrMeshes: THREE.SkinnedMesh | THREE.SkinnedMesh[],
    opts: {
      parent: THREE.Object3D;
      camera?: THREE.Camera | null;
      renderer?: WebGPURenderer | null;
    },
  ): { ok: true; count: number; meshName: string } | { ok: false; reason: string } {
    this.dispose();
    const list = (Array.isArray(meshOrMeshes) ? meshOrMeshes : [meshOrMeshes]).filter(
      (m) =>
        m?.skeleton &&
        m.geometry?.getAttribute('position') &&
        m.geometry.getAttribute('skinIndex') &&
        m.geometry.getAttribute('skinWeight'),
    );
    if (list.length === 0) {
      return { ok: false, reason: 'no usable skinned mesh with skin attrs' };
    }
    this.meshes = list;
    this.parent = opts.parent;
    this.camera = opts.camera ?? null;
    if (opts.renderer) this.renderer = opts.renderer;
    return {
      ok: true,
      count: 0,
      meshName: list.map((m) => m.name || '(unnamed)').join('+'),
    };
  }

  setCamera(camera: THREE.Camera | null): void {
    this.camera = camera;
  }

  get hasCamera(): boolean {
    return this.camera != null;
  }

  private ensureBake(cfg: MutableSimConfig): boolean {
    if (this.meshes.length === 0 || !this.parent) return false;
    const count = Math.max(0, Math.floor(cfg.wudaParticleCount));
    const stride = Math.max(1, Math.floor(cfg.wudaVertexStride || 1));
    const meshKey = this.meshes.map((m) => m.uuid).join(',');
    const regionWeights: WudaRegionWeights | null =
      cfg.wudaCoverMode === 'allMeshes'
        ? resolveWudaRegionWeightsForSide(cfg, this.side)
        : null;
    const regionKey = regionWeights
      ? `${regionWeights.head}|${regionWeights.torso}|${regionWeights.limbRoot}|${regionWeights.limbTip}`
      : 'off';
    const key = `C|${count}|${cfg.wudaSeed}|${stride}|${cfg.wudaCoverMode}|${this.side}|${regionKey}|${meshKey}`;
    if (
      key === this.bakeKey &&
      this.instanced &&
      this.slots.length === count &&
      this.baker.isReady
    ) {
      return true;
    }

    this.teardownInstances();
    this.baker.dispose();
    this.slots = [];
    this.bakeKey = key;
    this.degradedLogged = false;
    this.bakeInFlight = null;
    this.pendingGpuWorld = null;
    this.pendingGpuKickFrame = -1;
    this.simFrame = 0;
    this.stalePendingDiscardCount = 0;
    this.gpuValidated = false;
    this.gpuStreamActive = false;

    if (count <= 0) return false;
    const baked = bakeWudaVertexSamplesForMeshes(
      this.meshes,
      count,
      cfg.wudaSeed,
      stride,
      regionWeights,
    );
    this.sourceVertexCount = baked.sourceVertexCount;
    if (baked.samples.length === 0) {
      console.warn('[WudaVertexCoat] bake produced 0 vertex samples');
      return false;
    }
    if (!this.baker.buildFromMeshes(this.meshes, baked.samples)) {
      console.warn('[WudaVertexCoat] GPU baker build failed');
      return false;
    }

    for (const sample of baked.samples) {
      this.slots.push({
        vertexIndex: sample.vertexIndex,
        meshIndex: sample.meshIndex ?? 0,
        state: 'stuck',
        pos: new THREE.Vector3(),
        prevPos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        prevVel: new THREE.Vector3(),
        life: 0,
        prevValid: false,
      });
    }

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: cfg.wudaBlendAdditive
        ? THREE.AdditiveBlending
        : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    this.instanced = new THREE.InstancedMesh(geo, mat, this.slots.length);
    this.instanced.frustumCulled = false;
    this.instanced.count = this.slots.length;
    this.instanced.name = 'WudaVertexCoatInstances';
    this.instanced.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.slots.length * 3),
      3,
    );
    _mat.makeScale(0, 0, 0);
    for (let i = 0; i < this.slots.length; i++) {
      this.instanced.setMatrixAt(i, _mat);
      this.instanced.setColorAt(i, this._color.setRGB(1, 1, 1));
    }
    this.instanced.instanceMatrix.needsUpdate = true;
    if (this.instanced.instanceColor) {
      this.instanced.instanceColor.needsUpdate = true;
    }
    this.parent.add(this.instanced);
    return true;
  }

  /**
   * Sync update — safe to `void` from FighterView.
   *
   * Default (`wudaBakeAwaitReadback === false`): stable **1-frame-late GPU**
   * dual-buffer. Fresh pending is committed; missing/stale pending **holds**
   * the last GPU world (no CPU mix → no ghost flash). CPU only for bootstrap
   * or C-DEGRADED.
   *
   * `wudaBakeAwaitReadback === true`: same-frame CPU every frame (opt-in).
   */
  update(
    wallDtSec: number,
    cfg: MutableSimConfig,
    opts?: { allowDetach?: boolean; side?: WudaFighterSide },
  ): void {
    if (opts?.side === 'p1' || opts?.side === 'p2') this.side = opts.side;
    const allowDetach = opts?.allowDetach !== false;
    if (!cfg.wudaEnabled) {
      if (this.instanced) this.instanced.visible = false;
      this.lastStats = { stuck: 0, free: 0, dead: 0 };
      return;
    }
    if (this.meshes.length === 0) {
      if (this.instanced) this.instanced.visible = false;
      return;
    }
    if (!this.ensureBake(cfg)) {
      if (this.instanced) this.instanced.visible = false;
      return;
    }

    const dt = clampWudaDeltaSec(
      wallDtSec,
      cfg.wudaMaxDeltaSec,
      cfg.timeScaleAnim || 1,
    );
    if (dt <= 0) return;

    this.simFrame++;
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (this.camera) this.camera.getWorldQuaternion(_camQuat);
    else _camQuat.identity();

    const blendMat = this.instanced!.material as THREE.MeshBasicMaterial;
    blendMat.blending = cfg.wudaBlendAdditive
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;

    // Opt-in same-frame CPU (no GPU simulate).
    if (cfg.wudaBakeAwaitReadback === true) {
      this.pendingGpuWorld = null;
      this.pendingGpuKickFrame = -1;
      this.baker.bakeCpuIntoCurr();
      this.lastBakeMs = this.baker.lastBakeMs;
      this.simulateFromWorld(this.baker.getCurrWorld(), dt, cfg, allowDetach);
      this.finishCoatStats(t0, cfg);
      return;
    }

    if (!this.baker.hasGpu) {
      this.baker.bakeCpuIntoCurr();
      this.lastBakeMs = this.baker.lastBakeMs;
      this.simulateFromWorld(this.baker.getCurrWorld(), dt, cfg, allowDetach);
      this.finishCoatStats(t0, cfg);
      return;
    }

    this.commitGpuStable(cfg);
    this.lastBakeMs = this.baker.lastBakeMs;
    this.simulateFromWorld(this.baker.getCurrWorld(), dt, cfg, allowDetach);
    this.kickGpuBakeForNextFrame();
    this.finishCoatStats(t0, cfg);
  }

  private finishCoatStats(t0: number, cfg: MutableSimConfig): void {
    const coatMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    const sk = this.baker.lastSkeletonSync;
    this.lastStats = {
      ...this.lastStats,
      meshCount: sk.meshCount || this.meshes.length,
      skeletonUpdates: sk.updates,
      skeletonCopies: sk.copies,
      coatMs,
    };
    if (!cfg.wudaShowBakeStats) return;
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastStatsLogMs > 500) {
      this.lastStatsLogMs = now;
      console.info(
        `[WudaVertexCoat] mode=C path=${this.baker.lastBakePath} meshes=${this.lastStats.meshCount} batches=${this.baker.gpuBatchCount} readbacks=${this.baker.lastReadbackCount} validate=${this.baker.lastValidateMode} skObj=${sk.skeletonObjects} skUpd=${sk.updates} skCopy=${sk.copies} groups=${sk.groups} degraded=${this.baker.isGpuDegraded} N=${this.slots.length} srcVerts=${this.sourceVertexCount} stride=${cfg.wudaVertexStride} bakeMs=${this.lastBakeMs.toFixed(2)} coatMs=${coatMs.toFixed(2)} staleDrop=${this.stalePendingDiscardCount} stuck=${this.lastStats.stuck} free=${this.lastStats.free} dead=${this.lastStats.dead}`,
      );
    }
  }

  /**
   * Stable GPU commit: fresh pending → curr; else hold last world.
   * Never mix a same-frame CPU bake over a live GPU stream (ghost flash).
   */
  private commitGpuStable(cfg: MutableSimConfig): void {
    const pending = this.pendingGpuWorld;
    const kickFrame = this.pendingGpuKickFrame;
    this.pendingGpuWorld = null;
    this.pendingGpuKickFrame = -1;

    if (pending && this.baker.hasGpu) {
      if (!isWudaGpuPendingFresh(this.simFrame, kickFrame)) {
        this.stalePendingDiscardCount++;
        if (cfg.wudaShowBakeStats) {
          const age = kickFrame >= 0 ? this.simFrame - kickFrame : -1;
          console.info(
            `[WudaVertexCoat] discard stale GPU pending age=${age} frames (hold; discarded=${this.stalePendingDiscardCount})`,
          );
        }
        if (this.gpuStreamActive || this.baker.hasBakedFrame) return;
        this.baker.bakeCpuIntoCurr();
        return;
      }
      if (this.baker.gpuWorldLooksDegenerate(pending)) {
        this.fallbackCpuDegraded('degenerate GPU pending');
        return;
      }
      if (!this.gpuValidated) {
        this.gpuValidated = true;
        const s = this.baker.lastSamePoseStats;
        console.info(
          `[WudaVertexCoat] GPU live enabled (p95=${s.p95.toFixed(4)}m max=${s.max.toFixed(4)}m mean=${s.mean.toFixed(4)}m batches=${this.baker.gpuBatchCount} readbacks=${this.baker.lastReadbackCount})`,
        );
      }
      this.baker.commitWorldFrom(pending, 'gpu');
      this.gpuStreamActive = true;
      this.lastBakeMs = this.baker.lastBakeMs;
      return;
    }

    // No pending: hold stream (GPU or CPU bootstrap), avoid per-frame CPU remix.
    if (this.gpuStreamActive || this.baker.hasBakedFrame) {
      return;
    }
    this.baker.bakeCpuIntoCurr();
  }

  private nextValidateMode(): WudaGpuValidateMode {
    if (!this.gpuValidated) return 'full';
    if (this.simFrame % WUDA_GPU_SPOT_VALIDATE_INTERVAL === 0) return 'spot';
    return 'off';
  }

  private kickGpuBakeForNextFrame(): void {
    const renderer = this.renderer;
    if (
      !renderer ||
      !this.baker.hasGpu ||
      this.baker.gpuBatchCount <= 0 ||
      this.bakeInFlight
    ) {
      return;
    }
    const kickFrame = this.simFrame;
    const validateMode = this.nextValidateMode();
    this.bakeInFlight = this.baker
      .bakeGpu(renderer, { validateMode })
      .then((result) => {
        if (!this.baker.hasGpu) return;
        const { world, samePoseStats, validateMode: mode } = result;
        // Skip gate when validation was intentionally off (steady state).
        if (mode !== 'off') {
          if (!WudaVertexGpuBaker.gpuSamePoseAcceptable(samePoseStats)) {
            this.fallbackCpuDegraded(
              `GPU≠CPU same-pose (p95=${samePoseStats.p95.toFixed(3)}m max=${samePoseStats.max.toFixed(3)}m mean=${samePoseStats.mean.toFixed(3)}m mode=${mode})`,
              false,
            );
            return;
          }
        }
        if (this.baker.gpuWorldLooksDegenerate(world)) {
          this.fallbackCpuDegraded('degenerate world after GPU bake', false);
          return;
        }
        if (!isWudaGpuPendingFresh(this.simFrame, kickFrame)) {
          this.stalePendingDiscardCount++;
          return;
        }
        if (
          !this.pendingGpuWorld ||
          this.pendingGpuWorld.length !== world.length
        ) {
          this.pendingGpuWorld = new Float32Array(world.length);
        }
        this.pendingGpuWorld.set(world);
        this.pendingGpuKickFrame = kickFrame;
      })
      .catch((err: unknown) => {
        this.fallbackCpuDegraded(
          err instanceof Error ? err.message : 'GPU bake threw',
          false,
        );
      })
      .finally(() => {
        this.bakeInFlight = null;
      });
  }

  private fallbackCpuDegraded(reason: string, bakeNow = true): void {
    this.baker.markGpuDegraded();
    this.pendingGpuWorld = null;
    this.pendingGpuKickFrame = -1;
    this.gpuStreamActive = false;
    this.gpuValidated = false;
    if (bakeNow) {
      this.baker.bakeCpuIntoCurr();
      this.lastBakeMs = this.baker.lastBakeMs;
    }
    if (!this.degradedLogged) {
      this.degradedLogged = true;
      console.warn(
        `[WudaVertexCoat] C-DEGRADED → CPU skinning (${reason}); batches=${this.baker.gpuBatchCount}`,
      );
    }
  }

  private simulateFromWorld(
    world: Float32Array,
    dt: number,
    cfg: MutableSimConfig,
    allowDetach: boolean,
  ): void {
    _gravity.set(cfg.wudaGravityDirX, cfg.wudaGravityDirY, cfg.wudaGravityDirZ);
    if (_gravity.lengthSq() > 1e-8) _gravity.normalize();
    else _gravity.set(0, -1, 0);

    const rng = createMulberry32(
      (cfg.wudaSeed ^ (this.slots.length * 2654435761)) >>> 0,
    );

    let stuck = 0;
    let free = 0;
    let dead = 0;

    // First GPU/CPU frame: seed prev, no detach (Skinner isReady / TRAP-V0).
    const firstFrames = !this.baker.hasPrevFrame;

    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;

      if (s.state === 'stuck') {
        _tmpPos.set(world[i * 3]!, world[i * 3 + 1]!, world[i * 3 + 2]!);
        if (
          !Number.isFinite(_tmpPos.x) ||
          !Number.isFinite(_tmpPos.y) ||
          !Number.isFinite(_tmpPos.z)
        ) {
          stuck++;
          this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
          continue;
        }
        s.pos.copy(_tmpPos);

        if (!s.prevValid || firstFrames) {
          s.prevPos.copy(s.pos);
          s.vel.set(0, 0, 0);
          s.prevVel.set(0, 0, 0);
          s.prevValid = true;
          stuck++;
          this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
          continue;
        }

        computeSurfaceVelocity(s.pos, s.prevPos, dt, _vel);
        _accel.copy(_vel).sub(s.prevVel).multiplyScalar(1 / dt);
        const speed = _vel.length();
        const prevSpeed = s.prevVel.length();
        const accelMag = _accel.length();

        const detach = shouldDetachWithLock(
          {
            speed,
            prevSpeed,
            accelMag,
            detachSpeed: cfg.wudaDetachSpeed,
            detachAccel: cfg.wudaDetachAccel,
            detachSpeedDrop: cfg.wudaDetachSpeedDrop,
            detachSpeedDropMinPrev: cfg.wudaDetachSpeedDropMinPrev,
          },
          allowDetach,
        );

        s.prevPos.copy(s.pos);
        s.prevVel.copy(_vel);
        s.vel.copy(_vel);

        if (detach) {
          s.state = 'free';
          s.vel.multiplyScalar(cfg.wudaInheritVelScale);
          if (cfg.wudaDetachJitter > 0) {
            s.vel.x += (rng.next() * 2 - 1) * cfg.wudaDetachJitter;
            s.vel.y += (rng.next() * 2 - 1) * cfg.wudaDetachJitter;
            s.vel.z += (rng.next() * 2 - 1) * cfg.wudaDetachJitter;
          }
          s.life = freeLifetimeFromSpeed(
            cfg.wudaFreeLifetime,
            speed,
            cfg.wudaSpeedToLife,
          );
          if (cfg.wudaAlsoPlumeBurst && this.plumeBurst) {
            this.plumeBurst.queueDetach(s.pos, s.vel);
          }
          free++;
          this.writeInstance(i, s.pos, cfg.wudaFreeSize, cfg, false);
        } else {
          stuck++;
          this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
        }
        continue;
      }

      if (s.life <= 0) {
        if (cfg.wudaRespawnStuck) {
          s.state = 'stuck';
          s.prevValid = false;
          s.vel.set(0, 0, 0);
          s.prevVel.set(0, 0, 0);
          stuck++;
          s.pos.set(world[i * 3]!, world[i * 3 + 1]!, world[i * 3 + 2]!);
          this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
        } else {
          dead++;
          this.writeInstance(i, s.pos, 0, cfg, false);
        }
        continue;
      }

      integrateFreeParticle(
        s.pos,
        s.vel,
        dt,
        _gravity,
        cfg.wudaGravityPower,
        cfg.wudaDrag,
        cfg.wudaSpeedLimit,
      );
      s.life -= dt;
      free++;
      const lifeT = Math.max(
        0,
        Math.min(1, s.life / Math.max(1e-4, cfg.wudaFreeLifetime)),
      );
      this.writeInstance(
        i,
        s.pos,
        cfg.wudaFreeSize * (0.35 + 0.65 * lifeT),
        cfg,
        false,
        cfg.wudaFreeOpacity * lifeT,
      );
    }

    this.baker.commitPrev();

    this.instanced!.instanceMatrix.needsUpdate = true;
    if (this.instanced!.instanceColor) {
      this.instanced!.instanceColor.needsUpdate = true;
    }
    const opacityMat = this.instanced!.material as THREE.MeshBasicMaterial;
    opacityMat.opacity = 1;
    opacityMat.transparent = true;
    this.instanced!.visible = true;
    this.lastStats = {
      ...this.lastStats,
      stuck,
      free,
      dead,
    };

    if (cfg.wudaAlsoPlumeBurst && this.plumeBurst) {
      this.plumeBurst.flush(cfg);
    } else {
      this.plumeBurst?.flush({ ...cfg, wudaAlsoPlumeBurst: false });
    }
  }

  private writeInstance(
    index: number,
    pos: THREE.Vector3,
    size: number,
    cfg: MutableSimConfig,
    stuck: boolean,
    opacityOverride?: number,
  ): void {
    if (!this.instanced) return;
    const sx = Math.max(0, size);
    _scale.set(sx, sx, sx);
    _quat.copy(_camQuat);
    this.dummy.position.copy(pos);
    this.dummy.quaternion.copy(_quat);
    this.dummy.scale.copy(_scale);
    this.dummy.updateMatrix();
    this.instanced.setMatrixAt(index, this.dummy.matrix);

    const op =
      opacityOverride ??
      (stuck ? cfg.wudaStuckOpacity : cfg.wudaFreeOpacity);
    if (cfg.wudaShowDebug && stuck) {
      this._color.setRGB(0.2 * op, 0.85 * op, 0.3 * op);
    } else if (cfg.wudaShowDebug && !stuck && size > 0) {
      this._color.setRGB(0.95 * op, 0.35 * op, 0.15 * op);
    } else if (stuck) {
      this._color.setHex(cfg.wudaStuckColor & 0xffffff).multiplyScalar(op);
    } else {
      this._color.setHex(cfg.wudaFreeColor & 0xffffff).multiplyScalar(op);
    }
    this.instanced.setColorAt(index, this._color);
  }

  private teardownInstances(): void {
    if (this.instanced) {
      this.instanced.parent?.remove(this.instanced);
      this.instanced.geometry.dispose();
      (this.instanced.material as THREE.Material).dispose();
      this.instanced = null;
    }
    this.slots = [];
    this.bakeKey = '';
  }

  dispose(): void {
    this.teardownInstances();
    this.baker.dispose();
    this.meshes = [];
    this.parent = null;
    this.bakeInFlight = null;
    this.pendingGpuWorld = null;
    this.pendingGpuKickFrame = -1;
    this.simFrame = 0;
    this.stalePendingDiscardCount = 0;
    this.gpuValidated = false;
    this.gpuStreamActive = false;
  }
}

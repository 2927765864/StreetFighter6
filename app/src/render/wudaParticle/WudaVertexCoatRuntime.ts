/**
 * Scheme C runtime: vertex-index slots + GPU bake + existing detach/flight math.
 * docs/plans/ai-execution-plan-wuda-particle-scheme-c-vertex-gpu-bake-v0.md Step 4
 */
import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import type { WudaCoatCfgShim } from './wudaLayerPreset';
import { createMulberry32 } from '../hitVfx/mulberry32';
import {
  armWudaDetachLatch,
  clampWudaDeltaSec,
  computeSurfaceVelocity,
  freeLifetimeFromSpeed,
  integrateFreeParticle,
  shouldDetachWithLock,
  WUDA_WAKE_CPU_SENSE_PRESENTS,
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
import {
  advanceRefillTimer,
  clampWudaFreePoolCapacity,
  createWudaFreePool,
  resolveWudaInstanceCapacity,
  spawnWudaFreeParticle,
  stepWudaFreePool,
  type WudaFreePoolParticle,
} from './wudaFreePool';
import {
  createWudaInstanceAppearance,
  resolveWudaInstanceColor,
  setWudaInstanceOpacity,
} from './wudaInstanceAppearance';
import {
  resolveWudaEllipseShape,
  resolveWudaEllipseShapeFromIndex,
  sampleWudaFreeSize,
  wudaFreeSizeOverLife,
  type WudaEllipseShape,
} from './wudaParticleShape';
import type { MeshBasicNodeMaterial } from 'three/webgpu';

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
  /** Countdown (sec) while state==='refilling'. */
  refillIn: number;
  size: number;
  aspect: number;
  spin: number;
};

const _vel = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _flyVel = new THREE.Vector3();
const _gravity = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _spinQuat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _tmpPos = new THREE.Vector3();
const _unitShape: WudaEllipseShape = { aspect: 1, spin: 0 };

/**
 * Async GPU pending is only safe for the intended 1-frame lag.
 * Older results are discarded; the stable GPU path **holds** the last GPU
 * world instead of mixing in a fresh CPU bake (which caused ghost flashes).
 */
/** Allow 2 presents of lag so a slow readback is not always discarded. */
export const WUDA_GPU_PENDING_MAX_AGE_FRAMES = 2;

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
  private freePool: WudaFreePoolParticle[] = [];
  private bakeKey = '';
  private instanced: THREE.InstancedMesh | null = null;
  private opacityAttr: THREE.InstancedBufferAttribute | null = null;
  private parent: THREE.Object3D | null = null;
  private camera: THREE.Camera | null = null;
  private baker = new WudaVertexGpuBaker();
  private lastStats: WudaCoatStats = { stuck: 0, free: 0, dead: 0, refilling: 0 };
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
  /** Highest free-pool index written this session (for clearing / count shrink). */
  private freeHighWater = -1;
  /** InstancedMesh buffer length at bake time (draw `count` may shrink each frame). */
  private allocatedInstanceCap = 0;
  /** Consecutive stale GPU pending discards — pause kicks to avoid CPU+GPU thrash. */
  private gpuStaleStreak = 0;
  /**
   * Sleep when stuck is invisible, detach is locked, and no free flecks are flying.
   * Shipping sweat spends most frames here — skip bake/simulate/GPU kick entirely.
   */
  private sensingSleep = false;
  /** Presents remaining where detach stays allowed after a gate pulse. */
  private detachLatchPresents = 0;
  /** Force same-frame CPU bake after waking (hit impact must not wait on GPU lag). */
  private wakeCpuSensePresents = 0;
  /** Accumulate dt across skipped dormant presents (half-rate tracking). */
  private dormantAccumDt = 0;
  private dormantSkipParity = 0;
  private detachRng: { next: () => number } | null = null;
  private detachRngSeed = -1;
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

  private ensureBake(cfg: WudaCoatCfgShim): boolean {
    if (this.meshes.length === 0 || !this.parent) return false;
    const count = Math.max(0, Math.floor(cfg.wudaParticleCount));
    const refillOn = !!cfg.wudaDetachInstantRefill;
    const freeCap = clampWudaFreePoolCapacity(
      count,
      Math.max(0, Math.floor(cfg.wudaFreePoolCapacity)),
    );
    const instanceCap = resolveWudaInstanceCapacity(count, refillOn, freeCap);
    const stride = Math.max(1, Math.floor(cfg.wudaVertexStride || 1));
    const meshKey = this.meshes.map((m) => m.uuid).join(',');
    const regionWeights: WudaRegionWeights | null =
      cfg.wudaCoverMode === 'allMeshes'
        ? resolveWudaRegionWeightsForSide(cfg, this.side)
        : null;
    const regionKey = regionWeights
      ? `${regionWeights.head}|${regionWeights.torso}|${regionWeights.limbRoot}|${regionWeights.limbTip}`
      : 'off';
    const key = `C|${count}|${cfg.wudaSeed}|${stride}|${cfg.wudaCoverMode}|${this.side}|${regionKey}|${meshKey}|refill=${refillOn ? 1 : 0}|free=${freeCap}`;
    if (
      key === this.bakeKey &&
      this.instanced &&
      this.slots.length === count &&
      this.freePool.length === (refillOn ? freeCap : 0) &&
      this.allocatedInstanceCap === instanceCap &&
      this.baker.isReady
    ) {
      return true;
    }

    this.teardownInstances();
    this.baker.dispose();
    this.slots = [];
    this.freePool = [];
    this.freeHighWater = -1;
    this.allocatedInstanceCap = 0;
    this.gpuStaleStreak = 0;
    this.sensingSleep = false;
    this.detachLatchPresents = 0;
    this.wakeCpuSensePresents = 0;
    this.dormantAccumDt = 0;
    this.dormantSkipParity = 0;
    this.detachRng = null;
    this.detachRngSeed = -1;
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
        refillIn: 0,
        size: 0,
        aspect: 1,
        spin: 0,
      });
    }
    this.freePool = refillOn ? createWudaFreePool(freeCap) : [];

    const geo = new THREE.PlaneGeometry(1, 1);
    const appearance = createWudaInstanceAppearance(
      geo,
      instanceCap,
      !!cfg.wudaBlendAdditive,
    );
    this.opacityAttr = appearance.opacityAttr;
    this.instanced = new THREE.InstancedMesh(geo, appearance.material, instanceCap);
    this.instanced.frustumCulled = false;
    this.instanced.count = instanceCap;
    this.allocatedInstanceCap = instanceCap;
    this.instanced.name = 'WudaVertexCoatInstances';
    this.instanced.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(instanceCap * 3),
      3,
    );
    _mat.makeScale(0, 0, 0);
    for (let i = 0; i < instanceCap; i++) {
      this.instanced.setMatrixAt(i, _mat);
      this.instanced.setColorAt(i, this._color.setRGB(1, 1, 1));
      setWudaInstanceOpacity(this.opacityAttr, i, 0);
    }
    this.instanced.instanceMatrix.needsUpdate = true;
    if (this.instanced.instanceColor) {
      this.instanced.instanceColor.needsUpdate = true;
    }
    this.opacityAttr.needsUpdate = true;
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
    cfg: WudaCoatCfgShim,
    opts?: { allowDetach?: boolean; side?: WudaFighterSide },
  ): void {
    if (opts?.side === 'p1' || opts?.side === 'p2') this.side = opts.side;
    const allowDetach = opts?.allowDetach !== false;
    if (!cfg.wudaEnabled) {
      if (this.instanced) this.instanced.visible = false;
      this.lastStats = { stuck: 0, free: 0, dead: 0, refilling: 0 };
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

    // Hitstun/active-hit gates are short; arm a present latch so sleep→seed→shed works.
    this.detachLatchPresents = armWudaDetachLatch(
      this.detachLatchPresents,
      allowDetach,
    );
    const canDetach = this.detachLatchPresents > 0;

    const drawStuck = cfg.wudaStuckOpacity > 1e-5;
    const hasFlying = this.hasFlyingFlecks();
    const dt = clampWudaDeltaSec(
      wallDtSec,
      cfg.wudaMaxDeltaSec,
      cfg.timeScaleAnim || 1,
    );
    // Dormant: keep body-surface history (idle→hit pose jump needs prevPos),
    // but skip detach / draws / GPU kicks. Hard-clearing prevValid broke P2 shed.
    if (!canDetach && !drawStuck && !hasFlying) {
      this.trackStuckDormant(dt, cfg);
      return;
    }
    if (this.sensingSleep) {
      this.wakeSensingSleep();
    }

    if (dt <= 0) return;

    this.simFrame++;
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (this.camera) this.camera.getWorldQuaternion(_camQuat);
    else _camQuat.identity();

    const blendMat = this.instanced!.material as MeshBasicNodeMaterial;
    blendMat.blending = cfg.wudaBlendAdditive
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;

    const forceCpuSense =
      cfg.wudaBakeAwaitReadback === true ||
      this.wakeCpuSensePresents > 0 ||
      !this.baker.hasGpu;
    if (this.wakeCpuSensePresents > 0) this.wakeCpuSensePresents--;

    // Opt-in same-frame CPU, wake window, or no GPU.
    if (forceCpuSense) {
      this.pendingGpuWorld = null;
      this.pendingGpuKickFrame = -1;
      this.baker.bakeCpuIntoCurr();
      this.lastBakeMs = this.baker.lastBakeMs;
      this.simulateFromWorld(this.baker.getCurrWorld(), dt, cfg, canDetach);
      if (this.detachLatchPresents > 0) this.detachLatchPresents--;
      this.finishCoatStats(t0, cfg);
      return;
    }

    this.commitGpuStable(cfg);
    this.lastBakeMs = this.baker.lastBakeMs;
    this.simulateFromWorld(this.baker.getCurrWorld(), dt, cfg, canDetach);
    if (this.detachLatchPresents > 0) this.detachLatchPresents--;
    this.kickGpuBakeForNextFrame();
    this.finishCoatStats(t0, cfg);
  }

  private finishCoatStats(t0: number, cfg: WudaCoatCfgShim): void {
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
        `[WudaVertexCoat] mode=C path=${this.baker.lastBakePath} meshes=${this.lastStats.meshCount} batches=${this.baker.gpuBatchCount} readbacks=${this.baker.lastReadbackCount} validate=${this.baker.lastValidateMode} skObj=${sk.skeletonObjects} skUpd=${sk.updates} skCopy=${sk.copies} groups=${sk.groups} degraded=${this.baker.isGpuDegraded} N=${this.slots.length} freePool=${this.freePool.length} srcVerts=${this.sourceVertexCount} stride=${cfg.wudaVertexStride} bakeMs=${this.lastBakeMs.toFixed(2)} coatMs=${coatMs.toFixed(2)} staleDrop=${this.stalePendingDiscardCount} stuck=${this.lastStats.stuck} free=${this.lastStats.free} refill=${this.lastStats.refilling ?? 0} dead=${this.lastStats.dead}`,
      );
    }
  }

  /**
   * Stable GPU commit: fresh pending → curr; else hold last world.
   * Never mix a same-frame CPU bake over a live GPU stream (ghost flash).
   */
  private commitGpuStable(cfg: WudaCoatCfgShim): void {
    const pending = this.pendingGpuWorld;
    const kickFrame = this.pendingGpuKickFrame;
    this.pendingGpuWorld = null;
    this.pendingGpuKickFrame = -1;

    if (pending && this.baker.hasGpu) {
      if (!isWudaGpuPendingFresh(this.simFrame, kickFrame)) {
        this.stalePendingDiscardCount++;
        this.gpuStaleStreak++;
        if (cfg.wudaShowBakeStats) {
          const age = kickFrame >= 0 ? this.simFrame - kickFrame : -1;
          console.info(
            `[WudaVertexCoat] discard stale GPU pending age=${age} frames (hold; discarded=${this.stalePendingDiscardCount})`,
          );
        }
        // Too slow to finish within the lag window: stop kicking GPU (avoid
        // paying CPU simulate + abandoned GPU compute/readback every frame).
        if (this.gpuStaleStreak >= 3) {
          this.fallbackCpuDegraded('GPU pending always stale');
          return;
        }
        if (this.gpuStreamActive || this.baker.hasBakedFrame) return;
        this.baker.bakeCpuIntoCurr();
        return;
      }
      this.gpuStaleStreak = 0;
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

  private hasFlyingFlecks(): boolean {
    for (const p of this.freePool) {
      if (p.active) return true;
    }
    for (const s of this.slots) {
      if (s.state === 'free' && s.life > 0) return true;
    }
    return false;
  }

  private hasStuckHistory(): boolean {
    for (const s of this.slots) {
      if (
        (s.state === 'stuck' || s.state === 'refilling') &&
        s.prevValid
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Invisible + detach-locked: keep body-surface history for idle→hit shed.
   * Half-rate bake (every other present) once history exists — cuts idle CPU.
   */
  private trackStuckDormant(dt: number, cfg: WudaCoatCfgShim): void {
    if (this.instanced) {
      this.instanced.count = 0;
      this.instanced.visible = false;
    }
    this.pendingGpuWorld = null;
    this.pendingGpuKickFrame = -1;
    this.bakeInFlight = null;
    this.sensingSleep = true;
    this.dormantAccumDt += Math.max(0, dt);
    if (this.dormantAccumDt <= 0) {
      this.lastStats = {
        ...this.lastStats,
        stuck: this.slots.length,
        free: 0,
        dead: 0,
        refilling: 0,
        coatMs: 0,
      };
      return;
    }

    this.dormantSkipParity ^= 1;
    // Skip alternate presents only after we already have a valid surface history.
    if (this.dormantSkipParity === 0 && this.hasStuckHistory()) {
      this.lastStats = {
        ...this.lastStats,
        stuck: this.slots.length,
        free: 0,
        dead: 0,
        refilling: 0,
        coatMs: 0,
      };
      return;
    }

    const stepDt = this.dormantAccumDt;
    this.dormantAccumDt = 0;
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.baker.bakeCpuIntoCurr();
    this.lastBakeMs = this.baker.lastBakeMs;
    const world = this.baker.getCurrWorld();
    let stuck = 0;
    let refilling = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;
      if (s.state === 'refilling') {
        s.refillIn = advanceRefillTimer(s.refillIn, stepDt);
        if (s.refillIn > 0) {
          refilling++;
          continue;
        }
        s.state = 'stuck';
        s.vel.set(0, 0, 0);
        s.prevVel.set(0, 0, 0);
        s.life = 0;
      }
      if (s.state !== 'stuck') continue;
      _tmpPos.set(world[i * 3]!, world[i * 3 + 1]!, world[i * 3 + 2]!);
      if (
        !Number.isFinite(_tmpPos.x) ||
        !Number.isFinite(_tmpPos.y) ||
        !Number.isFinite(_tmpPos.z)
      ) {
        stuck++;
        continue;
      }
      if (!s.prevValid) {
        s.pos.copy(_tmpPos);
        s.prevPos.copy(_tmpPos);
        s.vel.set(0, 0, 0);
        s.prevVel.set(0, 0, 0);
        s.prevValid = true;
        stuck++;
        continue;
      }
      s.prevPos.copy(s.pos);
      s.pos.copy(_tmpPos);
      computeSurfaceVelocity(s.pos, s.prevPos, stepDt, _vel);
      s.prevVel.copy(s.vel);
      s.vel.copy(_vel);
      stuck++;
    }
    this.baker.commitPrev();
    this.lastStats = {
      ...this.lastStats,
      stuck,
      free: 0,
      dead: 0,
      refilling,
      coatMs:
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        t0,
    };
  }

  private wakeSensingSleep(): void {
    this.sensingSleep = false;
    this.dormantAccumDt = 0;
    this.dormantSkipParity = 0;
    // Do NOT clear prevValid — dormant tracking kept the idle surface history
    // that impact detach needs (pose jump into hitstun react).
    this.wakeCpuSensePresents = Math.max(
      this.wakeCpuSensePresents,
      WUDA_WAKE_CPU_SENSE_PRESENTS,
    );
    if (this.instanced) this.instanced.visible = true;
  }

  private rngForDetach(cfg: WudaCoatCfgShim): { next: () => number } {
    const seed = (cfg.wudaSeed ^ (this.slots.length * 2654435761)) >>> 0;
    if (!this.detachRng || this.detachRngSeed !== seed) {
      this.detachRngSeed = seed;
      this.detachRng = createMulberry32(seed);
    }
    return this.detachRng;
  }

  private simulateFromWorld(
    world: Float32Array,
    dt: number,
    cfg: WudaCoatCfgShim,
    allowDetach: boolean,
  ): void {
    _gravity.set(cfg.wudaGravityDirX, cfg.wudaGravityDirY, cfg.wudaGravityDirZ);
    if (_gravity.lengthSq() > 1e-8) _gravity.normalize();
    else _gravity.set(0, -1, 0);

    const rng = this.rngForDetach(cfg);
    const refillOn = !!cfg.wudaDetachInstantRefill;
    const refillDelay = Math.max(0, cfg.wudaDetachRefillDelay);
    // Shipping sweat: stuckOpacity=0 — sense only, skip invisible instance writes.
    const drawStuck = cfg.wudaStuckOpacity > 1e-5;

    let stuck = 0;
    let free = 0;
    let dead = 0;
    let refilling = 0;

    // Step existing free-pool particles before new detach spawns (spawn frame matches legacy: no integrate yet).
    stepWudaFreePool(
      this.freePool,
      dt,
      _gravity,
      cfg.wudaGravityPower,
      cfg.wudaDrag,
      cfg.wudaSpeedLimit,
    );

    // First GPU/CPU frame: seed prev, no detach (Skinner isReady / TRAP-V0).
    const firstFrames = !this.baker.hasPrevFrame;

    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;

      if (s.state === 'refilling') {
        s.refillIn = advanceRefillTimer(s.refillIn, dt);
        if (s.refillIn > 0) {
          refilling++;
          if (drawStuck) this.writeInstance(i, s.pos, 0, cfg, true);
          continue;
        }
        s.state = 'stuck';
        s.prevValid = false;
        s.vel.set(0, 0, 0);
        s.prevVel.set(0, 0, 0);
        s.life = 0;
      }

      if (s.state === 'stuck') {
        _tmpPos.set(world[i * 3]!, world[i * 3 + 1]!, world[i * 3 + 2]!);
        if (
          !Number.isFinite(_tmpPos.x) ||
          !Number.isFinite(_tmpPos.y) ||
          !Number.isFinite(_tmpPos.z)
        ) {
          stuck++;
          if (drawStuck) {
            this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
          }
          continue;
        }
        s.pos.copy(_tmpPos);

        if (!s.prevValid || firstFrames) {
          s.prevPos.copy(s.pos);
          s.vel.set(0, 0, 0);
          s.prevVel.set(0, 0, 0);
          s.prevValid = true;
          stuck++;
          if (drawStuck) {
            this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
          }
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
          _flyVel.copy(s.vel).multiplyScalar(cfg.wudaInheritVelScale);
          if (cfg.wudaDetachJitter > 0) {
            _flyVel.x += (rng.next() * 2 - 1) * cfg.wudaDetachJitter;
            _flyVel.y += (rng.next() * 2 - 1) * cfg.wudaDetachJitter;
            _flyVel.z += (rng.next() * 2 - 1) * cfg.wudaDetachJitter;
          }
          const life = freeLifetimeFromSpeed(
            cfg.wudaFreeLifetime,
            speed,
            cfg.wudaSpeedToLife,
          );
          if (cfg.wudaAlsoPlumeBurst && this.plumeBurst) {
            this.plumeBurst.queueDetach(s.pos, _flyVel);
          }

          const freeSize = sampleWudaFreeSize(
            rng.next(),
            cfg.wudaFreeSizeMin,
            cfg.wudaFreeSize,
          );
          const freeShape = resolveWudaEllipseShape(
            rng.next(),
            rng.next(),
            cfg.wudaEllipseAspectJitter,
          );
          if (refillOn) {
            spawnWudaFreeParticle(
              this.freePool,
              s.pos,
              _flyVel,
              life,
              freeSize,
              freeShape.aspect,
              freeShape.spin,
            );
            if (refillDelay <= 0) {
              s.state = 'stuck';
              s.prevValid = false;
              s.vel.set(0, 0, 0);
              s.prevVel.set(0, 0, 0);
              s.life = 0;
              stuck++;
              if (drawStuck) {
                this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
              }
            } else {
              s.state = 'refilling';
              s.refillIn = refillDelay;
              s.vel.set(0, 0, 0);
              s.prevVel.set(0, 0, 0);
              s.life = 0;
              refilling++;
              if (drawStuck) this.writeInstance(i, s.pos, 0, cfg, true);
            }
          } else {
            s.state = 'free';
            s.vel.copy(_flyVel);
            s.life = life;
            s.size = freeSize;
            s.aspect = freeShape.aspect;
            s.spin = freeShape.spin;
            free++;
            this.writeInstance(
              i,
              s.pos,
              freeSize,
              cfg,
              false,
              undefined,
              freeShape,
            );
          }
        } else {
          stuck++;
          if (drawStuck) {
            this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
          }
        }
        continue;
      }

      // Legacy free flight on coat slot (instant-refill off)
      if (s.life <= 0) {
        if (cfg.wudaRespawnStuck) {
          s.state = 'stuck';
          s.prevValid = false;
          s.vel.set(0, 0, 0);
          s.prevVel.set(0, 0, 0);
          stuck++;
          s.pos.set(world[i * 3]!, world[i * 3 + 1]!, world[i * 3 + 2]!);
          if (drawStuck) {
            this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
          }
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
        wudaFreeSizeOverLife(s.size > 0 ? s.size : cfg.wudaFreeSize, lifeT),
        cfg,
        false,
        cfg.wudaFreeOpacity * lifeT,
        { aspect: s.aspect, spin: s.spin },
      );
    }

    // Free-pool: write actives only; clear vacated slots within prior high-water.
    const coatCount = this.slots.length;
    let high = -1;
    for (let fi = 0; fi < this.freePool.length; fi++) {
      const p = this.freePool[fi]!;
      const instIdx = coatCount + fi;
      if (!p.active) {
        if (fi <= this.freeHighWater) {
          this.writeInstance(instIdx, p.pos, 0, cfg, false);
        }
        continue;
      }
      high = fi;
      free++;
      const lifeT = Math.max(
        0,
        Math.min(1, p.life / Math.max(1e-4, cfg.wudaFreeLifetime)),
      );
      this.writeInstance(
        instIdx,
        p.pos,
        wudaFreeSizeOverLife(p.size > 0 ? p.size : cfg.wudaFreeSize, lifeT),
        cfg,
        false,
        cfg.wudaFreeOpacity * lifeT,
        { aspect: p.aspect, spin: p.spin },
      );
    }
    this.freeHighWater = high;

    this.baker.commitPrev();

    // Shrink draw range: invisible stuck + empty free pool → count 0.
    if (!this.instanced) return;
    if (high >= 0) {
      this.instanced.count = coatCount + high + 1;
    } else if (drawStuck) {
      this.instanced.count = coatCount;
    } else {
      this.instanced.count = 0;
    }

    this.instanced.instanceMatrix.needsUpdate = true;
    if (this.instanced.instanceColor) {
      this.instanced.instanceColor.needsUpdate = true;
    }
    if (this.opacityAttr) this.opacityAttr.needsUpdate = true;
    const opacityMat = this.instanced.material as MeshBasicNodeMaterial;
    opacityMat.opacity = 1;
    opacityMat.transparent = true;
    this.instanced.visible = true;
    this.lastStats = {
      ...this.lastStats,
      stuck,
      free,
      dead,
      refilling,
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
    cfg: WudaCoatCfgShim,
    stuck: boolean,
    opacityOverride?: number,
    shape?: WudaEllipseShape,
  ): void {
    if (!this.instanced || !this.opacityAttr) return;
    const base = Math.max(0, size);
    const ellipse =
      shape ??
      (base > 0
        ? resolveWudaEllipseShapeFromIndex(
            index,
            cfg.wudaSeed,
            cfg.wudaEllipseAspectJitter,
          )
        : _unitShape);
    const aspect = ellipse.aspect > 0.05 ? ellipse.aspect : 1;
    _scale.set(base * aspect, base / aspect, base > 0 ? 1 : 0);
    _quat.copy(_camQuat);
    if (ellipse.spin !== 0) {
      _spinQuat.setFromAxisAngle(_zAxis, ellipse.spin);
      _quat.multiply(_spinQuat);
    }
    this.dummy.position.copy(pos);
    this.dummy.quaternion.copy(_quat);
    this.dummy.scale.copy(_scale);
    this.dummy.updateMatrix();
    this.instanced.setMatrixAt(index, this.dummy.matrix);

    const op =
      base <= 0
        ? 0
        : (opacityOverride ??
          (stuck ? cfg.wudaStuckOpacity : cfg.wudaFreeOpacity));
    resolveWudaInstanceColor(this._color, cfg, stuck, base);
    this.instanced.setColorAt(index, this._color);
    setWudaInstanceOpacity(this.opacityAttr, index, op);
  }

  private teardownInstances(): void {
    if (this.instanced) {
      this.instanced.parent?.remove(this.instanced);
      this.instanced.geometry.dispose();
      (this.instanced.material as THREE.Material).dispose();
      this.instanced = null;
    }
    this.opacityAttr = null;
    this.slots = [];
    this.freePool = [];
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

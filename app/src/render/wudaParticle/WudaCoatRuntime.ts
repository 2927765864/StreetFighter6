/**
 * Wuda coat runtime: stuck surface tracking + velocity detach + free flight.
 * docs/plans/ai-execution-plan-wuda-particle-v0.md
 */
import * as THREE from 'three/webgpu';
import type { MutableSimConfig } from '../../config/constants';
import { createMulberry32 } from '../hitVfx/mulberry32';
import { bakeWudaSurfaceSamplesForMeshes } from './WudaSurfaceBake';
import { evalSkinnedSurfacePoint } from './evalSkinnedSurface';
import {
  resolveWudaRegionWeightsForSide,
  type WudaFighterSide,
  type WudaRegionWeights,
} from './wudaBodyRegions';
import {
  clampWudaDeltaSec,
  computeSurfaceVelocity,
  freeLifetimeFromSpeed,
  integrateFreeParticle,
  shouldDetachWithLock,
} from './wudaCoatMath';
import type { WudaCoatStats, WudaParticleState, WudaSurfaceSample } from './wudaTypes';
import type { WudaPlumeBurst } from './WudaPlumeBurst';
import { syncSkinnedMeshBoneMatrices } from './wudaSkeletonSync';
import {
  advanceRefillTimer,
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
import type { MeshBasicNodeMaterial } from 'three/webgpu';

type Slot = {
  sample: WudaSurfaceSample;
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
};

const _surfacePos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _flyVel = new THREE.Vector3();
const _gravity = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();

export class WudaCoatRuntime {
  private meshes: THREE.SkinnedMesh[] = [];
  private slots: Slot[] = [];
  private freePool: WudaFreePoolParticle[] = [];
  private bakeKey = '';
  private instanced: THREE.InstancedMesh | null = null;
  private opacityAttr: THREE.InstancedBufferAttribute | null = null;
  private parent: THREE.Object3D | null = null;
  private camera: THREE.Camera | null = null;
  private lastStats: WudaCoatStats = { stuck: 0, free: 0, dead: 0, refilling: 0 };
  private side: WudaFighterSide = 'p1';
  private dummy = new THREE.Object3D();
  private readonly _color = new THREE.Color();
  private plumeBurst: WudaPlumeBurst | null = null;
  private lastStatsLogMs = 0;

  get isBound(): boolean {
    return this.meshes.length > 0;
  }

  getLastStats(): WudaCoatStats {
    return this.lastStats;
  }

  /** Shared optional plume splash (main wires one instance for both fighters). */
  setPlumeBurst(burst: WudaPlumeBurst | null): void {
    this.plumeBurst = burst;
  }

  bind(
    meshOrMeshes: THREE.SkinnedMesh | THREE.SkinnedMesh[],
    opts: { parent: THREE.Object3D; camera?: THREE.Camera | null },
  ): { ok: true; count: number; meshName: string } | { ok: false; reason: string } {
    this.dispose();
    const list = (Array.isArray(meshOrMeshes) ? meshOrMeshes : [meshOrMeshes]).filter(
      (m) => m?.skeleton && m.geometry?.getAttribute('position'),
    );
    if (list.length === 0) {
      return { ok: false, reason: 'no usable SkinnedMesh' };
    }
    this.meshes = list;
    this.parent = opts.parent;
    this.camera = opts.camera ?? null;
    const names = list.map((m) => m.name || '(unnamed)').join('+');
    return { ok: true, count: 0, meshName: names };
  }

  setCamera(camera: THREE.Camera | null): void {
    this.camera = camera;
  }

  get hasCamera(): boolean {
    return this.camera != null;
  }

  /**
   * Rebuild bake + InstancedMesh when count/seed/cover meshes change or first enable.
   */
  private ensureBake(cfg: MutableSimConfig): boolean {
    if (this.meshes.length === 0 || !this.parent) return false;
    const count = Math.max(0, Math.floor(cfg.wudaParticleCount));
    const refillOn = !!cfg.wudaDetachInstantRefill;
    const freeCap = Math.max(0, Math.floor(cfg.wudaFreePoolCapacity));
    const instanceCap = resolveWudaInstanceCapacity(count, refillOn, freeCap);
    const meshKey = this.meshes.map((m) => m.uuid).join(',');
    const regionWeights: WudaRegionWeights | null =
      cfg.wudaCoverMode === 'allMeshes'
        ? resolveWudaRegionWeightsForSide(cfg, this.side)
        : null;
    const regionKey = regionWeights
      ? `${regionWeights.head}|${regionWeights.torso}|${regionWeights.limbRoot}|${regionWeights.limbTip}`
      : 'off';
    const key = `${count}|${cfg.wudaSeed}|${cfg.wudaCoverMode}|${this.side}|${regionKey}|${meshKey}|refill=${refillOn ? 1 : 0}|free=${freeCap}`;
    if (
      key === this.bakeKey &&
      this.instanced &&
      this.slots.length === count &&
      this.freePool.length === (refillOn ? freeCap : 0) &&
      this.instanced.count === instanceCap
    ) {
      return true;
    }

    this.teardownInstances();
    this.slots = [];
    this.freePool = [];
    this.bakeKey = key;

    if (count <= 0) return false;
    const baked = bakeWudaSurfaceSamplesForMeshes(
      this.meshes,
      count,
      cfg.wudaSeed,
      regionWeights ? { regionWeights } : null,
    );
    if (baked.samples.length === 0) {
      console.warn('[WudaCoat] bake produced 0 samples');
      return false;
    }

    for (const sample of baked.samples) {
      const meshIndex = Math.max(
        0,
        Math.min(this.meshes.length - 1, sample.meshIndex ?? 0),
      );
      this.slots.push({
        sample,
        meshIndex,
        state: 'stuck',
        pos: new THREE.Vector3(),
        prevPos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        prevVel: new THREE.Vector3(),
        life: 0,
        prevValid: false,
        refillIn: 0,
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
    this.instanced.name = 'WudaCoatInstances';
    this.instanced.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(instanceCap * 3),
      3,
    );
    // Hide until first update fills matrices
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
   * @param opts.allowDetach when false, velocity still updates but stuck→free is locked
   *   (used by detach timing locks: attack active-hit / hitstun, per fighter).
   * @param opts.side which fighter this coat belongs to (region-weight isolation).
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

    const dt = clampWudaDeltaSec(
      wallDtSec,
      cfg.wudaMaxDeltaSec,
      cfg.timeScaleAnim || 1,
    );
    if (dt <= 0) return;

    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    // TRAP-LAG: refresh bone matrices after animation/world update.
    // Coalesce when multiple Skeleton objects share the same bone chain.
    const skSync = syncSkinnedMeshBoneMatrices(this.meshes);

    const blendMat = this.instanced!.material as MeshBasicNodeMaterial;
    blendMat.blending = cfg.wudaBlendAdditive
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;

    if (this.camera) {
      this.camera.getWorldQuaternion(_camQuat);
    } else {
      _camQuat.identity();
    }

    _gravity.set(cfg.wudaGravityDirX, cfg.wudaGravityDirY, cfg.wudaGravityDirZ);
    if (_gravity.lengthSq() > 1e-8) _gravity.normalize();
    else _gravity.set(0, -1, 0);

    const rng = createMulberry32((cfg.wudaSeed ^ (this.slots.length * 2654435761)) >>> 0);
    const refillOn = !!cfg.wudaDetachInstantRefill;
    const refillDelay = Math.max(0, cfg.wudaDetachRefillDelay);

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

    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;

      if (s.state === 'refilling') {
        s.refillIn = advanceRefillTimer(s.refillIn, dt);
        if (s.refillIn > 0) {
          refilling++;
          this.writeInstance(i, s.pos, 0, cfg, true);
          continue;
        }
        s.state = 'stuck';
        s.prevValid = false;
        s.vel.set(0, 0, 0);
        s.prevVel.set(0, 0, 0);
        s.life = 0;
        // fall through into stuck path this frame
      }

      if (s.state === 'stuck') {
        const mesh = this.meshes[s.meshIndex] ?? this.meshes[0]!;
        evalSkinnedSurfacePoint(mesh, s.sample, _surfacePos);

        // Degenerate triangle guard: NaN → skip detach this frame
        if (
          !Number.isFinite(_surfacePos.x) ||
          !Number.isFinite(_surfacePos.y) ||
          !Number.isFinite(_surfacePos.z)
        ) {
          stuck++;
          this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
          continue;
        }

        s.pos.copy(_surfacePos);

        if (!s.prevValid) {
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

          if (refillOn) {
            spawnWudaFreeParticle(this.freePool, s.pos, _flyVel, life);
            if (refillDelay <= 0) {
              s.state = 'stuck';
              s.prevValid = false;
              s.vel.set(0, 0, 0);
              s.prevVel.set(0, 0, 0);
              s.life = 0;
              stuck++;
              this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
            } else {
              s.state = 'refilling';
              s.refillIn = refillDelay;
              s.vel.set(0, 0, 0);
              s.prevVel.set(0, 0, 0);
              s.life = 0;
              refilling++;
              this.writeInstance(i, s.pos, 0, cfg, true);
            }
          } else {
            s.state = 'free';
            s.vel.copy(_flyVel);
            s.life = life;
            free++;
            this.writeInstance(i, s.pos, cfg.wudaFreeSize, cfg, false);
          }
        } else {
          stuck++;
          this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
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
          const mesh = this.meshes[s.meshIndex] ?? this.meshes[0]!;
          evalSkinnedSurfacePoint(mesh, s.sample, s.pos);
          this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
        } else {
          dead++;
          // Keep slot dead visually (scale 0) until rebuild
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
      const lifeT = Math.max(0, Math.min(1, s.life / Math.max(1e-4, cfg.wudaFreeLifetime)));
      this.writeInstance(
        i,
        s.pos,
        cfg.wudaFreeSize * (0.35 + 0.65 * lifeT),
        cfg,
        false,
        cfg.wudaFreeOpacity * lifeT,
      );
    }

    // Count free-pool actives after possible same-frame spawns; write instances.
    const coatCount = this.slots.length;
    for (let fi = 0; fi < this.freePool.length; fi++) {
      const p = this.freePool[fi]!;
      const instIdx = coatCount + fi;
      if (!p.active) {
        this.writeInstance(instIdx, p.pos, 0, cfg, false);
        continue;
      }
      free++;
      const lifeT = Math.max(
        0,
        Math.min(1, p.life / Math.max(1e-4, cfg.wudaFreeLifetime)),
      );
      this.writeInstance(
        instIdx,
        p.pos,
        cfg.wudaFreeSize * (0.35 + 0.65 * lifeT),
        cfg,
        false,
        cfg.wudaFreeOpacity * lifeT,
      );
    }

    this.instanced!.instanceMatrix.needsUpdate = true;
    if (this.instanced!.instanceColor) {
      this.instanced!.instanceColor.needsUpdate = true;
    }
    if (this.opacityAttr) this.opacityAttr.needsUpdate = true;
    const opacityMat = this.instanced!.material as MeshBasicNodeMaterial;
    opacityMat.opacity = 1;
    opacityMat.transparent = true;
    this.instanced!.visible = true;
    const coatMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    this.lastStats = {
      stuck,
      free,
      dead,
      refilling,
      meshCount: skSync.meshCount,
      skeletonUpdates: skSync.updates,
      skeletonCopies: skSync.copies,
      coatMs,
    };

    if (cfg.wudaShowBakeStats) {
      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - this.lastStatsLogMs > 500) {
        this.lastStatsLogMs = now;
        console.info(
          `[WudaCoat] mode=B meshes=${skSync.meshCount} skObj=${skSync.skeletonObjects} skUpd=${skSync.updates} skCopy=${skSync.copies} groups=${skSync.groups} N=${this.slots.length} freePool=${this.freePool.length} coatMs=${coatMs.toFixed(2)} stuck=${stuck} free=${free} refill=${refilling} dead=${dead}`,
        );
      }
    }

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
    if (!this.instanced || !this.opacityAttr) return;
    const sx = Math.max(0, size);
    _scale.set(sx, sx, sx);
    _quat.copy(_camQuat);
    this.dummy.position.copy(pos);
    this.dummy.quaternion.copy(_quat);
    this.dummy.scale.copy(_scale);
    this.dummy.updateMatrix();
    this.instanced.setMatrixAt(index, this.dummy.matrix);

    const op =
      sx <= 0
        ? 0
        : (opacityOverride ??
          (stuck ? cfg.wudaStuckOpacity : cfg.wudaFreeOpacity));
    resolveWudaInstanceColor(this._color, cfg, stuck, sx);
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
    this.meshes = [];
    this.parent = null;
  }
}

/**
 * Wuda coat runtime: stuck surface tracking + velocity detach + free flight.
 * docs/plans/ai-execution-plan-wuda-particle-v0.md
 */
import * as THREE from 'three';
import type { MutableSimConfig } from '../../config/constants';
import { createMulberry32 } from '../hitVfx/mulberry32';
import {
  bakeWudaSurfaceSamples,
} from './WudaSurfaceBake';
import { evalSkinnedSurfacePoint } from './evalSkinnedSurface';
import {
  clampWudaDeltaSec,
  computeSurfaceVelocity,
  freeLifetimeFromSpeed,
  integrateFreeParticle,
  shouldDetach,
} from './wudaCoatMath';
import type { WudaCoatStats, WudaParticleState, WudaSurfaceSample } from './wudaTypes';

type Slot = {
  sample: WudaSurfaceSample;
  state: WudaParticleState;
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  vel: THREE.Vector3;
  prevVel: THREE.Vector3;
  life: number;
  prevValid: boolean;
};

const _surfacePos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _gravity = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();

export class WudaCoatRuntime {
  private mesh: THREE.SkinnedMesh | null = null;
  private slots: Slot[] = [];
  private bakeKey = '';
  private instanced: THREE.InstancedMesh | null = null;
  private parent: THREE.Object3D | null = null;
  private camera: THREE.Camera | null = null;
  private lastStats: WudaCoatStats = { stuck: 0, free: 0, dead: 0 };
  private dummy = new THREE.Object3D();
  private readonly _color = new THREE.Color();

  get isBound(): boolean {
    return this.mesh != null;
  }

  getLastStats(): WudaCoatStats {
    return this.lastStats;
  }

  bind(
    mesh: THREE.SkinnedMesh,
    opts: { parent: THREE.Object3D; camera?: THREE.Camera | null },
  ): { ok: true; count: number; meshName: string } | { ok: false; reason: string } {
    this.dispose();
    if (!mesh.skeleton) {
      return { ok: false, reason: 'no skeleton' };
    }
    const geo = mesh.geometry;
    if (!geo?.getAttribute('position')) {
      return { ok: false, reason: 'no position attribute' };
    }
    this.mesh = mesh;
    this.parent = opts.parent;
    this.camera = opts.camera ?? null;
    return { ok: true, count: 0, meshName: mesh.name || '(unnamed)' };
  }

  setCamera(camera: THREE.Camera | null): void {
    this.camera = camera;
  }

  get hasCamera(): boolean {
    return this.camera != null;
  }

  /**
   * Rebuild bake + InstancedMesh when count/seed change or first enable.
   */
  private ensureBake(cfg: MutableSimConfig): boolean {
    if (!this.mesh || !this.parent) return false;
    const count = Math.max(0, Math.floor(cfg.wudaParticleCount));
    const key = `${count}|${cfg.wudaSeed}|${this.mesh.uuid}`;
    if (key === this.bakeKey && this.instanced && this.slots.length === count) {
      return true;
    }

    this.teardownInstances();
    this.slots = [];
    this.bakeKey = key;

    if (count <= 0) return false;

    const baked = bakeWudaSurfaceSamples(
      this.mesh.geometry,
      count,
      cfg.wudaSeed,
    );
    if (baked.samples.length === 0) {
      console.warn('[WudaCoat] bake produced 0 samples');
      return false;
    }

    for (const sample of baked.samples) {
      this.slots.push({
        sample,
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
    this.instanced.name = 'WudaCoatInstances';
    this.instanced.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.slots.length * 3),
      3,
    );
    // Hide until first update fills matrices
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

  update(wallDtSec: number, cfg: MutableSimConfig): void {
    if (!cfg.wudaEnabled) {
      if (this.instanced) this.instanced.visible = false;
      this.lastStats = { stuck: 0, free: 0, dead: 0 };
      return;
    }
    if (!this.mesh?.skeleton) {
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

    // TRAP-LAG: refresh bone matrices after animation/world update
    this.mesh.skeleton.update();

    const blendMat = this.instanced!.material as THREE.MeshBasicMaterial;
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

    let stuck = 0;
    let free = 0;
    let dead = 0;

    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;

      if (s.state === 'stuck') {
        evalSkinnedSurfacePoint(this.mesh, s.sample, _surfacePos);

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

        const detach = shouldDetach({
          speed,
          prevSpeed,
          accelMag,
          detachSpeed: cfg.wudaDetachSpeed,
          detachAccel: cfg.wudaDetachAccel,
          detachSpeedDrop: cfg.wudaDetachSpeedDrop,
          detachSpeedDropMinPrev: cfg.wudaDetachSpeedDropMinPrev,
        });

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
          free++;
          this.writeInstance(i, s.pos, cfg.wudaFreeSize, cfg, false);
        } else {
          stuck++;
          this.writeInstance(i, s.pos, cfg.wudaStuckSize, cfg, true);
        }
        continue;
      }

      // Free flight
      if (s.life <= 0) {
        if (cfg.wudaRespawnStuck) {
          s.state = 'stuck';
          s.prevValid = false;
          s.vel.set(0, 0, 0);
          s.prevVel.set(0, 0, 0);
          stuck++;
          evalSkinnedSurfacePoint(this.mesh, s.sample, s.pos);
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

    this.instanced!.instanceMatrix.needsUpdate = true;
    if (this.instanced!.instanceColor) {
      this.instanced!.instanceColor.needsUpdate = true;
    }
    const opacityMat = this.instanced!.material as THREE.MeshBasicMaterial;
    opacityMat.opacity = 1;
    opacityMat.transparent = true;
    this.instanced!.visible = true;
    this.lastStats = { stuck, free, dead };
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
      this._color.setRGB(
        cfg.wudaStuckColorR * op,
        cfg.wudaStuckColorG * op,
        cfg.wudaStuckColorB * op,
      );
    } else {
      this._color.setRGB(
        cfg.wudaFreeColorR * op,
        cfg.wudaFreeColorG * op,
        cfg.wudaFreeColorB * op,
      );
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
    this.mesh = null;
    this.parent = null;
  }
}

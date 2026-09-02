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
import { WudaVertexGpuBaker } from './WudaVertexGpuBaker';
import type { WudaRegionWeights } from './wudaBodyRegions';

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

export class WudaVertexCoatRuntime {
  private meshes: THREE.SkinnedMesh[] = [];
  private slots: Slot[] = [];
  private bakeKey = '';
  private instanced: THREE.InstancedMesh | null = null;
  private parent: THREE.Object3D | null = null;
  private camera: THREE.Camera | null = null;
  private baker = new WudaVertexGpuBaker();
  private lastStats: WudaCoatStats = { stuck: 0, free: 0, dead: 0 };
  private dummy = new THREE.Object3D();
  private readonly _color = new THREE.Color();
  private plumeBurst: WudaPlumeBurst | null = null;
  private lastBakeMs = 0;
  private sourceVertexCount = 0;

  get isBound(): boolean {
    return this.meshes.length > 0;
  }

  getLastStats(): WudaCoatStats {
    return this.lastStats;
  }

  setPlumeBurst(burst: WudaPlumeBurst | null): void {
    this.plumeBurst = burst;
  }

  setRenderer(_renderer: WebGPURenderer | null): void {
    // GPU computeSkinning path is not used for live tracking (feet-dump).
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
    const regionKey =
      cfg.wudaCoverMode === 'allMeshes'
        ? `${cfg.wudaRegionWeightHead}|${cfg.wudaRegionWeightTorso}|${cfg.wudaRegionWeightLimbRoot}|${cfg.wudaRegionWeightLimbTip}`
        : 'off';
    const key = `C|${count}|${cfg.wudaSeed}|${stride}|${cfg.wudaCoverMode}|${regionKey}|${meshKey}`;
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

    if (count <= 0) return false;

    const regionWeights: WudaRegionWeights | null =
      cfg.wudaCoverMode === 'allMeshes'
        ? {
            head: cfg.wudaRegionWeightHead,
            torso: cfg.wudaRegionWeightTorso,
            limbRoot: cfg.wudaRegionWeightLimbRoot,
            limbTip: cfg.wudaRegionWeightLimbTip,
          }
        : null;
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
   * May return a Promise when GPU bake awaits readback.
   * Caller should `void` the result (FighterView).
   */
  update(
    wallDtSec: number,
    cfg: MutableSimConfig,
    opts?: { allowDetach?: boolean },
  ): void | Promise<void> {
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

    if (this.camera) this.camera.getWorldQuaternion(_camQuat);
    else _camQuat.identity();

    const blendMat = this.instanced!.material as THREE.MeshBasicMaterial;
    blendMat.blending = cfg.wudaBlendAdditive
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;

    // Vertex emitters (scheme C attachment). Positions come from
    // applyBoneTransform on each sampled vertex + matrixWorld — same formula
    // as three.js SkinnedMesh.js and as B's triangle corners.
    //
    // GPU computeSkinning on a proxy that is never rendered does not receive
    // OnObjectUpdate / current boneMatrices (Discourse #34210). Readback then
    // sits at the mesh origin → particle cloud between the feet (user screenshot).
    // Do not use that path for live tracking. Multi-mesh always uses CPU bake.
    this.baker.bakeCpuIntoCurr();
    this.lastBakeMs = 0;
    this.simulateFromWorld(this.baker.getCurrWorld(), dt, cfg, allowDetach);
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
    this.lastStats = { stuck, free, dead };

    if (cfg.wudaShowBakeStats) {
      console.info(
        `[WudaVertexCoat] mode=C N=${this.slots.length} srcVerts=${this.sourceVertexCount} stride=${cfg.wudaVertexStride} bakeMs=${this.lastBakeMs.toFixed(2)} stuck=${stuck} free=${free} dead=${dead}`,
      );
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
    this.baker.dispose();
    this.meshes = [];
    this.parent = null;
  }
}

/**
 * Ryu dougi pants bone-cloth (SPCR-style constraints).
 * Independent of headband/belt springbone paths.
 * Runs after AnimationMixer; never gated by hitstop/hitstun.
 *
 * Algorithm parent: SPARK-inc/SPCRJointDynamics (MIT).
 */
import * as THREE from 'three';
import type { MutableSimConfig } from '../../config/constants';
import type { JumpPhase } from '../../combat/types';
import { applySpringBoneHelperOverlay } from '../springBoneHelperOverlay';
import {
  clampPantsDeltaSec,
  pantsBreathWind,
  pantsGravityAccel,
} from './pantsPhysicsMath';
import {
  pantsChainRegion,
  RYU_PANTS_COLLIDER_BONES,
  RYU_PANTS_MOVABLE_CHAINS,
  RYU_PANTS_RINGS,
} from './ryuPantsBoneNames';
import {
  buildPantsConstraints,
  type ChainIndexMap,
} from './spcr/pantsSpcrConstraints';
import { samplePantsHealth } from './pantsHealthSample';
import type { PantsHealthSnapshot } from './pantsHealthTypes';
import {
  applyPantsRootMotion,
  capturePantsAnimTargets,
  clampPantsParticleSeparation,
  pantsParticlesExceedSeparation,
  resetPantsParticles,
  snapPantsParticlesToTargets,
  stepPantsSolver,
  writePantsBones,
} from './spcr/pantsSpcrSolver';
import type {
  PantsCollider,
  PantsConstraint,
  PantsParticle,
} from './spcr/PantsSpcrTypes';

const CONSTRAINT_COLOR_OK = 0xffaa00;
const CONSTRAINT_COLOR_WARN = 0xffee55;
const CONSTRAINT_COLOR_ABNORMAL = 0xff2244;

export type PantsBindResult =
  | { ok: true; chainCount: number; particleCount: number; constraintCount: number }
  | { ok: false; reason: string };

export class RyuPantsPhysics {
  private particles: PantsParticle[] = [];
  private constraints: PantsConstraint[] = [];
  private colliders: PantsCollider[] = [];
  private maxDepthByIndex: number[] = [];
  private chainMap: ChainIndexMap = new Map();
  private helperParent: THREE.Object3D | null = null;
  private helperRoot: THREE.Group | null = null;
  private colliderHelpers: THREE.Object3D[] = [];
  private constraintLines: THREE.LineSegments | null = null;
  private bound = false;
  private missingReason: string | null = null;
  private timeSec = 0;
  private gravityVec = new THREE.Vector3(0, -1, 0);
  private windVec = new THREE.Vector3();
  private lastEnableHorizontal: boolean | null = null;
  private lastEnableShear: boolean | null = null;
  private lastEnableBending: boolean | null = null;

  /**
   * Character model root (NOT C_Hip). Skeletal hip motion during crouch/jump
   * must not drive ApplySystemTransform or particles explode fullscreen.
   */
  private rootTrack: THREE.Object3D | null = null;
  private prevRootPos = new THREE.Vector3();
  private prevRootQuat = new THREE.Quaternion();
  private hasRootPrev = false;
  private rootPos = new THREE.Vector3();
  private rootQuat = new THREE.Quaternion();
  private rootScale = new THREE.Vector3();
  private prevFacingSign = 1;
  private hasFacingPrev = false;
  private warpCountSession = 0;
  private clampCountSession = 0;
  private lastEvent = '';
  private lastHealth: PantsHealthSnapshot | null = null;
  private fighterId: PantsHealthSnapshot['fighterId'] = 'unknown';

  get isBound(): boolean {
    return this.bound;
  }

  get bindError(): string | null {
    return this.missingReason;
  }

  getLastHealthSnapshot(): PantsHealthSnapshot | null {
    return this.lastHealth;
  }

  setFighterId(id: PantsHealthSnapshot['fighterId']): void {
    this.fighterId = id;
  }

  bind(
    modelRoot: THREE.Object3D,
    opts?: { helperParent?: THREE.Object3D },
  ): PantsBindResult {
    this.dispose();
    this.helperParent = opts?.helperParent ?? null;
    modelRoot.updateMatrixWorld(true);

    const bones = RYU_PANTS_COLLIDER_BONES;
    const required = [
      bones.hip,
      bones.lThigh,
      bones.rThigh,
      bones.lKnee,
      bones.rKnee,
      bones.lFoot,
      bones.rFoot,
    ];
    for (const name of required) {
      if (!modelRoot.getObjectByName(name)) {
        this.missingReason = `BLOCKED: missing pants bones (${name})`;
        return { ok: false, reason: this.missingReason };
      }
    }

    // Track model root locomotion (walk x / jump y), not animated C_Hip.
    this.rootTrack = modelRoot;

    const particles: PantsParticle[] = [];
    const chainMap: ChainIndexMap = new Map();
    const maxDepthByIndex: number[] = [];

    // Per chain: fixed anchor on parent (follows leg) + free drive particle (weighted bone).
    for (const chain of RYU_PANTS_MOVABLE_CHAINS) {
      const bone = modelRoot.getObjectByName(chain.driveBone);
      if (!bone) {
        this.missingReason = `BLOCKED: missing pants bones (${chain.driveBone})`;
        return { ok: false, reason: this.missingReason };
      }
      const parent = bone.parent;
      if (!parent) {
        this.missingReason = `BLOCKED: pants drive bone has no parent (${chain.driveBone})`;
        return { ok: false, reason: this.missingReason };
      }
      const aimBone = chain.aimBone
        ? (modelRoot.getObjectByName(chain.aimBone) ?? null)
        : null;

      const region = pantsChainRegion(chain.id);
      const bindLocalPos = bone.position.clone();
      const bindLocalQuat = bone.quaternion.clone();

      const anchorPos = new THREE.Vector3();
      parent.getWorldPosition(anchorPos);
      const drivePos = new THREE.Vector3();
      bone.getWorldPosition(drivePos);

      let boneAxis = new THREE.Vector3(0, -1, 0);
      if (aimBone) {
        const cp = new THREE.Vector3();
        aimBone.getWorldPosition(cp);
        boneAxis.copy(cp).sub(drivePos);
        if (boneAxis.lengthSq() > 1e-10) boneAxis.normalize();
        else boneAxis.set(0, -1, 0);
        const inv = new THREE.Matrix4().copy(bone.matrixWorld).invert();
        boneAxis.transformDirection(inv).normalize();
      }

      const anchorIdx = particles.length;
      particles.push({
        bone: parent,
        chainId: chain.id,
        region,
        depth: 0,
        isFixed: true,
        boneAxis: new THREE.Vector3(0, -1, 0),
        initialLocalRotation: parent.quaternion.clone(),
        transformLocalQuat: parent.quaternion.clone(),
        positionCurrent: anchorPos.clone(),
        positionPrevious: anchorPos.clone(),
        transformPos: anchorPos.clone(),
        aimBone: null,
        bindLocalPos: null,
        bindLocalQuat: null,
      });
      maxDepthByIndex[anchorIdx] = 1;

      const freeIdx = particles.length;
      particles.push({
        bone,
        chainId: chain.id,
        region,
        // depth 0 for hardness (single free joint); chain index 1 for vertical link.
        depth: 0,
        isFixed: false,
        boneAxis,
        initialLocalRotation: bindLocalQuat.clone(),
        transformLocalQuat: bindLocalQuat.clone(),
        positionCurrent: drivePos.clone(),
        positionPrevious: drivePos.clone(),
        transformPos: drivePos.clone(),
        aimBone,
        bindLocalPos,
        bindLocalQuat,
      });
      maxDepthByIndex[freeIdx] = 0;
      chainMap.set(chain.id, { indices: [anchorIdx, freeIdx], maxDepth: 1 });
    }

    const constraints = buildPantsConstraints({
      particles,
      chainMap,
      rings: RYU_PANTS_RINGS,
      enableHorizontal: true,
      enableShear: true,
      enableBending: true,
    });

    const colliders = this.buildColliders(modelRoot);
    if ('error' in colliders) {
      this.missingReason = colliders.error;
      return { ok: false, reason: this.missingReason };
    }

    this.particles = particles;
    this.constraints = constraints;
    this.colliders = colliders.list;
    this.maxDepthByIndex = maxDepthByIndex;
    this.chainMap = chainMap;
    this.helperRoot = new THREE.Group();
    this.helperRoot.name = 'RyuPantsHelpers';
    this.helperRoot.frustumCulled = false;
    (this.helperParent ?? modelRoot).add(this.helperRoot);
    applySpringBoneHelperOverlay(this.helperRoot);

    this.bound = true;
    this.missingReason = null;
    this.timeSec = 0;
    this.lastEnableHorizontal = true;
    this.lastEnableShear = true;
    this.lastEnableBending = true;
    this.hasRootPrev = false;
    this.hasFacingPrev = false;
    this.warpCountSession = 0;
    this.clampCountSession = 0;
    this.lastEvent = '';
    this.lastHealth = null;
    resetPantsParticles(this.particles);
    if (this.rootTrack) {
      this.rootTrack.getWorldPosition(this.prevRootPos);
      this.rootTrack.getWorldQuaternion(this.prevRootQuat);
      this.rootTrack.getWorldScale(this.rootScale);
      this.prevFacingSign = Math.sign(this.rootScale.z) || 1;
      this.hasRootPrev = true;
      this.hasFacingPrev = true;
    }

    return {
      ok: true,
      chainCount: RYU_PANTS_MOVABLE_CHAINS.length,
      particleCount: particles.length,
      constraintCount: constraints.length,
    };
  }

  update(args: {
    deltaSec: number;
    cfg: MutableSimConfig;
    jumpPhase: JumpPhase;
  }): void {
    const { cfg, jumpPhase } = args;
    if (!cfg.pantsPhysicsEnabled || !this.bound) {
      this.lastHealth = samplePantsHealth({
        enabled: cfg.pantsPhysicsEnabled,
        bound: this.bound,
        fighterId: this.fighterId,
        particles: this.particles,
        constraints: this.constraints,
        warnRatio: cfg.pantsHealthWarnRatio,
        abnormalThreshold: cfg.pantsMaxSeparation,
        warpCountSession: this.warpCountSession,
        clampCountSession: this.clampCountSession,
        lastEvent: this.lastEvent,
        params: {
          pantsHardness: cfg.pantsHardness,
          pantsGravityPower: cfg.pantsGravityPower,
          pantsResistance: cfg.pantsResistance,
          pantsMaxSeparation: cfg.pantsMaxSeparation,
          pantsRootSlideLimit: cfg.pantsRootSlideLimit,
          pantsRootRotateLimitDeg: cfg.pantsRootRotateLimitDeg,
        },
      });
      return;
    }

    const needRebuild =
      this.lastEnableHorizontal !== cfg.pantsEnableHorizontal ||
      this.lastEnableShear !== cfg.pantsEnableShear ||
      this.lastEnableBending !== cfg.pantsEnableBending;
    if (needRebuild) {
      this.constraints = buildPantsConstraints({
        particles: this.particles,
        chainMap: this.chainMap,
        rings: RYU_PANTS_RINGS,
        enableHorizontal: cfg.pantsEnableHorizontal,
        enableShear: cfg.pantsEnableShear,
        enableBending: cfg.pantsEnableBending,
      });
      this.lastEnableHorizontal = cfg.pantsEnableHorizontal;
      this.lastEnableShear = cfg.pantsEnableShear;
      this.lastEnableBending = cfg.pantsEnableBending;
      // Refresh rest lengths from current anim targets (not polluted bone writes).
      capturePantsAnimTargets(this.particles);
      for (const c of this.constraints) {
        const a = this.particles[c.indexA]!;
        const b = this.particles[c.indexB]!;
        c.restLength = a.transformPos.distanceTo(b.transformPos);
      }
    }

    const delta = clampPantsDeltaSec(args.deltaSec, cfg.pantsMaxDeltaSec, 1);
    this.timeSec += delta;

    // Acceleration in m/s² (SPCR _Gravity ≈ (0,-9.8,0); panel power multiplies).
    const g = pantsGravityAccel(
      cfg.pantsGravityDirX,
      cfg.pantsGravityDirY,
      cfg.pantsGravityDirZ,
      cfg.pantsGravityPower,
      jumpPhase,
      cfg.pantsGravityAirScale,
    );
    this.gravityVec.set(g.x, g.y, g.z);

    const breath = pantsBreathWind(
      this.timeSec,
      cfg.pantsBreathHz,
      cfg.pantsBreathAmp,
      cfg.pantsBreathDirX,
      cfg.pantsBreathDirY,
      cfg.pantsBreathDirZ,
    );
    this.windVec
      .set(breath.x, breath.y, breath.z)
      .multiplyScalar(cfg.pantsWindScale);

    this.applyColliderRadii(cfg);
    this.syncHelpers(cfg);

    const subSteps = Math.max(1, Math.floor(cfg.pantsSubSteps));
    const subDt = delta / subSteps;
    const params = {
      resistance: cfg.pantsResistance,
      hardness: cfg.pantsHardness,
      hardnessTipScale: cfg.pantsHardnessTipScale,
      gravity: this.gravityVec,
      wind: this.windVec,
      pointRadius: cfg.pantsPointRadius,
      iterations: cfg.pantsConstraintIterations,
      usePushIn: cfg.pantsUsePushIn,
      shrink: {
        structuralVertical: cfg.pantsStructuralShrinkVertical,
        structuralHorizontal: cfg.pantsStructuralShrinkHorizontal,
        shear: cfg.pantsShearShrink,
        bendingVertical: cfg.pantsBendingShrinkVertical,
        bendingHorizontal: cfg.pantsBendingShrinkHorizontal,
      },
      stretch: {
        structuralVertical: cfg.pantsStructuralStretchVertical,
        structuralHorizontal: cfg.pantsStructuralStretchHorizontal,
        shear: cfg.pantsShearStretch,
        bendingVertical: cfg.pantsBendingStretchVertical,
        bendingHorizontal: cfg.pantsBendingStretchHorizontal,
      },
    };

    // Anim targets from bind-local × parent (immune to last-frame physics write).
    capturePantsAnimTargets(this.particles);

    // Recover from a previous explode before integrating further.
    if (pantsParticlesExceedSeparation(this.particles, cfg.pantsMaxSeparation)) {
      snapPantsParticlesToTargets(this.particles);
      this.clampCountSession++;
      this.lastEvent = 'pre-step-snap';
    }

    // Root: modelRoot only. Under limits → anchors/hardness; over → warp snap.
    if (this.rootTrack) {
      this.rootTrack.getWorldPosition(this.rootPos);
      this.rootTrack.getWorldQuaternion(this.rootQuat);
      this.rootTrack.getWorldScale(this.rootScale);
      const facingSign = Math.sign(this.rootScale.z) || 1;
      const forceWarp =
        this.hasFacingPrev && facingSign !== this.prevFacingSign;
      this.prevFacingSign = facingSign;
      this.hasFacingPrev = true;

      const rootResult = applyPantsRootMotion({
        particles: this.particles,
        rootPos: this.rootPos,
        rootQuat: this.rootQuat,
        prevRootPos: this.prevRootPos,
        prevRootQuat: this.prevRootQuat,
        hasPrev: this.hasRootPrev,
        slideLimit: cfg.pantsRootSlideLimit,
        rotateLimitRad: THREE.MathUtils.degToRad(cfg.pantsRootRotateLimitDeg),
        forceWarp,
      });
      this.hasRootPrev = true;
      if (rootResult === 'warp') {
        this.warpCountSession++;
        this.lastEvent = forceWarp ? 'facing-warp' : 'root-warp';
      }
    }

    for (let s = 0; s < subSteps; s++) {
      stepPantsSolver({
        particles: this.particles,
        constraints: this.constraints,
        colliders: this.colliders,
        maxDepthByIndex: this.maxDepthByIndex,
        dt: subDt,
        params,
        captureAnimTargets: false,
        writeBones: false,
      });
    }

    if (clampPantsParticleSeparation(this.particles, cfg.pantsMaxSeparation)) {
      this.clampCountSession++;
      this.lastEvent = 'separation-clamp';
    }
    writePantsBones(this.particles);

    this.lastHealth = samplePantsHealth({
      enabled: cfg.pantsPhysicsEnabled,
      bound: this.bound,
      fighterId: this.fighterId,
      particles: this.particles,
      constraints: this.constraints,
      warnRatio: cfg.pantsHealthWarnRatio,
      abnormalThreshold: cfg.pantsMaxSeparation,
      warpCountSession: this.warpCountSession,
      clampCountSession: this.clampCountSession,
      lastEvent: this.lastEvent,
      params: {
        pantsHardness: cfg.pantsHardness,
        pantsGravityPower: cfg.pantsGravityPower,
        pantsResistance: cfg.pantsResistance,
        pantsMaxSeparation: cfg.pantsMaxSeparation,
        pantsRootSlideLimit: cfg.pantsRootSlideLimit,
        pantsRootRotateLimitDeg: cfg.pantsRootRotateLimitDeg,
      },
    });

    this.refreshConstraintHelper(cfg);
  }

  reset(): void {
    if (!this.bound) return;
    resetPantsParticles(this.particles);
    this.hasRootPrev = false;
    this.hasFacingPrev = false;
    if (this.rootTrack) {
      this.rootTrack.getWorldPosition(this.prevRootPos);
      this.rootTrack.getWorldQuaternion(this.prevRootQuat);
      this.rootTrack.getWorldScale(this.rootScale);
      this.prevFacingSign = Math.sign(this.rootScale.z) || 1;
      this.hasRootPrev = true;
      this.hasFacingPrev = true;
    }
  }

  dispose(): void {
    this.clearHelpers();
    if (this.helperRoot) {
      this.helperRoot.parent?.remove(this.helperRoot);
      this.helperRoot = null;
    }
    this.particles = [];
    this.constraints = [];
    this.colliders = [];
    this.maxDepthByIndex = [];
    this.chainMap = new Map();
    this.bound = false;
    this.missingReason = null;
    this.rootTrack = null;
    this.hasRootPrev = false;
    this.hasFacingPrev = false;
  }

  private buildColliders(
    modelRoot: THREE.Object3D,
  ): { list: PantsCollider[] } | { error: string } {
    const b = RYU_PANTS_COLLIDER_BONES;
    const hip = modelRoot.getObjectByName(b.hip)!;
    const lThigh = modelRoot.getObjectByName(b.lThigh)!;
    const rThigh = modelRoot.getObjectByName(b.rThigh)!;
    const lKnee = modelRoot.getObjectByName(b.lKnee)!;
    const rKnee = modelRoot.getObjectByName(b.rKnee)!;
    const lFoot = modelRoot.getObjectByName(b.lFoot)!;
    const rFoot = modelRoot.getObjectByName(b.rFoot)!;
    const obi = modelRoot.getObjectByName(b.obiRoot) ?? hip;

    const list: PantsCollider[] = [
      {
        kind: 'capsule',
        group: 'thigh',
        boneHead: lThigh,
        boneTail: lKnee,
        radius: 0.07,
        radiusTailScale: 0.85,
        headInset: 0.22,
        head: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        height: 0,
      },
      {
        kind: 'capsule',
        group: 'thigh',
        boneHead: rThigh,
        boneTail: rKnee,
        radius: 0.07,
        radiusTailScale: 0.85,
        headInset: 0.22,
        head: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        height: 0,
      },
      {
        kind: 'capsule',
        group: 'calf',
        boneHead: lKnee,
        boneTail: lFoot,
        radius: 0.055,
        radiusTailScale: 0.75,
        headInset: 0.08,
        head: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        height: 0,
      },
      {
        kind: 'capsule',
        group: 'calf',
        boneHead: rKnee,
        boneTail: rFoot,
        radius: 0.055,
        radiusTailScale: 0.75,
        headInset: 0.08,
        head: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        height: 0,
      },
      {
        kind: 'sphere',
        group: 'hip',
        bone: hip,
        radius: 0.03,
        localOffset: new THREE.Vector3(0, 0.06, 0),
        center: new THREE.Vector3(),
      },
      {
        kind: 'sphere',
        group: 'belt',
        bone: obi,
        radius: 0.045,
        localOffset: new THREE.Vector3(0, 0.04, 0),
        center: new THREE.Vector3(),
      },
    ];
    return { list };
  }

  private applyColliderRadii(cfg: MutableSimConfig): void {
    let capsuleI = 0;
    let sphereI = 0;
    for (const c of this.colliders) {
      if (c.kind === 'capsule') {
        if (capsuleI < 2) {
          c.radius = cfg.pantsColliderThighRadius;
          c.radiusTailScale = cfg.pantsColliderThighTailScale;
          c.headInset = cfg.pantsColliderThighHeadInset;
        } else {
          c.radius = cfg.pantsColliderCalfRadius;
          c.radiusTailScale = cfg.pantsColliderCalfTailScale;
        }
        capsuleI++;
      } else {
        if (sphereI === 0) {
          c.radius = cfg.pantsColliderHipRadius;
          c.localOffset.set(0, cfg.pantsColliderHipYOffset, 0);
        } else {
          c.radius = cfg.pantsColliderBeltRadius;
          c.localOffset.set(0, cfg.pantsColliderBeltYOffset, 0);
        }
        sphereI++;
      }
    }
  }

  private clearHelpers(): void {
    for (const h of this.colliderHelpers) {
      h.parent?.remove(h);
      if (h instanceof THREE.Mesh) {
        h.geometry.dispose();
        (h.material as THREE.Material).dispose();
      }
    }
    this.colliderHelpers = [];
    if (this.constraintLines) {
      this.constraintLines.parent?.remove(this.constraintLines);
      this.constraintLines.geometry.dispose();
      (this.constraintLines.material as THREE.Material).dispose();
      this.constraintLines = null;
    }
  }

  private syncHelpers(cfg: MutableSimConfig): void {
    if (!this.helperRoot) return;
    if (!cfg.pantsShowColliders && !cfg.pantsShowConstraints) {
      this.clearHelpers();
      return;
    }
    if (cfg.pantsShowColliders && this.colliderHelpers.length === 0) {
      for (const c of this.colliders) {
        if (c.kind === 'sphere') {
          const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(1, 12, 8),
            new THREE.MeshBasicMaterial({
              color: 0x44ff88,
              wireframe: true,
              depthTest: false,
              depthWrite: false,
              transparent: true,
            }),
          );
          this.helperRoot.add(mesh);
          this.colliderHelpers.push(mesh);
        } else {
          const mesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(1, 1, 4, 8),
            new THREE.MeshBasicMaterial({
              color: 0x44aaff,
              wireframe: true,
              depthTest: false,
              depthWrite: false,
              transparent: true,
            }),
          );
          this.helperRoot.add(mesh);
          this.colliderHelpers.push(mesh);
        }
      }
      applySpringBoneHelperOverlay(this.helperRoot);
    }
    if (!cfg.pantsShowColliders) {
      for (const h of this.colliderHelpers) h.visible = false;
    } else {
      let hi = 0;
      for (const c of this.colliders) {
        const h = this.colliderHelpers[hi++];
        if (!h) continue;
        h.visible = true;
        if (c.kind === 'sphere') {
          h.position.copy(c.center);
          h.scale.setScalar(Math.max(0.001, c.radius));
        } else {
          // CapsuleGeometry(radius, cylinderLen): total height = cylinder + 2*radius.
          // Do NOT non-uniform-scale a unit capsule — that stretches the caps
          // into long spikes through the feet.
          const r = Math.max(
            0.001,
            c.radius * (0.5 * (1 + c.radiusTailScale)),
          );
          const cyl = Math.max(c.height - 2 * r, 0.001);
          const key = `${r.toFixed(4)}:${cyl.toFixed(4)}`;
          if (h.userData.pantsCapKey !== key) {
            const old = (h as THREE.Mesh).geometry;
            (h as THREE.Mesh).geometry = new THREE.CapsuleGeometry(r, cyl, 4, 8);
            old.dispose();
            h.userData.pantsCapKey = key;
          }
          h.scale.set(1, 1, 1);
          const mid = c.head.clone().addScaledVector(c.direction, 0.5);
          h.position.copy(mid);
          if (c.height > 1e-6) {
            h.quaternion.setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              c.direction.clone().normalize(),
            );
          }
        }
      }
      applySpringBoneHelperOverlay(this.helperRoot);
    }
  }

  private refreshConstraintHelper(cfg: MutableSimConfig): void {
    if (!this.helperRoot) return;
    const status = this.lastHealth?.status ?? 'ok';
    const forceShow =
      cfg.pantsHealthAutoShowConstraintsOnAbnormal && status === 'abnormal';
    const show = cfg.pantsShowConstraints || forceShow;
    if (!show) {
      if (this.constraintLines) this.constraintLines.visible = false;
      return;
    }
    const positions: number[] = [];
    for (const c of this.constraints) {
      if (c.kind !== 'structuralHorizontal' && c.kind !== 'structuralVertical') {
        continue;
      }
      const a = this.particles[c.indexA]!.positionCurrent;
      const b = this.particles[c.indexB]!.positionCurrent;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const color =
      status === 'abnormal'
        ? CONSTRAINT_COLOR_ABNORMAL
        : status === 'warn'
          ? CONSTRAINT_COLOR_WARN
          : CONSTRAINT_COLOR_OK;
    if (!this.constraintLines) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      );
      this.constraintLines = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
          color,
          depthTest: false,
          depthWrite: false,
          transparent: true,
        }),
      );
      this.helperRoot.add(this.constraintLines);
      applySpringBoneHelperOverlay(this.helperRoot);
    } else {
      const attr = this.constraintLines.geometry.getAttribute('position');
      if (attr.array.length !== positions.length) {
        this.constraintLines.geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(positions, 3),
        );
      } else {
        (attr.array as Float32Array).set(positions);
        attr.needsUpdate = true;
      }
      const mat = this.constraintLines.material as THREE.LineBasicMaterial;
      mat.color.setHex(color);
    }
    this.constraintLines.visible = true;
    applySpringBoneHelperOverlay(this.helperRoot);
  }
}

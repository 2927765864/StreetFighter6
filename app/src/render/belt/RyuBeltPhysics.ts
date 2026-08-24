/**
 * Ryu obi (belt) spring bones (VRMC_springBone / @pixiv/three-vrm-springbone).
 * Mirrors RyuHeadbandPhysics: runs after AnimationMixer so Obi tail tracks are overridden.
 * Waist wrap (C_ObiRoot) stays animated; only hanging tails are spring joints.
 * No idle breath wind (belt-physics-consensus).
 */
import * as THREE from 'three';
import {
  VRMSpringBoneCollider,
  VRMSpringBoneColliderHelper,
  VRMSpringBoneColliderShapeSphere,
  VRMSpringBoneJoint,
  VRMSpringBoneJointHelper,
  VRMSpringBoneManager,
  type VRMSpringBoneColliderGroup,
} from '@pixiv/three-vrm-springbone';
import type { MutableSimConfig } from '../../config/constants';
import type { JumpPhase } from '../../combat/types';
import { applySpringBoneHelperOverlay } from '../springBoneHelperOverlay';
import {
  beltGravityScaleForJumpPhase,
  beltStiffnessAtJoint,
  clampBeltDeltaSec,
} from './beltPhysicsMath';
import {
  RYU_BELT_HIP,
  RYU_BELT_L_THIGH,
  RYU_BELT_LEFT_CHAIN,
  RYU_BELT_OBI_ROOT,
  RYU_BELT_R_THIGH,
  RYU_BELT_RIGHT_CHAIN,
  type RyuBeltChainNames,
} from './ryuBeltBoneNames';

export type BeltBindResult =
  | { ok: true; leftJoints: number; rightJoints: number }
  | { ok: false; reason: string };

type AttachedSphere = {
  boneName: string;
  collider: VRMSpringBoneCollider;
  shape: VRMSpringBoneColliderShapeSphere;
  helper: VRMSpringBoneColliderHelper | null;
};

export class RyuBeltPhysics {
  private manager: VRMSpringBoneManager | null = null;
  private joints: VRMSpringBoneJoint[] = [];
  private colliderGroup: VRMSpringBoneColliderGroup | null = null;
  private attached: AttachedSphere[] = [];
  private jointHelpers: VRMSpringBoneJointHelper[] = [];
  private centerBone: THREE.Object3D | null = null;
  private modelRoot: THREE.Object3D | null = null;
  /** Scene-root helpers parent — same constraint as headband (avoid double facing). */
  private helperParent: THREE.Object3D | null = null;
  private helperRoot: THREE.Group | null = null;
  private lastUseCenter: boolean | null = null;
  private bound = false;
  private missingReason: string | null = null;

  get isBound(): boolean {
    return this.bound;
  }

  get bindError(): string | null {
    return this.missingReason;
  }

  bind(
    modelRoot: THREE.Object3D,
    opts?: { helperParent?: THREE.Object3D },
  ): BeltBindResult {
    this.dispose();
    this.modelRoot = modelRoot;
    this.helperParent = opts?.helperParent ?? null;
    modelRoot.updateMatrixWorld(true);

    const hip = modelRoot.getObjectByName(RYU_BELT_HIP);
    if (!hip) {
      this.missingReason = `BLOCKED: missing bone ${RYU_BELT_HIP}`;
      return { ok: false, reason: this.missingReason };
    }
    const obiRoot = modelRoot.getObjectByName(RYU_BELT_OBI_ROOT);
    if (!obiRoot) {
      this.missingReason = `BLOCKED: missing Obi/belt bones (${RYU_BELT_OBI_ROOT})`;
      return { ok: false, reason: this.missingReason };
    }

    const leftBones = resolveChain(modelRoot, RYU_BELT_LEFT_CHAIN);
    if ('missing' in leftBones) {
      this.missingReason = `BLOCKED: missing Obi/belt bones (${leftBones.missing})`;
      return { ok: false, reason: this.missingReason };
    }
    const rightBones = resolveChain(modelRoot, RYU_BELT_RIGHT_CHAIN);
    if ('missing' in rightBones) {
      this.missingReason = `BLOCKED: missing Obi/belt bones (${rightBones.missing})`;
      return { ok: false, reason: this.missingReason };
    }

    const lThigh = modelRoot.getObjectByName(RYU_BELT_L_THIGH);
    const rThigh = modelRoot.getObjectByName(RYU_BELT_R_THIGH);
    if (!lThigh || !rThigh) {
      this.missingReason = `BLOCKED: missing Obi/belt bones (${!lThigh ? RYU_BELT_L_THIGH : RYU_BELT_R_THIGH})`;
      return { ok: false, reason: this.missingReason };
    }

    this.centerBone = hip;
    this.helperRoot = new THREE.Group();
    this.helperRoot.name = 'RyuBeltHelpers';
    (this.helperParent ?? modelRoot).add(this.helperRoot);

    const attached = this.buildColliders(modelRoot);
    this.attached = attached.list;
    this.colliderGroup = { name: 'ryuBeltBody', colliders: attached.colliders };

    const manager = new VRMSpringBoneManager();
    const joints: VRMSpringBoneJoint[] = [];
    joints.push(...buildChainJoints(leftBones.bones, this.colliderGroup, hip));
    joints.push(...buildChainJoints(rightBones.bones, this.colliderGroup, hip));
    for (const j of joints) manager.addJoint(j);

    this.manager = manager;
    this.joints = joints;
    this.bound = true;
    this.missingReason = null;
    this.lastUseCenter = null;

    manager.setInitState();

    return {
      ok: true,
      leftJoints: leftBones.bones.length - 1,
      rightJoints: rightBones.bones.length - 1,
    };
  }

  rebuildFromConfig(cfg: MutableSimConfig): void {
    if (!this.bound || !this.modelRoot) return;
    const needRebind =
      this.lastUseCenter !== null && this.lastUseCenter !== cfg.beltUseCenter;
    if (needRebind) {
      const root = this.modelRoot;
      this.bind(root, { helperParent: this.helperParent ?? undefined });
    }
    this.applyColliderRadii(cfg);
    this.applyJointSettings(cfg, 'none');
    this.syncHelpers(cfg);
    if (this.manager) this.manager.setInitState();
  }

  update(args: {
    deltaSec: number;
    cfg: MutableSimConfig;
    jumpPhase: JumpPhase;
  }): void {
    const { cfg, jumpPhase } = args;
    if (!cfg.beltPhysicsEnabled || !this.manager || !this.bound) return;

    if (this.lastUseCenter === null) {
      this.lastUseCenter = cfg.beltUseCenter;
      this.applyCenter(cfg.beltUseCenter);
    } else if (this.lastUseCenter !== cfg.beltUseCenter) {
      this.applyCenter(cfg.beltUseCenter);
      this.lastUseCenter = cfg.beltUseCenter;
      this.manager.setInitState();
    }

    const delta = clampBeltDeltaSec(args.deltaSec, cfg.beltMaxDeltaSec, 1);

    this.applyColliderRadii(cfg);
    this.applyJointSettings(cfg, jumpPhase);
    this.syncHelpers(cfg);

    this.manager.update(delta);
    this.refreshHelperOverlay(cfg);
  }

  reset(): void {
    this.manager?.reset();
  }

  dispose(): void {
    for (const h of this.jointHelpers) {
      h.parent?.remove(h);
      h.dispose();
    }
    this.jointHelpers = [];
    for (const a of this.attached) {
      if (a.helper) {
        a.helper.parent?.remove(a.helper);
        a.helper.dispose();
      }
      a.collider.parent?.remove(a.collider);
    }
    this.attached = [];
    if (this.helperRoot) {
      this.helperRoot.parent?.remove(this.helperRoot);
      this.helperRoot = null;
    }
    if (this.manager) {
      for (const j of [...this.manager.joints]) this.manager.deleteJoint(j);
    }
    this.manager = null;
    this.joints = [];
    this.colliderGroup = null;
    this.centerBone = null;
    this.modelRoot = null;
    this.bound = false;
    this.lastUseCenter = null;
  }

  private buildColliders(modelRoot: THREE.Object3D): {
    colliders: VRMSpringBoneCollider[];
    list: AttachedSphere[];
  } {
    const specs: Array<{ boneName: string; radius: number; yOffset: number }> =
      [
        { boneName: RYU_BELT_HIP, radius: 0.1, yOffset: 0 },
        { boneName: RYU_BELT_L_THIGH, radius: 0.085, yOffset: 0.05 },
        { boneName: RYU_BELT_R_THIGH, radius: 0.085, yOffset: 0.05 },
      ];
    const colliders: VRMSpringBoneCollider[] = [];
    const list: AttachedSphere[] = [];
    for (const spec of specs) {
      const bone = modelRoot.getObjectByName(spec.boneName);
      if (!bone) continue;
      const shape = new VRMSpringBoneColliderShapeSphere({
        radius: spec.radius,
        offset: new THREE.Vector3(0, spec.yOffset, 0),
      });
      const collider = new VRMSpringBoneCollider(shape);
      collider.name = `beltCollider_${spec.boneName}`;
      bone.add(collider);
      colliders.push(collider);
      list.push({
        boneName: spec.boneName,
        collider,
        shape,
        helper: null,
      });
    }
    return { colliders, list };
  }

  private applyCenter(useCenter: boolean): void {
    const center = useCenter ? this.centerBone : null;
    for (const j of this.joints) j.center = center;
  }

  private applyColliderRadii(cfg: MutableSimConfig): void {
    const thighZ = cfg.beltColliderThighZOffset;
    for (const a of this.attached) {
      if (a.boneName === RYU_BELT_HIP) {
        a.shape.radius = cfg.beltColliderHipRadius;
        a.shape.offset.set(0, cfg.beltColliderHipYOffset, 0);
      } else if (
        a.boneName === RYU_BELT_L_THIGH ||
        a.boneName === RYU_BELT_R_THIGH
      ) {
        a.shape.radius = cfg.beltColliderThighRadius;
        a.shape.offset.set(0, cfg.beltColliderThighYOffset, thighZ);
      }
    }
  }

  private applyJointSettings(
    cfg: MutableSimConfig,
    jumpPhase: JumpPhase,
  ): void {
    const airScale = beltGravityScaleForJumpPhase(
      jumpPhase,
      cfg.beltGravityAirScale,
    );
    const gravityDir = new THREE.Vector3(
      cfg.beltGravityDirX,
      cfg.beltGravityDirY,
      cfg.beltGravityDirZ,
    );
    if (gravityDir.lengthSq() < 1e-8) gravityDir.set(0, -1, 0);
    else gravityDir.normalize();

    const gravityPower = cfg.beltGravityPower * airScale;

    const leftCount = RYU_BELT_LEFT_CHAIN.length - 1;
    for (let i = 0; i < this.joints.length; i++) {
      const joint = this.joints[i]!;
      const localIndex = i < leftCount ? i : i - leftCount;
      const chainLen = i < leftCount ? leftCount : RYU_BELT_RIGHT_CHAIN.length - 1;
      joint.settings.hitRadius = cfg.beltHitRadius;
      joint.settings.dragForce = cfg.beltDragForce;
      joint.settings.stiffness = beltStiffnessAtJoint(
        cfg.beltStiffness,
        localIndex,
        chainLen,
        cfg.beltStiffnessTipScale,
      );
      joint.settings.gravityPower = gravityPower;
      joint.settings.gravityDir.copy(gravityDir);
      if (this.colliderGroup) {
        joint.colliderGroups = [this.colliderGroup];
      }
    }
  }

  private syncHelpers(cfg: MutableSimConfig): void {
    if (!this.helperRoot) return;

    if (cfg.beltShowColliders) {
      for (const a of this.attached) {
        if (!a.helper) {
          a.helper = new VRMSpringBoneColliderHelper(a.collider);
          this.helperRoot.add(a.helper);
          applySpringBoneHelperOverlay(a.helper);
        }
        a.helper.visible = true;
      }
    } else {
      for (const a of this.attached) {
        if (a.helper) a.helper.visible = false;
      }
    }

    if (cfg.beltShowChainHelpers) {
      if (this.jointHelpers.length === 0) {
        for (const j of this.joints) {
          const h = new VRMSpringBoneJointHelper(j);
          this.helperRoot.add(h);
          applySpringBoneHelperOverlay(h);
          this.jointHelpers.push(h);
        }
      }
      for (const h of this.jointHelpers) h.visible = true;
    } else {
      for (const h of this.jointHelpers) h.visible = false;
    }

  }

  /** After spring step: sync helper matrices then re-apply overlay / bounds. */
  private refreshHelperOverlay(cfg: MutableSimConfig): void {
    if (!this.helperRoot) return;
    if (!cfg.beltShowColliders && !cfg.beltShowChainHelpers) return;
    for (const a of this.attached) {
      if (a.helper?.visible) a.helper.updateMatrixWorld(true);
    }
    for (const h of this.jointHelpers) {
      if (h.visible) h.updateMatrixWorld(true);
    }
    applySpringBoneHelperOverlay(this.helperRoot);
  }
}

function resolveChain(
  root: THREE.Object3D,
  names: RyuBeltChainNames,
): { bones: THREE.Object3D[] } | { missing: string } {
  const bones: THREE.Object3D[] = [];
  for (const name of names) {
    const o = root.getObjectByName(name);
    if (!o) return { missing: name };
    bones.push(o);
  }
  return { bones };
}

function buildChainJoints(
  bones: THREE.Object3D[],
  colliderGroup: VRMSpringBoneColliderGroup,
  center: THREE.Object3D,
): VRMSpringBoneJoint[] {
  const joints: VRMSpringBoneJoint[] = [];
  for (let i = 0; i < bones.length - 1; i++) {
    const bone = bones[i]!;
    const child = bones[i + 1]!;
    const joint = new VRMSpringBoneJoint(
      bone,
      child,
      {
        hitRadius: 0.014,
        stiffness: 1.85,
        gravityPower: 0.28,
        gravityDir: new THREE.Vector3(0, -1, 0),
        dragForce: 0.62,
      },
      [colliderGroup],
    );
    joint.center = center;
    joints.push(joint);
  }
  return joints;
}

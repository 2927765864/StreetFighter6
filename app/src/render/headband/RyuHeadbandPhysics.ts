/**
 * Ryu headband spring bones (VRMC_springBone / @pixiv/three-vrm-springbone).
 * Runs after AnimationMixer so Hairband animation tracks are overridden each frame.
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
import {
  clampHeadbandDeltaSec,
  headbandGravityScaleForJumpPhase,
  headbandStiffnessAtJoint,
} from './headbandPhysicsMath';
import {
  RYU_HEADBAND_HEAD,
  RYU_HEADBAND_L_SHOULDER,
  RYU_HEADBAND_LEFT_CHAIN,
  RYU_HEADBAND_NECK,
  RYU_HEADBAND_R_SHOULDER,
  RYU_HEADBAND_RIGHT_CHAIN,
  type RyuHeadbandChainNames,
} from './ryuHeadbandBoneNames';

export type HeadbandBindResult =
  | { ok: true; leftJoints: number; rightJoints: number }
  | { ok: false; reason: string };

type AttachedSphere = {
  boneName: string;
  collider: VRMSpringBoneCollider;
  shape: VRMSpringBoneColliderShapeSphere;
  helper: VRMSpringBoneColliderHelper | null;
};

export class RyuHeadbandPhysics {
  private manager: VRMSpringBoneManager | null = null;
  private joints: VRMSpringBoneJoint[] = [];
  private colliderGroup: VRMSpringBoneColliderGroup | null = null;
  private attached: AttachedSphere[] = [];
  private jointHelpers: VRMSpringBoneJointHelper[] = [];
  private centerBone: THREE.Object3D | null = null;
  private modelRoot: THREE.Object3D | null = null;
  /**
   * Parent for debug helpers. Must be scene-root (identity world) — helpers
   * copy target matrixWorld into local matrix; parenting under the rotated
   * fighter double-applies facing (π/2) and breaks camera alignment.
   * See @pixiv/three-vrm-springbone examples (helpers added to scene).
   */
  private helperParent: THREE.Object3D | null = null;
  private helperRoot: THREE.Group | null = null;
  private breathElapsed = 0;
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
  ): HeadbandBindResult {
    this.dispose();
    this.modelRoot = modelRoot;
    this.helperParent = opts?.helperParent ?? null;
    modelRoot.updateMatrixWorld(true);

    const head = modelRoot.getObjectByName(RYU_HEADBAND_HEAD);
    if (!head) {
      this.missingReason = `BLOCKED: missing bone ${RYU_HEADBAND_HEAD}`;
      return { ok: false, reason: this.missingReason };
    }

    const leftBones = resolveChain(modelRoot, RYU_HEADBAND_LEFT_CHAIN);
    if ('missing' in leftBones) {
      this.missingReason = `BLOCKED: missing Hairband bones (${leftBones.missing})`;
      return { ok: false, reason: this.missingReason };
    }
    const rightBones = resolveChain(modelRoot, RYU_HEADBAND_RIGHT_CHAIN);
    if ('missing' in rightBones) {
      this.missingReason = `BLOCKED: missing Hairband bones (${rightBones.missing})`;
      return { ok: false, reason: this.missingReason };
    }

    this.centerBone = head;
    this.helperRoot = new THREE.Group();
    this.helperRoot.name = 'RyuHeadbandHelpers';
    (this.helperParent ?? modelRoot).add(this.helperRoot);

    const attached = this.buildColliders(modelRoot);
    this.attached = attached.list;
    this.colliderGroup = { name: 'ryuHeadbandBody', colliders: attached.colliders };

    const manager = new VRMSpringBoneManager();
    const joints: VRMSpringBoneJoint[] = [];
    joints.push(
      ...buildChainJoints(leftBones.bones, this.colliderGroup, head),
    );
    joints.push(
      ...buildChainJoints(rightBones.bones, this.colliderGroup, head),
    );
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

  /**
   * Hot-apply cfg that requires rebuild (center / collider radii) or soft
   * settings copy into joints.
   */
  rebuildFromConfig(cfg: MutableSimConfig): void {
    if (!this.bound || !this.modelRoot) return;
    const needRebind =
      this.lastUseCenter !== null &&
      this.lastUseCenter !== cfg.headbandUseCenter;
    if (needRebind) {
      const root = this.modelRoot;
      this.bind(root);
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
    if (!cfg.headbandPhysicsEnabled || !this.manager || !this.bound) return;

    if (this.lastUseCenter === null) {
      this.lastUseCenter = cfg.headbandUseCenter;
      this.applyCenter(cfg.headbandUseCenter);
    } else if (this.lastUseCenter !== cfg.headbandUseCenter) {
      this.applyCenter(cfg.headbandUseCenter);
      this.lastUseCenter = cfg.headbandUseCenter;
      this.manager.setInitState();
    }

    const delta = clampHeadbandDeltaSec(
      args.deltaSec,
      cfg.headbandMaxDeltaSec,
      1,
    );
    this.breathElapsed += delta;

    this.applyColliderRadii(cfg);
    this.applyJointSettings(cfg, jumpPhase);
    this.syncHelpers(cfg);

    this.manager.update(delta);
  }

  reset(): void {
    this.manager?.reset();
    this.breathElapsed = 0;
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
        { boneName: RYU_HEADBAND_HEAD, radius: 0.09, yOffset: 0.02 },
        { boneName: RYU_HEADBAND_NECK, radius: 0.06, yOffset: 0 },
        { boneName: RYU_HEADBAND_L_SHOULDER, radius: 0.08, yOffset: 0 },
        { boneName: RYU_HEADBAND_R_SHOULDER, radius: 0.08, yOffset: 0 },
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
      collider.name = `headbandCollider_${spec.boneName}`;
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
    const shoulderX = cfg.headbandColliderShoulderXOffset;
    for (const a of this.attached) {
      if (a.boneName === RYU_HEADBAND_HEAD) {
        a.shape.radius = cfg.headbandColliderHeadRadius;
        a.shape.offset.set(0, cfg.headbandColliderHeadYOffset, 0);
      } else if (a.boneName === RYU_HEADBAND_NECK) {
        a.shape.radius = cfg.headbandColliderNeckRadius;
        a.shape.offset.set(0, 0, 0);
      } else if (a.boneName === RYU_HEADBAND_L_SHOULDER) {
        a.shape.radius = cfg.headbandColliderShoulderRadius;
        a.shape.offset.set(shoulderX, 0, 0);
      } else if (a.boneName === RYU_HEADBAND_R_SHOULDER) {
        a.shape.radius = cfg.headbandColliderShoulderRadius;
        // Mirrored bind: opposite local X keeps both spheres shifting "forward"
        // together when the user tunes a single front/back slider.
        a.shape.offset.set(-shoulderX, 0, 0);
      } else {
        a.shape.radius = cfg.headbandColliderShoulderRadius;
      }
    }
  }

  private applyJointSettings(
    cfg: MutableSimConfig,
    jumpPhase: JumpPhase,
  ): void {
    const airScale = headbandGravityScaleForJumpPhase(
      jumpPhase,
      cfg.headbandGravityAirScale,
    );
    const baseG = new THREE.Vector3(
      cfg.headbandGravityDirX,
      cfg.headbandGravityDirY,
      cfg.headbandGravityDirZ,
    );
    if (baseG.lengthSq() < 1e-8) baseG.set(0, -1, 0);
    else baseG.normalize();

    const breath = breathWindWorld(
      this.centerBone,
      this.breathElapsed,
      cfg.headbandBreathAmp,
      cfg.headbandBreathHz,
    );
    const external = baseG
      .clone()
      .multiplyScalar(cfg.headbandGravityPower * airScale)
      .add(breath);
    const gravityPower = external.length();
    const gravityDir =
      gravityPower > 1e-8 ? external.normalize() : baseG.clone();

    // Joints are left chain then right chain; each has (n-1) spring heads.
    const leftCount = RYU_HEADBAND_LEFT_CHAIN.length - 1;
    for (let i = 0; i < this.joints.length; i++) {
      const joint = this.joints[i]!;
      const localIndex = i < leftCount ? i : i - leftCount;
      const chainLen = leftCount;
      joint.settings.hitRadius = cfg.headbandHitRadius;
      joint.settings.dragForce = cfg.headbandDragForce;
      joint.settings.stiffness = headbandStiffnessAtJoint(
        cfg.headbandStiffness,
        localIndex,
        chainLen,
        cfg.headbandStiffnessTipScale,
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

    if (cfg.headbandShowColliders) {
      for (const a of this.attached) {
        if (!a.helper) {
          a.helper = new VRMSpringBoneColliderHelper(a.collider);
          this.helperRoot.add(a.helper);
        }
        a.helper.visible = true;
      }
    } else {
      for (const a of this.attached) {
        if (a.helper) a.helper.visible = false;
      }
    }

    if (cfg.headbandShowChainHelpers) {
      if (this.jointHelpers.length === 0) {
        for (const j of this.joints) {
          const h = new VRMSpringBoneJointHelper(j);
          this.helperRoot.add(h);
          this.jointHelpers.push(h);
        }
      }
      for (const h of this.jointHelpers) h.visible = true;
    } else {
      for (const h of this.jointHelpers) h.visible = false;
    }
  }
}

function resolveChain(
  root: THREE.Object3D,
  names: RyuHeadbandChainNames,
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
    const joint = new VRMSpringBoneJoint(bone, child, {
      hitRadius: 0.012,
      stiffness: 1.35,
      gravityPower: 0.35,
      gravityDir: new THREE.Vector3(0, -1, 0),
      dragForce: 0.48,
    }, [colliderGroup]);
    joint.center = center;
    joints.push(joint);
  }
  return joints;
}

function breathWindWorld(
  head: THREE.Object3D | null,
  elapsed: number,
  amp: number,
  hz: number,
): THREE.Vector3 {
  if (!head || amp <= 0 || hz <= 0) return new THREE.Vector3();
  const phase = elapsed * hz * Math.PI * 2;
  const local = new THREE.Vector3(
    Math.sin(phase) * amp,
    0,
    -Math.cos(phase * 0.5) * amp * 0.35,
  );
  head.updateWorldMatrix(true, false);
  local.transformDirection(head.matrixWorld);
  return local;
}

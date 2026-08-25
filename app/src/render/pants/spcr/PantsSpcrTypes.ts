/**
 * SPCRJointDynamics-inspired data shapes (MIT SPARKCREATIVE).
 * Subset used by the TypeScript pants solver.
 */
import type * as THREE from 'three';

export type PantsConstraintKind =
  | 'structuralVertical'
  | 'structuralHorizontal'
  | 'shear'
  | 'bendingVertical'
  | 'bendingHorizontal';

export type PantsParticleRegion = 'thigh' | 'shin' | 'cuff';

export type PantsColliderGroup = 'thigh' | 'calf' | 'hip' | 'belt';

export type PantsParticle = {
  bone: THREE.Object3D;
  chainId: string;
  region: PantsParticleRegion;
  depth: number;
  isFixed: boolean;
  /** Bind-pose local bone axis toward child (or default down). */
  boneAxis: THREE.Vector3;
  initialLocalRotation: THREE.Quaternion;
  /** Local rotation from animation this frame (keep spin; physics moves position). */
  transformLocalQuat: THREE.Quaternion;
  positionCurrent: THREE.Vector3;
  positionPrevious: THREE.Vector3;
  transformPos: THREE.Vector3;
  /** Optional aim child (usually zero-weight tip). */
  aimBone: THREE.Object3D | null;
  /**
   * Free drive bones: bind-pose local pos in parent space.
   * Anim targets are rebuilt as parent.matrixWorld * bindLocalPos so physics
   * writes cannot poison the next frame's hardness target.
   */
  bindLocalPos: THREE.Vector3 | null;
  bindLocalQuat: THREE.Quaternion | null;
};

export type PantsConstraint = {
  kind: PantsConstraintKind;
  indexA: number;
  indexB: number;
  restLength: number;
};

export type PantsSphereCollider = {
  kind: 'sphere';
  group: PantsColliderGroup;
  bone: THREE.Object3D;
  radius: number;
  localOffset: THREE.Vector3;
  /** World center (updated each step). */
  center: THREE.Vector3;
};

export type PantsCapsuleCollider = {
  kind: 'capsule';
  group: PantsColliderGroup;
  boneHead: THREE.Object3D;
  boneTail: THREE.Object3D;
  radius: number;
  radiusTailScale: number;
  /** 0–1: skip hip-socket sphere cap by starting down the thigh. */
  headInset: number;
  /** World head / direction*height (updated each step). */
  head: THREE.Vector3;
  direction: THREE.Vector3;
  height: number;
};

export type PantsCollider = PantsSphereCollider | PantsCapsuleCollider;

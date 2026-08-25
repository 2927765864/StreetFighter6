/**
 * Pants bone-cloth step: Verlet-like inertia, hardness restore, constraints, collision.
 * Stepping semantics from SPCRJointDynamicsJob.cs (MIT) + Jakobsen relaxation.
 *
 * Also ports SPCR ApplySystemTransform (root slide/rotate) so world-space
 * particles follow the character before secondary motion is integrated.
 */
import * as THREE from 'three';
import {
  pantsExternalForceScale,
  pantsHardnessAtDepth,
} from '../pantsPhysicsMath';
import {
  pushInFromCapsule,
  pushoutFromCapsule,
  pushoutFromSphere,
} from './pantsSpcrCollision';
import { projectConstraint } from './pantsSpcrConstraints';
import type {
  PantsCollider,
  PantsConstraint,
  PantsConstraintKind,
  PantsParticle,
} from './PantsSpcrTypes';

export type PantsSolverParams = {
  resistance: number;
  hardness: number;
  hardnessTipScale: number;
  gravity: THREE.Vector3;
  wind: THREE.Vector3;
  pointRadius: number;
  iterations: number;
  usePushIn: boolean;
  shrink: Record<PantsConstraintKind, number>;
  stretch: Record<PantsConstraintKind, number>;
};

const _invParent = new THREE.Matrix4();
const _worldQuat = new THREE.Quaternion();
const _localChild = new THREE.Vector3();
const _offsetWorld = new THREE.Vector3();
const _bindWorld = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _slide = new THREE.Vector3();
const _rotDelta = new THREE.Quaternion();
const _invPrevRot = new THREE.Quaternion();
const _tmp = new THREE.Vector3();

function syncTransformPos(p: PantsParticle): void {
  // Free drive bones: rebuild anim target from bind local × parent world.
  // Never trust bone.position after a physics write (mixer may not restore it).
  if (!p.isFixed && p.bindLocalPos && p.bone.parent) {
    const parent = p.bone.parent;
    parent.updateWorldMatrix(true, false);
    _bindWorld.copy(p.bindLocalPos).applyMatrix4(parent.matrixWorld);
    p.transformPos.copy(_bindWorld);
    if (p.bindLocalQuat) {
      p.transformLocalQuat.copy(p.bindLocalQuat);
    } else {
      p.transformLocalQuat.copy(p.bone.quaternion);
    }
    return;
  }
  p.bone.getWorldPosition(p.transformPos);
  p.transformLocalQuat.copy(p.bone.quaternion);
}

function syncColliders(colliders: PantsCollider[]): void {
  for (const c of colliders) {
    if (c.kind === 'sphere') {
      c.bone.getWorldPosition(c.center);
      c.bone.getWorldQuaternion(_worldQuat);
      _offsetWorld.copy(c.localOffset).applyQuaternion(_worldQuat);
      c.center.add(_offsetWorld);
    } else {
      c.boneHead.getWorldPosition(c.head);
      c.boneTail.getWorldPosition(_localChild);
      c.direction.copy(_localChild).sub(c.head);
      const inset = THREE.MathUtils.clamp(c.headInset, 0, 0.85);
      if (inset > 0) {
        c.head.addScaledVector(c.direction, inset);
        c.direction.copy(_localChild).sub(c.head);
      }
      c.height = c.direction.length();
    }
  }
}

function collideParticle(
  p: PantsParticle,
  colliders: PantsCollider[],
  pointRadius: number,
  usePushIn: boolean,
): void {
  if (p.isFixed) return;
  for (const c of colliders) {
    // Hip/belt spheres sit at the crotch. Thigh-chain particles live there;
    // pushing them onto those spheres inflates a visible groin ball.
    if (c.kind === 'sphere' && p.region === 'thigh') continue;
    if (c.kind === 'sphere') {
      if (c.radius <= 1e-5) continue;
      pushoutFromSphere(c.center, c.radius, pointRadius, p.positionCurrent);
    } else {
      if (c.radius <= 1e-5) continue;
      pushoutFromCapsule(
        c.head,
        c.direction,
        c.height,
        c.radius,
        c.radiusTailScale,
        pointRadius,
        p.positionCurrent,
      );
      // PushIn is SPCR inverse-collider (pull outsiders onto the surface).
      // Default off — using it on legs wraps cloth into a capsule/sphere shell.
      if (usePushIn) {
        pushInFromCapsule(
          c.head,
          c.direction,
          c.height,
          c.radius,
          c.radiusTailScale,
          p.positionCurrent,
        );
      }
    }
  }
}

/**
 * Write simulated world position back to the weighted drive bone.
 * Keep bind/animated local rotation (short cloth bones are mostly
 * translation secondary motion; tips often have no skin weight to aim with).
 */
function writeBoneFromParticle(p: PantsParticle): void {
  if (p.isFixed) return;
  const bone = p.bone;
  const parent = bone.parent;
  if (!parent) return;

  parent.updateWorldMatrix(true, false);
  _invParent.copy(parent.matrixWorld).invert();

  const localPos = p.positionCurrent.clone().applyMatrix4(_invParent);
  bone.position.copy(localPos);
  bone.quaternion.copy(p.transformLocalQuat);
}

/**
 * SPCR ApplySystemTransform: rotate around pivot, then add slide.
 * Kept for tests / rare full-follow paths; normal frames use limit+warp.
 */
export function applySystemTransform(
  point: THREE.Vector3,
  pivot: THREE.Vector3,
  slide: THREE.Vector3,
  rotationOffset: THREE.Quaternion,
): void {
  _tmp.copy(point).sub(pivot).applyQuaternion(rotationOffset).add(pivot).add(slide);
  point.copy(_tmp);
}

export type PantsRootMotionResult = 'init' | 'none' | 'warp';

/** Snap free particles to this frame's anim targets; kill Verlet velocity. */
export function snapPantsParticlesToTargets(particles: PantsParticle[]): void {
  for (const p of particles) {
    if (p.isFixed) {
      p.positionCurrent.copy(p.transformPos);
      p.positionPrevious.copy(p.transformPos);
      continue;
    }
    p.positionCurrent.copy(p.transformPos);
    p.positionPrevious.copy(p.transformPos);
  }
}

/**
 * Clamp free particles to a max distance from anim target (fullscreen-stretch fuse).
 * Returns true if any particle was clamped.
 */
export function clampPantsParticleSeparation(
  particles: PantsParticle[],
  maxSeparation: number,
): boolean {
  const maxSep = Math.max(0, maxSeparation);
  if (maxSep <= 1e-8) return false;
  const maxSq = maxSep * maxSep;
  let hit = false;
  for (const p of particles) {
    if (p.isFixed) continue;
    const dx = p.positionCurrent.x - p.transformPos.x;
    const dy = p.positionCurrent.y - p.transformPos.y;
    const dz = p.positionCurrent.z - p.transformPos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 <= maxSq || d2 < 1e-14) continue;
    const inv = maxSep / Math.sqrt(d2);
    p.positionCurrent.set(
      p.transformPos.x + dx * inv,
      p.transformPos.y + dy * inv,
      p.transformPos.z + dz * inv,
    );
    // Kill outward velocity so the next Verlet step cannot re-explode.
    p.positionPrevious.copy(p.positionCurrent);
    hit = true;
  }
  return hit;
}

/** True if any free particle is farther than maxSeparation from its anim target. */
export function pantsParticlesExceedSeparation(
  particles: PantsParticle[],
  maxSeparation: number,
): boolean {
  const maxSep = Math.max(0, maxSeparation);
  const maxSq = maxSep * maxSep;
  for (const p of particles) {
    if (p.isFixed) continue;
    if (p.positionCurrent.distanceToSquared(p.transformPos) > maxSq) return true;
  }
  return false;
}

function quatAngleRad(q: THREE.Quaternion): number {
  // 2 * acos(|w|), stable for near-identity
  const w = THREE.MathUtils.clamp(Math.abs(q.w), 0, 1);
  return 2 * Math.acos(w);
}

/**
 * SPCR-style root motion for fighting games:
 * - Under slide/rotate limits: do nothing (anchors + hardness follow skeletal motion).
 * - Over limits or forceWarp: snap free particles to anim targets (anti-teleport / anti-explode).
 *
 * Track the character `modelRoot`, never an animated hip bone.
 */
export function applyPantsRootMotion(args: {
  particles: PantsParticle[];
  rootPos: THREE.Vector3;
  rootQuat: THREE.Quaternion;
  prevRootPos: THREE.Vector3;
  prevRootQuat: THREE.Quaternion;
  hasPrev: boolean;
  /** Max root translation before warp (world units). */
  slideLimit: number;
  /** Max root rotation before warp (radians). */
  rotateLimitRad: number;
  /** Facing flip / explicit reset. */
  forceWarp?: boolean;
}): PantsRootMotionResult {
  const { particles, rootPos, rootQuat, prevRootPos, prevRootQuat } = args;
  if (!args.hasPrev) {
    prevRootPos.copy(rootPos);
    prevRootQuat.copy(rootQuat);
    return 'init';
  }

  _slide.copy(rootPos).sub(prevRootPos);
  _invPrevRot.copy(prevRootQuat).invert();
  _rotDelta.copy(rootQuat).multiply(_invPrevRot);

  const slideLen = _slide.length();
  const angle = quatAngleRad(_rotDelta);
  const slideLimit = Math.max(0, args.slideLimit);
  const rotateLimit = Math.max(0, args.rotateLimitRad);
  const overSlide = slideLen > slideLimit + 1e-8;
  const overRot = angle > rotateLimit + 1e-8;

  prevRootPos.copy(rootPos);
  prevRootQuat.copy(rootQuat);

  if (args.forceWarp || overSlide || overRot) {
    snapPantsParticlesToTargets(particles);
    return 'warp';
  }

  return 'none';
}

export function capturePantsAnimTargets(particles: PantsParticle[]): void {
  for (const p of particles) syncTransformPos(p);
}

export function writePantsBones(particles: PantsParticle[]): void {
  for (const p of particles) writeBoneFromParticle(p);
}

export function stepPantsSolver(args: {
  particles: PantsParticle[];
  constraints: PantsConstraint[];
  colliders: PantsCollider[];
  maxDepthByIndex: number[];
  dt: number;
  params: PantsSolverParams;
  /**
   * When false, keep transformPos from capturePantsAnimTargets().
   * Must be false on substeps after the first — re-reading bones after a write
   * makes gravity chase a falling target (constraint lines drip forever).
   */
  captureAnimTargets?: boolean;
  /** When false, skip bone write (call writePantsBones once after all substeps). */
  writeBones?: boolean;
}): void {
  const { particles, constraints, colliders, dt, params } = args;
  if (dt <= 0) return;

  if (args.captureAnimTargets !== false) {
    for (const p of particles) syncTransformPos(p);
  }
  syncColliders(colliders);

  // SPCR: Displacement = (MoveDir + ExternalForce) * Resistance
  // ExternalForce = (Gravity + Wind) * (StepTime^2 * 0.5)
  const resistance = THREE.MathUtils.clamp(params.resistance, 0, 1);
  const fScale = pantsExternalForceScale(dt);
  const fx = (params.gravity.x + params.wind.x) * fScale;
  const fy = (params.gravity.y + params.wind.y) * fScale;
  const fz = (params.gravity.z + params.wind.z) * fScale;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!;
    if (p.isFixed) {
      p.positionPrevious.copy(p.transformPos);
      p.positionCurrent.copy(p.transformPos);
      continue;
    }

    const moveX = p.positionCurrent.x - p.positionPrevious.x;
    const moveY = p.positionCurrent.y - p.positionPrevious.y;
    const moveZ = p.positionCurrent.z - p.positionPrevious.z;
    const dispX = (moveX + fx) * resistance;
    const dispY = (moveY + fy) * resistance;
    const dispZ = (moveZ + fz) * resistance;
    p.positionPrevious.copy(p.positionCurrent);
    p.positionCurrent.x += dispX;
    p.positionCurrent.y += dispY;
    p.positionCurrent.z += dispZ;

    const hardness = pantsHardnessAtDepth(
      params.hardness,
      p.depth,
      args.maxDepthByIndex[i] ?? p.depth,
      params.hardnessTipScale,
    );
    if (hardness > 0) {
      // Apply the same restore to previous so hardness does not inject fake velocity.
      const rx = (p.transformPos.x - p.positionCurrent.x) * hardness;
      const ry = (p.transformPos.y - p.positionCurrent.y) * hardness;
      const rz = (p.transformPos.z - p.positionCurrent.z) * hardness;
      p.positionCurrent.x += rx;
      p.positionCurrent.y += ry;
      p.positionCurrent.z += rz;
      p.positionPrevious.x += rx;
      p.positionPrevious.y += ry;
      p.positionPrevious.z += rz;
    }
  }

  const iters = Math.max(1, Math.floor(params.iterations));
  for (let it = 0; it < iters; it++) {
    for (const c of constraints) {
      projectConstraint(
        particles,
        c,
        params.shrink[c.kind],
        params.stretch[c.kind],
      );
    }
    for (const p of particles) {
      collideParticle(p, colliders, params.pointRadius, params.usePushIn);
    }
  }

  for (const p of particles) {
    if (p.isFixed) {
      p.positionCurrent.copy(p.transformPos);
      p.positionPrevious.copy(p.transformPos);
    }
  }

  if (args.writeBones !== false) {
    writePantsBones(particles);
  }
}

export function resetPantsParticles(particles: PantsParticle[]): void {
  for (const p of particles) {
    syncTransformPos(p);
    p.positionCurrent.copy(p.transformPos);
    p.positionPrevious.copy(p.transformPos);
  }
}

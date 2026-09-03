/**
 * Pure math for velocity / detach / free flight.
 * Velocity: Smrvfx / Sample Skinned Mesh Velocity = (pos - prev) / dt
 * Detach thresholds: plan REF-THRESH (Skinner CutoffSpeed dual)
 * Stick/free: Niagara Overwrite Intrinsic analogy
 */

import * as THREE from 'three';

export function clampWudaDeltaSec(
  wallDtSec: number,
  maxDeltaSec: number,
  timeScaleAnim = 1,
): number {
  const scaled = Math.max(0, wallDtSec) * (timeScaleAnim || 1);
  const cap = Math.max(0.001, maxDeltaSec);
  return Math.min(scaled, cap);
}

export function computeSurfaceVelocity(
  pos: THREE.Vector3,
  prevPos: THREE.Vector3,
  dt: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  if (dt <= 1e-8) return out.set(0, 0, 0);
  return out.copy(pos).sub(prevPos).multiplyScalar(1 / dt);
}

export type DetachCheckInput = {
  speed: number;
  prevSpeed: number;
  accelMag: number;
  detachSpeed: number;
  detachAccel: number;
  detachSpeedDrop: number;
  detachSpeedDropMinPrev: number;
};

/** OR of high-speed / high-accel / sudden-stop. */
export function shouldDetach(input: DetachCheckInput): boolean {
  if (input.speed >= input.detachSpeed) return true;
  if (input.accelMag >= input.detachAccel) return true;
  if (
    input.prevSpeed >= input.detachSpeedDropMinPrev &&
    input.prevSpeed - input.speed >= input.detachSpeedDrop
  ) {
    return true;
  }
  return false;
}

/**
 * Detach lock for「仅发生帧」: velocity math still runs; only blocks state→free.
 * `allowDetach` false → never detach this frame.
 */
export function shouldDetachWithLock(
  input: DetachCheckInput,
  allowDetach: boolean,
): boolean {
  if (!allowDetach) return false;
  return shouldDetach(input);
}

/** True when this fighter is on an attack hitbox-active logic frame. */
export function isAttackActiveHitFrame(fighter: {
  phase: string;
  mover: { currentHitBoxesLocal: () => unknown[] };
}): boolean {
  if (fighter.phase !== 'attack') return false;
  return fighter.mover.currentHitBoxesLocal().length > 0;
}

/**
 * True when this fighter is in hitstun (受击硬直), not blockstun/knockdown.
 * If `stunTimer` is provided, also requires remaining stun frames > 0.
 */
export function isHitstunFrame(fighter: {
  phase: string;
  stunTimer?: number;
}): boolean {
  if (fighter.phase !== 'hitstun') return false;
  if (fighter.stunTimer != null && fighter.stunTimer <= 0) return false;
  return true;
}

/** True during the short post-hit impact pulse (命中起连续数逻辑帧). */
export function isHitstunDetachPulse(fighter: {
  hitstunDetachPulseFrames?: number;
}): boolean {
  return (fighter.hitstunDetachPulseFrames ?? 0) > 0;
}

/**
 * Resolve per-fighter detach permission from optional timing locks.
 * - `wudaDetachOnlyOnHitstun`: only the hitstun **entry pulse** (impact), not
 *   the whole stun; pulse bypasses hitstop so impact present can shed.
 * - Hitstop otherwise locks new detach (presentation creep must not shed).
 * - Neither timing lock → allow (legacy), except during hitstop.
 * - Both locks → OR (attack active-hit OR hitstun entry pulse).
 * Always evaluated against *this* fighter so P1/P2 never leak.
 */
export function resolveWudaAllowDetach(
  cfg: {
    wudaDetachOnlyOnActiveHit: boolean;
    wudaDetachOnlyOnHitstun: boolean;
  },
  fighter: {
    phase: string;
    stunTimer?: number;
    hitstunDetachPulseFrames?: number;
    mover: { currentHitBoxesLocal: () => unknown[] };
  },
  opts?: { inHitstop?: boolean },
): boolean {
  const attackLock = cfg.wudaDetachOnlyOnActiveHit;
  const hitstunLock = cfg.wudaDetachOnlyOnHitstun;

  // Impact pulse must fire on the hit present (already inside hitstop).
  if (hitstunLock && isHitstunDetachPulse(fighter)) return true;

  // Hitstop freezes logic but presentation may creep; do not treat that as detach.
  if (opts?.inHitstop) return false;

  if (!attackLock && !hitstunLock) return true;
  let allow = false;
  if (attackLock && isAttackActiveHitFrame(fighter)) allow = true;
  // Hitstun lock is entry-pulse only (handled above).
  return allow;
}

export function integrateFreeParticle(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  dt: number,
  gravity: THREE.Vector3,
  gravityPower: number,
  drag: number,
  speedLimit: number,
): void {
  vel.addScaledVector(gravity, gravityPower * dt);
  const speed = vel.length();
  if (speed > speedLimit && speed > 1e-8) {
    vel.multiplyScalar(speedLimit / speed);
  }
  const damp = Math.max(0, 1 - drag * dt);
  vel.multiplyScalar(damp);
  pos.addScaledVector(vel, dt);
}

export function freeLifetimeFromSpeed(
  baseLife: number,
  speed: number,
  speedToLife: number,
): number {
  const t = Math.min(1, Math.max(0, speedToLife));
  return baseLife * (1 + t * speed);
}

/**
 * Pure helpers for pants bone-cloth physics.
 * Breath wind formula from SPCR RandomWind.cs (MIT).
 * Force scale matches SPCRJointDynamicsJob: ExternalForce *= StepTime^2 * 0.5
 */

/** SPCR default |_Gravity| reference (m/s²). Panel gravityPower multiplies this. */
export const PANTS_GRAVITY_REF = 9.8;

export function clampPantsDeltaSec(
  wallDtSec: number,
  maxDeltaSec: number,
  timeScaleAnim = 1,
): number {
  const maxDt = Math.max(1e-4, maxDeltaSec);
  const scaled = Math.min(Math.max(wallDtSec, 0), maxDt) * (timeScaleAnim || 1);
  return Math.min(Math.max(scaled, 0), maxDt);
}

export function pantsGravityScaleForJumpPhase(
  jumpPhase: string,
  airScale: number,
): number {
  return jumpPhase === 'air' ? airScale : 1;
}

/**
 * SPCR JobPointUpdatePass1: ExternalForce *= StepTime * StepTime * 0.5
 * Without this, panel values ~1 look like millimeters of motion per frame.
 */
export function pantsExternalForceScale(dtSec: number): number {
  const dt = Math.max(0, dtSec);
  return 0.5 * dt * dt;
}

/** World acceleration from panel gravity power (1 ≈ earth gravity). */
export function pantsGravityAccel(
  dirX: number,
  dirY: number,
  dirZ: number,
  gravityPower: number,
  jumpPhase: string,
  airScale: number,
): { x: number; y: number; z: number } {
  let x = dirX;
  let y = dirY;
  let z = dirZ;
  const len = Math.hypot(x, y, z);
  if (len > 1e-8) {
    x /= len;
    y /= len;
    z /= len;
  } else {
    x = 0;
    y = -1;
    z = 0;
  }
  const mag =
    Math.max(0, gravityPower) *
    PANTS_GRAVITY_REF *
    pantsGravityScaleForJumpPhase(jumpPhase, airScale);
  return { x: x * mag, y: y * mag, z: z * mag };
}

/** Hardness multiplier by depth along a chain (0 = root, tipScale at tip). */
export function pantsHardnessAtDepth(
  baseHardness: number,
  depth: number,
  maxDepth: number,
  tipScale: number,
): number {
  if (maxDepth <= 0) return baseHardness;
  const t = depth / maxDepth;
  const scale = 1 + (tipScale - 1) * t;
  return baseHardness * scale;
}

/**
 * Multi-frequency idle wind (SPCR RandomWind.cs).
 * Returns acceleration (m/s²); amp is peak wind strength in the same units.
 */
export function pantsBreathWind(
  timeSec: number,
  breathHz: number,
  breathAmp: number,
  dirX: number,
  dirY: number,
  dirZ: number,
): { x: number; y: number; z: number } {
  const amp = Math.max(0, breathAmp);
  if (amp <= 0) return { x: 0, y: 0, z: 0 };
  const omega = Math.max(0, breathHz) * Math.PI * 2;
  const t = Math.max(0, timeSec) * omega;
  const force =
    Math.sin(t) + 0.5 * Math.sin(t * 1.75) + 0.25 * Math.sin(t * 3.5);
  const s = (force * amp) / 1.75;
  return { x: dirX * s, y: dirY * s, z: dirZ * s };
}

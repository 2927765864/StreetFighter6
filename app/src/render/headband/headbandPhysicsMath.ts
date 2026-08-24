/** Pure helpers for headband physics (unit-testable, no three). */

export function clampHeadbandDeltaSec(
  wallDtSec: number,
  maxDeltaSec: number,
  timeScaleAnim = 1,
): number {
  const maxDt = Math.max(1e-4, maxDeltaSec);
  const scaled = Math.min(Math.max(wallDtSec, 0), maxDt) * (timeScaleAnim || 1);
  return Math.min(Math.max(scaled, 0), maxDt);
}

export function headbandGravityScaleForJumpPhase(
  jumpPhase: string,
  airScale: number,
): number {
  return jumpPhase === 'air' ? airScale : 1;
}

/** Stiffness multiplier by joint index along a chain (0 = root, tipScale at tip). */
export function headbandStiffnessAtJoint(
  baseStiffness: number,
  jointIndex: number,
  jointCount: number,
  tipScale: number,
): number {
  if (jointCount <= 1) return baseStiffness;
  const t = jointIndex / (jointCount - 1);
  const scale = 1 + (tipScale - 1) * t;
  return baseStiffness * scale;
}

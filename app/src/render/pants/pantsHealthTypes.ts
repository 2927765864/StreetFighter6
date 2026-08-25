/**
 * Pants health snapshot — single source for HUD (human) and md reports (AI).
 * Schema aligned with docs/plans/ai-execution-plan-pants-health-report-v0.md
 */

export type PantsHealthStatus = 'disabled' | 'ok' | 'warn' | 'abnormal';

export type PantsHealthParamsSlice = {
  pantsHardness: number;
  pantsGravityPower: number;
  pantsResistance: number;
  pantsMaxSeparation: number;
  pantsRootSlideLimit: number;
  pantsRootRotateLimitDeg: number;
};

export type PantsHealthSnapshot = {
  schemaVersion: 1;
  fighterId: 'p1' | 'p2' | 'unknown';
  takenAtIso: string;
  status: PantsHealthStatus;
  maxSeparation: number;
  meanSeparation: number;
  freeParticleCount: number;
  fixedParticleCount: number;
  maxConstraintError: number;
  warpCountSession: number;
  clampCountSession: number;
  lastEvent: string;
  warnThreshold: number;
  abnormalThreshold: number;
  params: PantsHealthParamsSlice;
};

export function pantsHealthStatusRank(s: PantsHealthStatus): number {
  switch (s) {
    case 'abnormal':
      return 3;
    case 'warn':
      return 2;
    case 'ok':
      return 1;
    default:
      return 0;
  }
}

export function worsePantsHealthStatus(
  a: PantsHealthStatus,
  b: PantsHealthStatus,
): PantsHealthStatus {
  return pantsHealthStatusRank(a) >= pantsHealthStatusRank(b) ? a : b;
}

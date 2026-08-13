import type { Facing, NumpadDir } from '../types';
import { overlapDepthX, type Box } from '../boxes/Box2D';

const EPS = 1e-6;

export type FacingBody = { x: number; facing: Facing };

export type FacingCommitResult = {
  committed: boolean;
  aChanged: boolean;
  bChanged: boolean;
};

/** True if any pair of push boxes overlaps on X (Y ignored — §3.14). */
export function pushBoxesOverlapX(
  boxesA: readonly Box[],
  boxesB: readonly Box[],
): boolean {
  for (const a of boxesA) {
    for (const b of boxesB) {
      if (overlapDepthX(a, b) > EPS) return true;
    }
  }
  return false;
}

/**
 * Commit logical facing only when yellow boxes are fully separated on X.
 * Visual facing follows this commit; do not flip earlier.
 */
export function tryCommitLogicalFacing(
  a: FacingBody,
  b: FacingBody,
  boxesA: readonly Box[],
  boxesB: readonly Box[],
): FacingCommitResult {
  if (pushBoxesOverlapX(boxesA, boxesB)) {
    return { committed: false, aChanged: false, bChanged: false };
  }
  const dx = b.x - a.x;
  if (Math.abs(dx) <= EPS) {
    return { committed: false, aChanged: false, bChanged: false };
  }
  const wantA: Facing = dx > 0 ? 1 : -1;
  const wantB: Facing = (-wantA) as Facing;
  const aChanged = a.facing !== wantA;
  const bChanged = b.facing !== wantB;
  a.facing = wantA;
  b.facing = wantB;
  return { committed: aChanged || bChanged, aChanged, bChanged };
}

/** @deprecated Prefer tryCommitLogicalFacing (§3.14). */
export function applyMutualFacing(a: FacingBody, b: FacingBody): void {
  tryCommitLogicalFacing(
    a,
    b,
    [{ x: a.x, y: 1, w: 0.01, h: 1 }],
    [{ x: b.x, y: 1, w: 0.01, h: 1 }],
  );
}

/**
 * Convert world numpad direction to facing-relative.
 * CritPoints: flip L/R by swapping 4↔6, 1↔3, 7↔9 when facing left.
 * @see https://critpoints.net/2025/02/05/how-to-code-fighting-game-motion-inputs/
 */
export function toFacingRelative(worldDir: NumpadDir, facing: Facing): NumpadDir {
  if (facing === 1) return worldDir;
  switch (worldDir) {
    case 1:
      return 3;
    case 3:
      return 1;
    case 4:
      return 6;
    case 6:
      return 4;
    case 7:
      return 9;
    case 9:
      return 7;
    default:
      return worldDir;
  }
}

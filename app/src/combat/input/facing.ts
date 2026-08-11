import type { Facing, NumpadDir } from '../types';

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

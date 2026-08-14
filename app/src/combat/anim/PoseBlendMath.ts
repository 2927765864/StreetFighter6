/**
 * Pure helpers for §3.11 presentation pose-blend (dual-advance / freeze).
 * No three.js dependency — unit-testable from combat tests.
 */

export type CrossfadeAdvanceMode = 'dual' | 'freeze';

/**
 * Old-layer clip time during a blend window.
 * dual: start + advanced wall-clock, clamped to clip end.
 * freeze: always start (historical scheme 2).
 */
export function advanceFromTime(
  fromStartTimeSec: number,
  fromAdvancedSec: number,
  clipDuration: number,
  mode: CrossfadeAdvanceMode,
): number {
  const end = Math.max(0, clipDuration - 1e-4);
  if (mode === 'freeze') {
    return Math.min(Math.max(0, fromStartTimeSec), end);
  }
  return Math.min(Math.max(0, fromStartTimeSec + fromAdvancedSec), end);
}

/** Cap per-frame wall dt for blend clocks (matches FighterView stepPoseBlend). */
export function blendWallDt(wallDtSec: number): number {
  return Math.min(Math.max(wallDtSec, 0), 0.1);
}

/** Smoothstep weight on `to` given elapsed/duration (existing MATH-SMOOTH). */
export function blendToWeight(elapsed: number, duration: number): number {
  const u = Math.min(1, elapsed / Math.max(1e-4, duration));
  return u * u * (3 - 2 * u);
}

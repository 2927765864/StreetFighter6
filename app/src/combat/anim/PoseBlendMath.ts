/**
 * Pure helpers for §3.11 presentation pose-blend (dual-advance / freeze).
 * No three.js dependency — unit-testable from combat tests.
 */

export type CrossfadeAdvanceMode = 'dual' | 'freeze';

/**
 * Old-layer clip time during a blend window.
 * dual: start + advanced authored seconds, clamped to clip end.
 * freeze: always start (historical scheme 2).
 *
 * `fromAdvancedSec` is accumulated at authored 60Hz (logicSteps/60), not rAF
 * wall clock — so experimental logicFps keeps transition tails in sync with
 * scrubbed / free-run clips. Blend *weight* duration stays wall-clock separately.
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

/**
 * Cap per-frame dt for blend weight and clip advance
 * (matches FighterView stepPoseBlend).
 */
export function blendWallDt(wallDtSec: number): number {
  return Math.min(Math.max(wallDtSec, 0), 0.1);
}

/**
 * One dual-advance step under experimental logicFps: weight uses wall dt,
 * clip content uses authored 60Hz free-run dt (logicSteps/60).
 */
export function stepDualAdvanceClocks(
  wallDtSec: number,
  freeRunDtSec: number,
  state: {
    elapsed: number;
    fromAdvancedSec: number;
    toAdvancedSec: number;
    toFreeRun: boolean;
    mode: CrossfadeAdvanceMode;
  },
): {
  elapsed: number;
  fromAdvancedSec: number;
  toAdvancedSec: number;
} {
  const weightDt = blendWallDt(wallDtSec);
  const clipDt = blendWallDt(freeRunDtSec);
  const elapsed = state.elapsed + weightDt;
  const fromAdvancedSec =
    state.mode === 'dual'
      ? state.fromAdvancedSec + clipDt
      : state.fromAdvancedSec;
  const toAdvancedSec = state.toFreeRun
    ? state.toAdvancedSec + clipDt
    : state.toAdvancedSec;
  return { elapsed, fromAdvancedSec, toAdvancedSec };
}

/** Smoothstep weight on `to` given elapsed/duration (existing MATH-SMOOTH). */
export function blendToWeight(elapsed: number, duration: number): number {
  const u = Math.min(1, elapsed / Math.max(1e-4, duration));
  return u * u * (3 - 2 * u);
}

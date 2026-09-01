/**
 * Pure helpers for §3.11 presentation pose-blend (dual-advance / freeze).
 * No three.js dependency — unit-testable from combat tests.
 */

export type CrossfadeAdvanceMode = 'dual' | 'freeze';

/**
 * Looping clip time into [0, duration-eps]. Used by free-run blend layers so
 * long dual-advance windows do not pin at the last authored sample.
 */
export function wrapClipTime(timeSec: number, clipDurationSec: number): number {
  const dur = Math.max(0, clipDurationSec);
  if (dur <= 1e-8) return 0;
  const end = Math.max(0, dur - 1e-4);
  let t = timeSec % dur;
  if (t < 0) t += dur;
  return Math.min(t, end);
}

/**
 * Old-layer clip time during a blend window.
 * dual: start + advanced authored seconds (clamp, or wrap when `wrapLoop`).
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
  wrapLoop = false,
): number {
  const end = Math.max(0, clipDuration - 1e-4);
  if (mode === 'freeze') {
    return Math.min(Math.max(0, fromStartTimeSec), end);
  }
  const raw = fromStartTimeSec + fromAdvancedSec;
  if (wrapLoop) return wrapClipTime(raw, clipDuration);
  return Math.min(Math.max(0, raw), end);
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

/**
 * §3.9.1.c walk-start presentation commit.
 * Logic may enter start on the press frame; the start *clip* is not a visual
 * promise until consecutive hold frames reach `commitHoldFrames`.
 */

import type { LocoPhase } from '../types';

export const DEFAULT_WALK_START_COMMIT_HOLD_FRAMES = 2;

export type WalkStartCommitState = {
  /** Consecutive 4/6 hold frames while locoPhase === start (1 on enter). */
  holdFrames: number;
  /** True when start clip may be the blend `to` / scrub target. */
  committed: boolean;
};

export function initialWalkStartCommitState(): WalkStartCommitState {
  return { holdFrames: 0, committed: false };
}

export function normalizeWalkStartCommitHoldFrames(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WALK_START_COMMIT_HOLD_FRAMES;
  return Math.max(0, Math.min(20, Math.floor(n)));
}

export type WalkStartCommitInput = {
  locoPhase: LocoPhase;
  holdingWalk: boolean;
  enteredStart: boolean;
  commitHoldFrames: number;
};

/**
 * Advance one logic frame.
 * `commitHoldFrames` = 0: scheme off — start clip committed on the press frame.
 * 1 = commit on press (same visual as 0 for start). Default 2 = tap never
 * commits start; second hold frame does.
 */
export function stepWalkStartCommit(
  prev: WalkStartCommitState,
  input: WalkStartCommitInput,
): WalkStartCommitState {
  const n = normalizeWalkStartCommitHoldFrames(input.commitHoldFrames);
  if (input.locoPhase !== 'start') {
    return initialWalkStartCommitState();
  }
  const hold = input.enteredStart
    ? 1
    : input.holdingWalk
      ? prev.holdFrames + 1
      : Math.max(1, prev.holdFrames);
  // 0 = disabled: always commit while in start (legacy playBest start).
  const committed = n <= 0 || hold >= n;
  return { holdFrames: hold, committed };
}

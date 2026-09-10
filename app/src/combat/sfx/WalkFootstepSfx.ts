/**
 * Walk footstep scheduler: alternate L/R on a fixed interval derived from
 * the walk loop length (no skeletal plant — logic-only).
 */

import type { LocoPhase } from '../types';

/** Footfalls per authored walk loop (L-R-L-R). Tunable cadence. */
export const WALK_FOOTSTEPS_PER_LOOP = 4;

export type WalkFootstepSide = 'left' | 'right';

export type WalkFootstepClock = {
  /** Frames spent in start/loop since last reset. */
  tick: number;
  nextSide: WalkFootstepSide;
};

export function initialWalkFootstepClock(): WalkFootstepClock {
  return { tick: 0, nextSide: 'left' };
}

export function walkFootstepInterval(loopLen: number): number {
  const len = Math.max(1, Math.floor(loopLen));
  return Math.max(1, Math.round(len / WALK_FOOTSTEPS_PER_LOOP));
}

function isWalkDrivePhase(phase: LocoPhase): boolean {
  return phase === 'start' || phase === 'loop';
}

/**
 * Advance the footstep clock for one logic frame of walk.
 * Call after `stepWalk` / `applyWalkState` when loco actually moved this frame.
 * Skip while walk input-freeze is active (presentation held; loco will rewind).
 */
export function stepWalkFootstepClock(
  prev: WalkFootstepClock,
  args: {
    locoPhase: LocoPhase;
    /** True when this frame just entered walk start (idle/end/reverse). */
    enteredStart: boolean;
    loopLen: number;
    /** When true, do not tick or emit (freeze / hitstop). */
    suppress: boolean;
  },
): { clock: WalkFootstepClock; side: WalkFootstepSide | null } {
  if (!isWalkDrivePhase(args.locoPhase)) {
    return { clock: initialWalkFootstepClock(), side: null };
  }
  if (args.suppress) {
    return { clock: prev, side: null };
  }

  let clock: WalkFootstepClock = args.enteredStart
    ? initialWalkFootstepClock()
    : { ...prev };

  clock = { ...clock, tick: clock.tick + 1 };
  const interval = walkFootstepInterval(args.loopLen);
  if (clock.tick % interval !== 0) {
    return { clock, side: null };
  }
  const side = clock.nextSide;
  return {
    clock: {
      tick: clock.tick,
      nextSide: side === 'left' ? 'right' : 'left',
    },
    side,
  };
}

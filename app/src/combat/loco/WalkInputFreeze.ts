/**
 * Walk input freeze timer (§3.9.1.b).
 * Delays walk anim: on justEnded, MatchSim rewinds logic to start@0 or end entry.
 * Displacement may continue during the freeze; phase progress is discarded on unfreeze.
 */

export type WalkDirEdge = 'fwd' | 'back' | null;

export type WalkInputFreezeState = {
  /** Frames left while freezing (after this tick's decrement when active). */
  remain: number;
  active: boolean;
  /** View should re-capture the displayed pose this logic frame. */
  captureSnap: boolean;
  /** Freeze countdown hit 0 this tick. */
  justEnded: boolean;
  /**
   * When justEnded: true = still holding walk dir → rewind to start@0.
   * False = released → rewind to end entry (no start).
   */
  forceStartFrom0: boolean;
  /** Last seen walk dir (4/6); used for edge detection. */
  prevDir: WalkDirEdge;
};

export const DEFAULT_WALK_INPUT_FREEZE_FRAMES = 4;

export function initialWalkInputFreezeState(): WalkInputFreezeState {
  return {
    remain: 0,
    active: false,
    captureSnap: false,
    justEnded: false,
    forceStartFrom0: false,
    prevDir: null,
  };
}

export function walkDirFromRel(relDir: number): WalkDirEdge {
  if (relDir === 6) return 'fwd';
  if (relDir === 4) return 'back';
  return null;
}

export type WalkInputFreezeStepInput = {
  walkDir: WalkDirEdge;
  /** 0 = feature off. */
  freezeFrames: number;
  /** Dash confirm / attack / jump / hitstun etc. */
  cancel: boolean;
};

/**
 * Advance one logic frame. Call after intents are known for this frame
 * (so dash cancel can win over a same-frame walk edge).
 */
export function stepWalkInputFreeze(
  prev: WalkInputFreezeState,
  input: WalkInputFreezeStepInput,
): WalkInputFreezeState {
  const walkDir = input.walkDir;
  const N = Math.max(0, Math.floor(input.freezeFrames));

  if (input.cancel) {
    return {
      ...initialWalkInputFreezeState(),
      prevDir: walkDir,
    };
  }

  const edge = walkDir != null && walkDir !== prev.prevDir;
  let active = prev.active;
  let remain = prev.remain;
  let captureSnap = false;
  let justEnded = false;
  let forceStartFrom0 = false;

  if (edge && N > 0) {
    active = true;
    remain = N;
    captureSnap = true;
  } else if (active) {
    remain -= 1;
    if (remain <= 0) {
      active = false;
      remain = 0;
      justEnded = true;
      forceStartFrom0 = walkDir != null;
    }
  }

  return {
    remain,
    active,
    captureSnap,
    justEnded,
    forceStartFrom0,
    prevDir: walkDir,
  };
}

/**
 * Walk start/loop/end phase machine (consensus §3.8 / §3.9).
 * Displacement uses movement table speeds; no foot plant.
 */

import type { LocoPhase } from '../types';
import type { WalkClipFrames } from '../../data/loadRyuMovement';

export type WalkDir = 'fwd' | 'back';

export type WalkState = {
  locoPhase: LocoPhase;
  locoFrame: number;
  walkDir: WalkDir | null;
  clipId: 'walk_fwd' | 'walk_back' | 'idle';
  animRole: string;
};

export type WalkStepInput = {
  /** true if player holds forward walk this frame */
  holdFwd: boolean;
  holdBack: boolean;
  clips: { walk_fwd: WalkClipFrames; walk_back: WalkClipFrames };
  forwardSpeed: number;
  backSpeed: number;
  firstFrameSpeedScale: number;
};

export type WalkStepResult = {
  state: WalkState;
  /** world-facing-relative: +1 along facing for fwd walk (caller multiplies facing) */
  dxFacing: number;
};

const IDLE: WalkState = {
  locoPhase: 'none',
  locoFrame: 0,
  walkDir: null,
  clipId: 'idle',
  animRole: 'main',
};

function framesFor(dir: WalkDir, phase: LocoPhase, clips: WalkStepInput['clips']): number {
  const c = dir === 'fwd' ? clips.walk_fwd : clips.walk_back;
  if (phase === 'start') return Math.max(1, c.start);
  if (phase === 'loop') return Math.max(1, c.loop);
  if (phase === 'end') return Math.max(1, c.end);
  return 1;
}

function startWalk(dir: WalkDir): WalkState {
  return {
    locoPhase: 'start',
    locoFrame: 0,
    walkDir: dir,
    clipId: dir === 'fwd' ? 'walk_fwd' : 'walk_back',
    animRole: 'start',
  };
}

/**
 * Advance one logic frame of walk state.
 * Call only when fighter can act and is not mid-attack.
 */
export function stepWalk(prev: WalkState, input: WalkStepInput): WalkStepResult {
  const want: WalkDir | null = input.holdFwd
    ? 'fwd'
    : input.holdBack
      ? 'back'
      : null;

  let s: WalkState = { ...prev };
  let dxFacing = 0;

  // Reverse while walking → restart opposite start
  if (
    want &&
    s.walkDir &&
    want !== s.walkDir &&
    (s.locoPhase === 'start' || s.locoPhase === 'loop')
  ) {
    s = startWalk(want);
  } else if (want && (s.locoPhase === 'none' || s.locoPhase === 'end' || !s.walkDir)) {
    s = startWalk(want);
  } else if (!want && (s.locoPhase === 'start' || s.locoPhase === 'loop')) {
    s = {
      locoPhase: 'end',
      locoFrame: 0,
      walkDir: s.walkDir,
      clipId: s.clipId === 'walk_back' ? 'walk_back' : 'walk_fwd',
      animRole: 'end',
    };
  }

  if (s.locoPhase === 'none' || !s.walkDir) {
    return { state: IDLE, dxFacing: 0 };
  }

  const dir = s.walkDir;
  const base = dir === 'fwd' ? input.forwardSpeed : input.backSpeed;
  const sign = dir === 'fwd' ? 1 : -1;

  if (s.locoPhase === 'start' || s.locoPhase === 'loop') {
    const scale =
      s.locoPhase === 'start' && s.locoFrame === 0
        ? input.firstFrameSpeedScale
        : 1;
    dxFacing = sign * base * scale;
  }
  // end: P0 horizontal speed 0

  const segLen = framesFor(dir, s.locoPhase, input.clips);
  s.locoFrame += 1;

  if (s.locoPhase === 'start' && s.locoFrame >= segLen) {
    s = {
      locoPhase: 'loop',
      locoFrame: 0,
      walkDir: dir,
      clipId: dir === 'fwd' ? 'walk_fwd' : 'walk_back',
      animRole: 'loop',
    };
  } else if (s.locoPhase === 'loop' && s.locoFrame >= segLen) {
    s.locoFrame = 0; // loop wrap
  } else if (s.locoPhase === 'end' && s.locoFrame >= segLen) {
    s = { ...IDLE };
  }

  return { state: s, dxFacing };
}

export function initialWalkState(): WalkState {
  return { ...IDLE };
}

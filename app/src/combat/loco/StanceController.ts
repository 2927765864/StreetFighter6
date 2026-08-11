/**
 * Stand ↔ crouch transition machine (consensus §3.7.2).
 * Roles: stand_to_crouch / crouch_to_stand / crouch main / idle.
 */

export type StanceSeg = 'none' | 'to_crouch' | 'to_stand';

export type StanceState = {
  seg: StanceSeg;
  frame: number;
  total: number;
  /** Logical posture after transition completes (and during to_crouch). */
  logicalCrouch: boolean;
};

export type StanceClipOut = {
  clipId: 'crouch' | 'idle';
  animRole: string;
};

export type StanceFrameConfig = {
  standToCrouchFrames: number;
  crouchToStandFrames: number;
};

export const DEFAULT_STANCE_FRAMES: StanceFrameConfig = {
  standToCrouchFrames: 60,
  crouchToStandFrames: 38,
};

export function initialStanceState(logicalCrouch = false): StanceState {
  return { seg: 'none', frame: 0, total: 0, logicalCrouch };
}

export function stanceClip(s: StanceState): StanceClipOut {
  if (s.seg === 'to_crouch') {
    return { clipId: 'crouch', animRole: 'stand_to_crouch' };
  }
  if (s.seg === 'to_stand') {
    return { clipId: 'crouch', animRole: 'crouch_to_stand' };
  }
  if (s.logicalCrouch) {
    return { clipId: 'crouch', animRole: 'main' };
  }
  return { clipId: 'idle', animRole: 'main' };
}

/**
 * Apply held posture while canAct and not walking.
 * @param wantCrouch true if holding 1/2/3
 */
export function stepStanceHold(
  prev: StanceState,
  wantCrouch: boolean,
  cfg: StanceFrameConfig,
): StanceState {
  let s: StanceState = { ...prev };

  // Mid-transition: same direction continues; reverse restarts opposite
  if (s.seg === 'to_crouch') {
    if (!wantCrouch) {
      return startToStand(cfg);
    }
    return s;
  }
  if (s.seg === 'to_stand') {
    if (wantCrouch) {
      return startToCrouch(cfg);
    }
    return s;
  }

  // Idle segments
  if (wantCrouch && !s.logicalCrouch) {
    return startToCrouch(cfg);
  }
  if (!wantCrouch && s.logicalCrouch) {
    return startToStand(cfg);
  }
  return s;
}

function startToCrouch(cfg: StanceFrameConfig): StanceState {
  const total = Math.max(1, cfg.standToCrouchFrames);
  return {
    seg: 'to_crouch',
    frame: 0,
    total,
    logicalCrouch: true, // hurt as crouch during descend (P0)
  };
}

function startToStand(cfg: StanceFrameConfig): StanceState {
  const total = Math.max(1, cfg.crouchToStandFrames);
  return {
    seg: 'to_stand',
    frame: 0,
    total,
    logicalCrouch: true, // P0: still crouch hurt until finished
  };
}

/** Advance one logic frame of transition; no-op if seg none. */
export function tickStance(prev: StanceState): StanceState {
  if (prev.seg === 'none') return prev;
  const frame = prev.frame + 1;
  if (frame >= prev.total) {
    if (prev.seg === 'to_crouch') {
      return {
        seg: 'none',
        frame: 0,
        total: 0,
        logicalCrouch: true,
      };
    }
    // to_stand done
    return {
      seg: 'none',
      frame: 0,
      total: 0,
      logicalCrouch: false,
    };
  }
  return { ...prev, frame };
}

export function clearStanceTo(logicalCrouch: boolean): StanceState {
  return initialStanceState(logicalCrouch);
}

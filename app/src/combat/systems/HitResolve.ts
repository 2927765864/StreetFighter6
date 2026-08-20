import type { MoveDefinition } from '../move/MoveDefinition';

export type HitApply = {
  hitstun: number;
  hitstop: number;
  pushbackTotal: number;
  moveTime: number;
  damage: number;
  hitReaction: 'stun' | 'knockdown';
  knockdownFrames: number;
};

/**
 * Ungarded hit outcome. Damage is always 0 this phase (consensus-ungarded-hit-v0).
 */
export function resolveHitOnHit(
  move: MoveDefinition,
  opts: {
    hitstopFramesOnHit: number;
    hitstunOverride: number;
    hitPushbackTotal: number;
    knockdownFramesOverride: number;
  },
): HitApply {
  const hitstun =
    opts.hitstunOverride >= 0
      ? opts.hitstunOverride
      : Math.max(0, move.hitstun);

  const hitstop =
    move.hitstopOnHit != null && Number.isFinite(move.hitstopOnHit)
      ? Math.max(0, move.hitstopOnHit)
      : Math.max(0, opts.hitstopFramesOnHit);

  let pushbackTotal = opts.hitPushbackTotal;
  if (move.hitPushbackTotal != null && Number.isFinite(move.hitPushbackTotal)) {
    pushbackTotal = move.hitPushbackTotal;
  }

  const hitReaction: 'stun' | 'knockdown' =
    move.hitReaction === 'knockdown' ? 'knockdown' : 'stun';

  let knockdownFrames = 0;
  if (hitReaction === 'knockdown') {
    knockdownFrames =
      opts.knockdownFramesOverride >= 0
        ? opts.knockdownFramesOverride
        : Math.max(0, Math.floor(move.knockdownFrames ?? 0));
  }

  const moveTimeRaw = move.hitPushMoveTime;
  const moveTime =
    moveTimeRaw != null && Number.isFinite(moveTimeRaw) && moveTimeRaw > 0
      ? Math.max(1, Math.floor(moveTimeRaw))
      : Math.max(1, hitReaction === 'knockdown' ? knockdownFrames : hitstun);

  return {
    hitstun,
    hitstop,
    pushbackTotal,
    moveTime,
    damage: 0,
    hitReaction,
    knockdownFrames,
  };
}

export const KD_SWEEP_LEN = 20;
/** DMG_BND_L_UT: sweep → ground bounce into prone. */
export const KD_BOUND_LEN = 15;
export const KD_RISE_LEN = 42;

/** Split knockdownFrames into sweep / bound / down / rise. */
export function splitKnockdown(total: number, downHoldOverride: number): {
  sweepLen: number;
  boundLen: number;
  downLen: number;
  riseLen: number;
  total: number;
} {
  const T = Math.max(1, Math.floor(total));
  const sweepLen = KD_SWEEP_LEN;
  const boundLen = KD_BOUND_LEN;
  const riseLen = KD_RISE_LEN;
  let downLen =
    downHoldOverride >= 0
      ? Math.max(1, Math.floor(downHoldOverride))
      : T - sweepLen - boundLen - riseLen;
  if (downLen < 1) downLen = 1;
  return { sweepLen, boundLen, downLen, riseLen, total: T };
}

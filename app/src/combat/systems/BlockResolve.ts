import type { MoveDefinition } from '../move/MoveDefinition';

export type BlockApply = {
  blockstun: number;
  hitstop: number;
  /** Total logical X push on defender (positive = away from attacker facing). */
  pushbackTotal: number;
  /** Frames to finish MoveDest (HIT_DT MoveTime). */
  moveTime: number;
  /** Damage to apply (0 typical for pure guard path). */
  damage: number;
};

/**
 * Build block outcome for P2 true-guard path (consensus §4.6).
 * Source priority: move fields → opts fallbacks.
 */
export function resolveBlockOnHit(
  move: MoveDefinition,
  opts: {
    hitstopFramesOnBlock: number;
    blockstunOverride: number;
    blockPushbackTotal: number;
    damageScale: number;
  },
): BlockApply {
  const blockstun =
    opts.blockstunOverride >= 0
      ? opts.blockstunOverride
      : Math.max(0, move.blockstun);

  const hitstop =
    move.hitstopOnBlock != null && Number.isFinite(move.hitstopOnBlock)
      ? Math.max(0, move.hitstopOnBlock)
      : Math.max(0, opts.hitstopFramesOnBlock);

  let pushbackTotal = opts.blockPushbackTotal;
  if (move.blockPushbackTotal != null && Number.isFinite(move.blockPushbackTotal)) {
    pushbackTotal = move.blockPushbackTotal;
  } else if (move.blockPushback && move.blockPushback.length > 0) {
    pushbackTotal = move.blockPushback.reduce((s, v) => s + v, 0);
  }

  const damage =
    opts.damageScale <= 0 ? 0 : Math.floor(move.damage * opts.damageScale);

  const moveTimeRaw = move.blockPushMoveTime;
  const moveTime =
    moveTimeRaw != null && Number.isFinite(moveTimeRaw) && moveTimeRaw > 0
      ? Math.max(1, Math.floor(moveTimeRaw))
      : Math.max(1, blockstun);

  return { blockstun, hitstop, pushbackTotal, moveTime, damage };
}

/** Ease-out progress in [0,1]. power=3 → cubic (substitute for missing CurveTgtID table). */
export function easeOutProgress(t: number, power = 3): number {
  const u = Math.min(1, Math.max(0, t));
  const p = Number.isFinite(power) && power > 0 ? power : 3;
  return 1 - (1 - u) ** p;
}

/**
 * Spread total over MoveTime with ease-out (fast first, then settle).
 * Length = moveTime (defaults to stunFrames). Does not pad leftover stun with zeros.
 */
export function distributePushback(
  total: number,
  stunFrames: number,
  opts?: { moveTime?: number; easePower?: number },
): number[] {
  const n = Math.max(
    1,
    Math.floor(
      opts?.moveTime != null && opts.moveTime > 0 ? opts.moveTime : stunFrames,
    ),
  );
  if (!Number.isFinite(total) || total === 0) return new Array(n).fill(0);
  const power = opts?.easePower ?? 3;
  const steps: number[] = [];
  let prev = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const p = easeOutProgress((i + 1) / n, power);
    const dx = i === n - 1 ? total - acc : total * (p - prev);
    steps.push(dx);
    acc += dx;
    prev = p;
  }
  return steps;
}

export type StandPunchHitPushOpts = {
  standLpHitPushEasePower: number;
  standLpHitPushMoveTime: number;
  standLpHitPushTotal: number;
  standMpHitPushEasePower: number;
  standMpHitPushMoveTime: number;
  standMpHitPushTotal: number;
  standHpHitPushEasePower: number;
  standHpHitPushMoveTime: number;
  standHpHitPushTotal: number;
};

/** Only standing LP / MP / HP (5LP / 5MP / 5HP). */
export function standPunchHitPushSlot(
  moveId: string | undefined,
): 'lp' | 'mp' | 'hp' | null {
  if (!moveId) return null;
  const id = moveId.toLowerCase().replace(/-/g, '_');
  const tail = id.includes('_') ? id.slice(id.lastIndexOf('_') + 1) : id;
  if (tail === '5lp' || id === '5lp') return 'lp';
  if (tail === '5mp' || id === '5mp') return 'mp';
  if (tail === '5hp' || id === '5hp') return 'hp';
  return null;
}

/**
 * Per-move ease-out for standing punches. Returns null for every other move
 * so callers keep the baked table / global ease.
 */
export function tryStandPunchHitPushSteps(
  moveId: string | undefined,
  tableTotal: number,
  tableMoveTime: number,
  stunFrames: number,
  opts: StandPunchHitPushOpts,
): number[] | null {
  const slot = standPunchHitPushSlot(moveId);
  if (!slot) return null;
  const ease =
    slot === 'lp'
      ? opts.standLpHitPushEasePower
      : slot === 'mp'
        ? opts.standMpHitPushEasePower
        : opts.standHpHitPushEasePower;
  const mtOver =
    slot === 'lp'
      ? opts.standLpHitPushMoveTime
      : slot === 'mp'
        ? opts.standMpHitPushMoveTime
        : opts.standHpHitPushMoveTime;
  const totOver =
    slot === 'lp'
      ? opts.standLpHitPushTotal
      : slot === 'mp'
        ? opts.standMpHitPushTotal
        : opts.standHpHitPushTotal;
  const total = totOver >= 0 && Number.isFinite(totOver) ? totOver : tableTotal;
  const moveTime =
    mtOver >= 0 && Number.isFinite(mtOver) ? mtOver : tableMoveTime;
  const easePower = Number.isFinite(ease) && ease > 0 ? ease : 3;
  return distributePushback(total, stunFrames, { moveTime, easePower });
}

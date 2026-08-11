/**
 * Presentation crossfade policy (§3.11).
 *
 * Mechanism: freeze-old + blend-to-new (shared mixer in FighterView).
 * Policy table decides whether to blend and for how long — not a single global fade.
 *
 * Never encroaches on attack lock (total): callers must pass duration 0 while
 * phase===attack locked; this module also returns 0 for lock-like targets.
 */

import { isLocoSoftBinding } from '../loco/WalkController';

/** Wall-clock seconds for each edge class. */
export type CrossfadeDurations = {
  /** Walk ↔ stop / walk segment switches (可偏长). */
  locoSec: number;
  /** Attack residual (or any attack clip) → walk / idle-like move (可稍长). */
  residualToMoveSec: number;
  /** Attack residual → another attack (短或不溶; default 0). */
  residualToAttackSec: number;
};

export type ClipCategory =
  | 'loco'
  | 'walk'
  | 'attack'
  | 'stance'
  | 'jump'
  | 'dash'
  | 'hit'
  | 'other';

function logicIdFromBinding(bindingKey: string): string {
  return (bindingKey.split('::')[0] ?? bindingKey).toLowerCase();
}

/**
 * Classify a logic binding key (`logicId::role`) for the §3.11 table.
 */
export function categorizeBinding(bindingKey: string): ClipCategory {
  if (!bindingKey) return 'other';
  const id = logicIdFromBinding(bindingKey);

  if (
    id === 'idle' ||
    id === 'crouch' ||
    id === 'walk' ||
    id === 'walk_fwd' ||
    id === 'walk_back'
  ) {
    if (id.startsWith('walk')) return 'walk';
    return 'loco';
  }

  if (
    id === 'stand_to_crouch' ||
    id === 'crouch_to_stand' ||
    id.includes('stand_to_crouch') ||
    id.includes('crouch_to_stand')
  ) {
    return 'stance';
  }

  if (
    id.startsWith('jump') ||
    id === 'prejump' ||
    id === 'landing' ||
    id === 'airborne'
  ) {
    return 'jump';
  }

  if (id.startsWith('dash')) return 'dash';

  if (
    id.includes('hitstun') ||
    id.includes('blockstun') ||
    id.includes('hit_') ||
    id === 'damage' ||
    id === 'guard'
  ) {
    return 'hit';
  }

  // Normals / specials: 5lp, ryu_5lk, hadoken, etc.
  return 'attack';
}

function isMoveLike(cat: ClipCategory): boolean {
  return cat === 'loco' || cat === 'walk';
}

/**
 * Resolve freeze-old crossfade duration (seconds) for a clip switch.
 * Returns 0 → hard cut.
 */
export function resolveCrossfadeSec(
  fromKey: string | null | undefined,
  toKey: string,
  d: CrossfadeDurations,
): number {
  if (!fromKey || !toKey || fromKey === toKey) return 0;

  const from = categorizeBinding(fromKey);
  const to = categorizeBinding(toKey);

  // 受击等：通常不溶
  if (from === 'hit' || to === 'hit') return 0;

  // 逻辑过渡片 / 跳冲：不靠溶图冒充
  if (
    from === 'stance' ||
    to === 'stance' ||
    from === 'jump' ||
    to === 'jump' ||
    from === 'dash' ||
    to === 'dash'
  ) {
    return 0;
  }

  // 走 ↔ 停 / 走段之间 — 可溶、可偏长
  if (isMoveLike(from) && isMoveLike(to)) {
    return Math.max(0, d.locoSec);
  }

  // 攻击残留（攻击片）→ 移动 / 待机 — 可溶、可稍长
  if (from === 'attack' && isMoveLike(to)) {
    return Math.max(0, d.residualToMoveSec);
  }

  // 攻击残留 → 另一攻击 — 短或不溶
  if (from === 'attack' && to === 'attack') {
    return Math.max(0, d.residualToAttackSec);
  }

  // 移动 → 攻击：跟手，硬切
  if (isMoveLike(from) && to === 'attack') {
    return 0;
  }

  return 0;
}

/**
 * Whether freeze-old soft blend should run for this edge (duration > 0).
 * Prefer resolveCrossfadeSec for the actual seconds.
 */
export function shouldPresentationCrossfade(
  fromKey: string | null | undefined,
  toKey: string,
  d: CrossfadeDurations,
): boolean {
  return resolveCrossfadeSec(fromKey, toKey, d) > 1e-4;
}

/** @deprecated Prefer resolveCrossfadeSec; kept for walk-only call sites. */
export function shouldLocoSoftBlendCompat(
  fromKey: string,
  toKey: string,
): boolean {
  if (!fromKey || !toKey || fromKey === toKey) return false;
  return isLocoSoftBinding(fromKey) && isLocoSoftBinding(toKey);
}

export function defaultCrossfadeDurations(partial?: Partial<CrossfadeDurations>): CrossfadeDurations {
  return {
    locoSec: partial?.locoSec ?? 0.12,
    residualToMoveSec: partial?.residualToMoveSec ?? 0.1,
    residualToAttackSec: partial?.residualToAttackSec ?? 0,
  };
}

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
  /**
   * Attack residual → stand↔crouch transition clip (可稍长).
   * Softens hard cut into crouch_to_stand / stand_to_crouch; does not replace the clip.
   */
  residualToStanceSec: number;
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
  | 'turn'
  | 'other';

function bindingParts(bindingKey: string): { id: string; role: string } {
  const raw = bindingKey.toLowerCase();
  const [idPart, rolePart] = raw.split('::');
  return {
    id: idPart ?? raw,
    role: rolePart ?? 'main',
  };
}

/**
 * Classify a logic binding key (`logicId::role`) for the §3.11 table.
 * Stance roles live under clipId `crouch` (e.g. crouch::crouch_to_stand).
 */
export function categorizeBinding(bindingKey: string): ClipCategory {
  if (!bindingKey) return 'other';
  const { id, role } = bindingParts(bindingKey);

  // Role takes priority: stand↔crouch transition clips
  if (
    role === 'stand_to_crouch' ||
    role === 'crouch_to_stand' ||
    id === 'stand_to_crouch' ||
    id === 'crouch_to_stand' ||
    id.includes('stand_to_crouch') ||
    id.includes('crouch_to_stand')
  ) {
    return 'stance';
  }

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
    id.startsWith('jump') ||
    id === 'prejump' ||
    id === 'landing' ||
    id === 'airborne'
  ) {
    return 'jump';
  }

  if (id.startsWith('dash')) return 'dash';

  if (id.startsWith('turn')) return 'turn';

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

  // 转身（§3.14 / §3.11.2）
  if (from === 'turn' || to === 'turn') {
    if (to === 'attack' || to === 'jump' || to === 'dash') return 0;
    return Math.max(0, d.residualToMoveSec);
  }

  // 跳（§3.11.2 / §3.13.5）
  if (from === 'jump' || to === 'jump') {
    const fromRole = bindingParts(fromKey).role;
    const toRole = bindingParts(toKey).role;
    // 落地画面 → 待机
    if (from === 'jump' && fromRole === 'land' && isMoveLike(to)) {
      return Math.max(0, d.residualToMoveSec);
    }
    // 跳攻残留 → land / air（收招后溶；按下进招仍走 attack 锁定硬切）
    if (from === 'attack' && to === 'jump' && (toRole === 'land' || toRole === 'air')) {
      return Math.max(0, d.residualToMoveSec);
    }
    return 0;
  }

  // 冲刺残留 → 待机/移动：可溶（§3.11 次要）
  if (from === 'dash' && isMoveLike(to)) {
    return Math.max(0, d.residualToMoveSec);
  }

  // 进/出冲刺其它边：硬切（跟手）
  if (from === 'dash' || to === 'dash') {
    return 0;
  }

  // 攻击残留 → 站↔蹲过渡（必接片仍播；只软化切入）
  if (from === 'attack' && to === 'stance') {
    return Math.max(0, d.residualToStanceSec);
  }

  // 其它涉及 stance 的边：默认可硬切（idle↔过渡姿势接近）
  if (from === 'stance' || to === 'stance') {
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

export function defaultCrossfadeDurations(
  partial?: Partial<CrossfadeDurations>,
): CrossfadeDurations {
  return {
    locoSec: partial?.locoSec ?? 0.12,
    residualToMoveSec: partial?.residualToMoveSec ?? 0.1,
    residualToStanceSec: partial?.residualToStanceSec ?? 0.1,
    residualToAttackSec: partial?.residualToAttackSec ?? 0,
  };
}

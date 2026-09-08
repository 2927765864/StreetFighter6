/** Punch vs kick, and L vs R from the posed skeleton. */

export type AttackLimbKind = 'hand' | 'foot';
export type AttackLimbSide = 'L' | 'R';

export type LimbSample = {
  x: number;
  y: number;
  z: number;
};

const BUTTON_RE = /(?:j>?)?[2-9]?[lmh][pk]/g;

function classifyToken(s: string): AttackLimbKind | null {
  const t = s.toLowerCase();
  if (/tatsu|blade|tatsumaki/.test(t)) return 'foot';
  if (/hadoken|shoryu|hashogeki|denjin/.test(t)) return 'hand';
  if (/214_k|9_214/.test(t)) return 'foot';
  if (/236_p|214_p|623_p|22_p/.test(t)) return 'hand';
  if (/[lmh]k\b|_k\b/.test(t) || /[lmh]k$/.test(t)) return 'foot';
  if (/[lmh]p\b|_p\b/.test(t) || /[lmh]p$/.test(t)) return 'hand';
  if (t.includes('k') && !t.includes('p')) return 'foot';
  if (t.includes('p')) return 'hand';
  return null;
}

/** Button-like segments in a move id (`ryu_5mp_5lk_5hk` → 5mp, 5lk, 5hk). */
export function moveLimbTokens(moveId: string): string[] {
  const s = moveId.toLowerCase();
  const found = s.match(BUTTON_RE);
  return found && found.length > 0 ? found : [s];
}

/**
 * Punch vs kick for this contact. Target-combo ids pick the token for
 * `hitGroup` (0-based). Specials use family keywords.
 */
export function classifyAttackLimbKind(
  moveId: string,
  hitGroup = 0,
): AttackLimbKind {
  const family = classifyToken(moveId);
  const tokens = moveLimbTokens(moveId);
  if (tokens.length > 1) {
    const i = Math.min(Math.max(0, hitGroup), tokens.length - 1);
    return classifyToken(tokens[i]!) ?? family ?? 'hand';
  }
  return family ?? 'hand';
}

/** Horizontal reach from hips — plant sits under the body, kick swings out. */
function horizDist2(a: LimbSample, b: LimbSample): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * Striking L/R from the posed skeleton.
 * Hands: more reach along facing (jab vs guard hand).
 * Feet: roundhouse / side / rear kicks leave the plant foot more forward on
 * X; the kicking leg is the one farther from the hips.
 */
export function pickAttackLimbSide(
  facing: number,
  left: LimbSample,
  right: LimbSample,
  hips: LimbSample,
  kind: AttackLimbKind = 'hand',
): AttackLimbSide {
  if (kind === 'foot') {
    return horizDist2(right, hips) >= horizDist2(left, hips) ? 'R' : 'L';
  }
  const fx = facing >= 0 ? 1 : -1;
  const score = (p: LimbSample) =>
    (p.x - hips.x) * fx + (p.y - hips.y) * 0.25;
  return score(right) >= score(left) ? 'R' : 'L';
}

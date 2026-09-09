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

/** Present samples kept for punch/kick impulse (≈80ms at 60fps). */
export const LIMB_IMPULSE_LOOKBACK = 5;
/** 5LP / 2LP: contact + 1 present before it (one Δt). */
export const LIMB_IMPULSE_LOOKBACK_SHORT = 2;
/** 5MP / 5MK / 6HK: contact + 2 presents (two Δt). */
export const LIMB_IMPULSE_LOOKBACK_5MP = 3;

export function contactMoveToken(moveId: string, hitGroup = 0): string {
  const tokens = moveLimbTokens(moveId);
  if (tokens.length === 0) return moveId.toLowerCase();
  const i = Math.min(Math.max(0, hitGroup), tokens.length - 1);
  return tokens[i]!.toLowerCase();
}

/**
 * How many history samples to average. Standing/crouch light punch use only
 * the last interval; everything else uses the full lookback.
 */
export function limbImpulseSampleCount(
  moveId: string,
  hitGroup = 0,
): number {
  const tok = contactMoveToken(moveId, hitGroup);
  if (tok === '5lp' || tok === '2lp') return LIMB_IMPULSE_LOOKBACK_SHORT;
  if (tok === '5mp' || tok === '5mk' || tok === '6hk') {
    return LIMB_IMPULSE_LOOKBACK_5MP;
  }
  return LIMB_IMPULSE_LOOKBACK;
}

/**
 * Per-move 2D FX aim on the fight plane (X/Y, Z already 0):
 * - 5LP / 2LP: flatten to forward (no up/down).
 * - 5MP: computed swing sits slightly above horizontal; authored FX wants
 *   slightly below — mirror Y.
 */
export function adjustLimbImpulseForMove(
  moveId: string,
  hitGroup: number,
  impulse: LimbSample,
): LimbSample {
  const tok = contactMoveToken(moveId, hitGroup);
  if (tok === '5lp' || tok === '2lp') {
    impulse.y = 0;
  } else if (tok === '5mp') {
    impulse.y = -impulse.y;
  }
  return impulse;
}

/** Knee→foot blend for lower shin when numbered shin bones are missing. */
export const LOWER_SHIN_ALONG_LEG = 0.72;

export function averageLimbSamples(
  points: LimbSample[],
  out: LimbSample,
): boolean {
  if (points.length === 0) return false;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = points.length;
  out.x = x / n;
  out.y = y / n;
  out.z = z / n;
  return true;
}

/** Point on the lower calf: t=0 at knee, t=1 at foot. */
export function lowerShinAlongLeg(
  knee: LimbSample,
  foot: LimbSample,
  t = LOWER_SHIN_ALONG_LEG,
  out: LimbSample = { x: 0, y: 0, z: 0 },
): LimbSample {
  const u = Math.min(1, Math.max(0, t));
  out.x = knee.x + (foot.x - knee.x) * u;
  out.y = knee.y + (foot.y - knee.y) * u;
  out.z = knee.z + (foot.z - knee.z) * u;
  return out;
}

/**
 * Mean velocity from oldest→newest over `elapsedSec` (not adjacent frames).
 * 2D hit FX faces the camera: only fight-plane X/Y; depth Z is held fixed
 * (delta Z does not contribute). Need ≥2 samples and a positive span.
 */
export function limbImpulseFromHistory(
  samples: LimbSample[],
  elapsedSec: number,
  out: LimbSample,
): LimbSample {
  if (samples.length < 2 || elapsedSec <= 1e-8) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  const a = samples[0]!;
  const b = samples[samples.length - 1]!;
  const inv = 1 / elapsedSec;
  out.x = (b.x - a.x) * inv;
  out.y = (b.y - a.y) * inv;
  out.z = 0;
  return out;
}

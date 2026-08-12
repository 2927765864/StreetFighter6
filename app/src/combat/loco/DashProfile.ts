/**
 * Dash horizontal profile: logic frames == movement frames (A=B).
 * Front-heavy formula: weight_i = (1 - t)^power, t from 0 at start to 1 at end,
 * then scale so sum(dx) = distance.
 */

/** Weights peaking at the start of the dash (前重后轻). */
export function frontHeavyWeights(frames: number, power: number): number[] {
  const n = Math.max(1, Math.floor(frames));
  const p = Math.max(0.05, power);
  const w: number[] = new Array(n);
  if (n === 1) {
    w[0] = 1;
    return w;
  }
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    w[i] = Math.pow(1 - t, p);
  }
  return w;
}

/** Scale weights so they sum to `distance` (always ≥0 magnitudes). */
export function normalizeDistanceProfile(
  weights: number[],
  distance: number,
): number[] {
  const dist = Math.max(0, distance);
  if (weights.length === 0) return [];
  let sum = 0;
  for (const x of weights) sum += Math.max(0, x);
  if (sum <= 1e-12) {
    const u = dist / weights.length;
    return weights.map(() => u);
  }
  return weights.map((x) => (Math.max(0, x) / sum) * dist);
}

/**
 * Per-frame |dx| for a dash segment.
 * @param power higher → more front-loaded (default 1.5)
 */
export function buildFrontHeavyDashDx(
  frames: number,
  distance: number,
  power = 1.5,
): number[] {
  return normalizeDistanceProfile(
    frontHeavyWeights(frames, power),
    distance,
  );
}

export function sumDx(dx: number[]): number {
  let s = 0;
  for (const v of dx) s += v;
  return s;
}

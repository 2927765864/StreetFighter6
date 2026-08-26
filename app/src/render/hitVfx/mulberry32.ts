/**
 * Mulberry32 PRNG — deterministic stream from a 32-bit seed.
 * Algorithm: https://github.com/cprosche/mulberry32
 * Do not use Math.random for hit VFX spawn paths (plan §0.3 / §12.4).
 */

export type Mulberry32 = {
  /** Uniform float in [0, 1). */
  next: () => number;
  float: () => number;
  range: (min: number, max: number) => number;
  int: (minInclusive: number, maxExclusive: number) => number;
  /** Current uint32 state (for tests). */
  state: () => number;
};

export function createMulberry32(seed: number): Mulberry32 {
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    float: next,
    range: (min, max) => min + next() * (max - min),
    int: (minInclusive, maxExclusive) => {
      const lo = Math.floor(minInclusive);
      const hi = Math.floor(maxExclusive);
      if (hi <= lo) return lo;
      return lo + Math.floor(next() * (hi - lo));
    },
    state: () => a >>> 0,
  };
}

/** Mix wall-clock into a uint32 seed when lock is off. */
export function ephemeralSeed(): number {
  const t =
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) | 0;
  return (Date.now() ^ (t * 0x9e3779b9)) >>> 0;
}

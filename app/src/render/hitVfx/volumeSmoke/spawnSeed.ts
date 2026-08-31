/**
 * Seeded spawn variation for hit smoke.
 * Same seed → same jitter. Use randomUint32() when "randomize each spawn" is on.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fresh 32-bit seed for "randomize each spawn". */
export function randomUint32(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! >>> 0;
  }
  return (Math.random() * 0x100000000) >>> 0;
}

export type SpawnVariation = {
  seed: number;
  noiseOffset: { x: number; y: number; z: number };
  timePhase: number;
  centerOffsetUVW: { x: number; y: number; z: number };
  radiusScale: number;
  impulseScale: number;
  swirlScale: number;
  densityScale: number;
  temperatureScale: number;
  seedRotationOffset: { x: number; y: number; z: number };
};

export function buildSpawnVariation(seed: number): SpawnVariation {
  const rng = mulberry32(seed >>> 0);
  const signed = (amp: number) => (rng() * 2 - 1) * amp;

  return {
    seed: seed >>> 0,
    noiseOffset: { x: signed(2.2), y: signed(2.2), z: signed(2.2) },
    timePhase: rng() * 48,
    centerOffsetUVW: {
      x: signed(0.035),
      y: signed(0.035),
      z: signed(0.035),
    },
    radiusScale: 1 + signed(0.12),
    impulseScale: 1 + signed(0.15),
    swirlScale: 1 + signed(0.2),
    densityScale: 1 + signed(0.1),
    temperatureScale: 1 + signed(0.1),
    seedRotationOffset: { x: signed(18), y: signed(18), z: signed(18) },
  };
}

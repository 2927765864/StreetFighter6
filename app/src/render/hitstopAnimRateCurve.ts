/**
 * Hitstop presentation rate curve: progress u∈[0,1] → rate∈[0,1].
 * Final playback rate = sample(curve, u) × hitstopAnimRate scale.
 */

export type HitstopAnimRateKey = {
  /** Normalized hitstop progress (0 = first frozen frame, 1 = end). */
  t: number;
  /** Presentation rate at t (0 = hard freeze, 1 = full speed). */
  v: number;
};

export function createDefaultHitstopAnimRateCurve(): HitstopAnimRateKey[] {
  return [
    { t: 0, v: 1 },
    { t: 1, v: 1 },
  ];
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Sort by t, clamp, drop non-finite; always ≥2 endpoints. */
export function normalizeHitstopAnimRateCurve(
  raw: unknown,
): HitstopAnimRateKey[] {
  const fallback = createDefaultHitstopAnimRateCurve();
  if (!Array.isArray(raw) || raw.length === 0) return fallback;

  const pts: HitstopAnimRateKey[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const t = typeof rec.t === 'number' ? rec.t : Number(rec.t);
    const v = typeof rec.v === 'number' ? rec.v : Number(rec.v);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    pts.push({ t: clamp01(t), v: clamp01(v) });
  }
  if (pts.length === 0) return fallback;

  pts.sort((a, b) => a.t - b.t || a.v - b.v);

  // Collapse identical t (keep last).
  const dedup: HitstopAnimRateKey[] = [];
  for (const p of pts) {
    const last = dedup[dedup.length - 1];
    if (last && Math.abs(last.t - p.t) < 1e-9) {
      last.v = p.v;
    } else {
      dedup.push({ t: p.t, v: p.v });
    }
  }

  if (dedup.length === 1) {
    const v = dedup[0]!.v;
    return [
      { t: 0, v },
      { t: 1, v },
    ];
  }
  return dedup;
}

/** Piecewise-linear sample; clamps u and extrapolates with endpoint values. */
export function sampleHitstopAnimRateCurve(
  curve: readonly HitstopAnimRateKey[] | null | undefined,
  u: number,
): number {
  const pts = normalizeHitstopAnimRateCurve(curve);
  const x = clamp01(u);
  if (x <= pts[0]!.t) return pts[0]!.v;
  const last = pts[pts.length - 1]!;
  if (x >= last.t) return last.v;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (x >= a.t && x <= b.t) {
      const span = b.t - a.t;
      if (span <= 1e-12) return b.v;
      const w = (x - a.t) / span;
      return a.v + w * (b.v - a.v);
    }
  }
  return last.v;
}

/**
 * Progress at the start of a frozen logic step (before timer decrement).
 * First frame of a D-frame hitstop → 0; last frozen step → (D-1)/D.
 */
export function hitstopProgress01(
  duration: number,
  timerBeforeDecrement: number,
): number {
  const d = Math.max(0, duration);
  if (d <= 0) return 0;
  const rem = Math.max(0, timerBeforeDecrement);
  return clamp01((d - rem) / d);
}

/**
 * Mean curve×scale rate over a present batch of hitstop ticks.
 * After the batch, `hitstopTimer === timerAfter`; ticks consumed were
 * timerBefore = timerAfter+ticks … timerAfter+1.
 */
export function averageHitstopAnimRateForTicks(
  hitstopPresentTicks: number,
  hitstopDuration: number,
  hitstopTimerAfter: number,
  curve: readonly HitstopAnimRateKey[] | null | undefined,
  hitstopAnimRateScale: number,
  clampRate: (r: number) => number,
): number {
  const ticks = Math.max(0, Math.floor(hitstopPresentTicks));
  if (ticks <= 0) return 0;
  const T = Math.max(0, hitstopTimerAfter);
  const scale = clampRate(hitstopAnimRateScale);
  let sum = 0;
  for (let i = 0; i < ticks; i++) {
    const timerBefore = T + ticks - i;
    const u = hitstopProgress01(hitstopDuration, timerBefore);
    sum += clampRate(sampleHitstopAnimRateCurve(curve, u) * scale);
  }
  return sum / ticks;
}

/**
 * Rate on the last frozen logic step (timerBefore === 1).
 * Used for the one-frame exit ease after hitstop ends.
 */
export function resolveHitstopExitAnimRate(
  hitstopDuration: number,
  curve: readonly HitstopAnimRateKey[] | null | undefined,
  hitstopAnimRateScale: number,
  clampRate: (r: number) => number,
): number {
  const d = Math.max(0, hitstopDuration);
  if (d <= 0) return 0;
  const u = hitstopProgress01(d, 1);
  return clampRate(sampleHitstopAnimRateCurve(curve, u) * clampRate(hitstopAnimRateScale));
}

/** One-frame bridge after hitstop: (exitRate + 1) / 2. */
export function hitstopExitEaseRate(exitHitstopRate: number): number {
  const a = Number.isFinite(exitHitstopRate) ? exitHitstopRate : 0;
  const clamped = Math.min(1, Math.max(0, a));
  return Math.min(1, Math.max(0, (clamped + 1) * 0.5));
}

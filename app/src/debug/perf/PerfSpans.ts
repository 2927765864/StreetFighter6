import {
  PERF_SEGMENT_IDS,
  type PerfSegmentId,
} from './perfTypes';

/** Wall-clock segment timer (gamestats-style begin/end). */
export class PerfSpans {
  private starts = new Map<PerfSegmentId, number>();
  private totals = emptyTotals();

  begin(id: PerfSegmentId, nowMs = performance.now()): void {
    this.starts.set(id, nowMs);
  }

  end(id: PerfSegmentId, nowMs = performance.now()): void {
    const start = this.starts.get(id);
    if (start == null) return;
    this.starts.delete(id);
    this.totals[id] += Math.max(0, nowMs - start);
  }

  /** Return per-segment ms for this present and clear. */
  flush(): Record<PerfSegmentId, number> {
    const out = { ...this.totals };
    this.totals = emptyTotals();
    this.starts.clear();
    return out;
  }
}

function emptyTotals(): Record<PerfSegmentId, number> {
  const o = {} as Record<PerfSegmentId, number>;
  for (const id of PERF_SEGMENT_IDS) o[id] = 0;
  return o;
}

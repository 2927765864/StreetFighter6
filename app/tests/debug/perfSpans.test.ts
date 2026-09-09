import { describe, expect, it } from 'vitest';
import { PerfSpans } from '../../src/debug/perf/PerfSpans';

describe('PerfSpans', () => {
  it('accumulates begin/end deltas per segment', () => {
    const spans = new PerfSpans();
    spans.begin('logic', 100);
    spans.end('logic', 103.5);
    spans.begin('render', 200);
    spans.end('render', 204);
    const flushed = spans.flush();
    expect(flushed.logic).toBeCloseTo(3.5, 5);
    expect(flushed.render).toBeCloseTo(4, 5);
    expect(flushed.syncView).toBe(0);
    expect(flushed.vfxCpu).toBe(0);
  });

  it('flush clears totals', () => {
    const spans = new PerfSpans();
    spans.begin('vfxCpu', 0);
    spans.end('vfxCpu', 10);
    spans.flush();
    expect(spans.flush().vfxCpu).toBe(0);
  });

  it('ignores end without begin', () => {
    const spans = new PerfSpans();
    spans.end('logic', 50);
    expect(spans.flush().logic).toBe(0);
  });
});

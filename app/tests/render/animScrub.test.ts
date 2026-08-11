import { describe, expect, it } from 'vitest';
import { logicFrameToClipTime } from '../../src/render/AnimScrub';

describe('logicFrameToClipTime', () => {
  it('uniform maps 0 and last frame into duration', () => {
    const d = 1.0;
    expect(logicFrameToClipTime(0, 10, d, 'uniform')).toBe(0);
    const last = logicFrameToClipTime(9, 10, d, 'uniform');
    expect(last).toBeGreaterThan(0.8);
    expect(last).toBeLessThan(d);
  });

  it('truncate uses 60Hz sample index', () => {
    const d = 1.0; // 60 samples
    expect(logicFrameToClipTime(0, 13, d, 'truncate')).toBe(0);
    expect(logicFrameToClipTime(30, 13, d, 'truncate')).toBeCloseTo(12 / 60, 5);
  });
});

import { describe, expect, it } from 'vitest';
import {
  logicFrameToClipTime,
  visualFrameToClipTime,
} from '../../src/render/AnimScrub';

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

describe('visualFrameToClipTime §3.7.1', () => {
  it('maps 5LK-style timeline: logic 18 then residual toward 48', () => {
    const d = 48 / 60; // 0.8s
    expect(visualFrameToClipTime(0, d)).toBe(0);
    expect(visualFrameToClipTime(17, d)).toBeCloseTo(17 / 60, 5);
    expect(visualFrameToClipTime(18, d)).toBeCloseTo(18 / 60, 5);
    expect(visualFrameToClipTime(47, d)).toBeCloseTo(47 / 60, 5);
  });
});


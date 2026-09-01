import { describe, expect, it } from 'vitest';
import {
  advanceFromTime,
  blendToWeight,
  blendWallDt,
  stepDualAdvanceClocks,
  wrapClipTime,
} from '../../src/combat/anim/PoseBlendMath';

describe('PoseBlendMath §3.11 dual-advance', () => {
  it('dual advances from start by authored advance seconds', () => {
    expect(advanceFromTime(1.0, 0.05, 2, 'dual')).toBeCloseTo(1.05, 6);
    expect(advanceFromTime(1.0, 0, 2, 'dual')).toBeCloseTo(1.0, 6);
  });

  it('dual clamps at clip end', () => {
    const end = 2 - 1e-4;
    expect(advanceFromTime(1.9, 0.5, 2, 'dual')).toBeCloseTo(end, 6);
  });

  it('dual wraps when wrapLoop is set (idle free-run old layer)', () => {
    expect(advanceFromTime(1.9, 0.3, 2, 'dual', true)).toBeCloseTo(0.2, 6);
  });

  it('wrapClipTime rings into duration-eps', () => {
    const end = 2 - 1e-4;
    expect(wrapClipTime(0, 2)).toBe(0);
    expect(wrapClipTime(2.25, 2)).toBeCloseTo(0.25, 6);
    expect(wrapClipTime(2, 2)).toBeCloseTo(0, 6);
    expect(wrapClipTime(-0.1, 2)).toBeCloseTo(1.9, 6);
    expect(wrapClipTime(end, 2)).toBeCloseTo(end, 6);
  });

  it('freeze ignores advanced seconds', () => {
    expect(advanceFromTime(1.2, 0.5, 2, 'freeze')).toBeCloseTo(1.2, 6);
    expect(advanceFromTime(1.2, 99, 2, 'freeze')).toBeCloseTo(1.2, 6);
  });

  it('blendWallDt caps spikes', () => {
    expect(blendWallDt(0.05)).toBe(0.05);
    expect(blendWallDt(1)).toBe(0.1);
    expect(blendWallDt(-1)).toBe(0);
  });

  it('blendToWeight smoothstep ends at 0 and 1', () => {
    expect(blendToWeight(0, 0.1)).toBe(0);
    expect(blendToWeight(0.1, 0.1)).toBe(1);
    expect(blendToWeight(0.05, 0.1)).toBeCloseTo(0.5, 5);
  });

  it('stepDualAdvanceClocks: weight on wall, clip on logicSteps/60', () => {
    const base = {
      toFreeRun: true as const,
      mode: 'dual' as const,
    };
    // logicFps=30 on ~60Hz display: wall 1/60, often 0 logic steps this rAF
    const frozen = stepDualAdvanceClocks(1 / 60, 0, {
      elapsed: 0,
      fromAdvancedSec: 0,
      toAdvancedSec: 0,
      ...base,
    });
    expect(frozen.elapsed).toBeCloseTo(1 / 60, 6);
    expect(frozen.fromAdvancedSec).toBe(0);
    expect(frozen.toAdvancedSec).toBe(0);

    // Next rAF consumes one logic step → authored 1/60 of clip
    const stepped = stepDualAdvanceClocks(1 / 60, 1 / 60, {
      ...frozen,
      ...base,
    });
    expect(stepped.elapsed).toBeCloseTo(2 / 60, 6);
    expect(stepped.fromAdvancedSec).toBeCloseTo(1 / 60, 6);
    expect(stepped.toAdvancedSec).toBeCloseTo(1 / 60, 6);
  });

  it('stepDualAdvanceClocks: freeze mode does not advance from clip', () => {
    const next = stepDualAdvanceClocks(1 / 60, 1 / 60, {
      elapsed: 0,
      fromAdvancedSec: 0,
      toAdvancedSec: 0,
      toFreeRun: false,
      mode: 'freeze',
    });
    expect(next.fromAdvancedSec).toBe(0);
    expect(next.toAdvancedSec).toBe(0);
    expect(next.elapsed).toBeCloseTo(1 / 60, 6);
  });
});

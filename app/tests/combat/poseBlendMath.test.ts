import { describe, expect, it } from 'vitest';
import {
  advanceFromTime,
  blendToWeight,
  blendWallDt,
} from '../../src/combat/anim/PoseBlendMath';

describe('PoseBlendMath §3.11 dual-advance', () => {
  it('dual advances from start by wall clock', () => {
    expect(advanceFromTime(1.0, 0.05, 2, 'dual')).toBeCloseTo(1.05, 6);
    expect(advanceFromTime(1.0, 0, 2, 'dual')).toBeCloseTo(1.0, 6);
  });

  it('dual clamps at clip end', () => {
    const end = 2 - 1e-4;
    expect(advanceFromTime(1.9, 0.5, 2, 'dual')).toBeCloseTo(end, 6);
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
});

import { describe, expect, it } from 'vitest';
import {
  composeMotionUvOffset,
  createDefaultMotionBlurConfig,
  mergeMotionBlurConfig,
  motionBlurKindFromPhase,
  pickMotionBlurObjectScale,
  shouldHoldMotionBlurVelocity,
} from '../../src/config/motionBlur';
import { mergeConfig } from '../../src/config/store';
import { createDefaultRuntimeConfig } from '../../src/config/defaults';

describe('shouldHoldMotionBlurVelocity', () => {
  it('holds on paused freeze with no logic step', () => {
    expect(shouldHoldMotionBlurVelocity(true, 0)).toBe(true);
  });

  it('rebuilds on a paused frame-step', () => {
    expect(shouldHoldMotionBlurVelocity(true, 1)).toBe(false);
  });

  it('rebuilds while playing', () => {
    expect(shouldHoldMotionBlurVelocity(false, 0)).toBe(false);
  });
});

describe('composeMotionUvOffset', () => {
  it('keeps object motion when camera scale is 0', () => {
    const o = composeMotionUvOffset(0.2, 0, 0.05, 0, 1, 0, 1);
    expect(o.x).toBeCloseTo(0.075, 6);
    expect(o.y).toBe(0);
  });

  it('keeps only scaled camera motion when object scale is 0', () => {
    const o = composeMotionUvOffset(0.2, 0, 0.2, 0, 0, 0.1, 1);
    expect(o.x).toBeCloseTo(0.01, 6);
  });

  it('clamps UV radius', () => {
    const o = composeMotionUvOffset(2, 0, 0, 0, 1, 0, 0.05);
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(0.05, 6);
  });
});

describe('mergeMotionBlurConfig', () => {
  it('clamps samples and scales', () => {
    const out = mergeMotionBlurConfig(createDefaultMotionBlurConfig(), {
      samples: 99,
      cameraScale: -1,
      objectScale: 8,
    });
    expect(out.samples).toBe(16);
    expect(out.cameraScale).toBe(0);
    expect(out.objectScale).toBe(2);
    expect(out.moveScale).toBe(2);
    expect(out.attackScale).toBe(2);
  });

  it('splits moveScale and attackScale independently', () => {
    const out = mergeMotionBlurConfig(createDefaultMotionBlurConfig(), {
      moveScale: 0.2,
      attackScale: 1.5,
    });
    expect(out.moveScale).toBe(0.2);
    expect(out.attackScale).toBe(1.5);
  });

  it('clamps debugView', () => {
    const out = mergeMotionBlurConfig(createDefaultMotionBlurConfig(), {
      debugView: 9,
    });
    expect(out.debugView).toBe(2);
  });
});

describe('mergeConfig motionBlur', () => {
  it('merges nested motionBlur onto factory defaults', () => {
    const out = mergeConfig(createDefaultRuntimeConfig(), {
      motionBlur: { enabled: false, cameraScale: 0.05 },
    });
    expect(out.motionBlur.enabled).toBe(false);
    expect(out.motionBlur.cameraScale).toBe(0.05);
    expect(out.motionBlur.objectScale).toBe(0.8);
    expect(out.motionBlur.moveScale).toBe(0.8);
    expect(out.motionBlur.attackScale).toBe(0.8);
  });
});

describe('pickMotionBlurObjectScale', () => {
  it('uses attack scale only in attack phase', () => {
    const cfg = { moveScale: 0.2, attackScale: 1.4 };
    expect(pickMotionBlurObjectScale(motionBlurKindFromPhase('walk'), cfg)).toBe(
      0.2,
    );
    expect(pickMotionBlurObjectScale(motionBlurKindFromPhase('dash'), cfg)).toBe(
      0.2,
    );
    expect(
      pickMotionBlurObjectScale(motionBlurKindFromPhase('attack'), cfg),
    ).toBe(1.4);
    expect(
      pickMotionBlurObjectScale(motionBlurKindFromPhase('hitstun'), cfg),
    ).toBe(1.4);
  });
});

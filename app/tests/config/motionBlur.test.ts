import { describe, expect, it } from 'vitest';
import {
  localBlurExposureScale,
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

describe('local exposure', () => {
  it('gives the same trail for the same speed at 30, 60 and 120 Hz', () => {
    for (const fps of [30, 60, 120]) {
      const frameTravel = 120 / fps;
      expect(frameTravel * localBlurExposureScale(20, 1 / fps)).toBeCloseTo(1.56);
    }
  });
  it('zero exposure and invalid time produce no travel', () => {
    expect(localBlurExposureScale(0, 1 / 60)).toBe(0);
    expect(localBlurExposureScale(20, 0)).toBe(0);
    expect(localBlurExposureScale(20, NaN)).toBe(0);
  });
});

describe('mergeMotionBlurConfig', () => {
  it('clamps samples and scales', () => {
    const out = mergeMotionBlurConfig(createDefaultMotionBlurConfig(), {
      samples: 99,
      cameraScale: -1,
      objectScale: 8,
    });
    expect(out.samples).toBe(32);
    expect(out.cameraScale).toBe(0);
    expect(out).not.toHaveProperty('objectScale');
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

  it('clamps local controls and ignores non-finite values', () => {
    const out = mergeMotionBlurConfig(createDefaultMotionBlurConfig(), {
      exposureMs: 90, centerWeight: -1, neighborRadiusPx: Infinity, minSpeedPx: NaN,
    });
    expect(out.exposureMs).toBe(50);
    expect(out.centerWeight).toBe(0.1);
    expect(out.neighborRadiusPx).toBe(13);
    expect(out.minSpeedPx).toBe(0.5);
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
    expect(out.motionBlur.exposureMs).toBe(16.67);
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

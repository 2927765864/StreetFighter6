import { describe, expect, it } from 'vitest';
import { createMulberry32 } from '../../src/render/hitVfx/mulberry32';
import {
  layerRandomRotationKey,
  layerRotationRad,
  normalizedRandomRotationRange,
  sampleLayerRotationJitterDeg,
} from '../../src/hitVfxEditor/flipbook2d/layerRotation';

describe('layerRotation', () => {
  it('combines authored degrees with jitter into radians', () => {
    expect(layerRotationRad({ rotation: 90 }, 0)).toBeCloseTo(Math.PI / 2, 6);
    expect(layerRotationRad({ rotation: 0 }, 45)).toBeCloseTo(Math.PI / 4, 6);
    expect(layerRotationRad({ rotation: 10 }, -10)).toBeCloseTo(0, 6);
  });

  it('returns 0 jitter when random is off or range is 0..0', () => {
    const rng = createMulberry32(1);
    expect(
      sampleLayerRotationJitterDeg(
        {
          randomRotation: false,
          randomRotationMinDeg: -30,
          randomRotationMaxDeg: 30,
        },
        rng,
      ),
    ).toBe(0);
    expect(
      sampleLayerRotationJitterDeg(
        {
          randomRotation: true,
          randomRotationMinDeg: 0,
          randomRotationMaxDeg: 0,
        },
        rng,
      ),
    ).toBe(0);
  });

  it('samples within [min, max] and swaps inverted bounds', () => {
    expect(
      normalizedRandomRotationRange({
        randomRotationMinDeg: 20,
        randomRotationMaxDeg: -10,
      }),
    ).toEqual({ min: -10, max: 20 });

    const rng = createMulberry32(42);
    for (let i = 0; i < 40; i += 1) {
      const j = sampleLayerRotationJitterDeg(
        {
          randomRotation: true,
          randomRotationMinDeg: 5,
          randomRotationMaxDeg: 25,
        },
        rng,
      );
      expect(j).toBeGreaterThanOrEqual(5);
      expect(j).toBeLessThanOrEqual(25);
    }
  });

  it('changes fingerprint when random controls change', () => {
    expect(
      layerRandomRotationKey({
        rotation: 0,
        randomRotation: false,
        randomRotationMinDeg: -15,
        randomRotationMaxDeg: 15,
      }),
    ).toBe('off');
    expect(
      layerRandomRotationKey({
        rotation: 0,
        randomRotation: true,
        randomRotationMinDeg: -15,
        randomRotationMaxDeg: 15,
      }),
    ).toBe('on:-15:15');
    expect(
      layerRandomRotationKey({
        rotation: 0,
        randomRotation: true,
        randomRotationMinDeg: 0,
        randomRotationMaxDeg: 30,
      }),
    ).toBe('on:0:30');
  });
});

import { describe, expect, it } from 'vitest';
import {
  cloudShadowEnvelope,
  createDefaultHitCloudShadowParams,
  hitCloudShadowParamsFromConfig,
  jitteredSpokeAngles,
  resolveHitCloudShadowStrengthParams,
  spokeAdjacentGaps,
} from '../../src/render/HitCloudShadowFx';

describe('HitCloudShadowFx helpers', () => {
  it('resolves L < M < H for radius, intensity, and duration', () => {
    const p = createDefaultHitCloudShadowParams();
    const L = resolveHitCloudShadowStrengthParams(p, 'L');
    const M = resolveHitCloudShadowStrengthParams(p, 'M');
    const H = resolveHitCloudShadowStrengthParams(p, 'H');
    expect(L.maxRadius).toBeLessThan(M.maxRadius);
    expect(M.maxRadius).toBeLessThan(H.maxRadius);
    expect(L.intensity).toBeLessThan(M.intensity);
    expect(M.intensity).toBeLessThan(H.intensity);
    expect(L.duration).toBeLessThan(M.duration);
    expect(M.duration).toBeLessThan(H.duration);
  });

  it('envelope peaks at t=0 then shrinks and fades', () => {
    const a = cloudShadowEnvelope(0);
    const mid = cloudShadowEnvelope(0.5);
    const end = cloudShadowEnvelope(1);
    expect(a.radiusT).toBe(1);
    expect(a.intensityT).toBe(1);
    expect(mid.radiusT).toBeCloseTo(0.25, 5);
    expect(mid.intensityT).toBeCloseTo(0.25, 5);
    expect(end.radiusT).toBe(0);
    expect(end.intensityT).toBe(0);
  });

  it('keeps equal adjacent gaps when spacingNoise is 0', () => {
    const angles = jitteredSpokeAngles(6, 0, 42);
    const gaps = spokeAdjacentGaps(angles);
    const expected = (Math.PI * 2) / 6;
    for (const g of gaps) {
      expect(g).toBeCloseTo(expected, 5);
    }
  });

  it('makes adjacent gaps unequal when spacingNoise is high', () => {
    const angles = jitteredSpokeAngles(6, 1, 42);
    const gaps = spokeAdjacentGaps(angles);
    const minG = Math.min(...gaps);
    const maxG = Math.max(...gaps);
    expect(maxG - minG).toBeGreaterThan(0.2);
  });

  it('changes gap pattern across seeds (not the same every trigger)', () => {
    const gapsA = spokeAdjacentGaps(jitteredSpokeAngles(6, 0.65, 1));
    const gapsB = spokeAdjacentGaps(jitteredSpokeAngles(6, 0.65, 2));
    const gapsC = spokeAdjacentGaps(jitteredSpokeAngles(6, 0.65, 99991));
    const key = (g: number[]) => g.map((x) => x.toFixed(4)).join(',');
    // At least two of three seeds should disagree — proves per-trigger variety.
    const keys = new Set([key(gapsA), key(gapsB), key(gapsC)]);
    expect(keys.size).toBeGreaterThan(1);
  });

  it('maps flat config fields into params', () => {
    const params = hitCloudShadowParamsFromConfig({
      hitCloudShadowEnabled: false,
      hitCloudShadowMaxConcurrent: 2,
      hitCloudShadowSpokeCount: 8,
      hitCloudShadowSpokeWidth: 0.3,
      hitCloudShadowSpokeSpacingNoise: 0.6,
      hitCloudShadowHardness: 3,
      hitCloudShadowNoiseAmount: 0.5,
      hitCloudShadowColor: 0x112233,
      hitCloudShadowDurationL: 0.08,
      hitCloudShadowDurationM: 0.12,
      hitCloudShadowDurationH: 0.18,
      hitCloudShadowMaxRadiusL: 0.08,
      hitCloudShadowMaxRadiusM: 0.12,
      hitCloudShadowMaxRadiusH: 0.18,
      hitCloudShadowIntensityL: 0.4,
      hitCloudShadowIntensityM: 0.55,
      hitCloudShadowIntensityH: 0.7,
    });
    expect(params.enabled).toBe(false);
    expect(params.maxConcurrent).toBe(2);
    expect(params.spokeCount).toBe(8);
    expect(params.spokeWidth).toBe(0.3);
    expect(params.spokeSpacingNoise).toBe(0.6);
    expect(params.noiseAmount).toBe(0.5);
    expect(params.color).toBe(0x112233);
    expect(params.durationH).toBe(0.18);
    expect(params.intensityM).toBe(0.55);
  });
});

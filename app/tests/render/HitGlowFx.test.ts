import { describe, expect, it } from 'vitest';
import {
  createDefaultHitGlowParams,
  glowEnvelope,
  hitGlowParamsFromConfig,
  resolveHitGlowStrengthParams,
} from '../../src/render/HitGlowFx';

describe('HitGlowFx helpers', () => {
  it('resolves L < M < H for radius, intensity, and duration', () => {
    const p = createDefaultHitGlowParams();
    const L = resolveHitGlowStrengthParams(p, 'L');
    const M = resolveHitGlowStrengthParams(p, 'M');
    const H = resolveHitGlowStrengthParams(p, 'H');
    expect(L.maxRadius).toBeLessThan(M.maxRadius);
    expect(M.maxRadius).toBeLessThan(H.maxRadius);
    expect(L.intensity).toBeLessThan(M.intensity);
    expect(M.intensity).toBeLessThan(H.intensity);
    expect(L.duration).toBeLessThan(M.duration);
    expect(M.duration).toBeLessThan(H.duration);
  });

  it('envelope peaks at t=0 then shrinks and fades', () => {
    const a = glowEnvelope(0);
    const mid = glowEnvelope(0.5);
    const end = glowEnvelope(1);
    expect(a.radiusT).toBe(1);
    expect(a.intensityT).toBe(1);
    expect(mid.radiusT).toBeLessThan(a.radiusT);
    expect(mid.intensityT).toBeLessThan(a.intensityT);
    expect(mid.radiusT).toBeCloseTo(0.25, 5);
    expect(mid.intensityT).toBeCloseTo(0.25, 5);
    expect(end.radiusT).toBe(0);
    expect(end.intensityT).toBe(0);
  });

  it('maps flat config fields into params', () => {
    const params = hitGlowParamsFromConfig({
      hitGlowEnabled: false,
      hitGlowMaxConcurrent: 2,
      hitGlowHardness: 3,
      hitGlowColor: 0xffaa00,
      hitGlowDurationL: 0.08,
      hitGlowDurationM: 0.12,
      hitGlowDurationH: 0.18,
      hitGlowMaxRadiusL: 0.05,
      hitGlowMaxRadiusM: 0.08,
      hitGlowMaxRadiusH: 0.12,
      hitGlowIntensityL: 0.7,
      hitGlowIntensityM: 1.0,
      hitGlowIntensityH: 1.3,
    });
    expect(params.enabled).toBe(false);
    expect(params.maxConcurrent).toBe(2);
    expect(params.hardness).toBe(3);
    expect(params.color).toBe(0xffaa00);
    expect(params.durationH).toBe(0.18);
    expect(params.intensityM).toBe(1.0);
    expect(params.maxRadiusL).toBe(0.05);
  });
});

import { describe, expect, it } from 'vitest';
import {
  createDefaultHitShockwaveParams,
  hitShockwaveParamsFromConfig,
  ndcToWebgpuScreenUV,
  resolveHitShockwaveStrengthParams,
  shockwaveEnvelope,
} from '../../src/render/HitShockwaveFx';

describe('HitShockwaveFx helpers', () => {
  it('resolves L < M < H for radius and amplitude', () => {
    const p = createDefaultHitShockwaveParams();
    const L = resolveHitShockwaveStrengthParams(p, 'L');
    const M = resolveHitShockwaveStrengthParams(p, 'M');
    const H = resolveHitShockwaveStrengthParams(p, 'H');
    expect(L.maxRadius).toBeLessThan(M.maxRadius);
    expect(M.maxRadius).toBeLessThan(H.maxRadius);
    expect(L.amplitude).toBeLessThan(M.amplitude);
    expect(M.amplitude).toBeLessThan(H.amplitude);
    expect(L.duration).toBeLessThan(M.duration);
    expect(M.duration).toBeLessThan(H.duration);
  });

  it('envelope expands and fades amplitude', () => {
    const a = shockwaveEnvelope(0);
    const mid = shockwaveEnvelope(0.4);
    const end = shockwaveEnvelope(1);
    expect(a.radiusT).toBe(0);
    expect(a.ampT).toBe(0);
    expect(mid.radiusT).toBeGreaterThan(0.5);
    expect(mid.ampT).toBeGreaterThan(0.5);
    expect(end.radiusT).toBe(1);
    expect(end.ampT).toBe(0);
  });

  it('maps NDC to WebGPU screenUV (y=0 at top)', () => {
    // NDC top-center → screenUV near top (small v)
    expect(ndcToWebgpuScreenUV(0, 1)).toEqual({ u: 0.5, v: 0 });
    // NDC bottom-center → screenUV near bottom (large v)
    expect(ndcToWebgpuScreenUV(0, -1)).toEqual({ u: 0.5, v: 1 });
    // NDC center
    expect(ndcToWebgpuScreenUV(0, 0)).toEqual({ u: 0.5, v: 0.5 });
    // NDC right
    expect(ndcToWebgpuScreenUV(1, 0)).toEqual({ u: 1, v: 0.5 });
  });

  it('maps flat config fields into params', () => {
    const params = hitShockwaveParamsFromConfig({
      hitShockwaveEnabled: false,
      hitShockwaveMaxConcurrent: 2,
      hitShockwaveThickness: 0.05,
      hitShockwaveDurationL: 0.1,
      hitShockwaveDurationM: 0.2,
      hitShockwaveDurationH: 0.3,
      hitShockwaveMaxRadiusL: 0.1,
      hitShockwaveMaxRadiusM: 0.2,
      hitShockwaveMaxRadiusH: 0.3,
      hitShockwaveAmplitudeL: 0.01,
      hitShockwaveAmplitudeM: 0.02,
      hitShockwaveAmplitudeH: 0.03,
    });
    expect(params.enabled).toBe(false);
    expect(params.maxConcurrent).toBe(2);
    expect(params.durationH).toBe(0.3);
    expect(params.amplitudeM).toBe(0.02);
  });
});

import { describe, expect, it } from 'vitest';
import {
  resolveWudaEllipseShape,
  resolveWudaEllipseShapeFromIndex,
  sampleWudaFreeSize,
  wudaFreeSizeOverLife,
  wudaHash01,
} from '../../src/render/wudaParticle/wudaParticleShape';

describe('wudaParticleShape', () => {
  it('hashes stably in 0..1', () => {
    const a = wudaHash01(3, 1);
    const b = wudaHash01(3, 1);
    const c = wudaHash01(4, 1);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(c).not.toBe(a);
  });

  it('maps jitter 0 to circle aspect', () => {
    const s = resolveWudaEllipseShape(0.9, 0.25, 0);
    expect(s.aspect).toBeCloseTo(1);
    expect(s.spin).toBeCloseTo(Math.PI * 0.5);
  });

  it('varies aspect with jitter and index', () => {
    const a = resolveWudaEllipseShapeFromIndex(0, 7, 0.4);
    const b = resolveWudaEllipseShapeFromIndex(1, 7, 0.4);
    expect(a.aspect).toBeGreaterThanOrEqual(0.6);
    expect(a.aspect).toBeLessThanOrEqual(1.4);
    expect(a.aspect !== b.aspect || a.spin !== b.spin).toBe(true);
  });

  it('samples free size inside min/max regardless of order', () => {
    expect(sampleWudaFreeSize(0, 0.01, 0.02)).toBeCloseTo(0.01);
    expect(sampleWudaFreeSize(1, 0.01, 0.02)).toBeCloseTo(0.02);
    expect(sampleWudaFreeSize(0.5, 0.02, 0.01)).toBeCloseTo(0.015);
  });

  it('fades free size over life with prior curve', () => {
    expect(wudaFreeSizeOverLife(0.01, 1)).toBeCloseTo(0.01);
    expect(wudaFreeSizeOverLife(0.01, 0)).toBeCloseTo(0.0035);
  });
});

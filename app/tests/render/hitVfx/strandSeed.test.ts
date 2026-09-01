import { describe, expect, it } from 'vitest';
import {
  defaultVolumeSmokeParams,
  normalizeVolumeSmokeParams,
} from '../../../src/render/hitVfx/hitVfxTypes';
import {
  MAX_STRANDS,
  buildStrandSet,
  enforceMinStrandRadii,
  minStrandCoverRadiusUVW,
  minStrandRadiusUVW,
  packStrandsToBuffer,
  sampleStrandPolyline,
  strandDensMulForThickness,
  strandTubeWeight,
  type StrandSeedParams,
} from '../../../src/render/hitVfx/volumeSmoke/strandSeed';

function strandParams(
  overrides: Partial<StrandSeedParams> = {},
): StrandSeedParams {
  const d = defaultVolumeSmokeParams();
  return {
    strandMode: true,
    strandCount: d.strandCount,
    strandLength: d.strandLength,
    strandThickness: d.strandThickness,
    strandSpacing: d.strandSpacing,
    strandTwistDeg: d.strandTwistDeg,
    strandAngleJitterDeg: d.strandAngleJitterDeg,
    strandBend: d.strandBend,
    strandEdgeSoftness: d.strandEdgeSoftness,
    strandGapFill: d.strandGapFill,
    strandRandomAmount: d.strandRandomAmount,
    seedShape: d.seedShape,
    shapeThickness: d.shapeThickness,
    ringRadiusRatio: d.ringRadiusRatio,
    ringWidth: d.ringWidth,
    arcAngle: d.arcAngle,
    arrowAngle: d.arrowAngle,
    arrowLength: d.arrowLength,
    columnHeight: d.columnHeight,
    ...overrides,
  };
}

const baseArgs = {
  spawnSeed: 42,
  centerUVW: { x: 0.5, y: 0.5, z: 0.5 },
  hitRadiusUVW: 0.12,
  axis: { x: 0, y: 1, z: 0 },
  tangent: { x: 1, y: 0, z: 0 },
};

describe('strandSeed', () => {
  it('returns empty when strandMode is off', () => {
    expect(
      buildStrandSet({
        ...baseArgs,
        params: strandParams({ strandMode: false }),
      }),
    ).toEqual([]);
  });

  it('is deterministic for the same seed and params', () => {
    const params = strandParams({ seedShape: 'sphere', strandCount: 6 });
    const a = buildStrandSet({ ...baseArgs, params, spawnSeed: 99 });
    const b = buildStrandSet({ ...baseArgs, params, spawnSeed: 99 });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(MAX_STRANDS);
  });

  it('changes layout when spawnSeed changes', () => {
    const params = strandParams({ strandCount: 8, strandRandomAmount: 1 });
    const a = buildStrandSet({ ...baseArgs, params, spawnSeed: 1 });
    const b = buildStrandSet({ ...baseArgs, params, spawnSeed: 2 });
    expect(a).not.toEqual(b);
  });

  it('keeps strand midpoints near the shell for sphere', () => {
    const strands = buildStrandSet({
      ...baseArgs,
      params: strandParams({
        seedShape: 'sphere',
        strandCount: 10,
        strandSpacing: 0.25,
        strandRandomAmount: 0,
      }),
    });
    const r = baseArgs.hitRadiusUVW;
    for (const s of strands) {
      for (const p of [s.p0, s.p1, s.p2]) {
        const dx = p.x - 0.5;
        const dy = p.y - 0.5;
        const dz = p.z - 0.5;
        const dist = Math.hypot(dx, dy, dz);
        expect(dist).toBeLessThan(r * 2.2);
      }
    }
  });

  it('places ring strands near the ring peak radius', () => {
    const params = strandParams({
      seedShape: 'ring',
      strandCount: 8,
      ringRadiusRatio: 0.7,
      strandRandomAmount: 0,
      strandSpacing: 0.1,
    });
    const strands = buildStrandSet({ ...baseArgs, params });
    const peak = 0.7 * baseArgs.hitRadiusUVW;
    for (const s of strands) {
      const mid = sampleStrandPolyline(s, 2)[1]!;
      const dx = mid.x - 0.5;
      const dz = mid.z - 0.5;
      const rho = Math.hypot(dx, dz);
      expect(rho).toBeGreaterThan(peak * 0.35);
      expect(rho).toBeLessThan(peak * 1.8);
    }
  });

  it('arc strands span the full arc angle, not a tip cluster', () => {
    const arcDeg = 140;
    const strands = buildStrandSet({
      ...baseArgs,
      params: strandParams({
        seedShape: 'arc',
        arcAngle: arcDeg,
        strandCount: 6,
        ringRadiusRatio: 0.7,
        ringWidth: 0.22,
        shapeThickness: 0.28,
        strandRandomAmount: 0,
        strandSpacing: 0.22,
        strandBend: 0.2,
        strandLength: 0.85,
      }),
    });
    const half = (arcDeg * 0.5 * Math.PI) / 180;
    const angs: number[] = [];
    for (const s of strands) {
      const mid = sampleStrandPolyline(s, 2)[1]!;
      const dx = mid.x - 0.5;
      const dz = mid.z - 0.5;
      // local +X = tangent, +Z = bitangent → atan2(z, x)
      const ang = Math.atan2(dz, dx);
      angs.push(ang);
      expect(Math.abs(ang)).toBeLessThan(half * 1.15);
    }
    // Margins trim ~12% of the full arc; still must cover most of the opening.
    expect(Math.max(...angs) - Math.min(...angs)).toBeGreaterThan(half * 1.4);
  });

  it('arc strands follow a large ringRadiusRatio (same as the gizmo)', () => {
    const hitR = 1;
    const peakRatio = 2.8;
    const strands = buildStrandSet({
      spawnSeed: 1,
      centerUVW: { x: 0, y: 0, z: 0 },
      hitRadiusUVW: hitR,
      axis: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      params: strandParams({
        seedShape: 'arc',
        arcAngle: 140,
        strandCount: 6,
        ringRadiusRatio: peakRatio,
        ringWidth: 0.3,
        shapeThickness: 0.3,
        strandRandomAmount: 0,
        strandBend: 0.2,
      }),
    });
    const peak = peakRatio * hitR;
    for (const s of strands) {
      const mid = sampleStrandPolyline(s, 2)[1]!;
      const rho = Math.hypot(mid.x, mid.z);
      expect(rho).toBeGreaterThan(peak * 0.7);
      expect(rho).toBeLessThan(peak * 1.3);
    }
  });

  it('arc strand polylines stay on the tube, not in the hole', () => {
    const hitR = 1;
    const peakRatio = 0.7;
    const strands = buildStrandSet({
      spawnSeed: 3,
      centerUVW: { x: 0, y: 0, z: 0 },
      hitRadiusUVW: hitR,
      axis: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      params: strandParams({
        seedShape: 'arc',
        arcAngle: 140,
        strandCount: 6,
        ringRadiusRatio: peakRatio,
        ringWidth: 0.22,
        shapeThickness: 0.28,
        strandRandomAmount: 0,
        strandBend: 0.4,
        strandLength: 0.85,
      }),
    });
    const peak = peakRatio * hitR;
    for (const s of strands) {
      for (const pt of sampleStrandPolyline(s, 8)) {
        const rho = Math.hypot(pt.x, pt.z);
        expect(rho).toBeGreaterThan(peak * 0.45);
        expect(rho).toBeLessThan(peak * 1.55);
      }
    }
  });

  it('builds for every seed shape without throwing', () => {
    const shapes = [
      'sphere',
      'disk',
      'ring',
      'arc',
      'arrow',
      'column',
    ] as const;
    for (const seedShape of shapes) {
      const strands = buildStrandSet({
        ...baseArgs,
        params: strandParams({ seedShape, strandCount: 5 }),
      });
      expect(strands.length).toBeGreaterThan(0);
      expect(sampleStrandPolyline(strands[0]!, 5).length).toBe(6);
    }
  });

  it('packs into a fixed-size float buffer', () => {
    const strands = buildStrandSet({
      ...baseArgs,
      params: strandParams({ strandCount: 3 }),
    });
    const buf = packStrandsToBuffer(strands);
    expect(buf.length).toBe(MAX_STRANDS * 16);
    expect(buf[0]).not.toBe(0);
  });

  it('keeps authored thin radii (no fat survival clamp on r0/rMid/r1)', () => {
    const minR = minStrandRadiusUVW(48);
    const legacyFloor = (1 / 48) * 1.75;
    expect(minR).toBeLessThan((1 / 48) * 0.1);
    const strands = buildStrandSet({
      ...baseArgs,
      params: strandParams({
        strandCount: 4,
        strandThickness: 0.01,
        strandRandomAmount: 0,
      }),
    });
    enforceMinStrandRadii(strands, minR);
    for (const s of strands) {
      // Requested mid ≈ 0.01 * hitRadiusUVW (=0.0012), not raised to ~1 voxel.
      expect(s.rMid).toBeLessThan(0.01);
      expect(s.rMid).toBeLessThan(legacyFloor * 0.5);
      expect(s.r0).toBeGreaterThanOrEqual(minR);
    }
  });

  it('cover ribbon hits the grid for sub-voxel rArt without soft-fat tails', () => {
    const texel = 1 / 48;
    const rArt = texel * 0.05;
    // On-curve / near center: strong
    expect(strandTubeWeight(0, rArt, 48)).toBeGreaterThan(0.9);
    expect(strandTubeWeight(texel * 0.2, rArt, 48)).toBeGreaterThan(0.5);
    // Beyond cover outer edge: ~0 (no soft Gaussian bloom)
    expect(strandTubeWeight(texel * 0.9, rArt, 48)).toBeLessThan(0.05);
    // Thick artistic radius: cover stays off; weight follows Gaussian
    const rThick = texel * 1.2;
    expect(strandTubeWeight(texel * 0.9, rThick, 48)).toBeGreaterThan(
      strandTubeWeight(texel * 0.9, rArt, 48),
    );
    expect(minStrandCoverRadiusUVW(48)).toBeCloseTo(texel * 0.68, 6);
  });

  it('boosts densMul for thin strandThickness', () => {
    const thick = strandDensMulForThickness(0.18, 0.12, 48);
    const thin = strandDensMulForThickness(0.01, 0.12, 48);
    expect(thin).toBeGreaterThan(thick);
    expect(thick).toBeCloseTo(1.35, 2);
    expect(thin).toBeLessThanOrEqual(1.35 * 3.5);
  });

  it('disk honors tiny strandLength (no along-layer cover stretch)', () => {
    const strands = buildStrandSet({
      ...baseArgs,
      params: strandParams({
        seedShape: 'disk',
        strandCount: 4,
        strandLength: 0.04,
        strandSpacing: 0.22,
        strandRandomAmount: 0,
        strandBend: 0,
      }),
    });
    for (const s of strands) {
      const pts = sampleStrandPolyline(s, 4);
      const a = pts[0]!;
      const b = pts[pts.length - 1]!;
      const len = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      expect(len).toBeLessThan(baseArgs.hitRadiusUVW * 0.12);
    }
  });

  it('column strandLength slider changes rope length (not locked to layer gap)', () => {
    const short = buildStrandSet({
      ...baseArgs,
      params: strandParams({
        seedShape: 'column',
        columnHeight: 1.6,
        strandCount: 8,
        strandLength: 0.2,
        strandSpacing: 0.22,
        strandRandomAmount: 0,
        strandBend: 0,
      }),
    });
    const long = buildStrandSet({
      ...baseArgs,
      params: strandParams({
        seedShape: 'column',
        columnHeight: 1.6,
        strandCount: 8,
        strandLength: 1.2,
        strandSpacing: 0.22,
        strandRandomAmount: 0,
        strandBend: 0,
      }),
    });
    const chord = (s: (typeof short)[0]) =>
      Math.hypot(s.p2.x - s.p0.x, s.p2.y - s.p0.y, s.p2.z - s.p0.z);
    const shortMean =
      short.reduce((a, s) => a + chord(s), 0) / Math.max(1, short.length);
    const longMean =
      long.reduce((a, s) => a + chord(s), 0) / Math.max(1, long.length);
    expect(longMean).toBeGreaterThan(shortMean * 2.5);
  });

  it('spreads column strands along the axis, not a single mid-plane', () => {
    const strands = buildStrandSet({
      ...baseArgs,
      params: strandParams({
        seedShape: 'column',
        columnHeight: 1.6,
        strandCount: 8,
        strandSpacing: 0.22,
        strandRandomAmount: 0,
        strandLength: 0.4,
      }),
    });
    const axisDots = strands.map((s) => {
      const mid = sampleStrandPolyline(s, 2)[1]!;
      return mid.y - 0.5; // axis is +Y in baseArgs
    });
    const minA = Math.min(...axisDots);
    const maxA = Math.max(...axisDots);
    // Must occupy a meaningful fraction of column half-height (1.6 * r * 0.88)
    const expectHalf = 1.6 * baseArgs.hitRadiusUVW * 0.88;
    expect(maxA - minA).toBeGreaterThan(expectHalf * 0.55);
  });

  it('single strand at default bend stays rope-like, not a cup/C', () => {
    const strands = buildStrandSet({
      ...baseArgs,
      params: strandParams({
        seedShape: 'column',
        columnHeight: 1.4,
        strandCount: 1,
        strandRandomAmount: 0,
        strandBend: 0.55,
        strandLength: 0.85,
        strandAngleJitterDeg: 0,
      }),
    });
    expect(strands).toHaveLength(1);
    const s = strands[0]!;
    const chord = Math.hypot(
      s.p2.x - s.p0.x,
      s.p2.y - s.p0.y,
      s.p2.z - s.p0.z,
    );
    const mid = {
      x: (s.p0.x + s.p2.x) * 0.5,
      y: (s.p0.y + s.p2.y) * 0.5,
      z: (s.p0.z + s.p2.z) * 0.5,
    };
    const bulge = Math.hypot(
      s.p1.x - mid.x,
      s.p1.y - mid.y,
      s.p1.z - mid.z,
    );
    // Control-point offset ≪ half chord → gentle bow, not a parenthesis cup.
    expect(bulge).toBeLessThan(chord * 0.28);
  });

  it('arrow strands lie along the two gizmo arms and span arm length', () => {
    const arrowAngle = 70;
    const arrowLength = 1.2;
    const hitR = 1;
    const strands = buildStrandSet({
      spawnSeed: 7,
      centerUVW: { x: 0, y: 0, z: 0 },
      hitRadiusUVW: hitR,
      axis: { x: 0, y: 1, z: 0 },
      tangent: { x: 1, y: 0, z: 0 },
      params: strandParams({
        seedShape: 'arrow',
        arrowAngle,
        arrowLength,
        strandCount: 8,
        strandLength: 0.9,
        strandSpacing: 0.22,
        strandRandomAmount: 0,
        strandBend: 0.2,
        shapeThickness: 0.28,
        ringWidth: 0.22,
      }),
    });
    const half = (arrowAngle * 0.5 * Math.PI) / 180;
    const c = Math.cos(half);
    const s = Math.sin(half);
    const dirs = [
      { x: -c, y: 0, z: s },
      { x: -c, y: 0, z: -s },
    ];
    const armLen = arrowLength * hitR;
    const maxArmRadius = Math.max(0.28, 0.22) * hitR * 2.2;
    const alongs: number[] = [];
    for (const st of strands) {
      const mid = sampleStrandPolyline(st, 2)[1]!;
      let best = Infinity;
      let bestT = 0;
      for (const d of dirs) {
        const t = mid.x * d.x + mid.y * d.y + mid.z * d.z;
        const px = d.x * Math.max(0, Math.min(armLen, t));
        const py = d.y * Math.max(0, Math.min(armLen, t));
        const pz = d.z * Math.max(0, Math.min(armLen, t));
        const dist = Math.hypot(mid.x - px, mid.y - py, mid.z - pz);
        if (dist < best) {
          best = dist;
          bestT = t;
        }
      }
      expect(best).toBeLessThan(maxArmRadius);
      expect(bestT).toBeGreaterThan(armLen * 0.08);
      expect(bestT).toBeLessThan(armLen * 0.95);
      alongs.push(bestT);
    }
    expect(Math.max(...alongs) - Math.min(...alongs)).toBeGreaterThan(armLen * 0.35);
  });

  it('few strands still reach near the shell edge (fill)', () => {
    const strands = buildStrandSet({
      ...baseArgs,
      params: strandParams({
        seedShape: 'sphere',
        strandCount: 3,
        strandSpacing: 0.35,
        strandRandomAmount: 0,
        strandLength: 0.35,
      }),
    });
    const radii = strands.map((s) => {
      const mid = sampleStrandPolyline(s, 2)[1]!;
      return Math.hypot(mid.x - 0.5, mid.y - 0.5, mid.z - 0.5);
    });
    const maxRho = Math.max(...radii);
    // fillR ≈ 0.4 + 0.35*1.85 ≈ 1.0 → clamp 0.95; mid can be inside that ball
    expect(maxRho).toBeGreaterThan(baseArgs.hitRadiusUVW * 0.35);
  });
});

describe('volumeSmoke strand params normalize', () => {
  it('defaults strandMode off and fills strand fields', () => {
    const n = normalizeVolumeSmokeParams({});
    expect(n.strandMode).toBe(false);
    expect(n.strandCount).toBe(8);
    expect(n.strandLength).toBe(0.85);
    expect(n.strandThickness).toBe(0.18);
    expect(n.strandSpacing).toBe(0.22);
    expect(n.strandEdgeSoftness).toBe(0.65);
    expect(n.strandGapFill).toBe(0.12);
    expect(n.strandRandomAmount).toBe(1);
  });

  it('clamps strandCount and edge/gap ranges', () => {
    const n = normalizeVolumeSmokeParams({
      strandMode: true,
      strandCount: 99,
      strandEdgeSoftness: 2,
      strandGapFill: -1,
    });
    expect(n.strandMode).toBe(true);
    expect(n.strandCount).toBe(48);
    expect(n.strandEdgeSoftness).toBe(1);
    expect(n.strandGapFill).toBe(0);
  });

  it('accepts strandCount above the old 16 cap', () => {
    const n = normalizeVolumeSmokeParams({ strandCount: 32 });
    expect(n.strandCount).toBe(32);
    const strands = buildStrandSet({
      ...baseArgs,
      params: strandParams({
        strandCount: 32,
        strandRandomAmount: 0,
        seedShape: 'column',
        columnHeight: 1.6,
      }),
    });
    expect(strands.length).toBe(32);
    expect(strands.length).toBeLessThanOrEqual(MAX_STRANDS);
  });

  it('defaultVolumeSmokeParams includes strand block', () => {
    const p = defaultVolumeSmokeParams({ strandMode: true, strandCount: 4 });
    expect(p.strandMode).toBe(true);
    expect(p.strandCount).toBe(4);
  });
});

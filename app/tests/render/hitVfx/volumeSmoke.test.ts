import { describe, expect, it } from 'vitest';
import {
  CREATABLE_ELEMENT_TYPES,
  defaultVolumeSmokeParams,
  normalizeHitVfxElement,
  normalizeVolumeSmokeParams,
  type HitVfxRecipe,
} from '../../../src/render/hitVfx/hitVfxTypes';
import { estimateInstanceLifetimeSec } from '../../../src/render/hitVfx/HitVfxPlumeCompiler';
import { compileRecipeToSystemDef } from '../../../src/render/hitVfx/HitVfxPlumeCompiler';
import { createMulberry32 } from '../../../src/render/hitVfx/mulberry32';
import {
  VolumeSmokeRuntime,
  volumeSmokeOwnsEditorGizmo,
} from '../../../src/render/hitVfx/volumeSmoke/VolumeSmokeRuntime';
import {
  buildSpawnVariation,
  SPAWN_NOISE_OFFSET_AMP,
  SPAWN_TIME_PHASE_AMP,
} from '../../../src/render/hitVfx/volumeSmoke/spawnSeed';
import {
  createSeedShapeGeometry,
  seedShapeGizmoKind,
} from '../../../src/render/hitVfx/volumeSmoke/seedShapeGizmo';
import {
  volumeSmokeFadeMul,
  volumeSmokeShouldBeginFade,
} from '../../../src/render/hitVfx/volumeSmoke/smokeFade';
import {
  cloneVolumeSmokeParams,
  scaleVolumeSmokeWorldSizes,
  volumeSmokeTrackMatchesEditorFocus,
} from '../../../src/render/hitVfx/volumeSmoke/scaleWorldSize';
import { resolveVolumeSmokeImpulse } from '../../../src/render/hitVfx/volumeSmoke/impulseMode';
import { VolumeSmokeLighting } from '../../../src/render/hitVfx/volumeSmoke/VolumeSmokeLighting';
import * as THREE from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';

describe('scaleVolumeSmokeWorldSizes', () => {
  it('scales absolute world-meter fields self-similarly', () => {
    const src = defaultVolumeSmokeParams({
      volumeSize: 3,
      unrestrictedVolumeSize: 12,
      hitRadius: 0.36,
      spawnHeight: 0.2,
      shapeThickness: 0.28,
      ringRadiusRatio: 0.65,
      buoyancy: 2,
    });
    const out = scaleVolumeSmokeWorldSizes(src, 2);
    expect(out.volumeSize).toBeCloseTo(6, 5);
    expect(out.unrestrictedVolumeSize).toBeCloseTo(24, 5);
    expect(out.hitRadius).toBeCloseTo(0.72, 5);
    expect(out.spawnHeight).toBeCloseTo(0.4, 5);
    // Relative / look params unchanged.
    expect(out.shapeThickness).toBe(src.shapeThickness);
    expect(out.ringRadiusRatio).toBe(src.ringRadiusRatio);
    expect(out.buoyancy).toBe(src.buoyancy);
    // Does not mutate author params.
    expect(src.volumeSize).toBe(3);
    expect(src.hitRadius).toBe(0.36);
  });

  it('treats sizeMul=1 as identity clone with isolated nested objects', () => {
    const src = defaultVolumeSmokeParams({ volumeSize: 4, hitRadius: 0.5 });
    const out = scaleVolumeSmokeWorldSizes(src, 1);
    expect(out.volumeSize).toBe(4);
    expect(out.hitRadius).toBe(0.5);
    expect(out).not.toBe(src);
    expect(out.seedRotation).not.toBe(src.seedRotation);
    expect(out.seedOffset).not.toBe(src.seedOffset);
    expect(out.turbulenceDir).not.toBe(src.turbulenceDir);
    expect(out.impulseDir).not.toBe(src.impulseDir);
    expect(out.expandedSections).not.toBe(src.expandedSections);
    out.smokeLifespan = 9;
    out.seedRotation.x = 42;
    expect(src.smokeLifespan).toBe(1.2);
    expect(src.seedRotation.x).toBe(0);
  });

  it('cloneVolumeSmokeParams isolates sibling mutations', () => {
    const a = defaultVolumeSmokeParams({ smokeLifespan: 4 });
    const b = cloneVolumeSmokeParams(a);
    b.smokeLifespan = 10;
    b.turbulenceDir.x = 0.5;
    b.impulseDir.x = 0.7;
    expect(a.smokeLifespan).toBe(4);
    expect(a.turbulenceDir.x).toBe(0);
    expect(a.impulseDir.x).toBe(0);
  });

  it('volumeSmokeTrackMatchesEditorFocus isolates siblings and missing ids', () => {
    // Unbound (match) → apply to all.
    expect(volumeSmokeTrackMatchesEditorFocus(undefined, 'a')).toBe(true);
    expect(volumeSmokeTrackMatchesEditorFocus(undefined, undefined)).toBe(true);
    // Explicit no-focus → apply to none.
    expect(volumeSmokeTrackMatchesEditorFocus(null, 'a')).toBe(false);
    expect(volumeSmokeTrackMatchesEditorFocus('', 'a')).toBe(false);
    // Focused on a: only a matches; missing track id must NOT match.
    expect(volumeSmokeTrackMatchesEditorFocus('a', 'a')).toBe(true);
    expect(volumeSmokeTrackMatchesEditorFocus('a', 'b')).toBe(false);
    expect(volumeSmokeTrackMatchesEditorFocus('a', undefined)).toBe(false);
    expect(volumeSmokeTrackMatchesEditorFocus('a', null)).toBe(false);
  });

  it('falls back to 1 for non-finite mul and clamps negatives to 0', () => {
    const src = defaultVolumeSmokeParams({
      volumeSize: 3,
      unrestrictedVolumeSize: 12,
      hitRadius: 0.36,
      spawnHeight: 0.1,
    });
    const bad = scaleVolumeSmokeWorldSizes(src, Number.NaN);
    expect(bad.volumeSize).toBe(3);
    expect(bad.hitRadius).toBe(0.36);
    const zero = scaleVolumeSmokeWorldSizes(src, -2);
    expect(zero.volumeSize).toBe(0);
    expect(zero.unrestrictedVolumeSize).toBe(0);
    expect(zero.hitRadius).toBe(0);
    expect(zero.spawnHeight).toBe(0);
  });
});

describe('volumeSmoke params', () => {
  it('is creatable and defaults include lightingMode', () => {
    expect(CREATABLE_ELEMENT_TYPES).toContain('volumeSmoke');
    const p = defaultVolumeSmokeParams();
    expect(p.lightingMode).toBe('original');
    expect(p.seedShape).toBe('sphere');
    expect(p.poolSize).toBe(2);
    expect(p.smokeColor).toBe('#b0b0b0');
    expect(p.endCondition).toBe('lifespan');
    expect(p.fadeOutSec).toBe(0.3);
    expect(p.fadeCurve).toBe('easeOut');
    expect(p.expandedSections.hitSplat).toBe(true);
    expect(p.seedOffset).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('normalize restores missing fields and clamps poolSize', () => {
    const n = normalizeVolumeSmokeParams({
      poolSize: 99,
      lightingMode: 'project',
      seedShape: 'ring',
      smokeColor: '#ff00aa',
      pressureIterations: 7,
      endCondition: 'density',
      fadeCurve: 'smoothstep',
      fadeOutSec: -1,
      seedOffset: { x: 0.12, y: -0.05, z: 0.2 },
    });
    expect(n.poolSize).toBe(8);
    expect(n.lightingMode).toBe('project');
    expect(n.seedShape).toBe('ring');
    expect(n.smokeColor).toBe('#ff00aa');
    expect(n.pressureIterations).toBe(6); // even
    expect(n.buoyancy).toBe(2);
    expect(n.endCondition).toBe('density');
    expect(n.fadeCurve).toBe('smoothstep');
    expect(n.fadeOutSec).toBe(0);
    expect(n.seedOffset).toEqual({ x: 0.12, y: -0.05, z: 0.2 });
    expect(n.arcAngle).toBe(140);
    expect(normalizeVolumeSmokeParams({}).seedOffset).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
  });

  it('normalize accepts arc seedShape and clamps arcAngle', () => {
    const n = normalizeVolumeSmokeParams({
      seedShape: 'arc',
      arcAngle: 999,
    });
    expect(n.seedShape).toBe('arc');
    expect(n.arcAngle).toBe(360);
    expect(normalizeVolumeSmokeParams({ seedShape: 'arc', arcAngle: -5 }).arcAngle).toBe(
      1,
    );
  });

  it('legacy recipes without impulseMode keep direction + hit source', () => {
    const n = normalizeVolumeSmokeParams({ hitImpulse: 10 });
    expect(n.impulseMode).toBe('direction');
    expect(n.impulseDirSource).toBe('hit');
    expect(n.impulseDir).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('normalize accepts impulse mode scatter and custom local dir', () => {
    const n = normalizeVolumeSmokeParams({
      impulseMode: 'scatter',
      impulseDirSource: 'custom',
      impulseDir: { x: 2, y: 0, z: 0 },
      showImpulseDir: false,
    });
    expect(n.impulseMode).toBe('scatter');
    expect(n.impulseDirSource).toBe('custom');
    expect(n.impulseDir).toEqual({ x: 2, y: 0, z: 0 });
    expect(n.showImpulseDir).toBe(false);
  });

  it('resolveVolumeSmokeImpulse: direction/custom vs hit vs scatter', () => {
    const hit = { x: 0, y: 0, z: 1 };
    const custom = resolveVolumeSmokeImpulse({
      mode: 'direction',
      dirSource: 'custom',
      impulseDir: { x: 3, y: 0, z: 0 },
      hitDirOS: hit,
      impulseRadial: 0.25,
    });
    expect(custom.dirOS.x).toBeCloseTo(1, 5);
    expect(custom.dirOS.y).toBeCloseTo(0, 5);
    expect(custom.radial).toBeCloseTo(0.25, 5);

    const fromHit = resolveVolumeSmokeImpulse({
      mode: 'direction',
      dirSource: 'hit',
      impulseDir: { x: 1, y: 0, z: 0 },
      hitDirOS: hit,
      impulseRadial: 0.1,
    });
    expect(fromHit.dirOS.z).toBeCloseTo(1, 5);
    expect(fromHit.radial).toBeCloseTo(0.1, 5);

    const scatter = resolveVolumeSmokeImpulse({
      mode: 'scatter',
      dirSource: 'custom',
      impulseDir: { x: 0, y: 1, z: 0 },
      hitDirOS: hit,
      impulseRadial: 0.2,
    });
    expect(scatter.radial).toBe(1);
  });

  it('fade mul curves reach 0 at t=1 and 1 at t=0', () => {
    for (const curve of ['linear', 'easeOut', 'easeIn', 'smoothstep'] as const) {
      expect(volumeSmokeFadeMul(0, curve)).toBeCloseTo(1, 5);
      expect(volumeSmokeFadeMul(1, curve)).toBeCloseTo(0, 5);
    }
    expect(volumeSmokeFadeMul(0.5, 'linear')).toBeCloseTo(0.5, 5);
  });

  it('endCondition lifespan vs density triggers correctly', () => {
    expect(
      volumeSmokeShouldBeginFade({
        endCondition: 'lifespan',
        age: 1.2,
        maxLife: 1.2,
        densityStop: 0.02,
        peakDensity: 1,
        densitySampleReady: false,
      }),
    ).toBe(true);
    expect(
      volumeSmokeShouldBeginFade({
        endCondition: 'density',
        age: 0.5,
        maxLife: 99,
        densityStop: 0.02,
        peakDensity: 0.01,
        densitySampleReady: true,
      }),
    ).toBe(true);
    expect(
      volumeSmokeShouldBeginFade({
        endCondition: 'density',
        age: 0.5,
        maxLife: 99,
        densityStop: 0.02,
        peakDensity: 0.5,
        densitySampleReady: true,
      }),
    ).toBe(false);
    expect(
      volumeSmokeShouldBeginFade({
        endCondition: 'density',
        age: 0.01,
        maxLife: 99,
        densityStop: 0.02,
        peakDensity: 0,
        densitySampleReady: true,
      }),
    ).toBe(false);
  });

  it('normalizeHitVfxElement accepts volumeSmoke', () => {
    const el = normalizeHitVfxElement(
      {
        id: 'vs1',
        type: 'volumeSmoke',
        name: '体素烟',
        params: { lightingMode: 'project', hitImpulse: 20 },
      },
      0,
    );
    expect(el?.type).toBe('volumeSmoke');
    if (el?.type === 'volumeSmoke') {
      expect(el.params.lightingMode).toBe('project');
      expect(el.params.hitImpulse).toBe(20);
    }
  });

  it('spawn variation is deterministic for same seed', () => {
    const a = buildSpawnVariation(12345);
    const b = buildSpawnVariation(12345);
    expect(a.noiseOffset).toEqual(b.noiseOffset);
    expect(a.impulseScale).toBe(b.impulseScale);
  });

  it('spawnVariationAmount 0 disables jitter and 1 matches baseline', () => {
    const base = buildSpawnVariation(12345, 1);
    const none = buildSpawnVariation(12345, 0);
    const half = buildSpawnVariation(12345, 0.5);
    expect(none.noiseOffset).toEqual({ x: 0, y: 0, z: 0 });
    expect(none.timePhase).toBe(0);
    expect(none.centerOffsetUVW).toEqual({ x: 0, y: 0, z: 0 });
    expect(none.radiusScale).toBe(1);
    expect(none.impulseScale).toBe(1);
    expect(none.swirlScale).toBe(1);
    expect(none.densityScale).toBe(1);
    expect(none.temperatureScale).toBe(1);
    expect(none.seedRotationOffset).toEqual({ x: 0, y: 0, z: 0 });
    expect(half.noiseOffset.x).toBeCloseTo(base.noiseOffset.x * 0.5, 8);
    expect(half.impulseScale - 1).toBeCloseTo((base.impulseScale - 1) * 0.5, 8);
    expect(normalizeVolumeSmokeParams({}).spawnVariationAmount).toBe(1);
    expect(
      normalizeVolumeSmokeParams({ spawnVariationAmount: -2 }).spawnVariationAmount,
    ).toBe(0);
  });

  it('spawnVariationAmount baselines stay below curl-period saturation', () => {
    // Default turbFrequency=8 → UVW period ≈ 0.125. Old amps (2.2 / 48) made
    // amount≈0.05 already fully decorrelate curl samples.
    expect(SPAWN_NOISE_OFFSET_AMP).toBeLessThanOrEqual(0.25);
    expect(SPAWN_TIME_PHASE_AMP).toBeLessThanOrEqual(6);
    for (const seed of [1, 2, 99, 12345, 0xffffffff]) {
      const small = buildSpawnVariation(seed, 0.1);
      expect(Math.abs(small.noiseOffset.x)).toBeLessThanOrEqual(
        SPAWN_NOISE_OFFSET_AMP * 0.1 + 1e-9,
      );
      expect(Math.abs(small.noiseOffset.y)).toBeLessThanOrEqual(
        SPAWN_NOISE_OFFSET_AMP * 0.1 + 1e-9,
      );
      expect(Math.abs(small.noiseOffset.z)).toBeLessThanOrEqual(
        SPAWN_NOISE_OFFSET_AMP * 0.1 + 1e-9,
      );
      expect(small.timePhase).toBeGreaterThanOrEqual(0);
      expect(small.timePhase).toBeLessThanOrEqual(SPAWN_TIME_PHASE_AMP * 0.1 + 1e-9);
      const full = buildSpawnVariation(seed, 1);
      expect(Math.abs(full.noiseOffset.x)).toBeLessThanOrEqual(
        SPAWN_NOISE_OFFSET_AMP + 1e-9,
      );
      expect(full.timePhase).toBeLessThanOrEqual(SPAWN_TIME_PHASE_AMP + 1e-9);
    }
  });

  it('seed shape gizmo geometry differs by seedShape', () => {
    const sphere = createSeedShapeGeometry(
      defaultVolumeSmokeParams({ seedShape: 'sphere' }),
    );
    const disk = createSeedShapeGeometry(
      defaultVolumeSmokeParams({ seedShape: 'disk' }),
    );
    const ring = createSeedShapeGeometry(
      defaultVolumeSmokeParams({ seedShape: 'ring' }),
    );
    const arc = createSeedShapeGeometry(
      defaultVolumeSmokeParams({ seedShape: 'arc', arcAngle: 140 }),
    );
    const arrow = createSeedShapeGeometry(
      defaultVolumeSmokeParams({ seedShape: 'arrow', arrowAngle: 70, arrowLength: 1 }),
    );
    const column = createSeedShapeGeometry(
      defaultVolumeSmokeParams({ seedShape: 'column' }),
    );
    expect(sphere).toBeInstanceOf(THREE.SphereGeometry);
    expect(disk).toBeInstanceOf(THREE.CylinderGeometry);
    expect(ring).toBeInstanceOf(THREE.TorusGeometry);
    expect(arc).toBeInstanceOf(THREE.TorusGeometry);
    expect(arrow).toBeInstanceOf(THREE.BufferGeometry);
    expect(column).toBeInstanceOf(THREE.CylinderGeometry);
    expect(seedShapeGizmoKind(defaultVolumeSmokeParams({ seedShape: 'ring' }))).toContain(
      'ring:',
    );
    expect(seedShapeGizmoKind(defaultVolumeSmokeParams({ seedShape: 'arc' }))).toContain(
      'arc:',
    );
    expect(seedShapeGizmoKind(defaultVolumeSmokeParams({ seedShape: 'arrow' }))).toContain(
      'arrow:',
    );
    const kindArcA = seedShapeGizmoKind(
      defaultVolumeSmokeParams({ seedShape: 'arc', arcAngle: 90 }),
    );
    const kindArcB = seedShapeGizmoKind(
      defaultVolumeSmokeParams({ seedShape: 'arc', arcAngle: 180 }),
    );
    expect(kindArcA).not.toBe(kindArcB);
    const kindArrowA = seedShapeGizmoKind(
      defaultVolumeSmokeParams({ seedShape: 'arrow', arrowAngle: 50 }),
    );
    const kindArrowB = seedShapeGizmoKind(
      defaultVolumeSmokeParams({ seedShape: 'arrow', arrowAngle: 120 }),
    );
    expect(kindArrowA).not.toBe(kindArrowB);
    const kindA = seedShapeGizmoKind(defaultVolumeSmokeParams());
    const kindB = seedShapeGizmoKind(
      defaultVolumeSmokeParams({ seedOffset: { x: 0.1, y: 0, z: 0 } }),
    );
    expect(kindA).not.toBe(kindB);
    sphere.dispose();
    disk.dispose();
    ring.dispose();
    arc.dispose();
    arrow.dispose();
    column.dispose();
  });

  it('normalize accepts arrow seedShape and clamps arrow params', () => {
    const n = normalizeVolumeSmokeParams({
      seedShape: 'arrow',
      arrowAngle: 999,
      arrowLength: -1,
    });
    expect(n.seedShape).toBe('arrow');
    expect(n.arrowAngle).toBe(179);
    expect(n.arrowLength).toBe(0.05);
    expect(normalizeVolumeSmokeParams({}).arrowAngle).toBe(70);
    expect(normalizeVolumeSmokeParams({}).arrowLength).toBe(1);
  });

  it('arrow gizmo tip is at origin and arms open toward −X', () => {
    const geo = createSeedShapeGeometry(
      defaultVolumeSmokeParams({
        seedShape: 'arrow',
        arrowAngle: 60,
        arrowLength: 1,
        hitRadius: 1,
      }),
    );
    const pos = geo.getAttribute('position');
    let minX = Infinity;
    let maxX = -Infinity;
    let sumX = 0;
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      sumX += x;
      n += 1;
    }
    expect(n).toBeGreaterThan(10);
    // Tip at origin; arms go toward −X so most mass / extent is on −X.
    expect(maxX).toBeLessThan(0.15);
    expect(minX).toBeLessThan(-0.5);
    expect(sumX / n).toBeLessThan(0);
    geo.dispose();
  });

  it('arc gizmo is centered on +X (matches shader tangent / ")" opening −X)', () => {
    const arcDeg = 90;
    const geo = createSeedShapeGeometry(
      defaultVolumeSmokeParams({ seedShape: 'arc', arcAngle: arcDeg, hitRadius: 1 }),
    );
    const pos = geo.getAttribute('position');
    let sumAng = 0;
    let n = 0;
    let minAng = Infinity;
    let maxAng = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const rho = Math.hypot(x, z);
      if (rho < 0.4) continue;
      const ang = Math.atan2(z, x);
      sumAng += ang;
      n += 1;
      if (ang < minAng) minAng = ang;
      if (ang > maxAng) maxAng = ang;
    }
    expect(n).toBeGreaterThan(10);
    const meanAng = sumAng / n;
    // Midpoint of arc should sit near +X (0 rad), not +Z (π/2).
    expect(Math.abs(meanAng)).toBeLessThan(0.2);
    const half = ((arcDeg / 2) * Math.PI) / 180;
    expect(minAng).toBeGreaterThan(-half - 0.35);
    expect(maxAng).toBeLessThan(half + 0.35);
    geo.dispose();
  });

  it('normalize round-trips seedShape through JSON', () => {
    const raw = JSON.parse(
      JSON.stringify({
        type: 'volumeSmoke',
        params: defaultVolumeSmokeParams({ seedShape: 'column', hitRadius: 0.5 }),
      }),
    );
    const el = normalizeHitVfxElement(raw, 0);
    expect(el?.type).toBe('volumeSmoke');
    if (el?.type === 'volumeSmoke') {
      expect(el.params.seedShape).toBe('column');
      expect(el.params.hitRadius).toBe(0.5);
    }
  });
});

describe('volumeSmoke plume integration', () => {
  it('estimateInstanceLifetimeSec includes smokeLifespan and fadeOutSec', () => {
    const recipe: HitVfxRecipe = {
      id: 'r',
      name: 't',
      kind: 'onHit',
      groups: [{ id: 'main', name: '主组', enabled: true }],
      elements: [
        {
          id: 'vs',
          name: '体素烟',
          type: 'volumeSmoke',
          enabled: true,
          groupId: 'main',
          startDelaySec: 0.1,
          receiveSparkLight: false,
          params: defaultVolumeSmokeParams({
            smokeLifespan: 2,
            fadeOutSec: 0.4,
            endCondition: 'lifespan',
          }),
        },
      ],
      strengthScale: {
        L: {
          countMul: 1,
          sizeMul: 1,
          brightnessMul: 1,
          lifetimeMul: 1,
          lightIntensityMul: 1,
        },
        M: {
          countMul: 1,
          sizeMul: 1,
          brightnessMul: 1,
          lifetimeMul: 1.5,
          lightIntensityMul: 1,
        },
        H: {
          countMul: 1,
          sizeMul: 1,
          brightnessMul: 1,
          lifetimeMul: 1,
          lightIntensityMul: 1,
        },
      },
    };
    const life = estimateInstanceLifetimeSec(recipe, 'M');
    // life*mul + fadeOutSec + startDelay
    expect(life).toBeGreaterThanOrEqual(2 * 1.5 + 0.4 + 0.1);
  });

  it('compileRecipeToSystemDef skips volumeSmoke emitters', () => {
    const recipe: HitVfxRecipe = {
      id: 'r2',
      name: 't',
      kind: 'onHit',
      groups: [{ id: 'main', name: '主组', enabled: true }],
      elements: [
        {
          id: 'vs',
          name: '体素烟',
          type: 'volumeSmoke',
          enabled: true,
          groupId: 'main',
          startDelaySec: 0,
          receiveSparkLight: false,
          params: defaultVolumeSmokeParams(),
        },
      ],
      strengthScale: {
        L: {
          countMul: 1,
          sizeMul: 1,
          brightnessMul: 1,
          lifetimeMul: 1,
          lightIntensityMul: 1,
        },
        M: {
          countMul: 1,
          sizeMul: 1,
          brightnessMul: 1,
          lifetimeMul: 1,
          lightIntensityMul: 1,
        },
        H: {
          countMul: 1,
          sizeMul: 1,
          brightnessMul: 1,
          lifetimeMul: 1,
          lightIntensityMul: 1,
        },
      },
    };
    const def = compileRecipeToSystemDef({
      recipe,
      strength: 'M',
      seed: 1,
      rng: createMulberry32(1),
      vfxLightBoost: 0,
    });
    expect(def.emitters.length).toBe(0);
  });

  it('editor seed gizmo stays bound to the selected volumeSmoke element', () => {
    // Match / unbound: any spawn may refresh the shared gizmo.
    expect(volumeSmokeOwnsEditorGizmo(undefined, 'a')).toBe(true);
    expect(volumeSmokeOwnsEditorGizmo(undefined, 'b')).toBe(true);
    // Editor focused on element a: later sibling spawns must not steal the gizmo.
    expect(volumeSmokeOwnsEditorGizmo('a', 'a')).toBe(true);
    expect(volumeSmokeOwnsEditorGizmo('a', 'b')).toBe(false);
    expect(volumeSmokeOwnsEditorGizmo('a', undefined)).toBe(false);
    // Selection is not a volumeSmoke: hide / ignore all spawn gizmo updates.
    expect(volumeSmokeOwnsEditorGizmo(null, 'a')).toBe(false);
    expect(volumeSmokeOwnsEditorGizmo(null, 'b')).toBe(false);
  });

  it('maxPoolSizeFromRecipe reads volumeSmoke poolSize', () => {
    const recipe: HitVfxRecipe = {
      id: 'r3',
      name: 't',
      kind: 'onHit',
      groups: [{ id: 'main', name: '主组', enabled: true }],
      elements: [
        {
          id: 'vs',
          name: '体素烟',
          type: 'volumeSmoke',
          enabled: true,
          groupId: 'main',
          startDelaySec: 0,
          receiveSparkLight: false,
          params: defaultVolumeSmokeParams({ poolSize: 5 }),
        },
      ],
      strengthScale: {
        L: {
          countMul: 1,
          sizeMul: 1,
          brightnessMul: 1,
          lifetimeMul: 1,
          lightIntensityMul: 1,
        },
        M: {
          countMul: 1,
          sizeMul: 1,
          brightnessMul: 1,
          lifetimeMul: 1,
          lightIntensityMul: 1,
        },
        H: {
          countMul: 1,
          sizeMul: 1,
          brightnessMul: 1,
          lifetimeMul: 1,
          lightIntensityMul: 1,
        },
      },
    };
    expect(VolumeSmokeRuntime.maxPoolSizeFromRecipe(recipe)).toBe(5);
  });

  it('maxPoolSizeFromRecipe covers concurrent volumeSmoke elements', () => {
    const strengthScale = {
      L: {
        countMul: 1,
        sizeMul: 1,
        brightnessMul: 1,
        lifetimeMul: 1,
        lightIntensityMul: 1,
      },
      M: {
        countMul: 1,
        sizeMul: 1,
        brightnessMul: 1,
        lifetimeMul: 1,
        lightIntensityMul: 1,
      },
      H: {
        countMul: 1,
        sizeMul: 1,
        brightnessMul: 1,
        lifetimeMul: 1,
        lightIntensityMul: 1,
      },
    };
    const recipe: HitVfxRecipe = {
      id: 'r4',
      name: 't',
      kind: 'onHit',
      groups: [{ id: 'main', name: '主组', enabled: true }],
      elements: [
        {
          id: 'vs1',
          name: '烟1',
          type: 'volumeSmoke',
          enabled: true,
          groupId: 'main',
          startDelaySec: 0,
          receiveSparkLight: false,
          params: defaultVolumeSmokeParams({ poolSize: 1 }),
        },
        {
          id: 'vs2',
          name: '烟2',
          type: 'volumeSmoke',
          enabled: true,
          groupId: 'main',
          startDelaySec: 0,
          receiveSparkLight: false,
          params: defaultVolumeSmokeParams({ poolSize: 1 }),
        },
        {
          id: 'vs3',
          name: '烟3',
          type: 'volumeSmoke',
          enabled: true,
          groupId: 'main',
          startDelaySec: 0.1,
          receiveSparkLight: false,
          params: defaultVolumeSmokeParams({ poolSize: 1 }),
        },
      ],
      strengthScale,
    };
    // Three enabled volumeSmokes in one trigger need 3 slots even if each asks for 1.
    expect(VolumeSmokeRuntime.maxPoolSizeFromRecipe(recipe)).toBe(3);
  });
});

describe('VolumeSmokeLighting overlay lights', () => {
  function mockRenderer(
    overrides?: Partial<{ toneMapping: THREE.ToneMapping; toneMappingExposure: number }>,
  ): WebGPURenderer {
    return {
      toneMapping: overrides?.toneMapping ?? THREE.NoToneMapping,
      toneMappingExposure: overrides?.toneMappingExposure ?? 1,
    } as WebGPURenderer;
  }

  it('enables a collectible PointLight for VolumeNodeMaterial (original/global)', () => {
    const scene = new THREE.Scene();
    const lighting = new VolumeSmokeLighting({
      scene,
      renderer: mockRenderer(),
    });
    lighting.apply(
      defaultVolumeSmokeParams({
        lightingMode: 'original',
        globalLight: true,
        keyLightIntensity: 800,
        showFloor: true,
      }),
    );

    const point = scene.children.find(
      (c) => c instanceof THREE.PointLight && c.visible,
    ) as THREE.PointLight;
    expect(point).toBeTruthy();
    expect(point.intensity).toBe(800);
    // Default layer 0 — must share the overlay camera mask.
    expect(point.layers.isEnabled(0)).toBe(true);
    expect(typeof point.distance).toBe('number');

    lighting.dispose();
  });

  it('keeps a proxy PointLight in project mode for VolumeNodeMaterial', () => {
    const scene = new THREE.Scene();
    const lighting = new VolumeSmokeLighting({
      scene,
      renderer: mockRenderer(),
    });
    lighting.apply(
      defaultVolumeSmokeParams({
        lightingMode: 'project',
        keyLightIntensity: 500,
      }),
    );
    const point = scene.children.find(
      (c) => c instanceof THREE.PointLight && c.visible,
    ) as THREE.PointLight;
    expect(point).toBeTruthy();
    expect(point.intensity).toBe(500);
    lighting.syncKeyLightPos();
    expect(point.position.lengthSq()).toBeGreaterThan(0);
    lighting.dispose();
  });

  it('does not rewrite host tone mapping by default', () => {
    const scene = new THREE.Scene();
    const renderer = mockRenderer({
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 1.25,
    });
    const lighting = new VolumeSmokeLighting({ scene, renderer });
    lighting.apply(
      defaultVolumeSmokeParams({
        lightingMode: 'original',
        toneMapping: 'ACESFilmic',
        exposure: 3,
      }),
    );
    expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.25);
    lighting.dispose();
  });

  it('can opt into host tone mapping mutation', () => {
    const scene = new THREE.Scene();
    const renderer = mockRenderer({
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 1,
    });
    const lighting = new VolumeSmokeLighting({
      scene,
      renderer,
      mutateHostToneMapping: true,
    });
    lighting.apply(
      defaultVolumeSmokeParams({
        lightingMode: 'original',
        toneMapping: 'ACESFilmic',
        exposure: 2,
      }),
    );
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(2);
    lighting.apply(null);
    expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(renderer.toneMappingExposure).toBe(1);
    lighting.dispose();
  });
});

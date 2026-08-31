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
import { buildSpawnVariation } from '../../../src/render/hitVfx/volumeSmoke/spawnSeed';
import {
  createSeedShapeGeometry,
  seedShapeGizmoKind,
} from '../../../src/render/hitVfx/volumeSmoke/seedShapeGizmo';
import {
  volumeSmokeFadeMul,
  volumeSmokeShouldBeginFade,
} from '../../../src/render/hitVfx/volumeSmoke/smokeFade';
import { scaleVolumeSmokeWorldSizes } from '../../../src/render/hitVfx/volumeSmoke/scaleWorldSize';
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

  it('treats sizeMul=1 as identity clone', () => {
    const src = defaultVolumeSmokeParams({ volumeSize: 4, hitRadius: 0.5 });
    const out = scaleVolumeSmokeWorldSizes(src, 1);
    expect(out.volumeSize).toBe(4);
    expect(out.hitRadius).toBe(0.5);
    expect(out).not.toBe(src);
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
    expect(normalizeVolumeSmokeParams({}).seedOffset).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
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
    const column = createSeedShapeGeometry(
      defaultVolumeSmokeParams({ seedShape: 'column' }),
    );
    expect(sphere).toBeInstanceOf(THREE.SphereGeometry);
    expect(disk).toBeInstanceOf(THREE.CylinderGeometry);
    expect(ring).toBeInstanceOf(THREE.TorusGeometry);
    expect(column).toBeInstanceOf(THREE.CylinderGeometry);
    expect(seedShapeGizmoKind(defaultVolumeSmokeParams({ seedShape: 'ring' }))).toContain(
      'ring:',
    );
    const kindA = seedShapeGizmoKind(defaultVolumeSmokeParams());
    const kindB = seedShapeGizmoKind(
      defaultVolumeSmokeParams({ seedOffset: { x: 0.1, y: 0, z: 0 } }),
    );
    expect(kindA).not.toBe(kindB);
    sphere.dispose();
    disk.dispose();
    ring.dispose();
    column.dispose();
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

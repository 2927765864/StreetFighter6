import { describe, expect, it } from 'vitest';
import { createMulberry32 } from '../../../src/render/hitVfx/mulberry32';
import { compileRecipeToSystemDef } from '../../../src/render/hitVfx/HitVfxPlumeCompiler';
import {
  HELIX_POTENTIAL_CURL_FORCE_TYPE,
} from '../../../src/render/hitVfx/HelixPotentialCurlForce';
import {
  bakePunchRingPotential,
  createPunchRingField,
  meanAbsDivergenceFromPotentialBake,
  meanAbsDivergenceFromVelocityBake,
} from '../../../src/render/hitVfx/RingVortexField';
import {
  createUngardedDefaultRecipe,
} from '../../../src/render/hitVfx/hitVfxDefaults';
import {
  defaultSmokeRingParams,
  defaultStrengthScale,
  normalizeHitVfxElement,
  type HitVfxRecipe,
  type SmokeRingParams,
} from '../../../src/render/hitVfx/hitVfxTypes';

function recipeWithSmokeRing(
  params?: Partial<SmokeRingParams>,
): HitVfxRecipe {
  return {
    id: 'smoke_ring_fixture',
    name: 'smokeRing fixture',
    kind: 'onHit',
    groups: [{ id: 'main', name: '主组', enabled: true }],
    elements: [
      {
        id: 'smokeRing',
        name: '涡环烟',
        type: 'smokeRing',
        enabled: true,
        groupId: 'main',
        startDelaySec: 0,
        receiveSparkLight: true,
        params: defaultSmokeRingParams(params),
      },
    ],
    strengthScale: defaultStrengthScale(),
  };
}

describe('smokeRing migration', () => {
  it('migrates dust → smokeRing with dyeCount', () => {
    const el = normalizeHitVfxElement(
      {
        id: 'd1',
        name: '扬尘',
        type: 'dust',
        enabled: true,
        groupId: 'main',
        startDelaySec: 0,
        receiveSparkLight: true,
        params: { count: 10, coneAngleRad: 1 },
      },
      0,
    );
    expect(el?.type).toBe('smokeRing');
    if (el?.type === 'smokeRing') {
      expect(el.params.dyeCount).toBe(10);
      expect(el.params.filamentCount).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('smokeRing compile', () => {
  it('uses ring birth and helix force; no cone / plume vortex / curlNoise', () => {
    const recipe = recipeWithSmokeRing();
    const smoke = recipe.elements.find((e) => e.type === 'smokeRing');
    expect(smoke?.type).toBe('smokeRing');
    const rng = createMulberry32(1);
    const def = compileRecipeToSystemDef({
      recipe,
      strength: 'M',
      seed: 1,
      rng,
      vfxLightBoost: 0,
    });
    const smokeEmitters = def.emitters.filter((e) =>
      (e.name ?? '').includes('smokeRing'),
    );
    expect(smokeEmitters.length).toBeGreaterThanOrEqual(1);
    for (const em of smokeEmitters) {
      const json = em.init.map((m) => m.toJSON());
      const posJson = json.find((j) => j.type === 'init.position');
      expect(posJson).toBeTruthy();
      const kind = (posJson as { shape?: { kind?: string } }).shape?.kind
        ?? (
          posJson as { params?: { shape?: { kind?: string } } }
        ).params?.shape?.kind;
      if (kind) {
        expect(kind).not.toBe('cone');
        expect(kind).toBe('ring');
      }
      const updateTypes = em.update.map((m) => m.type);
      expect(updateTypes).not.toContain('update.vortex_force');
      expect(updateTypes).not.toContain('update.curl_noise_force');
      expect(updateTypes).toContain(HELIX_POTENTIAL_CURL_FORCE_TYPE);
    }
  });

  it('is seed-stable for counts', () => {
    const recipe = recipeWithSmokeRing();
    const a = compileRecipeToSystemDef({
      recipe,
      strength: 'M',
      seed: 42,
      rng: createMulberry32(42),
      vfxLightBoost: 0,
    });
    const b = compileRecipeToSystemDef({
      recipe,
      strength: 'M',
      seed: 42,
      rng: createMulberry32(42),
      vfxLightBoost: 0,
    });
    expect(a.emitters.map((e) => e.seed)).toEqual(b.emitters.map((e) => e.seed));
    expect(a.emitters.map((e) => e.capacity)).toEqual(
      b.emitters.map((e) => e.capacity),
    );
  });
});

describe('RingVortexField potential vs velocity divergence', () => {
  it('potential FD-curl has lower mean |div| than baked velocity', () => {
    const params = {
      ringRadius: 0.16,
      tubeRadius: 0.045,
      vortexStrength: 8,
      curlAmplitude: 1.4,
      helixHelicity: 0.7,
      helixCoherence: 0.45,
      helixDecay: 0.08,
      potentialGrid: 16 as const,
      seed: 7,
    };
    const potBake = bakePunchRingPotential(params);
    const field = createPunchRingField(params);
    const velBake = field.bake3D(16);
    const divPot = meanAbsDivergenceFromPotentialBake(
      potBake.texture.image.data as Float32Array,
      16,
      32,
      9,
    );
    const divVel = meanAbsDivergenceFromVelocityBake(
      velBake.data,
      16,
      32,
      9,
    );
    expect(divPot).toBeLessThan(divVel / 10 + 1e-6);
  });
});

describe('default recipe excludes smokeRing', () => {
  it('does not include smokeRing in unguarded default', () => {
    const recipe: HitVfxRecipe = createUngardedDefaultRecipe();
    expect(recipe.elements.some((e) => e.type === 'smokeRing')).toBe(false);
    expect(recipe.elements.map((e) => e.type).sort()).toEqual([
      'spark',
      'sparkDebris',
      'sweat',
    ]);
  });
});

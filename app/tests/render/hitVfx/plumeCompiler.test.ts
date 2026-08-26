import { describe, expect, it } from 'vitest';
import { createUngardedDefaultRecipe } from '../../../src/render/hitVfx/hitVfxDefaults';
import { compileRecipeToSystemDef } from '../../../src/render/hitVfx/HitVfxPlumeCompiler';
import { createMulberry32 } from '../../../src/render/hitVfx/mulberry32';

describe('HitVfxPlumeCompiler', () => {
  it('compiles default onHit recipe to plume SystemDef with particle emitters', () => {
    const recipe = createUngardedDefaultRecipe();
    const def = compileRecipeToSystemDef({
      recipe,
      strength: 'M',
      seed: 1,
      rng: createMulberry32(1),
      vfxLightBoost: 0.5,
    });
    expect(def.emitters.length).toBeGreaterThanOrEqual(4);
    // sparkLight is pool-only, not a plume emitter
    expect(def.emitters.every((e) => !e.name?.includes('sparkLight'))).toBe(
      true,
    );
  });

  it('same seed compile produces same burst counts via baked ranges', () => {
    const recipe = createUngardedDefaultRecipe();
    const a = compileRecipeToSystemDef({
      recipe,
      strength: 'L',
      seed: 42,
      rng: createMulberry32(42),
      vfxLightBoost: 0,
    });
    const b = compileRecipeToSystemDef({
      recipe,
      strength: 'L',
      seed: 42,
      rng: createMulberry32(42),
      vfxLightBoost: 0,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

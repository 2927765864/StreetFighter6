import { describe, expect, it } from 'vitest';
import { createDefaultHitVfxRecipes } from '../../../src/render/hitVfx/hitVfxDefaults';
import {
  normalizeHitVfxRecipe,
  scaleCount,
} from '../../../src/render/hitVfx/hitVfxTypes';

describe('hitVfxTypes', () => {
  it('normalize keeps default recipes intact', () => {
    const recipes = createDefaultHitVfxRecipes();
    const again = recipes.map((r, i) => normalizeHitVfxRecipe(r, i)!);
    expect(again).toHaveLength(2);
    expect(again[0]!.id).toBe('ungarded_default');
    expect(again[1]!.id).toBe('block_default');
    expect(again[0]!.elements.some((e) => e.type === 'sweat')).toBe(true);
    const sweat = again[1]!.elements.find((e) => e.type === 'sweat');
    expect(sweat?.enabled).toBe(false);
    expect(again[0]!.groups.some((g) => g.id === 'main')).toBe(true);
    expect(again[0]!.elements.some((e) => e.type === 'sparkLight')).toBe(false);
    const spark = again[0]!.elements.find((e) => e.type === 'spark');
    expect(spark?.type === 'spark' && spark.params.light.enabled).toBe(true);
  });

  it('migrates legacy sparkLight into spark.params.light', () => {
    const raw = {
      id: 'legacy',
      kind: 'onHit',
      elements: [
        {
          id: 'spark',
          type: 'spark',
          groupId: 'main',
          params: { count: 10 },
        },
        {
          id: 'sparkLight',
          type: 'sparkLight',
          groupId: 'main',
          params: { intensity: 9, color: 0xff0000 },
        },
      ],
    };
    const r = normalizeHitVfxRecipe(raw, 0)!;
    expect(r.elements.some((e) => e.type === 'sparkLight')).toBe(false);
    const spark = r.elements.find((e) => e.type === 'spark');
    expect(spark?.type).toBe('spark');
    if (spark?.type === 'spark') {
      expect(spark.params.light.intensity).toBe(9);
      expect(spark.params.light.color).toBe(0xff0000);
      expect(spark.params.light.enabled).toBe(true);
    }
  });

  it('forces collideGround false on sweat', () => {
    const raw = {
      id: 't',
      kind: 'onHit',
      elements: [
        {
          id: 's',
          type: 'sweat',
          params: { collideGround: true, count: 3 },
        },
      ],
    };
    const r = normalizeHitVfxRecipe(raw, 0)!;
    const sweat = r.elements.find((e) => e.type === 'sweat');
    expect(sweat?.params.collideGround).toBe(false);
  });

  it('scaleCount rounds and floors at 0', () => {
    expect(scaleCount(28, 0.65)).toBe(18);
    expect(scaleCount(10, 0)).toBe(0);
  });
});

describe('hitVfx editor draft merge', () => {
  it('applyConfig restores preview-bar scalars', async () => {
    const { applyConfig, CONFIG } = await import('../../../src/config/store');
    applyConfig({
      hitVfxTimeScale: 0.25,
      hitVfxPreviewDummyVisible: false,
      hitVfxSeed: 42,
      hitVfxPreviewKind: 'onBlock',
      hitVfxPreviewHeight: 'h',
      hitVfxPreviewStrength: 'H',
      hitVfxMaxConcurrent: 3,
      hitVfxSparkLightPoolSize: 2,
      hitVfxPaused: true,
      hitVfxSeedLocked: false,
    });
    expect(CONFIG.hitVfxTimeScale).toBe(0.25);
    expect(CONFIG.hitVfxPreviewDummyVisible).toBe(false);
    expect(CONFIG.hitVfxSeed).toBe(42);
    expect(CONFIG.hitVfxPreviewKind).toBe('onBlock');
    expect(CONFIG.hitVfxPreviewHeight).toBe('h');
    expect(CONFIG.hitVfxPreviewStrength).toBe('H');
    expect(CONFIG.hitVfxMaxConcurrent).toBe(3);
    expect(CONFIG.hitVfxSparkLightPoolSize).toBe(2);
    expect(CONFIG.hitVfxPaused).toBe(true);
    expect(CONFIG.hitVfxSeedLocked).toBe(false);
  });
});

describe('hitVfxRecipeOps', () => {
  it('duplicateRecipe remaps all ids', async () => {
    const { duplicateRecipe, moveElementToGroup, createGroup } = await import(
      '../../../src/hitVfxEditor/hitVfxRecipeOps'
    );
    const recipes = createDefaultHitVfxRecipes();
    const a = recipes[0]!;
    const b = duplicateRecipe(a);
    expect(b.id).not.toBe(a.id);
    expect(b.groups[0]!.id).not.toBe(a.groups[0]!.id);
    expect(b.elements[0]!.id).not.toBe(a.elements[0]!.id);
    const g = createGroup(b, '测试组');
    const el = b.elements[0]!;
    expect(moveElementToGroup(b, el.id, g.id)).toBe(true);
    expect(el.groupId).toBe(g.id);
  });
});

import type {
  FlipbookLayer,
  FlipbookRecipe,
  FlipbookRecipeBank,
  FlipbookStrength,
} from './types';

export const FLIPBOOK_STRENGTHS: FlipbookStrength[] = ['L', 'M', 'H'];

export const FLIPBOOK_STRENGTH_LABEL: Record<FlipbookStrength, string> = {
  L: '轻',
  M: '中',
  H: '重',
};

/** Aligns with vfx-ai-pipeline reference: 17 frames @30fps, FX from t=1. */
export const DEFAULT_FLIPBOOK_RECIPE: FlipbookRecipe = {
  id: 'hit_ref_v1_M',
  name: '命中参考 v1 · 中',
  strength: 'M',
  fps: 30,
  length: 17,
  layers: [
    {
      id: 'E3_ring_smoke',
      name: 'E3 圆环烟',
      enabled: true,
      z: 0,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      opacity: 0.42,
      brightness: 1.35,
      lift: 0.2,
      despill: 0.45,
      startFrame: 1,
      duration: 14,
      blend: 'screen',
    },
    {
      id: 'E4_wide_short_smoke',
      name: 'E4 宽短冲击烟',
      enabled: true,
      z: 1,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      opacity: 0.38,
      brightness: 1.4,
      lift: 0.22,
      despill: 0.5,
      startFrame: 1,
      duration: 14,
      blend: 'screen',
    },
    {
      id: 'E5_narrow_long_smoke',
      name: 'E5 窄长冲击烟',
      enabled: true,
      z: 2,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      opacity: 0.4,
      brightness: 1.35,
      lift: 0.18,
      despill: 0.45,
      startFrame: 1,
      duration: 14,
      blend: 'screen',
    },
    {
      id: 'E6_narrow_long_smoke_rtl',
      name: 'E6 反向窄长烟',
      enabled: true,
      z: 3,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      opacity: 0.4,
      brightness: 1.35,
      lift: 0.18,
      despill: 0.45,
      startFrame: 1,
      duration: 14,
      blend: 'screen',
    },
    {
      id: 'E2_near_sparks',
      name: 'E2 近核火花',
      enabled: true,
      z: 4,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      opacity: 1,
      brightness: 1,
      lift: 0,
      despill: 0.35,
      startFrame: 1,
      duration: 10,
      blend: 'add',
    },
    {
      id: 'E1_core_flash',
      name: 'E1 核心闪光',
      enabled: true,
      z: 5,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      opacity: 1,
      brightness: 1,
      lift: 0,
      despill: 0.35,
      startFrame: 1,
      duration: 10,
      blend: 'add',
    },
  ],
};

export function cloneRecipe(src: FlipbookRecipe): FlipbookRecipe {
  return {
    ...src,
    layers: src.layers.map((l) => ({ ...l })),
  };
}

export function recipeForStrength(
  src: FlipbookRecipe,
  strength: FlipbookStrength,
): FlipbookRecipe {
  const copy = cloneRecipe(src);
  copy.strength = strength;
  copy.id = `hit_ref_v1_${strength}`;
  copy.name = `命中参考 v1 · ${FLIPBOOK_STRENGTH_LABEL[strength]}`;
  return copy;
}

/** Existing authored look is medium; light and heavy start as identical copies. */
export function defaultFlipbookBank(): FlipbookRecipeBank {
  return {
    L: recipeForStrength(DEFAULT_FLIPBOOK_RECIPE, 'L'),
    M: cloneRecipe(DEFAULT_FLIPBOOK_RECIPE),
    H: recipeForStrength(DEFAULT_FLIPBOOK_RECIPE, 'H'),
  };
}

export function cloneBank(src: FlipbookRecipeBank): FlipbookRecipeBank {
  return {
    L: cloneRecipe(src.L),
    M: cloneRecipe(src.M),
    H: cloneRecipe(src.H),
  };
}

export function findLayer(
  recipe: FlipbookRecipe,
  id: string,
): FlipbookLayer | undefined {
  return recipe.layers.find((l) => l.id === id);
}

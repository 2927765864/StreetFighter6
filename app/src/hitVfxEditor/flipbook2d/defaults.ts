import type { FlipbookLayer, FlipbookRecipe } from './types';

/** Aligns with vfx-ai-pipeline reference: 17 frames @30fps, FX from t=1. */
export const DEFAULT_FLIPBOOK_RECIPE: FlipbookRecipe = {
  id: 'hit_ref_v1',
  name: '命中参考 v1 · E1–E5',
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
      id: 'E2_near_sparks',
      name: 'E2 近核火花',
      enabled: true,
      z: 3,
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
  ],
};

export function cloneRecipe(src: FlipbookRecipe): FlipbookRecipe {
  return {
    ...src,
    layers: src.layers.map((l) => ({ ...l })),
  };
}

export function findLayer(
  recipe: FlipbookRecipe,
  id: string,
): FlipbookLayer | undefined {
  return recipe.layers.find((l) => l.id === id);
}

import type { FlipbookBlend, FlipbookLayer } from './types';

export function parseBlend(raw: unknown): FlipbookBlend {
  if (raw === 'add' || raw === 'screen' || raw === 'normal') return raw;
  return 'normal';
}

export function canvasComposite(
  blend: FlipbookBlend,
): GlobalCompositeOperation {
  if (blend === 'add') return 'lighter';
  if (blend === 'screen') return 'screen';
  return 'source-over';
}

export type ThreeBlending = {
  blending: number;
  blendSrc?: number;
  blendDst?: number;
  blendEquation?: number;
};

/** Numeric THREE blending constants passed in so this file stays three-free. */
export function threeBlendParams(
  blend: FlipbookBlend,
  THREE: {
    NormalBlending: number;
    AdditiveBlending: number;
    CustomBlending: number;
    AddEquation: number;
    OneMinusDstColorFactor: number;
    OneFactor: number;
  },
): ThreeBlending {
  if (blend === 'add') return { blending: THREE.AdditiveBlending };
  if (blend === 'screen') {
    return {
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneMinusDstColorFactor,
      blendDst: THREE.OneFactor,
    };
  }
  return { blending: THREE.NormalBlending };
}

export function tintFromLayer(layer: FlipbookLayer): {
  r: number;
  g: number;
  b: number;
} {
  const v = Math.max(0, layer.brightness + layer.lift);
  return { r: v, g: v, b: v };
}

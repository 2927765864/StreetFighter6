import type { FlipbookBlend, FlipbookLayer } from './types';

export const DEFAULT_TINT = '#ffffff';

export function parseTint(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(s);
  if (m6) return `#${m6[1]!.toLowerCase()}`;
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(s);
  if (m3) {
    const [a, b, c] = m3[1]!;
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return DEFAULT_TINT;
}

export function tintRgb(hex: string): { r: number; g: number; b: number } {
  const h = parseTint(hex).slice(1);
  return {
    r: Number.parseInt(h.slice(0, 2), 16) / 255,
    g: Number.parseInt(h.slice(2, 4), 16) / 255,
    b: Number.parseInt(h.slice(4, 6), 16) / 255,
  };
}

export function parseBlend(raw: unknown): FlipbookBlend {
  if (raw === 'add' || raw === 'screen' || raw === 'steam' || raw === 'normal') {
    return raw;
  }
  return 'normal';
}

export function blendLabel(blend: FlipbookBlend): string {
  if (blend === 'add') return '加法';
  if (blend === 'screen') return '滤色';
  if (blend === 'steam') return '蒸汽';
  return '普通';
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
  blendSrcAlpha?: number;
  blendDstAlpha?: number;
  blendEquation?: number;
  /** Screen steam is authored linear-ish grey; ACES would crush it. */
  toneMapped?: boolean;
};

/** Numeric THREE blending constants passed in so this file stays three-free. */
export function threeBlendParams(
  blend: FlipbookBlend,
  THREE: {
    NormalBlending: number;
    AdditiveBlending: number;
    CustomBlending: number;
    AddEquation: number;
    OneFactor: number;
    OneMinusSrcColorFactor: number;
    OneMinusSrcAlphaFactor: number;
    OneMinusDstColorFactor: number;
  },
): ThreeBlending {
  if (blend === 'add') return { blending: THREE.AdditiveBlending, toneMapped: false };
  if (blend === 'screen') {
    // Original 滤色: src*(1-dst)+dst. Authored grey, no steam remap.
    return {
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneMinusDstColorFactor,
      blendDst: THREE.OneFactor,
      toneMapped: true,
    };
  }
  if (blend === 'steam') {
    // Lerp destination toward tint (white PMA × material colour). Never darkens.
    return { blending: THREE.NormalBlending, toneMapped: false };
  }
  return { blending: THREE.NormalBlending };
}

export function tintFromLayer(layer: FlipbookLayer): {
  r: number;
  g: number;
  b: number;
} {
  if (layer.blend !== 'steam') {
    const v = Math.max(0, layer.brightness + layer.lift);
    return { r: v, g: v, b: v };
  }
  // Steam liftDark/liftBright are baked into coverage; brightness is fog colour gain.
  const v = Math.max(0, layer.brightness);
  const c = tintRgb(layer.tint);
  return { r: c.r * v, g: c.g * v, b: c.b * v };
}

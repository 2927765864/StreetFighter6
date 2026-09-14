/** Key-fringe strip + premultiply. Look (opacity/brightness/blend) lives on the layer. */

/** `premul` = authored RGB. `steam` = grey/luma becomes coverage, RGB is white. */
export type FlipbookPrepLook = 'premul' | 'steam';

export type SteamLifts = {
  dark: number;
  bright: number;
};

export function steamLiftsFromLayer(layer: {
  liftDark?: number;
  liftBright?: number;
}): SteamLifts {
  return {
    dark: Math.max(0, Math.min(12, Number(layer.liftDark) || 0)),
    bright: Math.max(0, Math.min(2, Number(layer.liftBright) || 0)),
  };
}

/** Old panel stored CSS pixels (~360). Combat now uses world meters. */
export function flipbookWorldSize(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1.8;
  if (raw > 20) return Math.min(6, Math.max(0.4, raw / 200));
  return Math.min(8, Math.max(0.2, raw));
}

export function prepLookForBlend(blend: string): FlipbookPrepLook {
  return blend === 'steam' ? 'steam' : 'premul';
}

/** `despill` 0 = authored; 1 = drop dark key matte. Ignored for steam (grey is smoke). */
export function processImageData(
  data: Uint8ClampedArray,
  despill = 0,
  look: FlipbookPrepLook = 'premul',
  steamLifts: SteamLifts = { dark: 0, bright: 0 },
): void {
  const d = Math.max(0, Math.min(1, despill));
  const steam = look === 'steam';
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    let a = data[i + 3]!;
    if (a < 8) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
      continue;
    }
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (!steam && d > 0) {
      if (luma < 22) {
        a = Math.min(a, (luma / 22) * 255);
      }
      const fringe = Math.max(0, Math.min(1, (luma - 8) / 48));
      a *= 1 - d + d * fringe;
    }
    const af = a / 255;
    if (steam) {
      // Colored fog: RGB is always white. Authored grey/alpha is density only.
      // Never keep dark RGB — raising alpha of dark grey is what made the
      // whole shot go black before going white.
      const t = luma / 255;
      const ld = Math.max(0, Math.min(12, steamLifts.dark));
      const lb = Math.max(0, Math.min(2, steamLifts.bright));
      const kDark = ld / 12;
      const kBright = lb / 2;
      let dens = Math.max(0, Math.min(1, t * af));
      dens = dens + (1 - dens) * kDark * (1 - dens);
      dens = dens + dens * kBright * (1 - dens);
      dens = Math.max(0, Math.min(1, dens));
      const p = Math.round(255 * dens);
      data[i] = p;
      data[i + 1] = p;
      data[i + 2] = p;
      data[i + 3] = p;
    } else {
      data[i] = Math.round(r * af);
      data[i + 1] = Math.round(g * af);
      data[i + 2] = Math.round(b * af);
      data[i + 3] = Math.round(a);
    }
  }
}

export function prepImage(
  img: HTMLImageElement,
  despill = 0,
  look: FlipbookPrepLook = 'premul',
  steamLifts: SteamLifts = { dark: 0, bright: 0 },
): HTMLCanvasElement {
  const w = Math.max(1, img.naturalWidth);
  const h = Math.max(1, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const pix = ctx.getImageData(0, 0, w, h);
  processImageData(pix.data, despill, look, steamLifts);
  ctx.putImageData(pix, 0, 0);
  return canvas;
}

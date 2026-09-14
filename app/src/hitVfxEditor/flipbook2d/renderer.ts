import { FLIPBOOK_SHEETS } from './catalog';
import { getCachedImage, loadImage } from './imageCache';
import { canvasComposite, parseTint, tintRgb } from './layerLook';
import { layerRotationRad } from './layerRotation';
import { prepImage, prepLookForBlend, steamLiftsFromLayer } from './texturePrep';
import { sortedByZ, sourceFrameAt, type FlipbookRecipe } from './types';

const steamSpriteCache = new Map<string, HTMLCanvasElement>();

function steamSprite(
  img: HTMLImageElement,
  despill: number,
  tintHex: string,
  gain: number,
  liftDark: number,
  liftBright: number,
): HTMLCanvasElement {
  const tint = parseTint(tintHex);
  const g = Math.max(0, gain);
  const key = `${img.src}|${despill.toFixed(2)}|${tint}|g=${g.toFixed(2)}|ld=${liftDark.toFixed(2)}|lb=${liftBright.toFixed(2)}|v9`;
  const hit = steamSpriteCache.get(key);
  if (hit) return hit;
  const grey = prepImage(img, despill, 'steam', {
    dark: liftDark,
    bright: liftBright,
  });
  const c = tintRgb(tint);
  const fr = Math.max(0, Math.min(255, Math.round(c.r * g * 255)));
  const fg = Math.max(0, Math.min(255, Math.round(c.g * g * 255)));
  const fb = Math.max(0, Math.min(255, Math.round(c.b * g * 255)));
  if (fr === 255 && fg === 255 && fb === 255) {
    steamSpriteCache.set(key, grey);
    return grey;
  }
  const canvas = document.createElement('canvas');
  canvas.width = grey.width;
  canvas.height = grey.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(grey, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(grey, 0, 0);
  steamSpriteCache.set(key, canvas);
  return canvas;
}

export type FlipbookDrawOpts = {
  playhead: number;
  selectedId: string | null;
  onNeedRedraw?: () => void;
  originX?: number;
  originY?: number;
  fit?: number;
  flipX?: boolean;
  fillBackground?: boolean;
  showGuides?: boolean;
  showHud?: boolean;
  /**
   * Per-layer Z rotation jitter in degrees (spawn sample).
   * Missing ids → 0; canvas preview does not re-roll each frame.
   */
  rotationJitterDegById?: Readonly<Record<string, number>>;
};

export function drawFlipbook(
  ctx: CanvasRenderingContext2D,
  recipe: FlipbookRecipe,
  opts: FlipbookDrawOpts,
  viewW?: number,
  viewH?: number,
): void {
  const w = viewW ?? ctx.canvas.width;
  const h = viewH ?? ctx.canvas.height;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (opts.fillBackground !== false) {
    ctx.fillStyle = '#0c1018';
    ctx.fillRect(0, 0, w, h);
  }

  const cx = opts.originX ?? w * 0.5;
  const cy = opts.originY ?? h * 0.5;
  if (opts.showGuides !== false && opts.fillBackground !== false) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();
  }

  const fit = opts.fit ?? Math.min(w, h) * 0.72;

  ctx.save();
  ctx.translate(cx, cy);
  if (opts.flipX) ctx.scale(-1, 1);

  for (const layer of sortedByZ(recipe.layers)) {
    const urls = FLIPBOOK_SHEETS[layer.id] ?? [];
    const idx = sourceFrameAt(layer, opts.playhead, urls.length);
    if (idx == null) continue;
    const url = urls[idx];
    if (!url) continue;
    const cached = getCachedImage(url);
    if (!cached) {
      void loadImage(url).then(() => opts.onNeedRedraw?.());
      continue;
    }
    const maxSide = Math.max(cached.naturalWidth, cached.naturalHeight) || 1;
    const base = (fit / maxSide) * layer.scale;
    const dw = cached.naturalWidth * base;
    const dh = cached.naturalHeight * base;
    const x = layer.offsetX - dw / 2;
    const y = layer.offsetY - dh / 2;
    const jitter = opts.rotationJitterDegById?.[layer.id] ?? 0;
    const rot = layerRotationRad(layer, jitter);
    ctx.save();
    ctx.translate(layer.offsetX, layer.offsetY);
    if (rot !== 0) ctx.rotate(rot);
    ctx.translate(-layer.offsetX, -layer.offsetY);
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = canvasComposite(layer.blend);
    const bright = Math.max(0.05, layer.brightness + layer.lift);
    const look = prepLookForBlend(layer.blend);
    const lifts = steamLiftsFromLayer(layer);
    const sprite =
      look === 'steam'
        ? steamSprite(
            cached,
            layer.despill,
            layer.tint,
            layer.brightness,
            lifts.dark,
            lifts.bright,
          )
        : cached;
    if (look !== 'steam') ctx.filter = `brightness(${bright})`;
    ctx.drawImage(sprite, x, y, dw, dh);
    ctx.filter = 'none';
    if (layer.id === opts.selectedId) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(140, 200, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, dw + 2, dh + 2);
    }
    ctx.restore();
  }
  ctx.restore();

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (opts.showHud !== false && opts.fillBackground !== false) {
    ctx.fillStyle = 'rgba(232, 236, 244, 0.7)';
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(
      `第 ${opts.playhead} / ${Math.max(0, recipe.length - 1)} 帧`,
      12,
      20,
    );
  }
}

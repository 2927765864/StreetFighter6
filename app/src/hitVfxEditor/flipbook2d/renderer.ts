import { FLIPBOOK_SHEETS } from './catalog';
import { getCachedImage, loadImage } from './imageCache';
import { canvasComposite } from './layerLook';
import { sortedByZ, sourceFrameAt, type FlipbookRecipe } from './types';

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
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = canvasComposite(layer.blend);
    const bright = Math.max(0.05, layer.brightness + layer.lift);
    ctx.filter = `brightness(${bright})`;
    ctx.drawImage(cached, x, y, dw, dh);
    ctx.filter = 'none';
    if (layer.id === opts.selectedId) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(140, 200, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, dw + 2, dh + 2);
    }
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

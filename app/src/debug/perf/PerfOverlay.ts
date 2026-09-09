import { classifyFpsColor, fpsClassColor } from './perfMath';
import type { PerfOverlayPosition, PerfSnapshot } from './perfTypes';

export type PerfOverlayConfig = {
  enabled: boolean;
  position: PerfOverlayPosition;
  opacity: number;
  showGraphs: boolean;
  showSegments: boolean;
  showRenderInfo: boolean;
  showJsHeap: boolean;
  targetFps: number;
  warnFps: number;
  badFps: number;
  /** When true, skip redraw while document.hidden */
  pauseHidden?: boolean;
};

/** Fixed DOM + canvas graphs for PerfSnapshot (replaces FpsHud). */
export class PerfOverlay {
  private root: HTMLDivElement | null = null;
  private titleEl: HTMLDivElement | null = null;
  private segEl: HTMLDivElement | null = null;
  private renderEl: HTMLDivElement | null = null;
  private extraEl: HTMLDivElement | null = null;
  private canvasMs: HTMLCanvasElement | null = null;
  private canvasFps: HTMLCanvasElement | null = null;

  ensureDom(): void {
    if (this.root) return;
    const el = document.createElement('div');
    el.id = 'perf-overlay';
    el.style.cssText = [
      'position:fixed',
      'z-index:10000',
      'margin:0',
      'padding:6px 8px',
      'min-width:280px',
      'max-width:360px',
      'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#cfc',
      'background:rgba(0,0,0,0.85)',
      'border:1px solid rgba(255,255,255,0.2)',
      'border-radius:6px',
      'pointer-events:none',
      'user-select:none',
      'box-sizing:border-box',
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = 'font-size:13px;font-weight:600;margin-bottom:4px';
    title.textContent = '— FPS';

    const canvasMs = document.createElement('canvas');
    canvasMs.width = 300;
    canvasMs.height = 40;
    canvasMs.style.cssText = 'display:block;width:100%;height:40px;margin:2px 0';

    const canvasFps = document.createElement('canvas');
    canvasFps.width = 300;
    canvasFps.height = 40;
    canvasFps.style.cssText = 'display:block;width:100%;height:40px;margin:2px 0';

    const seg = document.createElement('div');
    seg.style.opacity = '0.95';
    const render = document.createElement('div');
    render.style.opacity = '0.9';
    const extra = document.createElement('div');
    extra.style.opacity = '0.85';

    el.append(title, canvasMs, canvasFps, seg, render, extra);
    document.body.appendChild(el);

    this.root = el;
    this.titleEl = title;
    this.canvasMs = canvasMs;
    this.canvasFps = canvasFps;
    this.segEl = seg;
    this.renderEl = render;
    this.extraEl = extra;
  }

  update(
    snap: PerfSnapshot,
    cfg: PerfOverlayConfig,
    graphs?: { frameMsHistory: number[]; fpsHistory: number[] },
  ): void {
    if (!cfg.enabled) {
      this.hide();
      return;
    }
    if (cfg.pauseHidden && typeof document !== 'undefined' && document.hidden) {
      // still keep last DOM; skip redraw
      return;
    }
    this.ensureDom();
    if (!this.root || !this.titleEl) return;

    this.root.style.display = '';
    this.root.style.opacity = String(cfg.opacity);
    applyPosition(this.root, cfg.position);

    const cls = classifyFpsColor(snap.presentFps, cfg.warnFps, cfg.badFps);
    this.titleEl.style.color = fpsClassColor(cls);
    this.titleEl.textContent = `${snap.presentFps} FPS · L${snap.logicHz} · ${snap.frameMs.toFixed(1)}ms`;

    if (this.canvasMs && this.canvasFps) {
      this.canvasMs.style.display = cfg.showGraphs ? 'block' : 'none';
      this.canvasFps.style.display = cfg.showGraphs ? 'block' : 'none';
      if (cfg.showGraphs && graphs) {
        drawLine(
          this.canvasMs,
          graphs.frameMsHistory,
          1000 / Math.max(1, cfg.targetFps),
          '#6cf',
          'ms',
        );
        drawLine(this.canvasFps, graphs.fpsHistory, cfg.targetFps, '#9f9', 'fps');
      }
    }

    if (this.segEl) {
      this.segEl.style.display = cfg.showSegments ? 'block' : 'none';
      if (cfg.showSegments) {
        const s = snap.segmentsMs;
        this.segEl.textContent = `logic ${s.logic.toFixed(1)} · sync ${s.syncView.toFixed(1)} · vfx ${s.vfxCpu.toFixed(1)} · render ${s.render.toFixed(1)}`;
      }
    }

    if (this.renderEl) {
      this.renderEl.style.display = cfg.showRenderInfo ? 'block' : 'none';
      if (cfg.showRenderInfo) {
        const r = snap.render;
        const memMb =
          r.memoryTotal > 0 ? ` · mem ${(r.memoryTotal / 1048576).toFixed(1)}MB` : '';
        this.renderEl.textContent = `DC ${r.drawCalls} · tri ${Math.round(r.triangles)} · geo ${r.geometries} · tex ${r.textures}${memMb}`;
      }
    }

    if (this.extraEl) {
      const parts: string[] = [];
      const gpu =
        snap.gpuRenderMs != null ? `GPU ${snap.gpuRenderMs.toFixed(2)}ms` : 'GPU n/a';
      parts.push(gpu);
      if (cfg.showJsHeap) {
        parts.push(
          snap.jsHeapUsedMb != null
            ? `JS ${snap.jsHeapUsedMb.toFixed(1)}/${snap.jsHeapTotalMb?.toFixed(1) ?? '?'}MB`
            : 'JS n/a',
        );
      }
      if (snap.warnings.length) parts.push(`!${snap.warnings[0]}`);
      this.extraEl.textContent = parts.join(' · ');
    }
  }

  hide(): void {
    if (this.root) this.root.style.display = 'none';
  }

  dispose(): void {
    this.root?.remove();
    this.root = null;
    this.titleEl = null;
    this.segEl = null;
    this.renderEl = null;
    this.extraEl = null;
    this.canvasMs = null;
    this.canvasFps = null;
  }
}

function applyPosition(el: HTMLElement, pos: PerfOverlayPosition): void {
  el.style.top = '';
  el.style.bottom = '';
  el.style.left = '';
  el.style.right = '';
  const m = '8px';
  if (pos === 'top-right') {
    el.style.top = m;
    el.style.right = '12px';
  } else if (pos === 'top-left') {
    el.style.top = m;
    el.style.left = '12px';
  } else if (pos === 'bottom-right') {
    el.style.bottom = m;
    el.style.right = '12px';
  } else {
    el.style.bottom = m;
    el.style.left = '12px';
  }
}

function drawLine(
  canvas: HTMLCanvasElement,
  values: number[],
  ref: number,
  color: string,
  _label: string,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, 0, w, h);

  const maxV = Math.max(ref * 1.5, ...values, 1);
  const yRef = h - (ref / maxV) * (h - 4) - 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(0, yRef);
  ctx.lineTo(w, yRef);
  ctx.stroke();

  if (values.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * (w - 2) + 1;
    const y = h - (values[i]! / maxV) * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

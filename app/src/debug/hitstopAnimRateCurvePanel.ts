/**
 * Hitstop anim-rate curve editor for ControlPanel (polyline over progress 0→1).
 */

import { saveCurrentConfig } from '../config/persist';
import { CONFIG } from '../config/store';
import type { RuntimeConfig } from '../config/types';
import {
  createDefaultHitstopAnimRateCurve,
  normalizeHitstopAnimRateCurve,
  type HitstopAnimRateKey,
} from '../render/hitstopAnimRateCurve';

type OnChange = (key: string, value: unknown, config: RuntimeConfig) => void;

const PAD_L = 28;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 22;

export function hitstopAnimRateCurveEditorHtml(): string {
  return `
          <p class="panel-hint">卡帧进度 0→1 上的播放倍率折线；最终倍率 = 曲线 × 整体缩放。</p>
          <div class="panel-row hitstop-curve-row">
            <canvas id="hitstop-anim-rate-curve" class="hitstop-curve-canvas" width="360" height="140"></canvas>
            <div class="hitstop-curve-actions">
              <button type="button" id="btn-hitstop-curve-add" title="在选中点右侧加点">加点</button>
              <button type="button" id="btn-hitstop-curve-del" title="删除选中点（至少保留 2 点）">删点</button>
              <button type="button" id="btn-hitstop-curve-flat" title="复位为平坦 1">复位平坦</button>
            </div>
            <div class="panel-hint" id="hitstop-curve-status">拖拽关点；空白处点击可加点。</div>
          </div>
  `;
}

function readCurve(): HitstopAnimRateKey[] {
  return normalizeHitstopAnimRateCurve(CONFIG.hitstopAnimRateCurve);
}

function writeCurve(
  pts: HitstopAnimRateKey[],
  onChange: OnChange,
  persist: boolean,
): void {
  const next = normalizeHitstopAnimRateCurve(pts);
  CONFIG.hitstopAnimRateCurve = next;
  onChange('hitstopAnimRateCurve', next, CONFIG);
  if (persist) void saveCurrentConfig();
}

function canvasToCurve(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { t: number; v: number } {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
  const y = ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
  const plotW = canvas.width - PAD_L - PAD_R;
  const plotH = canvas.height - PAD_T - PAD_B;
  const t = (x - PAD_L) / Math.max(1e-6, plotW);
  const v = 1 - (y - PAD_T) / Math.max(1e-6, plotH);
  return {
    t: Math.min(1, Math.max(0, t)),
    v: Math.min(1, Math.max(0, v)),
  };
}

function curveToCanvas(
  canvas: HTMLCanvasElement,
  t: number,
  v: number,
): { x: number; y: number } {
  const plotW = canvas.width - PAD_L - PAD_R;
  const plotH = canvas.height - PAD_T - PAD_B;
  return {
    x: PAD_L + t * plotW,
    y: PAD_T + (1 - v) * plotH,
  };
}

function drawCurve(
  canvas: HTMLCanvasElement,
  pts: readonly HitstopAnimRateKey[],
  selected: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const plotW = w - PAD_L - PAD_R;
  const plotH = h - PAD_T - PAD_B;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(12, 16, 24, 0.95)';
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = 'rgba(120, 140, 180, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gx = PAD_L + (plotW * i) / 4;
    const gy = PAD_T + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(gx, PAD_T);
    ctx.lineTo(gx, PAD_T + plotH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(PAD_L, gy);
    ctx.lineTo(PAD_L + plotW, gy);
    ctx.stroke();
  }

  // Axes labels
  ctx.fillStyle = '#8b95a8';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('0', PAD_L, h - 6);
  ctx.fillText('进度', PAD_L + plotW * 0.5, h - 6);
  ctx.fillText('1', PAD_L + plotW, h - 6);
  ctx.save();
  ctx.translate(10, PAD_T + plotH * 0.5);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('倍率', 0, 0);
  ctx.restore();
  ctx.textAlign = 'right';
  ctx.fillText('1', PAD_L - 4, PAD_T + 4);
  ctx.fillText('0', PAD_L - 4, PAD_T + plotH + 3);

  // Polyline
  if (pts.length > 0) {
    ctx.strokeStyle = '#6ec8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = curveToCanvas(canvas, pts[i]!.t, pts[i]!.v);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  // Points
  for (let i = 0; i < pts.length; i++) {
    const p = curveToCanvas(canvas, pts[i]!.t, pts[i]!.v);
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === selected ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = i === selected ? '#ffe08a' : '#e8ecf4';
    ctx.fill();
    ctx.strokeStyle = i === selected ? '#c9a227' : '#6ec8ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function nearestPointIndex(
  canvas: HTMLCanvasElement,
  pts: readonly HitstopAnimRateKey[],
  clientX: number,
  clientY: number,
  maxDistPx = 12,
): number {
  const rect = canvas.getBoundingClientRect();
  const sx = ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
  const sy = ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
  const scale = canvas.width / Math.max(1, rect.width);
  const maxD = maxDistPx * scale;
  let best = -1;
  let bestD = maxD;
  for (let i = 0; i < pts.length; i++) {
    const p = curveToCanvas(canvas, pts[i]!.t, pts[i]!.v);
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function bindHitstopAnimRateCurvePanel(opts: {
  root: HTMLElement;
  syncers: Array<() => void>;
  onChange: OnChange;
}): void {
  const { root, syncers, onChange } = opts;
  const canvas = root.querySelector<HTMLCanvasElement>(
    '#hitstop-anim-rate-curve',
  );
  const status = root.querySelector<HTMLElement>('#hitstop-curve-status');
  const btnAdd = root.querySelector<HTMLButtonElement>('#btn-hitstop-curve-add');
  const btnDel = root.querySelector<HTMLButtonElement>('#btn-hitstop-curve-del');
  const btnFlat = root.querySelector<HTMLButtonElement>(
    '#btn-hitstop-curve-flat',
  );
  if (!canvas) return;

  let selected = 0;
  let dragIndex = -1;

  const redraw = () => {
    const pts = readCurve();
    if (selected >= pts.length) selected = Math.max(0, pts.length - 1);
    drawCurve(canvas, pts, selected);
    if (status && pts[selected]) {
      const p = pts[selected]!;
      status.textContent = `选中 #${selected + 1}  t=${p.t.toFixed(2)}  v=${p.v.toFixed(2)} · 拖拽改点；空白点击加点`;
    }
  };

  const sync = () => {
    redraw();
  };
  syncers.push(sync);
  sync();

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const pts = readCurve();
    const hit = nearestPointIndex(canvas, pts, e.clientX, e.clientY);
    if (hit >= 0) {
      selected = hit;
      dragIndex = hit;
      redraw();
      return;
    }
    // Add point at click
    const { t, v } = canvasToCurve(canvas, e.clientX, e.clientY);
    const next = [...pts, { t, v }];
    writeCurve(next, onChange, false);
    const normalized = readCurve();
    // Select the point closest to clicked t after normalize
    let best = 0;
    let bestDt = Infinity;
    for (let i = 0; i < normalized.length; i++) {
      const dt = Math.abs(normalized[i]!.t - t);
      if (dt < bestDt) {
        bestDt = dt;
        best = i;
      }
    }
    selected = best;
    dragIndex = best;
    redraw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (dragIndex < 0) return;
    const pts = readCurve().map((p) => ({ ...p }));
    if (!pts[dragIndex]) return;
    const { t, v } = canvasToCurve(canvas, e.clientX, e.clientY);
    pts[dragIndex] = { t, v };
    // Keep selection by rewriting then finding nearest t
    writeCurve(pts, onChange, false);
    const normalized = readCurve();
    let best = 0;
    let bestDt = Infinity;
    for (let i = 0; i < normalized.length; i++) {
      const dt = Math.abs(normalized[i]!.t - t);
      if (dt < bestDt) {
        bestDt = dt;
        best = i;
      }
    }
    selected = best;
    dragIndex = best;
    redraw();
  });

  const endDrag = (e: PointerEvent) => {
    if (dragIndex < 0) return;
    dragIndex = -1;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    void saveCurrentConfig();
    redraw();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  btnAdd?.addEventListener('click', () => {
    const pts = readCurve();
    const i = Math.min(selected, pts.length - 1);
    const a = pts[i]!;
    const b = pts[Math.min(i + 1, pts.length - 1)]!;
    const t = i === pts.length - 1 ? Math.min(1, a.t + 0.1) : (a.t + b.t) * 0.5;
    const v = i === pts.length - 1 ? a.v : (a.v + b.v) * 0.5;
    writeCurve([...pts, { t, v }], onChange, true);
    const normalized = readCurve();
    let best = 0;
    let bestDt = Infinity;
    for (let j = 0; j < normalized.length; j++) {
      const dt = Math.abs(normalized[j]!.t - t);
      if (dt < bestDt) {
        bestDt = dt;
        best = j;
      }
    }
    selected = best;
    redraw();
  });

  btnDel?.addEventListener('click', () => {
    const pts = readCurve();
    if (pts.length <= 2) {
      if (status) status.textContent = '至少保留 2 个关点';
      return;
    }
    const next = pts.filter((_, i) => i !== selected);
    writeCurve(next, onChange, true);
    selected = Math.min(selected, next.length - 1);
    redraw();
  });

  btnFlat?.addEventListener('click', () => {
    writeCurve(createDefaultHitstopAnimRateCurve(), onChange, true);
    selected = 0;
    redraw();
  });
}

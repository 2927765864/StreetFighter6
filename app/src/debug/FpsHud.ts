/**
 * Top-right real-time FPS overlay.
 * Counts RAF frames; paints integer FPS every 0.5s.
 */
export const FPS_HUD_REFRESH_MS = 500;

/** Integer FPS from frame count over an elapsed window (ms). */
export function computeIntegerFps(frames: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || frames <= 0) return 0;
  return Math.round((frames * 1000) / elapsedMs);
}

export class FpsHud {
  private root: HTMLDivElement | null = null;
  private frames = 0;
  private windowStartMs = 0;

  ensureDom(): void {
    if (this.root) return;
    const el = document.createElement('div');
    el.id = 'fps-hud';
    el.style.cssText = [
      'position:fixed',
      'top:8px',
      'right:12px',
      'z-index:10000',
      'margin:0',
      'padding:4px 10px',
      'font:13px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#9f9',
      'background:rgba(0,0,0,0.72)',
      'border:1px solid rgba(255,255,255,0.2)',
      'border-radius:6px',
      'pointer-events:none',
      'user-select:none',
    ].join(';');
    el.textContent = '— FPS';
    document.body.appendChild(el);
    this.root = el;
  }

  /** Call once per rendered frame with performance.now(). */
  tick(nowMs: number): void {
    this.ensureDom();
    if (!this.root) return;

    if (this.windowStartMs === 0) {
      this.windowStartMs = nowMs;
      this.frames = 0;
    }

    this.frames += 1;
    const elapsed = nowMs - this.windowStartMs;
    if (elapsed < FPS_HUD_REFRESH_MS) return;

    const fps = computeIntegerFps(this.frames, elapsed);
    this.root.textContent = `${fps} FPS`;
    this.windowStartMs = nowMs;
    this.frames = 0;
  }

  dispose(): void {
    this.root?.remove();
    this.root = null;
  }
}

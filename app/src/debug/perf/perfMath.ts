import type { PerfFpsClass } from './perfTypes';

/** Default text refresh for legacy FpsHud; PerfOverlay uses CONFIG.perfRefreshMs. */
export const FPS_HUD_REFRESH_MS = 500;

/** Integer FPS from frame count over an elapsed window (ms). */
export function computeIntegerFps(frames: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || frames <= 0) return 0;
  return Math.round((frames * 1000) / elapsedMs);
}

export function classifyFpsColor(
  fps: number,
  warnFps: number,
  badFps: number,
): PerfFpsClass {
  if (fps < badFps) return 'bad';
  if (fps < warnFps) return 'warn';
  return 'ok';
}

export function fpsClassColor(c: PerfFpsClass): string {
  if (c === 'bad') return '#f66';
  if (c === 'warn') return '#fc6';
  return '#9f9';
}

export function readJsHeapMb(): {
  usedMb: number | null;
  totalMb: number | null;
} {
  const mem = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
    }
  ).memory;
  if (!mem) return { usedMb: null, totalMb: null };
  return {
    usedMb: mem.usedJSHeapSize / 1048576,
    totalMb: mem.totalJSHeapSize / 1048576,
  };
}

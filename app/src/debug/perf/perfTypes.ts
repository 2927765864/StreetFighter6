export type PerfSegmentId = 'logic' | 'syncView' | 'vfxCpu' | 'render';

export type PerfFpsClass = 'ok' | 'warn' | 'bad';

export type PerfOverlayPosition =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left';

export type PerfRenderSample = {
  drawCalls: number;
  triangles: number;
  frameCalls: number;
  geometries: number;
  textures: number;
  /** bytes; 0 if unknown */
  memoryTotal: number;
};

export type PerfSnapshot = {
  schemaVersion: 1;
  takenAtMs: number;
  /** Present FPS over last refresh window */
  presentFps: number;
  logicHz: number;
  frameMs: number;
  frameMsMin: number;
  frameMsMax: number;
  frameMsAvg: number;
  segmentsMs: Record<PerfSegmentId, number>;
  render: PerfRenderSample;
  /** ms; null if disabled or unavailable */
  gpuRenderMs: number | null;
  gpuComputeMs: number | null;
  jsHeapUsedMb: number | null;
  jsHeapTotalMb: number | null;
  presented: boolean;
  logicStepsThisPresent: number;
  warnings: string[];
};

export const PERF_SEGMENT_IDS: readonly PerfSegmentId[] = [
  'logic',
  'syncView',
  'vfxCpu',
  'render',
] as const;

export const PERF_GPU_SESSION_KEY = 'sf6-perf-gpu';

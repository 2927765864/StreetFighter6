/** Short, depth-aware local character blur with independent camera shake. */

export type MotionBlurObjectKind = 'move' | 'attack';

export type MotionBlurConfig = {
  enabled: boolean;
  /** Walk / dash / jump / idle — not while phase is attack. */
  moveScale: number;
  /** While fighter.phase is attack or hitstun (出招 / 受击). */
  attackScale: number;
  /** Scale on inter-frame hit-shake motion (translation + FOV, not follow). */
  cameraScale: number;
  /** Clamp blur radius in pixels (longest sample arm). */
  maxRadiusPx: number;
  /** Exposure in milliseconds; independent of presentation frame rate. */
  exposureMs: number;
  /** Weight of the sharp center pixel (the blur lab uses 0.75). */
  centerWeight: number;
  /** Eight-direction local search distance in drawing-buffer pixels. */
  neighborRadiusPx: number;
  /** Ignore exposure travel below this pixel threshold. */
  minSpeedPx: number;
  /** Directional taps along the velocity. */
  samples: number;
  /**
   * 0 = 合成模糊；1 = 只看物体速度 (xy)；2 = 只看震屏速度 (zw)。
   * 调试用，不进对战逻辑。
   */
  debugView: number;
};

export function createDefaultMotionBlurConfig(): MotionBlurConfig {
  return {
    enabled: true,
    moveScale: 0.8,
    attackScale: 0.8,
    cameraScale: 0.1,
    maxRadiusPx: 18,
    samples: 24,
    exposureMs: 16.67,
    centerWeight: 0.75,
    neighborRadiusPx: 13,
    minSpeedPx: 0.5,
    debugView: 0,
  };
}

export function cloneMotionBlurConfig(src: MotionBlurConfig): MotionBlurConfig {
  return { ...src };
}

export function mergeMotionBlurConfig(
  base: MotionBlurConfig,
  incoming: unknown,
): MotionBlurConfig {
  const out = cloneMotionBlurConfig(base);
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return out;
  }
  const rec = incoming as Record<string, unknown>;
  if (typeof rec.enabled === 'boolean') out.enabled = rec.enabled;
  const clamp01_2 = (n: number) => Math.min(2, Math.max(0, n));
  if (typeof rec.objectScale === 'number' && Number.isFinite(rec.objectScale)) {
    // Import old presets once; the retired key is never emitted again.
    if (typeof rec.moveScale !== 'number') out.moveScale = clamp01_2(rec.objectScale);
    if (typeof rec.attackScale !== 'number') out.attackScale = clamp01_2(rec.objectScale);
  }
  if (typeof rec.moveScale === 'number' && Number.isFinite(rec.moveScale)) {
    out.moveScale = clamp01_2(rec.moveScale);
  }
  if (typeof rec.attackScale === 'number' && Number.isFinite(rec.attackScale)) {
    out.attackScale = clamp01_2(rec.attackScale);
  }
  if (typeof rec.cameraScale === 'number' && Number.isFinite(rec.cameraScale)) {
    out.cameraScale = Math.min(2, Math.max(0, rec.cameraScale));
  }
  if (typeof rec.maxRadiusPx === 'number' && Number.isFinite(rec.maxRadiusPx)) {
    out.maxRadiusPx = Math.min(64, Math.max(0, rec.maxRadiusPx));
  }
  if (typeof rec.samples === 'number' && Number.isFinite(rec.samples)) {
    out.samples = Math.min(32, Math.max(2, Math.round(rec.samples)));
  }
  if (typeof rec.debugView === 'number' && Number.isFinite(rec.debugView)) {
    out.debugView = Math.min(2, Math.max(0, Math.round(rec.debugView)));
  }
  for (const [key, lo, hi] of [
    ['exposureMs', 0, 50], ['centerWeight', 0.1, 8],
    ['neighborRadiusPx', 0, 64], ['minSpeedPx', 0, 4],
  ] as const) {
    const value = rec[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = Math.min(hi, Math.max(lo, value));
    }
  }
  return out;
}

/** Frozen hold in frame-step: reuse last velocity, do not re-measure a still pose. */
export function shouldHoldMotionBlurVelocity(
  paused: boolean,
  logicStepsThisPresent: number,
): boolean {
  return paused && (logicStepsThisPresent | 0) <= 0;
}

export function motionBlurKindFromPhase(phase: string): MotionBlurObjectKind {
  return phase === 'attack' || phase === 'hitstun' ? 'attack' : 'move';
}

export function pickMotionBlurObjectScale(
  kind: MotionBlurObjectKind,
  cfg: Pick<MotionBlurConfig, 'moveScale' | 'attackScale'>,
): number {
  return kind === 'attack' ? cfg.attackScale : cfg.moveScale;
}

/** The lab's mode-2 factor, normalized to exposure rather than frame travel. */
export function localBlurExposureScale(exposureMs: number, deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
  return 0.65 * Math.max(0, exposureMs) / (deltaSeconds * 1000);
}

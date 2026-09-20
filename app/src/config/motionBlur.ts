/** Per-pixel directional motion blur (object-led, camera clamped). */

export type MotionBlurObjectKind = 'move' | 'attack';

export type MotionBlurConfig = {
  enabled: boolean;
  /**
   * @deprecated Prefer moveScale / attackScale. Kept so old presets still merge.
   * When only this key is present, both move and attack inherit it.
   */
  objectScale: number;
  /** Walk / dash / jump / idle — not while phase is attack. */
  moveScale: number;
  /** While fighter.phase is attack or hitstun (出招 / 受击). */
  attackScale: number;
  /** Scale on hit-shake camera offset only (not follow). */
  cameraScale: number;
  /** Clamp blur radius in pixels (longest sample arm). */
  maxRadiusPx: number;
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
    objectScale: 0.8,
    moveScale: 0.8,
    attackScale: 0.8,
    cameraScale: 0.1,
    maxRadiusPx: 18,
    samples: 8,
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
    out.objectScale = clamp01_2(rec.objectScale);
    if (typeof rec.moveScale !== 'number') out.moveScale = out.objectScale;
    if (typeof rec.attackScale !== 'number') out.attackScale = out.objectScale;
  }
  if (typeof rec.moveScale === 'number' && Number.isFinite(rec.moveScale)) {
    out.moveScale = clamp01_2(rec.moveScale);
    out.objectScale = out.moveScale;
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
    out.samples = Math.min(16, Math.max(2, Math.round(rec.samples)));
  }
  if (typeof rec.debugView === 'number' && Number.isFinite(rec.debugView)) {
    out.debugView = Math.min(2, Math.max(0, Math.round(rec.debugView)));
  }
  return out;
}

/**
 * Split full screen-space velocity (object+camera, NDC xy) into
 * object-led + weak camera, then convert to UV offset and clamp.
 */
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

export function composeMotionUvOffset(
  velFullNdcX: number,
  velFullNdcY: number,
  velCamNdcX: number,
  velCamNdcY: number,
  objectScale: number,
  cameraScale: number,
  maxRadiusUv: number,
): { x: number; y: number } {
  const objX = velFullNdcX - velCamNdcX;
  const objY = velFullNdcY - velCamNdcY;
  let x = (objX * objectScale + velCamNdcX * cameraScale) * 0.5;
  let y = (objY * objectScale + velCamNdcY * cameraScale) * 0.5;
  const len = Math.hypot(x, y);
  if (len > maxRadiusUv && len > 1e-8) {
    const s = maxRadiusUv / len;
    x *= s;
    y *= s;
  }
  return { x, y };
}

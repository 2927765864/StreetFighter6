/**
 * CMOS screen-shake config types, normalization, and factory defaults.
 * Spec: GameDevelopmentCognitiveBase/网页开发常用/屏幕震动/CMOS屏幕震动-弹簧悬挂.md
 *
 * Offsets are in world units (Three.js). Defaults are scaled for a ~2m fighter
 * and camera Z≈11 (not Balatro pixel units).
 */

export type CmosShakePresetMode = 'impulse' | 'pulse' | 'oscillate';

/**
 * Screen-space polar angle (deg): 0° = +X (right), 90° = +Y (down),
 * 180° = left, 270° = up. Normalized to [0, 360).
 */
export function normalizeDirAngleDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 90;
  let a = deg % 360;
  if (a < 0) a += 360;
  if (a >= 360) a = 0;
  return a;
}

export function dirCartToPolar(
  dirX: number,
  dirY: number,
): { dirAngleDeg: number; dirRadius: number } {
  const x = Number.isFinite(dirX) ? dirX : 0;
  const y = Number.isFinite(dirY) ? dirY : 0;
  const r = Math.hypot(x, y);
  if (r <= 1e-6) {
    return { dirAngleDeg: 90, dirRadius: 0 };
  }
  return {
    dirAngleDeg: normalizeDirAngleDeg((Math.atan2(y, x) * 180) / Math.PI),
    dirRadius: r,
  };
}

export interface CmosShakeEffectPreset {
  label: string;
  mode: CmosShakePresetMode;
  strength: number;
  spin: number;
  dirAngleDeg: number;
  dirRadius: number;
  dirRandom: boolean;
  dirAngleMin: number;
  dirAngleMax: number;
  count: number;
  intervalMS: number;
  alternate: boolean;
  falloff: number;
  posKick: number;
  angleKickDeg: number;
  durationMS: number;
  freqHz: number;
  amp: number;
  ampRotDeg: number;
  decay: number;
  phaseDeg: number;
}

export type CmosDebugImpulse = {
  dirAngleDeg: number;
  dirRadius: number;
  dirRandom: boolean;
  dirAngleMin: number;
  dirAngleMax: number;
  strength: number;
  spin: number;
};

export type CmosShakeConfig = {
  enabled: boolean;
  intensity: number;
  useGameSpeed: boolean;
  mass: number;
  angularFreq: number;
  dampingRatio: number;
  rotMass: number;
  rotAngularFreq: number;
  rotDampingRatio: number;
  maxOffsetX: number;
  maxOffsetY: number;
  maxAngleDeg: number;
  strengthToVelocity: number;
  spinToVelocity: number;
  maxSpeedXY: number;
  maxSpeedRot: number;
  minImpulseIntervalMS: number;
  maxDtSec: number;
  substeps: number;
  settlePosPx: number;
  settleVelPx: number;
  settleAngleRad: number;
  settleAngVel: number;
  /** Preset id played on unblocked hit. Empty = none. */
  presetOnHit: string;
  /** Preset id played on blocked hit. Empty = none. */
  presetOnBlock: string;
  presets: Record<string, CmosShakeEffectPreset>;
  debugImpulse: CmosDebugImpulse;
};

const CMOS_SHAKE_MODES = new Set<CmosShakePresetMode>([
  'impulse',
  'pulse',
  'oscillate',
]);

export function normalizeCmosShakeMode(v: unknown): CmosShakePresetMode {
  if (typeof v === 'string' && CMOS_SHAKE_MODES.has(v as CmosShakePresetMode)) {
    return v as CmosShakePresetMode;
  }
  return 'impulse';
}

type LegacyDirFields = {
  dirX?: number;
  dirY?: number;
  dirXMin?: number;
  dirXMax?: number;
  dirYMin?: number;
  dirYMax?: number;
};

export function normalizeCmosShakeEffectPreset(
  id: string,
  raw:
    | (Partial<CmosShakeEffectPreset> & LegacyDirFields)
    | CmosShakeEffectPreset
    | null
    | undefined,
  fallback?: (Partial<CmosShakeEffectPreset> & LegacyDirFields) | null,
): CmosShakeEffectPreset {
  const f = fallback ?? {};
  const num = (v: unknown, fb: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fb;
  const bool = (v: unknown, fb: boolean): boolean =>
    typeof v === 'boolean' ? v : fb;
  const labelRaw = raw && typeof raw === 'object' ? raw.label : undefined;
  const label =
    typeof labelRaw === 'string' && labelRaw.length > 0
      ? labelRaw
      : typeof f.label === 'string' && f.label.length > 0
        ? f.label
        : id;
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<CmosShakeEffectPreset> &
    LegacyDirFields;
  const fb = f as Partial<CmosShakeEffectPreset> & LegacyDirFields;

  const hasNewAngle =
    typeof src.dirAngleDeg === 'number' && Number.isFinite(src.dirAngleDeg);
  const hasNewRadius =
    typeof src.dirRadius === 'number' && Number.isFinite(src.dirRadius);
  const hasLegacyDir =
    (typeof src.dirX === 'number' && Number.isFinite(src.dirX)) ||
    (typeof src.dirY === 'number' && Number.isFinite(src.dirY));
  const legacyPolar = hasLegacyDir
    ? dirCartToPolar(num(src.dirX, 0), num(src.dirY, 1))
    : null;
  const fbHasLegacy =
    (typeof fb.dirX === 'number' && Number.isFinite(fb.dirX)) ||
    (typeof fb.dirY === 'number' && Number.isFinite(fb.dirY));
  const fbPolar = fbHasLegacy
    ? dirCartToPolar(num(fb.dirX, 0), num(fb.dirY, 1))
    : null;

  const dirAngleDeg = normalizeDirAngleDeg(
    hasNewAngle
      ? (src.dirAngleDeg as number)
      : legacyPolar
        ? legacyPolar.dirAngleDeg
        : num(f.dirAngleDeg, fbPolar?.dirAngleDeg ?? 90),
  );
  const dirRadius = Math.max(
    0,
    hasNewRadius
      ? (src.dirRadius as number)
      : legacyPolar
        ? legacyPolar.dirRadius
        : num(f.dirRadius, fbPolar?.dirRadius ?? 1),
  );

  const clampAngleRange = (v: number): number => {
    if (!Number.isFinite(v)) return 0;
    if (v === 360) return 360;
    return normalizeDirAngleDeg(v);
  };

  return {
    label,
    mode: normalizeCmosShakeMode(src.mode ?? f.mode),
    strength: num(src.strength, num(f.strength, 0.3)),
    spin: num(src.spin, num(f.spin, 0)),
    dirAngleDeg,
    dirRadius,
    dirRandom: bool(src.dirRandom, f.dirRandom === true),
    dirAngleMin: clampAngleRange(num(src.dirAngleMin, num(f.dirAngleMin, 0))),
    dirAngleMax: clampAngleRange(num(src.dirAngleMax, num(f.dirAngleMax, 360))),
    count: Math.max(1, Math.floor(num(src.count, num(f.count, 1)))),
    intervalMS: Math.max(0, num(src.intervalMS, num(f.intervalMS, 50))),
    alternate: bool(src.alternate, f.alternate === true),
    falloff: Math.max(0, num(src.falloff, num(f.falloff, 1))),
    posKick: num(src.posKick, num(f.posKick, 0)),
    angleKickDeg: num(src.angleKickDeg, num(f.angleKickDeg, 0)),
    durationMS: Math.max(0, num(src.durationMS, num(f.durationMS, 300))),
    freqHz: Math.max(0, num(src.freqHz, num(f.freqHz, 12))),
    amp: num(src.amp, num(f.amp, 0)),
    ampRotDeg: num(src.ampRotDeg, num(f.ampRotDeg, 0)),
    decay: Math.max(0, num(src.decay, num(f.decay, 4))),
    phaseDeg: num(src.phaseDeg, num(f.phaseDeg, 0)),
  };
}

export function cloneCmosShakePresets(
  src: Record<string, CmosShakeEffectPreset>,
): Record<string, CmosShakeEffectPreset> {
  const out: Record<string, CmosShakeEffectPreset> = {};
  for (const [id, p] of Object.entries(src ?? {})) {
    if (!p || typeof p !== 'object') continue;
    out[id] = normalizeCmosShakeEffectPreset(id, p);
  }
  return out;
}

export function normalizeCmosDebugImpulse(
  raw: (Partial<CmosDebugImpulse> & LegacyDirFields) | null | undefined,
  fallback?: CmosDebugImpulse | null,
): CmosDebugImpulse {
  const f: CmosDebugImpulse = fallback ?? {
    dirAngleDeg: 90,
    dirRadius: 1,
    dirRandom: false,
    dirAngleMin: 0,
    dirAngleMax: 360,
    strength: 0.45,
    spin: 0.05,
  };
  const src = raw && typeof raw === 'object' ? raw : {};
  const num = (v: unknown, fb: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fb;
  const bool = (v: unknown, fb: boolean): boolean =>
    typeof v === 'boolean' ? v : fb;

  const hasNewAngle =
    typeof src.dirAngleDeg === 'number' && Number.isFinite(src.dirAngleDeg);
  const hasNewRadius =
    typeof src.dirRadius === 'number' && Number.isFinite(src.dirRadius);
  const hasLegacy =
    (typeof src.dirX === 'number' && Number.isFinite(src.dirX)) ||
    (typeof src.dirY === 'number' && Number.isFinite(src.dirY));
  const polar =
    !hasNewAngle && !hasNewRadius && hasLegacy
      ? dirCartToPolar(num(src.dirX, 0), num(src.dirY, 1))
      : null;

  const clampAngleRange = (v: number): number => {
    if (!Number.isFinite(v)) return 0;
    if (v === 360) return 360;
    return normalizeDirAngleDeg(v);
  };

  return {
    dirAngleDeg: normalizeDirAngleDeg(
      hasNewAngle
        ? (src.dirAngleDeg as number)
        : (polar?.dirAngleDeg ?? f.dirAngleDeg),
    ),
    dirRadius: Math.max(
      0,
      hasNewRadius ? (src.dirRadius as number) : (polar?.dirRadius ?? f.dirRadius),
    ),
    dirRandom: bool(src.dirRandom, f.dirRandom),
    dirAngleMin: clampAngleRange(num(src.dirAngleMin, f.dirAngleMin)),
    dirAngleMax: clampAngleRange(num(src.dirAngleMax, f.dirAngleMax)),
    strength: num(src.strength, f.strength),
    spin: num(src.spin, f.spin),
  };
}

export function mergeCmosShakePresets(
  base: Record<string, CmosShakeEffectPreset>,
  incoming?:
    | Record<string, Partial<CmosShakeEffectPreset> | CmosShakeEffectPreset>
    | null,
): Record<string, CmosShakeEffectPreset> {
  if (!incoming || typeof incoming !== 'object') {
    return cloneCmosShakePresets(base);
  }
  const keys = Object.keys(incoming);
  if (keys.length === 0) {
    return cloneCmosShakePresets(base);
  }
  const out: Record<string, CmosShakeEffectPreset> = {};
  for (const id of keys) {
    const raw = incoming[id];
    if (!raw || typeof raw !== 'object') continue;
    out[id] = normalizeCmosShakeEffectPreset(id, raw, base[id]);
  }
  return out;
}

function impulsePreset(
  label: string,
  partial: Partial<CmosShakeEffectPreset>,
): CmosShakeEffectPreset {
  return normalizeCmosShakeEffectPreset(label, {
    label,
    mode: 'impulse',
    strength: 0.3,
    spin: 0,
    dirAngleDeg: 90,
    dirRadius: 1,
    ...partial,
  });
}

/** Fighting-game starter presets (world-unit scaled). */
export function createDefaultCmosShakePresets(): Record<
  string,
  CmosShakeEffectPreset
> {
  return {
    tap: impulsePreset('轻点', { strength: 0.12, spin: 0 }),
    tick: impulsePreset('轻击', { strength: 0.22, spin: 0.015 }),
    impact: impulsePreset('主冲击', { strength: 0.4, spin: 0.05 }),
    heavy: impulsePreset('重击', {
      strength: 0.7,
      spin: 0.09,
      posKick: 0.02,
      angleKickDeg: 0.15,
    }),
    error: impulsePreset('错误', {
      strength: 0.28,
      spin: 0.07,
      dirAngleDeg: 0,
      posKick: 0.015,
    }),
    nudge: impulsePreset('轻推', { strength: 0.16, spin: 0.02, posKick: 0.008 }),
    settle: impulsePreset('落定', {
      strength: 0.2,
      spin: 0.02,
      posKick: 0.01,
      angleKickDeg: 0.06,
    }),
    thud: impulsePreset('顿挫', {
      strength: 0.18,
      spin: 0.02,
      posKick: 0.035,
      angleKickDeg: 0.2,
    }),
    swayLR: normalizeCmosShakeEffectPreset('swayLR', {
      label: '左右平移',
      mode: 'pulse',
      strength: 0.35,
      spin: 0,
      dirAngleDeg: 0,
      dirRadius: 1,
      count: 4,
      intervalMS: 55,
      alternate: true,
      falloff: 0.85,
      posKick: 0.012,
    }),
    bounceUD: normalizeCmosShakeEffectPreset('bounceUD', {
      label: '上下来回',
      mode: 'pulse',
      strength: 0.4,
      spin: 0,
      dirAngleDeg: 90,
      dirRadius: 1,
      count: 3,
      intervalMS: 60,
      alternate: true,
      falloff: 0.8,
      posKick: 0.015,
    }),
    doubleKick: normalizeCmosShakeEffectPreset('doubleKick', {
      label: '双重冲击',
      mode: 'pulse',
      strength: 0.55,
      spin: 0.04,
      dirAngleDeg: 90,
      dirRadius: 1,
      count: 2,
      intervalMS: 70,
      alternate: true,
      falloff: 0.9,
      posKick: 0.02,
      angleKickDeg: 0.1,
    }),
    swayAngle: normalizeCmosShakeEffectPreset('swayAngle', {
      label: '左右摆角',
      mode: 'oscillate',
      strength: 0,
      spin: 0,
      dirAngleDeg: 0,
      dirRadius: 1,
      durationMS: 420,
      freqHz: 6,
      amp: 0,
      ampRotDeg: 0.9,
      decay: 3.5,
    }),
    rumble: normalizeCmosShakeEffectPreset('rumble', {
      label: '持续微抖',
      mode: 'oscillate',
      strength: 0,
      spin: 0,
      dirAngleDeg: 55,
      dirRadius: 1,
      durationMS: 550,
      freqHz: 18,
      amp: 0.02,
      ampRotDeg: 0.25,
      decay: 2.2,
      phaseDeg: 30,
    }),
  };
}

export function createDefaultCmosShakeConfig(): CmosShakeConfig {
  return {
    enabled: true,
    intensity: 1,
    useGameSpeed: false,
    mass: 1,
    angularFreq: 18,
    dampingRatio: 0.62,
    rotMass: 1,
    rotAngularFreq: 22,
    rotDampingRatio: 0.72,
    maxOffsetX: 0.12,
    maxOffsetY: 0.12,
    maxAngleDeg: 1.2,
    strengthToVelocity: 8,
    spinToVelocity: 8,
    maxSpeedXY: 24,
    maxSpeedRot: 20,
    minImpulseIntervalMS: 0,
    maxDtSec: 0.05,
    substeps: 4,
    settlePosPx: 0.001,
    settleVelPx: 0.02,
    settleAngleRad: 0.0005,
    settleAngVel: 0.01,
    presetOnHit: 'impact',
    presetOnBlock: 'tap',
    presets: createDefaultCmosShakePresets(),
    debugImpulse: {
      dirAngleDeg: 90,
      dirRadius: 1,
      dirRandom: false,
      dirAngleMin: 0,
      dirAngleMax: 360,
      strength: 0.45,
      spin: 0.05,
    },
  };
}

export function cloneCmosShakeConfig(src: CmosShakeConfig): CmosShakeConfig {
  return {
    ...src,
    presets: cloneCmosShakePresets(src.presets),
    debugImpulse: { ...src.debugImpulse },
  };
}

/** Deep-merge incoming onto base (presets: incoming key set wins when non-empty). */
export function mergeCmosShakeConfig(
  base: CmosShakeConfig,
  incoming: Partial<CmosShakeConfig> | Record<string, unknown> | null | undefined,
): CmosShakeConfig {
  if (!incoming || typeof incoming !== 'object') {
    return cloneCmosShakeConfig(base);
  }
  const num = (v: unknown, fb: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fb;
  const bool = (v: unknown, fb: boolean): boolean =>
    typeof v === 'boolean' ? v : fb;
  const str = (v: unknown, fb: string): string =>
    typeof v === 'string' ? v : fb;

  return {
    enabled: bool(incoming.enabled, base.enabled),
    intensity: Math.max(0, Math.min(1, num(incoming.intensity, base.intensity))),
    useGameSpeed: bool(incoming.useGameSpeed, base.useGameSpeed),
    mass: num(incoming.mass, base.mass),
    angularFreq: num(incoming.angularFreq, base.angularFreq),
    dampingRatio: num(incoming.dampingRatio, base.dampingRatio),
    rotMass: num(incoming.rotMass, base.rotMass),
    rotAngularFreq: num(incoming.rotAngularFreq, base.rotAngularFreq),
    rotDampingRatio: num(incoming.rotDampingRatio, base.rotDampingRatio),
    maxOffsetX: num(incoming.maxOffsetX, base.maxOffsetX),
    maxOffsetY: num(incoming.maxOffsetY, base.maxOffsetY),
    maxAngleDeg: num(incoming.maxAngleDeg, base.maxAngleDeg),
    strengthToVelocity: num(incoming.strengthToVelocity, base.strengthToVelocity),
    spinToVelocity: num(incoming.spinToVelocity, base.spinToVelocity),
    maxSpeedXY: num(incoming.maxSpeedXY, base.maxSpeedXY),
    maxSpeedRot: num(incoming.maxSpeedRot, base.maxSpeedRot),
    minImpulseIntervalMS: num(
      incoming.minImpulseIntervalMS,
      base.minImpulseIntervalMS,
    ),
    maxDtSec: num(incoming.maxDtSec, base.maxDtSec),
    substeps: Math.max(1, Math.floor(num(incoming.substeps, base.substeps))),
    settlePosPx: num(incoming.settlePosPx, base.settlePosPx),
    settleVelPx: num(incoming.settleVelPx, base.settleVelPx),
    settleAngleRad: num(incoming.settleAngleRad, base.settleAngleRad),
    settleAngVel: num(incoming.settleAngVel, base.settleAngVel),
    presetOnHit: str(incoming.presetOnHit, base.presetOnHit),
    presetOnBlock: str(incoming.presetOnBlock, base.presetOnBlock),
    presets: mergeCmosShakePresets(
      base.presets,
      incoming.presets as
        | Record<string, Partial<CmosShakeEffectPreset> | CmosShakeEffectPreset>
        | undefined,
    ),
    debugImpulse: normalizeCmosDebugImpulse(
      incoming.debugImpulse as Partial<CmosDebugImpulse> | undefined,
      base.debugImpulse,
    ),
  };
}

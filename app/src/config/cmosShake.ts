/**
 * CMOS screen-shake config.
 *
 * Runtime FOV uses spring.1d.msmd numbers: impulsePosDeg + impulseVelDeg
 * plus mass / ωn / ζ. The old CMOS mapping (`fov` × `fovToVelocity`,
 * `fovKickDeg`, `maxSpeedFov`, `minImpulseIntervalMS`) is persist-only:
 * read on load, written back on clone/export, never used by the kernel.
 */

/** Default used only when hydrating old archives that store dimensionless `fov`. */
export const CMOS_SHAKE_LEGACY_FOV_TO_VELOCITY = 8;

export interface CmosShakeEffectPreset {
  label: string;
  /** MSMD 位置阶跃 (°); 正=变宽，负=变窄 */
  impulsePosDeg: number;
  /** MSMD 速度冲量 (°/s) */
  impulseVelDeg: number;
  /**
   * Persist alias of dimensionless FOV impulse (`impulseVelDeg / fovToVelocity`).
   * Not read by the kernel after normalize.
   */
  fov: number;
  /**
   * Persist alias of `impulsePosDeg`. Not read by the kernel after normalize.
   */
  fovKickDeg: number;
  /** 位移通道 MSMD 位置阶跃（米）；正=沿方向推出 */
  impulsePosM: number;
  /** 位移通道 MSMD 速度冲量（米/秒） */
  impulseVelM: number;
  /**
   * XY 平面方位角 (°)。相机为原点：0=屏幕右，90=上，180=左。
   * tilt=0 时此角无效（纯相机 Z）。
   */
  posAzimuthDeg: number;
  /**
   * 相对相机 Z 的倾角 (°)，0～90。0=纯 Z，90=纯 XY 方位。
   */
  posTiltDeg: number;
}

export type CmosDebugImpulse = {
  impulsePosDeg: number;
  impulseVelDeg: number;
  /** Persist alias */
  fov: number;
  /** Persist alias */
  fovKickDeg: number;
  impulsePosM: number;
  impulseVelM: number;
};

export type CmosShakeConfig = {
  enabled: boolean;
  intensity: number;
  useGameSpeed: boolean;
  fovMass: number;
  fovAngularFreq: number;
  fovDampingRatio: number;
  maxFovDeg: number;
  posMass: number;
  posAngularFreq: number;
  posDampingRatio: number;
  maxPosM: number;
  /** 全局位移方向：XY 方位 (0=右, 90=上)。play 预设时会被预设覆盖写入。 */
  posAzimuthDeg: number;
  /** 全局位移方向：相对相机 Z 的倾角 0～90。 */
  posTiltDeg: number;
  maxDtSec: number;
  substeps: number;
  settleFovDeg: number;
  settleFovVel: number;
  settlePosM: number;
  settlePosVel: number;
  presetOnHitByStrength: CmosShakeStrengthPresets;
  presetOnBlockByStrength: CmosShakeStrengthPresets;
  presets: Record<string, CmosShakeEffectPreset>;
  debugImpulse: CmosDebugImpulse;
  /**
   * Persist-only. Old archives map `preset.fov * fovToVelocity → impulseVelDeg`.
   * Kernel does not multiply by this.
   */
  fovToVelocity: number;
  /** Persist-only. Kernel no longer clamps speed with this. */
  maxSpeedFov: number;
  /** Persist-only. Kernel no longer scales stacked impulses with this. */
  minImpulseIntervalMS: number;
};

export type CmosShakeStrengthBand = 'S' | 'M' | 'L';

export type CmosShakeStrengthPresets = {
  S: string;
  M: string;
  L: string;
};

export function guardStrengthToShakeBand(
  strength: 'L' | 'M' | 'H',
): CmosShakeStrengthBand {
  if (strength === 'L') return 'S';
  if (strength === 'H') return 'L';
  return 'M';
}

export function createDefaultStrengthPresets(
  kind: 'hit' | 'block',
): CmosShakeStrengthPresets {
  void kind;
  return { S: 'S_impact', M: 'M_impact', L: 'L_impact' };
}

export function normalizeStrengthPresets(
  raw: unknown,
  fallback: CmosShakeStrengthPresets,
  legacySingle?: unknown,
): CmosShakeStrengthPresets {
  const legacy =
    typeof legacySingle === 'string' && legacySingle.length > 0
      ? legacySingle
      : null;
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const pick = (band: CmosShakeStrengthBand): string => {
    const v = src[band];
    if (typeof v === 'string') return v;
    if (legacy != null) return legacy;
    return fallback[band];
  };
  return { S: pick('S'), M: pick('M'), L: pick('L') };
}

export function resolveCmosShakePresetId(
  cfg: Pick<CmosShakeConfig, 'presetOnHitByStrength' | 'presetOnBlockByStrength'>,
  kind: 'onHit' | 'onBlock',
  guardStrength: 'L' | 'M' | 'H',
): string {
  const band = guardStrengthToShakeBand(guardStrength);
  const table =
    kind === 'onHit' ? cfg.presetOnHitByStrength : cfg.presetOnBlockByStrength;
  const id = table?.[band];
  return typeof id === 'string' ? id : '';
}

function finiteNum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function numOr(v: unknown, fb: number): number {
  const n = finiteNum(v);
  return n != null ? n : fb;
}

/** Hydrate MSMD impulse from new fields, else old persist aliases. */
export function hydrateImpulseFromPersist(
  raw: {
    impulsePosDeg?: unknown;
    impulseVelDeg?: unknown;
    fov?: unknown;
    fovKickDeg?: unknown;
    /** Old oscillate persist: treat as position step. */
    ampFovDeg?: unknown;
  } | null | undefined,
  fallback: { impulsePosDeg: number; impulseVelDeg: number },
  fovToVelocity: number,
): { impulsePosDeg: number; impulseVelDeg: number } {
  const src = raw && typeof raw === 'object' ? raw : {};
  const toV =
    Number.isFinite(fovToVelocity) && fovToVelocity !== 0
      ? fovToVelocity
      : CMOS_SHAKE_LEGACY_FOV_TO_VELOCITY;

  const pos =
    finiteNum(src.impulsePosDeg) ??
    finiteNum(src.fovKickDeg) ??
    finiteNum(src.ampFovDeg) ??
    fallback.impulsePosDeg;

  const velDirect = finiteNum(src.impulseVelDeg);
  const velFromFov = finiteNum(src.fov);
  const vel =
    velDirect ??
    (velFromFov != null ? velFromFov * toV : fallback.impulseVelDeg);

  return { impulsePosDeg: pos, impulseVelDeg: vel };
}

function persistAliases(
  impulsePosDeg: number,
  impulseVelDeg: number,
  fovToVelocity: number,
): { fov: number; fovKickDeg: number } {
  const toV =
    Number.isFinite(fovToVelocity) && fovToVelocity !== 0
      ? fovToVelocity
      : CMOS_SHAKE_LEGACY_FOV_TO_VELOCITY;
  return {
    fovKickDeg: impulsePosDeg,
    fov: impulseVelDeg / toV,
  };
}

export function normalizeCmosShakeEffectPreset(
  id: string,
  raw: Partial<CmosShakeEffectPreset> | CmosShakeEffectPreset | null | undefined,
  fallback?: Partial<CmosShakeEffectPreset> | null,
  fovToVelocity: number = CMOS_SHAKE_LEGACY_FOV_TO_VELOCITY,
): CmosShakeEffectPreset {
  const f = fallback ?? {};
  const labelRaw = raw && typeof raw === 'object' ? raw.label : undefined;
  const label =
    typeof labelRaw === 'string' && labelRaw.length > 0
      ? labelRaw
      : typeof f.label === 'string' && f.label.length > 0
        ? f.label
        : id;
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<CmosShakeEffectPreset>;
  const fbHydrate = hydrateImpulseFromPersist(
    f,
    { impulsePosDeg: 0, impulseVelDeg: 0 },
    fovToVelocity,
  );
  const hyd = hydrateImpulseFromPersist(src, fbHydrate, fovToVelocity);
  const aliases = persistAliases(hyd.impulsePosDeg, hyd.impulseVelDeg, fovToVelocity);

  const wrap360 = (v: number) => {
    const x = v % 360;
    return x < 0 ? x + 360 : x;
  };
  const clampTilt = (v: number) => Math.max(0, Math.min(90, v));

  return {
    label,
    impulsePosDeg: hyd.impulsePosDeg,
    impulseVelDeg: hyd.impulseVelDeg,
    fov: aliases.fov,
    fovKickDeg: aliases.fovKickDeg,
    impulsePosM: numOr(src.impulsePosM, numOr(f.impulsePosM, 0)),
    impulseVelM: numOr(src.impulseVelM, numOr(f.impulseVelM, 0)),
    posAzimuthDeg: wrap360(numOr(src.posAzimuthDeg, numOr(f.posAzimuthDeg, 0))),
    posTiltDeg: clampTilt(numOr(src.posTiltDeg, numOr(f.posTiltDeg, 0))),
  };
}

export function cloneCmosShakePresets(
  src: Record<string, CmosShakeEffectPreset>,
  fovToVelocity: number = CMOS_SHAKE_LEGACY_FOV_TO_VELOCITY,
): Record<string, CmosShakeEffectPreset> {
  const out: Record<string, CmosShakeEffectPreset> = {};
  for (const [id, p] of Object.entries(src ?? {})) {
    if (!p || typeof p !== 'object') continue;
    out[id] = normalizeCmosShakeEffectPreset(id, p, null, fovToVelocity);
  }
  return out;
}

export function normalizeCmosDebugImpulse(
  raw: Partial<CmosDebugImpulse> | null | undefined,
  fallback?: CmosDebugImpulse | null,
  fovToVelocity: number = CMOS_SHAKE_LEGACY_FOV_TO_VELOCITY,
): CmosDebugImpulse {
  const f = fallback ?? {
    impulsePosDeg: 0,
    impulseVelDeg: 0,
    fov: 0,
    fovKickDeg: 0,
    impulsePosM: 0,
    impulseVelM: 0,
  };
  const hyd = hydrateImpulseFromPersist(raw, f, fovToVelocity);
  const aliases = persistAliases(hyd.impulsePosDeg, hyd.impulseVelDeg, fovToVelocity);
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    impulsePosDeg: hyd.impulsePosDeg,
    impulseVelDeg: hyd.impulseVelDeg,
    fov: aliases.fov,
    fovKickDeg: aliases.fovKickDeg,
    impulsePosM: numOr(src.impulsePosM, f.impulsePosM ?? 0),
    impulseVelM: numOr(src.impulseVelM, f.impulseVelM ?? 0),
  };
}

export function mergeCmosShakePresets(
  base: Record<string, CmosShakeEffectPreset>,
  incoming?:
    | Record<string, Partial<CmosShakeEffectPreset> | CmosShakeEffectPreset>
    | null,
  fovToVelocity: number = CMOS_SHAKE_LEGACY_FOV_TO_VELOCITY,
): Record<string, CmosShakeEffectPreset> {
  if (!incoming || typeof incoming !== 'object') {
    return cloneCmosShakePresets(base, fovToVelocity);
  }
  const keys = Object.keys(incoming);
  if (keys.length === 0) {
    return cloneCmosShakePresets(base, fovToVelocity);
  }
  const out: Record<string, CmosShakeEffectPreset> = {};
  for (const id of keys) {
    const raw = incoming[id];
    if (!raw || typeof raw !== 'object') continue;
    out[id] = normalizeCmosShakeEffectPreset(id, raw, base[id], fovToVelocity);
  }
  const factory = createDefaultCmosShakePresets(fovToVelocity);
  for (const id of ['S_impact', 'M_impact', 'L_impact'] as const) {
    if (!out[id] && factory[id]) out[id] = factory[id]!;
  }
  return out;
}

function impulsePreset(
  label: string,
  partial: Partial<CmosShakeEffectPreset>,
  fovToVelocity: number,
): CmosShakeEffectPreset {
  return normalizeCmosShakeEffectPreset(
    label,
    {
      label,
      ...partial,
    },
    null,
    fovToVelocity,
  );
}

export function createDefaultCmosShakePresets(
  fovToVelocity: number = CMOS_SHAKE_LEGACY_FOV_TO_VELOCITY,
): Record<string, CmosShakeEffectPreset> {
  const p = (
    label: string,
    vel: number,
    pos: number,
    extra?: Partial<CmosShakeEffectPreset>,
  ) =>
    impulsePreset(
      label,
      { impulseVelDeg: vel, impulsePosDeg: pos, ...extra },
      fovToVelocity,
    );
  return {
    tap: p('轻点', -0.64, -0.12, { impulsePosM: 0.03, impulseVelM: 0.15 }),
    tick: p('轻击', -1.12, -0.22, { impulsePosM: 0.045, impulseVelM: 0.22 }),
    S_impact: p('轻攻击冲击', -1.28, -0.28, {
      impulsePosM: 0.05,
      impulseVelM: 0.28,
    }),
    M_impact: p('中攻击冲击', -1.76, -0.42, {
      impulsePosM: 0.08,
      impulseVelM: 0.42,
    }),
    L_impact: p('重攻击冲击', -2.56, -0.7, {
      impulsePosM: 0.12,
      impulseVelM: 0.65,
    }),
    impact: p('主冲击', -1.76, -0.42, { impulsePosM: 0.08, impulseVelM: 0.42 }),
    heavy: p('重击', -2.56, -0.7, { impulsePosM: 0.12, impulseVelM: 0.65 }),
    error: p('错误', 1.6, 0.35),
    nudge: p('轻推', -0.8, -0.16),
    settle: p('落定', -0.96, -0.2),
    thud: p('顿挫', -1.44, -0.4),
    swayLR: p('左右平移', -1.44, -0.12, {
      impulsePosM: 0.08,
      impulseVelM: 0.4,
      posAzimuthDeg: 0,
      posTiltDeg: 90,
    }),
    bounceUD: p('上下来回', -1.76, -0.18, {
      impulsePosM: 0.08,
      impulseVelM: 0.4,
      posAzimuthDeg: 90,
      posTiltDeg: 90,
    }),
    doubleKick: p('双重冲击', -2.24, -0.35),
    swayAngle: p('FOV 摆动', 0, 0.55),
    rumble: p('持续微抖', 0, 0.22),
  };
}

export function createDefaultCmosShakeConfig(): CmosShakeConfig {
  const fovToVelocity = CMOS_SHAKE_LEGACY_FOV_TO_VELOCITY;
  return {
    enabled: true,
    intensity: 1,
    useGameSpeed: false,
    fovMass: 1,
    fovAngularFreq: 20,
    fovDampingRatio: 0.68,
    maxFovDeg: 2.5,
    posMass: 1,
    posAngularFreq: 18,
    posDampingRatio: 0.55,
    maxPosM: 0.45,
    posAzimuthDeg: 0,
    posTiltDeg: 0,
    maxDtSec: 0.05,
    substeps: 4,
    settleFovDeg: 0.02,
    settleFovVel: 0.2,
    settlePosM: 0.002,
    settlePosVel: 0.02,
    presetOnHitByStrength: createDefaultStrengthPresets('hit'),
    presetOnBlockByStrength: createDefaultStrengthPresets('block'),
    presets: createDefaultCmosShakePresets(fovToVelocity),
    debugImpulse: normalizeCmosDebugImpulse(
      {
        impulseVelDeg: -2,
        impulsePosDeg: 0,
        impulsePosM: 0.08,
        impulseVelM: 0.4,
      },
      null,
      fovToVelocity,
    ),
    fovToVelocity,
    maxSpeedFov: 40,
    minImpulseIntervalMS: 0,
  };
}

export function cloneCmosShakeConfig(src: CmosShakeConfig): CmosShakeConfig {
  const toV = src.fovToVelocity ?? CMOS_SHAKE_LEGACY_FOV_TO_VELOCITY;
  return {
    ...src,
    presetOnHitByStrength: { ...src.presetOnHitByStrength },
    presetOnBlockByStrength: { ...src.presetOnBlockByStrength },
    presets: cloneCmosShakePresets(src.presets, toV),
    debugImpulse: normalizeCmosDebugImpulse(src.debugImpulse, null, toV),
  };
}

export function mergeCmosShakeConfig(
  base: CmosShakeConfig,
  incoming: Partial<CmosShakeConfig> | Record<string, unknown> | null | undefined,
): CmosShakeConfig {
  if (!incoming || typeof incoming !== 'object') {
    return cloneCmosShakeConfig(base);
  }
  const bool = (v: unknown, fb: boolean): boolean =>
    typeof v === 'boolean' ? v : fb;

  const fovToVelocity = numOr(
    incoming.fovToVelocity,
    base.fovToVelocity ?? CMOS_SHAKE_LEGACY_FOV_TO_VELOCITY,
  );

  return {
    enabled: bool(incoming.enabled, base.enabled),
    intensity: Math.max(0, Math.min(1, numOr(incoming.intensity, base.intensity))),
    useGameSpeed: bool(incoming.useGameSpeed, base.useGameSpeed),
    fovMass: numOr(incoming.fovMass, base.fovMass),
    fovAngularFreq: numOr(incoming.fovAngularFreq, base.fovAngularFreq),
    fovDampingRatio: numOr(incoming.fovDampingRatio, base.fovDampingRatio),
    maxFovDeg: numOr(incoming.maxFovDeg, base.maxFovDeg),
    posMass: numOr(incoming.posMass, base.posMass),
    posAngularFreq: numOr(incoming.posAngularFreq, base.posAngularFreq),
    posDampingRatio: numOr(incoming.posDampingRatio, base.posDampingRatio),
    maxPosM: numOr(incoming.maxPosM, base.maxPosM),
    posAzimuthDeg: ((v: number) => {
      const x = v % 360;
      return x < 0 ? x + 360 : x;
    })(numOr(incoming.posAzimuthDeg, base.posAzimuthDeg)),
    posTiltDeg: Math.max(
      0,
      Math.min(90, numOr(incoming.posTiltDeg, base.posTiltDeg)),
    ),
    maxDtSec: numOr(incoming.maxDtSec, base.maxDtSec),
    substeps: Math.max(1, Math.floor(numOr(incoming.substeps, base.substeps))),
    settleFovDeg: numOr(incoming.settleFovDeg, base.settleFovDeg),
    settleFovVel: numOr(incoming.settleFovVel, base.settleFovVel),
    settlePosM: numOr(incoming.settlePosM, base.settlePosM),
    settlePosVel: numOr(incoming.settlePosVel, base.settlePosVel),
    presetOnHitByStrength: normalizeStrengthPresets(
      incoming.presetOnHitByStrength,
      base.presetOnHitByStrength,
      (incoming as { presetOnHit?: unknown }).presetOnHit,
    ),
    presetOnBlockByStrength: normalizeStrengthPresets(
      incoming.presetOnBlockByStrength,
      base.presetOnBlockByStrength,
      (incoming as { presetOnBlock?: unknown }).presetOnBlock,
    ),
    presets: mergeCmosShakePresets(
      base.presets,
      incoming.presets as
        | Record<string, Partial<CmosShakeEffectPreset> | CmosShakeEffectPreset>
        | undefined,
      fovToVelocity,
    ),
    debugImpulse: normalizeCmosDebugImpulse(
      incoming.debugImpulse as Partial<CmosDebugImpulse> | undefined,
      base.debugImpulse,
      fovToVelocity,
    ),
    fovToVelocity,
    maxSpeedFov: numOr(incoming.maxSpeedFov, base.maxSpeedFov),
    minImpulseIntervalMS: numOr(
      incoming.minImpulseIntervalMS,
      base.minImpulseIntervalMS,
    ),
  };
}

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
}

export type CmosDebugImpulse = {
  impulsePosDeg: number;
  impulseVelDeg: number;
  /** Persist alias */
  fov: number;
  /** Persist alias */
  fovKickDeg: number;
};

export type CmosShakeConfig = {
  enabled: boolean;
  intensity: number;
  useGameSpeed: boolean;
  fovMass: number;
  fovAngularFreq: number;
  fovDampingRatio: number;
  maxFovDeg: number;
  maxDtSec: number;
  substeps: number;
  settleFovDeg: number;
  settleFovVel: number;
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
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
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

  return {
    label,
    impulsePosDeg: hyd.impulsePosDeg,
    impulseVelDeg: hyd.impulseVelDeg,
    fov: aliases.fov,
    fovKickDeg: aliases.fovKickDeg,
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
  };
  const hyd = hydrateImpulseFromPersist(raw, f, fovToVelocity);
  const aliases = persistAliases(hyd.impulsePosDeg, hyd.impulseVelDeg, fovToVelocity);
  return {
    impulsePosDeg: hyd.impulsePosDeg,
    impulseVelDeg: hyd.impulseVelDeg,
    fov: aliases.fov,
    fovKickDeg: aliases.fovKickDeg,
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
  const p = (label: string, vel: number, pos: number) =>
    impulsePreset(label, { impulseVelDeg: vel, impulsePosDeg: pos }, fovToVelocity);
  return {
    tap: p('轻点', -0.64, -0.12),
    tick: p('轻击', -1.12, -0.22),
    S_impact: p('轻攻击冲击', -1.28, -0.28),
    M_impact: p('中攻击冲击', -1.76, -0.42),
    L_impact: p('重攻击冲击', -2.56, -0.7),
    impact: p('主冲击', -1.76, -0.42),
    heavy: p('重击', -2.56, -0.7),
    error: p('错误', 1.6, 0.35),
    nudge: p('轻推', -0.8, -0.16),
    settle: p('落定', -0.96, -0.2),
    thud: p('顿挫', -1.44, -0.4),
    swayLR: p('FOV 来回', -1.44, -0.12),
    bounceUD: p('FOV 脉冲', -1.76, -0.18),
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
    maxDtSec: 0.05,
    substeps: 4,
    settleFovDeg: 0.02,
    settleFovVel: 0.2,
    presetOnHitByStrength: createDefaultStrengthPresets('hit'),
    presetOnBlockByStrength: createDefaultStrengthPresets('block'),
    presets: createDefaultCmosShakePresets(fovToVelocity),
    debugImpulse: normalizeCmosDebugImpulse(
      { impulseVelDeg: -2, impulsePosDeg: 0 },
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
    maxDtSec: numOr(incoming.maxDtSec, base.maxDtSec),
    substeps: Math.max(1, Math.floor(numOr(incoming.substeps, base.substeps))),
    settleFovDeg: numOr(incoming.settleFovDeg, base.settleFovDeg),
    settleFovVel: numOr(incoming.settleFovVel, base.settleFovVel),
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

/**
 * CMOS 屏幕震动 — 纯运动核（无 Three.js / 渲染依赖）
 *
 * FOV：一根 MSMD。
 * 相机位移：相机局部 XYZ 各一根 MSMD。每次冲量按该次方向分解后叠加，
 * 不同预设可同时沿不同方向回弹，互不抢同一根标量弹簧。
 *
 * 方向 = 球面：azimuth φ（XY：0°=右，90°=上），tilt θ（0°=相机 +Z，90°=纯 XY）。
 */

import { SpringDamper1D, type SpringDamper1DParams } from './SpringDamper1D';
import { CONFIG } from '../config/store';
import {
  normalizeCmosShakeEffectPreset,
  type CmosShakeEffectPreset,
} from '../config/cmosShake';

const CLAMP_VEL_SCALE = 0.5;

export type CmosShakePresetId = string;

export const CMOS_SHAKE_BUILTIN_IDS = [
  'tap',
  'tick',
  'S_impact',
  'M_impact',
  'L_impact',
  'impact',
  'heavy',
  'error',
  'nudge',
  'settle',
  'swayAngle',
  'swayLR',
  'bounceUD',
  'doubleKick',
  'rumble',
  'thud',
] as const;

export interface ImpulseArgs {
  impulseVelDeg?: number;
  impulsePosDeg?: number;
  impulseVelM?: number;
  impulsePosM?: number;
  posAzimuthDeg?: number;
  posTiltDeg?: number;
}

export interface PresetOverride {
  impulseVelDeg?: number;
  impulsePosDeg?: number;
  impulseVelM?: number;
  impulsePosM?: number;
  posAzimuthDeg?: number;
  posTiltDeg?: number;
}

export interface CmosShakeDir {
  x: number;
  y: number;
  z: number;
}

export interface CmosShakeOutput {
  fov: number;
  /** 相机局部位移（米） */
  offset: CmosShakeDir;
  /** |offset|，兼容旧读法 */
  pos: number;
  dir: CmosShakeDir;
}

const DEG2RAD = Math.PI / 180;

export function wrapAzimuthDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const x = deg % 360;
  return x < 0 ? x + 360 : x;
}

export function clampTiltDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return Math.max(0, Math.min(90, deg));
}

/** 相机局部单位方向：φ=azimuth，θ=tilt。θ=0 → (0,0,1)。 */
export function cmosShakePosDir(azimuthDeg: number, tiltDeg: number): CmosShakeDir {
  const phi = wrapAzimuthDeg(azimuthDeg) * DEG2RAD;
  const theta = clampTiltDeg(tiltDeg) * DEG2RAD;
  const s = Math.sin(theta);
  return {
    x: s * Math.cos(phi),
    y: s * Math.sin(phi),
    z: Math.cos(theta),
  };
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function softClampAxis(s: SpringDamper1D, maxAbs: number): void {
  if (!(maxAbs > 0) || !Number.isFinite(maxAbs)) return;
  if (s.x > maxAbs) {
    s.x = maxAbs;
    s.v *= CLAMP_VEL_SCALE;
  } else if (s.x < -maxAbs) {
    s.x = -maxAbs;
    s.v *= CLAMP_VEL_SCALE;
  }
}

function softClampVec3(
  x: SpringDamper1D,
  y: SpringDamper1D,
  z: SpringDamper1D,
  maxAbs: number,
): void {
  if (!(maxAbs > 0) || !Number.isFinite(maxAbs)) return;
  const mag = Math.hypot(x.x, y.x, z.x);
  if (mag <= maxAbs || mag < 1e-12) return;
  const s = maxAbs / mag;
  x.x *= s;
  y.x *= s;
  z.x *= s;
  x.v *= CLAMP_VEL_SCALE;
  y.v *= CLAMP_VEL_SCALE;
  z.v *= CLAMP_VEL_SCALE;
}

export class CmosScreenShake {
  readonly fov = new SpringDamper1D();
  readonly posX = new SpringDamper1D();
  readonly posY = new SpringDamper1D();
  readonly posZ = new SpringDamper1D();

  private intensityOverride: number | null = null;

  setIntensity(v: number): void {
    this.intensityOverride = clampNum(v, 0, 1);
  }

  getIntensity(): number {
    if (this.intensityOverride != null) return this.intensityOverride;
    const cfg = CONFIG.cmosShake;
    if (!cfg?.enabled) return 0;
    return clampNum(cfg.intensity ?? 0, 0, 1);
  }

  hardReset(): void {
    this.fov.reset(0, 0);
    this.posX.reset(0, 0);
    this.posY.reset(0, 0);
    this.posZ.reset(0, 0);
  }

  clearPending(): void {
    // MSMD 单次冲量无排程；保留 API 以免面板/宿主旧调用报错。
  }

  step(dtSec: number): void {
    const cfg = CONFIG.cmosShake;
    if (!cfg || !cfg.enabled) {
      this.hardReset();
      return;
    }

    const dt = Math.max(0, dtSec);
    const pFov: SpringDamper1DParams = {
      mass: cfg.fovMass,
      angularFreq: cfg.fovAngularFreq,
      dampingRatio: cfg.fovDampingRatio,
    };
    const pPos: SpringDamper1DParams = {
      mass: cfg.posMass ?? 1,
      angularFreq: cfg.posAngularFreq ?? 18,
      dampingRatio: cfg.posDampingRatio ?? 0.55,
    };

    this.fov.step(dt, 0, pFov, cfg.maxDtSec, cfg.substeps);
    this.posX.step(dt, 0, pPos, cfg.maxDtSec, cfg.substeps);
    this.posY.step(dt, 0, pPos, cfg.maxDtSec, cfg.substeps);
    this.posZ.step(dt, 0, pPos, cfg.maxDtSec, cfg.substeps);
    softClampAxis(this.fov, cfg.maxFovDeg);
    softClampVec3(this.posX, this.posY, this.posZ, cfg.maxPosM);
  }

  impulse(args: ImpulseArgs): void {
    const cfg = CONFIG.cmosShake;
    if (!cfg || !cfg.enabled) return;

    const I = this.getIntensity();
    if (I <= 0) return;

    const vFov = args.impulseVelDeg ?? 0;
    const posFov = args.impulsePosDeg ?? 0;
    const vPos = args.impulseVelM ?? 0;
    const xPos = args.impulsePosM ?? 0;
    if (
      !Number.isFinite(vFov) ||
      !Number.isFinite(posFov) ||
      !Number.isFinite(vPos) ||
      !Number.isFinite(xPos)
    ) {
      return;
    }

    const az =
      args.posAzimuthDeg != null && Number.isFinite(args.posAzimuthDeg)
        ? args.posAzimuthDeg
        : (cfg.posAzimuthDeg ?? 0);
    const tilt =
      args.posTiltDeg != null && Number.isFinite(args.posTiltDeg)
        ? args.posTiltDeg
        : (cfg.posTiltDeg ?? 0);
    const dir = cmosShakePosDir(az, tilt);

    this.fov.v += vFov;
    this.fov.x += posFov;
    this.posX.v += vPos * dir.x;
    this.posY.v += vPos * dir.y;
    this.posZ.v += vPos * dir.z;
    this.posX.x += xPos * dir.x;
    this.posY.x += xPos * dir.y;
    this.posZ.x += xPos * dir.z;
    softClampAxis(this.fov, cfg.maxFovDeg);
    softClampVec3(this.posX, this.posY, this.posZ, cfg.maxPosM);
  }

  play(id: CmosShakePresetId, override?: Partial<PresetOverride>): void {
    if (!id || typeof id !== 'string') return;
    const raw = CONFIG.cmosShake?.presets?.[id];
    if (!raw) {
      if (typeof console !== 'undefined') {
        console.warn(`[cmosShake] unknown preset id: ${id}`);
      }
      return;
    }
    const preset = normalizeCmosShakeEffectPreset(id, {
      ...raw,
      ...override,
    });
    this.playPreset(preset);
  }

  playPreset(preset: CmosShakeEffectPreset): void {
    const cfg = CONFIG.cmosShake;
    if (!cfg || !cfg.enabled) return;
    if (this.getIntensity() <= 0) return;
    this.impulse({
      impulseVelDeg: preset.impulseVelDeg,
      impulsePosDeg: preset.impulsePosDeg,
      impulseVelM: preset.impulseVelM,
      impulsePosM: preset.impulsePosM,
      posAzimuthDeg: preset.posAzimuthDeg,
      posTiltDeg: preset.posTiltDeg,
    });
  }

  hasPreset(id: CmosShakePresetId): boolean {
    return !!(id && CONFIG.cmosShake?.presets?.[id]);
  }

  listPresetIds(): string[] {
    const p = CONFIG.cmosShake?.presets;
    if (!p) return [];
    return Object.keys(p).sort((a, b) => a.localeCompare(b));
  }

  getOutput(): CmosShakeOutput {
    const cfg = CONFIG.cmosShake;
    const I = this.getIntensity();
    const offset: CmosShakeDir = {
      x: this.posX.x * I,
      y: this.posY.x * I,
      z: this.posZ.x * I,
    };
    const pos = Math.hypot(offset.x, offset.y, offset.z);
    const dir =
      pos > 1e-12
        ? { x: offset.x / pos, y: offset.y / pos, z: offset.z / pos }
        : cmosShakePosDir(cfg?.posAzimuthDeg ?? 0, cfg?.posTiltDeg ?? 0);
    if (!cfg || !cfg.enabled || I <= 0) {
      return { fov: 0, pos: 0, offset: { x: 0, y: 0, z: 0 }, dir };
    }
    const maxF = cfg.maxFovDeg;
    return {
      fov: clampNum(this.fov.x, -maxF, maxF) * I,
      offset,
      pos,
      dir,
    };
  }

  isSettled(): boolean {
    const cfg = CONFIG.cmosShake;
    if (!cfg) return true;
    const d = cfg.settlePosM;
    const v = cfg.settlePosVel;
    return (
      this.fov.isSettled(0, cfg.settleFovDeg, cfg.settleFovVel) &&
      this.posX.isSettled(0, d, v) &&
      this.posY.isSettled(0, d, v) &&
      this.posZ.isSettled(0, d, v)
    );
  }
}

export function __cmosScreenShakeSelfTest(): string[] {
  const errors: string[] = [];
  const backup = { ...CONFIG.cmosShake };
  const presetsBackup = { ...CONFIG.cmosShake.presets };

  try {
    CONFIG.cmosShake.enabled = true;
    CONFIG.cmosShake.intensity = 1;
    CONFIG.cmosShake.fovMass = 1;
    CONFIG.cmosShake.fovAngularFreq = 14;
    CONFIG.cmosShake.fovDampingRatio = 1;
    CONFIG.cmosShake.maxFovDeg = 20;
    CONFIG.cmosShake.posMass = 1;
    CONFIG.cmosShake.posAngularFreq = 14;
    CONFIG.cmosShake.posDampingRatio = 1;
    CONFIG.cmosShake.maxPosM = 2;
    CONFIG.cmosShake.posAzimuthDeg = 0;
    CONFIG.cmosShake.posTiltDeg = 0;
    CONFIG.cmosShake.maxDtSec = 1 / 30;
    CONFIG.cmosShake.substeps = 4;
    CONFIG.cmosShake.settleFovDeg = 0.05;
    CONFIG.cmosShake.settleFovVel = 0.5;
    CONFIG.cmosShake.settlePosM = 0.002;
    CONFIG.cmosShake.settlePosVel = 0.02;

    const a = new CmosScreenShake();
    a.impulse({ impulseVelDeg: 4, impulsePosDeg: 0 });
    for (let i = 0; i < 180; i += 1) a.step(1 / 60);
    if (!a.isSettled()) {
      errors.push('critical damping should settle near zero after impulse');
    }

    CONFIG.cmosShake.fovDampingRatio = 0.35;
    const b = new CmosScreenShake();
    b.impulse({ impulseVelDeg: 0, impulsePosDeg: 2 });
    let crossed = false;
    let prev = b.fov.x;
    for (let i = 0; i < 90; i += 1) {
      b.step(1 / 60);
      if (prev > 0 && b.fov.x < 0) crossed = true;
      if (prev < 0 && b.fov.x > 0) crossed = true;
      prev = b.fov.x;
    }
    if (!crossed) {
      errors.push('underdamped FOV should overshoot past zero at least once');
    }

    CONFIG.cmosShake.intensity = 0;
    const c = new CmosScreenShake();
    c.impulse({ impulseVelDeg: 4, impulsePosDeg: -1 });
    const out = c.getOutput();
    if (
      Math.abs(c.fov.v) > 1e-9 ||
      Math.abs(out.fov) > 1e-9 ||
      Math.abs(c.posX.v) > 1e-9 ||
      Math.abs(c.posY.v) > 1e-9 ||
      Math.abs(c.posZ.v) > 1e-9 ||
      Math.abs(out.pos) > 1e-9
    ) {
      errors.push('intensity=0 must ignore impulse and output zero');
    }

    CONFIG.cmosShake.intensity = 1;
    CONFIG.cmosShake.fovDampingRatio = 1;
    const dFov = new CmosScreenShake();
    dFov.impulse({ impulseVelDeg: 0, impulsePosDeg: -1.5 });
    if (Math.abs(dFov.fov.x - -1.5) > 1e-6) {
      errors.push(`impulsePosDeg should set fov≈-1.5, got ${dFov.fov.x}`);
    }

    CONFIG.cmosShake.presets = {
      ...CONFIG.cmosShake.presets,
      __testPlay: normalizeCmosShakeEffectPreset('__testPlay', {
        label: 'test',
        impulseVelDeg: 4,
        impulsePosDeg: 0,
      }),
    };
    const e = new CmosScreenShake();
    e.play('__testPlay');
    if (!(Math.abs(e.fov.v) > 1e-3)) {
      errors.push('play should produce non-zero FOV velocity');
    }

    const zDir = cmosShakePosDir(90, 0);
    if (Math.abs(zDir.x) > 1e-9 || Math.abs(zDir.y) > 1e-9 || Math.abs(zDir.z - 1) > 1e-9) {
      errors.push('tilt=0 must be camera +Z regardless of azimuth');
    }
    const right = cmosShakePosDir(0, 90);
    if (Math.abs(right.x - 1) > 1e-9 || Math.abs(right.y) > 1e-9 || Math.abs(right.z) > 1e-9) {
      errors.push('azimuth=0 tilt=90 must be camera +X');
    }
    const up = cmosShakePosDir(90, 90);
    if (Math.abs(up.x) > 1e-9 || Math.abs(up.y - 1) > 1e-9 || Math.abs(up.z) > 1e-9) {
      errors.push('azimuth=90 tilt=90 must be camera +Y');
    }

    CONFIG.cmosShake.posDampingRatio = 1;
    CONFIG.cmosShake.posAngularFreq = 16;
    const fPos = new CmosScreenShake();
    fPos.impulse({ impulseVelM: 0, impulsePosM: 0.2, posTiltDeg: 90, posAzimuthDeg: 0 });
    if (Math.abs(fPos.posX.x - 0.2) > 1e-6) {
      errors.push(`impulse along +X should set posX≈0.2, got ${fPos.posX.x}`);
    }
    CONFIG.cmosShake.posTiltDeg = 90;
    CONFIG.cmosShake.posAzimuthDeg = 90;
    const g = new CmosScreenShake();
    g.playPreset(
      normalizeCmosShakeEffectPreset('__alongZ', {
        label: 'alongZ',
        impulsePosM: 0.1,
        posTiltDeg: 0,
        posAzimuthDeg: 0,
      }),
    );
    if (Math.abs(CONFIG.cmosShake.posTiltDeg - 90) > 1e-9) {
      errors.push('play must not overwrite global posTiltDeg');
    }
    if (Math.abs(g.posZ.x - 0.1) > 1e-6 || Math.abs(g.posY.x) > 1e-6) {
      errors.push('preset tilt=0 must impulse camera Z, not global dir');
    }
  } finally {
    Object.assign(CONFIG.cmosShake, backup);
    CONFIG.cmosShake.presets = presetsBackup;
  }

  return errors;
}

/**
 * CMOS 屏幕震动 — 纯运动核（无 Three.js / 渲染依赖）
 *
 * 仅 FOV 通道 MSMD（spring.1d.msmd）：目标恒为 0；
 * 激励 = 位置阶跃 impulsePosDeg + 速度冲量 impulseVelDeg（度 / °/s）。
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
}

export interface PresetOverride {
  impulseVelDeg?: number;
  impulsePosDeg?: number;
}

export interface CmosShakeOutput {
  fov: number;
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

export class CmosScreenShake {
  readonly fov = new SpringDamper1D();

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

    const pFov: SpringDamper1DParams = {
      mass: cfg.fovMass,
      angularFreq: cfg.fovAngularFreq,
      dampingRatio: cfg.fovDampingRatio,
    };

    this.fov.step(Math.max(0, dtSec), 0, pFov, cfg.maxDtSec, cfg.substeps);
    softClampAxis(this.fov, cfg.maxFovDeg);
  }

  impulse(args: ImpulseArgs): void {
    const cfg = CONFIG.cmosShake;
    if (!cfg || !cfg.enabled) return;

    const I = this.getIntensity();
    if (I <= 0) return;

    const vFov = args.impulseVelDeg ?? 0;
    const posFov = args.impulsePosDeg ?? 0;
    if (!Number.isFinite(vFov) || !Number.isFinite(posFov)) {
      return;
    }

    this.fov.v += vFov;
    this.fov.x += posFov;
    softClampAxis(this.fov, cfg.maxFovDeg);
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
    if (!cfg || !cfg.enabled || I <= 0) {
      return { fov: 0 };
    }
    const maxF = cfg.maxFovDeg;
    return {
      fov: clampNum(this.fov.x, -maxF, maxF) * I,
    };
  }

  isSettled(): boolean {
    const cfg = CONFIG.cmosShake;
    if (!cfg) return true;
    return this.fov.isSettled(0, cfg.settleFovDeg, cfg.settleFovVel);
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
    CONFIG.cmosShake.maxDtSec = 1 / 30;
    CONFIG.cmosShake.substeps = 4;
    CONFIG.cmosShake.settleFovDeg = 0.05;
    CONFIG.cmosShake.settleFovVel = 0.5;

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
    if (Math.abs(c.fov.v) > 1e-9 || Math.abs(out.fov) > 1e-9) {
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
  } finally {
    Object.assign(CONFIG.cmosShake, backup);
    CONFIG.cmosShake.presets = presetsBackup;
  }

  return errors;
}

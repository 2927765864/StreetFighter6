import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultCmosShakeConfig,
  guardStrengthToShakeBand,
  normalizeCmosShakeEffectPreset,
  resolveCmosShakePresetId,
} from '../../src/config/cmosShake';
import {
  applyConfig,
  cloneConfig,
  CONFIG,
  mergeConfig,
} from '../../src/config/store';
import { createDefaultRuntimeConfig } from '../../src/config/defaults';
import {
  __cmosScreenShakeSelfTest,
  CmosScreenShake,
} from '../../src/motion/CmosScreenShake';
import { __springDamper1DSelfTest } from '../../src/motion/SpringDamper1D';

describe('SpringDamper1D self-test', () => {
  it('passes critical + underdamped checks', () => {
    expect(__springDamper1DSelfTest()).toEqual([]);
  });
});

describe('CmosScreenShake self-test', () => {
  it('passes contract smoke checks', () => {
    expect(__cmosScreenShakeSelfTest()).toEqual([]);
  });
});

describe('cmosShake config merge / persist shape', () => {
  const backup = cloneConfig(CONFIG);

  afterEach(() => {
    applyConfig(backup, backup);
  });

  it('keeps factory presets when incoming omits presets', () => {
    const base = createDefaultRuntimeConfig();
    const merged = mergeConfig(base, {
      cmosShake: { intensity: 0.5, enabled: false },
    });
    expect(merged.cmosShake.enabled).toBe(false);
    expect(merged.cmosShake.intensity).toBe(0.5);
    expect(merged.cmosShake.presets.impact).toBeTruthy();
    expect(Math.abs(merged.cmosShake.presets.impact.impulseVelDeg)).toBeGreaterThan(0);
  });

  it('incoming presets key set replaces (supports delete)', () => {
    const base = createDefaultRuntimeConfig();
    const merged = mergeConfig(base, {
      cmosShake: {
        presets: {
          onlyMine: normalizeCmosShakeEffectPreset('onlyMine', {
            label: '仅此',
            impulseVelDeg: -2.64,
          }),
        },
      },
    });
    expect(merged.cmosShake.presets.onlyMine.impulseVelDeg).toBeCloseTo(-2.64);
    // 轻中重冲击预设始终补齐，避免映射悬空。
    expect(merged.cmosShake.presets.S_impact).toBeTruthy();
    expect(merged.cmosShake.presets.M_impact).toBeTruthy();
    expect(merged.cmosShake.presets.L_impact).toBeTruthy();
    expect(Object.keys(merged.cmosShake.presets).sort()).toEqual(
      ['L_impact', 'M_impact', 'S_impact', 'onlyMine'].sort(),
    );
  });

  it('intensity 0 ignores impulse', () => {
    const cfg = createDefaultCmosShakeConfig();
    CONFIG.cmosShake = { ...cfg, intensity: 0, enabled: true };
    const s = new CmosScreenShake();
    s.impulse({ impulseVelDeg: 8, impulsePosDeg: 0.2 });
    const out = s.getOutput();
    expect(Math.abs(s.fov.v)).toBeLessThan(1e-9);
    expect(Math.abs(out.fov)).toBeLessThan(1e-9);
  });

  it('FOV channel: kick + spring settle, merge fills fov defaults', () => {
    const base = createDefaultRuntimeConfig();
    expect(base.cmosShake.fovAngularFreq).toBeGreaterThan(0);
    expect(base.cmosShake.maxFovDeg).toBeGreaterThan(0);
    const merged = mergeConfig(base, {
      cmosShake: { fovDampingRatio: 0.9 },
    });
    expect(merged.cmosShake.fovDampingRatio).toBeCloseTo(0.9);
    expect(merged.cmosShake.fovMass).toBe(base.cmosShake.fovMass);

    CONFIG.cmosShake = {
      ...createDefaultCmosShakeConfig(),
      intensity: 1,
      enabled: true,
      fovDampingRatio: 1,
      fovAngularFreq: 16,
    };
    const s = new CmosScreenShake();
    s.impulse({
      impulseVelDeg: 0,
      impulsePosDeg: -1.2,
    });
    expect(s.fov.x).toBeCloseTo(-1.2, 5);
    expect(s.getOutput().fov).toBeCloseTo(-1.2, 5);
    for (let i = 0; i < 180; i += 1) s.step(1 / 60);
    expect(s.isSettled()).toBe(true);
    expect(Math.abs(s.getOutput().fov)).toBeLessThan(0.05);
  });

  it('maps Capcom L/M/H to S/M/L_impact presets', () => {
    const cfg = createDefaultCmosShakeConfig();
    expect(guardStrengthToShakeBand('L')).toBe('S');
    expect(guardStrengthToShakeBand('M')).toBe('M');
    expect(guardStrengthToShakeBand('H')).toBe('L');
    expect(resolveCmosShakePresetId(cfg, 'onHit', 'L')).toBe('S_impact');
    expect(resolveCmosShakePresetId(cfg, 'onHit', 'M')).toBe('M_impact');
    expect(resolveCmosShakePresetId(cfg, 'onHit', 'H')).toBe('L_impact');
    expect(Math.abs(cfg.presets.S_impact.impulsePosDeg)).toBeLessThan(
      Math.abs(cfg.presets.M_impact.impulsePosDeg),
    );
    expect(Math.abs(cfg.presets.M_impact.impulsePosDeg)).toBeLessThan(
      Math.abs(cfg.presets.L_impact.impulsePosDeg),
    );
  });

  it('hydrates old fov × fovToVelocity persist into impulseVelDeg', () => {
    const base = createDefaultRuntimeConfig();
    const merged = mergeConfig(base, {
      cmosShake: {
        fovToVelocity: 8,
        presets: {
          onlyMine: { label: '旧档', fov: -0.33, fovKickDeg: -0.5 },
        },
      },
    });
    expect(merged.cmosShake.presets.onlyMine.impulseVelDeg).toBeCloseTo(-2.64);
    expect(merged.cmosShake.presets.onlyMine.impulsePosDeg).toBeCloseTo(-0.5);
    expect(merged.cmosShake.presets.onlyMine.fov).toBeCloseTo(-0.33);
    expect(merged.cmosShake.presets.onlyMine.fovKickDeg).toBeCloseTo(-0.5);
  });

  it('migrates legacy presetOnHit into all strength bands', () => {
    const base = createDefaultRuntimeConfig();
    const merged = mergeConfig(base, {
      cmosShake: { presetOnHit: 'heavy' },
    });
    expect(merged.cmosShake.presetOnHitByStrength).toEqual({
      S: 'heavy',
      M: 'heavy',
      L: 'heavy',
    });
  });
});

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
  cmosShakePosDir,
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

  it('pos dir: tilt 0 is +Z; tilt 90 follows azimuth', () => {
    const z = cmosShakePosDir(123, 0);
    expect(z.x).toBeCloseTo(0);
    expect(z.y).toBeCloseTo(0);
    expect(z.z).toBeCloseTo(1);
    const right = cmosShakePosDir(0, 90);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
    expect(right.z).toBeCloseTo(0);
    const up = cmosShakePosDir(90, 90);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(1);
    expect(up.z).toBeCloseTo(0);
    const diag = cmosShakePosDir(0, 45);
    expect(diag.x).toBeCloseTo(Math.SQRT1_2);
    expect(diag.z).toBeCloseTo(Math.SQRT1_2);
    expect(diag.y).toBeCloseTo(0);
  });

  it('POS channel: kick + spring settle; merge fills pos defaults', () => {
    const base = createDefaultRuntimeConfig();
    expect(base.cmosShake.posAngularFreq).toBeGreaterThan(0);
    expect(base.cmosShake.maxPosM).toBeGreaterThan(0);
    const merged = mergeConfig(base, {
      cmosShake: { posDampingRatio: 0.8, posAzimuthDeg: 45, posTiltDeg: 30 },
    });
    expect(merged.cmosShake.posDampingRatio).toBeCloseTo(0.8);
    expect(merged.cmosShake.posMass).toBe(base.cmosShake.posMass);
    expect(merged.cmosShake.posAzimuthDeg).toBe(45);
    expect(merged.cmosShake.posTiltDeg).toBe(30);

    CONFIG.cmosShake = {
      ...createDefaultCmosShakeConfig(),
      intensity: 1,
      enabled: true,
      posDampingRatio: 1,
      posAngularFreq: 16,
      posTiltDeg: 90,
      posAzimuthDeg: 0,
    };
    const s = new CmosScreenShake();
    s.impulse({ impulseVelM: 0, impulsePosM: 0.15, posAzimuthDeg: 0, posTiltDeg: 90 });
    expect(s.posX.x).toBeCloseTo(0.15, 5);
    expect(s.getOutput().pos).toBeCloseTo(0.15, 5);
    expect(s.getOutput().dir.x).toBeCloseTo(1);
    expect(s.getOutput().offset.x).toBeCloseTo(0.15, 5);
    for (let i = 0; i < 180; i += 1) s.step(1 / 60);
    expect(s.isSettled()).toBe(true);
    expect(Math.abs(s.getOutput().pos)).toBeLessThan(0.01);
  });

  it('play does not clobber global pos direction; old persist hydrates pos fields', () => {
    const base = createDefaultRuntimeConfig();
    const merged = mergeConfig(base, {
      cmosShake: {
        fovAngularFreq: 40,
        presets: {
          M_impact: { label: '中-冲击', impulsePosDeg: 0.3, impulseVelDeg: -10 },
        },
      },
    });
    expect(merged.cmosShake.posMass).toBe(base.cmosShake.posMass);
    expect(merged.cmosShake.posAzimuthDeg).toBe(0);
    expect(merged.cmosShake.presets.M_impact.impulsePosM).toBe(
      base.cmosShake.presets.M_impact.impulsePosM,
    );

    CONFIG.cmosShake = {
      ...createDefaultCmosShakeConfig(),
      enabled: true,
      intensity: 1,
      posTiltDeg: 90,
      posAzimuthDeg: 90,
    };
    const s = new CmosScreenShake();
    s.play('M_impact');
    expect(CONFIG.cmosShake.posTiltDeg).toBe(90);
    expect(CONFIG.cmosShake.posAzimuthDeg).toBe(90);
    // factory M_impact tilt=0 → camera Z, not the global +Y draft dir
    expect(Math.abs(s.posZ.x)).toBeGreaterThan(0.01);
    expect(Math.abs(s.posY.x)).toBeLessThan(1e-6);

    const a = new CmosScreenShake();
    a.impulse({
      impulsePosM: 0.1,
      posAzimuthDeg: 0,
      posTiltDeg: 90,
    });
    a.impulse({
      impulsePosM: 0.2,
      posAzimuthDeg: 90,
      posTiltDeg: 90,
    });
    expect(a.posX.x).toBeCloseTo(0.1, 5);
    expect(a.posY.x).toBeCloseTo(0.2, 5);
    expect(Math.abs(a.posZ.x)).toBeLessThan(1e-6);
  });

  it('local save roundtrip keeps per-preset pos azimuth/tilt', () => {
    const shipping = createDefaultRuntimeConfig();
    shipping.cmosShake = createDefaultCmosShakeConfig();
    const local = cloneConfig(shipping);
    local.cmosShake.presets.M_impact = normalizeCmosShakeEffectPreset('M_impact', {
      ...local.cmosShake.presets.M_impact,
      posAzimuthDeg: 180,
      posTiltDeg: 90,
    });
    const raw = JSON.parse(JSON.stringify(local)) as Record<string, unknown>;
    const reloaded = mergeConfig(shipping, raw);
    expect(reloaded.cmosShake.presets.M_impact.posAzimuthDeg).toBe(180);
    expect(reloaded.cmosShake.presets.M_impact.posTiltDeg).toBe(90);
  });
});

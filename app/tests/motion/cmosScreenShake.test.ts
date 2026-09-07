import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultCmosShakeConfig,
  normalizeCmosShakeEffectPreset,
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
    expect(merged.cmosShake.presets.impact.strength).toBeGreaterThan(0);
  });

  it('incoming presets key set replaces (supports delete)', () => {
    const base = createDefaultRuntimeConfig();
    const merged = mergeConfig(base, {
      cmosShake: {
        presets: {
          onlyMine: normalizeCmosShakeEffectPreset('onlyMine', {
            label: '仅此',
            strength: 0.33,
          }),
        },
      },
    });
    expect(Object.keys(merged.cmosShake.presets)).toEqual(['onlyMine']);
    expect(merged.cmosShake.presets.onlyMine.strength).toBeCloseTo(0.33);
  });

  it('intensity 0 ignores impulse', () => {
    const cfg = createDefaultCmosShakeConfig();
    CONFIG.cmosShake = { ...cfg, intensity: 0, enabled: true };
    const s = new CmosScreenShake();
    s.impulse({ angleDeg: 90, radius: 1, strength: 1, spin: 0.2 });
    const out = s.getOutput();
    expect(Math.abs(s.y.v)).toBeLessThan(1e-9);
    expect(Math.abs(out.y)).toBeLessThan(1e-9);
  });
});

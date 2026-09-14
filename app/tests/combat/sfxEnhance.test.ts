import { describe, expect, it } from 'vitest';
import {
  applyJitter,
  clamp,
  createDefaultSfxParams,
  layerBlendSlot,
  panFromFighterX,
  pickVariantIndex,
  strengthGain,
} from '../../src/combat/sfx/SfxParams';
import { categoryReverbSendMul } from '../../src/combat/sfx/SfxAudioGraph';
import { sfxFilesForSlot, type SfxManifest } from '../../src/combat/sfx/SfxCatalog';

describe('sfxEnhance helpers', () => {
  it('maps world-X pan (left fighter → negative) within panMax', () => {
    const pan = panFromFighterX(-3, -3, 3, 0.55, 0.65);
    expect(pan).toBeLessThan(0);
    expect(pan).toBeGreaterThanOrEqual(-0.65);

    const right = panFromFighterX(3, -3, 3, 0.55, 0.65);
    expect(right).toBeGreaterThan(0);
    expect(right).toBeLessThanOrEqual(0.65);

    const mid = panFromFighterX(0, -3, 3, 0.55, 0.65);
    expect(mid).toBeCloseTo(0, 5);
  });

  it('defaults panSign to -1 (screen/ear correction)', () => {
    expect(createDefaultSfxParams().panSign).toBe(-1);
  });

  it('maps L/M/H strength gains from params', () => {
    const p = createDefaultSfxParams();
    expect(strengthGain('l', p)).toBe(p.strengthGainL);
    expect(strengthGain('m', p)).toBe(p.strengthGainM);
    expect(strengthGain('h', p)).toBe(p.strengthGainH);
  });

  it('picks anti-repeat variant indices', () => {
    const seq: number[] = [];
    let i = 0;
    const rand = () => {
      // Force first pick = lastIndex (0), then advance.
      const values = [0.01, 0.5, 0.9];
      return values[i++ % values.length]!;
    };
    const a = pickVariantIndex(3, 0, true, rand);
    expect(a).not.toBe(0);
    seq.push(a);
    const b = pickVariantIndex(3, a, true, () => 0); // would pick 0
    // When rand always 0, floor(0*3)=0; if last is not 0, stays 0.
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(3);
    expect(pickVariantIndex(1, 0, true)).toBe(0);
  });

  it('applies jitter within expected band', () => {
    const v = applyJitter(1, 0.1, () => 1); // (1*2-1)*0.1 = +0.1
    expect(v).toBeCloseTo(1.1, 5);
    const v2 = applyJitter(1, 0.1, () => 0); // -0.1
    expect(v2).toBeCloseTo(0.9, 5);
    expect(applyJitter(1, 0)).toBe(1);
  });

  it('resolves layer-blend adjacent slots', () => {
    expect(layerBlendSlot('contact/hit_punch_l', 'l')).toBeNull();
    expect(layerBlendSlot('contact/hit_punch_m', 'm')?.slotId).toBe(
      'contact/hit_punch_l',
    );
    expect(layerBlendSlot('contact/hit_kick_h', 'h')?.slotId).toBe(
      'contact/hit_kick_m',
    );
  });

  it('scales reverb send by category', () => {
    expect(categoryReverbSendMul('contact/hit_punch_m')).toBe(1);
    expect(categoryReverbSendMul('swing/punch_h')).toBe(0.7);
    expect(categoryReverbSendMul('loco/land')).toBe(0.5);
    expect(categoryReverbSendMul('knockdown/body_fall')).toBe(1.1);
  });

  it('lists variant files from manifest entry', () => {
    const manifest: SfxManifest = {
      version: 1,
      slots: {
        'contact/hit_punch_l': {
          status: 'accepted',
          file: 'contact/hit_punch_l.ogg',
          files: ['contact/hit_punch_l_v1.ogg', 'contact/hit_punch_l.ogg'],
        },
        missing: { status: 'missing', file: null },
      },
    };
    expect(sfxFilesForSlot(manifest, 'contact/hit_punch_l')).toEqual([
      'contact/hit_punch_l.ogg',
      'contact/hit_punch_l_v1.ogg',
    ]);
    expect(sfxFilesForSlot(manifest, 'missing')).toEqual([]);
  });

  it('clamps numbers', () => {
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
  });
});

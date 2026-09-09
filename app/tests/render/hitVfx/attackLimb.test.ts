import { describe, expect, it } from 'vitest';
import {
  adjustLimbImpulseForMove,
  averageLimbSamples,
  classifyAttackLimbKind,
  LIMB_IMPULSE_LOOKBACK,
  LIMB_IMPULSE_LOOKBACK_5MP,
  LIMB_IMPULSE_LOOKBACK_SHORT,
  limbImpulseFromHistory,
  limbImpulseSampleCount,
  lowerShinAlongLeg,
  moveLimbTokens,
  pickAttackLimbSide,
} from '../../../src/render/hitVfx/attackLimb';
import { worldPosFromTrigger } from '../../../src/render/hitVfx/HitVfxRuntime';

describe('attackLimb', () => {
  it('classifies normals as punch vs kick', () => {
    expect(classifyAttackLimbKind('ryu_5lp')).toBe('hand');
    expect(classifyAttackLimbKind('ryu_2mp')).toBe('hand');
    expect(classifyAttackLimbKind('ryu_6hp')).toBe('hand');
    expect(classifyAttackLimbKind('ryu_5lk')).toBe('foot');
    expect(classifyAttackLimbKind('ryu_2hk')).toBe('foot');
    expect(classifyAttackLimbKind('ryu_jlk')).toBe('foot');
  });

  it('classifies specials by family', () => {
    expect(classifyAttackLimbKind('ryu_hadoken_lp')).toBe('hand');
    expect(classifyAttackLimbKind('ryu_shoryuken_hp')).toBe('hand');
    expect(classifyAttackLimbKind('ryu_hashogeki_mp')).toBe('hand');
    expect(classifyAttackLimbKind('ryu_tatsu_lk')).toBe('foot');
    expect(classifyAttackLimbKind('ryu_blade_hk')).toBe('foot');
  });

  it('uses hitGroup on target-combo ids', () => {
    expect(moveLimbTokens('ryu_5mp_5lk_5hk')).toEqual(['5mp', '5lk', '5hk']);
    expect(classifyAttackLimbKind('ryu_5mp_5lk', 0)).toBe('hand');
    expect(classifyAttackLimbKind('ryu_5mp_5lk', 1)).toBe('foot');
    expect(classifyAttackLimbKind('ryu_5hp_5hk', 0)).toBe('hand');
    expect(classifyAttackLimbKind('ryu_5hp_5hk', 1)).toBe('foot');
  });

  it('picks the more-forward hand along facing', () => {
    const hips = { x: 0, y: 1, z: 0 };
    const left = { x: -0.4, y: 1.4, z: 0 };
    const right = { x: 0.8, y: 1.5, z: 0 };
    expect(pickAttackLimbSide(1, left, right, hips, 'hand')).toBe('R');
    expect(pickAttackLimbSide(-1, left, right, hips, 'hand')).toBe('L');
  });

  it('picks the kicking foot by distance from hips, not lead plant', () => {
    const hips = { x: 0, y: 1, z: 0 };
    // Lead plant is more forward on X; roundhouse swings the rear foot out in Z.
    const plant = { x: 0.45, y: 0.12, z: 0.05 };
    const kick = { x: 0.1, y: 0.7, z: 0.85 };
    expect(pickAttackLimbSide(1, plant, kick, hips, 'foot')).toBe('R');
    expect(pickAttackLimbSide(1, kick, plant, hips, 'foot')).toBe('L');
  });
});

describe('limbImpulseSampleCount', () => {
  it('uses one present before contact for standing and crouch LP', () => {
    expect(limbImpulseSampleCount('ryu_5lp')).toBe(LIMB_IMPULSE_LOOKBACK_SHORT);
    expect(limbImpulseSampleCount('ryu_2lp')).toBe(LIMB_IMPULSE_LOOKBACK_SHORT);
    expect(limbImpulseSampleCount('5lp')).toBe(2);
    expect(limbImpulseSampleCount('2lp')).toBe(2);
  });

  it('uses two presents before contact for standing MP', () => {
    expect(limbImpulseSampleCount('ryu_5mp')).toBe(LIMB_IMPULSE_LOOKBACK_5MP);
    expect(limbImpulseSampleCount('5mp')).toBe(3);
  });

  it('keeps the full window for other punches and jump LP', () => {
    expect(limbImpulseSampleCount('ryu_2mp')).toBe(LIMB_IMPULSE_LOOKBACK);
    expect(limbImpulseSampleCount('ryu_6lp')).toBe(LIMB_IMPULSE_LOOKBACK);
    expect(limbImpulseSampleCount('ryu_jlp')).toBe(LIMB_IMPULSE_LOOKBACK);
    expect(limbImpulseSampleCount('ryu_5lk')).toBe(LIMB_IMPULSE_LOOKBACK);
  });

  it('flips 5MP vertical so slightly-up impulse becomes slightly-down', () => {
    const p = adjustLimbImpulseForMove('ryu_5mp', 0, { x: 2, y: 0.4, z: 0 });
    expect(p.x).toBe(2);
    expect(p.y).toBeCloseTo(-0.4);
  });

  it('flattens 5LP and 2LP to forward with no up/down', () => {
    const s = adjustLimbImpulseForMove('ryu_5lp', 0, { x: 2, y: 0.4, z: 0 });
    expect(s.x).toBe(2);
    expect(s.y).toBe(0);
    const c = adjustLimbImpulseForMove('ryu_2lp', 0, { x: -1.5, y: -0.3, z: 0 });
    expect(c.x).toBe(-1.5);
    expect(c.y).toBe(0);
    const mp = adjustLimbImpulseForMove('ryu_5hp', 0, { x: 2, y: 0.4, z: 0 });
    expect(mp.y).toBeCloseTo(0.4);
  });
});

describe('limb impulse lookback', () => {
  it('averages arm joints as a whole-arm sample', () => {
    const out = { x: 0, y: 0, z: 0 };
    expect(
      averageLimbSamples(
        [
          { x: 0, y: 1.4, z: 0 },
          { x: 0.2, y: 1.3, z: 0 },
          { x: 0.4, y: 1.2, z: 0 },
        ],
        out,
      ),
    ).toBe(true);
    expect(out.x).toBeCloseTo(0.2);
    expect(out.y).toBeCloseTo(1.3);
  });

  it('places lower shin 72% of the way from knee to foot', () => {
    const p = lowerShinAlongLeg(
      { x: 0, y: 0.8, z: 0 },
      { x: 0, y: 0.1, z: 0 },
    );
    expect(p.y).toBeCloseTo(0.8 + (0.1 - 0.8) * 0.72);
  });

  it('uses oldest→newest span, not adjacent frames', () => {
    const out = { x: 0, y: 0, z: 0 };
    limbImpulseFromHistory(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0.1, y: 0.4, z: 0 },
        { x: 0.4, y: 0.4, z: 0 },
      ],
      0.05,
      out,
    );
    expect(out.x).toBeCloseTo(0.4 / 0.05);
    expect(out.y).toBeCloseTo(0.4 / 0.05);
  });

  it('returns zero with fewer than two samples', () => {
    const out = { x: 1, y: 1, z: 1 };
    limbImpulseFromHistory([{ x: 3, y: 0, z: 0 }], 0.016, out);
    expect(out).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('ignores depth Z so 2D FX only sees fight-plane XY', () => {
    const out = { x: 0, y: 0, z: 9 };
    limbImpulseFromHistory(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0.2, y: 0.1, z: 3 },
      ],
      0.05,
      out,
    );
    expect(out.x).toBeCloseTo(0.2 / 0.05);
    expect(out.y).toBeCloseTo(0.1 / 0.05);
    expect(out.z).toBe(0);
  });
});

describe('worldPosFromTrigger limb lock', () => {
  const offsets = { h: { y: 1.6, z: 0 }, m: { y: 1.1, z: 0 }, l: { y: 0.4, z: 0 } };

  it('uses explicit y/z when locking to a fist', () => {
    const p = worldPosFromTrigger(
      {
        kind: 'onHit',
        strength: 'M',
        height: 'm',
        x: 1.2,
        y: 1.45,
        z: 0.05,
        facing: 1,
      },
      offsets,
      0,
    );
    expect(p.x).toBeCloseTo(1.2);
    expect(p.y).toBeCloseTo(1.45);
    expect(p.z).toBeCloseTo(0.05);
  });

  it('falls back to height offsets without y', () => {
    const p = worldPosFromTrigger(
      {
        kind: 'onHit',
        strength: 'M',
        height: 'h',
        x: 0,
        facing: 1,
      },
      offsets,
      0.1,
    );
    expect(p.y).toBeCloseTo(1.7);
  });
});

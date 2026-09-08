import { describe, expect, it } from 'vitest';
import {
  classifyAttackLimbKind,
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

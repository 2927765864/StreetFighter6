import { describe, expect, it } from 'vitest';
import {
  canGuard,
  guardToStandHeight,
  hitstopToStrength,
  normalizeGuard,
  selectGuardReactLogicId,
  stanceForBlockAll,
} from '../../src/combat/systems/GuardPolicy';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';

describe('normalizeGuard / canGuard', () => {
  const rows: Array<[string, boolean, boolean]> = [
    ['high', false, true],
    ['high', true, true],
    ['mid', false, true],
    ['mid', true, false],
    ['low', false, false],
    ['low', true, true],
    ['midHigh', true, false],
    ['throw', false, false],
  ];
  for (const [g, crouch, ok] of rows) {
    it(`${g} crouch=${crouch} => ${ok}`, () => {
      expect(canGuard(normalizeGuard(g), crouch)).toBe(ok);
    });
  }
});

describe('stanceForBlockAll', () => {
  it('low forces crouch', () => {
    expect(stanceForBlockAll('low', false)).toBe('crouch');
  });
  it('mid forces stand', () => {
    expect(stanceForBlockAll('mid', true)).toBe('stand');
  });
  it('high rest pose is stand', () => {
    expect(stanceForBlockAll('high', true)).toBe('stand');
    expect(stanceForBlockAll('high', false)).toBe('stand');
  });
});

describe('hitstopToStrength / select clip', () => {
  it('bands', () => {
    expect(hitstopToStrength(9)).toBe('L');
    expect(hitstopToStrength(11)).toBe('M');
    expect(hitstopToStrength(13)).toBe('H');
  });
  it('stand official-H (中段) light -> grd_ml_st', () => {
    expect(
      selectGuardReactLogicId({ crouching: false, guard: 'high', hitstopOnBlock: 9 }),
    ).toBe('grd_ml_st');
  });
  it('crouch official-H (中段) heavy -> grd_ch_st', () => {
    expect(
      selectGuardReactLogicId({ crouching: true, guard: 'high', hitstopOnBlock: 13 }),
    ).toBe('grd_ch_st');
  });
  it('stand official-M (上段/过顶) -> grd_h*', () => {
    expect(guardToStandHeight('mid')).toBe('h');
    expect(
      selectGuardReactLogicId({ crouching: false, guard: 'mid', hitstopOnBlock: 10 }),
    ).toBe('grd_hm_st');
  });
  it('crouch official-L (下段) -> grd_d*', () => {
    expect(
      selectGuardReactLogicId({ crouching: true, guard: 'low', hitstopOnBlock: 9 }),
    ).toBe('grd_dl_st');
  });
  it('low kicks L/M/H use distinct crouch-down clips even if hitstop ties', () => {
    expect(
      selectGuardReactLogicId({
        crouching: true, guard: 'low', hitstopOnBlock: 9, guardStrength: 'L',
      }),
    ).toBe('grd_dl_st');
    expect(
      selectGuardReactLogicId({
        crouching: true, guard: 'low', hitstopOnBlock: 9, guardStrength: 'M',
      }),
    ).toBe('grd_dm_st');
    expect(
      selectGuardReactLogicId({
        crouching: true, guard: 'low', hitstopOnBlock: 13, guardStrength: 'H',
      }),
    ).toBe('grd_dh_st');
  });
});

describe('parseMoveDefinition guard', () => {
  it('reads guard from JSON', () => {
    const m = parseMoveDefinition({
      id: 'x',
      frames: { startup: 1, active: 1, recovery: 1, total: 3 },
      boxes: { hurt: [], hit: [] },
      guard: 'mid',
      damage: 0,
      advantage: { onHit: 0, onBlock: 0 },
      cancel: { specialCancel: false, targetCombo: [], windows: [] },
      clipId: 'x',
    });
    expect(m.guard).toBe('mid');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canGuard,
  guardAnimForHit,
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
  it('stand official-H (上段站防, e.g. 5LP) light -> grd_hl_st', () => {
    expect(
      selectGuardReactLogicId({ crouching: false, guard: 'high', hitstopOnBlock: 9 }),
    ).toBe('grd_hl_st');
    expect(
      selectGuardReactLogicId({
        crouching: false, guard: 'high', hitstopOnBlock: 9, guardAnim: 'h',
      }),
    ).toBe('grd_hl_st');
  });
  it('stand official-H + guardAnim m (5HP) -> grd_mh_st', () => {
    expect(
      selectGuardReactLogicId({
        crouching: false, guard: 'high', guardStrength: 'H', guardAnim: 'm',
      }),
    ).toBe('grd_mh_st');
  });
  it('stand official-H + guardAnim m (5MP) medium -> grd_mm_st', () => {
    expect(
      selectGuardReactLogicId({
        crouching: false, guard: 'high', guardStrength: 'M', guardAnim: 'm',
      }),
    ).toBe('grd_mm_st');
  });
  it('crouch official-H ignores stand guardAnim (still C)', () => {
    expect(
      selectGuardReactLogicId({
        crouching: true, guard: 'high', guardStrength: 'H', guardAnim: 'm',
      }),
    ).toBe('grd_ch_st');
  });
  it('crouch official-H (蹲防中段族) heavy -> grd_ch_st', () => {
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
  it('reads guardAnim independently of guard', () => {
    const m = parseMoveDefinition({
      id: 'ryu_5hp',
      frames: { startup: 1, active: 1, recovery: 1, total: 3 },
      boxes: { hurt: [], hit: [] },
      guard: 'high',
      guardAnim: 'm',
      guardStrength: 'H',
      damage: 0,
      advantage: { onHit: 0, onBlock: 0 },
      cancel: { specialCancel: false, targetCombo: [], windows: [] },
      clipId: 'x',
    });
    expect(m.guard).toBe('high');
    expect(m.guardAnim).toBe('m');
    expect(
      selectGuardReactLogicId({
        crouching: false,
        guard: m.guard ?? 'high',
        guardStrength: m.guardStrength,
        guardAnim: m.guardAnim,
      }),
    ).toBe('grd_mh_st');
  });
  it('per-hit guardAnim: 6MP m then l, 4HK h then m, 6HP both m', () => {
    const sixMp = parseMoveDefinition(
      JSON.parse(
        readFileSync(resolve(__dirname, '../../public/data/moves/ryu_6mp.json'), 'utf8'),
      ),
    );
    const fourHk = parseMoveDefinition(
      JSON.parse(
        readFileSync(resolve(__dirname, '../../public/data/moves/ryu_4hk.json'), 'utf8'),
      ),
    );
    const sixHp = parseMoveDefinition(
      JSON.parse(
        readFileSync(resolve(__dirname, '../../public/data/moves/ryu_6hp.json'), 'utf8'),
      ),
    );
    expect(sixMp.guardAnim).toEqual(['m', 'l']);
    expect(fourHk.guardAnim).toEqual(['h', 'm']);
    expect(sixHp.guardAnim).toEqual(['m', 'm']);
    expect(
      selectGuardReactLogicId({
        crouching: false,
        guard: sixMp.guard ?? 'mid',
        guardStrength: sixMp.guardStrength ?? 'M',
        guardAnim: guardAnimForHit(sixMp.guardAnim, 0),
      }),
    ).toMatch(/^grd_m/);
    expect(
      selectGuardReactLogicId({
        crouching: false,
        guard: sixMp.guard ?? 'mid',
        guardStrength: sixMp.guardStrength ?? 'M',
        guardAnim: guardAnimForHit(sixMp.guardAnim, 1),
      }),
    ).toMatch(/^grd_l/);
    expect(
      selectGuardReactLogicId({
        crouching: false,
        guard: 'high',
        guardStrength: fourHk.guardStrength ?? 'H',
        guardAnim: guardAnimForHit(fourHk.guardAnim, 0),
      }),
    ).toMatch(/^grd_h/);
    expect(
      selectGuardReactLogicId({
        crouching: false,
        guard: 'high',
        guardStrength: fourHk.guardStrength ?? 'H',
        guardAnim: guardAnimForHit(fourHk.guardAnim, 1),
      }),
    ).toMatch(/^grd_m/);
    expect(guardAnimForHit(sixHp.guardAnim, 0)).toBe('m');
    expect(guardAnimForHit(sixHp.guardAnim, 1)).toBe('m');
  });

  it('loads ryu_5mp.json as mid-body stand block', () => {
    const m = parseMoveDefinition(
      JSON.parse(
        readFileSync(resolve(__dirname, '../../public/data/moves/ryu_5mp.json'), 'utf8'),
      ),
    );
    expect(m.guard).toBe('high');
    expect(m.guardAnim).toBe('m');
    expect(
      selectGuardReactLogicId({
        crouching: false,
        guard: m.guard ?? 'high',
        guardStrength: m.guardStrength,
        guardAnim: m.guardAnim,
      }),
    ).toBe('grd_mm_st');
  });
});

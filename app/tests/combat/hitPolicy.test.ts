import { describe, expect, it } from 'vitest';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';
import { selectHitReactLogicId } from '../../src/combat/systems/HitPolicy';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function load(name: string) {
  return parseMoveDefinition(
    JSON.parse(readFileSync(resolve(__dirname, '../../public/data/moves', name), 'utf8')),
  );
}

describe('selectHitReactLogicId', () => {
  it('stand high light -> dmg_hl_st', () => {
    expect(
      selectHitReactLogicId({ crouching: false, guard: 'high', hitstopOnHit: 9, hitAnim: 'h' })
        .logicId,
    ).toBe('dmg_hl_st');
  });
  it('crouch low -> dmg_d*_st', () => {
    expect(
      selectHitReactLogicId({
        crouching: true,
        guard: 'low',
        guardStrength: 'M',
      }).logicId,
    ).toBe('dmg_dm_st');
  });
  it('crouch high -> dmg_c*_st', () => {
    expect(
      selectHitReactLogicId({
        crouching: true,
        guard: 'high',
        guardStrength: 'H',
      }).logicId,
    ).toBe('dmg_ch_st');
  });
  it('does not copy 5HP guardAnim m into DMG (uses hitAnim h)', () => {
    const m = load('ryu_5hp.json');
    expect(m.guardAnim).toBe('m');
    expect(m.hitAnim).toBe('h');
    expect(
      selectHitReactLogicId({
        crouching: false,
        guard: m.guard ?? 'high',
        guardStrength: m.guardStrength,
        hitAnim: typeof m.hitAnim === 'string' ? m.hitAnim : undefined,
        hitAnimDir: m.hitAnimDir,
      }).logicId,
    ).toBe('dmg_hh_st');
  });
  it('5HK uses HH_LT (RT was mirrored the wrong way)', () => {
    const m = load('ryu_5hk.json');
    expect(
      selectHitReactLogicId({
        crouching: false,
        guard: m.guard ?? 'high',
        guardStrength: m.guardStrength,
        hitAnim: typeof m.hitAnim === 'string' ? m.hitAnim : undefined,
        hitAnimDir: m.hitAnimDir,
      }).logicId,
    ).toBe('dmg_hh_lt');
  });
  it('5MP uses MM_LT not ST', () => {
    const m = load('ryu_5mp.json');
    expect(
      selectHitReactLogicId({
        crouching: false,
        guard: m.guard ?? 'high',
        guardStrength: m.guardStrength,
        hitAnim: typeof m.hitAnim === 'string' ? m.hitAnim : undefined,
        hitAnimDir: m.hitAnimDir,
      }).logicId,
    ).toBe('dmg_mm_lt');
  });
  it('standing kicks: L/M/H body letters not default head', () => {
    expect(
      selectHitReactLogicId({
        crouching: false, guard: 'high', guardStrength: 'L', hitAnim: 'l',
      }).logicId,
    ).toBe('dmg_ll_st');
    expect(
      selectHitReactLogicId({
        crouching: false, guard: 'high', guardStrength: 'M', hitAnim: 'm',
      }).logicId,
    ).toBe('dmg_mm_st');
    expect(
      selectHitReactLogicId({
        crouching: false, guard: 'high', guardStrength: 'H', hitAnim: 'h', hitAnimDir: 'lt',
      }).logicId,
    ).toBe('dmg_hh_lt');
  });
  it('4HP/2HP declare force-stand uppercut react + on-hit attacker role', () => {
    const m4 = load('ryu_4hp.json');
    expect(m4.forcesStand).toBe(true);
    expect(m4.hitReactClipId).toBe('dmg_hu_up_h');
    expect(m4.animRoleOnHit).toBe('on_hit');
    expect(m4.hitAnim).toBe('h');
    expect(m4.animFrameCountOnHit).toBeGreaterThan(m4.animFrameCount ?? 0);

    const m2 = load('ryu_2hp.json');
    expect(m2.forcesStand).toBe(true);
    expect(m2.hitReactClipId).toBe('dmg_mh_up');
    expect(m2.animRoleOnHit).toBe('on_hit');
    expect(m2.hitAnim).toBe('m');
    expect(m2.animFrameCountOnHit).toBeGreaterThan(m2.animFrameCount ?? 0);
  });
});

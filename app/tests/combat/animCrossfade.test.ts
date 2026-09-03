import { describe, expect, it } from 'vitest';
import {
  categorizeBinding,
  defaultCrossfadeDurations,
  resolveCrossfadeSec,
  shouldPresentationCrossfade,
} from '../../src/combat/anim/AnimCrossfade';

const d = defaultCrossfadeDurations({
  locoSec: 0.12,
  residualToMoveSec: 0.1,
  residualToStanceSec: 0.1,
  residualToAttackSec: 0,
});

describe('AnimCrossfade §3.11', () => {
  it('categorizes loco / walk / attack / stance / hit', () => {
    expect(categorizeBinding('idle::main')).toBe('loco');
    expect(categorizeBinding('walk_fwd::start')).toBe('walk');
    expect(categorizeBinding('walk_back::loop')).toBe('walk');
    expect(categorizeBinding('5lp::main')).toBe('attack');
    expect(categorizeBinding('ryu_5lk::main')).toBe('attack');
    expect(categorizeBinding('stand_to_crouch::main')).toBe('stance');
    // Runtime uses crouch + role for stance transitions
    expect(categorizeBinding('crouch::stand_to_crouch')).toBe('stance');
    expect(categorizeBinding('crouch::crouch_to_stand')).toBe('stance');
    expect(categorizeBinding('crouch::main')).toBe('loco');
    expect(categorizeBinding('hitstun::main')).toBe('hit');
    expect(categorizeBinding('dmg_hl_st::main')).toBe('hit');
    expect(categorizeBinding('dmg_hh_lt::main')).toBe('hit');
    expect(categorizeBinding('kd_sweep::main')).toBe('hit');
    expect(categorizeBinding('grd_hl_st::main')).toBe('guard');
    expect(categorizeBinding('block_stand_loop::loop')).toBe('guard');
    expect(categorizeBinding('block_crouch_loop::loop')).toBe('guard');
  });

  it('walk ↔ stop / walk segments: blend with locoSec', () => {
    expect(resolveCrossfadeSec('walk_fwd::loop', 'walk_fwd::end', d)).toBe(0.12);
    expect(resolveCrossfadeSec('walk_fwd::end', 'idle::main', d)).toBe(0.12);
    expect(resolveCrossfadeSec('idle::main', 'walk_fwd::start', d)).toBe(0.12);
    expect(resolveCrossfadeSec('walk_fwd::loop', 'walk_fwd::loop', d)).toBe(0);
  });

  it('attack residual → move: residualToMoveSec (not loco-only)', () => {
    expect(resolveCrossfadeSec('ryu_5lp::main', 'walk_fwd::start', d)).toBe(0.1);
    expect(resolveCrossfadeSec('5lk::main', 'idle::main', d)).toBe(0.1);
    expect(shouldPresentationCrossfade('5lp::main', 'walk_back::start', d)).toBe(
      true,
    );
  });

  it('attack residual → another attack: short/none (default 0)', () => {
    expect(resolveCrossfadeSec('5lp::main', '5lk::main', d)).toBe(0);
    const short = defaultCrossfadeDurations({
      ...d,
      residualToAttackSec: 0.03,
    });
    expect(resolveCrossfadeSec('5lp::main', '5lk::main', short)).toBe(0.03);
  });

  it('attack residual → stand↔crouch transition: residualToStanceSec', () => {
    // 2LK residual + release down → crouch::crouch_to_stand
    expect(
      resolveCrossfadeSec('2lk::main', 'crouch::crouch_to_stand', d),
    ).toBe(0.1);
    expect(
      resolveCrossfadeSec('ryu_2lk::main', 'crouch::crouch_to_stand', d),
    ).toBe(0.1);
    // stand attack residual → stand_to_crouch
    expect(
      resolveCrossfadeSec('5lp::main', 'crouch::stand_to_crouch', d),
    ).toBe(0.1);
    // crouch idle → stance still hard (姿势接近)
    expect(
      resolveCrossfadeSec('crouch::main', 'crouch::crouch_to_stand', d),
    ).toBe(0);
  });

  it('move → attack: hard cut (跟手)', () => {
    expect(resolveCrossfadeSec('idle::main', '5lp::main', d)).toBe(0);
    expect(resolveCrossfadeSec('walk_fwd::loop', '5lp::main', d)).toBe(0);
  });

  it('jump / into-dash / hit: no sol; dash residual → idle can sol', () => {
    expect(resolveCrossfadeSec('5lp::main', 'jump_f::main', d)).toBe(0);
    expect(resolveCrossfadeSec('idle::main', 'dash_fwd::main', d)).toBe(0);
    expect(resolveCrossfadeSec('dash_fwd::main', 'idle::main', d)).toBe(0.1);
    expect(resolveCrossfadeSec('idle::main', 'hitstun::main', d)).toBe(0);
    // dmg_* must hard-cut like hitstun — not soft-blend as mis-tagged attack
    expect(resolveCrossfadeSec('dmg_hl_st::main', 'idle::main', d)).toBe(0);
    expect(resolveCrossfadeSec('idle::main', 'dmg_hl_st::main', d)).toBe(0);
  });

  it('land → crouch_to_stand can sol; land → idle/attack hard cut', () => {
    expect(
      resolveCrossfadeSec('jump_f::land', 'crouch::crouch_to_stand', d),
    ).toBe(0.1);
    expect(resolveCrossfadeSec('jump_f::land', 'idle::main', d)).toBe(0);
    expect(resolveCrossfadeSec('jump_n::land', 'ryu_5lp::main', d)).toBe(0);
    expect(resolveCrossfadeSec('jump_f::air', 'idle::main', d)).toBe(0);
    expect(resolveCrossfadeSec('jump_f::prejump', 'idle::main', d)).toBe(0);
  });

  it('turn → idle dissolves; crouch_to_stand → turn/idle soft; turn → attack hard', () => {
    expect(resolveCrossfadeSec('turn_std::main', 'idle::main', d)).toBe(0.1);
    expect(
      resolveCrossfadeSec('crouch::crouch_to_stand', 'turn_std::main', d),
    ).toBe(0.1);
    expect(
      resolveCrossfadeSec('crouch::crouch_to_stand', 'idle::main', d),
    ).toBe(0.1);
    expect(resolveCrossfadeSec('jump_f::land', 'turn_std::main', d)).toBe(0);
    expect(resolveCrossfadeSec('turn_std::main', 'ryu_5lp::main', d)).toBe(0);
  });

  it('air-attack residual → land / air dissolves; into-attack still hard', () => {
    expect(resolveCrossfadeSec('ryu_jlp::main', 'jump_f::land', d)).toBe(0.1);
    expect(resolveCrossfadeSec('ryu_jlp::main', 'jump_n::air', d)).toBe(0.1);
    expect(resolveCrossfadeSec('idle::main', 'jump_f::prejump', d)).toBe(0);
    expect(resolveCrossfadeSec('jump_f::air', 'ryu_jlp::main', d)).toBe(0);
  });

  it('guard: impact hard-cuts; leave stun / crouch-to-stand loop dissolves', () => {
    expect(resolveCrossfadeSec('idle::main', 'grd_hl_st::main', d)).toBe(0);
    expect(resolveCrossfadeSec('block_stand_loop::loop', 'grd_hl_st::main', d)).toBe(
      0,
    );
    expect(resolveCrossfadeSec('grd_hl_st::main', 'grd_cl_st::main', d)).toBe(0);
    expect(
      resolveCrossfadeSec('grd_hl_st::main', 'block_stand_loop::loop', d),
    ).toBe(0.1);
    expect(
      resolveCrossfadeSec('grd_cl_st::main', 'block_stand_loop::loop', d),
    ).toBe(0.1);
    expect(
      resolveCrossfadeSec('block_crouch_loop::loop', 'block_stand_loop::loop', d),
    ).toBe(0.1);
    expect(
      resolveCrossfadeSec('block_stand_loop::loop', 'idle::main', d),
    ).toBe(0.1);
    expect(
      resolveCrossfadeSec('idle::main', 'block_stand_loop::loop', d),
    ).toBe(0.12);
    expect(resolveCrossfadeSec('idle::main', 'hitstun_light::main', d)).toBe(0);
  });
});

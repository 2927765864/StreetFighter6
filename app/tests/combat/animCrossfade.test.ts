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
    expect(categorizeBinding('hitstun::main')).toBe('hit');
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

  it('move → attack: hard cut (跟手)', () => {
    expect(resolveCrossfadeSec('idle::main', '5lp::main', d)).toBe(0);
    expect(resolveCrossfadeSec('walk_fwd::loop', '5lp::main', d)).toBe(0);
  });

  it('stance / jump / dash / hit: no sol', () => {
    expect(resolveCrossfadeSec('idle::main', 'stand_to_crouch::main', d)).toBe(0);
    expect(resolveCrossfadeSec('5lp::main', 'jump_f::main', d)).toBe(0);
    expect(resolveCrossfadeSec('idle::main', 'dash_fwd::main', d)).toBe(0);
    expect(resolveCrossfadeSec('idle::main', 'hitstun::main', d)).toBe(0);
  });
});

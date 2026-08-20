import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';
import { resolveHitOnHit } from '../../src/combat/systems/HitResolve';

function load(name: string) {
  const p = resolve(__dirname, '../../public/data/moves', name);
  return parseMoveDefinition(JSON.parse(readFileSync(p, 'utf8')));
}

describe('resolveHitOnHit', () => {
  it('5LP hitstun from JSON, damage 0', () => {
    const mv = load('ryu_5lp.json');
    expect(mv.hitstun).toBe(14);
    const hr = resolveHitOnHit(mv, {
      hitstopFramesOnHit: 8,
      hitstunOverride: -1,
      hitPushbackTotal: 0,
      knockdownFramesOverride: -1,
    });
    expect(hr.hitstun).toBe(14);
    expect(hr.damage).toBe(0);
    expect(hr.hitReaction).toBe('stun');
    expect(hr.pushbackTotal).toBeCloseTo(0.27);
  });
  it('5MP has MMDK hit push table (not only 5LP)', () => {
    const mv = load('ryu_5mp.json');
    expect(mv.hitPushbackTotal).toBeGreaterThan(0.4);
    expect(mv.hitPushback?.length).toBe(mv.hitPushMoveTime);
    const hr = resolveHitOnHit(mv, {
      hitstopFramesOnHit: 8,
      hitstunOverride: -1,
      hitPushbackTotal: 0,
      knockdownFramesOverride: -1,
    });
    expect(hr.pushbackTotal).toBeCloseTo(mv.hitPushbackTotal ?? 0);
  });
  it('2HK is knockdown', () => {
    const mv = load('ryu_2hk.json');
    expect(mv.hitReaction).toBe('knockdown');
    expect(mv.knockdownFrames).toBe(87);
    const hr = resolveHitOnHit(mv, {
      hitstopFramesOnHit: 8,
      hitstunOverride: -1,
      hitPushbackTotal: 0,
      knockdownFramesOverride: -1,
    });
    expect(hr.hitReaction).toBe('knockdown');
    expect(hr.knockdownFrames).toBe(87);
    expect(hr.damage).toBe(0);
  });
});

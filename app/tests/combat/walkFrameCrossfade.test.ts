import { describe, expect, it } from 'vitest';
import {
  defaultWalkXfadeFrameTable,
  isWalkXfadeEdge,
  linearFrameToWeight,
  remainingAuthoredFrames,
  walkXfadeEdgeFrames,
  walkXfadeRole,
  walkXfadeWindowFrames,
} from '../../src/combat/anim/WalkFrameCrossfade';

describe('WalkFrameCrossfade §3.11.0', () => {
  it('classifies idle / start / end and rejects walk loop', () => {
    expect(walkXfadeRole('idle::main')).toBe('idle');
    expect(walkXfadeRole('walk_fwd::start')).toBe('start');
    expect(walkXfadeRole('walk_back::end')).toBe('end');
    expect(walkXfadeRole('walk_fwd::loop')).toBeNull();
    expect(walkXfadeRole('dash_fwd::main')).toBeNull();
  });

  it('is an edge only among idle/start/end', () => {
    expect(isWalkXfadeEdge('idle::main', 'walk_fwd::start')).toBe(true);
    expect(isWalkXfadeEdge('walk_fwd::start', 'walk_fwd::end')).toBe(true);
    expect(isWalkXfadeEdge('walk_fwd::loop', 'walk_fwd::end')).toBe(false);
    expect(isWalkXfadeEdge('idle::main', 'idle::main')).toBe(false);
  });

  it('per-edge frames fall back to default 5', () => {
    const t = defaultWalkXfadeFrameTable();
    expect(t.defaultFrames).toBe(5);
    expect(walkXfadeEdgeFrames('idle', 'start', t)).toBe(5);
    const custom = defaultWalkXfadeFrameTable({ startEnd: 8, defaultFrames: 5 });
    expect(walkXfadeEdgeFrames('start', 'end', custom)).toBe(8);
    expect(walkXfadeEdgeFrames('end', 'idle', custom)).toBe(5);
  });

  it('shortens window to old-clip remaining; looping uses full N', () => {
    expect(walkXfadeWindowFrames(5, 20, false)).toBe(5);
    expect(walkXfadeWindowFrames(5, 3, false)).toBe(3);
    expect(walkXfadeWindowFrames(5, 0, false)).toBe(0);
    expect(walkXfadeWindowFrames(5, 2, true)).toBe(5);
    expect(walkXfadeWindowFrames(0, 10, false)).toBe(0);
  });

  it('remainingAuthoredFrames counts from current sample to clip end', () => {
    expect(remainingAuthoredFrames(0, 20 / 60)).toBe(20);
    expect(remainingAuthoredFrames(17 / 60, 20 / 60)).toBe(3);
    expect(remainingAuthoredFrames(19 / 60, 20 / 60)).toBe(1);
  });

  it('linear weight is i/N on blend frames', () => {
    expect(linearFrameToWeight(0, 5)).toBe(0);
    expect(linearFrameToWeight(1, 5)).toBeCloseTo(0.2, 6);
    expect(linearFrameToWeight(5, 5)).toBe(1);
    expect(linearFrameToWeight(6, 5)).toBe(1);
  });
});

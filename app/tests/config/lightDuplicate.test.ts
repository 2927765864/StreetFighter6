import { describe, expect, it } from 'vitest';
import {
  copyFollowLightsP1toP2,
  duplicateLightAsNew,
  newLightId,
  resolveLightWorldPose,
  type LightDesc,
} from '../../src/config/lightTypes';

function followPoint(): LightDesc {
  return {
    id: 'src',
    name: '跟P1点光',
    type: 'point',
    enabled: true,
    color: 0xff0000,
    intensity: 3,
    // character-local offsets
    position: { x: 1.5, y: 2, z: 1 },
    target: { x: 0, y: 0, z: 0 },
    castShadow: false,
    follow: 'p1',
    followOffsetPosX: 1.5,
    followOffsetTargetX: 0,
  };
}

describe('duplicateLightAsNew', () => {
  it('new ids are unique', () => {
    const a = new Set(Array.from({ length: 40 }, () => newLightId('point')));
    expect(a.size).toBe(40);
  });

  it('clears follow and nudges X without sharing offsets', () => {
    const src = followPoint();
    const copy = duplicateLightAsNew(src);
    expect(copy.id).not.toBe(src.id);
    expect(copy.follow).toBe('none');
    expect(copy.followOffsetPosX).toBeUndefined();
    expect(copy.position.x).toBe(src.position.x + 0.5);
    expect(src.follow).toBe('p1');
    expect(src.followOffsetPosX).toBe(1.5);
    expect(src.position.x).toBe(1.5);
  });

  it('directional also nudges target X', () => {
    const src: LightDesc = {
      ...followPoint(),
      type: 'directional',
      follow: 'p2',
      target: { x: 1, y: 0, z: 0 },
      followOffsetTargetX: 0.5,
    };
    const copy = duplicateLightAsNew(src);
    expect(copy.target.x).toBe(1.5);
    expect(src.target.x).toBe(1);
  });
});

describe('copyFollowLightsP1toP2', () => {
  it('parallel-copies local offsets and sets follow=p2', () => {
    const src = followPoint();
    const dir: LightDesc = {
      id: 'dir',
      name: '跟P1方向光',
      type: 'directional',
      enabled: true,
      color: 0xffffff,
      intensity: 1,
      position: { x: 2, y: 8, z: 3 },
      target: { x: 0.5, y: 1, z: 0 },
      castShadow: false,
      follow: 'p1',
      followOffsetPosX: 2,
      followOffsetTargetX: 0.5,
    };
    const stage: LightDesc = {
      id: 'key',
      name: '主光',
      type: 'directional',
      enabled: true,
      color: 0xffffff,
      intensity: 1,
      position: { x: 0, y: 16, z: 4 },
      target: { x: 0, y: 0, z: 0 },
      castShadow: true,
      follow: 'none',
    };
    const copies = copyFollowLightsP1toP2([src, dir, stage]);
    expect(copies).toHaveLength(2);
    expect(copies.every((c) => c.follow === 'p2')).toBe(true);
    expect(copies[0]!.position.x).toBe(1.5);
    expect(copies[0]!.position.y).toBe(2);
    expect(copies[0]!.followOffsetPosX).toBe(1.5);
    expect(copies[1]!.position.x).toBe(2);
    expect(copies[1]!.target.x).toBe(0.5);
    expect(copies[1]!.followOffsetTargetX).toBe(0.5);
    expect(copies[0]!.id).not.toBe(src.id);
    expect(copies[0]!.name).toContain('P2');

    // Same local offset relative to each fighter origin
    const p1Origin = { x: 1, y: 0.9 };
    const p2Origin = { x: 3, y: 0.9 };
    const p1World = resolveLightWorldPose(src, p1Origin, p2Origin).position;
    const p2World = resolveLightWorldPose(copies[0]!, p1Origin, p2Origin).position;
    expect(p1World.x - 1).toBe(1.5);
    expect(p2World.x - 3).toBe(1.5);
    expect(p1World.y).toBe(0.9 + 2);
    expect(p2World.y).toBe(0.9 + 2);
  });

  it('can opt into mirror X', () => {
    const src = followPoint();
    const [copy] = copyFollowLightsP1toP2([src], { mirrorX: true });
    expect(copy!.position.x).toBe(-1.5);
    expect(copy!.follow).toBe('p2');
  });
});


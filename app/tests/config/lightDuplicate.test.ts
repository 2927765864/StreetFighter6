import { describe, expect, it } from 'vitest';
import {
  duplicateLightAsNew,
  newLightId,
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
    position: { x: 2, y: 2, z: 1 },
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
    expect(src.position.x).toBe(2);
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

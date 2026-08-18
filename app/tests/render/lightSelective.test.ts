import { describe, expect, it } from 'vitest';
import type { LightDesc } from '../../src/config/lightTypes';
import type { LightRig, LightRuntime } from '../../src/render/LightRig';
import {
  bucketLightsByFollow,
  isHairLightingMesh,
} from '../../src/render/LightSelective';

function fakeLight(id: string): { id: number } {
  // three Light.id is number; use hash
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return { id: Math.abs(h) || 1 };
}

function rigWith(ids: string[]): LightRig {
  const runtimes = new Map<string, LightRuntime>();
  for (const id of ids) {
    runtimes.set(id, {
      descId: id,
      type: 'point',
      light: fakeLight(id) as unknown as LightRuntime['light'],
      helper: null,
    });
  }
  return {
    group: {} as LightRig['group'],
    helperGroup: {} as LightRig['helperGroup'],
    runtimes,
  };
}

function desc(
  id: string,
  follow: LightDesc['follow'],
  enabled = true,
): LightDesc {
  return {
    id,
    name: id,
    type: 'point',
    enabled,
    color: 0xffffff,
    intensity: 1,
    position: { x: 0, y: 1, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    castShadow: false,
    follow,
  };
}

describe('bucketLightsByFollow', () => {
  it('splits global / p1 / p2', () => {
    const rig = rigWith(['a', 'b', 'c', 'd']);
    const b = bucketLightsByFollow(
      [
        desc('a', 'none'),
        desc('b', 'p1'),
        desc('c', 'p2'),
        desc('d', 'p1', false),
      ],
      rig,
    );
    expect(b.global).toHaveLength(1);
    expect(b.p1).toHaveLength(1);
    expect(b.p2).toHaveLength(1);
  });

  it('excludes shadowOnly lights from illumination buckets', () => {
    const rig = rigWith(['key', 'shade']);
    const shade: LightDesc = {
      ...desc('shade', 'none'),
      type: 'directional',
      castShadow: true,
      shadowOnly: true,
    };
    const b = bucketLightsByFollow([desc('key', 'none'), shade], rig);
    expect(b.global).toHaveLength(1);
    expect(b.p1).toHaveLength(0);
    expect(b.p2).toHaveLength(0);
  });
});

describe('normalize shadowOnly', () => {
  it('forces castShadow and clears follow', async () => {
    const { normalizeLightDesc } = await import('../../src/config/lightTypes');
    const n = normalizeLightDesc({
      id: 's',
      name: 'shade',
      type: 'directional',
      enabled: true,
      color: 0xffffff,
      intensity: 1,
      position: { x: 0, y: 10, z: 4 },
      target: { x: 0, y: 0, z: 0 },
      castShadow: false,
      shadowOnly: true,
      follow: 'p1',
      followOffsetPosX: 1,
    });
    expect(n).not.toBeNull();
    expect(n!.shadowOnly).toBe(true);
    expect(n!.castShadow).toBe(true);
    expect(n!.follow).toBe('none');
  });
});

describe('isHairLightingMesh', () => {
  it('detects hair / beard names', () => {
    const hair = { name: 'Hair00', material: { name: 'hair_mat' } } as never;
    const body = { name: 'Body00', material: { name: 'body_mat' } } as never;
    const cloth = { name: 'Costume03_Pants', material: { name: 'clothb' } } as never;
    const shoe = { name: 'Waraji_L', material: { name: 'waraji' } } as never;
    expect(isHairLightingMesh(hair)).toBe(true);
    expect(isHairLightingMesh(body)).toBe(false);
    expect(isHairLightingMesh(cloth)).toBe(false);
    expect(isHairLightingMesh(shoe)).toBe(false);
  });
});

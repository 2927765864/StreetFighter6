import { describe, expect, it } from 'vitest';
import {
  applyLightFollow,
  captureLightFollowOffsets,
  enableLightFollow,
  fighterWorldX,
  lightSupportsFollow,
  type LightDesc,
} from '../../src/config/lightTypes';

function dirLight(partial: Partial<LightDesc> = {}): LightDesc {
  return {
    id: 'key',
    name: '主光',
    type: 'directional',
    enabled: true,
    color: 0xffffff,
    intensity: 1,
    position: { x: 2, y: 16, z: 4 },
    target: { x: 0, y: 0, z: 0 },
    castShadow: false,
    follow: 'none',
    ...partial,
  };
}

function pointLight(partial: Partial<LightDesc> = {}): LightDesc {
  return {
    id: 'pt',
    name: '点光',
    type: 'point',
    enabled: true,
    color: 0xffffff,
    intensity: 2,
    position: { x: 5, y: 2, z: 2 },
    target: { x: 0, y: 0, z: 0 },
    castShadow: false,
    distance: 0,
    decay: 2,
    follow: 'none',
    ...partial,
  };
}

function spotLight(partial: Partial<LightDesc> = {}): LightDesc {
  return {
    id: 'sp',
    name: '聚光',
    type: 'spot',
    enabled: true,
    color: 0xffffff,
    intensity: 2,
    position: { x: 4, y: 8, z: 4 },
    target: { x: 1, y: 0, z: 0 },
    castShadow: false,
    distance: 0,
    decay: 2,
    angle: Math.PI / 6,
    penumbra: 0.2,
    follow: 'none',
    ...partial,
  };
}

describe('light follow', () => {
  it('supports dir/point/spot only', () => {
    expect(lightSupportsFollow('directional')).toBe(true);
    expect(lightSupportsFollow('point')).toBe(true);
    expect(lightSupportsFollow('spot')).toBe(true);
    expect(lightSupportsFollow('ambient')).toBe(false);
    expect(lightSupportsFollow('hemisphere')).toBe(false);
  });

  it('directional keeps relative X when fighter moves', () => {
    const light = dirLight({
      position: { x: 3, y: 16, z: 4 },
      target: { x: 1, y: 0, z: 0 },
    });
    enableLightFollow(light, 'p1', 1, 0, 1);
    expect(light.followOffsetPosX).toBe(2);
    expect(light.followOffsetTargetX).toBe(0);
    const rel = light.position.x - light.target.x;
    applyLightFollow([light], 3, 0, 1);
    expect(light.position.x).toBe(5);
    expect(light.target.x).toBe(3);
    expect(light.position.x - light.target.x).toBe(rel);
  });

  it('point follows position X only', () => {
    const light = pointLight({ position: { x: 5, y: 2, z: 2 } });
    enableLightFollow(light, 'p2', 0, 2, 1);
    expect(light.followOffsetPosX).toBe(3);
    applyLightFollow([light], 0, 4, 1);
    expect(light.position.x).toBe(7);
    expect(light.position.y).toBe(2);
    expect(light.position.z).toBe(2);
  });

  it('spot keeps relative X like directional', () => {
    const light = spotLight({
      position: { x: 4, y: 8, z: 4 },
      target: { x: 1, y: 0, z: 0 },
    });
    enableLightFollow(light, 'p1', 0, 0, 1);
    expect(light.followOffsetPosX).toBe(4);
    expect(light.followOffsetTargetX).toBe(1);
    applyLightFollow([light], 2, 0, 1);
    expect(light.position.x).toBe(6);
    expect(light.target.x).toBe(3);
    expect(light.position.x - light.target.x).toBe(3);
  });

  it('recapture offsets after manual move', () => {
    const light = pointLight({ follow: 'p2' });
    captureLightFollowOffsets(light, 0);
    light.position.x = 10;
    captureLightFollowOffsets(light, 4);
    expect(light.followOffsetPosX).toBe(6);
  });

  it('fighterWorldX scales logic x', () => {
    expect(fighterWorldX(1.5, 2)).toBe(3);
  });
});

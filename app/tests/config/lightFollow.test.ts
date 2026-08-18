import { describe, expect, it } from 'vitest';
import {
  applyLightFollow,
  captureLightFollowOffsets,
  enableLightFollow,
  fighterFollowOriginFromLogic,
  fighterWorldX,
  lightSupportsFollow,
  normalizeLightDesc,
  resolveLightWorldPose,
  resolveShadowMapIntensity,
  syncLegacyFollowOffsets,
  type FighterFollowOrigin,
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

const o = (x: number, y = 0): FighterFollowOrigin => ({ x, y });

describe('light follow', () => {
  it('supports dir/point/spot only', () => {
    expect(lightSupportsFollow('directional')).toBe(true);
    expect(lightSupportsFollow('point')).toBe(true);
    expect(lightSupportsFollow('spot')).toBe(true);
    expect(lightSupportsFollow('ambient')).toBe(false);
    expect(lightSupportsFollow('hemisphere')).toBe(false);
  });

  it('enable converts world → local XY and resolve tracks origin move', () => {
    const light = dirLight({
      position: { x: 3, y: 3, z: 4 },
      target: { x: 1, y: 1, z: 0 },
    });
    enableLightFollow(light, 'p1', o(1, 1), o(0, 0));
    expect(light.position.x).toBe(2);
    expect(light.position.y).toBe(2);
    expect(light.target.x).toBe(0);
    expect(light.target.y).toBe(0);
    expect(light.followOffsetPosX).toBe(2);
    expect(light.followOffsetPosY).toBe(2);

    applyLightFollow([light], o(3, 2), o(0, 0));
    expect(light.position.x).toBe(2);
    expect(light.position.y).toBe(2);

    const pose = resolveLightWorldPose(light, o(3, 2), o(0, 0));
    expect(pose.position.x).toBe(5);
    expect(pose.position.y).toBe(4);
    expect(pose.target.x).toBe(3);
    expect(pose.target.y).toBe(2);
  });

  it('point follows local XY (jump / crouch via origin.y)', () => {
    const light = pointLight({ position: { x: 5, y: 2.5, z: 2 } });
    enableLightFollow(light, 'p2', o(0, 0), o(2, 0.5));
    expect(light.position.x).toBe(3);
    expect(light.position.y).toBe(2);
    applyLightFollow([light], o(0, 0), o(4, 1.2));
    const pose = resolveLightWorldPose(light, o(0, 0), o(4, 1.2));
    expect(pose.position.x).toBe(7);
    expect(pose.position.y).toBe(3.2);
    expect(pose.position.z).toBe(2);
  });

  it('spot keeps relative local XY like directional', () => {
    const light = spotLight({
      position: { x: 4, y: 8, z: 4 },
      target: { x: 1, y: 1, z: 0 },
    });
    enableLightFollow(light, 'p1', o(0, 0), o(0, 0));
    applyLightFollow([light], o(2, 1), o(0, 0));
    const pose = resolveLightWorldPose(light, o(2, 1), o(0, 0));
    expect(pose.position.x).toBe(6);
    expect(pose.position.y).toBe(9);
    expect(pose.target.x).toBe(3);
    expect(pose.target.y).toBe(2);
  });

  it('disable follow converts local → world XY', () => {
    const light = pointLight({ position: { x: 5, y: 3, z: 2 } });
    enableLightFollow(light, 'p1', o(2, 1), o(0, 0));
    expect(light.position.x).toBe(3);
    expect(light.position.y).toBe(2);
    enableLightFollow(light, 'none', o(2, 1), o(0, 0));
    expect(light.follow).toBe('none');
    expect(light.position.x).toBe(5);
    expect(light.position.y).toBe(3);
    expect(light.followOffsetPosY).toBeUndefined();
  });

  it('switching p1↔p2 keeps local offsets', () => {
    const light = pointLight({ position: { x: 5, y: 3, z: 2 } });
    enableLightFollow(light, 'p1', o(1, 0.5), o(0, 0));
    expect(light.position.x).toBe(4);
    expect(light.position.y).toBe(2.5);
    enableLightFollow(light, 'p2', o(1, 0.5), o(3, 0.8));
    expect(light.follow).toBe('p2');
    expect(light.position.x).toBe(4);
    expect(light.position.y).toBe(2.5);
    const pose = resolveLightWorldPose(light, o(1, 0.5), o(3, 0.8));
    expect(pose.position.x).toBe(7);
    expect(pose.position.y).toBe(3.3);
  });

  it('gizmo-style capture converts world pose into local (position only)', () => {
    const light = dirLight({
      follow: 'p2',
      position: { x: 10, y: 5, z: 1 },
      target: { x: 0.5, y: 0.2, z: 0 }, // already local
      followOffsetPosX: 0,
      followOffsetPosY: 0,
      followOffsetTargetX: 0.5,
      followOffsetTargetY: 0.2,
    });
    captureLightFollowOffsets(light, o(4, 1), 'position');
    expect(light.position.x).toBe(6);
    expect(light.position.y).toBe(4);
    expect(light.target.x).toBe(0.5);
    expect(light.target.y).toBe(0.2);
    expect(light.followOffsetPosY).toBe(4);
  });

  it('panel-style syncLegacy does not subtract origin', () => {
    const light = pointLight({
      follow: 'p1',
      position: { x: 1.5, y: 0.8, z: 1 },
    });
    syncLegacyFollowOffsets(light);
    expect(light.position.y).toBe(0.8);
    expect(light.followOffsetPosY).toBe(0.8);
  });

  it('migrate adds local Y once when followOffsetPosY missing', () => {
    const light = pointLight({
      follow: 'p1',
      position: { x: 1.5, y: 2.5, z: 1 }, // x already local; y still world
      followOffsetPosX: 1.5,
      // no followOffsetPosY
    });
    applyLightFollow([light], o(2, 1), o(0, 0));
    expect(light.position.x).toBe(1.5); // not subtracted again
    expect(light.position.y).toBe(1.5); // 2.5 - 1
    expect(light.followOffsetPosY).toBe(1.5);
  });

  it('normalize migrates old world+offset saves to local position', () => {
    const raw = {
      id: 'pt',
      name: '跟P1',
      type: 'point',
      enabled: true,
      color: 0xff0000,
      intensity: 2,
      position: { x: 4.5, y: 2.8, z: 1 },
      target: { x: 0, y: 0, z: 0 },
      castShadow: false,
      follow: 'p1',
      followOffsetPosX: 1.5,
      followOffsetPosY: 1.2,
    };
    const n = normalizeLightDesc(raw);
    expect(n).not.toBeNull();
    expect(n!.position.x).toBe(1.5);
    expect(n!.position.y).toBe(1.2);
    expect(n!.followOffsetPosY).toBe(1.2);
  });

  it('fighterWorldX / fighterFollowOriginFromLogic', () => {
    expect(fighterWorldX(1.5, 2)).toBe(3);
    expect(fighterFollowOriginFromLogic(1, 0.5, 2, 0.1)).toEqual({
      x: 2,
      y: 1.1,
    });
  });

  it('resolveShadowMapIntensity maps intensity only for shadowOnly', () => {
    expect(
      resolveShadowMapIntensity(
        dirLight({ shadowOnly: true, intensity: 2.5, castShadow: true }),
      ),
    ).toBe(2.5);
    expect(
      resolveShadowMapIntensity(dirLight({ shadowOnly: false, intensity: 2.5 })),
    ).toBe(1);
  });
});

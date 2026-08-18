import { describe, expect, it } from 'vitest';
import {
  createDefaultLights,
  enforceLightRules,
  lightsFromFlatFields,
  migrateFlatLightsToList,
  normalizeLightDesc,
} from '../../src/config/lightTypes';

describe('lightsMigrate', () => {
  it('default list has key at (0,16,4) with castShadow', () => {
    const lights = createDefaultLights();
    const key = lights.find((l) => l.id === 'key');
    expect(key?.position).toEqual({ x: 0, y: 16, z: 4 });
    expect(key?.castShadow).toBe(true);
    expect(key?.intensity).toBe(1.05);
  });

  it('migrates flat fields to lights[]', () => {
    const out = migrateFlatLightsToList({
      lightKeyIntensity: 2,
      lightKeyX: 1,
      lightKeyY: 2,
      lightKeyZ: 3,
      lightAmbientIntensity: 0.4,
    });
    expect(Array.isArray(out.lights)).toBe(true);
    const lights = out.lights as ReturnType<typeof createDefaultLights>;
    const key = lights.find((l) => l.id === 'key');
    expect(key?.intensity).toBe(2);
    expect(key?.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(out.lightAmbientIntensity).toBeUndefined();
  });

  it('keeps existing lights array', () => {
    const out = migrateFlatLightsToList({
      lights: [
        {
          id: 'a',
          name: 'A',
          type: 'point',
          enabled: true,
          color: 0xff0000,
          intensity: 3,
          position: { x: 1, y: 2, z: 3 },
          target: { x: 0, y: 0, z: 0 },
          castShadow: true,
        },
      ],
    });
    const lights = out.lights as ReturnType<typeof createDefaultLights>;
    expect(lights).toHaveLength(1);
    expect(lights[0]!.type).toBe('point');
    expect(lights[0]!.castShadow).toBe(false);
  });

  it('enforces single directional castShadow', () => {
    const lights = enforceLightRules([
      {
        id: 'a',
        name: 'a',
        type: 'directional',
        enabled: true,
        color: 1,
        intensity: 1,
        position: { x: 0, y: 1, z: 0 },
        target: { x: 0, y: 0, z: 0 },
        castShadow: true,
      },
      {
        id: 'b',
        name: 'b',
        type: 'directional',
        enabled: true,
        color: 1,
        intensity: 1,
        position: { x: 0, y: 1, z: 0 },
        target: { x: 0, y: 0, z: 0 },
        castShadow: true,
      },
    ]);
    expect(lights.filter((l) => l.castShadow)).toHaveLength(1);
    expect(lights[0]!.castShadow).toBe(true);
    expect(lights[1]!.castShadow).toBe(false);
  });

  it('lightsFromFlatFields matches legacy key slot', () => {
    const lights = lightsFromFlatFields({ lightKeyY: 16 });
    expect(lights.find((l) => l.id === 'key')?.position.y).toBe(16);
  });

  it('normalizeLightDesc rejects bad type', () => {
    expect(normalizeLightDesc({ id: 'x', type: 'nope' })).toBeNull();
  });
});

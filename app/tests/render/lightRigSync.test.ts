import { describe, expect, it } from 'vitest';
import {
  createDefaultLights,
  enforceLightRules,
  createLightByType,
} from '../../src/config/lightTypes';

describe('lightRigSync pure rules', () => {
  it('max count disables extras when over limit', () => {
    const lights = createDefaultLights();
    for (let i = 0; i < 20; i++) {
      lights.push(createLightByType('point'));
    }
    const out = enforceLightRules(lights, 15);
    expect(out.filter((l) => l.enabled).length).toBeLessThanOrEqual(15);
  });

  it('only one ambient and hemi kept', () => {
    const lights = [
      createLightByType('ambient'),
      createLightByType('ambient'),
      createLightByType('hemisphere'),
      createLightByType('hemisphere'),
    ];
    const out = enforceLightRules(lights, 15);
    expect(out.filter((l) => l.type === 'ambient')).toHaveLength(1);
    expect(out.filter((l) => l.type === 'hemisphere')).toHaveLength(1);
  });
});

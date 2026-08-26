import {
  defaultHeightOffsets,
  defaultSparkLightEmbed,
  defaultStrengthScale,
  type HitVfxElement,
  type HitVfxGroup,
  type HitVfxRecipe,
} from './hitVfxTypes';

function mainGroupBase(
  id: string,
  name: string,
  type: HitVfxElement['type'],
  receiveSparkLight: boolean,
): Pick<
  HitVfxElement,
  | 'id'
  | 'name'
  | 'type'
  | 'enabled'
  | 'groupId'
  | 'startDelaySec'
  | 'receiveSparkLight'
> {
  return {
    id,
    name,
    type,
    enabled: true,
    groupId: 'main',
    startDelaySec: 0,
    receiveSparkLight,
  };
}

export function defaultMainGroup(): HitVfxGroup {
  return { id: 'main', name: '主组', enabled: true };
}

/** Plan §3.6 unguarded_default — spark light embedded in spark.params.light */
export function createUngardedDefaultRecipe(): HitVfxRecipe {
  const elements: HitVfxElement[] = [
    {
      ...mainGroupBase('spark', '打击火花', 'spark', false),
      type: 'spark',
      params: {
        count: 28,
        lifetimeSec: [0.08, 0.18],
        speed: [2.5, 6],
        size: [0.03, 0.08],
        colorStart: 0xffe0a0,
        colorEnd: 0xff6020,
        brightness: 1.4,
        coneAngleRad: 0.7,
        drag: 0.15,
        gravityY: 0,
        blend: 'additive',
        light: defaultSparkLightEmbed({
          intensity: 4.5,
          castOnCharacter: true,
          castOnVfxElements: true,
        }),
      },
    },
    {
      ...mainGroupBase('sparkDebris', '附带火星', 'sparkDebris', true),
      type: 'sparkDebris',
      params: {
        count: 16,
        lifetimeSec: [0.12, 0.28],
        speed: [1.2, 3.5],
        size: [0.02, 0.05],
        color: 0xffcc88,
        gravityY: -2,
        drag: 0.25,
        coneAngleRad: 0.9,
        blend: 'additive',
      },
    },
    {
      ...mainGroupBase('smokeRing', '涡环烟', 'smokeRing', true),
      type: 'smokeRing',
      params: {
        dyeCount: 48,
        filamentCount: 12,
        lifetimeSec: [0.2, 0.32],
        filamentLifetimeSec: [0.28, 0.42],
        ringRadius: 0.16,
        tubeRadius: 0.045,
        vortexStrength: 8,
        expandStrength: 1.2,
        axialSpeed: 0.35,
        curlAmplitude: 1.4,
        curlFrequency: 1.8,
        curlSpeed: 0.4,
        drag: 3.5,
        gravityY: 0,
        size: [0.1, 0.22],
        filamentWidth: 0.04,
        color: 0xc8c0b0,
        opacity: 0.5,
        blend: 'alpha',
        sortByDepth: false,
        helixHelicity: 0.7,
        helixCoherence: 0.45,
        helixDecay: 0.08,
        potentialGrid: 32,
      },
    },
    {
      ...mainGroupBase('sweat', '汗珠', 'sweat', true),
      type: 'sweat',
      params: {
        count: 8,
        lifetimeSec: [0.25, 0.55],
        speed: [1.0, 2.8],
        size: [0.015, 0.035],
        color: 0xd0e8ff,
        gravityY: 9.8,
        drag: 0.08,
        coneAngleRad: 0.85,
        blend: 'alpha',
        collideGround: false,
      },
    },
  ];
  return {
    id: 'ungarded_default',
    name: '未格挡默认',
    kind: 'onHit',
    groups: [defaultMainGroup()],
    elements,
    strengthScale: defaultStrengthScale(),
  };
}

/** Plan §3.6 block_default */
export function createBlockDefaultRecipe(): HitVfxRecipe {
  const base = createUngardedDefaultRecipe();
  const elements = base.elements.map((el) => {
    if (el.type === 'sweat') {
      return { ...el, enabled: false };
    }
    if (el.type === 'spark') {
      return {
        ...el,
        params: {
          ...el.params,
          count: 14,
          brightness: 0.8,
          light: { ...el.params.light, intensity: 2.2 },
        },
      };
    }
    if (el.type === 'smokeRing') {
      return {
        ...el,
        params: {
          ...el.params,
          dyeCount: Math.max(8, Math.round(el.params.dyeCount * 0.6)),
          filamentCount: Math.max(4, Math.round(el.params.filamentCount * 0.6)),
        },
      };
    }
    return { ...el };
  });
  return {
    id: 'block_default',
    name: '格挡默认',
    kind: 'onBlock',
    groups: [defaultMainGroup()],
    elements,
    strengthScale: defaultStrengthScale(),
  };
}

export function createDefaultHitVfxRecipes(): HitVfxRecipe[] {
  return [createUngardedDefaultRecipe(), createBlockDefaultRecipe()];
}

export { defaultHeightOffsets, defaultStrengthScale };

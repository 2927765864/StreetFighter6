/**
 * Compile HitVfxRecipe elements → three-plume SystemDef.
 * Spark lights are NOT compiled here (HitVfxPointLightPool).
 * No ground collision modules (consensus).
 */
import type { Mulberry32 } from './mulberry32';
import { HelixPotentialCurlForce } from './HelixPotentialCurlForce';
import { system, type EmitterBuilder, type SystemDef } from './plumeApi';
import {
  hexToRgb01,
  scaleCount,
  type HitVfxElement,
  type HitVfxRecipe,
  type HitVfxStrength,
  type HitVfxStrengthScale,
  type SparkDebrisParams,
  type SparkLightEmbed,
  type SparkParams,
  type SmokeRingParams,
  type SweatParams,
} from './hitVfxTypes';

export type CompileOpts = {
  recipe: HitVfxRecipe;
  strength: HitVfxStrength;
  seed: number;
  rng: Mulberry32;
  /** Extra brightness for receiveSparkLight elements when castOnVfxElements. */
  vfxLightBoost: number;
};

function pairWithRng(
  pair: [number, number],
  rng: Mulberry32,
  locked: boolean,
): { min: number; max: number } | number {
  if (locked) {
    // Bake to constant for byte-stable birth when seed locked.
    return rng.range(pair[0], pair[1]);
  }
  return { min: pair[0], max: pair[1] };
}

function scalePair(
  pair: [number, number],
  mul: number,
): [number, number] {
  return [pair[0] * mul, pair[1] * mul];
}

function applySpark(
  e: EmitterBuilder,
  p: SparkParams,
  scale: HitVfxStrengthScale,
  rng: Mulberry32,
  seedLocked: boolean,
  seed: number,
  delay: number,
) {
  const count = scaleCount(p.count, scale.countMul);
  const life = scalePair(p.lifetimeSec, scale.lifetimeMul);
  const size = scalePair(p.size, scale.sizeMul);
  const c0 = hexToRgb01(p.colorStart).map((c) => c * p.brightness * scale.brightnessMul) as [
    number,
    number,
    number,
  ];
  const c1 = hexToRgb01(p.colorEnd).map((c) => c * p.brightness * scale.brightnessMul) as [
    number,
    number,
    number,
  ];
  const lifeIn = pairWithRng(life, rng, seedLocked);
  const sizeIn = pairWithRng(size, rng, seedLocked);
  const speedIn = pairWithRng(p.speed, rng, seedLocked);
  return e
    .capacity(Math.max(count * 2, 16))
    .duration(Math.max(life[1], 0.05) + delay + 0.05)
    .seed(seed)
    .spawnBurst({ time: delay, count })
    .lifetime(lifeIn)
    .position({ shape: { kind: 'point' } })
    .velocity({
      shape: { kind: 'cone', angle: p.coneAngleRad },
      speed: speedIn,
    })
    .size(sizeIn)
    .color(
      { min: c0, max: c1 },
      { alpha: 1 },
    )
    .integrate()
    .lifetimeTick()
    .drag(p.drag)
    .gravity([0, p.gravityY, 0])
    .sizeOverLife([
      [0, 1],
      [1, 0.15],
    ])
    .alphaOverLife([
      [0, 1],
      [0.7, 0.6],
      [1, 0],
    ])
    .renderSprite({ blending: 'additive', depthWrite: false });
}

function applyDebris(
  e: EmitterBuilder,
  p: SparkDebrisParams,
  scale: HitVfxStrengthScale,
  rng: Mulberry32,
  seedLocked: boolean,
  seed: number,
  delay: number,
  lightBoost: number,
) {
  const count = scaleCount(p.count, scale.countMul);
  const life = scalePair(p.lifetimeSec, scale.lifetimeMul);
  const size = scalePair(p.size, scale.sizeMul);
  const rgb = hexToRgb01(p.color).map(
    (c) => c * scale.brightnessMul * (1 + lightBoost * 0.15),
  ) as [number, number, number];
  return e
    .capacity(Math.max(count * 2, 16))
    .duration(Math.max(life[1], 0.05) + delay + 0.05)
    .seed(seed ^ 0x1111)
    .spawnBurst({ time: delay, count })
    .lifetime(pairWithRng(life, rng, seedLocked))
    .position({ shape: { kind: 'point' } })
    .velocity({
      shape: { kind: 'cone', angle: p.coneAngleRad },
      speed: pairWithRng(p.speed, rng, seedLocked),
    })
    .size(pairWithRng(size, rng, seedLocked))
    .color(rgb, { alpha: 1 })
    .integrate()
    .lifetimeTick()
    .drag(p.drag)
    .gravity([0, p.gravityY, 0])
    .sizeOverLife([
      [0, 1],
      [1, 0.2],
    ])
    .alphaOverLife([
      [0, 1],
      [1, 0],
    ])
    .renderSprite({ blending: 'additive', depthWrite: false });
}

function ringThicknessFrac(ringRadius: number, tubeRadius: number): number {
  return Math.min(0.95, Math.max(0.05, tubeRadius / Math.max(ringRadius, 0.02)));
}

/**
 * Attach HelixPotentialCurlForce after EmitterBuilder.build().
 * Plume's SystemBuilder always calls returned builder.build().
 */
function withHelixForce(
  builder: EmitterBuilder,
  force: HelixPotentialCurlForce,
): EmitterBuilder {
  const origBuild = builder.build.bind(builder);
  (builder as EmitterBuilder & { build: () => ReturnType<EmitterBuilder['build']> }).build =
    () => {
      const def = origBuild();
      def.update.push(force as never);
      return def;
    };
  return builder;
}

function applySmokeRingDye(
  e: EmitterBuilder,
  p: SmokeRingParams,
  scale: HitVfxStrengthScale,
  rng: Mulberry32,
  seedLocked: boolean,
  seed: number,
  delay: number,
  lightBoost: number,
  receive: boolean,
) {
  const dyeCount = scaleCount(p.dyeCount, scale.countMul);
  const life = scalePair(p.lifetimeSec, scale.lifetimeMul);
  const size = scalePair(p.size, scale.sizeMul);
  const ringRadius = p.ringRadius * scale.sizeMul;
  const tubeRadius = p.tubeRadius * scale.sizeMul;
  const boost = receive ? 1 + lightBoost * 0.35 : 1;
  const rgb = hexToRgb01(p.color).map((c) => Math.min(1, c * boost)) as [
    number,
    number,
    number,
  ];
  const opacity = Math.min(1, p.opacity * boost);
  const force = new HelixPotentialCurlForce({
    ringRadius,
    tubeRadius,
    vortexStrength: p.vortexStrength,
    curlAmplitude: p.curlAmplitude,
    curlFrequency: p.curlFrequency,
    curlSpeed: p.curlSpeed,
    helixHelicity: p.helixHelicity,
    helixCoherence: p.helixCoherence,
    helixDecay: p.helixDecay,
    potentialGrid: p.potentialGrid,
    seed: seed ^ 0x2222,
    axialSpeed: p.axialSpeed,
  });
  const chain = e
    .capacity(Math.max(dyeCount * 2, 16))
    .duration(Math.max(life[1], 0.05) + delay + 0.05)
    .seed(seed ^ 0x2222)
    .sortByDepth(p.sortByDepth)
    .spawnBurst({ time: delay, count: dyeCount })
    .lifetime(pairWithRng(life, rng, seedLocked))
    .position({
      shape: {
        kind: 'ring',
        radius: ringRadius,
        thickness: ringThicknessFrac(ringRadius, tubeRadius),
      },
    })
    .size(pairWithRng(size, rng, seedLocked))
    .color(rgb, { alpha: opacity })
    .integrate()
    .lifetimeTick()
    .drag(p.drag)
    .gravity([0, p.gravityY, 0])
    .pointAttractor({
      position: [0, 0, 0],
      strength: -Math.abs(p.expandStrength),
      radius: ringRadius * 3,
      falloff: 'linear',
    })
    .sizeOverLife([
      [0, 0.7],
      [0.35, 1.15],
      [1, 1.4],
    ])
    .alphaOverLife([
      [0, 0.15],
      [0.12, 1],
      [1, 0],
    ])
    .renderSprite({ blending: 'alpha', depthWrite: false, opacity });
  return withHelixForce(chain, force);
}

function applySmokeRingFilaments(
  e: EmitterBuilder,
  p: SmokeRingParams,
  scale: HitVfxStrengthScale,
  rng: Mulberry32,
  seedLocked: boolean,
  seed: number,
  delay: number,
) {
  const count = scaleCount(p.filamentCount, scale.countMul);
  if (count <= 0) {
    return e
      .capacity(1)
      .duration(0.05)
      .spawnBurst({ time: delay, count: 0 })
      .lifetime(0.05)
      .position({ shape: { kind: 'point' } })
      .integrate()
      .lifetimeTick()
      .renderSprite({ blending: 'alpha', depthWrite: false });
  }
  const life = scalePair(p.filamentLifetimeSec, scale.lifetimeMul);
  const ringRadius = p.ringRadius * scale.sizeMul * 1.12;
  const tubeRadius = p.tubeRadius * scale.sizeMul;
  const force = new HelixPotentialCurlForce({
    ringRadius,
    tubeRadius,
    vortexStrength: p.vortexStrength * 0.85,
    curlAmplitude: p.curlAmplitude * 1.35,
    curlFrequency: p.curlFrequency,
    curlSpeed: p.curlSpeed,
    helixHelicity: p.helixHelicity,
    helixCoherence: p.helixCoherence,
    helixDecay: p.helixDecay,
    potentialGrid: p.potentialGrid,
    seed: seed ^ 0x4444,
    axialSpeed: p.axialSpeed * 0.8,
    forceScale: 1.15,
  });
  const w = p.filamentWidth * scale.sizeMul;
  const chain = e
    .capacity(Math.max(count * 2, 8))
    .duration(Math.max(life[1], 0.05) + delay + 0.05)
    .seed(seed ^ 0x4444)
    .sortByDepth(p.sortByDepth)
    .spawnBurst({ time: delay, count })
    .lifetime(pairWithRng(life, rng, seedLocked))
    .position({
      shape: {
        kind: 'ring',
        radius: ringRadius,
        thickness: ringThicknessFrac(ringRadius, tubeRadius),
      },
    })
    .size(w)
    .color(hexToRgb01(p.color), { alpha: Math.min(1, p.opacity * 0.85) })
    .integrate()
    .lifetimeTick()
    .drag(p.drag * 0.9)
    .gravity([0, p.gravityY, 0])
    .sizeOverLife([
      [0, 1],
      [1, 0],
    ])
    .alphaOverLife([
      [0, 0.2],
      [0.2, 1],
      [1, 0],
    ])
    .renderRibbon({
      blending: 'alpha',
      depthTest: true,
      faceCamera: true,
    });
  return withHelixForce(chain, force);
}

function applySweat(
  e: EmitterBuilder,
  p: SweatParams,
  scale: HitVfxStrengthScale,
  rng: Mulberry32,
  seedLocked: boolean,
  seed: number,
  delay: number,
  lightBoost: number,
  receive: boolean,
) {
  const count = scaleCount(p.count, scale.countMul);
  const life = scalePair(p.lifetimeSec, scale.lifetimeMul);
  const size = scalePair(p.size, scale.sizeMul);
  const boost = receive ? 1 + lightBoost * 0.25 : 1;
  const rgb = hexToRgb01(p.color).map((c) => Math.min(1, c * boost)) as [
    number,
    number,
    number,
  ];
  // Plan: gravityY positive → world -Y
  return e
    .capacity(Math.max(count * 2, 8))
    .duration(Math.max(life[1], 0.05) + delay + 0.05)
    .seed(seed ^ 0x3333)
    .spawnBurst({ time: delay, count })
    .lifetime(pairWithRng(life, rng, seedLocked))
    .position({ shape: { kind: 'point' } })
    .velocity({
      shape: { kind: 'cone', angle: p.coneAngleRad },
      speed: pairWithRng(p.speed, rng, seedLocked),
    })
    .size(pairWithRng(size, rng, seedLocked))
    .color(rgb, { alpha: 0.85 })
    .integrate()
    .lifetimeTick()
    .drag(p.drag)
    .gravity([0, -Math.abs(p.gravityY), 0])
    .sizeOverLife([
      [0, 1],
      [1, 0.4],
    ])
    .alphaOverLife([
      [0, 1],
      [0.8, 0.5],
      [1, 0],
    ])
    .renderSprite({ blending: 'alpha', depthWrite: false });
}

export function compileRecipeToSystemDef(opts: CompileOpts): SystemDef {
  const { recipe, strength, seed, rng, vfxLightBoost } = opts;
  const scale = recipe.strengthScale[strength];
  const seedLocked = true; // caller already baked rng from locked/unlocked seed
  let maxDur = 0.35;

  const builder = system(`hitvfx_${recipe.id}_${strength}_${seed}`);

  const groupOk = (groupId: string) =>
    recipe.groups.find((g) => g.id === groupId)?.enabled !== false;

  for (const el of recipe.elements) {
    if (!el.enabled) continue;
    if (!groupOk(el.groupId)) continue;
    if (el.type === 'sparkLight') continue;
    const delay = el.startDelaySec;
    const name = `${el.id}_${el.type}`;
    if (el.type === 'smokeRing') {
      const boost = el.receiveSparkLight ? vfxLightBoost : 0;
      maxDur = Math.max(
        maxDur,
        Math.max(el.params.lifetimeSec[1], el.params.filamentLifetimeSec[1]) *
          scale.lifetimeMul +
          delay,
      );
      builder.emitter(`${name}_dye`, (e) =>
        applySmokeRingDye(
          e,
          el.params,
          scale,
          rng,
          seedLocked,
          seed,
          delay,
          boost,
          el.receiveSparkLight,
        ),
      );
      builder.emitter(`${name}_fil`, (e) =>
        applySmokeRingFilaments(
          e,
          el.params,
          scale,
          rng,
          seedLocked,
          seed,
          delay,
        ),
      );
      continue;
    }
    builder.emitter(name, (e) => {
      if (el.type === 'spark') {
        const b = applySpark(e, el.params, scale, rng, seedLocked, seed, delay);
        maxDur = Math.max(maxDur, el.params.lifetimeSec[1] * scale.lifetimeMul + delay);
        return b;
      }
      if (el.type === 'sparkDebris') {
        const boost = el.receiveSparkLight ? vfxLightBoost : 0;
        const b = applyDebris(
          e,
          el.params,
          scale,
          rng,
          seedLocked,
          seed,
          delay,
          boost,
        );
        maxDur = Math.max(maxDur, el.params.lifetimeSec[1] * scale.lifetimeMul + delay);
        return b;
      }
      // sweat (dust migrates away in normalize)
      const boost = el.receiveSparkLight ? vfxLightBoost : 0;
      const b = applySweat(
        e,
        el.params as SweatParams,
        scale,
        rng,
        seedLocked,
        seed,
        delay,
        boost,
        el.receiveSparkLight,
      );
      maxDur = Math.max(
        maxDur,
        (el.params as SweatParams).lifetimeSec[1] * scale.lifetimeMul + delay,
      );
      return b;
    });
  }

  return builder.duration(maxDur + 0.15).build();
}

/** Prefer embedded spark.params.light; fall back to legacy sparkLight element. */
export function findSparkLight(
  recipeOrElements: HitVfxRecipe | HitVfxElement[],
): { params: SparkLightEmbed } | null {
  const recipe = Array.isArray(recipeOrElements)
    ? null
    : recipeOrElements;
  const elements = Array.isArray(recipeOrElements)
    ? recipeOrElements
    : recipeOrElements.elements;
  const groupOk = (groupId: string) =>
    !recipe || recipe.groups.find((g) => g.id === groupId)?.enabled !== false;

  for (const el of elements) {
    if (!el.enabled || !groupOk(el.groupId)) continue;
    if (el.type === 'spark' && el.params.light.enabled) {
      return { params: el.params.light };
    }
  }
  for (const el of elements) {
    if (!el.enabled || !groupOk(el.groupId)) continue;
    if (el.type === 'sparkLight') {
      return {
        params: {
          enabled: true,
          ...el.params,
        },
      };
    }
  }
  return null;
}

export function estimateInstanceLifetimeSec(
  recipe: HitVfxRecipe,
  strength: HitVfxStrength,
): number {
  const scale = recipe.strengthScale[strength];
  let max = 0.2;
  const groupOk = (groupId: string) =>
    recipe.groups.find((g) => g.id === groupId)?.enabled !== false;
  for (const el of recipe.elements) {
    if (!el.enabled || !groupOk(el.groupId)) continue;
    if (el.type === 'sparkLight') {
      max = Math.max(max, el.params.lifetimeSec + el.startDelaySec);
      continue;
    }
    if (el.type === 'spark' && el.params.light.enabled) {
      max = Math.max(
        max,
        el.params.light.lifetimeSec + el.startDelaySec,
      );
    }
    if (el.type === 'smokeRing') {
      const a = el.params.lifetimeSec[1] * scale.lifetimeMul;
      const b = el.params.filamentLifetimeSec[1] * scale.lifetimeMul;
      max = Math.max(max, Math.max(a, b) + el.startDelaySec);
      continue;
    }
    const life =
      'lifetimeSec' in el.params && Array.isArray(el.params.lifetimeSec)
        ? el.params.lifetimeSec[1] * scale.lifetimeMul
        : 0.2;
    max = Math.max(max, life + el.startDelaySec);
  }
  return max + 0.05;
}

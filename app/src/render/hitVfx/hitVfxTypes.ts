/** Hit VFX recipe types — docs/plans/ai-execution-plan-hit-vfx-v0.md §3 */

export type HitVfxRecipeKind = 'onHit' | 'onBlock';
export type HitVfxElementType =
  | 'spark'
  | 'sparkLight'
  | 'sparkDebris'
  | 'dust'
  | 'sweat'
  | 'smokeRing'
  | 'volumeSmoke';

export type VolumeSmokeSeedShape =
  | 'sphere'
  | 'disk'
  | 'ring'
  | 'arc'
  | 'arrow'
  | 'column';
/** Initial hit impulse: whole-blob push vs radial explode from seed center. */
export type VolumeSmokeImpulseMode = 'direction' | 'scatter';
/** Direction-mode axis: follow hit normal (legacy) or recipe local XYZ. */
export type VolumeSmokeImpulseDirSource = 'hit' | 'custom';
export type VolumeSmokeLightingMode = 'original' | 'project';
export type VolumeSmokeToneMapping =
  | 'None'
  | 'Linear'
  | 'Reinhard'
  | 'Cineon'
  | 'ACESFilmic'
  | 'AgX'
  | 'Neutral';
export type {
  VolumeSmokeEndCondition,
  VolumeSmokeFadeCurve,
} from './volumeSmoke/smokeFade';
import type {
  VolumeSmokeEndCondition,
  VolumeSmokeFadeCurve,
} from './volumeSmoke/smokeFade';

/** WebGPU voxel fluid smoke — ported from CircleSmokeVFX panel params. */
export type VolumeSmokeParams = {
  simulate: boolean;
  simSpeed: number;
  pressureIterations: number;
  volumeSize: number;
  unrestricted: boolean;
  unrestrictedVolumeSize: number;
  fixedSubstepsHz: number;

  hitRadius: number;
  spawnHeight: number;
  seedShape: VolumeSmokeSeedShape;
  shapeThickness: number;
  ringRadiusRatio: number;
  ringWidth: number;
  /** Arc (parenthesis) angular span in degrees; only used when seedShape === 'arc'. */
  arcAngle: number;
  /** Arrow (">") interior angle between arms in degrees. */
  arrowAngle: number;
  /** Arrow arm length as a fraction of hitRadius. */
  arrowLength: number;
  columnHeight: number;
  seedRotation: { x: number; y: number; z: number };
  /** Seed center offset in volume UVW (0 = box center; ±0.5 ≈ half-box). */
  seedOffset: { x: number; y: number; z: number };
  showSeedShape: boolean;
  spawnSeed: number;
  randomizeSeed: boolean;
  /** Scales spawnSeed jitter: 0 = none, 1 = baseline, >1 = stronger. */
  spawnVariationAmount: number;
  /**
   * Strand (缕烟) initial fill: ropes inside the seed shell instead of a solid blob.
   * Off → legacy solid seedWeight. See docs/hit-vfx-volume-smoke-strand-consensus-v0.md.
   */
  strandMode: boolean;
  /** Baseline rope count (≈N; wobbles with strandRandomAmount). Clamped 1..48. */
  strandCount: number;
  /** Rope length as a fraction of hitRadius. */
  strandLength: number;
  /** Rope thickness as a fraction of hitRadius. */
  strandThickness: number;
  /** Spacing between ropes as a fraction of hitRadius. */
  strandSpacing: number;
  /** Extra twist of the whole bundle around the shape axis (degrees). */
  strandTwistDeg: number;
  /** Per-rope angle jitter amplitude (degrees). */
  strandAngleJitterDeg: number;
  /** Bend amount: 0 ≈ straight, ~0.55 default, up to ~2 very bent. */
  strandBend: number;
  /** 0 = hard clip to shell; 1 = allow mild protrusion (default ~0.65). */
  strandEdgeSoftness: number;
  /** Soft halo beside ropes (0 = clean gaps). */
  strandGapFill: number;
  /** Scales strand-layout randomness only (independent of spawnVariationAmount). */
  strandRandomAmount: number;
  hitImpulse: number;
  hitDensity: number;
  hitTemperature: number;
  /**
   * Initial impulse pattern. See docs/hit-vfx-volume-smoke-impulse-mode-consensus-v0.md.
   * `direction` = push along an axis; `scatter` = radial from seed center.
   */
  impulseMode: VolumeSmokeImpulseMode;
  /** When impulseMode === 'direction': hit normal vs recipe impulseDir (object-local). */
  impulseDirSource: VolumeSmokeImpulseDirSource;
  /** Object-local push axis when impulseDirSource === 'custom'. */
  impulseDir: { x: number; y: number; z: number };
  showImpulseDir: boolean;
  /** Direction mode only: 0 = pure axis push; 1 = pure radial (scatter forces 1). */
  impulseRadial: number;
  impulseSwirl: number;
  impulseSubsteps: number;
  impulseScaleWithBox: boolean;
  velDisplayWarp: number;
  poolSize: number;
  /** Peak dye density threshold when endCondition === 'density'. */
  densityStop: number;
  /** Mutually exclusive close trigger: lifespan clock vs peak density. */
  endCondition: VolumeSmokeEndCondition;
  /** Seconds to fade opacity to 0 after close trigger, then destroy. */
  fadeOutSec: number;
  fadeCurve: VolumeSmokeFadeCurve;

  buoyancy: number;
  weight: number;
  turbulence: number;
  turbulenceDecay: number;
  turbFrequency: number;
  turbulenceBias: number;
  turbulenceDir: { x: number; y: number; z: number };
  showTurbulenceDir: boolean;
  velDamping: number;
  smokeLifespan: number;
  tempLifespan: number;

  raymarchSteps: number;
  resolutionScale: number;
  denoise: boolean;
  denoiseStrength: number;
  shadowAbsorption: number;
  shadowAmbient: number;
  powderStrength: number;
  multiScattering: number;
  phaseAsymmetry: number;
  /** CSS hex e.g. #b0b0b0 */
  smokeColor: string;
  densityGain: number;
  stepsDecayEnable: boolean;
  useRenderPipeline: boolean;

  lightingMode: VolumeSmokeLightingMode;
  toneMapping: VolumeSmokeToneMapping;
  exposure: number;
  keyLightIntensity: number;
  globalLight: boolean;
  showFloor: boolean;

  expandedSections: {
    basicRun: boolean;
    simDomain: boolean;
    simTime: boolean;
    hitSplat: boolean;
    hitPool: boolean;
    fluidForces: boolean;
    fluidLife: boolean;
    renderLook: boolean;
    renderPost: boolean;
    sceneLight: boolean;
  };
};
export type HitVfxHeight = 'h' | 'm' | 'l';
export type HitVfxStrength = 'L' | 'M' | 'H';

export type HitVfxElementBase = {
  id: string;
  name: string;
  type: HitVfxElementType;
  enabled: boolean;
  groupId: string;
  startDelaySec: number;
  receiveSparkLight: boolean;
};

/** Embedded spark point-light (was standalone sparkLight element). */
export type SparkLightEmbed = {
  enabled: boolean;
  color: number;
  intensity: number;
  distance: number;
  decay: number;
  lifetimeSec: number;
  intensityEnd: number;
  castOnCharacter: boolean;
  castOnVfxElements: boolean;
};

/** @deprecated Kept for loading/migrating old recipes only. */
export type SparkLightParams = Omit<SparkLightEmbed, 'enabled'>;

export type SparkParams = {
  count: number;
  lifetimeSec: [number, number];
  speed: [number, number];
  size: [number, number];
  colorStart: number;
  colorEnd: number;
  brightness: number;
  coneAngleRad: number;
  drag: number;
  gravityY: number;
  blend: 'additive';
  light: SparkLightEmbed;
};

export type SparkDebrisParams = {
  count: number;
  lifetimeSec: [number, number];
  speed: [number, number];
  size: [number, number];
  color: number;
  gravityY: number;
  drag: number;
  coneAngleRad: number;
  blend: 'additive';
};

/** @deprecated Loaded recipes migrate to smokeRing. */
export type DustParams = {
  count: number;
  lifetimeSec: [number, number];
  speed: [number, number];
  size: [number, number];
  color: number;
  opacity: number;
  gravityY: number;
  drag: number;
  coneAngleRad: number;
  blend: 'alpha';
};

/** Vortex-ring smoke (helix-noise potential + Plume ring birth). */
export type SmokeRingParams = {
  dyeCount: number;
  filamentCount: number;
  lifetimeSec: [number, number];
  filamentLifetimeSec: [number, number];
  ringRadius: number;
  tubeRadius: number;
  /** Mapped to helix createRing().circulation */
  vortexStrength: number;
  expandStrength: number;
  axialSpeed: number;
  /** Mapped to helix create().amplitude (noise mix). */
  curlAmplitude: number;
  curlFrequency: number;
  curlSpeed: number;
  drag: number;
  gravityY: number;
  size: [number, number];
  filamentWidth: number;
  color: number;
  opacity: number;
  blend: 'alpha';
  sortByDepth: boolean;
  helixHelicity: number;
  helixCoherence: number;
  helixDecay: number;
  potentialGrid: 16 | 32 | 48;
};

export type SweatParams = {
  count: number;
  lifetimeSec: [number, number];
  speed: [number, number];
  size: [number, number];
  color: number;
  gravityY: number;
  drag: number;
  coneAngleRad: number;
  blend: 'alpha';
  collideGround: false;
};

export type HitVfxElement =
  | (HitVfxElementBase & { type: 'spark'; params: SparkParams })
  | (HitVfxElementBase & { type: 'sparkLight'; params: SparkLightParams })
  | (HitVfxElementBase & { type: 'sparkDebris'; params: SparkDebrisParams })
  | (HitVfxElementBase & { type: 'dust'; params: DustParams })
  | (HitVfxElementBase & { type: 'sweat'; params: SweatParams })
  | (HitVfxElementBase & { type: 'smokeRing'; params: SmokeRingParams })
  | (HitVfxElementBase & { type: 'volumeSmoke'; params: VolumeSmokeParams });

export type HitVfxStrengthScale = {
  countMul: number;
  sizeMul: number;
  brightnessMul: number;
  lifetimeMul: number;
  lightIntensityMul: number;
};

export type HitVfxGroup = {
  id: string;
  name: string;
  enabled: boolean;
};

export type HitVfxRecipe = {
  id: string;
  name: string;
  kind: HitVfxRecipeKind;
  groups: HitVfxGroup[];
  elements: HitVfxElement[];
  strengthScale: Record<HitVfxStrength, HitVfxStrengthScale>;
};

/** Single-element template for the preset library. */
export type HitVfxElementPreset = {
  id: string;
  name: string;
  template: {
    name: string;
    type: Exclude<HitVfxElementType, 'sparkLight'>;
    enabled: boolean;
    startDelaySec: number;
    receiveSparkLight: boolean;
    params: HitVfxElement['params'];
  };
};

export const CREATABLE_ELEMENT_TYPES: Exclude<
  HitVfxElementType,
  'sparkLight' | 'dust' | 'smokeRing'
>[] = ['spark', 'sparkDebris', 'sweat', 'volumeSmoke'];

export type HitVfxHeightOffset = Record<
  HitVfxHeight,
  { y: number; z: number }
>;

export type HitVfxTriggerKind = HitVfxRecipeKind;

export type HitVfxTriggerArgs = {
  kind: HitVfxTriggerKind;
  strength: HitVfxStrength;
  height: HitVfxHeight;
  /** World X of defender root. */
  x: number;
  /** World facing of defender (+1 / -1). */
  facing: number;
  /** Optional world punch axis (unit). Default (-facing, 0, 0). */
  axis?: [number, number, number];
};

const ELEMENT_TYPES: HitVfxElementType[] = [
  'spark',
  'sparkLight',
  'sparkDebris',
  'dust',
  'sweat',
  'smokeRing',
  'volumeSmoke',
];

export function defaultVolumeSmokeParams(
  overrides?: Partial<VolumeSmokeParams>,
): VolumeSmokeParams {
  return {
    simulate: true,
    simSpeed: 1.0,
    pressureIterations: 6,
    volumeSize: 3,
    unrestricted: false,
    unrestrictedVolumeSize: 12,
    fixedSubstepsHz: 120,

    hitRadius: 0.36,
    spawnHeight: 0,
    seedShape: 'sphere',
    shapeThickness: 0.28,
    ringRadiusRatio: 0.65,
    ringWidth: 0.22,
    arcAngle: 140,
    arrowAngle: 70,
    arrowLength: 1,
    columnHeight: 1.4,
    seedRotation: { x: 0, y: 0, z: 0 },
    seedOffset: { x: 0, y: 0, z: 0 },
    showSeedShape: true,
    spawnSeed: 0,
    randomizeSeed: false,
    spawnVariationAmount: 1,
    strandMode: false,
    strandCount: 8,
    strandLength: 0.85,
    strandThickness: 0.18,
    strandSpacing: 0.22,
    strandTwistDeg: 0,
    strandAngleJitterDeg: 18,
    strandBend: 0.55,
    strandEdgeSoftness: 0.65,
    strandGapFill: 0.12,
    strandRandomAmount: 1,
    hitImpulse: 14,
    hitDensity: 4,
    hitTemperature: 3,
    impulseMode: 'direction',
    impulseDirSource: 'hit',
    impulseDir: { x: 0, y: 1, z: 0 },
    showImpulseDir: true,
    impulseRadial: 0.2,
    impulseSwirl: 1.2,
    impulseSubsteps: 8,
    impulseScaleWithBox: true,
    velDisplayWarp: 0.04,
    poolSize: 2,
    densityStop: 0.02,
    endCondition: 'lifespan',
    fadeOutSec: 0.3,
    fadeCurve: 'easeOut',

    buoyancy: 2.0,
    weight: 0.15,
    turbulence: 2.5,
    turbulenceDecay: 0.1,
    turbFrequency: 8,
    turbulenceBias: 0,
    turbulenceDir: { x: 0, y: 1, z: 0 },
    showTurbulenceDir: true,
    velDamping: 0.35,
    smokeLifespan: 1.2,
    tempLifespan: 0.8,

    raymarchSteps: 24,
    resolutionScale: 0.5,
    denoise: true,
    denoiseStrength: 0.5,
    shadowAbsorption: 2,
    shadowAmbient: 0.5,
    powderStrength: 0.4,
    multiScattering: 0.5,
    phaseAsymmetry: 0,
    smokeColor: '#b0b0b0',
    densityGain: 1,
    stepsDecayEnable: true,
    useRenderPipeline: false,

    lightingMode: 'original',
    toneMapping: 'ACESFilmic',
    exposure: 1.2,
    keyLightIntensity: 800,
    globalLight: false,
    showFloor: false,

    expandedSections: {
      basicRun: true,
      simDomain: true,
      simTime: false,
      hitSplat: true,
      hitPool: false,
      fluidForces: true,
      fluidLife: true,
      renderLook: true,
      renderPost: false,
      sceneLight: true,
    },
    ...overrides,
  };
}

export function defaultSmokeRingParams(
  overrides?: Partial<SmokeRingParams>,
): SmokeRingParams {
  return {
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
    ...overrides,
  };
}

function asFinite(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function asPair(
  v: unknown,
  fallback: [number, number],
): [number, number] {
  if (Array.isArray(v) && v.length >= 2) {
    return [asFinite(v[0], fallback[0]), asFinite(v[1], fallback[1])];
  }
  return [fallback[0], fallback[1]];
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asHex(v: unknown, fallback: number): number {
  const n = asFinite(v, fallback);
  return n >>> 0;
}

export function defaultStrengthScale(): Record<
  HitVfxStrength,
  HitVfxStrengthScale
> {
  return {
    L: {
      countMul: 0.65,
      sizeMul: 0.85,
      brightnessMul: 0.75,
      lifetimeMul: 0.9,
      lightIntensityMul: 0.7,
    },
    M: {
      countMul: 1,
      sizeMul: 1,
      brightnessMul: 1,
      lifetimeMul: 1,
      lightIntensityMul: 1,
    },
    H: {
      countMul: 1.35,
      sizeMul: 1.15,
      brightnessMul: 1.25,
      lifetimeMul: 1.1,
      lightIntensityMul: 1.35,
    },
  };
}

export function defaultHeightOffsets(): HitVfxHeightOffset {
  return {
    h: { y: 1.55, z: 0 },
    m: { y: 1.15, z: 0 },
    l: { y: 0.55, z: 0 },
  };
}

export function defaultSparkLightEmbed(
  overrides?: Partial<SparkLightEmbed>,
): SparkLightEmbed {
  return {
    enabled: true,
    color: 0xffb060,
    intensity: 4.5,
    distance: 2.8,
    decay: 2,
    lifetimeSec: 0.12,
    intensityEnd: 0,
    castOnCharacter: true,
    castOnVfxElements: true,
    ...overrides,
  };
}

export function normalizeSparkLightEmbed(raw: unknown): SparkLightEmbed {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const base = defaultSparkLightEmbed();
  return {
    enabled: asBool(o.enabled, base.enabled),
    color: asHex(o.color, base.color),
    intensity: asFinite(o.intensity, base.intensity),
    distance: asFinite(o.distance, base.distance),
    decay: asFinite(o.decay, base.decay),
    lifetimeSec: asFinite(o.lifetimeSec, base.lifetimeSec),
    intensityEnd: asFinite(o.intensityEnd, base.intensityEnd),
    castOnCharacter: asBool(o.castOnCharacter, base.castOnCharacter),
    castOnVfxElements: asBool(o.castOnVfxElements, base.castOnVfxElements),
  };
}

/** @deprecated migration path */
function normalizeSparkLightParams(raw: unknown): SparkLightParams {
  const e = normalizeSparkLightEmbed(raw);
  const { enabled: _e, ...rest } = e;
  return rest;
}

function normalizeSparkParams(raw: unknown): SparkParams {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    count: Math.max(0, Math.round(asFinite(o.count, 28))),
    lifetimeSec: asPair(o.lifetimeSec, [0.08, 0.18]),
    speed: asPair(o.speed, [2.5, 6]),
    size: asPair(o.size, [0.03, 0.08]),
    colorStart: asHex(o.colorStart, 0xffe0a0),
    colorEnd: asHex(o.colorEnd, 0xff6020),
    brightness: asFinite(o.brightness, 1.4),
    coneAngleRad: asFinite(o.coneAngleRad, 0.7),
    drag: asFinite(o.drag, 0.15),
    gravityY: asFinite(o.gravityY, 0),
    blend: 'additive',
    light: normalizeSparkLightEmbed(o.light),
  };
}

function normalizeDebrisParams(raw: unknown): SparkDebrisParams {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    count: Math.max(0, Math.round(asFinite(o.count, 16))),
    lifetimeSec: asPair(o.lifetimeSec, [0.12, 0.28]),
    speed: asPair(o.speed, [1.2, 3.5]),
    size: asPair(o.size, [0.02, 0.05]),
    color: asHex(o.color, 0xffcc88),
    gravityY: asFinite(o.gravityY, -2),
    drag: asFinite(o.drag, 0.25),
    coneAngleRad: asFinite(o.coneAngleRad, 0.9),
    blend: 'additive',
  };
}

function normalizeDustParams(raw: unknown): DustParams {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    count: Math.max(0, Math.round(asFinite(o.count, 10))),
    lifetimeSec: asPair(o.lifetimeSec, [0.2, 0.45]),
    speed: asPair(o.speed, [0.3, 1.2]),
    size: asPair(o.size, [0.18, 0.4]),
    color: asHex(o.color, 0xc8c0b0),
    opacity: asFinite(o.opacity, 0.45),
    gravityY: asFinite(o.gravityY, 0.4),
    drag: asFinite(o.drag, 0.5),
    coneAngleRad: asFinite(o.coneAngleRad, 1.0),
    blend: 'alpha',
  };
}

export function dustParamsToSmokeRing(dust: DustParams): SmokeRingParams {
  return defaultSmokeRingParams({
    dyeCount: dust.count,
    filamentCount: Math.max(6, Math.round(dust.count * 0.25)),
    lifetimeSec: dust.lifetimeSec,
    size: dust.size,
    color: dust.color,
    opacity: dust.opacity,
    drag: Math.max(dust.drag, 2.5),
    gravityY: 0,
  });
}

function normalizeSmokeRingParams(raw: unknown): SmokeRingParams {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const d = defaultSmokeRingParams();
  const gridRaw = asFinite(o.potentialGrid, d.potentialGrid);
  const potentialGrid: 16 | 32 | 48 =
    gridRaw <= 16 ? 16 : gridRaw <= 32 ? 32 : 48;
  return {
    dyeCount: Math.max(0, Math.round(asFinite(o.dyeCount, d.dyeCount))),
    filamentCount: Math.max(
      0,
      Math.round(asFinite(o.filamentCount, d.filamentCount)),
    ),
    lifetimeSec: asPair(o.lifetimeSec, d.lifetimeSec),
    filamentLifetimeSec: asPair(o.filamentLifetimeSec, d.filamentLifetimeSec),
    ringRadius: asFinite(o.ringRadius, d.ringRadius),
    tubeRadius: asFinite(o.tubeRadius, d.tubeRadius),
    vortexStrength: asFinite(o.vortexStrength, d.vortexStrength),
    expandStrength: asFinite(o.expandStrength, d.expandStrength),
    axialSpeed: asFinite(o.axialSpeed, d.axialSpeed),
    curlAmplitude: asFinite(o.curlAmplitude, d.curlAmplitude),
    curlFrequency: asFinite(o.curlFrequency, d.curlFrequency),
    curlSpeed: asFinite(o.curlSpeed, d.curlSpeed),
    drag: asFinite(o.drag, d.drag),
    gravityY: asFinite(o.gravityY, d.gravityY),
    size: asPair(o.size, d.size),
    filamentWidth: asFinite(o.filamentWidth, d.filamentWidth),
    color: asHex(o.color, d.color),
    opacity: asFinite(o.opacity, d.opacity),
    blend: 'alpha',
    sortByDepth: asBool(o.sortByDepth, d.sortByDepth),
    helixHelicity: asFinite(o.helixHelicity, d.helixHelicity),
    helixCoherence: asFinite(o.helixCoherence, d.helixCoherence),
    helixDecay: asFinite(o.helixDecay, d.helixDecay),
    potentialGrid,
  };
}

function normalizeSweatParams(raw: unknown): SweatParams {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    count: Math.max(0, Math.round(asFinite(o.count, 8))),
    lifetimeSec: asPair(o.lifetimeSec, [0.25, 0.55]),
    speed: asPair(o.speed, [1.0, 2.8]),
    size: asPair(o.size, [0.015, 0.035]),
    color: asHex(o.color, 0xd0e8ff),
    gravityY: asFinite(o.gravityY, 9.8),
    drag: asFinite(o.drag, 0.08),
    coneAngleRad: asFinite(o.coneAngleRad, 0.85),
    blend: 'alpha',
    collideGround: false,
  };
}

function asVec3(
  v: unknown,
  fallback: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  if (!v || typeof v !== 'object') return { ...fallback };
  const o = v as Record<string, unknown>;
  return {
    x: asFinite(o.x, fallback.x),
    y: asFinite(o.y, fallback.y),
    z: asFinite(o.z, fallback.z),
  };
}

function asSmokeColor(v: unknown, fallback: string): string {
  if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `#${(v >>> 0).toString(16).padStart(6, '0')}`;
  }
  return fallback;
}

const TONE_MAPPINGS: VolumeSmokeToneMapping[] = [
  'None',
  'Linear',
  'Reinhard',
  'Cineon',
  'ACESFilmic',
  'AgX',
  'Neutral',
];

const SEED_SHAPES: VolumeSmokeSeedShape[] = [
  'sphere',
  'disk',
  'ring',
  'arc',
  'arrow',
  'column',
];

const END_CONDITIONS: VolumeSmokeEndCondition[] = ['lifespan', 'density'];
const FADE_CURVES: VolumeSmokeFadeCurve[] = [
  'linear',
  'easeOut',
  'easeIn',
  'smoothstep',
];
const IMPULSE_MODES: VolumeSmokeImpulseMode[] = ['direction', 'scatter'];
const IMPULSE_DIR_SOURCES: VolumeSmokeImpulseDirSource[] = ['hit', 'custom'];

export function normalizeVolumeSmokeParams(raw: unknown): VolumeSmokeParams {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const d = defaultVolumeSmokeParams();
  const seedShapeRaw = String(o.seedShape ?? d.seedShape);
  const seedShape = SEED_SHAPES.includes(seedShapeRaw as VolumeSmokeSeedShape)
    ? (seedShapeRaw as VolumeSmokeSeedShape)
    : d.seedShape;
  const toneRaw = String(o.toneMapping ?? d.toneMapping);
  const toneMapping = TONE_MAPPINGS.includes(toneRaw as VolumeSmokeToneMapping)
    ? (toneRaw as VolumeSmokeToneMapping)
    : d.toneMapping;
  const lightingMode: VolumeSmokeLightingMode =
    o.lightingMode === 'project' ? 'project' : 'original';
  // Legacy recipes without impulseMode keep today's "follow hit normal" push.
  const hasImpulseMode = Object.prototype.hasOwnProperty.call(o, 'impulseMode');
  const impulseModeRaw = String(o.impulseMode ?? d.impulseMode);
  const impulseMode = IMPULSE_MODES.includes(
    impulseModeRaw as VolumeSmokeImpulseMode,
  )
    ? (impulseModeRaw as VolumeSmokeImpulseMode)
    : d.impulseMode;
  const impulseDirSourceRaw = String(
    o.impulseDirSource ?? (hasImpulseMode ? d.impulseDirSource : 'hit'),
  );
  const impulseDirSource = IMPULSE_DIR_SOURCES.includes(
    impulseDirSourceRaw as VolumeSmokeImpulseDirSource,
  )
    ? (impulseDirSourceRaw as VolumeSmokeImpulseDirSource)
    : hasImpulseMode
      ? d.impulseDirSource
      : 'hit';
  const expandedRaw =
    o.expandedSections && typeof o.expandedSections === 'object'
      ? (o.expandedSections as Record<string, unknown>)
      : {};
  let pressureIterations = Math.round(
    asFinite(o.pressureIterations, d.pressureIterations),
  );
  pressureIterations = Math.max(2, Math.floor(pressureIterations / 2) * 2);
  return {
    simulate: asBool(o.simulate, d.simulate),
    simSpeed: asFinite(o.simSpeed, d.simSpeed),
    pressureIterations,
    volumeSize: asFinite(o.volumeSize, d.volumeSize),
    unrestricted: asBool(o.unrestricted, d.unrestricted),
    unrestrictedVolumeSize: asFinite(
      o.unrestrictedVolumeSize,
      d.unrestrictedVolumeSize,
    ),
    fixedSubstepsHz: Math.round(
      asFinite(o.fixedSubstepsHz, d.fixedSubstepsHz),
    ),
    hitRadius: asFinite(o.hitRadius, d.hitRadius),
    spawnHeight: asFinite(o.spawnHeight, d.spawnHeight),
    seedShape,
    shapeThickness: asFinite(o.shapeThickness, d.shapeThickness),
    ringRadiusRatio: asFinite(o.ringRadiusRatio, d.ringRadiusRatio),
    ringWidth: asFinite(o.ringWidth, d.ringWidth),
    arcAngle: Math.min(
      360,
      Math.max(1, asFinite(o.arcAngle, d.arcAngle)),
    ),
    arrowAngle: Math.min(
      179,
      Math.max(5, asFinite(o.arrowAngle, d.arrowAngle)),
    ),
    arrowLength: Math.max(0.05, asFinite(o.arrowLength, d.arrowLength)),
    columnHeight: asFinite(o.columnHeight, d.columnHeight),
    seedRotation: asVec3(o.seedRotation, d.seedRotation),
    seedOffset: asVec3(o.seedOffset, d.seedOffset),
    showSeedShape: asBool(o.showSeedShape, d.showSeedShape),
    spawnSeed: Math.round(asFinite(o.spawnSeed, d.spawnSeed)) >>> 0,
    randomizeSeed: asBool(o.randomizeSeed, d.randomizeSeed),
    spawnVariationAmount: Math.max(
      0,
      asFinite(o.spawnVariationAmount, d.spawnVariationAmount),
    ),
    strandMode: asBool(o.strandMode, d.strandMode),
    strandCount: Math.max(
      1,
      Math.min(48, Math.round(asFinite(o.strandCount, d.strandCount))),
    ),
    strandLength: Math.max(0.02, asFinite(o.strandLength, d.strandLength)),
    strandThickness: Math.max(
      0.005,
      asFinite(o.strandThickness, d.strandThickness),
    ),
    strandSpacing: Math.max(0.02, asFinite(o.strandSpacing, d.strandSpacing)),
    strandTwistDeg: asFinite(o.strandTwistDeg, d.strandTwistDeg),
    strandAngleJitterDeg: Math.max(
      0,
      asFinite(o.strandAngleJitterDeg, d.strandAngleJitterDeg),
    ),
    strandBend: Math.max(0, asFinite(o.strandBend, d.strandBend)),
    strandEdgeSoftness: Math.max(
      0,
      Math.min(1, asFinite(o.strandEdgeSoftness, d.strandEdgeSoftness)),
    ),
    strandGapFill: Math.max(
      0,
      Math.min(1, asFinite(o.strandGapFill, d.strandGapFill)),
    ),
    strandRandomAmount: Math.max(
      0,
      asFinite(o.strandRandomAmount, d.strandRandomAmount),
    ),
    hitImpulse: asFinite(o.hitImpulse, d.hitImpulse),
    hitDensity: asFinite(o.hitDensity, d.hitDensity),
    hitTemperature: asFinite(o.hitTemperature, d.hitTemperature),
    impulseMode,
    impulseDirSource,
    impulseDir: asVec3(o.impulseDir, d.impulseDir),
    showImpulseDir: asBool(o.showImpulseDir, d.showImpulseDir),
    impulseRadial: asFinite(o.impulseRadial, d.impulseRadial),
    impulseSwirl: asFinite(o.impulseSwirl, d.impulseSwirl),
    impulseSubsteps: Math.round(
      asFinite(o.impulseSubsteps, d.impulseSubsteps),
    ),
    impulseScaleWithBox: asBool(o.impulseScaleWithBox, d.impulseScaleWithBox),
    velDisplayWarp: asFinite(o.velDisplayWarp, d.velDisplayWarp),
    poolSize: Math.max(
      1,
      Math.min(8, Math.round(asFinite(o.poolSize, d.poolSize))),
    ),
    densityStop: asFinite(o.densityStop, d.densityStop),
    endCondition: END_CONDITIONS.includes(
      o.endCondition as VolumeSmokeEndCondition,
    )
      ? (o.endCondition as VolumeSmokeEndCondition)
      : d.endCondition,
    fadeOutSec: Math.max(0, asFinite(o.fadeOutSec, d.fadeOutSec)),
    fadeCurve: FADE_CURVES.includes(o.fadeCurve as VolumeSmokeFadeCurve)
      ? (o.fadeCurve as VolumeSmokeFadeCurve)
      : d.fadeCurve,
    buoyancy: asFinite(o.buoyancy, d.buoyancy),
    weight: asFinite(o.weight, d.weight),
    turbulence: asFinite(o.turbulence, d.turbulence),
    turbulenceDecay: asFinite(o.turbulenceDecay, d.turbulenceDecay),
    turbFrequency: asFinite(o.turbFrequency, d.turbFrequency),
    turbulenceBias: asFinite(o.turbulenceBias, d.turbulenceBias),
    turbulenceDir: asVec3(o.turbulenceDir, d.turbulenceDir),
    showTurbulenceDir: asBool(o.showTurbulenceDir, d.showTurbulenceDir),
    velDamping: asFinite(o.velDamping, d.velDamping),
    smokeLifespan: asFinite(o.smokeLifespan, d.smokeLifespan),
    tempLifespan: asFinite(o.tempLifespan, d.tempLifespan),
    raymarchSteps: Math.round(asFinite(o.raymarchSteps, d.raymarchSteps)),
    resolutionScale: asFinite(o.resolutionScale, d.resolutionScale),
    denoise: asBool(o.denoise, d.denoise),
    denoiseStrength: asFinite(o.denoiseStrength, d.denoiseStrength),
    shadowAbsorption: asFinite(o.shadowAbsorption, d.shadowAbsorption),
    shadowAmbient: asFinite(o.shadowAmbient, d.shadowAmbient),
    powderStrength: asFinite(o.powderStrength, d.powderStrength),
    multiScattering: asFinite(o.multiScattering, d.multiScattering),
    phaseAsymmetry: asFinite(o.phaseAsymmetry, d.phaseAsymmetry),
    smokeColor: asSmokeColor(o.smokeColor, d.smokeColor),
    densityGain: asFinite(o.densityGain, d.densityGain),
    stepsDecayEnable: asBool(o.stepsDecayEnable, d.stepsDecayEnable),
    useRenderPipeline: asBool(o.useRenderPipeline, d.useRenderPipeline),
    lightingMode,
    toneMapping,
    exposure: asFinite(o.exposure, d.exposure),
    keyLightIntensity: asFinite(o.keyLightIntensity, d.keyLightIntensity),
    globalLight: asBool(o.globalLight, d.globalLight),
    showFloor: asBool(o.showFloor, d.showFloor),
    expandedSections: {
      basicRun: asBool(expandedRaw.basicRun, d.expandedSections.basicRun),
      simDomain: asBool(expandedRaw.simDomain, d.expandedSections.simDomain),
      simTime: asBool(expandedRaw.simTime, d.expandedSections.simTime),
      hitSplat: asBool(expandedRaw.hitSplat, d.expandedSections.hitSplat),
      hitPool: asBool(expandedRaw.hitPool, d.expandedSections.hitPool),
      fluidForces: asBool(
        expandedRaw.fluidForces,
        d.expandedSections.fluidForces,
      ),
      fluidLife: asBool(expandedRaw.fluidLife, d.expandedSections.fluidLife),
      renderLook: asBool(expandedRaw.renderLook, d.expandedSections.renderLook),
      renderPost: asBool(expandedRaw.renderPost, d.expandedSections.renderPost),
      sceneLight: asBool(expandedRaw.sceneLight, d.expandedSections.sceneLight),
    },
  };
}

export function normalizeHitVfxElement(
  raw: unknown,
  index: number,
): HitVfxElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = String(o.type ?? '') as HitVfxElementType;
  if (!ELEMENT_TYPES.includes(type)) return null;
  const base: HitVfxElementBase = {
    id: typeof o.id === 'string' && o.id ? o.id : `el_${index}_${type}`,
    name: typeof o.name === 'string' && o.name ? o.name : type,
    type,
    enabled: asBool(o.enabled, true),
    groupId: typeof o.groupId === 'string' && o.groupId ? o.groupId : 'main',
    startDelaySec: Math.max(0, asFinite(o.startDelaySec, 0)),
    receiveSparkLight: asBool(o.receiveSparkLight, type !== 'spark'),
  };
  if (type === 'spark') {
    return { ...base, type, params: normalizeSparkParams(o.params) };
  }
  if (type === 'sparkLight') {
    return { ...base, type, params: normalizeSparkLightParams(o.params) };
  }
  if (type === 'sparkDebris') {
    return { ...base, type, params: normalizeDebrisParams(o.params) };
  }
  if (type === 'dust') {
    // Migrate legacy cone dust → smokeRing (plan §2.2).
    return {
      ...base,
      type: 'smokeRing',
      name: base.name === 'dust' ? '涡环烟' : base.name,
      params: dustParamsToSmokeRing(normalizeDustParams(o.params)),
    };
  }
  if (type === 'smokeRing') {
    return { ...base, type, params: normalizeSmokeRingParams(o.params) };
  }
  if (type === 'volumeSmoke') {
    return { ...base, type, params: normalizeVolumeSmokeParams(o.params) };
  }
  return { ...base, type: 'sweat', params: normalizeSweatParams(o.params) };
}

export function normalizeHitVfxGroup(
  raw: unknown,
  index: number,
): HitVfxGroup | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id =
    typeof o.id === 'string' && o.id ? o.id : `group_${index}`;
  return {
    id,
    name:
      typeof o.name === 'string' && o.name
        ? o.name
        : id === 'main'
          ? '主组'
          : id,
    enabled: asBool(o.enabled, true),
  };
}

function ensureGroups(
  groupsIn: unknown,
  elements: HitVfxElement[],
): HitVfxGroup[] {
  const parsed = Array.isArray(groupsIn)
    ? groupsIn
        .map((g, i) => normalizeHitVfxGroup(g, i))
        .filter((g): g is HitVfxGroup => g != null)
    : [];
  if (parsed.length > 0) {
    const ids = new Set(parsed.map((g) => g.id));
    for (const el of elements) {
      if (!ids.has(el.groupId)) {
        el.groupId = parsed[0]!.id;
      }
    }
    return parsed;
  }
  const seen = new Map<string, HitVfxGroup>();
  for (const el of elements) {
    if (!seen.has(el.groupId)) {
      seen.set(el.groupId, {
        id: el.groupId,
        name: el.groupId === 'main' ? '主组' : el.groupId,
        enabled: true,
      });
    }
  }
  if (seen.size === 0) {
    seen.set('main', { id: 'main', name: '主组', enabled: true });
  }
  return [...seen.values()];
}

/**
 * Merge legacy standalone sparkLight elements into spark.params.light,
 * then strip sparkLight from the element list.
 */
export function migrateSparkLightIntoSparks(
  recipe: HitVfxRecipe,
): HitVfxRecipe {
  const lights = recipe.elements.filter((e) => e.type === 'sparkLight');
  if (lights.length === 0) {
    return {
      ...recipe,
      elements: recipe.elements.filter((e) => e.type !== 'sparkLight'),
    };
  }
  const elements = recipe.elements
    .filter((e) => e.type !== 'sparkLight')
    .map((e) =>
      e.type === 'spark'
        ? {
            ...e,
            params: {
              ...e.params,
              light: { ...e.params.light },
            },
          }
        : e,
    );
  for (const light of lights) {
    if (light.type !== 'sparkLight') continue;
    const embed = defaultSparkLightEmbed({
      ...light.params,
      enabled: light.enabled,
    });
    let spark = elements.find(
      (e): e is Extract<HitVfxElement, { type: 'spark' }> =>
        e.type === 'spark' && e.groupId === light.groupId,
    );
    if (!spark) {
      spark = elements.find(
        (e): e is Extract<HitVfxElement, { type: 'spark' }> =>
          e.type === 'spark',
      );
    }
    if (spark) {
      spark.params.light = embed;
    } else {
      elements.unshift({
        id: `spark_from_${light.id}`,
        name: '打击火花',
        type: 'spark',
        enabled: true,
        groupId: light.groupId,
        startDelaySec: light.startDelaySec,
        receiveSparkLight: false,
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
          light: embed,
        },
      });
    }
  }
  return { ...recipe, elements };
}

export function normalizeHitVfxElementPreset(
  raw: unknown,
  index: number,
): HitVfxElementPreset | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const templateRaw =
    o.template && typeof o.template === 'object'
      ? (o.template as Record<string, unknown>)
      : o;
  const type = String(templateRaw.type ?? '') as HitVfxElementType;
  if (type === 'sparkLight' || !CREATABLE_ELEMENT_TYPES.includes(type as never)) {
    return null;
  }
  const el = normalizeHitVfxElement(
    {
      ...templateRaw,
      id: 'preset_tpl',
      type,
    },
    index,
  );
  if (!el || el.type === 'sparkLight') return null;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : `preset_${index}`,
    name: typeof o.name === 'string' && o.name ? o.name : el.name,
    template: {
      name: el.name,
      type: el.type,
      enabled: el.enabled,
      startDelaySec: el.startDelaySec,
      receiveSparkLight: el.receiveSparkLight,
      params: el.params,
    },
  };
}

export function normalizeHitVfxRecipe(
  raw: unknown,
  index: number,
): HitVfxRecipe | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind === 'onBlock' ? 'onBlock' : 'onHit';
  const id =
    typeof o.id === 'string' && o.id
      ? o.id
      : kind === 'onHit'
        ? `recipe_hit_${index}`
        : `recipe_block_${index}`;
  const elementsIn = Array.isArray(o.elements) ? o.elements : [];
  let elements = elementsIn
    .map((e, i) => normalizeHitVfxElement(e, i))
    .filter((e): e is HitVfxElement => e != null);
  const scaleRaw =
    o.strengthScale && typeof o.strengthScale === 'object'
      ? (o.strengthScale as Record<string, Partial<HitVfxStrengthScale>>)
      : {};
  const baseScale = defaultStrengthScale();
  const strengthScale: Record<HitVfxStrength, HitVfxStrengthScale> = {
    L: { ...baseScale.L, ...(scaleRaw.L ?? {}) },
    M: { ...baseScale.M, ...(scaleRaw.M ?? {}) },
    H: { ...baseScale.H, ...(scaleRaw.H ?? {}) },
  };
  for (const k of ['L', 'M', 'H'] as const) {
    const s = strengthScale[k];
    s.countMul = asFinite(s.countMul, baseScale[k].countMul);
    s.sizeMul = asFinite(s.sizeMul, baseScale[k].sizeMul);
    s.brightnessMul = asFinite(s.brightnessMul, baseScale[k].brightnessMul);
    s.lifetimeMul = asFinite(s.lifetimeMul, baseScale[k].lifetimeMul);
    s.lightIntensityMul = asFinite(
      s.lightIntensityMul,
      baseScale[k].lightIntensityMul,
    );
  }
  const groups = ensureGroups(o.groups, elements);
  let recipe: HitVfxRecipe = {
    id,
    name: typeof o.name === 'string' && o.name ? o.name : id,
    kind,
    groups,
    elements,
    strengthScale,
  };
  recipe = migrateSparkLightIntoSparks(recipe);
  recipe.groups = ensureGroups(recipe.groups, recipe.elements);
  return recipe;
}

export function normalizeHeightOffsets(raw: unknown): HitVfxHeightOffset {
  const d = defaultHeightOffsets();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  for (const h of ['h', 'm', 'l'] as const) {
    const row = o[h];
    if (row && typeof row === 'object') {
      const r = row as Record<string, unknown>;
      d[h] = {
        y: asFinite(r.y, d[h].y),
        z: asFinite(r.z, d[h].z),
      };
    }
  }
  return d;
}

export function hexToRgb01(hex: number): [number, number, number] {
  const h = hex >>> 0;
  return [
    ((h >> 16) & 255) / 255,
    ((h >> 8) & 255) / 255,
    (h & 255) / 255,
  ];
}

export function scaleCount(base: number, mul: number): number {
  return Math.max(0, Math.round(base * mul));
}

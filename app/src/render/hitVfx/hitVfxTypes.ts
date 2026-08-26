/** Hit VFX recipe types — docs/plans/ai-execution-plan-hit-vfx-v0.md §3 */

export type HitVfxRecipeKind = 'onHit' | 'onBlock';
export type HitVfxElementType =
  | 'spark'
  | 'sparkLight'
  | 'sparkDebris'
  | 'dust'
  | 'sweat';
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
  | (HitVfxElementBase & { type: 'sweat'; params: SweatParams });

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
  'sparkLight'
>[] = ['spark', 'sparkDebris', 'dust', 'sweat'];

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
};

const ELEMENT_TYPES: HitVfxElementType[] = [
  'spark',
  'sparkLight',
  'sparkDebris',
  'dust',
  'sweat',
];

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
    return { ...base, type, params: normalizeDustParams(o.params) };
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

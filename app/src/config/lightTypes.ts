/** Light list data model — docs/plans/ai-execution-plan-lighting-system-v0.md §3 */

export type LightType =
  | 'ambient'
  | 'hemisphere'
  | 'directional'
  | 'point'
  | 'spot';

export type Vec3Desc = { x: number; y: number; z: number };

/** Lock light X (and target X when present) to a fighter and slide with them. */
export type LightFollowTarget = 'none' | 'p1' | 'p2';

/** Types that can follow a fighter on X. */
export function lightSupportsFollow(type: LightType): boolean {
  return type === 'directional' || type === 'point' || type === 'spot';
}

export type LightDesc = {
  id: string;
  name: string;
  type: LightType;
  enabled: boolean;
  color: number;
  intensity: number;
  position: Vec3Desc;
  target: Vec3Desc;
  groundColor?: number;
  distance?: number;
  decay?: number;
  angle?: number;
  penumbra?: number;
  castShadow: boolean;
  /**
   * directional / point / spot. When p1/p2:
   * - all: position.x tracks fighter world X via followOffsetPosX
   * - directional & spot: target.x also tracks via followOffsetTargetX
   *   (relative light→target X stays fixed); Y/Z absolute.
   */
  follow?: LightFollowTarget;
  /** World-space X offset: position.x = fighterWorldX + followOffsetPosX */
  followOffsetPosX?: number;
  /** World-space X offset: target.x = fighterWorldX + followOffsetTargetX (dir/spot) */
  followOffsetTargetX?: number;
};

const LIGHT_TYPES: ReadonlySet<string> = new Set([
  'ambient',
  'hemisphere',
  'directional',
  'point',
  'spot',
]);

export const FLAT_LIGHT_KEYS = [
  'lightAmbientIntensity',
  'lightAmbientColor',
  'lightHemiIntensity',
  'lightHemiSky',
  'lightHemiGround',
  'lightKeyIntensity',
  'lightKeyColor',
  'lightKeyX',
  'lightKeyY',
  'lightKeyZ',
  'lightFillIntensity',
  'lightFillColor',
  'lightFillX',
  'lightFillY',
  'lightFillZ',
  'lightRimIntensity',
  'lightRimColor',
  'lightRimX',
  'lightRimY',
  'lightRimZ',
] as const;

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function vec3(v: unknown, fx: number, fy: number, fz: number): Vec3Desc {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return { x: num(o.x, fx), y: num(o.y, fy), z: num(o.z, fz) };
  }
  return { x: fx, y: fy, z: fz };
}

export function createDefaultLights(): LightDesc[] {
  return [
    {
      id: 'ambient',
      name: '环境光',
      type: 'ambient',
      enabled: true,
      color: 0xffffff,
      intensity: 0.3,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      castShadow: false,
    },
    {
      id: 'hemi',
      name: '半球光',
      type: 'hemisphere',
      enabled: true,
      color: 0xe8eaee,
      intensity: 0.5,
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      groundColor: 0x8a8680,
      castShadow: false,
    },
    {
      id: 'key',
      name: '主光',
      type: 'directional',
      enabled: true,
      color: 0xf4f2ee,
      intensity: 1.05,
      position: { x: 0, y: 16, z: 4 },
      target: { x: 0, y: 0, z: 0 },
      castShadow: true,
    },
    {
      id: 'fill',
      name: '补光',
      type: 'directional',
      enabled: true,
      color: 0xaaccff,
      intensity: 0,
      position: { x: -9, y: 5, z: -3 },
      target: { x: 0, y: 0, z: 0 },
      castShadow: false,
    },
    {
      id: 'rim',
      name: '轮廓光',
      type: 'directional',
      enabled: true,
      color: 0xffffff,
      intensity: 0.32,
      position: { x: 0, y: 8, z: -10 },
      target: { x: 0, y: 0, z: 0 },
      castShadow: false,
    },
  ];
}

export function normalizeLightDesc(
  raw: unknown,
  index = 0,
): LightDesc | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const type = str(o.type, 'directional');
  if (!LIGHT_TYPES.has(type)) return null;
  const t = type as LightType;
  const id = str(o.id, `light_${index}`);
  const base: LightDesc = {
    id,
    name: str(o.name, id),
    type: t,
    enabled: bool(o.enabled, true),
    color: num(o.color, 0xffffff) >>> 0,
    intensity: num(o.intensity, 1),
    position: vec3(o.position, 0, 8, 4),
    target: vec3(o.target, 0, 0, 0),
    castShadow: bool(o.castShadow, false),
  };
  if (t === 'hemisphere') {
    base.groundColor = num(o.groundColor, 0x444444) >>> 0;
  }
  if (t === 'point' || t === 'spot') {
    base.distance = num(o.distance, 0);
    base.decay = num(o.decay, 2);
  }
  if (t === 'spot') {
    base.angle = num(o.angle, Math.PI / 6);
    base.penumbra = num(o.penumbra, 0.2);
  }
  if (t !== 'directional') {
    base.castShadow = false;
  }
  if (lightSupportsFollow(t)) {
    const f = str(o.follow, 'none');
    base.follow =
      f === 'p1' || f === 'p2' || f === 'none' ? (f as LightFollowTarget) : 'none';
    if (typeof o.followOffsetPosX === 'number' && Number.isFinite(o.followOffsetPosX)) {
      base.followOffsetPosX = o.followOffsetPosX;
    }
    if (
      typeof o.followOffsetTargetX === 'number' &&
      Number.isFinite(o.followOffsetTargetX)
    ) {
      base.followOffsetTargetX = o.followOffsetTargetX;
    }
  } else {
    base.follow = 'none';
    delete base.followOffsetPosX;
    delete base.followOffsetTargetX;
  }
  return base;
}

export function fighterWorldX(logicX: number, worldScale: number): number {
  return logicX * worldScale;
}

/** Capture X offsets from current pose relative to fighter world X. */
export function captureLightFollowOffsets(
  desc: LightDesc,
  fighterWx: number,
): void {
  if (!lightSupportsFollow(desc.type)) return;
  desc.followOffsetPosX = desc.position.x - fighterWx;
  if (desc.type === 'directional' || desc.type === 'spot') {
    desc.followOffsetTargetX = desc.target.x - fighterWx;
  } else {
    // point: no aim target
    desc.followOffsetTargetX = 0;
  }
}

/** @deprecated use captureLightFollowOffsets */
export const captureDirectionalFollowOffsets = captureLightFollowOffsets;

/**
 * Apply follow: move position.x (and target.x for dir/spot) with fighter.
 * Relative light→target X stays fixed for dir/spot; Y/Z absolute.
 * Returns true if any desc was updated.
 */
export function applyLightFollow(
  lights: LightDesc[],
  p1LogicX: number,
  p2LogicX: number,
  worldScale: number,
): boolean {
  let any = false;
  for (const desc of lights) {
    if (!lightSupportsFollow(desc.type)) continue;
    if (desc.follow !== 'p1' && desc.follow !== 'p2') continue;
    const logicX = desc.follow === 'p1' ? p1LogicX : p2LogicX;
    const wx = fighterWorldX(logicX, worldScale);
    const needPos =
      desc.followOffsetPosX === undefined || !Number.isFinite(desc.followOffsetPosX);
    const needTgt =
      (desc.type === 'directional' || desc.type === 'spot') &&
      (desc.followOffsetTargetX === undefined ||
        !Number.isFinite(desc.followOffsetTargetX));
    if (needPos || needTgt) {
      captureLightFollowOffsets(desc, wx);
    }
    const ox = desc.followOffsetPosX!;
    const nx = wx + ox;
    let changed = desc.position.x !== nx;
    desc.position.x = nx;
    if (desc.type === 'directional' || desc.type === 'spot') {
      const ot = desc.followOffsetTargetX ?? 0;
      const ntx = wx + ot;
      if (desc.target.x !== ntx) {
        desc.target.x = ntx;
        changed = true;
      }
    }
    if (changed) any = true;
  }
  return any;
}

/** @deprecated use applyLightFollow */
export const applyDirectionalLightFollow = applyLightFollow;

export function enableLightFollow(
  desc: LightDesc,
  follow: LightFollowTarget,
  p1LogicX: number,
  p2LogicX: number,
  worldScale: number,
): void {
  if (!lightSupportsFollow(desc.type)) {
    desc.follow = 'none';
    return;
  }
  desc.follow = follow;
  if (follow === 'none') return;
  const logicX = follow === 'p1' ? p1LogicX : p2LogicX;
  captureLightFollowOffsets(desc, fighterWorldX(logicX, worldScale));
}

/** @deprecated use enableLightFollow */
export const enableDirectionalFollow = enableLightFollow;

/** At most one directional castShadow; clamp enabled count. */
export function enforceLightRules(
  lights: LightDesc[],
  maxCount = 15,
): LightDesc[] {
  const out = lights.map((l) => ({
    ...l,
    position: { ...l.position },
    target: { ...l.target },
  }));
  let shadowOwner: string | null = null;
  for (const l of out) {
    if (l.type === 'directional' && l.castShadow && l.enabled) {
      if (shadowOwner == null) shadowOwner = l.id;
      else l.castShadow = false;
    } else if (l.type !== 'directional') {
      l.castShadow = false;
    }
  }
  let ambient = 0;
  let hemi = 0;
  const kept: LightDesc[] = [];
  for (const l of out) {
    if (l.type === 'ambient') {
      ambient++;
      if (ambient > 1) continue;
    }
    if (l.type === 'hemisphere') {
      hemi++;
      if (hemi > 1) continue;
    }
    kept.push(l);
  }
  while (kept.filter((l) => l.enabled).length > maxCount) {
    const i = kept.map((l, idx) => (l.enabled ? idx : -1)).filter((i) => i >= 0).pop();
    if (i == null) break;
    kept[i]!.enabled = false;
  }
  return kept;
}

export function lightsFromFlatFields(
  parsed: Record<string, unknown>,
): LightDesc[] {
  const n = (k: string, d: number) => num(parsed[k], d);
  return enforceLightRules([
    {
      id: 'ambient',
      name: '环境光',
      type: 'ambient',
      enabled: true,
      color: n('lightAmbientColor', 0xffffff) >>> 0,
      intensity: n('lightAmbientIntensity', 0.3),
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      castShadow: false,
    },
    {
      id: 'hemi',
      name: '半球光',
      type: 'hemisphere',
      enabled: true,
      color: n('lightHemiSky', 0xe8eaee) >>> 0,
      intensity: n('lightHemiIntensity', 0.5),
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      groundColor: n('lightHemiGround', 0x8a8680) >>> 0,
      castShadow: false,
    },
    {
      id: 'key',
      name: '主光',
      type: 'directional',
      enabled: true,
      color: n('lightKeyColor', 0xf4f2ee) >>> 0,
      intensity: n('lightKeyIntensity', 1.05),
      position: {
        x: n('lightKeyX', 0),
        y: n('lightKeyY', 16),
        z: n('lightKeyZ', 4),
      },
      target: { x: 0, y: 0, z: 0 },
      castShadow: true,
    },
    {
      id: 'fill',
      name: '补光',
      type: 'directional',
      enabled: true,
      color: n('lightFillColor', 0xaaccff) >>> 0,
      intensity: n('lightFillIntensity', 0),
      position: {
        x: n('lightFillX', -9),
        y: n('lightFillY', 5),
        z: n('lightFillZ', -3),
      },
      target: { x: 0, y: 0, z: 0 },
      castShadow: false,
    },
    {
      id: 'rim',
      name: '轮廓光',
      type: 'directional',
      enabled: true,
      color: n('lightRimColor', 0xffffff) >>> 0,
      intensity: n('lightRimIntensity', 0.32),
      position: {
        x: n('lightRimX', 0),
        y: n('lightRimY', 8),
        z: n('lightRimZ', -10),
      },
      target: { x: 0, y: 0, z: 0 },
      castShadow: false,
    },
  ]);
}

export function stripFlatLightKeys(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...parsed };
  for (const k of FLAT_LIGHT_KEYS) delete next[k];
  return next;
}

/** Migrate saved/shipping payloads to lights[] authority. */
export function migrateFlatLightsToList(
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const maxCount = num(parsed.lightMaxCount, 15);
  let lights: LightDesc[];
  if (Array.isArray(parsed.lights)) {
    const normalized = parsed.lights
      .map((x, i) => normalizeLightDesc(x, i))
      .filter((x): x is LightDesc => x != null);
    lights =
      normalized.length > 0
        ? enforceLightRules(normalized, maxCount)
        : createDefaultLights();
  } else if (
    FLAT_LIGHT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(parsed, k))
  ) {
    lights = lightsFromFlatFields(parsed);
  } else {
    lights = createDefaultLights();
  }
  const next = stripFlatLightKeys(parsed);
  next.lights = lights;
  if (typeof next.lightSelectedId !== 'string') {
    next.lightSelectedId = lights[0]?.id ?? '';
  }
  if (typeof next.lightHelpersVisible !== 'boolean') {
    next.lightHelpersVisible = true;
  }
  if (typeof next.lightOrbitMode !== 'boolean') {
    next.lightOrbitMode = false;
  }
  if (typeof next.lightOrbitPipX !== 'number') next.lightOrbitPipX = 12;
  if (typeof next.lightOrbitPipY !== 'number') next.lightOrbitPipY = 12;
  if (typeof next.lightOrbitPipWidth !== 'number') next.lightOrbitPipWidth = 320;
  if (typeof next.lightOrbitPipHeight !== 'number') next.lightOrbitPipHeight = 180;
  if (typeof next.lightMaxCount !== 'number') next.lightMaxCount = 15;
  if (typeof next.lightUseDynamicLighting !== 'boolean') {
    next.lightUseDynamicLighting = true;
  }
  if (typeof next.shadowMapEnabled !== 'boolean') next.shadowMapEnabled = true;
  if (typeof next.shadowMapSize !== 'number') next.shadowMapSize = 2048;
  if (typeof next.shadowCameraExtent !== 'number') next.shadowCameraExtent = 20;
  if (typeof next.shadowCameraNear !== 'number') next.shadowCameraNear = 0.5;
  if (typeof next.shadowCameraFar !== 'number') next.shadowCameraFar = 80;
  if (typeof next.shadowBias !== 'number') next.shadowBias = -0.0001;
  if (typeof next.shadowNormalBias !== 'number') next.shadowNormalBias = 0.02;
  if (typeof next.shadowRadius !== 'number') next.shadowRadius = 2;
  return next;
}

let lightIdSeq = 0;

/** Unique id — UUID preferred; never rely on same-ms random. */
export function newLightId(prefix = 'light'): string {
  lightIdSeq += 1;
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    /* ignore */
  }
  return `${prefix}_${Date.now().toString(36)}_${lightIdSeq}_${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Duplicate a light for "复制为新灯":
 * - new unique id
 * - follow cleared (avoid stacking two selective lights on same offsets)
 * - slight +X nudge so helper/effect is visible
 * - offsets cleared (re-capture only if user re-enables follow)
 */
export function duplicateLightAsNew(src: LightDesc, nameSuffix = ' 副本'): LightDesc {
  const id = newLightId(src.type);
  const nudge = 0.5;
  return {
    ...src,
    id,
    name: `${src.name}${nameSuffix}`,
    position: {
      x: src.position.x + nudge,
      y: src.position.y,
      z: src.position.z,
    },
    target: {
      x: src.target.x + (src.type === 'directional' || src.type === 'spot' ? nudge : 0),
      y: src.target.y,
      z: src.target.z,
    },
    castShadow: false,
    follow: 'none',
    followOffsetPosX: undefined,
    followOffsetTargetX: undefined,
  };
}

export function createLightByType(type: LightType): LightDesc {
  const id = newLightId(type);
  const base: LightDesc = {
    id,
    name: type,
    type,
    enabled: true,
    color: 0xffffff,
    intensity: 1,
    position: { x: 0, y: 12, z: 6 },
    target: { x: 0, y: 0, z: 0 },
    castShadow: false,
  };
  switch (type) {
    case 'ambient':
      return {
        ...base,
        name: '环境光',
        intensity: 0.2,
        position: { x: 0, y: 0, z: 0 },
      };
    case 'hemisphere':
      return {
        ...base,
        name: '半球光',
        intensity: 0.3,
        color: 0xe8eaee,
        groundColor: 0x444444,
        position: { x: 0, y: 0, z: 0 },
      };
    case 'directional':
      return { ...base, name: '方向光', intensity: 1, position: { x: 0, y: 12, z: 6 } };
    case 'point':
      return {
        ...base,
        name: '点光',
        intensity: 2,
        position: { x: 0, y: 2, z: 2 },
        distance: 0,
        decay: 2,
      };
    case 'spot':
      return {
        ...base,
        name: '聚光',
        intensity: 2,
        position: { x: 0, y: 8, z: 4 },
        distance: 0,
        decay: 2,
        angle: Math.PI / 6,
        penumbra: 0.2,
      };
  }
}

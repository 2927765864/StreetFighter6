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
   * Directional only. When true: still castShadow, but excluded from lightsNode
   * (no illumination); shadow darkening applied via material aoNode.
   */
  shadowOnly?: boolean;
  /**
   * directional / point / spot. When p1/p2:
   * - `position` / `target` are **character-local** offsets
   *   (world = local + fighterFollowOrigin; origin X from logic, Y from hips)
   * - followOffset* mirror local axes for legacy saves
   * When none: position / target are world-space.
   */
  follow?: LightFollowTarget;
  /** Legacy mirror of local position.x when following */
  followOffsetPosX?: number;
  /** Legacy mirror of local target.x when following (dir/spot) */
  followOffsetTargetX?: number;
  /** Legacy mirror of local position.y when following */
  followOffsetPosY?: number;
  /** Legacy mirror of local target.y when following (dir/spot) */
  followOffsetTargetY?: number;
};

/** World-space origin a follow light is parented to (X=logic, Y=hips/logic). */
export type FighterFollowOrigin = { x: number; y: number };

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
    delete base.shadowOnly;
  } else if (bool(o.shadowOnly, false)) {
    base.shadowOnly = true;
    base.castShadow = true;
  } else {
    base.shadowOnly = false;
  }
  if (lightSupportsFollow(t)) {
    const f = str(o.follow, 'none');
    base.follow =
      f === 'p1' || f === 'p2' || f === 'none' ? (f as LightFollowTarget) : 'none';
    const hasOffPos =
      typeof o.followOffsetPosX === 'number' && Number.isFinite(o.followOffsetPosX);
    const hasOffTgt =
      typeof o.followOffsetTargetX === 'number' &&
      Number.isFinite(o.followOffsetTargetX);
    const hasOffPosY =
      typeof o.followOffsetPosY === 'number' && Number.isFinite(o.followOffsetPosY);
    const hasOffTgtY =
      typeof o.followOffsetTargetY === 'number' &&
      Number.isFinite(o.followOffsetTargetY);
    if (base.shadowOnly && (base.follow === 'p1' || base.follow === 'p2')) {
      // Shadow-only is global occlusion; drop follow.
      base.follow = 'none';
      delete base.followOffsetPosX;
      delete base.followOffsetTargetX;
      delete base.followOffsetPosY;
      delete base.followOffsetTargetY;
    }
    if (base.follow === 'p1' || base.follow === 'p2') {
      // Old saves: position was world at save time; followOffset* was local.
      // Prefer offset as local authority when present.
      if (hasOffPos) {
        base.position.x = o.followOffsetPosX as number;
        base.followOffsetPosX = o.followOffsetPosX as number;
      } else {
        base.followOffsetPosX = base.position.x;
      }
      if (hasOffPosY) {
        base.position.y = o.followOffsetPosY as number;
        base.followOffsetPosY = o.followOffsetPosY as number;
      }
      // else: leave position.y; first applyLightFollow converts world→local Y
      if (t === 'directional' || t === 'spot') {
        if (hasOffTgt) {
          base.target.x = o.followOffsetTargetX as number;
          base.followOffsetTargetX = o.followOffsetTargetX as number;
        } else {
          base.followOffsetTargetX = base.target.x;
        }
        if (hasOffTgtY) {
          base.target.y = o.followOffsetTargetY as number;
          base.followOffsetTargetY = o.followOffsetTargetY as number;
        }
      } else {
        base.followOffsetTargetX = 0;
        base.followOffsetTargetY = 0;
      }
    } else {
      if (hasOffPos) base.followOffsetPosX = o.followOffsetPosX as number;
      if (hasOffTgt) base.followOffsetTargetX = o.followOffsetTargetX as number;
      if (hasOffPosY) base.followOffsetPosY = o.followOffsetPosY as number;
      if (hasOffTgtY) base.followOffsetTargetY = o.followOffsetTargetY as number;
    }
  } else {
    base.follow = 'none';
    delete base.followOffsetPosX;
    delete base.followOffsetTargetX;
    delete base.followOffsetPosY;
    delete base.followOffsetTargetY;
  }
  return base;
}

export function fighterWorldX(logicX: number, worldScale: number): number {
  return logicX * worldScale;
}

/** Logic-only origin (tests / fallback before hips are available). */
export function fighterFollowOriginFromLogic(
  logicX: number,
  logicY: number,
  worldScale: number,
  modelYOffset = 0,
): FighterFollowOrigin {
  return {
    x: logicX * worldScale,
    y: modelYOffset + logicY * worldScale,
  };
}

export function isLightFollowing(desc: LightDesc): boolean {
  return (
    lightSupportsFollow(desc.type) &&
    (desc.follow === 'p1' || desc.follow === 'p2')
  );
}

/**
 * Three mixes shadows as mix(1, factor, light.shadow.intensity).
 * Shadow-only lights map config intensity → shadow.intensity (not light.intensity).
 */
export function resolveShadowMapIntensity(desc: LightDesc): number {
  if (desc.type === 'directional' && desc.shadowOnly) {
    return Number.isFinite(desc.intensity) ? desc.intensity : 1;
  }
  return 1;
}

/** Keep legacy offset fields in sync with local position/target. */
export function syncLegacyFollowOffsets(desc: LightDesc): void {
  if (!isLightFollowing(desc)) return;
  desc.followOffsetPosX = desc.position.x;
  desc.followOffsetPosY = desc.position.y;
  if (desc.type === 'directional' || desc.type === 'spot') {
    desc.followOffsetTargetX = desc.target.x;
    desc.followOffsetTargetY = desc.target.y;
  } else {
    desc.followOffsetTargetX = 0;
    desc.followOffsetTargetY = 0;
  }
}

function clearLegacyFollowOffsets(desc: LightDesc): void {
  delete desc.followOffsetPosX;
  delete desc.followOffsetTargetX;
  delete desc.followOffsetPosY;
  delete desc.followOffsetTargetY;
}

/**
 * Convert **world** components into character-local offsets.
 * `kind` limits which parts were just written as world (gizmo may edit one at a time).
 */
export function captureLightFollowOffsets(
  desc: LightDesc,
  origin: FighterFollowOrigin,
  kind: 'position' | 'target' | 'both' = 'both',
): void {
  if (!lightSupportsFollow(desc.type)) return;
  if (kind === 'position' || kind === 'both') {
    desc.position.x = desc.position.x - origin.x;
    desc.position.y = desc.position.y - origin.y;
  }
  if (
    (kind === 'target' || kind === 'both') &&
    (desc.type === 'directional' || desc.type === 'spot')
  ) {
    desc.target.x = desc.target.x - origin.x;
    desc.target.y = desc.target.y - origin.y;
  }
  syncLegacyFollowOffsets(desc);
}

/** @deprecated use captureLightFollowOffsets */
export const captureDirectionalFollowOffsets = captureLightFollowOffsets;

/** Non-mutating world pose for Three sync. */
export function resolveLightWorldPose(
  desc: LightDesc,
  p1Origin: FighterFollowOrigin,
  p2Origin: FighterFollowOrigin,
): { position: Vec3Desc; target: Vec3Desc } {
  if (!isLightFollowing(desc)) {
    return {
      position: { ...desc.position },
      target: { ...desc.target },
    };
  }
  const o = desc.follow === 'p1' ? p1Origin : p2Origin;
  return {
    position: {
      x: desc.position.x + o.x,
      y: desc.position.y + o.y,
      z: desc.position.z,
    },
    target: {
      x: desc.target.x + o.x,
      y: desc.target.y + o.y,
      z: desc.target.z,
    },
  };
}

/**
 * Ensure follow lights store local offsets (one-shot migrate if legacy offsets
 * missing). Does **not** write world coords back into desc.
 * Returns true if any follow light needs a Three transform push.
 */
export function applyLightFollow(
  lights: LightDesc[],
  p1Origin: FighterFollowOrigin,
  p2Origin: FighterFollowOrigin,
): boolean {
  let any = false;
  for (const desc of lights) {
    if (!isLightFollowing(desc)) continue;
    any = true;
    const origin = desc.follow === 'p1' ? p1Origin : p2Origin;
    const needPosX =
      desc.followOffsetPosX === undefined || !Number.isFinite(desc.followOffsetPosX);
    const needPosY =
      desc.followOffsetPosY === undefined || !Number.isFinite(desc.followOffsetPosY);
    const needTgtX =
      (desc.type === 'directional' || desc.type === 'spot') &&
      (desc.followOffsetTargetX === undefined ||
        !Number.isFinite(desc.followOffsetTargetX));
    const needTgtY =
      (desc.type === 'directional' || desc.type === 'spot') &&
      (desc.followOffsetTargetY === undefined ||
        !Number.isFinite(desc.followOffsetTargetY));
    if (needPosX || needPosY || needTgtX || needTgtY) {
      // Incomplete save: treat missing axes as still world and convert once.
      // Already-local axes (with offsets) must not be subtracted again.
      if (needPosX) desc.position.x -= origin.x;
      if (needPosY) desc.position.y -= origin.y;
      if (desc.type === 'directional' || desc.type === 'spot') {
        if (needTgtX) desc.target.x -= origin.x;
        if (needTgtY) desc.target.y -= origin.y;
      }
      syncLegacyFollowOffsets(desc);
    } else {
      syncLegacyFollowOffsets(desc);
    }
  }
  return any;
}

/** @deprecated use applyLightFollow */
export const applyDirectionalLightFollow = applyLightFollow;

export function enableLightFollow(
  desc: LightDesc,
  follow: LightFollowTarget,
  p1Origin: FighterFollowOrigin,
  p2Origin: FighterFollowOrigin,
): void {
  if (!lightSupportsFollow(desc.type)) {
    desc.follow = 'none';
    clearLegacyFollowOffsets(desc);
    return;
  }
  const prev: LightFollowTarget =
    desc.follow === 'p1' || desc.follow === 'p2' ? desc.follow : 'none';
  const originOf = (who: 'p1' | 'p2') => (who === 'p1' ? p1Origin : p2Origin);

  if (prev !== 'none' && follow === 'none') {
    const o = originOf(prev);
    desc.position.x += o.x;
    desc.position.y += o.y;
    if (desc.type === 'directional' || desc.type === 'spot') {
      desc.target.x += o.x;
      desc.target.y += o.y;
    }
    desc.follow = 'none';
    clearLegacyFollowOffsets(desc);
    return;
  }

  if (prev === 'none' && (follow === 'p1' || follow === 'p2')) {
    const o = originOf(follow);
    desc.position.x -= o.x;
    desc.position.y -= o.y;
    if (desc.type === 'directional' || desc.type === 'spot') {
      desc.target.x -= o.x;
      desc.target.y -= o.y;
    }
    desc.follow = follow;
    syncLegacyFollowOffsets(desc);
    return;
  }

  desc.follow = follow;
  if (follow === 'p1' || follow === 'p2') {
    syncLegacyFollowOffsets(desc);
  }
}

/** @deprecated use enableLightFollow */
export const enableDirectionalFollow = enableLightFollow;

/** At most one directional castShadow; clamp enabled count. */
export function enforceLightRules(
  lights: LightDesc[],
  maxCount = 30,
): LightDesc[] {
  const out = lights.map((l) => ({
    ...l,
    position: { ...l.position },
    target: { ...l.target },
  }));
  let shadowOwner: string | null = null;
  for (const l of out) {
    if (l.type !== 'directional') {
      l.castShadow = false;
      delete l.shadowOnly;
      continue;
    }
    if (l.shadowOnly) {
      l.castShadow = true;
      if (l.follow === 'p1' || l.follow === 'p2') {
        l.follow = 'none';
        delete l.followOffsetPosX;
        delete l.followOffsetTargetX;
        delete l.followOffsetPosY;
        delete l.followOffsetTargetY;
      }
    }
    if (l.castShadow && l.enabled) {
      if (shadowOwner == null) shadowOwner = l.id;
      else {
        l.castShadow = false;
        l.shadowOnly = false;
      }
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
  const maxCount = num(parsed.lightMaxCount, 30);
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
  if (typeof next.lightMaxCount !== 'number') next.lightMaxCount = 30;
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
 * Clone all follow=p1 lights as follow=p2 with the **same** local offsets
 * (parallel copy). Optional `mirrorX` flips local X for facing-symmetric setups.
 */
export function copyFollowLightsP1toP2(
  lights: readonly LightDesc[],
  opts: { mirrorX?: boolean; nameSuffix?: string } = {},
): LightDesc[] {
  const mirrorX = opts.mirrorX === true;
  const nameSuffix = opts.nameSuffix ?? ' P2';
  const out: LightDesc[] = [];
  for (const src of lights) {
    if (!lightSupportsFollow(src.type) || src.follow !== 'p1') continue;
    const id = newLightId(src.type);
    const mx = (v: number) => (mirrorX ? -v : v);
    const copy: LightDesc = {
      ...src,
      id,
      name: `${src.name}${nameSuffix}`,
      castShadow: false,
      shadowOnly: false,
      follow: 'p2',
      position: {
        x: mx(src.position.x),
        y: src.position.y,
        z: src.position.z,
      },
      target: {
        x:
          src.type === 'directional' || src.type === 'spot'
            ? mx(src.target.x)
            : src.target.x,
        y: src.target.y,
        z: src.target.z,
      },
    };
    syncLegacyFollowOffsets(copy);
    out.push(copy);
  }
  return out;
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
    shadowOnly: false,
    follow: 'none',
    followOffsetPosX: undefined,
    followOffsetTargetX: undefined,
    followOffsetPosY: undefined,
    followOffsetTargetY: undefined,
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

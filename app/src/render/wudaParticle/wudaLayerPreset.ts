/**
 * Wuda coat layer presets — multiple stacked coats per fighter side.
 * Global: enabled / attachMode / coverMode / coverMeshMinVerts.
 * Per-layer: count, region weights, colors, detach locks, physics, etc.
 */

import type { WudaFighterSide } from './wudaBodyRegions';
import { DEFAULT_WUDA_REGION_WEIGHTS } from './wudaBodyRegions';

export type WudaLayerPreset = {
  id: string;
  name: string;
  enabled: boolean;
  side: WudaFighterSide;
  particleCount: number;
  seed: number;
  vertexStride: number;
  bakeAwaitReadback: boolean;
  showBakeStats: boolean;
  detachSpeed: number;
  detachAccel: number;
  detachSpeedDrop: number;
  detachSpeedDropMinPrev: number;
  inheritVelScale: number;
  detachJitter: number;
  speedToLife: number;
  freeLifetime: number;
  gravityPower: number;
  gravityDirX: number;
  gravityDirY: number;
  gravityDirZ: number;
  drag: number;
  speedLimit: number;
  maxDeltaSec: number;
  stuckSize: number;
  freeSize: number;
  stuckOpacity: number;
  freeOpacity: number;
  stuckColor: number;
  freeColor: number;
  blendAdditive: boolean;
  respawnStuck: boolean;
  detachInstantRefill: boolean;
  detachRefillDelay: number;
  freePoolCapacity: number;
  showDebug: boolean;
  alsoPlumeBurst: boolean;
  detachOnlyOnActiveHit: boolean;
  detachOnlyOnHitstun: boolean;
  regionWeightHead: number;
  regionWeightTorso: number;
  regionWeightLimbRoot: number;
  regionWeightLimbTip: number;
};

/** Runtime coat cfg shape (wuda* keys) consumed by coat runtimes / math. */
export type WudaCoatCfgShim = {
  wudaEnabled: boolean;
  wudaAttachMode: 'surfaceBary' | 'vertexGpuBake';
  wudaCoverMode: 'largestMesh' | 'allMeshes';
  wudaCoverMeshMinVerts: number;
  /** Global present clock scale (not a layer field). */
  timeScaleAnim: number;
  wudaP1RegionWeightHead: number;
  wudaP1RegionWeightTorso: number;
  wudaP1RegionWeightLimbRoot: number;
  wudaP1RegionWeightLimbTip: number;
  wudaP2RegionWeightHead: number;
  wudaP2RegionWeightTorso: number;
  wudaP2RegionWeightLimbRoot: number;
  wudaP2RegionWeightLimbTip: number;
  wudaVertexStride: number;
  wudaBakeAwaitReadback: boolean;
  wudaShowBakeStats: boolean;
  wudaParticleCount: number;
  wudaSeed: number;
  wudaDetachSpeed: number;
  wudaDetachAccel: number;
  wudaDetachSpeedDrop: number;
  wudaDetachSpeedDropMinPrev: number;
  wudaInheritVelScale: number;
  wudaDetachJitter: number;
  wudaSpeedToLife: number;
  wudaFreeLifetime: number;
  wudaGravityPower: number;
  wudaGravityDirX: number;
  wudaGravityDirY: number;
  wudaGravityDirZ: number;
  wudaDrag: number;
  wudaSpeedLimit: number;
  wudaMaxDeltaSec: number;
  wudaStuckSize: number;
  wudaFreeSize: number;
  wudaStuckOpacity: number;
  wudaFreeOpacity: number;
  wudaStuckColor: number;
  wudaFreeColor: number;
  wudaBlendAdditive: boolean;
  wudaRespawnStuck: boolean;
  wudaDetachInstantRefill: boolean;
  wudaDetachRefillDelay: number;
  wudaFreePoolCapacity: number;
  wudaShowDebug: boolean;
  wudaAlsoPlumeBurst: boolean;
  wudaDetachOnlyOnActiveHit: boolean;
  wudaDetachOnlyOnHitstun: boolean;
};

export type WudaGlobalCoatFields = {
  wudaEnabled: boolean;
  wudaAttachMode: 'surfaceBary' | 'vertexGpuBake';
  wudaCoverMode: 'largestMesh' | 'allMeshes';
  wudaCoverMeshMinVerts: number;
  timeScaleAnim?: number;
};

const DEFAULT_LAYER_PARAMS = {
  particleCount: 512,
  seed: 1,
  vertexStride: 1,
  bakeAwaitReadback: false,
  showBakeStats: false,
  detachSpeed: 4.0,
  detachAccel: 60,
  detachSpeedDrop: 3.0,
  detachSpeedDropMinPrev: 2.0,
  inheritVelScale: 1.0,
  detachJitter: 0.15,
  speedToLife: 0.2,
  freeLifetime: 0.6,
  gravityPower: 9.8,
  gravityDirX: 0,
  gravityDirY: -1,
  gravityDirZ: 0,
  drag: 1.5,
  speedLimit: 12,
  maxDeltaSec: 0.05,
  stuckSize: 0.008,
  freeSize: 0.012,
  stuckOpacity: 0.55,
  freeOpacity: 0.85,
  stuckColor: 0xa69980,
  freeColor: 0xbfb399,
  blendAdditive: false,
  respawnStuck: false,
  detachInstantRefill: false,
  detachRefillDelay: 0.05,
  freePoolCapacity: 1024,
  showDebug: false,
  alsoPlumeBurst: false,
  detachOnlyOnActiveHit: false,
  detachOnlyOnHitstun: false,
  regionWeightHead: DEFAULT_WUDA_REGION_WEIGHTS.head,
  regionWeightTorso: DEFAULT_WUDA_REGION_WEIGHTS.torso,
  regionWeightLimbRoot: DEFAULT_WUDA_REGION_WEIGHTS.limbRoot,
  regionWeightLimbTip: DEFAULT_WUDA_REGION_WEIGHTS.limbTip,
} as const;

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultWudaLayerPreset(
  side: WudaFighterSide,
  opts?: { id?: string; name?: string; enabled?: boolean },
): WudaLayerPreset {
  return {
    id: opts?.id ?? newId(`wuda_${side}`),
    name: opts?.name ?? (side === 'p2' ? 'P2 默认' : 'P1 默认'),
    enabled: opts?.enabled ?? true,
    side,
    ...DEFAULT_LAYER_PARAMS,
  };
}

export function createDefaultWudaLayerPresets(): WudaLayerPreset[] {
  return [
    createDefaultWudaLayerPreset('p1', { id: 'wuda_p1_default', name: 'P1 默认' }),
    createDefaultWudaLayerPreset('p2', { id: 'wuda_p2_default', name: 'P2 默认' }),
  ];
}

function asFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function pickNum(
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  return asFiniteNumber(raw[key]) ?? fallback;
}

/** Normalize one preset; returns null if unusable. */
export function normalizeWudaLayerPreset(
  raw: unknown,
  index: number,
): WudaLayerPreset | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const side: WudaFighterSide = o.side === 'p2' ? 'p2' : 'p1';
  const base = createDefaultWudaLayerPreset(side, {
    id:
      typeof o.id === 'string' && o.id.trim()
        ? o.id.trim()
        : `wuda_layer_${index}`,
    name:
      typeof o.name === 'string' && o.name.trim()
        ? o.name.trim()
        : side === 'p2'
          ? `P2 层 ${index + 1}`
          : `P1 层 ${index + 1}`,
    enabled: asBool(o.enabled, true),
  });
  return {
    ...base,
    particleCount: Math.max(0, Math.floor(pickNum(o, 'particleCount', base.particleCount))),
    seed: Math.max(0, Math.floor(pickNum(o, 'seed', base.seed))),
    vertexStride: Math.max(1, Math.floor(pickNum(o, 'vertexStride', base.vertexStride))),
    bakeAwaitReadback: asBool(o.bakeAwaitReadback, base.bakeAwaitReadback),
    showBakeStats: asBool(o.showBakeStats, base.showBakeStats),
    detachSpeed: pickNum(o, 'detachSpeed', base.detachSpeed),
    detachAccel: pickNum(o, 'detachAccel', base.detachAccel),
    detachSpeedDrop: pickNum(o, 'detachSpeedDrop', base.detachSpeedDrop),
    detachSpeedDropMinPrev: pickNum(
      o,
      'detachSpeedDropMinPrev',
      base.detachSpeedDropMinPrev,
    ),
    inheritVelScale: pickNum(o, 'inheritVelScale', base.inheritVelScale),
    detachJitter: pickNum(o, 'detachJitter', base.detachJitter),
    speedToLife: pickNum(o, 'speedToLife', base.speedToLife),
    freeLifetime: pickNum(o, 'freeLifetime', base.freeLifetime),
    gravityPower: pickNum(o, 'gravityPower', base.gravityPower),
    gravityDirX: pickNum(o, 'gravityDirX', base.gravityDirX),
    gravityDirY: pickNum(o, 'gravityDirY', base.gravityDirY),
    gravityDirZ: pickNum(o, 'gravityDirZ', base.gravityDirZ),
    drag: pickNum(o, 'drag', base.drag),
    speedLimit: pickNum(o, 'speedLimit', base.speedLimit),
    maxDeltaSec: pickNum(o, 'maxDeltaSec', base.maxDeltaSec),
    stuckSize: pickNum(o, 'stuckSize', base.stuckSize),
    freeSize: pickNum(o, 'freeSize', base.freeSize),
    stuckOpacity: pickNum(o, 'stuckOpacity', base.stuckOpacity),
    freeOpacity: pickNum(o, 'freeOpacity', base.freeOpacity),
    stuckColor: Math.floor(pickNum(o, 'stuckColor', base.stuckColor)) >>> 0,
    freeColor: Math.floor(pickNum(o, 'freeColor', base.freeColor)) >>> 0,
    blendAdditive: asBool(o.blendAdditive, base.blendAdditive),
    respawnStuck: asBool(o.respawnStuck, base.respawnStuck),
    detachInstantRefill: asBool(o.detachInstantRefill, base.detachInstantRefill),
    detachRefillDelay: pickNum(o, 'detachRefillDelay', base.detachRefillDelay),
    freePoolCapacity: Math.max(
      0,
      Math.floor(pickNum(o, 'freePoolCapacity', base.freePoolCapacity)),
    ),
    showDebug: asBool(o.showDebug, base.showDebug),
    alsoPlumeBurst: asBool(o.alsoPlumeBurst, base.alsoPlumeBurst),
    detachOnlyOnActiveHit: asBool(
      o.detachOnlyOnActiveHit,
      base.detachOnlyOnActiveHit,
    ),
    detachOnlyOnHitstun: asBool(o.detachOnlyOnHitstun, base.detachOnlyOnHitstun),
    regionWeightHead: pickNum(o, 'regionWeightHead', base.regionWeightHead),
    regionWeightTorso: pickNum(o, 'regionWeightTorso', base.regionWeightTorso),
    regionWeightLimbRoot: pickNum(
      o,
      'regionWeightLimbRoot',
      base.regionWeightLimbRoot,
    ),
    regionWeightLimbTip: pickNum(
      o,
      'regionWeightLimbTip',
      base.regionWeightLimbTip,
    ),
  };
}

/** Build coat cfg shim: global infrastructure + one layer's look/physics/locks. */
export function buildWudaCoatCfgShim(
  global: WudaGlobalCoatFields,
  layer: WudaLayerPreset,
): WudaCoatCfgShim {
  const enabled = !!global.wudaEnabled && !!layer.enabled;
  const rh = layer.regionWeightHead;
  const rt = layer.regionWeightTorso;
  const rr = layer.regionWeightLimbRoot;
  const rp = layer.regionWeightLimbTip;
  return {
    wudaEnabled: enabled,
    wudaAttachMode: global.wudaAttachMode,
    wudaCoverMode: global.wudaCoverMode,
    wudaCoverMeshMinVerts: global.wudaCoverMeshMinVerts,
    timeScaleAnim: global.timeScaleAnim ?? 1,
    wudaP1RegionWeightHead: rh,
    wudaP1RegionWeightTorso: rt,
    wudaP1RegionWeightLimbRoot: rr,
    wudaP1RegionWeightLimbTip: rp,
    wudaP2RegionWeightHead: rh,
    wudaP2RegionWeightTorso: rt,
    wudaP2RegionWeightLimbRoot: rr,
    wudaP2RegionWeightLimbTip: rp,
    wudaVertexStride: layer.vertexStride,
    wudaBakeAwaitReadback: layer.bakeAwaitReadback,
    wudaShowBakeStats: layer.showBakeStats,
    wudaParticleCount: layer.particleCount,
    wudaSeed: layer.seed,
    wudaDetachSpeed: layer.detachSpeed,
    wudaDetachAccel: layer.detachAccel,
    wudaDetachSpeedDrop: layer.detachSpeedDrop,
    wudaDetachSpeedDropMinPrev: layer.detachSpeedDropMinPrev,
    wudaInheritVelScale: layer.inheritVelScale,
    wudaDetachJitter: layer.detachJitter,
    wudaSpeedToLife: layer.speedToLife,
    wudaFreeLifetime: layer.freeLifetime,
    wudaGravityPower: layer.gravityPower,
    wudaGravityDirX: layer.gravityDirX,
    wudaGravityDirY: layer.gravityDirY,
    wudaGravityDirZ: layer.gravityDirZ,
    wudaDrag: layer.drag,
    wudaSpeedLimit: layer.speedLimit,
    wudaMaxDeltaSec: layer.maxDeltaSec,
    wudaStuckSize: layer.stuckSize,
    wudaFreeSize: layer.freeSize,
    wudaStuckOpacity: layer.stuckOpacity,
    wudaFreeOpacity: layer.freeOpacity,
    wudaStuckColor: layer.stuckColor,
    wudaFreeColor: layer.freeColor,
    wudaBlendAdditive: layer.blendAdditive,
    wudaRespawnStuck: layer.respawnStuck,
    wudaDetachInstantRefill: layer.detachInstantRefill,
    wudaDetachRefillDelay: layer.detachRefillDelay,
    wudaFreePoolCapacity: layer.freePoolCapacity,
    wudaShowDebug: layer.showDebug,
    wudaAlsoPlumeBurst: layer.alsoPlumeBurst,
    wudaDetachOnlyOnActiveHit: layer.detachOnlyOnActiveHit,
    wudaDetachOnlyOnHitstun: layer.detachOnlyOnHitstun,
  };
}

export function listActiveWudaLayersForSide(
  presets: readonly WudaLayerPreset[],
  side: WudaFighterSide,
  globalEnabled: boolean,
): WudaLayerPreset[] {
  if (!globalEnabled) return [];
  return presets.filter((p) => p.enabled && p.side === side);
}

export function findWudaLayerPreset(
  presets: readonly WudaLayerPreset[],
  id: string,
): WudaLayerPreset | undefined {
  return presets.find((p) => p.id === id);
}

/** Resolve panel-active layer; falls back to first preset. */
export function getActiveWudaLayer(cfg: {
  wudaLayerPresets: WudaLayerPreset[];
  wudaActiveLayerPresetId: string;
}): WudaLayerPreset | undefined {
  const presets = cfg.wudaLayerPresets ?? [];
  const id = ensureWudaActiveLayerId(presets, cfg.wudaActiveLayerPresetId);
  cfg.wudaActiveLayerPresetId = id;
  return findWudaLayerPreset(presets, id) ?? presets[0];
}

export function ensureWudaActiveLayerId(
  presets: WudaLayerPreset[],
  activeId: string,
): string {
  if (presets.some((p) => p.id === activeId)) return activeId;
  return presets[0]?.id ?? '';
}

export function addWudaLayerPreset(
  presets: WudaLayerPreset[],
  side: WudaFighterSide = 'p1',
  name?: string,
): WudaLayerPreset {
  const layer = createDefaultWudaLayerPreset(side, {
    name: name ?? `${side === 'p2' ? 'P2' : 'P1'} 层 ${presets.length + 1}`,
  });
  presets.push(layer);
  return layer;
}

export function duplicateWudaLayerPreset(
  presets: WudaLayerPreset[],
  id: string,
): WudaLayerPreset | null {
  const src = findWudaLayerPreset(presets, id);
  if (!src) return null;
  const copy: WudaLayerPreset = {
    ...src,
    id: newId(`wuda_${src.side}`),
    name: `${src.name} 副本`,
  };
  presets.push(copy);
  return copy;
}

export function removeWudaLayerPreset(
  presets: WudaLayerPreset[],
  id: string,
): boolean {
  const i = presets.findIndex((p) => p.id === id);
  if (i < 0) return false;
  presets.splice(i, 1);
  return true;
}

/**
 * Migrate flat pre-layer wuda* fields into two side presets.
 * Only used when incoming has no usable wudaLayerPresets array.
 */
export function migrateFlatWudaToLayerPresets(
  incoming: Record<string, unknown>,
): WudaLayerPreset[] {
  const p1 = createDefaultWudaLayerPreset('p1', {
    id: 'wuda_p1_default',
    name: 'P1 默认',
  });
  const p2 = createDefaultWudaLayerPreset('p2', {
    id: 'wuda_p2_default',
    name: 'P2 默认',
  });

  const applyShared = (layer: WudaLayerPreset) => {
    const n = (k: string, fb: number) => asFiniteNumber(incoming[k]) ?? fb;
    const b = (k: string, fb: boolean) =>
      typeof incoming[k] === 'boolean' ? (incoming[k] as boolean) : fb;
    layer.particleCount = Math.max(
      0,
      Math.floor(n('wudaParticleCount', layer.particleCount)),
    );
    layer.seed = Math.max(0, Math.floor(n('wudaSeed', layer.seed)));
    layer.vertexStride = Math.max(
      1,
      Math.floor(n('wudaVertexStride', layer.vertexStride)),
    );
    layer.bakeAwaitReadback = b('wudaBakeAwaitReadback', layer.bakeAwaitReadback);
    layer.showBakeStats = b('wudaShowBakeStats', layer.showBakeStats);
    layer.detachSpeed = n('wudaDetachSpeed', layer.detachSpeed);
    layer.detachAccel = n('wudaDetachAccel', layer.detachAccel);
    layer.detachSpeedDrop = n('wudaDetachSpeedDrop', layer.detachSpeedDrop);
    layer.detachSpeedDropMinPrev = n(
      'wudaDetachSpeedDropMinPrev',
      layer.detachSpeedDropMinPrev,
    );
    layer.inheritVelScale = n('wudaInheritVelScale', layer.inheritVelScale);
    layer.detachJitter = n('wudaDetachJitter', layer.detachJitter);
    layer.speedToLife = n('wudaSpeedToLife', layer.speedToLife);
    layer.freeLifetime = n('wudaFreeLifetime', layer.freeLifetime);
    layer.gravityPower = n('wudaGravityPower', layer.gravityPower);
    layer.gravityDirX = n('wudaGravityDirX', layer.gravityDirX);
    layer.gravityDirY = n('wudaGravityDirY', layer.gravityDirY);
    layer.gravityDirZ = n('wudaGravityDirZ', layer.gravityDirZ);
    layer.drag = n('wudaDrag', layer.drag);
    layer.speedLimit = n('wudaSpeedLimit', layer.speedLimit);
    layer.maxDeltaSec = n('wudaMaxDeltaSec', layer.maxDeltaSec);
    layer.stuckSize = n('wudaStuckSize', layer.stuckSize);
    layer.freeSize = n('wudaFreeSize', layer.freeSize);
    layer.stuckOpacity = n('wudaStuckOpacity', layer.stuckOpacity);
    layer.freeOpacity = n('wudaFreeOpacity', layer.freeOpacity);
    layer.stuckColor =
      Math.floor(n('wudaStuckColor', layer.stuckColor)) >>> 0;
    layer.freeColor = Math.floor(n('wudaFreeColor', layer.freeColor)) >>> 0;
    layer.blendAdditive = b('wudaBlendAdditive', layer.blendAdditive);
    layer.respawnStuck = b('wudaRespawnStuck', layer.respawnStuck);
    layer.detachInstantRefill = b(
      'wudaDetachInstantRefill',
      layer.detachInstantRefill,
    );
    layer.detachRefillDelay = n(
      'wudaDetachRefillDelay',
      layer.detachRefillDelay,
    );
    layer.freePoolCapacity = Math.max(
      0,
      Math.floor(n('wudaFreePoolCapacity', layer.freePoolCapacity)),
    );
    layer.showDebug = b('wudaShowDebug', layer.showDebug);
    layer.alsoPlumeBurst = b('wudaAlsoPlumeBurst', layer.alsoPlumeBurst);
    layer.detachOnlyOnActiveHit = b(
      'wudaDetachOnlyOnActiveHit',
      layer.detachOnlyOnActiveHit,
    );
    layer.detachOnlyOnHitstun = b(
      'wudaDetachOnlyOnHitstun',
      layer.detachOnlyOnHitstun,
    );
  };

  applyShared(p1);
  applyShared(p2);

  const legacyHead = asFiniteNumber(incoming.wudaRegionWeightHead);
  const legacyTorso = asFiniteNumber(incoming.wudaRegionWeightTorso);
  const legacyRoot = asFiniteNumber(incoming.wudaRegionWeightLimbRoot);
  const legacyTip = asFiniteNumber(incoming.wudaRegionWeightLimbTip);

  p1.regionWeightHead =
    asFiniteNumber(incoming.wudaP1RegionWeightHead) ??
    legacyHead ??
    p1.regionWeightHead;
  p1.regionWeightTorso =
    asFiniteNumber(incoming.wudaP1RegionWeightTorso) ??
    legacyTorso ??
    p1.regionWeightTorso;
  p1.regionWeightLimbRoot =
    asFiniteNumber(incoming.wudaP1RegionWeightLimbRoot) ??
    legacyRoot ??
    p1.regionWeightLimbRoot;
  p1.regionWeightLimbTip =
    asFiniteNumber(incoming.wudaP1RegionWeightLimbTip) ??
    legacyTip ??
    p1.regionWeightLimbTip;

  p2.regionWeightHead =
    asFiniteNumber(incoming.wudaP2RegionWeightHead) ??
    legacyHead ??
    p2.regionWeightHead;
  p2.regionWeightTorso =
    asFiniteNumber(incoming.wudaP2RegionWeightTorso) ??
    legacyTorso ??
    p2.regionWeightTorso;
  p2.regionWeightLimbRoot =
    asFiniteNumber(incoming.wudaP2RegionWeightLimbRoot) ??
    legacyRoot ??
    p2.regionWeightLimbRoot;
  p2.regionWeightLimbTip =
    asFiniteNumber(incoming.wudaP2RegionWeightLimbTip) ??
    legacyTip ??
    p2.regionWeightLimbTip;

  return [p1, p2];
}

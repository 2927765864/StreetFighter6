import { cloneRecipe, DEFAULT_FLIPBOOK_RECIPE } from './defaults';
import { parseBlend } from './layerLook';
import type { FlipbookLayer, FlipbookLayerId, FlipbookRecipe } from './types';

const KEY = 'sf6.flipbook2d.hit_ref_v1';

const LAYER_IDS: FlipbookLayerId[] = [
  'E1_core_flash',
  'E2_near_sparks',
  'E3_ring_smoke',
  'E4_wide_short_smoke',
  'E5_narrow_long_smoke',
];

function isLayerId(s: string): s is FlipbookLayerId {
  return (LAYER_IDS as string[]).includes(s);
}

function num(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function hasLookFields(raw: Partial<FlipbookLayer>): boolean {
  return (
    raw.brightness != null ||
    raw.lift != null ||
    raw.despill != null ||
    raw.blend === 'screen'
  );
}

function sanitizeLayer(raw: Partial<FlipbookLayer>, fallback: FlipbookLayer): FlipbookLayer {
  const id = isLayerId(String(raw.id ?? '')) ? (raw.id as FlipbookLayerId) : fallback.id;
  const look = hasLookFields(raw);
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : fallback.name,
    enabled: raw.enabled !== false,
    z: Number.isFinite(Number(raw.z)) ? Number(raw.z) : fallback.z,
    offsetX: Number.isFinite(Number(raw.offsetX)) ? Number(raw.offsetX) : 0,
    offsetY: Number.isFinite(Number(raw.offsetY)) ? Number(raw.offsetY) : 0,
    scale: num(raw.scale, 1, 0.05, 8),
    opacity: look
      ? num(raw.opacity, fallback.opacity, 0, 1)
      : fallback.opacity,
    brightness: look ? num(raw.brightness, fallback.brightness, 0, 8) : fallback.brightness,
    lift: look ? num(raw.lift, fallback.lift, 0, 2) : fallback.lift,
    despill: look ? num(raw.despill, fallback.despill, 0, 1) : fallback.despill,
    startFrame: Math.max(0, Math.floor(Number(raw.startFrame) || 0)),
    duration: Math.max(1, Math.floor(Number(raw.duration) || fallback.duration)),
    blend: look ? parseBlend(raw.blend) : fallback.blend,
  };
}

export function loadFlipbookRecipe(): FlipbookRecipe {
  const base = cloneRecipe(DEFAULT_FLIPBOOK_RECIPE);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<FlipbookRecipe>;
    const byId = new Map(
      (parsed.layers ?? []).map((l) => [l.id, l] as const),
    );
    return {
      id: base.id,
      name: typeof parsed.name === 'string' ? parsed.name : base.name,
      fps: Math.max(1, Math.floor(Number(parsed.fps) || base.fps)),
      length: Math.max(1, Math.floor(Number(parsed.length) || base.length)),
      layers: base.layers.map((fb) => sanitizeLayer(byId.get(fb.id) ?? fb, fb)),
    };
  } catch {
    return base;
  }
}

export function saveFlipbookRecipe(recipe: FlipbookRecipe): void {
  localStorage.setItem(KEY, JSON.stringify(recipe));
}

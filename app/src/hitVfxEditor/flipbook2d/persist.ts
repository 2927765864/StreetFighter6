import {
  cloneBank,
  cloneRecipe,
  defaultFlipbookBank,
  DEFAULT_FLIPBOOK_RECIPE,
  recipeForStrength,
} from './defaults';
import { parseBlend } from './layerLook';
import type {
  FlipbookLayer,
  FlipbookLayerId,
  FlipbookRecipe,
  FlipbookRecipeBank,
  FlipbookStrength,
} from './types';

const KEY = 'sf6.flipbook2d.hit_ref_v1';
export const FLIPBOOK_RECIPES_URL = '/vfx/hit_ref_v1/recipes.json';

/** Factory bank from shipping JSON; localStorage overlays when present. */
let factoryState: FlipbookPersistState = {
  selected: 'M',
  recipes: defaultFlipbookBank(),
};

const LAYER_IDS: FlipbookLayerId[] = [
  'E1_core_flash',
  'E2_near_sparks',
  'E3_ring_smoke',
  'E4_wide_short_smoke',
  'E5_narrow_long_smoke',
  'E6_narrow_long_smoke_rtl',
];

function isLayerId(s: string): s is FlipbookLayerId {
  return (LAYER_IDS as string[]).includes(s);
}

function isStrength(s: unknown): s is FlipbookStrength {
  return s === 'L' || s === 'M' || s === 'H';
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

function sanitizeRecipe(
  raw: Partial<FlipbookRecipe> | undefined,
  strength: FlipbookStrength,
): FlipbookRecipe {
  const fallback = recipeForStrength(DEFAULT_FLIPBOOK_RECIPE, strength);
  if (!raw || !Array.isArray(raw.layers)) return fallback;
  const byId = new Map((raw.layers ?? []).map((l) => [l.id, l] as const));
  return {
    id: `hit_ref_v1_${strength}`,
    name: typeof raw.name === 'string' ? raw.name : fallback.name,
    strength,
    fps: Math.max(1, Math.floor(Number(raw.fps) || fallback.fps)),
    length: Math.max(1, Math.floor(Number(raw.length) || fallback.length)),
    layers: fallback.layers.map((fb) => sanitizeLayer(byId.get(fb.id) ?? fb, fb)),
  };
}

export type FlipbookPersistState = {
  selected: FlipbookStrength;
  recipes: FlipbookRecipeBank;
};

function migrateParsed(parsed: unknown): FlipbookPersistState {
  const bank = defaultFlipbookBank();
  if (!parsed || typeof parsed !== 'object') {
    return { selected: 'M', recipes: bank };
  }
  const o = parsed as Record<string, unknown>;
  if (o.recipes && typeof o.recipes === 'object') {
    const rec = o.recipes as Record<string, Partial<FlipbookRecipe>>;
    return {
      selected: isStrength(o.selected) ? o.selected : 'M',
      recipes: {
        L: sanitizeRecipe(rec.L, 'L'),
        M: sanitizeRecipe(rec.M, 'M'),
        H: sanitizeRecipe(rec.H, 'H'),
      },
    };
  }
  // v1: a single recipe (medium). Copy it to L/H so edits aren't lost.
  if (Array.isArray(o.layers)) {
    const mid = sanitizeRecipe(o as Partial<FlipbookRecipe>, 'M');
    return {
      selected: 'M',
      recipes: {
        L: recipeForStrength(mid, 'L'),
        M: cloneRecipe(mid),
        H: recipeForStrength(mid, 'H'),
      },
    };
  }
  return { selected: 'M', recipes: bank };
}

export function applyFlipbookShipping(raw: unknown): FlipbookPersistState {
  factoryState = migrateParsed(raw);
  return {
    selected: factoryState.selected,
    recipes: cloneBank(factoryState.recipes),
  };
}

/** Load packaged editor recipes (Habby has empty localStorage). */
export async function hydrateFlipbookFactory(): Promise<boolean> {
  try {
    const res = await fetch(FLIPBOOK_RECIPES_URL, { cache: 'no-cache' });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json') && !ct.includes('text/plain')) return false;
    applyFlipbookShipping(await res.json());
    return true;
  } catch {
    return false;
  }
}

export function loadFlipbookState(): FlipbookPersistState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {
        selected: factoryState.selected,
        recipes: cloneBank(factoryState.recipes),
      };
    }
    return migrateParsed(JSON.parse(raw));
  } catch {
    return {
      selected: factoryState.selected,
      recipes: cloneBank(factoryState.recipes),
    };
  }
}

export function loadFlipbookRecipe(
  strength: FlipbookStrength = 'M',
): FlipbookRecipe {
  return cloneRecipe(loadFlipbookState().recipes[strength] ?? defaultFlipbookBank()[strength]);
}

export function loadFlipbookBank(): FlipbookRecipeBank {
  return cloneBank(loadFlipbookState().recipes);
}

export function saveFlipbookState(state: FlipbookPersistState): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      v: 2,
      selected: state.selected,
      recipes: state.recipes,
    }),
  );
}

export function saveFlipbookRecipe(
  recipe: FlipbookRecipe,
  selected: FlipbookStrength = recipe.strength,
): void {
  const recipes = loadFlipbookBank();
  recipes[recipe.strength] = cloneRecipe(recipe);
  saveFlipbookState({ selected, recipes });
}

export function saveFlipbookBank(
  recipes: FlipbookRecipeBank,
  selected: FlipbookStrength,
): void {
  saveFlipbookState({ selected, recipes: cloneBank(recipes) });
}

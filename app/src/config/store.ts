import { createDefaultRuntimeConfig } from './defaults';
import {
  enforceLightRules,
  normalizeLightDesc,
  type LightDesc,
} from './lightTypes';
import {
  normalizeHeightOffsets,
  normalizeHitVfxElementPreset,
  normalizeHitVfxRecipe,
  type HitVfxElementPreset,
  type HitVfxRecipe,
} from '../render/hitVfx/hitVfxTypes';
import { rgb01ToHex } from '../render/wudaParticle/wudaBodyRegions';
import {
  createDefaultWudaLayerPresets,
  ensureWudaActiveLayerId,
  migrateFlatWudaToLayerPresets,
  normalizeWudaLayerPreset,
  type WudaLayerPreset,
} from '../render/wudaParticle/wudaLayerPreset';
import type { RuntimeConfig } from './types';
import { CONFIG_VERSION } from './types';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function asFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Fold legacy flat wuda* keys / RGB floats into layer presets when needed.
 * Prefer explicit `wudaLayerPresets` array when present and non-empty.
 */
function migrateLegacyWudaFields(
  out: RuntimeConfig,
  incoming: Record<string, unknown>,
): void {
  const hasLayerArray =
    Array.isArray(incoming.wudaLayerPresets) &&
    (incoming.wudaLayerPresets as unknown[]).length > 0;

  if (!hasLayerArray) {
    const looksFlat =
      asFiniteNumber(incoming.wudaParticleCount) != null ||
      asFiniteNumber(incoming.wudaStuckColor) != null ||
      asFiniteNumber(incoming.wudaStuckColorR) != null ||
      asFiniteNumber(incoming.wudaP1RegionWeightHead) != null ||
      asFiniteNumber(incoming.wudaRegionWeightHead) != null ||
      typeof incoming.wudaDetachOnlyOnActiveHit === 'boolean';
    if (looksFlat) {
      const migratedIncoming = { ...incoming };
      if (asFiniteNumber(migratedIncoming.wudaStuckColor) == null) {
        const r = asFiniteNumber(migratedIncoming.wudaStuckColorR);
        const g = asFiniteNumber(migratedIncoming.wudaStuckColorG);
        const b = asFiniteNumber(migratedIncoming.wudaStuckColorB);
        if (r != null && g != null && b != null) {
          migratedIncoming.wudaStuckColor = rgb01ToHex(r, g, b);
        }
      }
      if (asFiniteNumber(migratedIncoming.wudaFreeColor) == null) {
        const r = asFiniteNumber(migratedIncoming.wudaFreeColorR);
        const g = asFiniteNumber(migratedIncoming.wudaFreeColorG);
        const b = asFiniteNumber(migratedIncoming.wudaFreeColorB);
        if (r != null && g != null && b != null) {
          migratedIncoming.wudaFreeColor = rgb01ToHex(r, g, b);
        }
      }
      out.wudaLayerPresets = migrateFlatWudaToLayerPresets(migratedIncoming);
      out.wudaActiveLayerPresetId = ensureWudaActiveLayerId(
        out.wudaLayerPresets,
        typeof incoming.wudaActiveLayerPresetId === 'string'
          ? incoming.wudaActiveLayerPresetId
          : out.wudaLayerPresets[0]?.id ?? '',
      );
      return;
    }
  }

  if (!out.wudaLayerPresets?.length) {
    out.wudaLayerPresets = createDefaultWudaLayerPresets();
  }
  out.wudaActiveLayerPresetId = ensureWudaActiveLayerId(
    out.wudaLayerPresets,
    out.wudaActiveLayerPresetId,
  );
}

export function cloneConfig(src: RuntimeConfig): RuntimeConfig {
  return structuredClone(src);
}

/** Live runtime config — domain + panel only read/write this after boot. */
export const CONFIG: RuntimeConfig = createDefaultRuntimeConfig();

/**
 * Project delivery default. Starts as code factory; becomes shipping merge when
 * `presets/shipping.json` loads successfully.
 */
export let activeDefaultConfig: RuntimeConfig = createDefaultRuntimeConfig();

export function setActiveDefaultConfig(next: RuntimeConfig): void {
  activeDefaultConfig = next;
}

/**
 * Deep-merge `incoming` onto a clone of `base`, keeping base values for missing
 * or type-incompatible fields. Arrays replace wholly when present.
 */
export function mergeConfig(
  base: RuntimeConfig,
  incoming: Partial<RuntimeConfig> | Record<string, unknown> | null | undefined,
): RuntimeConfig {
  const out = cloneConfig(base);
  if (!incoming || !isPlainObject(incoming)) return out;

  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (key === 'expandedSections' && isPlainObject(value)) {
      out.expandedSections = {
        ...out.expandedSections,
        ...(value as RuntimeConfig['expandedSections']),
      };
      continue;
    }
    if (key === 'dashDxFwd' || key === 'dashDxBack') {
      if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
        (out as Record<string, unknown>)[key] = [...value];
      }
      continue;
    }
    if (key === 'lights' && Array.isArray(value)) {
      const normalized = value
        .map((x, i) => normalizeLightDesc(x, i))
        .filter((x): x is LightDesc => x != null);
      if (normalized.length > 0) {
        out.lights = enforceLightRules(
          normalized,
          typeof out.lightMaxCount === 'number' ? out.lightMaxCount : 30,
        );
      }
      continue;
    }
    if (key === 'hitVfxRecipes' && Array.isArray(value)) {
      const normalized = value
        .map((x, i) => normalizeHitVfxRecipe(x, i))
        .filter((x): x is HitVfxRecipe => x != null);
      if (normalized.length > 0) {
        out.hitVfxRecipes = normalized;
      }
      continue;
    }
    if (key === 'hitVfxElementPresets' && Array.isArray(value)) {
      out.hitVfxElementPresets = value
        .map((x, i) => normalizeHitVfxElementPreset(x, i))
        .filter((x): x is HitVfxElementPreset => x != null);
      continue;
    }
    if (key === 'wudaLayerPresets' && Array.isArray(value)) {
      const normalized = value
        .map((x, i) => normalizeWudaLayerPreset(x, i))
        .filter((x): x is WudaLayerPreset => x != null);
      if (normalized.length > 0) {
        out.wudaLayerPresets = normalized;
        out.wudaActiveLayerPresetId = ensureWudaActiveLayerId(
          out.wudaLayerPresets,
          typeof incoming.wudaActiveLayerPresetId === 'string'
            ? (incoming.wudaActiveLayerPresetId as string)
            : out.wudaActiveLayerPresetId,
        );
      }
      continue;
    }
    if (key === 'hitVfxHeightOffsets' && isPlainObject(value)) {
      out.hitVfxHeightOffsets = normalizeHeightOffsets(value);
      continue;
    }
    const baseVal = (out as Record<string, unknown>)[key];
    if (typeof baseVal === 'number' && typeof value === 'number' && Number.isFinite(value)) {
      (out as Record<string, unknown>)[key] = value;
      continue;
    }
    if (typeof baseVal === 'boolean' && typeof value === 'boolean') {
      (out as Record<string, unknown>)[key] = value;
      continue;
    }
    if (key === 'wudaAttachMode') {
      if (value === 'surfaceBary' || value === 'vertexGpuBake') {
        out.wudaAttachMode = value;
      }
      continue;
    }
    if (key === 'wudaCoverMode') {
      if (value === 'largestMesh' || value === 'allMeshes') {
        out.wudaCoverMode = value;
      }
      continue;
    }
    if (typeof baseVal === 'string' && typeof value === 'string') {
      (out as Record<string, unknown>)[key] = value;
      continue;
    }
    // Unknown extra keys ignored (forward-compat)
  }

  migrateLegacyWudaFields(out, incoming);

  out.__version = CONFIG_VERSION;
  return out;
}

/** Apply merged snapshot into live CONFIG (mutates CONFIG in place). */
export function applyConfig(
  incoming: Partial<RuntimeConfig> | Record<string, unknown> | null | undefined,
  base: RuntimeConfig = activeDefaultConfig,
): void {
  const merged = mergeConfig(base, incoming);
  Object.assign(CONFIG, merged);
  CONFIG.expandedSections = { ...merged.expandedSections };
  CONFIG.dashDxFwd = [...merged.dashDxFwd];
  CONFIG.dashDxBack = [...merged.dashDxBack];
  CONFIG.lights = enforceLightRules(
    merged.lights.map((l) => ({
      ...l,
      position: { ...l.position },
      target: { ...l.target },
    })),
    merged.lightMaxCount,
  );
  CONFIG.hitVfxRecipes = merged.hitVfxRecipes
    .map((r, i) => normalizeHitVfxRecipe(r, i))
    .filter((r): r is HitVfxRecipe => r != null);
  CONFIG.hitVfxElementPresets = (merged.hitVfxElementPresets ?? [])
    .map((p, i) => normalizeHitVfxElementPreset(p, i))
    .filter((p): p is HitVfxElementPreset => p != null);
  CONFIG.hitVfxHeightOffsets = normalizeHeightOffsets(merged.hitVfxHeightOffsets);
  CONFIG.wudaLayerPresets = (merged.wudaLayerPresets ?? [])
    .map((p, i) => normalizeWudaLayerPreset(p, i))
    .filter((p): p is WudaLayerPreset => p != null);
  if (!CONFIG.wudaLayerPresets.length) {
    CONFIG.wudaLayerPresets = createDefaultWudaLayerPresets();
  }
  CONFIG.wudaActiveLayerPresetId = ensureWudaActiveLayerId(
    CONFIG.wudaLayerPresets,
    merged.wudaActiveLayerPresetId,
  );
}

export function applyShippingDefaults(
  incoming: Partial<RuntimeConfig> | Record<string, unknown>,
): void {
  // Merge onto current active default (may already include content-table seeds).
  const next = mergeConfig(activeDefaultConfig, incoming);
  activeDefaultConfig = next;
  applyConfig(next, next);
}

export function resetToFactoryActiveDefault(): void {
  applyConfig(cloneConfig(activeDefaultConfig), activeDefaultConfig);
}

export function getPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (!isPlainObject(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

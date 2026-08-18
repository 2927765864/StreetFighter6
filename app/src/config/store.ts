import { createDefaultRuntimeConfig } from './defaults';
import {
  enforceLightRules,
  normalizeLightDesc,
  type LightDesc,
} from './lightTypes';
import type { RuntimeConfig } from './types';
import { CONFIG_VERSION } from './types';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
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
          typeof out.lightMaxCount === 'number' ? out.lightMaxCount : 15,
        );
      }
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
    if (typeof baseVal === 'string' && typeof value === 'string') {
      (out as Record<string, unknown>)[key] = value;
      continue;
    }
    // Unknown extra keys ignored (forward-compat)
  }

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

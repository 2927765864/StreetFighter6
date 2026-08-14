import {
  applyConfig,
  applyShippingDefaults,
  cloneConfig,
  CONFIG,
} from './store';
import type { RuntimeConfig } from './types';
import { CONFIG_VERSION, isPresetEnvelope } from './types';

export const STORAGE_KEYS = {
  config: 'sf6RuntimeConfig',
  presets: 'sf6RuntimeControlPresets',
} as const;

const SHIPPING_URL = '/presets/shipping.json';

function backupLocal(raw: string, oldVersion: unknown): void {
  try {
    const key = `${STORAGE_KEYS.config}.bak.v${String(oldVersion ?? 'unknown')}`;
    localStorage.setItem(key, raw);
  } catch {
    /* quota */
  }
}

export async function loadShippingConfig(): Promise<boolean> {
  try {
    const res = await fetch(SHIPPING_URL, { cache: 'no-cache' });
    if (!res.ok) return false;
    // Vite SPA fallback may 200 HTML for missing files — require JSON body.
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json') && !ct.includes('text/plain')) {
      return false;
    }
    const data: unknown = await res.json();
    const body = isPresetEnvelope(data) ? data.config : data;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    applyShippingDefaults(body as Record<string, unknown>);
    console.info('[config] shipping preset loaded');
    return true;
  } catch (e) {
    console.info('[config] no shipping preset', e);
    return false;
  }
}

export function loadSavedConfig(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.config);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.__version !== CONFIG_VERSION) {
      backupLocal(raw, parsed.__version);
      console.warn(
        '[config] local version mismatch',
        parsed.__version,
        '→',
        CONFIG_VERSION,
        '(backed up)',
      );
    }
    applyConfig(parsed);
    console.info('[config] local default applied');
    return true;
  } catch (e) {
    console.warn('[config] loadSavedConfig failed', e);
    return false;
  }
}

export function saveCurrentConfig(): void {
  const payload = {
    ...cloneConfig(CONFIG),
    __version: CONFIG_VERSION,
  };
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(payload));
}

export function clearSavedConfig(): void {
  localStorage.removeItem(STORAGE_KEYS.config);
}

export type NamedPresets = Record<string, RuntimeConfig>;

export function listNamedPresets(): NamedPresets {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.presets);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as NamedPresets;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveNamedPreset(name: string): void {
  const map = listNamedPresets();
  map[name] = cloneConfig(CONFIG);
  localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(map));
}

export function loadNamedPreset(name: string): boolean {
  const map = listNamedPresets();
  const p = map[name];
  if (!p) return false;
  applyConfig(p);
  return true;
}

export function deleteNamedPreset(name: string): void {
  const map = listNamedPresets();
  delete map[name];
  localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(map));
}

export function exportShippingJson(): void {
  const data = {
    type: 'runtime-control-preset' as const,
    version: CONFIG_VERSION,
    name: 'shipping',
    config: cloneConfig(CONFIG),
  };
  downloadJson('shipping.json', data);
}

export function exportNamedPresetJson(name: string): void {
  const map = listNamedPresets();
  const cfg = map[name] ?? cloneConfig(CONFIG);
  const data = {
    type: 'runtime-control-preset' as const,
    version: CONFIG_VERSION,
    name,
    config: cfg,
  };
  downloadJson(`${name || 'preset'}.json`, data);
}

export function importPresetFromObject(data: unknown): boolean {
  try {
    const body = isPresetEnvelope(data) ? data.config : data;
    if (!body || typeof body !== 'object') return false;
    applyConfig(body as Record<string, unknown>);
    return true;
  } catch {
    return false;
  }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

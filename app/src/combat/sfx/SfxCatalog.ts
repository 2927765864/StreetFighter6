/**
 * Thin reader for four-layer SFX exported by sfx-lab → private/runtime/sfx.
 * Processing / QA live only in sfx-lab; this module only loads the manifest.
 *
 * Contact hits are punch/kick × L/M/H:
 *   contact/hit_punch_{l,m,h} · contact/hit_kick_{l,m,h}
 *
 * Playback: CombatSfxPlayer + MatchSim `onCombatSfx` (see SfxPlayer.ts / SfxSlots.ts / WalkFootstepSfx.ts).
 */

export type SfxSlotStatus = 'accepted' | 'missing';

export type SfxSlotEntry = {
  file: string | null;
  status: SfxSlotStatus;
  source?: { bank: string; wemId: number };
  error?: string;
};

export type SfxManifest = {
  version: number;
  sourceNote?: string;
  exportedAt?: string;
  slots: Record<string, SfxSlotEntry>;
};

const DEFAULT_URL = '/private-runtime/sfx/manifest.json';

export async function loadSfxManifest(url: string = DEFAULT_URL): Promise<SfxManifest | null> {
  try {
    // Bust HTTP cache after sfx-lab re-export (same path, new bytes).
    const bust = url.includes('?') ? url : `${url}?t=${Date.now()}`;
    const res = await fetch(bust, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as SfxManifest;
  } catch {
    return null;
  }
}

/** Cache-bust token so re-export of the same filename is not sticky in the browser. */
export function sfxCacheToken(manifest: SfxManifest | null, entry: SfxSlotEntry): string {
  const parts = [
    manifest?.exportedAt ?? '',
    entry.source?.bank ?? '',
    entry.source?.wemId != null ? String(entry.source.wemId) : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('_') : String(Date.now());
}

/** Resolve a playable URL for an accepted slot, or null if missing. */
export function sfxUrl(manifest: SfxManifest | null, slotId: string): string | null {
  const entry = manifest?.slots?.[slotId];
  if (!entry || entry.status !== 'accepted' || !entry.file) return null;
  const path = `/private-runtime/sfx/${entry.file.replace(/^\/+/, '')}`;
  const v = encodeURIComponent(sfxCacheToken(manifest, entry));
  return `${path}?v=${v}`;
}

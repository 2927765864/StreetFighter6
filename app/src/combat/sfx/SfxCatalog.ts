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
  /** Optional multi-variant list (plan §3.1). Falls back to `file`. */
  files?: string[] | null;
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

/** All accepted file paths for a slot (primary first, then optional variants). */
export function sfxFilesForSlot(
  manifest: SfxManifest | null,
  slotId: string,
): string[] {
  const entry = manifest?.slots?.[slotId];
  if (!entry || entry.status !== 'accepted') return [];
  const out: string[] = [];
  const pushUnique = (f: string) => {
    const n = f.replace(/^\/+/, '');
    if (n && !out.includes(n)) out.push(n);
  };
  if (entry.file) pushUnique(entry.file);
  if (entry.files && entry.files.length > 0) {
    for (const f of entry.files) {
      if (f) pushUnique(f);
    }
  }
  return out;
}

function fileToUrl(
  manifest: SfxManifest | null,
  entry: SfxSlotEntry,
  file: string,
): string {
  const path = `/private-runtime/sfx/${file.replace(/^\/+/, '')}`;
  const v = encodeURIComponent(sfxCacheToken(manifest, entry));
  return `${path}?v=${v}`;
}

/** Resolve a playable URL for an accepted slot, or null if missing. */
export function sfxUrl(manifest: SfxManifest | null, slotId: string): string | null {
  const entry = manifest?.slots?.[slotId];
  if (!entry || entry.status !== 'accepted') return null;
  const files = sfxFilesForSlot(manifest, slotId);
  if (files.length === 0) return null;
  return fileToUrl(manifest, entry, files[0]!);
}

/** URLs for every variant of a slot (empty if missing). */
export function sfxUrlsForSlot(
  manifest: SfxManifest | null,
  slotId: string,
): string[] {
  const entry = manifest?.slots?.[slotId];
  if (!entry || entry.status !== 'accepted') return [];
  return sfxFilesForSlot(manifest, slotId).map((f) =>
    fileToUrl(manifest, entry, f),
  );
}

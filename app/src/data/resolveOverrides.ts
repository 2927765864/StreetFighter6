/**
 * Override URL helpers + optional JSON fetch (plan box-editor §4.3).
 * Aligns with persist.ts: treat Vite HTML SPA fallback as missing.
 */

export type OverrideManifest = {
  version: number;
  moves: Record<string, { updatedAt: string }>;
  stance: boolean;
};

export function overrideMoveUrl(moveId: string): string {
  return `/data/overrides/moves/${moveId}.json`;
}

export function overrideStanceUrl(): string {
  return `/data/overrides/systems/ryu_stance_boxes.json`;
}

export function overrideManifestUrl(): string {
  return `/data/overrides/manifest.json`;
}

/** Derive moveId from catalog URL `/data/moves/ryu_5lp.json` → `ryu_5lp`. */
export function moveIdFromBaseUrl(url: string): string | null {
  const m = url.match(/\/data\/moves\/([^/]+)\.json(?:\?|$)/);
  return m?.[1] ?? null;
}

export function baseMoveUrl(moveId: string): string {
  return `/data/moves/${moveId}.json`;
}

/**
 * Fetch JSON; 404 or HTML body → null (not throw).
 */
export async function fetchJsonOptional(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown | null> {
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed ${url}: ${res.status}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  // Vite SPA fallback may 200 HTML for missing public files
  if (ct.includes('text/html')) return null;
  const text = await res.text();
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function fetchOverrideManifest(
  fetchImpl: typeof fetch = fetch,
): Promise<OverrideManifest> {
  const raw = await fetchJsonOptional(overrideManifestUrl(), fetchImpl);
  if (!raw || typeof raw !== 'object') {
    return { version: 1, moves: {}, stance: false };
  }
  const o = raw as Record<string, unknown>;
  return {
    version: typeof o.version === 'number' ? o.version : 1,
    moves:
      o.moves && typeof o.moves === 'object' && !Array.isArray(o.moves)
        ? (o.moves as Record<string, { updatedAt: string }>)
        : {},
    stance: !!o.stance,
  };
}

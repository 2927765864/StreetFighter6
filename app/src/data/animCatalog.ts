/**
 * Fetch animation list for the debug anim tester (Vite dev middleware).
 *
 * Categories are auto-derived from directory segments under
 * private/assets/ryu/anims/<category>/<pack>/…
 */

export type AnimCatalogClip = {
  id: string;
  label: string;
  baseName: string;
  stem: string;
  motionId: number | null;
  frameCount: number | null;
  fps: number | null;
  /** e.g. basic/esf001v00_idle */
  pack: string;
  /** First path segment under anims/ (disk-driven) */
  category: string;
  /** Pack path after category */
  packName: string;
  url: string;
  status: string;
};

export type AnimCatalogPack = {
  pack: string;
  packName: string;
  clipCount: number;
  clips: AnimCatalogClip[];
};

export type AnimCatalogCategory = {
  category: string;
  packCount: number;
  clipCount: number;
  packs: AnimCatalogPack[];
};

export type AnimCatalogResponse = {
  ok: boolean;
  count: number;
  categoryCount?: number;
  sources?: string[];
  /** Hierarchical tree auto-built from on-disk folders */
  categories?: AnimCatalogCategory[];
  clips: AnimCatalogClip[];
  error?: string;
};

/** Prefer API tree; rebuild from flat clips if older middleware omitted it. */
export function ensureAnimCategories(
  data: AnimCatalogResponse,
): AnimCatalogCategory[] {
  if (data.categories && data.categories.length > 0) {
    return data.categories;
  }
  return buildCategoriesFromClips(data.clips ?? []);
}

export function buildCategoriesFromClips(
  clips: AnimCatalogClip[],
): AnimCatalogCategory[] {
  type PackBucket = {
    pack: string;
    packName: string;
    clips: AnimCatalogClip[];
  };
  const byCategory = new Map<string, Map<string, PackBucket>>();

  for (const c of clips) {
    const category =
      c.category ||
      (c.pack.includes('/') ? c.pack.split('/')[0]! : c.pack || '_root');
    const packName =
      c.packName ||
      (c.pack.includes('/') ? c.pack.slice(c.pack.indexOf('/') + 1) : c.pack);
    const pack = c.pack || `${category}/${packName}`;

    let packs = byCategory.get(category);
    if (!packs) {
      packs = new Map();
      byCategory.set(category, packs);
    }
    let bucket = packs.get(pack);
    if (!bucket) {
      bucket = { pack, packName, clips: [] };
      packs.set(pack, bucket);
    }
    // Normalize fields for UI even if API was partial
    bucket.clips.push({
      ...c,
      category,
      packName,
      pack,
    });
  }

  const categories: AnimCatalogCategory[] = [];
  for (const category of [...byCategory.keys()].sort((a, b) =>
    a.localeCompare(b, 'en'),
  )) {
    const packsMap = byCategory.get(category)!;
    const packs: AnimCatalogPack[] = [...packsMap.values()]
      .sort((a, b) => a.pack.localeCompare(b.pack, 'en'))
      .map((p) => ({
        pack: p.pack,
        packName: p.packName || p.pack,
        clipCount: p.clips.length,
        clips: p.clips,
      }));
    categories.push({
      category,
      packCount: packs.length,
      clipCount: packs.reduce((n, p) => n + p.clipCount, 0),
      packs,
    });
  }
  return categories;
}

export async function fetchRyuAnimCatalog(
  url = '/api/ryu-anims',
): Promise<AnimCatalogResponse> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`anim catalog HTTP ${res.status}`);
  }
  const data = (await res.json()) as AnimCatalogResponse;
  if (!data.ok) {
    throw new Error(data.error ?? 'anim catalog failed');
  }
  // Ensure each clip has category/packName for UI cascade
  if (Array.isArray(data.clips)) {
    data.clips = data.clips.map((c) => {
      const category =
        c.category ||
        (c.pack?.includes('/') ? c.pack.split('/')[0]! : c.pack || '_root');
      const packName =
        c.packName ||
        (c.pack?.includes('/')
          ? c.pack.slice(c.pack.indexOf('/') + 1)
          : c.pack || '');
      return { ...c, category, packName };
    });
  }
  data.categories = ensureAnimCategories(data);
  data.categoryCount = data.categories.length;
  return data;
}

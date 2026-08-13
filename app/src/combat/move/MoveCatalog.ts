import {
  canonicalizeMoveDefinition,
  RYU_FEEDBACK_MOVE_URLS,
} from './ryuMoveIds';
import {
  cloneMove,
  enrichMoveAnimFromMap,
  parseMoveDefinition,
  type MoveDefinition,
} from './MoveDefinition';

export type AnimMapLookup = {
  primaryPath(id: string): string | null;
  frameCountForRole(id: string, role: string): number | null;
};

/**
 * Whitelist moves loaded into memory (feedback catalog).
 */
export class MoveCatalog {
  private byId = new Map<string, MoveDefinition>();

  register(move: MoveDefinition): void {
    const m = canonicalizeMoveDefinition(move);
    this.byId.set(m.id, m);
    this.byId.set(m.moveId, m);
  }

  get(id: string): MoveDefinition | undefined {
    const m = this.byId.get(id);
    return m ? cloneMove(m) : undefined;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get size(): number {
    // unique definitions: half of keys if both id+moveId, count distinct moveId
    const seen = new Set<string>();
    for (const m of this.byId.values()) seen.add(m.moveId);
    return seen.size;
  }

  listMoveIds(): string[] {
    const seen = new Set<string>();
    for (const m of this.byId.values()) seen.add(m.moveId);
    return [...seen].sort();
  }

  /**
   * Fill missing animFrameCount/glbPath from logic→glb map (§3.13.5 residual).
   */
  enrichAnimFromMap(lookup: AnimMapLookup): number {
    let n = 0;
    const seen = new Set<string>();
    for (const m of this.byId.values()) {
      if (seen.has(m.moveId)) continue;
      seen.add(m.moveId);
      const next = enrichMoveAnimFromMap(m, lookup);
      if (next !== m) {
        this.register(next);
        n += 1;
      }
    }
    return n;
  }

  /** Sync load from already-parsed defs (tests / boot). */
  static fromMoves(moves: MoveDefinition[]): MoveCatalog {
    const c = new MoveCatalog();
    for (const m of moves) c.register(m);
    return c;
  }
}

export type CatalogLoadResult = {
  catalog: MoveCatalog;
  loaded: string[];
  failed: { url: string; error: string }[];
};

export async function loadFeedbackCatalog(
  fetchJson: (url: string) => Promise<unknown> = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
    return res.json();
  },
  urls: readonly string[] = RYU_FEEDBACK_MOVE_URLS,
): Promise<CatalogLoadResult> {
  const catalog = new MoveCatalog();
  const loaded: string[] = [];
  const failed: { url: string; error: string }[] = [];
  for (const url of urls) {
    try {
      const raw = await fetchJson(url);
      const move = parseMoveDefinition(raw);
      catalog.register(move);
      loaded.push(canonicalizeMoveDefinition(move).moveId);
    } catch (e) {
      failed.push({ url, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { catalog, loaded, failed };
}

/** @deprecated use loadFeedbackCatalog */
export async function loadP0Catalog(
  fetchJson: (url: string) => Promise<unknown> = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
    return res.json();
  },
): Promise<MoveCatalog> {
  const { catalog } = await loadFeedbackCatalog(fetchJson, [
    '/data/moves/ryu_5lp.json',
    '/data/moves/ryu_hadoken_lp.json',
  ]);
  return catalog;
}

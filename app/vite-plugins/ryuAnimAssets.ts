/**
 * Dev-server helpers for SF6 Ryu assets:
 * - GET /api/ryu-anims → list + auto-categorized tree under private/assets/ryu/anims
 * - GET /private-assets/* → static serve of private/assets (anims packs)
 * - GET /private-runtime/* → static serve of private/runtime (mesh fbx/glb etc.)
 * - GET /private-interim/* → static serve of private/interim (Ryu textures etc.)
 *
 * Directory layout (auto-discovered, no hard-coded category names):
 *   private/assets/ryu/anims/<category>/<pack>/catalog.json | glb/*.glb
 *   private/runtime/ryu/esf001_TPose.fbx (preferred skinned mesh)
 *   private/runtime/ryu/ryu_c1_mesh_only.glb (legacy fallback)
 *   private/interim/characters/SF6 Ryu Model/SF6 Ryu textures/*_albdout.png
 *
 * Production builds do not embed private/ assets; this is a local preview tool.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

export type AnimListEntry = {
  id: string;
  label: string;
  baseName: string;
  stem: string;
  motionId: number | null;
  frameCount: number | null;
  fps: number | null;
  /** Relative path under anims/, e.g. basic/esf001v00_idle */
  pack: string;
  /** First path segment under anims/ (auto from disk), e.g. basic, attack */
  category: string;
  /** Remaining pack path after category, e.g. esf001v00_idle */
  packName: string;
  url: string;
  status: string;
};

export type AnimCategoryPack = {
  pack: string;
  packName: string;
  clipCount: number;
  clips: AnimListEntry[];
};

export type AnimCategoryNode = {
  category: string;
  packCount: number;
  clipCount: number;
  packs: AnimCategoryPack[];
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function safeResolve(root: string, relUrl: string): string | null {
  const decoded = decodeURIComponent(relUrl.split('?')[0] ?? '');
  const cleaned = decoded.replace(/^\/+/, '');
  const abs = path.resolve(root, cleaned);
  const rootNorm = path.resolve(root) + path.sep;
  if (abs !== path.resolve(root) && !abs.startsWith(rootNorm)) return null;
  return abs;
}

function contentType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.glb') return 'model/gltf-binary';
  if (ext === '.gltf') return 'model/gltf+json';
  if (ext === '.fbx') return 'application/octet-stream';
  if (ext === '.json') return 'application/json';
  if (ext === '.bin') return 'application/octet-stream';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.dds') return 'application/octet-stream';
  return 'application/octet-stream';
}

/** Split pack relpath into category (1st segment) + packName (rest). */
function splitPack(pack: string): { category: string; packName: string } {
  const norm = pack.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!norm) return { category: '_root', packName: '' };
  const slash = norm.indexOf('/');
  if (slash < 0) return { category: norm, packName: '' };
  return {
    category: norm.slice(0, slash),
    packName: norm.slice(slash + 1),
  };
}

function withCategoryFields(
  pack: string,
  rest: Omit<AnimListEntry, 'category' | 'packName' | 'pack'>,
): AnimListEntry {
  const { category, packName } = splitPack(pack);
  return { ...rest, pack, category, packName };
}

function packRelFromCatalog(assetsRoot: string, catalogPath: string): string {
  const dir = path.dirname(catalogPath);
  return path.relative(path.join(assetsRoot, 'ryu', 'anims'), dir).replace(/\\/g, '/');
}

function entryFromCatalogClip(
  assetsRoot: string,
  pack: string,
  clip: Record<string, unknown>,
): AnimListEntry | null {
  const stem =
    typeof clip.stem === 'string'
      ? clip.stem
      : typeof clip.base_name === 'string'
        ? String(clip.base_name)
        : null;
  if (!stem) return null;

  let glbRel: string | null = null;
  if (typeof clip.glb === 'string') {
    const abs = clip.glb;
    if (abs.startsWith(assetsRoot)) {
      glbRel = path.relative(assetsRoot, abs).replace(/\\/g, '/');
    } else if (fs.existsSync(abs)) {
      glbRel = path.relative(assetsRoot, abs).replace(/\\/g, '/');
    }
  }
  if (!glbRel) {
    const guess = path.join(assetsRoot, 'ryu', 'anims', pack, 'glb', `${stem}.glb`);
    if (fs.existsSync(guess)) {
      glbRel = path.relative(assetsRoot, guess).replace(/\\/g, '/');
    }
  }
  if (!glbRel) return null;

  const baseName =
    typeof clip.base_name === 'string' ? clip.base_name : stem.replace(/^\d+_/, '');
  const motionId = typeof clip.motion_id === 'number' ? clip.motion_id : null;
  const frameCount =
    typeof clip.frame_count === 'number'
      ? clip.frame_count
      : typeof clip.frame_end === 'number'
        ? clip.frame_end
        : null;
  const fps = typeof clip.fps === 'number' ? clip.fps : null;
  const status = typeof clip.status === 'string' ? clip.status : 'ok';
  const index = typeof clip.index === 'number' ? clip.index : null;
  const labelParts = [
    index != null ? String(index).padStart(3, '0') : null,
    baseName,
    frameCount != null ? `${frameCount}f` : null,
    motionId != null ? `id${motionId}` : null,
  ].filter(Boolean);

  return withCategoryFields(pack, {
    id: `${pack}/${stem}`,
    label: labelParts.join(' · '),
    baseName,
    stem,
    motionId,
    frameCount,
    fps,
    url: `/private-assets/${glbRel.split(path.sep).join('/')}`,
    status,
  });
}

function scanGlbDir(assetsRoot: string, pack: string, glbDir: string): AnimListEntry[] {
  if (!fs.existsSync(glbDir)) return [];
  const files = fs
    .readdirSync(glbDir)
    .filter((f) => f.toLowerCase().endsWith('.glb'))
    .sort();
  return files.map((file) => {
    const stem = file.replace(/\.glb$/i, '');
    const glbRel = path.relative(assetsRoot, path.join(glbDir, file)).replace(/\\/g, '/');
    const m = stem.match(/^(\d+)_(.+)_id(\d+)_f(\d+)$/);
    const baseName = m?.[2] ?? stem;
    const motionId = m ? Number(m[3]) : null;
    const frameCount = m ? Number(m[4]) : null;
    const index = m ? Number(m[1]) : null;
    return withCategoryFields(pack, {
      id: `${pack}/${stem}`,
      label: [
        index != null ? String(index).padStart(3, '0') : null,
        baseName,
        frameCount != null ? `${frameCount}f` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      baseName,
      stem,
      motionId,
      frameCount,
      fps: null,
      url: `/private-assets/${glbRel}`,
      status: 'ok',
    });
  });
}

/** Build hierarchical categories from a flat clip list (directory-driven). */
function buildCategoryTree(entries: AnimListEntry[]): AnimCategoryNode[] {
  type PackBucket = {
    pack: string;
    packName: string;
    clips: AnimListEntry[];
  };
  const byCategory = new Map<string, Map<string, PackBucket>>();

  for (const e of entries) {
    let packs = byCategory.get(e.category);
    if (!packs) {
      packs = new Map();
      byCategory.set(e.category, packs);
    }
    let bucket = packs.get(e.pack);
    if (!bucket) {
      bucket = { pack: e.pack, packName: e.packName, clips: [] };
      packs.set(e.pack, bucket);
    }
    bucket.clips.push(e);
  }

  const categories: AnimCategoryNode[] = [];
  for (const category of [...byCategory.keys()].sort((a, b) => a.localeCompare(b, 'en'))) {
    const packsMap = byCategory.get(category)!;
    const packs: AnimCategoryPack[] = [...packsMap.values()]
      .sort((a, b) => a.pack.localeCompare(b.pack, 'en'))
      .map((p) => ({
        pack: p.pack,
        packName: p.packName || p.pack,
        clipCount: p.clips.length,
        clips: p.clips,
      }));
    const clipCount = packs.reduce((n, p) => n + p.clipCount, 0);
    categories.push({
      category,
      packCount: packs.length,
      clipCount,
      packs,
    });
  }
  return categories;
}

function collectAnims(assetsRoot: string): {
  entries: AnimListEntry[];
  sources: string[];
  categories: AnimCategoryNode[];
} {
  const animRoot = path.join(assetsRoot, 'ryu', 'anims');
  const entries: AnimListEntry[] = [];
  const sources: string[] = [];
  if (!fs.existsSync(animRoot)) {
    return { entries, sources, categories: [] };
  }

  /** Walk for catalog.json or glb/ directories under ryu/anims */
  const walk = (dir: string): void => {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    const catalogPath = path.join(dir, 'catalog.json');
    if (fs.existsSync(catalogPath)) {
      const pack = packRelFromCatalog(assetsRoot, catalogPath);
      sources.push(path.relative(assetsRoot, catalogPath).replace(/\\/g, '/'));
      try {
        const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as {
          clips?: Record<string, unknown>[];
        };
        if (Array.isArray(raw.clips) && raw.clips.length > 0) {
          for (const clip of raw.clips) {
            const e = entryFromCatalogClip(assetsRoot, pack, clip);
            if (e && e.status !== 'error') entries.push(e);
          }
          return;
        }
      } catch (err) {
        console.warn('[ryu-anim-assets] catalog parse failed', catalogPath, err);
      }
      const glbDir = path.join(dir, 'glb');
      entries.push(...scanGlbDir(assetsRoot, pack, glbDir));
      return;
    }

    if (names.includes('glb')) {
      const pack = path.relative(path.join(assetsRoot, 'ryu', 'anims'), dir).replace(/\\/g, '/');
      sources.push(path.relative(assetsRoot, path.join(dir, 'glb')).replace(/\\/g, '/'));
      entries.push(...scanGlbDir(assetsRoot, pack, path.join(dir, 'glb')));
      return;
    }

    for (const name of names) {
      if (name.startsWith('.')) continue;
      const next = path.join(dir, name);
      try {
        if (fs.statSync(next).isDirectory()) walk(next);
      } catch {
        /* skip */
      }
    }
  };

  walk(animRoot);
  entries.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const categories = buildCategoryTree(entries);
  return { entries, sources, categories };
}

function serveStaticFile(
  res: ServerResponse,
  root: string,
  relUrl: string,
): boolean {
  const file = safeResolve(root, relUrl);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return false;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType(file));
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(file).pipe(res);
  return true;
}

function attachMiddleware(
  server: ViteDevServer,
  assetsRoot: string,
  runtimeRoot: string,
  interimRoot: string,
): void {
  server.middlewares.use(
    (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const url = (req.url ?? '').split('?')[0] ?? '';
      if (url === '/api/ryu-anims' || url.startsWith('/api/ryu-anims?')) {
        try {
          const { entries, sources, categories } = collectAnims(assetsRoot);
          sendJson(res, 200, {
            ok: true,
            count: entries.length,
            categoryCount: categories.length,
            assetsRootHint: 'private/assets',
            runtimeRootHint: 'private/runtime',
            interimRootHint: 'private/interim',
            sources,
            categories,
            clips: entries,
          });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err) });
        }
        return;
      }

      // anims / pack files under private/assets
      if (url.startsWith('/private-assets/')) {
        const rel = url.slice('/private-assets/'.length);
        if (!serveStaticFile(res, assetsRoot, rel)) {
          res.statusCode = 404;
          res.end(`Not found under private/assets: ${rel}`);
        }
        return;
      }

      // mesh-only + runtime glb under private/runtime
      if (url.startsWith('/private-runtime/')) {
        const rel = url.slice('/private-runtime/'.length);
        if (!serveStaticFile(res, runtimeRoot, rel)) {
          res.statusCode = 404;
          res.end(`Not found under private/runtime: ${rel}`);
        }
        return;
      }

      // Ryu textures / interim community assets
      if (url.startsWith('/private-interim/')) {
        const rel = url.slice('/private-interim/'.length);
        if (!serveStaticFile(res, interimRoot, rel)) {
          res.statusCode = 404;
          res.end(`Not found under private/interim: ${rel}`);
        }
        return;
      }

      next();
    },
  );
}

export function ryuAnimAssetsPlugin(projectRoot: string): Plugin {
  const assetsRoot = path.resolve(projectRoot, '../private/assets');
  const runtimeRoot = path.resolve(projectRoot, '../private/runtime');
  const interimRoot = path.resolve(projectRoot, '../private/interim');
  return {
    name: 'ryu-anim-assets',
    configureServer(server) {
      attachMiddleware(server, assetsRoot, runtimeRoot, interimRoot);
      console.info(
        `[ryu-anim-assets] /private-assets → ${assetsRoot}` +
          ` | /private-runtime → ${runtimeRoot}` +
          ` | /private-interim → ${interimRoot}`,
      );
    },
    configurePreviewServer(server) {
      attachMiddleware(
        server as unknown as ViteDevServer,
        assetsRoot,
        runtimeRoot,
        interimRoot,
      );
    },
  };
}

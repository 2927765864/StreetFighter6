/**
 * Dev-server API for box-editor overrides (plan ai-execution-plan-box-editor-v0 §4.4).
 * Writes only under app/public/data/overrides/ — never base moves/systems.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

export type OverrideManifest = {
  version: number;
  moves: Record<string, { updatedAt: string }>;
  stance: boolean;
};

const EMPTY_MANIFEST: OverrideManifest = {
  version: 1,
  moves: {},
  stance: false,
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeResolve(root: string, rel: string): string | null {
  const cleaned = rel.replace(/^\/+/, '').replace(/\\/g, '/');
  if (cleaned.includes('..') || path.isAbsolute(cleaned)) return null;
  const abs = path.resolve(root, cleaned);
  const rootNorm = path.resolve(root) + path.sep;
  if (abs !== path.resolve(root) && !abs.startsWith(rootNorm)) return null;
  return abs;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readManifest(overridesRoot: string): OverrideManifest {
  const p = path.join(overridesRoot, 'manifest.json');
  if (!fs.existsSync(p)) return { ...EMPTY_MANIFEST, moves: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as OverrideManifest;
    return {
      version: raw.version ?? 1,
      moves: raw.moves && typeof raw.moves === 'object' ? raw.moves : {},
      stance: !!raw.stance,
    };
  } catch {
    return { ...EMPTY_MANIFEST, moves: {} };
  }
}

function writeManifest(overridesRoot: string, m: OverrideManifest): void {
  ensureDir(overridesRoot);
  fs.writeFileSync(
    path.join(overridesRoot, 'manifest.json'),
    JSON.stringify(m, null, 2) + '\n',
    'utf8',
  );
}

function isSafeMoveId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id) && id.length < 128;
}

export function boxOverrideApiPlugin(appRoot: string): Plugin {
  const overridesRoot = path.join(appRoot, 'public', 'data', 'overrides');
  const movesDir = path.join(overridesRoot, 'moves');
  const stancePath = path.join(overridesRoot, 'systems', 'ryu_stance_boxes.json');

  return {
    name: 'box-override-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/api/box-overrides')) {
          next();
          return;
        }

        try {
          if (url === '/api/box-overrides/manifest' && req.method === 'GET') {
            sendJson(res, 200, readManifest(overridesRoot));
            return;
          }

          if (url === '/api/box-overrides/all' && req.method === 'DELETE') {
            if (fs.existsSync(movesDir)) {
              for (const f of fs.readdirSync(movesDir)) {
                if (f.endsWith('.json')) fs.unlinkSync(path.join(movesDir, f));
              }
            }
            if (fs.existsSync(stancePath)) fs.unlinkSync(stancePath);
            writeManifest(overridesRoot, { ...EMPTY_MANIFEST, moves: {} });
            sendJson(res, 200, { ok: true });
            return;
          }

          const moveMatch = url.match(/^\/api\/box-overrides\/moves\/([^/]+)$/);
          if (moveMatch) {
            const moveId = decodeURIComponent(moveMatch[1]!);
            if (!isSafeMoveId(moveId)) {
              sendJson(res, 400, { error: 'invalid moveId' });
              return;
            }
            const fileRel = `moves/${moveId}.json`;
            const abs = safeResolve(overridesRoot, fileRel);
            if (!abs) {
              sendJson(res, 400, { error: 'path rejected' });
              return;
            }

            if (req.method === 'PUT') {
              const body = await readBody(req);
              JSON.parse(body); // validate JSON
              ensureDir(movesDir);
              fs.writeFileSync(abs, body.endsWith('\n') ? body : body + '\n', 'utf8');
              const man = readManifest(overridesRoot);
              man.moves[moveId] = { updatedAt: new Date().toISOString() };
              writeManifest(overridesRoot, man);
              sendJson(res, 200, { ok: true, moveId });
              return;
            }

            if (req.method === 'DELETE') {
              if (fs.existsSync(abs)) fs.unlinkSync(abs);
              const man = readManifest(overridesRoot);
              delete man.moves[moveId];
              writeManifest(overridesRoot, man);
              sendJson(res, 200, { ok: true, moveId });
              return;
            }
          }

          if (url === '/api/box-overrides/stance') {
            if (req.method === 'PUT') {
              const body = await readBody(req);
              JSON.parse(body);
              ensureDir(path.dirname(stancePath));
              fs.writeFileSync(
                stancePath,
                body.endsWith('\n') ? body : body + '\n',
                'utf8',
              );
              const man = readManifest(overridesRoot);
              man.stance = true;
              writeManifest(overridesRoot, man);
              sendJson(res, 200, { ok: true });
              return;
            }
            if (req.method === 'DELETE') {
              if (fs.existsSync(stancePath)) fs.unlinkSync(stancePath);
              const man = readManifest(overridesRoot);
              man.stance = false;
              writeManifest(overridesRoot, man);
              sendJson(res, 200, { ok: true });
              return;
            }
          }

          sendJson(res, 404, { error: 'not found' });
        } catch (e) {
          sendJson(res, 500, {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      });
    },
  };
}

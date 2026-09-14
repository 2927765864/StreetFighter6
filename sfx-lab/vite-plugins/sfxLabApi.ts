import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

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

function contentType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.json') return 'application/json';
  if (ext === '.wem') return 'application/octet-stream';
  return 'application/octet-stream';
}

function safeJoin(root: string, rel: string): string | null {
  const cleaned = decodeURIComponent(rel).replace(/^\/+/, '');
  const abs = path.resolve(root, cleaned);
  const rootNorm = path.resolve(root) + path.sep;
  if (abs !== path.resolve(root) && !abs.startsWith(rootNorm)) return null;
  return abs;
}

export function sfxLabApiPlugin(labRoot: string): Plugin {
  const workRoot = path.join(labRoot, 'work');
  const banksRoot = path.join(workRoot, 'banks');
  const acceptancePath = path.join(workRoot, 'acceptance.json');

  function listBanks() {
    if (!fs.existsSync(banksRoot)) return [];
    return fs
      .readdirSync(banksRoot)
      .filter((name) => fs.existsSync(path.join(banksRoot, name, 'catalog.json')))
      .map((id) => {
        const catalog = JSON.parse(
          fs.readFileSync(path.join(banksRoot, id, 'catalog.json'), 'utf8'),
        );
        return {
          id,
          layerHint: catalog.layerHint ?? null,
          count: catalog.count ?? (catalog.entries?.length ?? 0),
          converted: (catalog.entries || []).filter((e: { preview?: string }) => e.preview).length,
          note: catalog.note ?? null,
          sourceRoot: catalog.sourceRoot ?? null,
          likelyIncomplete: Boolean(catalog.completeness?.likelyIncomplete),
          hircObjects: catalog.completeness?.hircObjects ?? null,
        };
      });
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname === '/api/banks' && req.method === 'GET') {
      sendJson(res, 200, { banks: listBanks() });
      return true;
    }

    if (url.pathname.startsWith('/api/banks/') && req.method === 'GET') {
      const id = decodeURIComponent(url.pathname.slice('/api/banks/'.length));
      const catalogPath = path.join(banksRoot, id, 'catalog.json');
      if (!fs.existsSync(catalogPath)) {
        sendJson(res, 404, { error: 'bank not found — run npm run pipeline' });
        return true;
      }
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      sendJson(res, 200, catalog);
      return true;
    }

    if (url.pathname === '/api/acceptance' && req.method === 'GET') {
      if (!fs.existsSync(acceptancePath)) {
        sendJson(res, 200, { version: 1, assignments: {} });
        return true;
      }
      sendJson(res, 200, JSON.parse(fs.readFileSync(acceptancePath, 'utf8')));
      return true;
    }

    if (url.pathname === '/api/acceptance' && req.method === 'PUT') {
      const raw = await readBody(req);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'invalid json' });
        return true;
      }
      fs.mkdirSync(workRoot, { recursive: true });
      const next = {
        version: 1,
        updatedAt: new Date().toISOString(),
        ...(typeof body === 'object' && body ? body : {}),
      };
      fs.writeFileSync(acceptancePath, JSON.stringify(next, null, 2));
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (url.pathname === '/api/export' && req.method === 'POST') {
      const script = path.join(labRoot, 'scripts', 'export_runtime_sfx.mjs');
      const child = spawn(process.execPath, [script], {
        cwd: labRoot,
        env: process.env,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => {
        stdout += String(d);
      });
      child.stderr.on('data', (d) => {
        stderr += String(d);
      });
      child.on('close', (code) => {
        sendJson(res, code === 0 ? 200 : 500, {
          ok: code === 0,
          code,
          stdout,
          stderr,
        });
      });
      return true;
    }

    return false;
  }

  function serveWork(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
    if (!url.pathname.startsWith('/work/')) return false;
    const abs = safeJoin(workRoot, url.pathname.slice('/work/'.length));
    if (!abs || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.statusCode = 404;
      res.end('not found');
      return true;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType(abs));
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(abs).pipe(res);
    return true;
  }

  return {
    name: 'sfx-lab-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const host = req.headers.host || 'localhost';
          const url = new URL(req.url || '/', `http://${host}`);
          if (url.pathname.startsWith('/api/')) {
            const handled = await handleApi(req, res, url);
            if (handled) return;
          }
          if (serveWork(req, res, url)) return;
          next();
        } catch (e) {
          sendJson(res, 500, { error: String(e) });
        }
      });
    },
  };
}

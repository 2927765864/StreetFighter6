/**
 * Dev-server API for pants health reports (AI-readable markdown on disk).
 * Pattern: boxOverrideApi.ts — path-safe writes under docs/reports/pants/.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

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

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function stampFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function prunePrefixed(dir: string, prefix: string, keep: number): void {
  const maxKeep = Math.max(1, Math.min(100, Math.floor(keep)));
  if (!fs.existsSync(dir)) return;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.md'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const extra of files.slice(maxKeep)) {
    try {
      fs.unlinkSync(path.join(dir, extra.f));
    } catch {
      /* ignore */
    }
  }
}

export function pantsReportApiPlugin(appRoot: string): Plugin {
  const reportsRoot = path.resolve(appRoot, '..', 'docs', 'reports', 'pants');
  const incidentsRoot = path.join(reportsRoot, 'incidents');
  const sessionsRoot = path.join(reportsRoot, 'sessions');

  return {
    name: 'pants-report-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/api/pants-report/')) return next();

        if (req.method === 'PUT' && url === '/api/pants-report/health') {
          try {
            const raw = await readBody(req);
            const body = JSON.parse(raw) as { markdown?: string; json?: unknown };
            if (typeof body.markdown !== 'string') {
              return sendJson(res, 400, { ok: false, error: 'markdown required' });
            }
            ensureDir(reportsRoot);
            fs.writeFileSync(
              path.join(reportsRoot, 'pants-health-latest.md'),
              body.markdown.endsWith('\n') ? body.markdown : body.markdown + '\n',
              'utf8',
            );
            if (body.json !== undefined) {
              fs.writeFileSync(
                path.join(reportsRoot, 'pants-health-latest.json'),
                JSON.stringify(body.json, null, 2) + '\n',
                'utf8',
              );
            }
            return sendJson(res, 200, { ok: true });
          } catch (e) {
            return sendJson(res, 500, {
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        if (req.method === 'POST' && url === '/api/pants-report/incident') {
          try {
            const raw = await readBody(req);
            const body = JSON.parse(raw) as { markdown?: string; keep?: number };
            if (typeof body.markdown !== 'string') {
              return sendJson(res, 400, { ok: false, error: 'markdown required' });
            }
            ensureDir(incidentsRoot);
            const name = `pants-incident-${stampFile()}.md`;
            fs.writeFileSync(
              path.join(incidentsRoot, name),
              body.markdown.endsWith('\n') ? body.markdown : body.markdown + '\n',
              'utf8',
            );
            prunePrefixed(incidentsRoot, 'pants-incident-', body.keep ?? 20);
            return sendJson(res, 200, { ok: true, file: name });
          } catch (e) {
            return sendJson(res, 500, {
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        if (req.method === 'POST' && url === '/api/pants-report/session') {
          try {
            const raw = await readBody(req);
            const body = JSON.parse(raw) as {
              markdown?: string;
              keep?: number;
              json?: unknown;
            };
            if (typeof body.markdown !== 'string') {
              return sendJson(res, 400, { ok: false, error: 'markdown required' });
            }
            ensureDir(sessionsRoot);
            const stamp = stampFile();
            const name = `pants-session-${stamp}.md`;
            fs.writeFileSync(
              path.join(sessionsRoot, name),
              body.markdown.endsWith('\n') ? body.markdown : body.markdown + '\n',
              'utf8',
            );
            if (body.json !== undefined) {
              fs.writeFileSync(
                path.join(sessionsRoot, `pants-session-${stamp}.json`),
                JSON.stringify(body.json, null, 2) + '\n',
                'utf8',
              );
            }
            prunePrefixed(sessionsRoot, 'pants-session-', body.keep ?? 20);
            return sendJson(res, 200, { ok: true, file: name });
          } catch (e) {
            return sendJson(res, 500, {
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        if (req.method === 'POST' && url === '/api/pants-report/feel') {
          try {
            const raw = await readBody(req);
            const body = JSON.parse(raw) as { markdown?: string };
            if (typeof body.markdown !== 'string') {
              return sendJson(res, 400, { ok: false, error: 'markdown required' });
            }
            ensureDir(reportsRoot);
            const logPath = path.join(reportsRoot, 'pants-feel-log.md');
            const header = fs.existsSync(logPath)
              ? ''
              : '# 裤子手感记录\n\n';
            const chunk = body.markdown.endsWith('\n')
              ? body.markdown
              : body.markdown + '\n';
            fs.appendFileSync(logPath, header + chunk + '\n---\n\n', 'utf8');
            return sendJson(res, 200, { ok: true });
          } catch (e) {
            return sendJson(res, 500, {
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        return sendJson(res, 404, { ok: false, error: 'unknown pants-report route' });
      });
    },
  };
}

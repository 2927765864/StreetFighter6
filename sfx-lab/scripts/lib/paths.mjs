import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LAB_ROOT = path.resolve(__dirname, '../..');

export function loadConfig() {
  const configPath = path.join(LAB_ROOT, 'scripts', 'config.json');
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const streamingRaw = raw.streamingWwiseDir || '';
  return {
    ...raw,
    configPath,
    workAbs: path.resolve(LAB_ROOT, raw.workDir || 'work'),
    runtimeAbs: path.resolve(LAB_ROOT, raw.runtimeSfxDir || '../private/runtime/sfx'),
    wwiseAbs: path.resolve(raw.wwiseDir),
    streamingAbs: streamingRaw ? path.resolve(streamingRaw) : null,
  };
}

/** Prefer streaming wwise copy when present; else natives/product wwise. */
export function resolveBankPath(cfg, fileName) {
  if (cfg.streamingAbs) {
    const streamed = path.join(cfg.streamingAbs, fileName);
    if (fs.existsSync(streamed)) return { path: streamed, source: 'streaming' };
  }
  const local = path.join(cfg.wwiseAbs, fileName);
  if (fs.existsSync(local)) return { path: local, source: 'product' };
  return null;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function which(cmd) {
  const pathEnv = process.env.PATH || '';
  for (const dir of pathEnv.split(path.delimiter)) {
    const candidate = path.join(dir, cmd);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  // Homebrew common locations
  for (const candidate of [
    `/opt/homebrew/bin/${cmd}`,
    `/usr/local/bin/${cmd}`,
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

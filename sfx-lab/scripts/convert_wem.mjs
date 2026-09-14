#!/usr/bin/env node
/**
 * Convert extracted .wem → .wav (vgmstream-cli) and preview .ogg (ffmpeg).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, ensureDir, which } from './lib/paths.mjs';

function requireTool(name, brewHint) {
  const p = which(name);
  if (!p) {
    console.error(`Missing tool: ${name}`);
    console.error(`Install: ${brewHint}`);
    process.exit(1);
  }
  return p;
}

function convertOne(vgm, ffmpeg, wemPath, wavPath, oggPath) {
  const r1 = spawnSync(vgm, ['-o', wavPath, '-i', wemPath], { encoding: 'utf8' });
  if (r1.status !== 0 || !fs.existsSync(wavPath)) {
    return {
      ok: false,
      error: (r1.stderr || r1.stdout || 'vgmstream failed').trim().slice(0, 400),
    };
  }
  let durationSec = null;
  const meta = spawnSync(vgm, ['-m', wemPath], { encoding: 'utf8' });
  if (meta.status === 0 && meta.stdout) {
    const m = meta.stdout.match(/sample rate:\s*(\d+)/i);
    const n = meta.stdout.match(/stream total samples:\s*(\d+)/i);
    if (m && n) {
      durationSec = Number(n[1]) / Number(m[1]);
    }
  }
  if (ffmpeg && oggPath) {
    // Homebrew ffmpeg often lacks libvorbis; libopus in Ogg is widely available.
    const r2 = spawnSync(
      ffmpeg,
      ['-y', '-i', wavPath, '-c:a', 'libopus', '-b:a', '96k', oggPath],
      { encoding: 'utf8' },
    );
    if (r2.status !== 0 || !fs.existsSync(oggPath)) {
      return {
        ok: true,
        wav: true,
        ogg: false,
        durationSec,
        error: (r2.stderr || 'ffmpeg ogg failed').trim().slice(-240),
      };
    }
  }
  return { ok: true, wav: true, ogg: Boolean(oggPath && fs.existsSync(oggPath)), durationSec };
}

function main() {
  const cfg = loadConfig();
  const vgm = requireTool('vgmstream-cli', 'brew install vgmstream');
  const ffmpeg = which('ffmpeg');
  if (!ffmpeg) {
    console.warn('ffmpeg not found; will write .wav only. brew install ffmpeg (or vgmstream pulls it).');
  }

  const banksRoot = path.join(cfg.workAbs, 'banks');
  if (!fs.existsSync(banksRoot)) {
    console.error('No work/banks — run: npm run extract');
    process.exit(1);
  }

  let ok = 0;
  let fail = 0;
  for (const bankId of fs.readdirSync(banksRoot)) {
    const bankDir = path.join(banksRoot, bankId);
    const catalogPath = path.join(bankDir, 'catalog.json');
    if (!fs.existsSync(catalogPath)) continue;
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const wavDir = path.join(bankDir, 'wav');
    const previewDir = path.join(bankDir, 'preview');
    ensureDir(wavDir);
    ensureDir(previewDir);

    for (const entry of catalog.entries) {
      const wemPath = path.join(bankDir, entry.file);
      if (!fs.existsSync(wemPath)) {
        fail += 1;
        entry.convert = { ok: false, error: 'missing wem' };
        continue;
      }
      const wavPath = path.join(wavDir, `${entry.wemId}.wav`);
      const oggPath = ffmpeg ? path.join(previewDir, `${entry.wemId}.ogg`) : null;
      const result = convertOne(vgm, ffmpeg, wemPath, wavPath, oggPath);
      entry.convert = result;
      entry.wav = result.ok ? `wav/${entry.wemId}.wav` : null;
      entry.preview = result.ogg ? `preview/${entry.wemId}.ogg` : result.ok ? `wav/${entry.wemId}.wav` : null;
      entry.durationSec = result.durationSec;
      if (result.ok) ok += 1;
      else fail += 1;
      process.stdout.write(result.ok ? '.' : 'x');
    }
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
    console.log(`\n${bankId}: updated catalog`);
  }
  console.log(`done. ok=${ok} fail=${fail}`);
}

main();

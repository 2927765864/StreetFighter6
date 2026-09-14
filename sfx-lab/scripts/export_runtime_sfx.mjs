#!/usr/bin/env node
/**
 * Export accepted slot assignments from work/acceptance.json → private/runtime/sfx.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, ensureDir, which } from './lib/paths.mjs';

const SLOT_IDS = [
  'contact/hit_punch_l',
  'contact/hit_punch_m',
  'contact/hit_punch_h',
  'contact/hit_kick_l',
  'contact/hit_kick_m',
  'contact/hit_kick_h',
  'contact/block_l',
  'contact/block_m',
  'contact/block_h',
  'swing/punch_l',
  'swing/punch_m',
  'swing/punch_h',
  'swing/kick_l',
  'swing/kick_m',
  'swing/kick_h',
  'loco/dash_fwd',
  'loco/dash_back',
  'loco/footstep_left',
  'loco/footstep_right',
  'loco/jump',
  'loco/jump_cloth',
  'loco/land',
  'knockdown/body_fall',
  'knockdown/wakeup',
];

function copyOrTranscode(src, dest, ffmpeg) {
  ensureDir(path.dirname(dest));
  const srcExt = path.extname(src).toLowerCase();
  const destExt = path.extname(dest).toLowerCase();
  if (srcExt === destExt) {
    fs.copyFileSync(src, dest);
    return dest;
  }
  if (!ffmpeg) {
    const fallback = dest.replace(/\.ogg$/i, '.wav');
    fs.copyFileSync(src, fallback);
    return fallback;
  }
  const r = spawnSync(
    ffmpeg,
    ['-y', '-i', src, '-c:a', 'libopus', '-b:a', '96k', dest],
    { encoding: 'utf8' },
  );
  if (r.status !== 0 || !fs.existsSync(dest)) {
    throw new Error(`ffmpeg failed for ${src}: ${(r.stderr || '').slice(-200)}`);
  }
  return dest;
}

function main() {
  const cfg = loadConfig();
  const acceptancePath = path.join(cfg.workAbs, 'acceptance.json');
  if (!fs.existsSync(acceptancePath)) {
    console.error('Missing work/acceptance.json — mark slots in the lab UI first.');
    process.exit(1);
  }
  const acceptance = JSON.parse(fs.readFileSync(acceptancePath, 'utf8'));
  const assignments = acceptance.assignments || {};
  const ffmpeg = which('ffmpeg');
  const exportExt = (cfg.exportFormat || 'ogg').startsWith('wav') ? 'wav' : 'ogg';

  ensureDir(cfg.runtimeAbs);
  const slots = {};

  for (const slotId of SLOT_IDS) {
    const a = assignments[slotId];
    if (!a || a.status !== 'accepted' || !a.bankId || a.wemId == null) {
      slots[slotId] = { file: null, status: 'missing' };
      continue;
    }
    const bankDir = path.join(cfg.workAbs, 'banks', a.bankId);
    const catalog = JSON.parse(fs.readFileSync(path.join(bankDir, 'catalog.json'), 'utf8'));
    const entry = (catalog.entries || []).find((e) => e.wemId === a.wemId);
    if (!entry) {
      slots[slotId] = { file: null, status: 'missing', error: 'wem not in catalog' };
      continue;
    }
    const preferred =
      (entry.preview && path.join(bankDir, entry.preview)) ||
      (entry.wav && path.join(bankDir, entry.wav)) ||
      path.join(bankDir, entry.file);
    if (!fs.existsSync(preferred)) {
      slots[slotId] = { file: null, status: 'missing', error: 'source file missing' };
      continue;
    }
    const rel = `${slotId}.${exportExt}`;
    const dest = path.join(cfg.runtimeAbs, rel);
    try {
      const written = copyOrTranscode(preferred, dest, ffmpeg) || dest;
      const finalRel = path.relative(cfg.runtimeAbs, written).replace(/\\/g, '/');
      slots[slotId] = {
        file: finalRel,
        status: 'accepted',
        source: { bank: a.bankId, wemId: a.wemId },
      };
      console.log(`export ${slotId} ← ${a.bankId}/${a.wemId}`);
    } catch (e) {
      slots[slotId] = { file: null, status: 'missing', error: String(e.message || e) };
      console.warn(`fail ${slotId}:`, e.message || e);
    }
  }

  const manifest = {
    version: 1,
    sourceNote: 'SF6 unpack via sfx-lab; private only — do not redistribute',
    exportedAt: new Date().toISOString(),
    slots,
  };
  fs.writeFileSync(path.join(cfg.runtimeAbs, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const accepted = Object.values(slots).filter((s) => s.status === 'accepted').length;
  console.log(`wrote ${cfg.runtimeAbs}/manifest.json (${accepted}/${SLOT_IDS.length} accepted)`);
}

main();

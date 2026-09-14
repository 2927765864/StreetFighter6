#!/usr/bin/env node
/**
 * Extract embedded WEM blobs from RE Engine / Wwise *.sbnk.1.x64 media banks (DIDX+DATA).
 * Resolves banks from streamingWwiseDir first (when present), else wwiseDir.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ensureDir, resolveBankPath } from './lib/paths.mjs';

function findChunk(buf, tag) {
  const needle = Buffer.from(tag, 'ascii');
  let i = 0;
  while (i + 8 <= buf.length) {
    if (buf.compare(needle, 0, 4, i, i + 4) === 0) {
      const size = buf.readUInt32LE(i + 4);
      return { offset: i, size, payloadStart: i + 8 };
    }
    i += 1;
  }
  return null;
}

function hircObjectCount(esPath) {
  if (!esPath || !fs.existsSync(esPath)) return null;
  const buf = fs.readFileSync(esPath);
  const hirc = findChunk(buf, 'HIRC');
  if (!hirc || hirc.size < 4) return null;
  return buf.readUInt32LE(hirc.payloadStart);
}

function siblingEsPath(mediaPath) {
  // battle_cmn_m.sbnk.1.x64 → battle_cmn_es.sbnk.1.x64
  const base = path.basename(mediaPath);
  const esName = base.replace('_m.sbnk', '_es.sbnk');
  if (esName === base) return null;
  return path.join(path.dirname(mediaPath), esName);
}

function loadPrevDurations(outDir) {
  const catalogPath = path.join(outDir, 'catalog.json');
  const map = new Map();
  if (!fs.existsSync(catalogPath)) return map;
  try {
    const prev = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    for (const e of prev.entries || []) {
      if (e?.wemId != null && e.durationSec != null) map.set(e.wemId, e.durationSec);
    }
  } catch {
    /* ignore */
  }
  return map;
}

function extractBank(bankPath, outDir) {
  const buf = fs.readFileSync(bankPath);
  const didx = findChunk(buf, 'DIDX');
  const data = findChunk(buf, 'DATA');
  if (!didx || !data) {
    throw new Error(`No DIDX/DATA in ${bankPath} (is this a media *_m bank?)`);
  }
  const prevDurations = loadPrevDurations(outDir);
  const entries = [];
  const count = Math.floor(didx.size / 12);
  const wemDir = path.join(outDir, 'wem');
  ensureDir(wemDir);

  for (let n = 0; n < count; n++) {
    const off = didx.payloadStart + n * 12;
    const wemId = buf.readUInt32LE(off);
    const wemOff = buf.readUInt32LE(off + 4);
    const wemLen = buf.readUInt32LE(off + 8);
    const slice = buf.subarray(data.payloadStart + wemOff, data.payloadStart + wemOff + wemLen);
    const name = `${wemId}.wem`;
    const dest = path.join(wemDir, name);
    fs.writeFileSync(dest, slice);
    const entry = {
      wemId,
      file: `wem/${name}`,
      bytes: wemLen,
    };
    // Keep already-converted previews if extract is re-run.
    const oggRel = `preview/${wemId}.ogg`;
    const wavRel = `wav/${wemId}.wav`;
    if (fs.existsSync(path.join(outDir, oggRel))) {
      entry.preview = oggRel;
      entry.wav = fs.existsSync(path.join(outDir, wavRel)) ? wavRel : null;
      entry.convert = { ok: true, wav: Boolean(entry.wav), ogg: true };
    } else if (fs.existsSync(path.join(outDir, wavRel))) {
      entry.preview = wavRel;
      entry.wav = wavRel;
      entry.convert = { ok: true, wav: true, ogg: false };
    }
    if (prevDurations.has(wemId)) entry.durationSec = prevDurations.get(wemId);
    entries.push(entry);
  }

  const esPath = siblingEsPath(bankPath);
  const hircObjects = hircObjectCount(esPath);
  const ratio =
    hircObjects && hircObjects > 0 ? Number((entries.length / hircObjects).toFixed(3)) : null;
  const completeness = {
    embeddedWems: entries.length,
    hircObjects,
    ratio,
    // HIRC counts events/actions, not 1:1 media — ratio is only a hint for the UI.
    likelyIncomplete: false,
  };

  return {
    bankFile: path.basename(bankPath),
    bankPath,
    extractedAt: new Date().toISOString(),
    count: entries.length,
    completeness,
    entries,
  };
}

function main() {
  const cfg = loadConfig();
  if (!fs.existsSync(cfg.wwiseAbs)) {
    console.error(`wwiseDir not found: ${cfg.wwiseAbs}`);
    console.error('Edit scripts/config.json wwiseDir to your SF6_export/.../sound/wwise path.');
    process.exit(1);
  }
  if (cfg.streamingAbs && fs.existsSync(cfg.streamingAbs)) {
    console.log(`streaming wwise: ${cfg.streamingAbs} (preferred)`);
  } else {
    console.warn(
      `streamingWwiseDir missing or not found: ${cfg.streamingAbs || '(unset)'}\n` +
        '  Combat hit/loco/knockdown often live in streaming .spck/.wem.\n' +
        '  Unpack natives/stm/streaming/product/sound/wwise and set streamingWwiseDir.',
    );
  }

  ensureDir(cfg.workAbs);
  let total = 0;
  for (const bank of cfg.banks) {
    const resolved = resolveBankPath(cfg, bank.file);
    if (!resolved) {
      console.warn(`skip missing bank: ${bank.file}`);
      continue;
    }
    const outDir = path.join(cfg.workAbs, 'banks', bank.id);
    ensureDir(outDir);
    const catalog = extractBank(resolved.path, outDir);
    catalog.bankId = bank.id;
    catalog.layerHint = bank.layerHint ?? null;
    catalog.note = bank.note ?? null;
    catalog.sourceRoot = resolved.source;
    if (catalog.completeness) {
      catalog.completeness.likelyIncomplete = String(bank.layerHint || '').includes('incomplete');
    }
    fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    const flag = catalog.completeness?.likelyIncomplete ? ' [marked incomplete]' : '';
    console.log(
      `extracted ${catalog.count} wems ← ${resolved.source} → work/banks/${bank.id}/${flag}`,
    );
    total += catalog.count;
  }
  console.log(`done. total wems: ${total}`);
}

main();

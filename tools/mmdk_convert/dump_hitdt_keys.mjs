#!/usr/bin/env node
/** Dump HIT_DT common[0] keys for ryu_5lp vs ryu_2hk. Plan ungarded-hit-kd §3a. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hit = JSON.parse(fs.readFileSync(path.join(ROOT, 'private/mmdk/Ryu/hit_dt.json'), 'utf8'));
const inv = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, 'docs/character-control/action-tables/sourced-framedata/mmdk-ryu-hitdt-block-fields.json'),
    'utf8',
  ),
);

function table(id) {
  return hit[String(id).padStart(3, '0')] ?? hit[String(id)] ?? hit[id];
}
function scalars(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = v;
    } else out[k] = v;
  }
  return out;
}

const lpIdx = inv.moves.find((m) => m.moveId === 'ryu_5lp').hitDtIndex;
const hkIdx = inv.moves.find((m) => m.moveId === 'ryu_2hk').hitDtIndex;
const lp0 = scalars(table(lpIdx)?.common?.['0']);
const hk0 = scalars(table(hkIdx)?.common?.['0']);
const diff = [];
for (const k of new Set([...Object.keys(lp0 || {}), ...Object.keys(hk0 || {})])) {
  if (JSON.stringify(lp0?.[k]) !== JSON.stringify(hk0?.[k])) {
    diff.push({ key: k, ryu_5lp: lp0?.[k], ryu_2hk: hk0?.[k] });
  }
}

const out = {
  retrieved: '2026-08-20',
  source: 'private/mmdk/Ryu/hit_dt.json',
  hitDtIndex: { ryu_5lp: lpIdx, ryu_2hk: hkIdx },
  note:
    'DownTime differs (3 vs 10). Used as knockdown *down-hold* segment, not full wakeup. DmgType 3 vs 6.',
  common0_keys: Object.keys(lp0 || {}),
  DownTime: { ryu_5lp: lp0?.DownTime, ryu_2hk: hk0?.DownTime },
  DmgType: { ryu_5lp: lp0?.DmgType, ryu_2hk: hk0?.DmgType },
  HitStun: { ryu_5lp: lp0?.HitStun, ryu_2hk: hk0?.HitStun },
  MoveDest: { ryu_5lp: lp0?.MoveDest, ryu_2hk: hk0?.MoveDest },
  diff,
};
const dest = path.join(
  ROOT,
  'docs/character-control/action-tables/sourced-framedata/mmdk-hitdt-hit-side-keys-5lp-2hk.json',
);
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log('wrote', dest, 'DownTime', out.DownTime);

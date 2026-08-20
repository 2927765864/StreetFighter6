#!/usr/bin/env node
/**
 * Dump HIT_DT hit-side MoveDest/MoveTime → local inventory + write
 * hitPushbackTotal / hitPushMoveTime / hitPushback[] onto public move JSON.
 * CurveTgtID has no published per-frame table; bake ease-out like BlockResolve.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCALE = Number(process.env.MMDK_UNIT_SCALE ?? '0.01');
const POWER = 3;
const MOVES_DIR = path.join(ROOT, 'app/public/data/moves');
const HIT_DT = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'private/mmdk/Ryu/hit_dt.json'), 'utf8'),
);

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function easeOutProgress(t, power = 3) {
  const u = Math.min(1, Math.max(0, t));
  return 1 - (1 - u) ** power;
}

function distributePushback(total, n) {
  const len = Math.max(1, Math.floor(n));
  if (!Number.isFinite(total) || total === 0) return new Array(len).fill(0);
  const steps = [];
  let prev = 0;
  let acc = 0;
  for (let i = 0; i < len; i++) {
    const p = easeOutProgress((i + 1) / len, POWER);
    const dx = i === len - 1 ? total - acc : total * (p - prev);
    steps.push(dx);
    acc += dx;
    prev = p;
  }
  return steps;
}

function hitTable(idx) {
  if (idx == null || !Number.isFinite(Number(idx))) return null;
  return (
    HIT_DT[String(idx).padStart(3, '0')] ?? HIT_DT[String(idx)] ?? HIT_DT[idx] ?? null
  );
}

const files = fs
  .readdirSync(MOVES_DIR)
  .filter((f) => f.startsWith('ryu_') && f.endsWith('.json') && f !== 'ryu_index.json');

const rows = [];
const skipped = [];

for (const file of files) {
  const fp = path.join(MOVES_DIR, file);
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const idx = j.mmdk?.hitDtIndex;
  const tbl = hitTable(idx);
  const stand = tbl?.common?.['0'] ?? tbl?.param?.['00'];
  if (!stand) {
    skipped.push({ file, reason: 'no HIT_DT common[0]', hitDtIndex: idx ?? null });
    continue;
  }
  const mx = num(stand.MoveDest?.x ?? stand.MoveDest?.X, 0);
  const my = num(stand.MoveDest?.y ?? stand.MoveDest?.Y, 0);
  const mt = Math.max(1, Math.floor(num(stand.MoveTime, j.hitstun || 1)));
  const total = mx * SCALE;
  const curve = stand.CurveTgtID != null ? num(stand.CurveTgtID, 0) : null;
  const baked = distributePushback(total, mt);
  const row = {
    moveId: j.moveId ?? j.id,
    file,
    hitDtIndex: idx,
    MoveDest_x: mx,
    MoveDest_y: my,
    MoveTime: mt,
    CurveTgtID: curve,
    HitStun: num(stand.HitStun, 0),
    hitPushbackTotal: total,
    hitPushMoveTime: mt,
    hitPushbackFrames: baked.length,
    note:
      'HIT_DT has MoveDest+MoveTime+CurveTgtID; no public curve samples. Baked ease-out p=3 like block.',
  };
  rows.push(row);
  j.hitPushbackTotal = total;
  j.hitPushMoveTime = mt;
  j.hitPushback = baked;
  fs.writeFileSync(fp, JSON.stringify(j, null, 2) + '\n');
}

const dest = path.join(
  ROOT,
  'docs/character-control/action-tables/sourced-framedata/mmdk-ryu-hit-push-fields.json',
);
fs.writeFileSync(
  dest,
  JSON.stringify(
    {
      retrieved: '2026-08-20',
      source: 'private/mmdk/Ryu/hit_dt.json common[0]',
      unitScale: SCALE,
      easePower: POWER,
      patched: rows.length,
      skipped,
      moves: rows,
    },
    null,
    2,
  ) + '\n',
);
console.log('patched', rows.length, 'skipped', skipped.length, '→', dest);
if (skipped.length) console.log(skipped);

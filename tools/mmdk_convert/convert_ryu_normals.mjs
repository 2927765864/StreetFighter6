#!/usr/bin/env node
/**
 * MMDK private JSON → app/public/data/moves/*.json + systems/ryu_stance_boxes.json
 * Dual-source: public frames (generated) + MMDK boxes/Place/HIT_DT.
 * Layer/part hurt tagging + rect resolve (plan box-assembly-full-v1).
 *
 * Usage (repo root):
 *   node tools/mmdk_convert/convert_ryu_normals.mjs --check
 *   node tools/mmdk_convert/convert_ryu_normals.mjs --stance
 *   node tools/mmdk_convert/convert_ryu_normals.mjs --all-normals
 *   node tools/mmdk_convert/convert_ryu_normals.mjs --coverage
 *   node tools/mmdk_convert/convert_ryu_normals.mjs --only 5lp
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PRIVATE = path.join(ROOT, 'private/mmdk/Ryu');
const OUT_MOVES = path.join(ROOT, 'app/public/data/moves');
const GENERATED = path.join(OUT_MOVES, 'generated');
const OUT_SYSTEMS = path.join(ROOT, 'app/public/data/systems');
const COVERAGE_PATH = path.join(__dirname, 'coverage_list.json');
const DEFERRED_MD = path.join(
  ROOT,
  'docs/character-control/action-tables/deferred-moves.md',
);
const STANCE_MD = path.join(
  ROOT,
  'docs/character-control/action-tables/sourced-stance-boxes.md',
);

/** MMDK internal units → logic world (raw; then vertical fit to LOGIC_BODY_HEIGHT). */
const UNIT_SCALE = Number(process.env.MMDK_UNIT_SCALE ?? '0.01');
/**
 * Visual/logic character height (must match FighterView normalizeModelToHeight default).
 * MMDK stance stack top after half-extent is ~1.66; model is 1.85 → boxes sit low under head.
 */
const LOGIC_BODY_HEIGHT = Number(process.env.MMDK_BODY_HEIGHT ?? '1.85');
/** Clamp layer:base hurt.to to total-1 (plan §6 default ON). */
const CLAMP_BASE_HURT_TO_TOTAL = process.env.CLAMP_BASE_HURT_TO_TOTAL !== '0';

/** Mutable vertical fit applied after stance measure (y,h × yFit). */
let Y_FIT = Number(process.env.MMDK_Y_FIT ?? '0'); // 0 = auto from stance

const NORMAL_MAP = {
  '5lp': { actions: ['ATK_5LP'], publicId: 'ryu_5lp', generated: 'ryu_5lp.json' },
  '5mp': { actions: ['ATK_5MP'], publicId: 'ryu_5mp', generated: 'ryu_5mp.json' },
  '5hp': { actions: ['ATK_5HP'], publicId: 'ryu_5hp', generated: 'ryu_5hp.json' },
  '5lk': { actions: ['ATK_5LK'], publicId: 'ryu_5lk', generated: 'ryu_5lk.json' },
  '5mk': { actions: ['ATK_5MK'], publicId: 'ryu_5mk', generated: 'ryu_5mk.json' },
  '5hk': { actions: ['ATK_5HK'], publicId: 'ryu_5hk', generated: 'ryu_5hk.json' },
  '2lp': { actions: ['ATK_2LP'], publicId: 'ryu_2lp', generated: 'ryu_2lp.json' },
  '2mp': { actions: ['ATK_2MP'], publicId: 'ryu_2mp', generated: 'ryu_2mp.json' },
  '2hp': { actions: ['ATK_2HP'], publicId: 'ryu_2hp', generated: 'ryu_2hp.json' },
  '2lk': { actions: ['ATK_2LK'], publicId: 'ryu_2lk', generated: 'ryu_2lk.json' },
  '2mk': { actions: ['ATK_2MK', 'ATK_2MK_Y2'], publicId: 'ryu_2mk', generated: 'ryu_2mk.json' },
  '2hk': { actions: ['ATK_2HK'], publicId: 'ryu_2hk', generated: 'ryu_2hk.json' },
  '6mp': { actions: ['ATK_6MP'], publicId: 'ryu_6mp', generated: 'ryu_6mp.json' },
  '6hp': { actions: ['ATK_6HP'], publicId: 'ryu_6hp', generated: 'ryu_6hp.json' },
  '4hp': { actions: ['ATK_4HP'], publicId: 'ryu_4hp', generated: 'ryu_4hp.json' },
  '4hk': { actions: ['ATK_4HK'], publicId: 'ryu_4hk', generated: 'ryu_4hk.json' },
  '6hk': { actions: ['ATK_3HK', 'ATK_6HK'], publicId: 'ryu_6hk', generated: 'ryu_6hk.json' },
  'jlp': { actions: ['ATK_9LP', 'ATK_8LP', 'ATK_JLP'], publicId: 'ryu_jlp', generated: 'ryu_j>lp.json' },
  'jmp': { actions: ['ATK_9MP', 'ATK_8MP'], publicId: 'ryu_jmp', generated: 'ryu_j>mp.json' },
  'jhp': { actions: ['ATK_9HP', 'ATK_8HP'], publicId: 'ryu_jhp', generated: 'ryu_j>hp.json' },
  'jlk': { actions: ['ATK_9LK', 'ATK_8LK'], publicId: 'ryu_jlk', generated: 'ryu_j>lk.json' },
  'jmk': { actions: ['ATK_9MK', 'ATK_8MK'], publicId: 'ryu_jmk', generated: 'ryu_j>mk.json' },
  'jhk': { actions: ['ATK_9HK', 'ATK_8HK'], publicId: 'ryu_jhk', generated: 'ryu_j>hk.json' },
};

/**
 * Manual hit AABB overrides (viewer-calibrated). Applied after MMDK extract so
 * reconvert keeps the tuned volume. Keys = publicId.
 *
 * ryu_jmk: MMDK rect35/36 raw packing cannot match the full kicking-leg volume
 * (user markup 2026-08-13). Single active-range box covering hip→foot white pants.
 * Frames keep MMDK active window 6–12 (0-based inclusive).
 */
const HIT_MANUAL_OVERRIDES = {
  ryu_jmk: [
    {
      from: 6,
      to: 12,
      x: 0.9,
      y: 1.25,
      w: 1.05,
      h: 0.6,
      manualCalib: true,
      note: 'viewer leg volume (user markup); replaces rect35/36 packing',
    },
  ],
};

/** Specials / target combo / denjin — MMDK action candidates (order = priority). */
const SPECIAL_MAP = {
  ryu_hadoken_lp: {
    actions: ['SPA_HADO', 'SPA_HADO(1)'],
    generated: 'ryu_hadoken_lp.json',
  },
  ryu_hadoken_mp: {
    actions: ['SPA_HADO(1)', 'SPA_HADO(2)', 'SPA_HADO'],
    generated: 'ryu_hadoken_mp.json',
  },
  ryu_hadoken_hp: {
    actions: ['SPA_HADO(2)', 'SPA_HADO(3)', 'SPA_HADO'],
    generated: 'ryu_hadoken_hp.json',
  },
  ryu_shoryuken_lp: {
    actions: ['SPA_SYORYU_START', 'SPA_SYORYU_END'],
    generated: 'ryu_shoryuken_lp.json',
  },
  ryu_shoryuken_mp: {
    actions: ['SPA_SYORYU_START(1)', 'SPA_SYORYU_START', 'SPA_SYORYU_END(1)'],
    generated: 'ryu_shoryuken_mp.json',
  },
  ryu_shoryuken_hp: {
    actions: ['SPA_SYORYU_START(2)', 'SPA_SYORYU_START(3)', 'SPA_SYORYU_END(2)'],
    generated: 'ryu_shoryuken_hp.json',
  },
  ryu_tatsu_lk: {
    actions: ['SPA_TATSUMAKI_END', 'SPA_TATSUMAKI_END(1)'],
    generated: 'ryu_tatsu_lk.json',
  },
  ryu_tatsu_mk: {
    actions: ['SPA_TATSUMAKI_END(1)', 'SPA_TATSUMAKI_END'],
    generated: 'ryu_tatsu_mk.json',
  },
  ryu_tatsu_hk: {
    actions: ['SPA_TATSUMAKI_END(2)', 'SPA_TATSUMAKI_END(3)', 'SPA_TATSUMAKI_END'],
    generated: 'ryu_tatsu_hk.json',
  },
  ryu_air_tatsu_lk: {
    actions: ['SPA_TATSUMAKI_AIR_END', 'SPA_TATSUMAKI_AIR_END(1)'],
    generated: 'ryu_9_214_k.json',
  },
  ryu_air_tatsu_mk: {
    actions: ['SPA_TATSUMAKI_AIR_END(1)', 'SPA_TATSUMAKI_AIR_END'],
    generated: 'ryu_9_214_k.json',
  },
  ryu_air_tatsu_hk: {
    actions: ['SPA_TATSUMAKI_AIR_END(2)', 'SPA_TATSUMAKI_AIR_END(3)', 'SPA_TATSUMAKI_AIR_END'],
    generated: 'ryu_9_214_kk_.json',
  },
  ryu_blade_lk: {
    actions: ['SPA_SOKUTOU_L', 'SPA_SOKUTOU_L(1)'],
    generated: 'ryu_blade_lk.json',
  },
  ryu_blade_mk: {
    actions: ['SPA_SOKUTOU_L(1)', 'SPA_SOKUTOU_L(2)', 'SPA_SOKUTOU_L'],
    generated: 'ryu_blade_mk.json',
  },
  ryu_blade_hk: {
    actions: ['SPA_SOKUTOU_L(2)', 'SPA_SOKUTOU_L(3)', 'SPA_SOKUTOU_L(4)'],
    generated: 'ryu_blade_hk.json',
  },
  ryu_hashogeki_lp: {
    actions: ['SPA_HADOSHO_L', 'SPA_HADOSHO', 'SPA_HADOSHO_L(1)'],
    generated: 'ryu_hashogeki_lp.json',
  },
  ryu_hashogeki_mp: {
    actions: ['SPA_HADOSHO_L(1)', 'SPA_HADOSHO(1)', 'SPA_HADOSHO'],
    generated: 'ryu_hashogeki_mp.json',
  },
  ryu_hashogeki_hp: {
    actions: ['SPA_HADOSHO_L(2)', 'SPA_HADOSHO(2)', 'SPA_HADOSHO_L(3)'],
    generated: 'ryu_hashogeki_hp.json',
  },
  ryu_denjin_charge: {
    actions: ['SPA_KIAITAME', 'SPA_KIAITAME_2', 'SPA_KIAITAME_3'],
    generated: 'ryu_22_p.json',
  },
  ryu_tc_hp_hk: {
    actions: ['ATK_5HK_2', 'ATK_5HK(1)', 'ATK_5HK'],
    generated: 'ryu_5hp_5hk.json',
  },
  ryu_tc_fuwa: {
    actions: ['ATK_5HK(1)', 'ATK_5HK_2', 'ATK_5HK'],
    generated: 'ryu_5mp_5lk_5hk.json',
  },
};

export function placeCumToDx(placeCum) {
  if (!placeCum.length) return [];
  const dx = new Array(placeCum.length);
  dx[0] = placeCum[0] ?? 0;
  for (let i = 1; i < placeCum.length; i++) {
    dx[i] = (placeCum[i] ?? 0) - (placeCum[i - 1] ?? 0);
  }
  return dx;
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function privatePaths() {
  const candidates = {
    rects: ['rects.json', 'Ryu rects.json'],
    moves: ['moves_dict.json', 'Ryu moves_dict.json'],
    hit: ['hit_dt.json', 'Ryu HIT_DT.json'],
  };
  const out = {};
  for (const [k, names] of Object.entries(candidates)) {
    out[k] = names.map((n) => path.join(PRIVATE, n)).find((p) => fs.existsSync(p));
  }
  return out;
}

function existsCore() {
  const p = privatePaths();
  return Boolean(p.rects && p.moves);
}

/**
 * Flatten rects.json buckets → id(number) → list of rects.
 * IDs are NOT globally unique across buckets; resolveRect() picks a candidate.
 */
function buildRectTable(rectsRoot) {
  /** @type {Map<number, object[]>} */
  const flat = new Map();
  if (!rectsRoot || typeof rectsRoot !== 'object') return flat;
  for (const [bucket, group] of Object.entries(rectsRoot)) {
    if (!group || typeof group !== 'object') continue;
    for (const [rid, rect] of Object.entries(group)) {
      if (!rect || typeof rect !== 'object') continue;
      const id = parseInt(String(rid), 10);
      if (!Number.isFinite(id)) continue;
      const list = flat.get(id) ?? [];
      list.push({ ...rect, _bucket: bucket, _rid: rid });
      flat.set(id, list);
    }
  }
  return flat;
}

/**
 * Pick best rect for an id. Reject absurd heights (e.g. OffsetY 640).
 *
 * Critical (2026-08-13 visual fix):
 * - Same numeric id appears in many buckets; "max area" alone picks strike/throw
 *   variants with large OffsetX → boxes float beside the character.
 * - Bucket **08** is the primary standing hurt palette (OffsetX≈0, head/body/leg stack).
 * - For hurt: prefer bucket 08, then min |OffsetX|, then max area.
 * - MMDK hurt SizeX/Y are **half-extents** (center→edge); ADR-002 wants full w/h → ×2.
 * - Strike HitOffset≠0: center = HitOffset; Size **full** (punch ~0.5×0.65 max-area).
 * - Strike HitOffset≈0: center = rect Offset; preferExtendedX; Size **per-axis**:
 *   small raw axes are hurt-like half-extents (×2), large axes already full limb span.
 *
 * j.HK vs j.MK (must not share one global half/full switch):
 * - j.HK rect37 **40×22** → both axes half → 0.80×0.49 (leg coverage; user-validated).
 * - j.MK rect35 **70×17** → X full, Y half → 0.70×0.38 (thigh thickness, not 1.4-wide).
 * - j.MK rect36 **64×30** → both full → 0.64×0.33 (foot; global ×2 made 1.28 past toe).
 * - Bucket: HitOffset≈0 + max-area wrongly picks body-centered dups (j.HK r37 b05) →
 *   preferExtendedX (|OffsetX|). Green full-leg volume is hurt extend, not extra hit.
 */
function resolveRect(rectTable, id, opts = {}) {
  const list = rectTable.get(id);
  if (!list?.length) return null;
  const preferBuckets = opts.preferBuckets; // e.g. ['08']
  const preferCenteredX = opts.preferCenteredX === true;
  const preferExtendedX = opts.preferExtendedX === true;
  const ok = list.filter((r) => {
    const oy = num(r.OffsetY);
    const ox = num(r.OffsetX);
    const sx = num(r.SizeX);
    const sy = num(r.SizeY);
    return (
      oy > -50 &&
      oy < 350 &&
      Math.abs(ox) < 350 &&
      sx > 0 &&
      sx < 200 &&
      sy > 0 &&
      sy < 200
    );
  });
  let pool = ok.length ? ok.slice() : list.slice();
  if (preferBuckets?.length) {
    const preferred = pool.filter((r) => preferBuckets.includes(String(r._bucket)));
    if (preferred.length) pool = preferred;
  }
  pool.sort((a, b) => {
    if (preferExtendedX) {
      const d = Math.abs(num(b.OffsetX)) - Math.abs(num(a.OffsetX));
      if (d !== 0) return d;
    } else if (preferCenteredX) {
      const d = Math.abs(num(a.OffsetX)) - Math.abs(num(b.OffsetX));
      if (d !== 0) return d;
    }
    return num(b.SizeX) * num(b.SizeY) - num(a.SizeX) * num(a.SizeY);
  });
  return pool[0];
}

/** Hurt / push DamageCollision palette. */
const HURT_RECT_OPTS = { preferBuckets: ['08'], preferCenteredX: true };
/**
 * Strike AttackCollision defaults (HitOffset non-zero → size only from rect).
 * When HitOffset is zero, extractFromAction uses HIT_RECT_OPTS_EXTENDED instead.
 */
const HIT_RECT_OPTS = { preferCenteredX: false };
/** Strike when position is rect Offset (HitOffset≈0): prefer limb-extension |OffsetX|. */
const HIT_RECT_OPTS_EXTENDED = { preferExtendedX: true };

/**
 * Per-axis half-extent thresholds (raw MMDK units) for HitOffset≈0 strikes.
 * See resolveRect / extractFromAction comments (j.HK vs j.MK).
 */
const STRIKE_HALF_EXTENT_X_MAX = 45;
const STRIKE_HALF_EXTENT_Y_MAX = 25;

/** Full logical extent from raw Size on one axis (HitOffset≈0 strike packing). */
function strikeAxisFullExtent(rawSize, axisMax) {
  const v = num(rawSize);
  if (v <= 0) return 0;
  return v <= axisMax ? v * 2 : v;
}

function rectToBox(rect, scale, opts = {}) {
  const {
    hitOffsetX = 0,
    hitOffsetY = 0,
    rootX = 0,
    rootY = 0,
    useHitOffsetAsCenter = false,
    /** When true, Size is half-extent → full w/h = 2 * Size (ADR-002). */
    sizeIsHalfExtent = false,
    /**
     * HitOffset≈0 strike: per-axis half packing (overrides sizeIsHalfExtent for size).
     * When true, SizeX/Y use STRIKE_HALF_EXTENT_* thresholds independently.
     */
    strikeOffsetSizePacking = false,
  } = opts;
  let sx;
  let sy;
  if (strikeOffsetSizePacking) {
    sx = strikeAxisFullExtent(rect.SizeX, STRIKE_HALF_EXTENT_X_MAX);
    sy = strikeAxisFullExtent(rect.SizeY, STRIKE_HALF_EXTENT_Y_MAX);
  } else {
    sx = num(rect.SizeX) * (sizeIsHalfExtent ? 2 : 1);
    sy = num(rect.SizeY) * (sizeIsHalfExtent ? 2 : 1);
  }
  let ox;
  let oy;
  if (useHitOffsetAsCenter && (hitOffsetX !== 0 || hitOffsetY !== 0)) {
    ox = hitOffsetX + rootX;
    oy = hitOffsetY + rootY;
  } else {
    ox = num(rect.OffsetX) + rootX + hitOffsetX;
    oy = num(rect.OffsetY) + rootY + hitOffsetY;
  }
  return {
    x: ox * scale,
    y: oy * scale,
    w: sx * scale,
    h: sy * scale,
    _bucket: rect._bucket,
  };
}

/** Scale Y channel so MMDK stack top matches LOGIC_BODY_HEIGHT (model 1.85). */
function applyYFitBox(box, yFit) {
  if (!yFit || yFit === 1) return box;
  const out = { ...box };
  if (typeof out.y === 'number') out.y *= yFit;
  if (typeof out.h === 'number') out.h *= yFit;
  return out;
}

function stackTopFromHurt(hurt) {
  let top = 0;
  for (const b of hurt) {
    if (typeof b.y !== 'number' || typeof b.h !== 'number') continue;
    top = Math.max(top, b.y + b.h / 2);
  }
  return top;
}

function computeYFitFromHurt(hurt) {
  if (Y_FIT > 0) return Y_FIT;
  const top = stackTopFromHurt(hurt);
  if (top <= 0.01) return 1;
  return LOGIC_BODY_HEIGHT / top;
}

function iterKeyEntries(keyTable) {
  if (!keyTable || typeof keyTable !== 'object') return [];
  const out = [];
  for (const [k, v] of Object.entries(keyTable)) {
    if (k === 'keys_index') continue;
    if (v && typeof v === 'object') out.push(v);
  }
  return out;
}

function listIds(listObj) {
  if (!listObj) return [];
  if (Array.isArray(listObj)) {
    return listObj.map((x) => (typeof x === 'object' ? num(x.m_value ?? x) : num(x)));
  }
  if (typeof listObj === 'object') {
    return Object.values(listObj).map((x) => num(x));
  }
  return [num(listObj)];
}

function frameRange(key) {
  const start = num(key._StartFrame ?? key.StartFrame, 0);
  let end = num(key._EndFrame ?? key.EndFrame, start);
  // Inclusive range (runtime from<=f<=to); if end < start, clamp
  if (end < start) end = start;
  return { from: start, to: end };
}

function extractFromAction(action, rectTable, hitDt, scale) {
  const hit = [];
  const hurt = [];
  const push = [];
  let selfMovement = [];
  let hitDtIndex = null;

  for (const key of iterKeyEntries(action.AttackCollisionKey)) {
    const isStrike =
      key._isStr === true ||
      (num(key.AttackDataListIndex, -1) >= 0 && key._isPrx !== true);
    if (!isStrike) continue;
    if (key._isPrx === true) continue;
    const { from, to } = frameRange(key);
    const hox = num(key.HitOffset?.x ?? key.HitOffset?.X, 0);
    const hoy = num(key.HitOffset?.y ?? key.HitOffset?.Y, 0);
    const rox = num(key.RootOffset?.X ?? key.RootOffset?.x, 0);
    const roy = num(key.RootOffset?.Y ?? key.RootOffset?.y, 0);
    const ids = listIds(key.BoxList);
    if (num(key.AttackDataListIndex, -1) >= 0) {
      hitDtIndex = num(key.AttackDataListIndex);
    }
    // HitOffset non-zero → center from HitOffset, Size full (punch calibration).
    // HitOffset zero → center from rect Offset; preferExtendedX; per-axis size pack
    // (j.HK both half; j.MK wide X full + thin Y half — do NOT global ×2).
    const hitOffsetAsCenter = hox !== 0 || hoy !== 0;
    const hitRectOpts = hitOffsetAsCenter ? HIT_RECT_OPTS : HIT_RECT_OPTS_EXTENDED;
    for (const id of ids) {
      const rect = resolveRect(rectTable, id, hitRectOpts);
      if (!rect) continue;
      const geo = rectToBox(rect, scale, {
        hitOffsetX: hox,
        hitOffsetY: hoy,
        rootX: rox,
        rootY: roy,
        useHitOffsetAsCenter: true,
        sizeIsHalfExtent: false,
        strikeOffsetSizePacking: !hitOffsetAsCenter,
      });
      const { _bucket, ...box } = geo;
      hit.push({ from, to, ...box, rectId: id, rectBucket: _bucket });
    }
  }

  // Stand normals use Head+Body+Leg keys as layer:base. Air freefall / air normals
  // often only have BodyList — without a special rule everything becomes extend and
  // the stand-shaped air stance never gets replaced (§4.3 / jump box follow-up).
  const dmgKeys = iterKeyEntries(action.DamageCollisionKey);
  let actionHasThreePartBase = false;
  for (const key of dmgKeys) {
    if (
      listIds(key.HeadList).length &&
      listIds(key.BodyList).length &&
      listIds(key.LegList).length
    ) {
      actionHasThreePartBase = true;
      break;
    }
  }
  /** Body-only rects with |OffsetX| ≤ this are full-body base (air torso). */
  const BODY_ONLY_BASE_OX_MAX = 12;

  for (const key of dmgKeys) {
    const { from, to } = frameRange(key);
    const rox = num(key.RootOffset?.X ?? key.RootOffset?.x, 0);
    const roy = num(key.RootOffset?.Y ?? key.RootOffset?.y, 0);
    const headIds = listIds(key.HeadList);
    const bodyIds = listIds(key.BodyList);
    const legIds = listIds(key.LegList);
    const hasHead = headIds.length > 0;
    const hasBody = bodyIds.length > 0;
    const hasLeg = legIds.length > 0;
    for (const [listName, ids, part] of [
      ['HeadList', headIds, 'head'],
      ['BodyList', bodyIds, 'body'],
      ['LegList', legIds, 'leg'],
    ]) {
      for (const id of ids) {
        // Extend limbs may only exist outside bucket 08 — fall back with centered preference
        let rect = resolveRect(rectTable, id, HURT_RECT_OPTS);
        if (!rect) rect = resolveRect(rectTable, id, { preferCenteredX: true });
        if (!rect) continue;
        let layer = 'extend';
        if (hasHead && hasBody && hasLeg) {
          layer = 'base';
        } else if (
          !actionHasThreePartBase &&
          hasBody &&
          !hasHead &&
          !hasLeg &&
          part === 'body'
        ) {
          // Air-style action: centered body volumes replace stance; offset = limb stretch
          const ox = Math.abs(num(rect.OffsetX));
          layer = ox <= BODY_ONLY_BASE_OX_MAX ? 'base' : 'extend';
        }
        const geo = rectToBox(rect, scale, {
          rootX: rox,
          rootY: roy,
          sizeIsHalfExtent: true,
        });
        const { _bucket, ...box } = geo;
        hurt.push({
          from,
          to,
          ...box,
          rectId: id,
          part,
          layer,
          rectBucket: _bucket,
        });
      }
    }
  }

  for (const key of iterKeyEntries(action.PushCollisionKey)) {
    const { from, to } = frameRange(key);
    const boxNo = num(key.BoxNo, -1);
    // Push: prefer body-like centered rect (bucket 08 id 8 / boxNo)
    let rect = resolveRect(rectTable, boxNo, HURT_RECT_OPTS);
    if (rect && num(rect.SizeX) > 45) {
      const body = resolveRect(rectTable, 8, HURT_RECT_OPTS);
      if (body) rect = body;
    }
    if (!rect) {
      rect =
        resolveRect(rectTable, 8, HURT_RECT_OPTS) ||
        resolveRect(rectTable, 2, HURT_RECT_OPTS);
    }
    if (!rect) continue;
    const rox = num(key.RootOffset?.X ?? key.RootOffset?.x, 0);
    const roy = num(key.RootOffset?.Y ?? key.RootOffset?.y, 0);
    const geo = rectToBox(rect, scale, {
      rootX: rox,
      rootY: roy,
      sizeIsHalfExtent: true,
    });
    // Push X centered on character (body thickness)
    geo.x = 0;
    const { _bucket, ...box } = geo;
    push.push({ from, to, ...box, rectId: boxNo, rectBucket: _bucket });
  }

  for (const key of iterKeyEntries(action.PlaceKey)) {
    const posList = key.PosList;
    if (!posList || typeof posList !== 'object') continue;
    const start = num(key._StartFrame ?? key.StartFrame, 0);
    const end = num(key._EndFrame ?? key.EndFrame, start);
    const ratio = num(key.Ratio, 1);
    const axis = num(key.Axis, 0);
    if (axis !== 0) continue;
    const entries = Object.entries(posList)
      .map(([k, v]) => [num(k), num(v) * ratio * scale])
      .sort((a, b) => a[0] - b[0]);
    if (!entries.length) continue;
    const maxF = Math.max(end - 1, entries[entries.length - 1][0], start);
    const cum = new Array(maxF + 1).fill(0);
    let last = 0;
    let ei = 0;
    for (let f = 0; f <= maxF; f++) {
      while (ei < entries.length && entries[ei][0] <= f) {
        last = entries[ei][1];
        ei++;
      }
      const direct = posList[String(f).padStart(2, '0')] ?? posList[String(f)];
      if (direct != null) last = num(direct) * ratio * scale;
      cum[f] = last;
    }
    selfMovement = placeCumToDx(cum);
  }

  const fabFrame = num(action.fab?.Frame, selfMovement.length || 0);

  let hitMeta = {};
  if (hitDt && hitDtIndex != null) {
    const key =
      hitDt[String(hitDtIndex).padStart(3, '0')] ??
      hitDt[String(hitDtIndex)] ??
      hitDt[hitDtIndex];
    if (key) {
      const stand =
        key.common?.['0'] ?? key.param?.['00'] ?? key.param?.['0'];
      const block =
        key.common?.['1'] ?? key.param?.['01'] ?? key.param?.['1'];
      if (stand) {
        hitMeta.damage = num(stand.DmgValue, 0);
        hitMeta.hitstun = num(stand.HitStun, 0);
        hitMeta.hitstopOnHit = num(stand.HitStopTarget, num(stand.HitStopOwner, 0));
        const md = stand.MoveDest?.x ?? stand.MoveDest?.X;
        if (md != null) hitMeta.hitPushTotal = num(md) * scale;
      }
      if (block) {
        hitMeta.blockstun = num(block.HitStun, hitMeta.hitstun ?? 0);
        hitMeta.hitstopOnBlock = num(
          block.HitStopTarget,
          num(block.HitStopOwner, hitMeta.hitstopOnHit ?? 0),
        );
        const md = block.MoveDest?.x ?? block.MoveDest?.X;
        if (md != null) hitMeta.blockPushbackTotal = num(md) * scale;
        const mt = block.MoveTime;
        if (mt != null) hitMeta.blockPushMoveTime = Math.max(1, Math.floor(num(mt, 0)));
        if (block.CurveTgtID != null) hitMeta.blockCurveTgtID = num(block.CurveTgtID, 0);
        if (block._IsStrength_L) hitMeta.guardStrength = 'L';
        else if (block._IsStrength_M) hitMeta.guardStrength = 'M';
        else if (block._IsStrength_H) hitMeta.guardStrength = 'H';
        else if (block.HitmarkStrength === 0) hitMeta.guardStrength = 'L';
        else if (block.HitmarkStrength === 1) hitMeta.guardStrength = 'M';
        else if (block.HitmarkStrength === 2) hitMeta.guardStrength = 'H';
      }
    }
  }

  // Vertical fit (same for hit/hurt/push) — applied when Y_FIT known
  const yFit = Y_FIT > 0 ? Y_FIT : 1;
  if (yFit !== 1) {
    for (let i = 0; i < hit.length; i++) hit[i] = applyYFitBox(hit[i], yFit);
    for (let i = 0; i < hurt.length; i++) hurt[i] = applyYFitBox(hurt[i], yFit);
    for (let i = 0; i < push.length; i++) push[i] = applyYFitBox(push[i], yFit);
  }

  return { hit, hurt, push, selfMovement, fabFrame, hitMeta, hitDtIndex, yFit };
}

function findAction(movesDict, names) {
  for (const n of names) {
    if (movesDict[n]) return { name: n, action: movesDict[n] };
  }
  const byName = movesDict.By_Name;
  if (byName) {
    for (const n of names) {
      if (byName[n]) return { name: n, action: byName[n] };
    }
  }
  return null;
}

function clampBaseHurt(hurt, total) {
  if (!CLAMP_BASE_HURT_TO_TOTAL || !Number.isFinite(total) || total < 1) return hurt;
  const maxTo = total - 1;
  // Drop base keys that start after public total (common on air normals:
  // MMDK recovery BodyList@f23+ vs public total ~15). Clamping only `to`
  // produced inverted ranges (from=23, to=14).
  const out = [];
  for (const b of hurt) {
    if (b.layer !== 'base') {
      out.push(b);
      continue;
    }
    if (b.from > maxTo) continue;
    const to = Math.min(b.to, maxTo);
    if (b.from > to) continue;
    out.push(to === b.to ? b : { ...b, to });
  }
  return out;
}

function mergePublicAndMmdk(publicMove, part, meta) {
  const out = structuredClone(publicMove);
  out.boxes = out.boxes ?? {};
  const total = num(out.frames?.total, 1);
  const hurt = clampBaseHurt(part.hurt, total);
  // Prefer convert publicId (ryu_jmk); generated load may still be ryu_j>mk.
  const overrideKey = meta.publicId || out.id || out.moveId;
  const hitOverride = overrideKey ? HIT_MANUAL_OVERRIDES[overrideKey] : null;
  const publicId = overrideKey;
  if (hitOverride?.length) {
    out.boxes.hit = hitOverride.map((b) => ({ ...b }));
  } else if (part.hit.length) {
    out.boxes.hit = part.hit;
  }
  if (hurt.length) out.boxes.hurt = hurt;
  if (part.push.length) out.boxes.push = part.push;
  else if (!out.boxes.push?.length) {
    out.boxes.push = [
      {
        from: 0,
        to: Math.max(0, total - 1),
        x: 0,
        y: 0.7,
        w: 0.55,
        h: 1.4,
        placeholder: true,
      },
    ];
  }
  if (part.selfMovement.length) {
    out.selfMovement = part.selfMovement;
  } else if (!Array.isArray(out.selfMovement)) {
    out.selfMovement = new Array(total).fill(0);
  }
  const hitForTimeline = out.boxes.hit ?? part.hit;
  out.timelineFrames = Math.max(
    out.frames?.total ?? 0,
    part.fabFrame || 0,
    out.selfMovement?.length ?? 0,
    ...hurt.map((b) => b.to + 1),
    ...hitForTimeline.map((b) => b.to + 1),
    ...part.push.map((b) => b.to + 1),
  );
  const hm = part.hitMeta || {};
  if (hm.damage != null && hm.damage > 0) out.damage = hm.damage;
  if (hm.hitstun != null) out.hitstun = hm.hitstun;
  if (hm.blockstun != null) out.blockstun = hm.blockstun;
  if (hm.hitstopOnHit != null) out.hitstopOnHit = hm.hitstopOnHit;
  if (hm.hitstopOnBlock != null) out.hitstopOnBlock = hm.hitstopOnBlock;
  if (hm.blockPushbackTotal != null) out.blockPushbackTotal = hm.blockPushbackTotal;
  if (hm.blockPushMoveTime != null) out.blockPushMoveTime = hm.blockPushMoveTime;
  if (hm.guardStrength) out.guardStrength = hm.guardStrength;

  out.mmdk = {
    actionName: meta.actionName,
    fabFrame: part.fabFrame,
    hitDtIndex: part.hitDtIndex,
    unitScale: UNIT_SCALE,
    clampBaseHurtToTotal: CLAMP_BASE_HURT_TO_TOTAL,
    hitManualOverride: Boolean(hitOverride?.length),
    ...(hm.blockCurveTgtID != null ? { blockCurveTgtID: hm.blockCurveTgtID } : {}),
  };
  out.review = {
    status: hitOverride?.length
      ? 'mmdk_converted+manual_hit'
      : part.hit.length || hurt.length
        ? 'mmdk_converted'
        : 'placeholder',
    notes: hitOverride?.length
      ? `MMDK convert + HIT_MANUAL_OVERRIDES[${publicId}]; unitScale=${UNIT_SCALE}; CLAMP_BASE=${CLAMP_BASE_HURT_TO_TOTAL}`
      : part.hit.length
        ? `MMDK convert unitScale=${UNIT_SCALE}; public frames kept; layer/part on hurt; CLAMP_BASE=${CLAMP_BASE_HURT_TO_TOTAL}`
        : hurt.length
          ? `MMDK hurt/push only (no strike hit); unitScale=${UNIT_SCALE}`
          : 'MMDK action found but no collision boxes',
  };
  if (out.boxes.hit?.length) {
    out.boxes.hit = out.boxes.hit.map(({ placeholder, ...rest }) => rest);
  }
  return out;
}

function loadPublicMove(publicId, generated, shortKey) {
  const genPath = generated ? path.join(GENERATED, generated) : null;
  const pubPath = path.join(OUT_MOVES, `${publicId}.json`);
  if (genPath && fs.existsSync(genPath)) return loadJson(genPath);
  if (fs.existsSync(pubPath)) return loadJson(pubPath);
  if (fs.existsSync(GENERATED)) {
    const loose = fs
      .readdirSync(GENERATED)
      .find(
        (f) =>
          f.toLowerCase().includes((shortKey || publicId).toLowerCase()) ||
          f.replace(/>/g, '').includes(publicId),
      );
    if (loose) return loadJson(path.join(GENERATED, loose));
  }
  return null;
}

/**
 * Merge optional PROJ action strike boxes into body action extract.
 * Hadoken / Hashogeki store AttackCollision on `… PROJ` keys.
 */
function extractMerged(actions, rectTable, movesDict, hitDt) {
  const found = findAction(movesDict, actions);
  if (!found) return { found: null, part: null };
  const part = extractFromAction(found.action, rectTable, hitDt, UNIT_SCALE);
  // Try companion PROJ / related for missing strikes
  const projCandidates = [];
  for (const n of actions) {
    projCandidates.push(`${n} PROJ`);
  }
  projCandidates.push(`${found.name} PROJ`);
  const proj = findAction(movesDict, projCandidates);
  if (proj && part.hit.length === 0) {
    const p2 = extractFromAction(proj.action, rectTable, hitDt, UNIT_SCALE);
    if (p2.hit.length) {
      part.hit = p2.hit;
      if (part.hitDtIndex == null) part.hitDtIndex = p2.hitDtIndex;
      if (!part.hitMeta || !Object.keys(part.hitMeta).length) part.hitMeta = p2.hitMeta;
      part._projAction = proj.name;
    }
  }
  return { found, part };
}

function convertOne(publicId, actions, generated, shortKey, rectTable, movesDict, hitDt) {
  const pubPath = path.join(OUT_MOVES, `${publicId}.json`);
  let publicMove = loadPublicMove(publicId, generated, shortKey);
  if (!publicMove) {
    publicMove = {
      id: publicId,
      characterId: 'ryu',
      moveId: publicId,
      displayName: publicId,
      frames: { startup: 4, active: 3, recovery: 10, total: 17 },
      advantage: { onHit: 0, onBlock: 0 },
      damage: 0,
      hitstun: 12,
      blockstun: 10,
      cancel: { specialCancel: false, targetCombo: [], windows: [] },
      boxes: { hurt: [], hit: [], push: [] },
      clipId: publicId,
      facingRelative: true,
      animPlaceholder: true,
    };
  }
  const { found, part } = extractMerged(actions, rectTable, movesDict, hitDt);
  if (!found || !part) {
    return {
      status: 'missing_action',
      publicId,
      actions,
      path: pubPath,
    };
  }
  const actionLabel = part._projAction
    ? `${found.name}+${part._projAction}`
    : found.name;
  const merged = mergePublicAndMmdk(publicMove, part, {
    actionName: actionLabel,
    publicId,
  });
  merged.id = publicId;
  merged.moveId = publicId;
  if (!merged.clipId) merged.clipId = publicId;
  fs.mkdirSync(OUT_MOVES, { recursive: true });
  fs.writeFileSync(pubPath, JSON.stringify(merged, null, 2) + '\n');
  return {
    status: 'converted',
    publicId,
    actionName: actionLabel,
    hit: part.hit.length,
    hurt: part.hurt.length,
    push: part.push.length,
    placeLen: part.selfMovement.length,
    fab: part.fabFrame,
    path: pubPath,
  };
}

/** Derive under-head push from a head/body/leg hurt stack (pre or post yFit). */
function pushFromHurtStack(hurt) {
  const bodyHurt = hurt.find((h) => h.part === 'body');
  if (!bodyHurt) return null;
  const leg = hurt.find((h) => h.part === 'leg');
  const head = hurt.find((h) => h.part === 'head');
  const bodyTop = bodyHurt.y + bodyHurt.h / 2;
  const top = head ? Math.min(head.y - head.h / 2, bodyTop) : bodyTop;
  const bot = leg ? leg.y - leg.h / 2 : bodyHurt.y - bodyHurt.h / 2;
  const h = Math.max(0.5, top - bot);
  const y = (top + bot) / 2;
  return {
    x: 0,
    y,
    w: Math.min(bodyHurt.w, 0.7),
    h,
    fromBody: true,
  };
}

/** Hurt parts from one DamageCollisionKey entry (raw units, pre yFit). */
function hurtPartsFromDmgKey(key, rectTable, scale) {
  const hurt = [];
  const rox = num(key.RootOffset?.X ?? key.RootOffset?.x, 0);
  const roy = num(key.RootOffset?.Y ?? key.RootOffset?.y, 0);
  for (const [ids, part] of [
    [listIds(key.HeadList), 'head'],
    [listIds(key.BodyList), 'body'],
    [listIds(key.LegList), 'leg'],
  ]) {
    for (const id of ids) {
      let rect = resolveRect(rectTable, id, HURT_RECT_OPTS);
      if (!rect) rect = resolveRect(rectTable, id, { preferCenteredX: true });
      if (!rect) continue;
      const geo = rectToBox(rect, scale, {
        rootX: rox,
        rootY: roy,
        sizeIsHalfExtent: true,
      });
      const { _bucket, ...box } = geo;
      hurt.push({ part, ...box, rectId: id, rectBucket: _bucket });
    }
  }
  return hurt;
}

/**
 * Per-keyframe stance transition timeline (MMDK DamageCollision segments).
 * SF6 stand↔crouch actions are typically 2 segments (e.g. f0–3 source posture,
 * f4+ destination), not smooth per-frame morph — export as timed base stacks.
 */
function extractStanceTransitionTimeline(action, rectTable, scale, yFit) {
  const rawKeys = iterKeyEntries(action.DamageCollisionKey)
    .map((k) => {
      const { from, to } = frameRange(k);
      return { key: k, from, to };
    })
    .filter((s) => s.to >= s.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);

  // Touching ranges like [0,4] + [4,60] → [0,3] + [4,60] (later segment wins frame 4)
  for (let i = 0; i < rawKeys.length - 1; i++) {
    const cur = rawKeys[i];
    const next = rawKeys[i + 1];
    if (cur.to >= next.from) {
      cur.to = Math.max(cur.from, next.from - 1);
    }
  }

  const fabFrame = num(action?.fab?.Frame, 0);
  // fab.Frame is exclusive length (glb _fN). MMDK _EndFrame often equals fab.Frame
  // (one past last sample) — clamp inclusive `to` to totalFrames-1.
  let totalFrames = fabFrame > 0 ? fabFrame : 0;
  if (totalFrames <= 0 && rawKeys.length) {
    totalFrames = Math.max(...rawKeys.map((s) => s.to)) + 1;
  }
  totalFrames = Math.max(1, totalFrames);
  const lastFrame = totalFrames - 1;

  const hurt = [];
  const push = [];
  for (const seg of rawKeys) {
    const from = Math.min(seg.from, lastFrame);
    const to = Math.min(Math.max(seg.to, from), lastFrame);
    if (to < from) continue;
    const parts = hurtPartsFromDmgKey(seg.key, rectTable, scale).map((b) =>
      applyYFitBox(b, yFit),
    );
    for (const p of parts) {
      hurt.push({
        from,
        to,
        part: p.part,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        rectId: p.rectId,
        rectBucket: p.rectBucket,
        layer: 'base',
      });
    }
    const pushBox = pushFromHurtStack(parts);
    if (pushBox) {
      push.push({
        from,
        to,
        x: pushBox.x,
        y: pushBox.y,
        w: pushBox.w,
        h: pushBox.h,
        fromBody: true,
      });
    }
  }

  return {
    hurt,
    push,
    totalFrames,
    segmentCount: new Set(hurt.map((b) => `${b.from}-${b.to}`)).size,
  };
}

function extractStanceParts(action, rectTable, scale, opts = {}) {
  const keys = iterKeyEntries(action.DamageCollisionKey);
  // Prefer mid-timeline key that has all three parts
  let pick = keys.find((k) => {
    return (
      listIds(k.HeadList).length &&
      listIds(k.BodyList).length &&
      listIds(k.LegList).length
    );
  });
  if (!pick && keys.length) pick = keys[0];
  const hurt = pick ? hurtPartsFromDmgKey(pick, rectTable, scale) : [];
  const push = [];
  const derived = pushFromHurtStack(hurt);
  if (derived) {
    push.push(derived);
  } else {
    const pkeys = iterKeyEntries(action.PushCollisionKey);
    const pk = pkeys[0];
    if (pk) {
      let rect =
        resolveRect(rectTable, 8, HURT_RECT_OPTS) ||
        resolveRect(rectTable, num(pk.BoxNo, -1), HURT_RECT_OPTS);
      if (rect) {
        const geo = rectToBox(rect, scale, { sizeIsHalfExtent: true });
        const { _bucket, ...box } = geo;
        box.x = 0;
        push.push({ ...box, rectId: 8, rectBucket: _bucket });
      }
    }
  }

  // Vertical fit: MMDK raw stack top (~1.66) → LOGIC_BODY_HEIGHT (1.85 model)
  const rawTop = stackTopFromHurt(hurt);
  const yFit =
    opts.yFit != null && Number.isFinite(opts.yFit)
      ? opts.yFit
      : computeYFitFromHurt(hurt);
  if (opts.yFit == null) Y_FIT = yFit;
  return {
    hurt: hurt.map((b) => applyYFitBox(b, yFit)),
    push: push.map((b) => applyYFitBox(b, yFit)),
    yFit,
    rawTop,
  };
}

function convertStance(rectTable, movesDict) {
  const standNames = ['BAS_STD_Loop', 'BAS_STD_Loop(1)', 'BAS_STD_IDLING_Loop'];
  const crouchNames = [
    'BAS_CRH_Loop',
    'BAS_CRH_tired_Loop',
    'BAS_CRH_STD',
  ];
  const standFound = findAction(movesDict, standNames);
  const crouchFound = findAction(movesDict, crouchNames);
  if (!standFound) {
    console.error('BLOCKED: missing stand stance action');
    console.error('missing: BAS_STD_Loop');
    console.error('tried:', standNames.join(', '));
    process.exit(2);
  }
  const stand = extractStanceParts(standFound.action, rectTable, UNIT_SCALE);
  let crouch;
  let crouchAction = crouchFound?.name ?? null;
  if (crouchFound) {
    crouch = extractStanceParts(crouchFound.action, rectTable, UNIT_SCALE);
  } else {
    // Fallback: shorten stand legs
    crouch = {
      hurt: stand.hurt.map((h) =>
        h.part === 'leg'
          ? { ...h, h: h.h * 0.55, y: h.y * 0.65 }
          : h.part === 'body'
            ? { ...h, y: h.y * 0.75, h: h.h * 0.85 }
            : { ...h, y: h.y * 0.8 },
      ),
      push: stand.push.map((p) => ({
        ...p,
        y: p.y * 0.65,
        h: p.h * 0.7,
      })),
    };
    crouchAction = '(fallback from stand)';
  }

  // Air: BAS_JUMP_*_AIR — SF6 uses a compact body hurt (often BodyList only),
  // not the standing head/body/leg stack. Share stand yFit so units match.
  const airNames = [
    'BAS_JUMP_N_AIR',
    'BAS_JUMP_F_AIR',
    'BAS_JUMP_B_AIR',
  ];
  const airFound = findAction(movesDict, airNames);
  let air;
  let airAction = airFound?.name ?? null;
  let airPlaceholder = false;
  if (airFound) {
    air = extractStanceParts(airFound.action, rectTable, UNIT_SCALE, {
      yFit: stand.yFit,
    });
  } else {
    air = {
      hurt: stand.hurt.map((h) =>
        h.part === 'leg' ? { ...h, h: h.h * 0.7, y: h.y * 0.9 } : h,
      ),
      push: stand.push.map((p) => ({ ...p })),
    };
    airAction = '(fallback from stand)';
    airPlaceholder = true;
  }

  const yFit = stand.yFit ?? Y_FIT ?? 1;
  const rawTop = stand.rawTop ?? stackTopFromHurt(stand.hurt.map((b) => ({
    y: b.y / (yFit || 1),
    h: b.h / (yFit || 1),
  })));

  // Stand ↔ crouch transition timelines (BAS_STD_CRH / BAS_CRH_STD)
  const stcNames = ['BAS_STD_CRH', 'BAS_STD_CRH_tired'];
  const ctsNames = ['BAS_CRH_STD', 'BAS_CRH_STD_tired'];
  const stcFound = findAction(movesDict, stcNames);
  const ctsFound = findAction(movesDict, ctsNames);
  const transitions = {};
  if (stcFound) {
    const tl = extractStanceTransitionTimeline(
      stcFound.action,
      rectTable,
      UNIT_SCALE,
      yFit,
    );
    transitions.stand_to_crouch = {
      sourceAction: stcFound.name,
      totalFrames: tl.totalFrames,
      hurt: tl.hurt,
      push: tl.push,
      notes: `${tl.segmentCount} DamageCollision segment(s); timed base replaces static stance during to_crouch`,
    };
  } else {
    console.warn(
      'WARN: missing stand_to_crouch action (tried',
      stcNames.join(', '),
      ') — transitions.stand_to_crouch omitted',
    );
  }
  if (ctsFound) {
    const tl = extractStanceTransitionTimeline(
      ctsFound.action,
      rectTable,
      UNIT_SCALE,
      yFit,
    );
    transitions.crouch_to_stand = {
      sourceAction: ctsFound.name,
      totalFrames: tl.totalFrames,
      hurt: tl.hurt,
      push: tl.push,
      notes: `${tl.segmentCount} DamageCollision segment(s); timed base replaces static stance during to_stand`,
    };
  } else {
    console.warn(
      'WARN: missing crouch_to_stand action (tried',
      ctsNames.join(', '),
      ') — transitions.crouch_to_stand omitted',
    );
  }

  const out = {
    characterId: 'ryu',
    unitScale: UNIT_SCALE,
    logicBodyHeight: LOGIC_BODY_HEIGHT,
    yFit,
    mmdkStackTopRaw: stand.rawTop ?? null,
    stances: {
      stand: {
        hurt: stand.hurt,
        push: stand.push,
        sourceAction: standFound.name,
      },
      crouch: {
        hurt: crouch.hurt,
        push: crouch.push,
        sourceAction: crouchAction,
      },
      air: {
        hurt: air.hurt,
        push: air.push,
        sourceAction: airAction,
        ...(airPlaceholder
          ? {
              placeholder: true,
              notes: 'air uses stand base with shortened legs (P10)',
            }
          : {
              notes:
                'BAS_JUMP_*_AIR DamageCollision (typically compact BodyList, not stand 3-stack)',
            }),
      },
    },
    transitions,
    review: {
      status: 'mmdk_converted',
      notes: `stand=${standFound.name}; crouch=${crouchAction}; air=${airAction}; stc=${stcFound?.name ?? 'missing'}; cts=${ctsFound?.name ?? 'missing'}; unitScale=${UNIT_SCALE}; yFit=${yFit.toFixed(4)} (rawTop→${LOGIC_BODY_HEIGHT})`,
    },
  };

  fs.mkdirSync(OUT_SYSTEMS, { recursive: true });
  const outPath = path.join(OUT_SYSTEMS, 'ryu_stance_boxes.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  console.log(
    'stance wrote',
    outPath,
    'standAction',
    standFound.name,
    'stand.hurt',
    stand.hurt.length,
    stand.hurt.map((h) => `${h.part}:r${h.rectId}`).join(','),
    'crouchAction',
    crouchAction,
    'crouch.hurt',
    crouch.hurt.length,
    'stc',
    stcFound?.name ?? 'missing',
    'stc.segs',
    transitions.stand_to_crouch
      ? `${transitions.stand_to_crouch.hurt.length}hurt/${transitions.stand_to_crouch.totalFrames}f`
      : '-',
    'cts',
    ctsFound?.name ?? 'missing',
    'cts.segs',
    transitions.crouch_to_stand
      ? `${transitions.crouch_to_stand.hurt.length}hurt/${transitions.crouch_to_stand.totalFrames}f`
      : '-',
    'yFit',
    yFit.toFixed(4),
    'rawTop',
    stand.rawTop,
    'logicH',
    LOGIC_BODY_HEIGHT,
  );

  const trRows = [];
  for (const role of ['stand_to_crouch', 'crouch_to_stand']) {
    const tr = transitions[role];
    if (!tr) {
      trRows.push(`| ${role} | — | missing | — | — |`);
      continue;
    }
    const segs = new Set(tr.hurt.map((b) => `${b.from}-${b.to}`)).size;
    trRows.push(
      `| ${role} | \`${tr.sourceAction}\` | ${tr.totalFrames} | ${segs} | ${tr.hurt.length} hurt / ${tr.push.length} push |`,
    );
  }

  const md = `# Sourced stance boxes (Ryu)

> Auto-summary from MMDK convert — not raw dump.  
> Generated: ${new Date().toISOString().slice(0, 10)}

| Stance | Source action | Hurt parts | Push count | unitScale |
|--------|---------------|------------|------------|-----------|
| stand | \`${standFound.name}\` | ${stand.hurt.map((h) => h.part).join(', ')} (${stand.hurt.length}) | ${stand.push.length} | ${UNIT_SCALE} |
| crouch | \`${crouchAction}\` | ${crouch.hurt.map((h) => h.part).join(', ')} (${crouch.hurt.length}) | ${crouch.push.length} | ${UNIT_SCALE} |
| air | \`${airAction}\` | ${air.hurt.map((h) => h.part).join(', ') || '—'} (${air.hurt.length}) | ${air.push.length} | ${UNIT_SCALE} |

## Transitions (stand ↔ crouch)

MMDK DamageCollision is **segmented**, not smooth morph (typically ~4f hold source posture, then destination posture for remainder).

| Role | Source action | totalFrames | Segments | Boxes |
|------|---------------|-------------|----------|-------|
${trRows.join('\n')}

Stand geometry (local ADR-002 center/wh):

${stand.hurt.map((h) => `- **${h.part}**: x=${h.x.toFixed(3)} y=${h.y.toFixed(3)} w=${h.w.toFixed(3)} h=${h.h.toFixed(3)} rectId=${h.rectId}`).join('\n')}

Air geometry (same yFit as stand):

${air.hurt.map((h) => `- **${h.part}**: x=${h.x.toFixed(3)} y=${h.y.toFixed(3)} w=${h.w.toFixed(3)} h=${h.h.toFixed(3)} rectId=${h.rectId}`).join('\n')}
`;
  fs.mkdirSync(path.dirname(STANCE_MD), { recursive: true });
  fs.writeFileSync(STANCE_MD, md);

  if (stand.hurt.length < 3) {
    console.error('BLOCKED: stand.hurt.length < 3');
    process.exit(2);
  }
  const parts = new Set(stand.hurt.map((h) => h.part));
  for (const p of ['head', 'body', 'leg']) {
    if (!parts.has(p)) {
      console.error('BLOCKED: missing stance part', p);
      process.exit(2);
    }
  }
  return out;
}

function writeDeferredMd(rows) {
  const lines = [
    '# Deferred / missing moves (box-assembly full v1)',
    '',
    `> Updated ${new Date().toISOString().slice(0, 10)} by convert_ryu_normals.mjs`,
    '',
    '| moveId | status | reason / tried |',
    '|--------|--------|----------------|',
  ];
  for (const r of rows) {
    lines.push(
      `| \`${r.id}\` | ${r.status} | ${String(r.reason || r.actions || '').replace(/\|/g, '/')} |`,
    );
  }
  lines.push('');
  fs.writeFileSync(DEFERRED_MD, lines.join('\n'));
}

function convertCoverage(rectTable, movesDict, hitDt) {
  const coverage = loadJson(COVERAGE_PATH);
  const report = {
    converted: [],
    missing_action: [],
    deferred: [],
    skipped: [],
  };
  const deferredRows = [];

  for (const entry of coverage.moves) {
    const id = entry.id;
    if (entry.deferred) {
      report.deferred.push(id);
      deferredRows.push({
        id,
        status: 'deferred',
        reason: entry.reason || 'deferred in coverage_list',
      });
      continue;
    }
    // Throws: keep existing public JSON if present; optional MMDK skip
    if (entry.group === 'throws') {
      const pub = path.join(OUT_MOVES, `${id}.json`);
      if (fs.existsSync(pub)) {
        report.skipped.push(id + ' (throw existing)');
        continue;
      }
    }

    // Normals map by short key
    const short = id.replace(/^ryu_/, '');
    if (NORMAL_MAP[short]) {
      const map = NORMAL_MAP[short];
      const r = convertOne(
        map.publicId,
        map.actions,
        map.generated,
        short,
        rectTable,
        movesDict,
        hitDt,
      );
      if (r.status === 'converted') {
        report.converted.push(id);
        console.log(
          'wrote',
          id,
          'action',
          r.actionName,
          'hit',
          r.hit,
          'hurt',
          r.hurt,
        );
      } else {
        report.missing_action.push(id);
        deferredRows.push({
          id,
          status: 'missing_action',
          reason: (r.actions || map.actions).join(', '),
        });
        console.warn('missing_action', id, map.actions);
      }
      continue;
    }

    if (SPECIAL_MAP[id]) {
      const map = SPECIAL_MAP[id];
      const r = convertOne(
        id,
        map.actions,
        map.generated,
        id,
        rectTable,
        movesDict,
        hitDt,
      );
      if (r.status === 'converted') {
        report.converted.push(id);
        console.log(
          'wrote',
          id,
          'action',
          r.actionName,
          'hit',
          r.hit,
          'hurt',
          r.hurt,
        );
      } else {
        report.missing_action.push(id);
        deferredRows.push({
          id,
          status: 'missing_action',
          reason: map.actions.join(', '),
        });
        console.warn('missing_action', id, map.actions);
      }
      continue;
    }

    // denjin alias file also as ryu_22_p path not needed — id is ryu_denjin_charge
    report.skipped.push(id + ' (no map)');
    deferredRows.push({
      id,
      status: 'no_map',
      reason: 'not in NORMAL_MAP/SPECIAL_MAP',
    });
  }

  writeDeferredMd(deferredRows);
  const reportPath = path.join(__dirname, 'coverage_report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        ...report,
        counts: {
          converted: report.converted.length,
          missing_action: report.missing_action.length,
          deferred: report.deferred.length,
          skipped: report.skipped.length,
        },
      },
      null,
      2,
    ) + '\n',
  );
  console.log('coverage report', reportPath, {
    converted: report.converted.length,
    missing_action: report.missing_action.length,
    deferred: report.deferred.length,
    skipped: report.skipped.length,
  });
  return report;
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? String(args[onlyIdx + 1] ?? '').toLowerCase() : null;
  const all = args.includes('--all-normals');
  const doStance = args.includes('--stance');
  const doCoverage = args.includes('--coverage') || args.includes('--all');

  if (!existsCore()) {
    console.error(
      'BLOCKED: missing private MMDK JSON\n' +
        `missing: ${PRIVATE}/rects.json and/or moves_dict.json\n` +
        'need_from_human: copy MMDK PlayerData/Ryu into private/mmdk/Ryu/',
    );
    process.exit(checkOnly ? 0 : 2);
  }

  if (checkOnly) {
    console.log('OK: private MMDK files present');
    console.log(privatePaths());
    process.exit(0);
  }

  const paths = privatePaths();
  const rects = loadJson(paths.rects);
  const movesDict = loadJson(paths.moves);
  const hitDt = paths.hit ? loadJson(paths.hit) : null;
  const rectTable = buildRectTable(rects);

  let rectVariants = 0;
  for (const list of rectTable.values()) rectVariants += list.length;
  console.log(
    'rectIds',
    rectTable.size,
    'variants',
    rectVariants,
    'moves',
    Object.keys(movesDict).length,
    'unitScale',
    UNIT_SCALE,
    'logicBodyHeight',
    LOGIC_BODY_HEIGHT,
    'CLAMP_BASE',
    CLAMP_BASE_HURT_TO_TOTAL,
  );

  // Always measure stance yFit before move convert so hit/hurt share vertical frame.
  // Even `--only` must set Y_FIT (otherwise air/normal boxes skip vertical fit).
  if (doStance || doCoverage || all || only) {
    convertStance(rectTable, movesDict);
    console.log('Y_FIT for subsequent moves', Y_FIT);
  }

  if (doCoverage) {
    convertCoverage(rectTable, movesDict, hitDt);
    return;
  }

  if (doStance && !all && !only) {
    return;
  }

  const keys = only
    ? [only]
    : all
      ? Object.keys(NORMAL_MAP)
      : ['5lp'];

  let ok = 0;
  for (const k of keys) {
    const map = NORMAL_MAP[k];
    if (!map) {
      console.warn('skip unknown', k);
      continue;
    }
    const r = convertOne(
      map.publicId,
      map.actions,
      map.generated,
      k,
      rectTable,
      movesDict,
      hitDt,
    );
    if (r.status === 'converted') {
      ok++;
      console.log(
        'wrote',
        path.basename(r.path),
        'action',
        r.actionName,
        'hit',
        r.hit,
        'hurt',
        r.hurt,
        'push',
        r.push,
        'placeLen',
        r.placeLen,
        'fab',
        r.fab,
      );
    } else {
      console.warn('action not in moves_dict', map.actions);
    }
  }
  console.log('done', ok, '/', keys.length);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) main();

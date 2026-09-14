#!/usr/bin/env node
/**
 * Import Smash Ultimate SF6 Ryu SE extracts into work/banks as a synthetic catalog
 * so the sfx-lab acceptance UI can listen + assign slots.
 *
 * Source (preferred): ../private/sfx-eval/smash-sf6-ryu-se/*.wav|ogg
 * Fallback: /tmp/sf6-sfx-eval/extract_ryu
 *
 * Does NOT touch acceptance.json — mark slots in the UI, then npm run export.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureDir, which } from './lib/paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const labRoot = path.resolve(__dirname, '..');
const bankId = 'community_smash_sf6_ryu_se';

/** Smash stream → suggested slot (S/M/L = light/mid/heavy). UI still requires human accept. */
const SAMPLES = [
  { stem: 'hit_punch_l', smash: 'se_ryu_hit_punch_s', hint: 'contact/hit_punch_l' },
  { stem: 'hit_punch_m', smash: 'se_ryu_hit_punch_m', hint: 'contact/hit_punch_m' },
  { stem: 'hit_punch_h', smash: 'se_ryu_hit_punch_l', hint: 'contact/hit_punch_h' },
  { stem: 'hit_kick_l', smash: 'se_ryu_hit_kick_s', hint: 'contact/hit_kick_l' },
  { stem: 'hit_kick_m', smash: 'se_ryu_hit_kick_m', hint: 'contact/hit_kick_m' },
  { stem: 'hit_kick_h', smash: 'se_ryu_hit_kick_l', hint: 'contact/hit_kick_h' },
  { stem: 'swing_punch_l', smash: 'se_ryu_swing_punch_s', hint: 'swing/punch_l' },
  { stem: 'swing_punch_m', smash: 'se_ryu_swing_punch_m', hint: 'swing/punch_m' },
  { stem: 'swing_punch_h', smash: 'se_ryu_swing_punch_l', hint: 'swing/punch_h' },
  { stem: 'swing_kick_l', smash: 'se_ryu_swing_kick_s', hint: 'swing/kick_l' },
  { stem: 'swing_kick_m', smash: 'se_ryu_swing_kick_m', hint: 'swing/kick_m' },
  { stem: 'swing_kick_h', smash: 'se_ryu_swing_kick_l', hint: 'swing/kick_h' },
  { stem: 'block_single', smash: 'se_ryu_guard', hint: 'contact/block_* (single)' },
  { stem: 'block_just', smash: 'se_ryu_guard_just', hint: 'parry-like / just guard' },
  { stem: 'dash_start', smash: 'se_ryu_dash_start', hint: 'loco/dash_fwd?' },
  { stem: 'dash_stop', smash: 'se_ryu_dash_stop', hint: 'loco' },
  { stem: 'dash_turn', smash: 'se_ryu_dash_turn', hint: 'loco' },
  { stem: 'escape_F', smash: 'se_ryu_escape_F', hint: 'loco/dash_fwd?' },
  { stem: 'escape_B', smash: 'se_ryu_escape_B', hint: 'loco/dash_back?' },
  // Walk footsteps (Smash size: ll/l/m/s). Prefer *_m for default accept.
  { stem: 'step_left_ll', smash: 'se_ryu_step_left_ll', hint: 'loco/footstep_left (heavy)' },
  { stem: 'step_left_l', smash: 'se_ryu_step_left_l', hint: 'loco/footstep_left' },
  { stem: 'step_left_m', smash: 'se_ryu_step_left_m', hint: 'loco/footstep_left ★' },
  { stem: 'step_left_s', smash: 'se_ryu_step_left_s', hint: 'loco/footstep_left (soft)' },
  { stem: 'step_right_ll', smash: 'se_ryu_step_right_ll', hint: 'loco/footstep_right (heavy)' },
  { stem: 'step_right_l', smash: 'se_ryu_step_right_l', hint: 'loco/footstep_right' },
  { stem: 'step_right_m', smash: 'se_ryu_step_right_m', hint: 'loco/footstep_right ★' },
  { stem: 'step_right_s', smash: 'se_ryu_step_right_s', hint: 'loco/footstep_right (soft)' },
  { stem: 'jump01', smash: 'se_ryu_jump01', hint: 'loco/jump ★' },
  { stem: 'jump02', smash: 'se_ryu_jump02', hint: 'loco/jump' },
  // Short flick → cloth/air whoosh candidate
  { stem: 'jump03', smash: 'se_ryu_jump03', hint: 'loco/jump_cloth ★' },
  { stem: 'escapeair', smash: 'se_ryu_escapeair', hint: 'loco/jump_cloth' },
  { stem: 'landing01', smash: 'se_ryu_landing01', hint: 'loco/land ★' },
  { stem: 'landing02', smash: 'se_ryu_landing02', hint: 'loco/land' },
  { stem: 'landing03', smash: 'se_ryu_landing03', hint: 'loco/land' },
  { stem: 'squat', smash: 'se_ryu_squat', hint: 'loco (crouch)' },
  { stem: 'rise', smash: 'se_ryu_rise', hint: 'knockdown/wakeup? (weak)' },
];

function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function wavDurationSec(wavPath) {
  const buf = fs.readFileSync(wavPath);
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  // find data chunk
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      const bytesPerSec = sampleRate * channels * (bits / 8);
      return bytesPerSec > 0 ? size / bytesPerSec : null;
    }
    offset += 8 + size;
  }
  return null;
}

function resolveSourceDir() {
  const candidates = [
    path.resolve(labRoot, '../private/sfx-eval/smash-sf6-ryu-se'),
    '/tmp/sf6-sfx-eval/extract_ryu',
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'hit_punch_l.wav'))) return c;
  }
  return null;
}

function main() {
  const srcDir = resolveSourceDir();
  if (!srcDir) {
    console.error(
      'Missing smash extracts. Expected private/sfx-eval/smash-sf6-ryu-se or /tmp/sf6-sfx-eval/extract_ryu',
    );
    process.exit(1);
  }

  const bankDir = path.join(labRoot, 'work', 'banks', bankId);
  const wavDir = path.join(bankDir, 'wav');
  const previewDir = path.join(bankDir, 'preview');
  ensureDir(wavDir);
  ensureDir(previewDir);

  const ffmpeg = which('ffmpeg');
  const entries = [];

  for (const s of SAMPLES) {
    const srcWav = path.join(srcDir, `${s.stem}.wav`);
    const srcOgg = path.join(srcDir, `${s.stem}.ogg`);
    if (!fs.existsSync(srcWav)) {
      console.warn(`skip missing ${s.stem}.wav`);
      continue;
    }
    const wemId = fnv1a32(`smash:${s.smash}`);
    const wavRel = `wav/${wemId}.wav`;
    const previewRel = `preview/${wemId}.ogg`;
    fs.copyFileSync(srcWav, path.join(bankDir, wavRel));

    let oggOk = false;
    if (fs.existsSync(srcOgg)) {
      fs.copyFileSync(srcOgg, path.join(bankDir, previewRel));
      oggOk = true;
    } else if (ffmpeg) {
      const r = spawnSync(
        ffmpeg,
        ['-y', '-i', path.join(bankDir, wavRel), '-c:a', 'libopus', '-b:a', '96k', path.join(bankDir, previewRel)],
        { encoding: 'utf8' },
      );
      oggOk = r.status === 0 && fs.existsSync(path.join(bankDir, previewRel));
    }

    const durationSec = wavDurationSec(path.join(bankDir, wavRel));
    const eventName = s.smash;
    entries.push({
      wemId,
      file: wavRel,
      bytes: fs.statSync(path.join(bankDir, wavRel)).size,
      preview: oggOk ? previewRel : null,
      wav: wavRel,
      convert: { ok: true, wav: true, ogg: oggOk },
      durationSec,
      suggestedSlot: s.hint,
      events: [
        {
          eventId: wemId,
          name: eventName,
          display: eventName,
          switches: [],
        },
      ],
      eventLabel: `${eventName} → ${s.hint}`,
    });
    console.log(`+ ${s.stem} → ${wemId} (${s.hint})`);
  }

  const catalog = {
    bankFile: 'se_ryu_c00.nus3audio (GameBanana mod 411678)',
    bankPath: srcDir,
    sourceRoot: 'community',
    layerHint: 'contact+swing+loco (smash remapped SF6)',
    note:
      'Community Smash Ultimate SF6 Sound Pack · Ryu SE. Smash S/M/L ≈ our L/M/H. Private only — Capcom IP; do not redistribute. Knockdown mostly missing.',
    extractedAt: new Date().toISOString(),
    count: entries.length,
    completeness: {
      embeddedWems: entries.length,
      hircObjects: entries.length,
      ratio: 1,
      likelyIncomplete: false,
    },
    entries,
  };

  fs.writeFileSync(path.join(bankDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
  console.log(`wrote ${bankDir}/catalog.json (${entries.length} entries)`);
  console.log('Open sfx-lab (npm run dev) → select bank community_smash_sf6_ryu_se → assign slots.');
}

main();

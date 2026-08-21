#!/usr/bin/env node
/**
 * Habby Game Share packer (≤200 MiB ZIP).
 *
 * Analysis (2026-08-21): mapped combat anim GLBs embed full skinned mesh
 * (~11 MiB × 131). Runtime only needs AnimationClips bound onto boot mesh
 * (see AnimClipLibrary). Strip mesh/material/skin → ~0.66 MiB/clip.
 *
 * Community pipeline refs (X + GitHub):
 * - donmccurdy/glTF-Transform (resample/prune/dedup/meshopt/draco)
 * - google/draco, zeux/meshoptimizer
 * - Facepunch/RustRelay.Assets (Draco + WebP shipping)
 * - boona13/glb-shrink, iced_coffee_dev gltf-optimizer
 *
 * Usage (from app/): npm run package:habby
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample } from '@gltf-transform/functions';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');
const distRoot = path.join(appRoot, 'dist');
const zipOut = path.join(repoRoot, 'StreetFighter6-habby.zip');
const MAX_ZIP_BYTES = 200 * 1024 * 1024;

const privateRuntime = path.join(repoRoot, 'private/runtime');
const privateAssets = path.join(repoRoot, 'private/assets');
const logicMapPath = path.join(
  appRoot,
  'public/data/clips/ryu_logic_to_glb_map.json',
);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function bytesLabel(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024).toFixed(1)} KiB`;
}

function dirSize(root) {
  let total = 0;
  if (!fs.existsSync(root)) return 0;
  const walk = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) total += fs.statSync(full).size;
    }
  };
  walk(root);
  return total;
}

function collectMappedAnimPaths(mapFile) {
  const raw = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  const paths = new Set();
  for (const m of raw.moves ?? []) {
    if (typeof m.primaryPath === 'string' && m.primaryPath) {
      paths.add(m.primaryPath.replace(/^\/+/, ''));
    }
    for (const c of m.clips ?? []) {
      if (typeof c.path === 'string' && c.path) {
        paths.add(c.path.replace(/^\/+/, ''));
      }
    }
  }
  return [...paths].sort();
}

/** Drop duplicated skinned mesh; keep bone nodes + animation tracks only. */
async function writeStripAnimGlb(src, dest) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  for (const mesh of root.listMeshes()) mesh.dispose();
  for (const mat of root.listMaterials()) mat.dispose();
  for (const tex of root.listTextures()) tex.dispose();
  for (const skin of root.listSkins()) skin.dispose();
  for (const node of root.listNodes()) {
    if (node.getMesh()) node.setMesh(null);
    if (node.getSkin()) node.setSkin(null);
  }
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
  ensureDir(path.dirname(dest));
  await io.write(dest, doc);
}

async function writeOptimizedPng(src, dest) {
  ensureDir(path.dirname(dest));
  const base = path.basename(src);
  const isColor = /color|albedo|final/i.test(base);
  const max = isColor ? 1024 : 512;
  await sharp(src)
    .resize(max, max, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(dest);
}

console.info(`[habby] node time ${new Date().toISOString()}`);
console.info('[habby] vite build…');
const build = spawnSync('npx', ['vite', 'build'], {
  cwd: appRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (build.status !== 0) {
  console.error('[habby] vite build failed');
  process.exit(build.status ?? 1);
}

if (!fs.existsSync(path.join(distRoot, 'index.html'))) {
  console.error('[habby] dist/index.html missing after build');
  process.exit(1);
}

// Drop heavy public mesh fallbacks — shipping uses private-runtime mesh_only.
for (const rel of [
  'models/ryu/ryu_c1.glb',
  'models/ryu/ryu_c1_textured.glb',
]) {
  const p = path.join(distRoot, rel);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.info('[habby] dropped', rel);
  }
}

// --- private-runtime mesh ---
const runtimeDest = path.join(distRoot, 'private-runtime');
const meshOnlySrc = path.join(privateRuntime, 'ryu/ryu_c1_mesh_only.glb');
if (!fs.existsSync(meshOnlySrc)) {
  console.error('[habby] missing', meshOnlySrc);
  process.exit(1);
}
copyFile(meshOnlySrc, path.join(runtimeDest, 'ryu/ryu_c1_mesh_only.glb'));
console.info(
  '[habby] mesh_only',
  bytesLabel(fs.statSync(meshOnlySrc).size),
);

// --- prepared textures (resized PNG, same filenames) ---
const texSrcRoot = path.join(privateRuntime, 'ryu/textures/prepared');
const texDestRoot = path.join(runtimeDest, 'ryu/textures/prepared');
let texCount = 0;
let texBytes = 0;
for (const name of fs.readdirSync(texSrcRoot)) {
  if (!name.toLowerCase().endsWith('.png')) continue;
  const from = path.join(texSrcRoot, name);
  if (!fs.statSync(from).isFile()) continue;
  const to = path.join(texDestRoot, name);
  await writeOptimizedPng(from, to);
  texCount += 1;
  texBytes += fs.statSync(to).size;
}
console.info(`[habby] textures ${texCount} → ${bytesLabel(texBytes)}`);

// --- strip mapped anim glbs ---
const animPaths = collectMappedAnimPaths(logicMapPath);
const animsRoot = path.join(privateAssets, 'ryu/anims');
const animsDestRoot = path.join(distRoot, 'private-assets/ryu/anims');
let animOk = 0;
let animMissing = 0;
let animBytes = 0;
let i = 0;
for (const rel of animPaths) {
  i += 1;
  const src = path.join(animsRoot, rel);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
    animMissing += 1;
    console.warn('[habby] missing anim', rel);
    continue;
  }
  const dest = path.join(animsDestRoot, rel);
  await writeStripAnimGlb(src, dest);
  animOk += 1;
  animBytes += fs.statSync(dest).size;
  if (i % 20 === 0 || i === animPaths.length) {
    console.info(
      `[habby] anims ${i}/${animPaths.length} stripped… (${bytesLabel(animBytes)})`,
    );
  }
}
console.info(
  `[habby] anims ${animOk}/${animPaths.length} stripped (${bytesLabel(animBytes)}); missing=${animMissing}`,
);

const distBytes = dirSize(distRoot);
console.info(`[habby] dist total ~${bytesLabel(distBytes)}`);

if (fs.existsSync(zipOut)) fs.unlinkSync(zipOut);
console.info('[habby] zipping →', zipOut);
const zip = spawnSync(
  'zip',
  [
    '-r',
    '-q',
    '-9',
    zipOut,
    '.',
    '-x',
    '*.DS_Store',
    '*_preview*',
    '*_work*',
  ],
  { cwd: distRoot, stdio: 'inherit' },
);
if (zip.status !== 0) {
  console.error('[habby] zip failed');
  process.exit(zip.status ?? 1);
}

const zipStat = fs.statSync(zipOut);
console.info(`[habby] done: ${zipOut} (${bytesLabel(zipStat.size)})`);

const list = spawnSync('unzip', ['-l', zipOut], { encoding: 'utf8' });
const listing = list.stdout ?? '';
const simple = [
  ['index.html at root', listing.includes('index.html')],
  [
    'private-runtime mesh',
    listing.includes('private-runtime/ryu/ryu_c1_mesh_only.glb'),
  ],
  [
    'prepared textures',
    listing.includes('private-runtime/ryu/textures/prepared/'),
  ],
  ['private-assets anims', listing.includes('private-assets/ryu/anims/')],
  [
    'no heavy public ryu glb',
    !listing.includes('models/ryu/ryu_c1.glb') &&
      !listing.includes('models/ryu/ryu_c1_textured.glb'),
  ],
  [
    `zip ≤ 200 MiB (${bytesLabel(zipStat.size)})`,
    zipStat.size <= MAX_ZIP_BYTES,
  ],
];
for (const [label, ok] of simple) {
  console.info(`[habby] check ${label}: ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) process.exitCode = 1;
}

if (zipStat.size > MAX_ZIP_BYTES) {
  console.error(
    `[habby] over budget by ${bytesLabel(zipStat.size - MAX_ZIP_BYTES)}`,
  );
}

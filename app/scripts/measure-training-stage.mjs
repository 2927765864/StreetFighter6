/**
 * S0: measure unscaled training-stage glb AABB from POSITION accessor min/max.
 * Does not call StageView.load / targetWidth. No texture decode (Node has no `self`).
 * glTF spec: POSITION accessors MUST include min/max.
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultGlb = resolve(
  here,
  '../../private/interim/SF6 Training Stage/SF6 Training Stage.glb',
);
const glbPath = process.argv[2] ? resolve(process.argv[2]) : defaultGlb;

const buf = await readFile(glbPath);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const magic = dv.getUint32(0, true);
if (magic !== 0x46546c67) {
  throw new Error(`not a glb: ${glbPath}`);
}
let off = 12;
let json = null;
while (off + 8 <= buf.length) {
  const len = dv.getUint32(off, true);
  const type = dv.getUint32(off + 4, true);
  const start = off + 8;
  const chunk = buf.subarray(start, start + len);
  off = start + len;
  if (type === 0x4e4f534a) {
    json = JSON.parse(new TextDecoder().decode(chunk));
  }
}
if (!json) throw new Error('glb missing JSON chunk');

const posIds = new Set();
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    const id = prim.attributes?.POSITION;
    if (typeof id === 'number') posIds.add(id);
  }
}
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
let used = 0;
for (const id of posIds) {
  const acc = json.accessors?.[id];
  if (!acc?.min || !acc?.max) {
    throw new Error(`POSITION accessor ${id} missing min/max`);
  }
  used += 1;
  for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i], acc.min[i]);
    max[i] = Math.max(max[i], acc.max[i]);
  }
}

const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
const out = {
  path: glbPath,
  accessorCount: used,
  preScaleMin: min,
  preScaleMax: max,
  preScaleSize: size,
  review: 'unreviewed',
};
console.log(JSON.stringify(out, null, 2));

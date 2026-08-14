/**
 * Fix hand/glove stretch: community RE meshes often put leftover skin weight on Root.
 * When the hand moves, Root-weighted verts lag → ribbon/twist on wraps and fingers.
 *
 * Transfer Root influence onto a Hand/ForeArm bone (prefer one already on the vertex),
 * then renormalize the 4 weights.
 */
import * as THREE from 'three/webgpu';

function isHandLikeBone(name: string): boolean {
  return (
    /Hand|ForeArm|Wrist|Thumb|Index|Middle|Pinky/i.test(name) ||
    /_(Ring)[0-9]/i.test(name) // L_Ring1 finger, not mesh "Ring"
  );
}

/**
 * @returns number of vertices adjusted
 */
export function fixMeshRootWeightsOnHands(mesh: THREE.SkinnedMesh): number {
  if (!mesh.skeleton || !mesh.geometry) return 0;
  const si = mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute | null;
  const sw = mesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute | null;
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | null;
  if (!si || !sw || !pos) return 0;

  const bones = mesh.skeleton.bones;
  const rootIdx = bones.findIndex(
    (b) => b.name === 'Root' || b.name === 'root' || b.name === 'ROOT',
  );
  if (rootIdx < 0) return 0;

  const lHand = bones.findIndex((b) => b.name === 'L_Hand');
  const rHand = bones.findIndex((b) => b.name === 'R_Hand');

  let fixed = 0;

  for (let i = 0; i < si.count; i++) {
    const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
    const wgt = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];

    let rootSlot = -1;
    for (let j = 0; j < 4; j++) {
      if (idx[j] === rootIdx && wgt[j]! > 1e-4) {
        rootSlot = j;
        break;
      }
    }
    if (rootSlot < 0) continue;

    const rootW = wgt[rootSlot]!;

    // 1) Prefer hand-like bone already on this vertex
    let destSlot = -1;
    let destW = -1;
    for (let j = 0; j < 4; j++) {
      if (j === rootSlot) continue;
      const name = bones[idx[j]!]?.name ?? '';
      if (!isHandLikeBone(name)) continue;
      if (wgt[j]! > destW) {
        destW = wgt[j]!;
        destSlot = j;
      }
    }

    // 2) Else pick L/R_Hand by bind-pose X
    if (destSlot < 0) {
      const x = pos.getX(i);
      const targetBone = x >= 0 ? (rHand >= 0 ? rHand : lHand) : lHand >= 0 ? lHand : rHand;
      if (targetBone < 0) continue;

      // If target already in the 4, add there; else replace root slot index
      let existing = -1;
      for (let j = 0; j < 4; j++) {
        if (idx[j] === targetBone) existing = j;
      }
      if (existing >= 0) {
        destSlot = existing;
      } else {
        idx[rootSlot] = targetBone;
        wgt[rootSlot] = 0;
        destSlot = rootSlot;
      }
    }

    wgt[destSlot]! += rootW;
    wgt[rootSlot] = 0;
    // collapse empty root slot onto dest index (keep 4 slots valid)
    idx[rootSlot] = idx[destSlot]!;

    let sum = wgt[0]! + wgt[1]! + wgt[2]! + wgt[3]!;
    if (sum < 1e-6) continue;
    for (let j = 0; j < 4; j++) wgt[j]! /= sum;

    si.setXYZW(i, idx[0]!, idx[1]!, idx[2]!, idx[3]!);
    sw.setXYZW(i, wgt[0]!, wgt[1]!, wgt[2]!, wgt[3]!);
    fixed++;
  }

  if (fixed > 0) {
    si.needsUpdate = true;
    sw.needsUpdate = true;
  }
  return fixed;
}

/** Gloves + body (hands share mesh with Root weight leaks). */
export function fixRyuHandSkinWeights(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    const n = sm.name.toLowerCase();
    if (
      n.includes('costume03') ||
      n.includes('glove') ||
      n.includes('body00') ||
      n.includes('esf_body')
    ) {
      total += fixMeshRootWeightsOnHands(sm);
    }
  });
  if (total > 0) {
    console.info(`[ryu-skin] transferred Root weights off hands/gloves verts=${total}`);
  }
  return total;
}

import * as THREE from 'three/webgpu';

/**
 * SF6 training-stage "Lines" overlay is a BLEND tape (floor/ceiling/walls)
 * ~10cm wide along the room center. Camera sits at +Z outside the near wall,
 * so the +Z wall tape is between the lens and the fighters and composites
 * over characters / VFX (transparent pass, same X as the back-wall stripe).
 */

export function isStageLineOverlayName(name: string): boolean {
  const n = name.toLowerCase();
  if (n.includes('line') && (n.includes('stage') || n.includes('lambert'))) {
    return true;
  }
  // glTF mesh id when the node title is not copied onto the Mesh.
  return n.includes('lambert2');
}

type Vec3 = { x: number; y: number; z: number };

function triNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const x = aby * acz - abz * acy;
  const y = abz * acx - abx * acz;
  const z = abx * acy - aby * acx;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

function centroid(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return {
    x: (a.x + b.x + c.x) / 3,
    y: (a.y + b.y + c.y) / 3,
    z: (a.z + b.z + c.z) / 3,
  };
}

function readVert(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  i: number,
): Vec3 {
  return { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) };
}

/**
 * +Z wall tape sits on the near wall (centroid z > gate) and is vertical
 * (|n.z| large). Winding is ignored — glTF vs three can flip the sign.
 */
export function isCameraFacingWallTri(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  zGate: number,
): boolean {
  const n = triNormal(a, b, c);
  const p = centroid(a, b, c);
  return Math.abs(n.z) > 0.5 && p.z > zGate;
}

/**
 * Drop +Z wall triangles from the line overlay. Returns remaining tri count.
 */
export function dropCameraFacingWallTris(
  geometry: THREE.BufferGeometry,
  zGate = 1,
): number {
  const pos = geometry.getAttribute('position');
  if (!pos) return 0;

  const index = geometry.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  const keep: number[] = [];

  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const a = readVert(pos, i0);
    const b = readVert(pos, i1);
    const c = readVert(pos, i2);
    if (isCameraFacingWallTri(a, b, c, zGate)) continue;
    keep.push(i0, i1, i2);
  }

  geometry.setIndex(keep);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return keep.length / 3;
}

function prepareLineMaterial(mat: THREE.Material): void {
  const m = mat as THREE.MeshStandardMaterial;
  m.transparent = false;
  m.opacity = 1;
  m.alphaTest = 0.35;
  m.depthWrite = true;
  m.depthTest = true;
  m.side = THREE.FrontSide;
  m.needsUpdate = true;
}

/** Geometry + material: cutout decal, no near-wall tape, no shadow stripe. */
export function prepareStageLineOverlay(root: THREE.Object3D): number {
  let meshes = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!isStageLineOverlayName(mesh.name)) return;
    meshes++;
    dropCameraFacingWallTris(mesh.geometry);
    mesh.castShadow = false;
    mesh.renderOrder = -1;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) prepareLineMaterial(mat);
  });
  return meshes;
}

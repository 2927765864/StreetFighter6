/**
 * Training-stage GLB is already ~40 triangles (textured boxes).
 * Draw policy: receive shadows, never cast (fighters own the shadow pass).
 */
import type * as THREE from 'three/webgpu';
import { isStageLineOverlayName } from './stageLineOverlay';

export function countGeometryTriangles(geometry: {
  index: { count: number } | null;
  getAttribute: (name: string) => { count: number } | undefined;
}): number {
  const index = geometry.index;
  if (index) return index.count / 3;
  const pos = geometry.getAttribute('position');
  return pos ? pos.count / 3 : 0;
}

export function countObjectTriangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (mesh.visible === false) return;
    n += countGeometryTriangles(mesh.geometry);
  });
  return n;
}

/** Floor/walls receive; nothing on the stage casts (cuts a useless shadow bake). */
export function applyStageDrawPolicy(root: THREE.Object3D): {
  meshes: number;
  triangles: number;
} {
  let meshes = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes += 1;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    if (isStageLineOverlayName(mesh.name)) {
      mesh.castShadow = false;
    }
  });
  return { meshes, triangles: countObjectTriangles(root) };
}

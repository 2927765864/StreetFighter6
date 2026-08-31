import * as THREE from 'three/webgpu';
import { computeSeedOrientation } from './seedOrientation';
import type { VolumeSmokeParams } from '../hitVfxTypes';

const _hitOS = new THREE.Vector3(0, 1, 0);
const _qSeed = new THREE.Quaternion();
const _qWorld = new THREE.Quaternion();
const _yUp = new THREE.Vector3(0, 1, 0);

/** Build wireframe preview geometry for the chosen seed shape (CircleSmokeVFX parity). */
export function createSeedShapeGeometry(params: VolumeSmokeParams): THREE.BufferGeometry {
  const shape = params.seedShape || 'sphere';
  const r = Math.max(params.hitRadius || 0.36, 0.05);
  const thick = Math.max((params.shapeThickness ?? 0.28) * r, 0.02);
  const ringPeak = Math.max((params.ringRadiusRatio ?? 0.65) * r, 0.02);
  const ringTube = Math.max((params.ringWidth ?? 0.22) * r, 0.015);
  const colH = Math.max((params.columnHeight ?? 1.4) * r * 2, 0.08);

  if (shape === 'disk') {
    return new THREE.CylinderGeometry(r, r, thick * 2, 28, 1);
  }
  if (shape === 'ring') {
    // Torus lies in XY (axis +Z); rotate so local +Y is the seed axis.
    const geo = new THREE.TorusGeometry(ringPeak, ringTube, 12, 36);
    geo.rotateX(Math.PI / 2);
    return geo;
  }
  if (shape === 'column') {
    return new THREE.CylinderGeometry(r, r, colH, 24, 1);
  }
  return new THREE.SphereGeometry(r, 20, 14);
}

export function seedShapeGizmoKind(params: VolumeSmokeParams): string {
  const shape = params.seedShape || 'sphere';
  const r = Math.max(params.hitRadius || 0.36, 0.05);
  const thick = Math.max((params.shapeThickness ?? 0.28) * r, 0.02);
  const ringPeak = Math.max((params.ringRadiusRatio ?? 0.65) * r, 0.02);
  const ringTube = Math.max((params.ringWidth ?? 0.22) * r, 0.015);
  const colH = Math.max((params.columnHeight ?? 1.4) * r * 2, 0.08);
  const rot = params.seedRotation ?? { x: 0, y: 0, z: 0 };
  const off = params.seedOffset ?? { x: 0, y: 0, z: 0 };
  return `${shape}:${r.toFixed(3)}:${thick.toFixed(3)}:${ringPeak.toFixed(3)}:${ringTube.toFixed(3)}:${colH.toFixed(3)}:${rot.x}:${rot.y}:${rot.z}:${off.x}:${off.y}:${off.z}`;
}

/**
 * Replace seed-group children with the correct wire mesh and orient it.
 * @param hitDirOS hit direction in the volume/object frame (default +Y)
 */
export function rebuildSeedShapeGizmo(
  seedGroup: THREE.Group,
  params: VolumeSmokeParams,
  origin: THREE.Vector3,
  hitDirOS?: THREE.Vector3,
  parentWorldQuat?: THREE.Quaternion,
): string {
  while (seedGroup.children.length) {
    const c = seedGroup.children[0]!;
    seedGroup.remove(c);
    const mesh = c as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else (mat as THREE.Material | undefined)?.dispose?.();
  }

  if (!params.showSeedShape) {
    seedGroup.visible = false;
    return '';
  }

  const geo = createSeedShapeGeometry(params);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffb24a,
    wireframe: true,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 998;
  seedGroup.add(mesh);

  _hitOS.copy(hitDirOS && hitDirOS.lengthSq() > 1e-8 ? hitDirOS : _yUp).normalize();
  computeSeedOrientation(_hitOS, params.seedRotation, _qSeed);
  if (parentWorldQuat) {
    _qWorld.copy(parentWorldQuat).multiply(_qSeed);
  } else {
    _qWorld.copy(_qSeed);
  }

  seedGroup.position.copy(origin);
  seedGroup.quaternion.copy(_qWorld);
  seedGroup.visible = true;
  return seedShapeGizmoKind(params);
}

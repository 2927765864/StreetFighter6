import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { computeSeedOrientation } from './seedOrientation';
import { buildStrandSet, sampleStrandPolyline, shapeLocalExtents } from './strandSeed';
import type { VolumeSmokeParams } from '../hitVfxTypes';

const _hitOS = new THREE.Vector3(0, 1, 0);
const _qSeed = new THREE.Quaternion();
const _qWorld = new THREE.Quaternion();
const _yUp = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _armDir = new THREE.Vector3();
const _armQuat = new THREE.Quaternion();

/** One arm of ">" : tip at origin, extends along `dir` (unit) for `len`. */
function createArrowArmGeometry(
  len: number,
  axialHalf: number,
  planarHalf: number,
  dirX: number,
  dirY: number,
  dirZ: number,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(len, axialHalf * 2, planarHalf * 2);
  geo.translate(len * 0.5, 0, 0);
  _armDir.set(dirX, dirY, dirZ).normalize();
  _armQuat.setFromUnitVectors(_xAxis, _armDir);
  geo.applyQuaternion(_armQuat);
  return geo;
}

function gizmoWorldExtents(params: VolumeSmokeParams) {
  const r = Math.max(params.hitRadius || 0.36, 0.05);
  const ext = shapeLocalExtents(params);
  return {
    r,
    thick: Math.max(ext.thick * r, 0.02),
    ringPeak: Math.max(ext.ringPeak * r, 0.02),
    ringTube: Math.max(ext.ringTube * r, 0.015),
    colH: Math.max(ext.columnHalf * r * 2, 0.08),
    arrowLen: Math.max(ext.arrowLen * r, 0.05),
  };
}

/** Build wireframe preview geometry for the chosen seed shape (CircleSmokeVFX parity). */
export function createSeedShapeGeometry(params: VolumeSmokeParams): THREE.BufferGeometry {
  const shape = params.seedShape || 'sphere';
  const { r, thick, ringPeak, ringTube, colH, arrowLen } = gizmoWorldExtents(params);
  const arcDeg = Math.min(360, Math.max(1, params.arcAngle ?? 140));
  const arcRad = (arcDeg * Math.PI) / 180;
  const arrowDeg = Math.min(179, Math.max(5, params.arrowAngle ?? 70));

  if (shape === 'disk') {
    return new THREE.CylinderGeometry(r, r, thick * 2, 28, 1);
  }
  if (shape === 'ring') {
    // Torus lies in XY (axis +Z); rotate so local +Y is the seed axis.
    const geo = new THREE.TorusGeometry(ringPeak, ringTube, 12, 36);
    geo.rotateX(Math.PI / 2);
    return geo;
  }
  if (shape === 'arc') {
    // Partial torus in XZ (axis +Y). TorusGeometry sweeps u=0..arc from +X toward +Z;
    // rotateY(+arc/2) recenters the midpoint on +X so opening faces −X (")" / shader tangent).
    const segs = Math.max(8, Math.round(36 * (arcDeg / 360)));
    const geo = new THREE.TorusGeometry(ringPeak, ringTube, 12, segs, arcRad);
    geo.rotateX(Math.PI / 2);
    geo.rotateY(arcRad * 0.5);
    return geo;
  }
  if (shape === 'arrow') {
    // Tip at origin pointing +X; arms open toward −X (matches shader tangent/bitangent).
    const half = (arrowDeg * 0.5 * Math.PI) / 180;
    const c = Math.cos(half);
    const s = Math.sin(half);
    const upper = createArrowArmGeometry(arrowLen, thick, ringTube, -c, 0, s);
    const lower = createArrowArmGeometry(arrowLen, thick, ringTube, -c, 0, -s);
    const merged = mergeGeometries([upper, lower], false);
    upper.dispose();
    lower.dispose();
    return merged ?? new THREE.BoxGeometry(arrowLen, thick * 2, ringTube * 2);
  }
  if (shape === 'column') {
    return new THREE.CylinderGeometry(r, r, colH, 24, 1);
  }
  return new THREE.SphereGeometry(r, 20, 14);
}

export function seedShapeGizmoKind(params: VolumeSmokeParams): string {
  const shape = params.seedShape || 'sphere';
  const { r, thick, ringPeak, ringTube, colH } = gizmoWorldExtents(params);
  const arcDeg = Math.min(360, Math.max(1, params.arcAngle ?? 140));
  const arrowDeg = Math.min(179, Math.max(5, params.arrowAngle ?? 70));
  const arrowLen = Math.max(0.05, params.arrowLength ?? 1);
  const rot = params.seedRotation ?? { x: 0, y: 0, z: 0 };
  const off = params.seedOffset ?? { x: 0, y: 0, z: 0 };
  const strandKey = params.strandMode
    ? `S:${params.strandCount}:${params.strandLength}:${params.strandThickness}:${params.strandSpacing}:${params.strandTwistDeg}:${params.strandAngleJitterDeg}:${params.strandBend}:${params.strandEdgeSoftness}:${params.strandGapFill}:${params.strandRandomAmount}:${params.spawnSeed}`
    : 'S:off';
  return `${shape}:${r.toFixed(3)}:${thick.toFixed(3)}:${ringPeak.toFixed(3)}:${ringTube.toFixed(3)}:${colH.toFixed(3)}:${arcDeg.toFixed(1)}:${arrowDeg.toFixed(1)}:${arrowLen.toFixed(3)}:${rot.x}:${rot.y}:${rot.z}:${off.x}:${off.y}:${off.z}:${strandKey}`;
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

  if (params.strandMode) {
    addStrandPreviewLines(seedGroup, params);
  }

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

/** Simple polyline preview of strand ropes in seed-local meters (+Y = axis). */
function addStrandPreviewLines(
  seedGroup: THREE.Group,
  params: VolumeSmokeParams,
): void {
  const r = Math.max(params.hitRadius || 0.36, 0.05);
  const strands = buildStrandSet({
    params: {
      strandMode: true,
      strandCount: params.strandCount,
      strandLength: params.strandLength,
      strandThickness: params.strandThickness,
      strandSpacing: params.strandSpacing,
      strandTwistDeg: params.strandTwistDeg,
      strandAngleJitterDeg: params.strandAngleJitterDeg,
      strandBend: params.strandBend,
      strandEdgeSoftness: params.strandEdgeSoftness,
      strandGapFill: params.strandGapFill,
      strandRandomAmount: params.strandRandomAmount,
      seedShape: params.seedShape,
      shapeThickness: params.shapeThickness,
      ringRadiusRatio: params.ringRadiusRatio,
      ringWidth: params.ringWidth,
      arcAngle: params.arcAngle,
      arrowAngle: params.arrowAngle,
      arrowLength: params.arrowLength,
      columnHeight: params.columnHeight,
    },
    spawnSeed: params.spawnSeed >>> 0,
    centerUVW: { x: 0, y: 0, z: 0 },
    hitRadiusUVW: r,
    axis: { x: 0, y: 1, z: 0 },
    tangent: { x: 1, y: 0, z: 0 },
  });
  for (const s of strands) {
    const pts = sampleStrandPolyline(s, 8).map(
      (p) => new THREE.Vector3(p.x, p.y, p.z),
    );
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x7ec8ff,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 999;
    seedGroup.add(line);
  }
}

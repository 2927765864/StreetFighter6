import * as THREE from 'three/webgpu';

const _yUp = new THREE.Vector3(0, 1, 0);
const _hit = new THREE.Vector3();
const _qHit = new THREE.Quaternion();
const _qUser = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'XYZ');

/**
 * Hit-aligned frame + extra artist Euler (degrees, XYZ).
 * Local +Y becomes the seed shape axis (disk/ring thickness, column length).
 */
export function computeSeedOrientation(
  hitDirOS: THREE.Vector3,
  seedRotationDeg: { x?: number; y?: number; z?: number } | null | undefined,
  outQuat: THREE.Quaternion,
  outAxis?: THREE.Vector3,
): void {
  _hit.copy(hitDirOS);
  if (_hit.lengthSq() < 1e-8) _hit.copy(_yUp);
  else _hit.normalize();

  _qHit.setFromUnitVectors(_yUp, _hit);
  _euler.set(
    THREE.MathUtils.degToRad(seedRotationDeg?.x || 0),
    THREE.MathUtils.degToRad(seedRotationDeg?.y || 0),
    THREE.MathUtils.degToRad(seedRotationDeg?.z || 0),
    'XYZ',
  );
  _qUser.setFromEuler(_euler);
  outQuat.copy(_qHit).multiply(_qUser);

  if (outAxis) outAxis.copy(_yUp).applyQuaternion(outQuat).normalize();
}

/** Which seed-shape panel rows apply for a given shape id. */
export const SEED_SHAPE_PARAM_KEYS = Object.freeze({
  sphere: [] as const,
  disk: ['shapeThickness', 'seedRotation'] as const,
  ring: ['shapeThickness', 'ringRadiusRatio', 'ringWidth', 'seedRotation'] as const,
  column: ['columnHeight', 'seedRotation'] as const,
});

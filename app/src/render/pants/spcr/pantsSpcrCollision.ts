/**
 * Capsule / sphere push-out & push-in.
 * Semantics from SPARK-inc/SPCRJointDynamics SPCRJointDynamicsJob.cs
 * Collision.PushoutFromCapsule / PushInFromCapsule (MIT, commit 7ebe63e).
 */
import * as THREE from 'three';

const EPSILON = 1e-8;

export function pushoutFromSphere(
  center: THREE.Vector3,
  radius: number,
  pointRadius: number,
  point: THREE.Vector3,
): boolean {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dz = point.z - center.z;
  const sqr = dx * dx + dy * dy + dz * dz;
  if (sqr <= EPSILON) {
    point.set(center.x, center.y + radius + pointRadius, center.z);
    return true;
  }
  const dist = Math.sqrt(sqr);
  const pushoutDistance = dist - pointRadius;
  if (pushoutDistance < radius) {
    const s = radius / Math.max(pushoutDistance, EPSILON);
    point.set(center.x + dx * s, center.y + dy * s, center.z + dz * s);
    return true;
  }
  return false;
}

/**
 * Capsule: head at `head`, axis vector `direction` with length `height`,
 * radius lerps to radius*radiusTailScale at the tail.
 */
export function pushoutFromCapsule(
  head: THREE.Vector3,
  direction: THREE.Vector3,
  height: number,
  radius: number,
  radiusTailScale: number,
  pointRadius: number,
  point: THREE.Vector3,
): boolean {
  if (height <= EPSILON) {
    return pushoutFromSphere(head, radius, pointRadius, point);
  }
  const len = direction.length();
  if (len <= EPSILON) {
    return pushoutFromSphere(head, radius, pointRadius, point);
  }
  const nx = direction.x / len;
  const ny = direction.y / len;
  const nz = direction.z / len;
  const tx = point.x - head.x;
  const ty = point.y - head.y;
  const tz = point.z - head.z;
  const distanceOnVec = nx * tx + ny * ty + nz * tz;
  if (distanceOnVec <= EPSILON) {
    return pushoutFromSphere(head, radius, pointRadius, point);
  }
  if (distanceOnVec >= height) {
    return pushoutFromSphere(
      new THREE.Vector3(head.x + direction.x, head.y + direction.y, head.z + direction.z),
      radius * radiusTailScale,
      pointRadius,
      point,
    );
  }
  const px = head.x + nx * distanceOnVec;
  const py = head.y + ny * distanceOnVec;
  const pz = head.z + nz * distanceOnVec;
  const ox = point.x - px;
  const oy = point.y - py;
  const oz = point.z - pz;
  const sqrPushoutDistance = ox * ox + oy * oy + oz * oz;
  if (sqrPushoutDistance > EPSILON) {
    const pushoutDistance = Math.sqrt(sqrPushoutDistance) - pointRadius;
    const R =
      radius *
      THREE.MathUtils.lerp(1, radiusTailScale, distanceOnVec / height);
    if (pushoutDistance < R) {
      const s = R / Math.max(pushoutDistance, EPSILON);
      point.set(px + ox * s, py + oy * s, pz + oz * s);
      return true;
    }
  }
  return false;
}

export function pushInFromSphere(
  center: THREE.Vector3,
  radius: number,
  point: THREE.Vector3,
): boolean {
  const dx = center.x - point.x;
  const dy = center.y - point.y;
  const dz = center.z - point.z;
  const sqr = dx * dx + dy * dy + dz * dz;
  if (sqr <= EPSILON) return false;
  if (sqr > radius * radius) {
    const len = Math.sqrt(sqr);
    const s = (len - radius) / len;
    point.x += dx * s;
    point.y += dy * s;
    point.z += dz * s;
    return true;
  }
  return false;
}

/** Pull points that drifted outside back onto the capsule surface (anti-wrap). */
export function pushInFromCapsule(
  head: THREE.Vector3,
  direction: THREE.Vector3,
  height: number,
  radius: number,
  radiusTailScale: number,
  point: THREE.Vector3,
): boolean {
  if (height <= EPSILON) {
    return pushInFromSphere(head, radius, point);
  }
  const len = direction.length();
  if (len <= EPSILON) {
    return pushInFromSphere(head, radius, point);
  }
  const nx = direction.x / len;
  const ny = direction.y / len;
  const nz = direction.z / len;
  const tx = point.x - head.x;
  const ty = point.y - head.y;
  const tz = point.z - head.z;
  const distanceOnVec = nx * tx + ny * ty + nz * tz;
  if (distanceOnVec <= EPSILON) {
    return pushInFromSphere(head, radius, point);
  }
  if (distanceOnVec >= height) {
    return pushInFromSphere(
      new THREE.Vector3(head.x + direction.x, head.y + direction.y, head.z + direction.z),
      radius * radiusTailScale,
      point,
    );
  }
  const px = head.x + nx * distanceOnVec;
  const py = head.y + ny * distanceOnVec;
  const pz = head.z + nz * distanceOnVec;
  const ox = px - point.x;
  const oy = py - point.y;
  const oz = pz - point.z;
  const sqrPullInDistance = ox * ox + oy * oy + oz * oz;
  if (sqrPullInDistance > EPSILON) {
    const R =
      radius *
      THREE.MathUtils.lerp(1, radiusTailScale, distanceOnVec / height);
    if (sqrPullInDistance > R * R) {
      const pullInDistance = Math.sqrt(sqrPullInDistance);
      const s = (pullInDistance - R) / pullInDistance;
      point.x += ox * s;
      point.y += oy * s;
      point.z += oz * s;
      return true;
    }
  }
  return false;
}

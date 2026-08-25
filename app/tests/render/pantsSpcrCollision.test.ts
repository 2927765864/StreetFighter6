import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  pushInFromCapsule,
  pushoutFromCapsule,
  pushoutFromSphere,
} from '../../src/render/pants/spcr/pantsSpcrCollision';

describe('pantsSpcrCollision', () => {
  it('pushoutFromSphere moves interior points outside radius', () => {
    const center = new THREE.Vector3(0, 0, 0);
    const point = new THREE.Vector3(0.01, 0, 0);
    const hit = pushoutFromSphere(center, 0.1, 0, point);
    expect(hit).toBe(true);
    expect(point.length()).toBeGreaterThanOrEqual(0.1 - 1e-6);
  });

  it('pushoutFromCapsule pushes from mid-axis inward', () => {
    const head = new THREE.Vector3(0, 0, 0);
    const direction = new THREE.Vector3(0, 1, 0);
    const point = new THREE.Vector3(0.01, 0.5, 0);
    const hit = pushoutFromCapsule(head, direction, 1, 0.1, 1, 0, point);
    expect(hit).toBe(true);
    const radial = Math.hypot(point.x, point.z);
    expect(radial).toBeGreaterThanOrEqual(0.1 - 1e-6);
    expect(point.y).toBeCloseTo(0.5, 4);
  });

  it('pushInFromCapsule pulls far points onto surface', () => {
    const head = new THREE.Vector3(0, 0, 0);
    const direction = new THREE.Vector3(0, 1, 0);
    const point = new THREE.Vector3(0.5, 0.5, 0);
    const hit = pushInFromCapsule(head, direction, 1, 0.1, 1, point);
    expect(hit).toBe(true);
    const radial = Math.hypot(point.x, point.z);
    expect(radial).toBeCloseTo(0.1, 4);
  });
});

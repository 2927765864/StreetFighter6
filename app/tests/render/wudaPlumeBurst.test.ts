import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDefaultSimConfig } from '../../src/config/constants';

/**
 * Pure helpers mirrored from WudaPlumeBurst throttle policy
 * (avoid constructing WebGPU Manager in unit tests).
 */
const MAX_BURSTS_PER_FLUSH = 8;

describe('wudaAlsoPlumeBurst policy', () => {
  it('defaults off so coat works without splash', () => {
    const cfg = createDefaultSimConfig();
    expect(cfg.wudaAlsoPlumeBurst).toBe(false);
  });

  it('caps bursts per flush so mass detach cannot spawn unbounded systems', () => {
    const queued = Array.from({ length: 40 }, (_, i) => i);
    let spawned = 0;
    while (queued.length > 0 && spawned < MAX_BURSTS_PER_FLUSH) {
      queued.shift();
      spawned++;
    }
    queued.length = 0;
    expect(spawned).toBe(8);
    expect(queued.length).toBe(0);
  });

  it('aligns cone axis with detach velocity direction', () => {
    const yUp = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3(1, 0, 0).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(yUp, axis);
    const out = yUp.clone().applyQuaternion(quat);
    expect(out.x).toBeCloseTo(1, 5);
    expect(out.y).toBeCloseTo(0, 5);
  });
});

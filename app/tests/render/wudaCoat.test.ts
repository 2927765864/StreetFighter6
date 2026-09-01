import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDefaultSimConfig } from '../../src/config/constants';
import {
  bakeWudaSurfaceSamples,
  interpolateBindPosition,
} from '../../src/render/wudaParticle/WudaSurfaceBake';
import {
  clampWudaDeltaSec,
  computeSurfaceVelocity,
  freeLifetimeFromSpeed,
  integrateFreeParticle,
  isAttackActiveHitFrame,
  shouldDetach,
  shouldDetachWithLock,
} from '../../src/render/wudaParticle/wudaCoatMath';

describe('wuda CONFIG defaults', () => {
  it('includes all wuda* keys from execution plan §7', () => {
    const cfg = createDefaultSimConfig();
    const keys = [
      'wudaEnabled',
      'wudaParticleCount',
      'wudaSeed',
      'wudaDetachSpeed',
      'wudaDetachAccel',
      'wudaDetachSpeedDrop',
      'wudaDetachSpeedDropMinPrev',
      'wudaInheritVelScale',
      'wudaDetachJitter',
      'wudaSpeedToLife',
      'wudaFreeLifetime',
      'wudaGravityPower',
      'wudaGravityDirX',
      'wudaGravityDirY',
      'wudaGravityDirZ',
      'wudaDrag',
      'wudaSpeedLimit',
      'wudaMaxDeltaSec',
      'wudaStuckSize',
      'wudaFreeSize',
      'wudaStuckOpacity',
      'wudaFreeOpacity',
      'wudaStuckColorR',
      'wudaStuckColorG',
      'wudaStuckColorB',
      'wudaFreeColorR',
      'wudaFreeColorG',
      'wudaFreeColorB',
      'wudaBlendAdditive',
      'wudaRespawnStuck',
      'wudaShowDebug',
      'wudaAlsoPlumeBurst',
      'wudaDetachOnlyOnActiveHit',
    ] as const;
    for (const k of keys) {
      expect(cfg).toHaveProperty(k);
    }
    expect(cfg.wudaEnabled).toBe(false);
    expect(cfg.wudaDetachOnlyOnActiveHit).toBe(false);
    expect(cfg.wudaParticleCount).toBe(512);
  });
});

describe('bakeWudaSurfaceSamples', () => {
  it('barycentric sums to ~1 and seed is stable', () => {
    const geo = new THREE.PlaneGeometry(2, 2, 1, 1);
    const a = bakeWudaSurfaceSamples(geo, 32, 42);
    const b = bakeWudaSurfaceSamples(geo, 32, 42);
    expect(a.samples.length).toBe(32);
    expect(a.totalArea).toBeGreaterThan(0);
    for (let i = 0; i < a.samples.length; i++) {
      const s = a.samples[i]!;
      expect(s.u + s.v + s.w).toBeCloseTo(1, 5);
      expect(b.samples[i]!.i0).toBe(s.i0);
      expect(b.samples[i]!.u).toBeCloseTo(s.u, 8);
      const pos = new THREE.Vector3();
      interpolateBindPosition(geo, s, pos);
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Math.abs(pos.x)).toBeLessThanOrEqual(1.01);
      expect(Math.abs(pos.y)).toBeLessThanOrEqual(1.01);
    }
  });
});

describe('wudaCoatMath', () => {
  it('clamps delta', () => {
    expect(clampWudaDeltaSec(1, 0.05, 1)).toBeCloseTo(0.05);
    expect(clampWudaDeltaSec(0.01, 0.05, 1)).toBeCloseTo(0.01);
  });

  it('velocity = (pos-prev)/dt', () => {
    const pos = new THREE.Vector3(1, 0, 0);
    const prev = new THREE.Vector3(0, 0, 0);
    const out = new THREE.Vector3();
    computeSurfaceVelocity(pos, prev, 0.5, out);
    expect(out.x).toBeCloseTo(2);
  });

  it('sudden-stop detach triggers', () => {
    expect(
      shouldDetach({
        speed: 0.5,
        prevSpeed: 5,
        accelMag: 1,
        detachSpeed: 10,
        detachAccel: 200,
        detachSpeedDrop: 3,
        detachSpeedDropMinPrev: 2,
      }),
    ).toBe(true);
  });

  it('idle does not detach', () => {
    expect(
      shouldDetach({
        speed: 0.1,
        prevSpeed: 0.1,
        accelMag: 0,
        detachSpeed: 4,
        detachAccel: 60,
        detachSpeedDrop: 3,
        detachSpeedDropMinPrev: 2,
      }),
    ).toBe(false);
  });

  it('gravity integrate approximates 0.5 g t^2', () => {
    const pos = new THREE.Vector3(0, 0, 0);
    const vel = new THREE.Vector3(0, 0, 0);
    const g = new THREE.Vector3(0, -1, 0);
    const t = 0.5;
    const steps = 50;
    const dt = t / steps;
    for (let i = 0; i < steps; i++) {
      integrateFreeParticle(pos, vel, dt, g, 9.8, 0, 100);
    }
    const expected = -0.5 * 9.8 * t * t;
    expect(pos.y).toBeCloseTo(expected, 0);
  });

  it('drag reduces speed vs no-drag', () => {
    const posA = new THREE.Vector3();
    const velA = new THREE.Vector3(0, 10, 0);
    const posB = new THREE.Vector3();
    const velB = new THREE.Vector3(0, 10, 0);
    const g = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < 20; i++) {
      integrateFreeParticle(posA, velA, 0.016, g, 0, 0, 100);
      integrateFreeParticle(posB, velB, 0.016, g, 0, 5, 100);
    }
    expect(velB.length()).toBeLessThan(velA.length());
  });

  it('speedToLife increases life', () => {
    expect(freeLifetimeFromSpeed(0.6, 5, 0.2)).toBeGreaterThan(0.6);
  });

  it('detach lock blocks even when thresholds would fire', () => {
    const input = {
      speed: 10,
      prevSpeed: 10,
      accelMag: 100,
      detachSpeed: 4,
      detachAccel: 60,
      detachSpeedDrop: 3,
      detachSpeedDropMinPrev: 2,
    };
    expect(shouldDetach(input)).toBe(true);
    expect(shouldDetachWithLock(input, false)).toBe(false);
    expect(shouldDetachWithLock(input, true)).toBe(true);
  });

  it('isAttackActiveHitFrame requires attack phase and hit boxes', () => {
    expect(
      isAttackActiveHitFrame({
        phase: 'idle',
        mover: { currentHitBoxesLocal: () => [{ x: 0 }] },
      }),
    ).toBe(false);
    expect(
      isAttackActiveHitFrame({
        phase: 'attack',
        mover: { currentHitBoxesLocal: () => [] },
      }),
    ).toBe(false);
    expect(
      isAttackActiveHitFrame({
        phase: 'attack',
        mover: { currentHitBoxesLocal: () => [{ x: 0 }] },
      }),
    ).toBe(true);
  });
});

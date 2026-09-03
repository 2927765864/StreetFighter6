import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDefaultSimConfig } from '../../src/config/constants';
import {
  bakeWudaSurfaceSamples,
  bakeWudaSurfaceSamplesAcrossMeshes,
  interpolateBindPosition,
} from '../../src/render/wudaParticle/WudaSurfaceBake';
import {
  clampWudaDeltaSec,
  computeSurfaceVelocity,
  freeLifetimeFromSpeed,
  integrateFreeParticle,
  isAttackActiveHitFrame,
  isHitstunDetachPulse,
  isHitstunFrame,
  resolveWudaAllowDetach,
  shouldDetach,
  shouldDetachWithLock,
} from '../../src/render/wudaParticle/wudaCoatMath';

describe('wuda CONFIG defaults', () => {
  it('includes all wuda* keys from execution plan §7', () => {
    const cfg = createDefaultSimConfig();
    const keys = [
      'wudaEnabled',
      'wudaAttachMode',
      'wudaCoverMode',
      'wudaCoverMeshMinVerts',
      'wudaP1RegionWeightHead',
      'wudaP1RegionWeightTorso',
      'wudaP1RegionWeightLimbRoot',
      'wudaP1RegionWeightLimbTip',
      'wudaP2RegionWeightHead',
      'wudaP2RegionWeightTorso',
      'wudaP2RegionWeightLimbRoot',
      'wudaP2RegionWeightLimbTip',
      'wudaVertexStride',
      'wudaBakeAwaitReadback',
      'wudaShowBakeStats',
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
      'wudaStuckColor',
      'wudaFreeColor',
      'wudaBlendAdditive',
      'wudaRespawnStuck',
      'wudaShowDebug',
      'wudaAlsoPlumeBurst',
      'wudaDetachOnlyOnActiveHit',
      'wudaDetachOnlyOnHitstun',
    ] as const;
    for (const k of keys) {
      expect(cfg).toHaveProperty(k);
    }
    expect(cfg.wudaEnabled).toBe(false);
    expect(cfg.wudaCoverMode).toBe('allMeshes');
    expect(cfg.wudaCoverMeshMinVerts).toBe(256);
    expect(cfg.wudaP1RegionWeightHead).toBeCloseTo(0.1);
    expect(cfg.wudaP1RegionWeightTorso).toBeCloseTo(0.4);
    expect(cfg.wudaP1RegionWeightLimbRoot).toBeCloseTo(0.25);
    expect(cfg.wudaP1RegionWeightLimbTip).toBeCloseTo(0.25);
    expect(cfg.wudaP2RegionWeightHead).toBeCloseTo(0.1);
    expect(cfg.wudaP2RegionWeightTorso).toBeCloseTo(0.4);
    expect(cfg.wudaP2RegionWeightLimbRoot).toBeCloseTo(0.25);
    expect(cfg.wudaP2RegionWeightLimbTip).toBeCloseTo(0.25);
    expect(cfg.wudaStuckColor).toBe(0xa69980);
    expect(cfg.wudaFreeColor).toBe(0xbfb399);
    expect(cfg.wudaDetachOnlyOnActiveHit).toBe(false);
    expect(cfg.wudaDetachOnlyOnHitstun).toBe(false);
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

  it('across meshes distributes by area and tags meshIndex', () => {
    // Unit square area≈1 vs 2x2 square area≈4 → expect ~1:4 ratio
    const small = new THREE.PlaneGeometry(1, 1, 1, 1);
    const large = new THREE.PlaneGeometry(2, 2, 1, 1);
    const baked = bakeWudaSurfaceSamplesAcrossMeshes([small, large], 200, 7);
    expect(baked.samples.length).toBe(200);
    let c0 = 0;
    let c1 = 0;
    for (const s of baked.samples) {
      expect(s.meshIndex === 0 || s.meshIndex === 1).toBe(true);
      if (s.meshIndex === 0) c0++;
      else c1++;
    }
    expect(c1).toBeGreaterThan(c0);
    expect(c1 / Math.max(1, c0)).toBeGreaterThan(2);
    small.dispose();
    large.dispose();
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

  it('isHitstunFrame is phase===hitstun with optional stunTimer', () => {
    expect(isHitstunFrame({ phase: 'hitstun' })).toBe(true);
    expect(isHitstunFrame({ phase: 'hitstun', stunTimer: 3 })).toBe(true);
    expect(isHitstunFrame({ phase: 'hitstun', stunTimer: 0 })).toBe(false);
    expect(isHitstunFrame({ phase: 'blockstun' })).toBe(false);
    expect(isHitstunFrame({ phase: 'knockdown' })).toBe(false);
    expect(isHitstunFrame({ phase: 'idle' })).toBe(false);
  });

  it('isHitstunDetachPulse follows remaining pulse frames', () => {
    expect(isHitstunDetachPulse({ hitstunDetachPulseFrames: 3 })).toBe(true);
    expect(isHitstunDetachPulse({ hitstunDetachPulseFrames: 0 })).toBe(false);
    expect(isHitstunDetachPulse({})).toBe(false);
  });

  it('resolveWudaAllowDetach ORs locks; hitstun lock is entry pulse only', () => {
    const idle = {
      phase: 'idle',
      stunTimer: 0,
      hitstunDetachPulseFrames: 0,
      mover: { currentHitBoxesLocal: () => [] as unknown[] },
    };
    const attackActive = {
      phase: 'attack',
      stunTimer: 0,
      hitstunDetachPulseFrames: 0,
      mover: { currentHitBoxesLocal: () => [{ x: 0 }] },
    };
    const hitstunMid = {
      phase: 'hitstun',
      stunTimer: 8,
      hitstunDetachPulseFrames: 0,
      mover: { currentHitBoxesLocal: () => [] as unknown[] },
    };
    const hitstunPulse = {
      phase: 'hitstun',
      stunTimer: 14,
      hitstunDetachPulseFrames: 3,
      mover: { currentHitBoxesLocal: () => [] as unknown[] },
    };

    const neither = {
      wudaDetachOnlyOnActiveHit: false,
      wudaDetachOnlyOnHitstun: false,
    };
    const attackOnly = {
      wudaDetachOnlyOnActiveHit: true,
      wudaDetachOnlyOnHitstun: false,
    };
    const hitstunOnly = {
      wudaDetachOnlyOnActiveHit: false,
      wudaDetachOnlyOnHitstun: true,
    };
    const bothOn = {
      wudaDetachOnlyOnActiveHit: true,
      wudaDetachOnlyOnHitstun: true,
    };

    expect(resolveWudaAllowDetach(neither, idle)).toBe(true);

    expect(resolveWudaAllowDetach(attackOnly, attackActive)).toBe(true);
    expect(resolveWudaAllowDetach(attackOnly, hitstunPulse)).toBe(false);
    expect(resolveWudaAllowDetach(attackOnly, idle)).toBe(false);

    // Hitstun lock: pulse yes, mid-stun / idle no
    expect(resolveWudaAllowDetach(hitstunOnly, hitstunPulse)).toBe(true);
    expect(resolveWudaAllowDetach(hitstunOnly, hitstunMid)).toBe(false);
    expect(resolveWudaAllowDetach(hitstunOnly, attackActive)).toBe(false);

    // Both → OR
    expect(resolveWudaAllowDetach(bothOn, attackActive)).toBe(true);
    expect(resolveWudaAllowDetach(bothOn, hitstunPulse)).toBe(true);
    expect(resolveWudaAllowDetach(bothOn, hitstunMid)).toBe(false);
    expect(resolveWudaAllowDetach(bothOn, idle)).toBe(false);
  });

  it('hitstun entry pulse bypasses hitstop; otherwise hitstop blocks', () => {
    const hitstunPulse = {
      phase: 'hitstun',
      stunTimer: 10,
      hitstunDetachPulseFrames: 2,
      mover: { currentHitBoxesLocal: () => [] as unknown[] },
    };
    const hitstunMid = {
      phase: 'hitstun',
      stunTimer: 10,
      hitstunDetachPulseFrames: 0,
      mover: { currentHitBoxesLocal: () => [] as unknown[] },
    };
    const attackActive = {
      phase: 'attack',
      stunTimer: 0,
      hitstunDetachPulseFrames: 0,
      mover: { currentHitBoxesLocal: () => [{ x: 0 }] },
    };
    const hitstunOnly = {
      wudaDetachOnlyOnActiveHit: false,
      wudaDetachOnlyOnHitstun: true,
    };
    const bothOn = {
      wudaDetachOnlyOnActiveHit: true,
      wudaDetachOnlyOnHitstun: true,
    };
    const neither = {
      wudaDetachOnlyOnActiveHit: false,
      wudaDetachOnlyOnHitstun: false,
    };

    // Impact present is already in hitstop — pulse must still open the gate
    expect(
      resolveWudaAllowDetach(hitstunOnly, hitstunPulse, { inHitstop: true }),
    ).toBe(true);
    // After pulse, mid-stun + hitstop stays closed
    expect(
      resolveWudaAllowDetach(hitstunOnly, hitstunMid, { inHitstop: true }),
    ).toBe(false);
    expect(
      resolveWudaAllowDetach(bothOn, attackActive, { inHitstop: true }),
    ).toBe(false);
    expect(resolveWudaAllowDetach(neither, hitstunMid)).toBe(true);
    expect(
      resolveWudaAllowDetach(neither, hitstunMid, { inHitstop: true }),
    ).toBe(false);
  });
});

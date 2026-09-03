/**
 * Detached free-flight particles when detach-instant-refill is on.
 * Coat stuck slots stay on the body (refilling); free visuals live here.
 */
import * as THREE from 'three';
import { integrateFreeParticle } from './wudaCoatMath';

export type WudaFreePoolParticle = {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
};

export function createWudaFreePool(capacity: number): WudaFreePoolParticle[] {
  const n = Math.max(0, Math.floor(capacity));
  const out: WudaFreePoolParticle[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      active: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      life: 0,
    });
  }
  return out;
}

/** Instance capacity = stuckCount (+ free pool when refill mode on). */
export function resolveWudaInstanceCapacity(
  stuckCount: number,
  refillOn: boolean,
  freePoolCapacity: number,
): number {
  const stuck = Math.max(0, Math.floor(stuckCount));
  if (!refillOn) return stuck;
  return stuck + Math.max(0, Math.floor(freePoolCapacity));
}

/**
 * Spawn into first inactive slot; if full, replace the shortest remaining life.
 * Returns pool index, or -1 when capacity is 0.
 */
export function spawnWudaFreeParticle(
  pool: WudaFreePoolParticle[],
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  life: number,
): number {
  if (pool.length === 0) return -1;
  let freeIdx = -1;
  let shortestIdx = 0;
  let shortestLife = Infinity;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i]!;
    if (!p.active) {
      freeIdx = i;
      break;
    }
    if (p.life < shortestLife) {
      shortestLife = p.life;
      shortestIdx = i;
    }
  }
  const idx = freeIdx >= 0 ? freeIdx : shortestIdx;
  const slot = pool[idx]!;
  slot.active = true;
  slot.pos.copy(pos);
  slot.vel.copy(vel);
  slot.life = Math.max(0, life);
  return idx;
}

/** Integrate active free particles; deactivate when life expires. */
export function stepWudaFreePool(
  pool: WudaFreePoolParticle[],
  dt: number,
  gravity: THREE.Vector3,
  gravityPower: number,
  drag: number,
  speedLimit: number,
): number {
  let active = 0;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i]!;
    if (!p.active) continue;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    integrateFreeParticle(p.pos, p.vel, dt, gravity, gravityPower, drag, speedLimit);
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    active++;
  }
  return active;
}

export function advanceRefillTimer(refillIn: number, dt: number): number {
  return Math.max(0, refillIn - Math.max(0, dt));
}

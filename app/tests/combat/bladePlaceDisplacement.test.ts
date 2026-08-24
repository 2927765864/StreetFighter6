import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Fighter } from '../../src/combat/fighter/Fighter';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';

function loadBlade(id: string) {
  const raw = JSON.parse(
    readFileSync(
      resolve(__dirname, `../../public/data/overrides/moves/${id}.json`),
      'utf8',
    ),
  );
  return parseMoveDefinition(raw);
}

function firstNonZero(sm: number[] | undefined): number | null {
  if (!sm) return null;
  for (let i = 0; i < sm.length; i++) {
    if (Math.abs(sm[i]!) > 1e-9) return i;
  }
  return null;
}

describe('blade Place+Steer selfMovement (donkey kick)', () => {
  it('L/M/H start Place creep on distinct frames, with kick-frame Steer snap', () => {
    const lk = loadBlade('ryu_blade_lk');
    const mk = loadBlade('ryu_blade_mk');
    const hk = loadBlade('ryu_blade_hk');
    expect(firstNonZero(lk.selfMovement)).toBe(9);
    expect(firstNonZero(mk.selfMovement)).toBe(12);
    expect(firstNonZero(hk.selfMovement)).toBe(21);
    // Steer impulse on the kick frame (MainFrame) — strength-differentiated.
    expect(lk.selfMovement![12]!).toBeGreaterThan(0.3);
    expect(mk.selfMovement![16]!).toBeGreaterThan(0.5);
    expect(hk.selfMovement![25]!).toBeGreaterThan(0.45);
    expect(lk.selfMovement![12]!).toBeLessThan(mk.selfMovement![16]!);
  });

  it('total travel differs by strength after Place+Steer bake', () => {
    const sums = (['ryu_blade_lk', 'ryu_blade_mk', 'ryu_blade_hk'] as const).map(
      (id) => {
        const move = loadBlade(id);
        const f = new Fighter('p1', 0, 1, 10000);
        f.startMove(move);
        const guard = (move.selfMovement?.length ?? 0) + 8;
        for (let i = 0; i < guard; i++) {
          if (f.phase === 'attack') {
            f.applyAttackPlaceDisplacement(1);
          } else if (f.attackResidual) {
            f.applyAttackResidualDisplacement(1);
            f.tickAttackResidual();
          } else {
            break;
          }
          if (f.phase === 'attack') {
            f.advance({
              airFrames: 38,
              landingFrames: 3,
              dashSpeed: 0,
            });
          }
        }
        return f.x;
      },
    );
    expect(sums[0]).toBeCloseTo(0.58819, 3);
    expect(sums[1]).toBeCloseTo(0.78819, 3);
    expect(sums[2]).toBeCloseTo(1.23819, 3);
    expect(sums[0]!).toBeLessThan(sums[1]!);
    expect(sums[1]!).toBeLessThan(sums[2]!);
  });

  it('heavy stays planted longer than medium before the lunge', () => {
    const mk = loadBlade('ryu_blade_mk');
    const hk = loadBlade('ryu_blade_hk');
    const sumUntil = (sm: number[], until: number) =>
      sm.slice(0, until).reduce((a, b) => a + b, 0);
    expect(sumUntil(mk.selfMovement!, 21)).toBeGreaterThan(0.2);
    expect(sumUntil(hk.selfMovement!, 21)).toBeLessThan(0.01);
  });
});
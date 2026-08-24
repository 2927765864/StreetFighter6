import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';
import { resolveAnimSequenceFrame } from '../../src/render/AnimScrub';
import { Fighter } from '../../src/combat/fighter/Fighter';

function load(id: string) {
  return parseMoveDefinition(
    JSON.parse(
      readFileSync(
        resolve(__dirname, `../../public/data/overrides/moves/${id}.json`),
        'utf8',
      ),
    ),
  );
}

describe('ground Tatsumaki animSequence', () => {
  it('light has start→end with 0 loops', () => {
    const m = load('ryu_tatsu_lk');
    expect(m.clipId).toBe('ryu_tatsu');
    expect(m.animSequence?.map((s) => s.role)).toEqual(['start', 'end']);
    expect(m.frames.startup).toBe(12);
    expect(resolveAnimSequenceFrame(0, m.animSequence)?.role).toBe('start');
    expect(resolveAnimSequenceFrame(12, m.animSequence)?.role).toBe('end');
  });

  it('medium has one loop; heavy has two', () => {
    const mk = load('ryu_tatsu_mk');
    const hk = load('ryu_tatsu_hk');
    expect(mk.animSequence?.filter((s) => s.role === 'loop')).toHaveLength(1);
    expect(hk.animSequence?.filter((s) => s.role === 'loop')).toHaveLength(2);
    expect(mk.frames.startup).toBe(14);
    expect(hk.frames.startup).toBe(16);
    expect(resolveAnimSequenceFrame(20, mk.animSequence)?.role).toBe('loop');
    expect(resolveAnimSequenceFrame(20, hk.animSequence)?.role).toBe('loop');
    expect(resolveAnimSequenceFrame(40, hk.animSequence)?.role).toBe('loop');
    expect(resolveAnimSequenceFrame(50, hk.animSequence)?.role).toBe('end');
  });

  it('startMove picks the first sequence role', () => {
    const m = load('ryu_tatsu_hk');
    const f = new Fighter('p1', 0, 1, 10000);
    f.startMove(m);
    expect(f.animRole).toBe('start');
    expect(f.clipId).toBe('ryu_tatsu');
  });

  it('remaps start/end motion windows for light', () => {
    const m = load('ryu_tatsu_lk');
    // action 0 → start motion ~3
    expect(resolveAnimSequenceFrame(0, m.animSequence)?.motionFrame).toBeCloseTo(
      3,
      5,
    );
    // action 12 → end motion 0
    expect(
      resolveAnimSequenceFrame(12, m.animSequence)?.motionFrame,
    ).toBeCloseTo(0, 5);
  });

  it('Steer persist gives long forward travel L < M < H', () => {
    const sumX = (id: string) =>
      (load(id).selfMovement ?? []).reduce((a, b) => a + b, 0);
    const lk = sumX('ryu_tatsu_lk');
    const mk = sumX('ryu_tatsu_mk');
    const hk = sumX('ryu_tatsu_hk');
    expect(lk).toBeCloseTo(1.8, 2);
    expect(mk).toBeCloseTo(2.965, 2);
    expect(hk).toBeCloseTo(5.175, 2);
    expect(lk).toBeLessThan(mk);
    expect(mk).toBeLessThan(hk);
  });

  it('does not accumulate below-ground Y after recovery', () => {
    for (const id of ['ryu_tatsu_lk', 'ryu_tatsu_mk', 'ryu_tatsu_hk'] as const) {
      const m = load(id);
      const f = new Fighter('p1', 0, 1, 10000);
      f.startMove(m);
      const guard = Math.max(m.frames.total, m.selfMovement?.length ?? 0) + 4;
      for (let i = 0; i < guard; i++) {
        if (f.phase === 'attack') {
          f.applyAttackPlaceDisplacement(1);
          expect(f.y).toBeGreaterThanOrEqual(0);
        } else if (f.attackResidual) {
          f.applyAttackResidualDisplacement(1);
          f.tickAttackResidual();
          expect(f.y).toBeGreaterThanOrEqual(0);
        } else {
          break;
        }
        if (f.phase === 'attack') {
          f.advance({ airFrames: 38, landingFrames: 3, dashSpeed: 0 });
        }
      }
      expect(f.y).toBe(0);
    }
  });
});
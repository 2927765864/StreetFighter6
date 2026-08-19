import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hitGroupAtFrame, hitGroupRanges } from '../../src/combat/move/HitGroups';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';
import { MatchSim } from '../../src/combat/match/MatchSim';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { BTN_LP } from '../../src/combat/types';

function loadMove(name: string) {
  return parseMoveDefinition(
    JSON.parse(readFileSync(resolve(__dirname, `../../public/data/moves/${name}.json`), 'utf8')),
  );
}

describe('hitGroupRanges', () => {
  it('4HK two disjoint windows → groups 0 then 1', () => {
    const m = loadMove('ryu_4hk');
    const ranges = hitGroupRanges(m.boxes.hit, m.hitCount ?? 2);
    expect(ranges.length).toBe(2);
    expect(ranges[0]!.from).toBeLessThanOrEqual(9);
    expect(ranges[0]!.to).toBeGreaterThanOrEqual(14);
    expect(ranges[1]!.from).toBeGreaterThanOrEqual(19);
    expect(hitGroupAtFrame(ranges, 10)).toBe(0);
    expect(hitGroupAtFrame(ranges, 20)).toBe(1);
    expect(hitGroupAtFrame(ranges, 16)).toBeNull();
  });

  it('6HP one window + hitCount 2 → split two groups', () => {
    const m = loadMove('ryu_6hp');
    const ranges = hitGroupRanges(m.boxes.hit, m.hitCount ?? 2);
    expect(ranges.length).toBe(2);
    expect(hitGroupAtFrame(ranges, ranges[0]!.from)).toBe(0);
    expect(hitGroupAtFrame(ranges, ranges[1]!.from)).toBe(1);
    expect(ranges[0]!.to).toBeLessThan(ranges[1]!.from);
  });

  it('5LP single hit stays one group', () => {
    const m = loadMove('ryu_5lp');
    const ranges = hitGroupRanges(m.boxes.hit, m.hitCount ?? 1);
    expect(ranges.length).toBe(1);
  });
});

describe('MatchSim multi-hit block', () => {
  function twoHitMove(): MoveDefinition {
    return {
      id: 'test_2hit',
      characterId: 'ryu',
      moveId: 'test_2hit',
      displayName: '2hit',
      frames: { startup: 4, active: 3, recovery: 20, total: 27 },
      advantage: { onHit: 0, onBlock: -1 },
      damage: 200,
      hitCount: 2,
      hitstun: 10,
      blockstun: 8,
      cancel: { specialCancel: false, targetCombo: [], windows: [] },
      boxes: {
        hurt: [{ from: 0, to: 26, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
        hit: [
          { from: 3, to: 5, x: 1.2, y: 0.85, w: 2.5, h: 1.5 },
          { from: 14, to: 16, x: 1.2, y: 0.85, w: 2.5, h: 1.5 },
        ],
        push: [{ from: 0, to: 26, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
      },
      clipId: 'test_2hit',
      facingRelative: true,
      review: { status: 'placeholder', notes: '' },
      hitstopOnBlock: 2,
      guard: 'high',
      guardAnim: 'm',
      guardStrength: 'H',
    };
  }

  it('two contacts each retrigger blockstun clip', () => {
    const sim = new MatchSim(twoHitMove(), undefined, {
      dummyGuardPolicy: 'stand_block',
      hitstopFramesOnBlock: 2,
    });
    sim.pendingInput = { dir: 5, relDir: 5, buttons: BTN_LP, pressed: BTN_LP, released: 0 };
    sim.step();
    let retriggers = 0;
    let clipOnSecond = '';
    for (let i = 0; i < 50; i++) {
      sim.pendingInput = { dir: 5, relDir: 5, buttons: 0, pressed: 0, released: 0 };
      const landedBefore = sim.debugProbe.hitsLandedThisMove;
      sim.step();
      if (sim.debugProbe.hitsLandedThisMove > landedBefore) {
        retriggers += 1;
        if (retriggers === 2) clipOnSecond = sim.p2.clipId;
      }
    }
    expect(retriggers).toBe(2);
    expect(sim.debugProbe.hitsLandedThisMove).toBe(2);
    expect(clipOnSecond).toBe('grd_mh_st');
  });
});

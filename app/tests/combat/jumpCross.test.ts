import { describe, expect, it } from 'vitest';
import { MatchSim } from '../../src/combat/match/MatchSim';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { tryCommitLogicalFacing } from '../../src/combat/input/facing';
import { resolvePush } from '../../src/combat/systems/PushResolve';
import type { Box } from '../../src/combat/boxes/Box2D';

const fixture: MoveDefinition = {
  id: 'ryu_5lp',
  characterId: 'ryu',
  moveId: '5LP',
  displayName: 't',
  frames: { startup: 4, active: 3, recovery: 7, total: 14 },
  advantage: { onHit: 0, onBlock: 0 },
  damage: 1,
  hitstun: 1,
  blockstun: 1,
  cancel: { specialCancel: false, targetCombo: [], windows: [] },
  boxes: { hurt: [], hit: [] },
  clipId: '5lp',
  facingRelative: true,
  review: { status: 'placeholder', notes: '' },
};

const N = {
  dir: 5 as const,
  relDir: 5 as const,
  buttons: 0,
  pressed: 0,
  released: 0,
};

function body(x: number, push: Box, airborne = false) {
  return {
    x,
    airborne,
    worldPushBoxes(this: { x: number }) {
      return [{ x: this.x + push.x, y: push.y, w: push.w, h: push.h }];
    },
  };
}

describe('jump-over / facing / push', () => {
  it('stacked X overlap does not flip facing', () => {
    const a = { x: 0, facing: 1 as const };
    const b = { x: 0.05, facing: -1 as const };
    const r = tryCommitLogicalFacing(
      a,
      b,
      [{ x: 0, y: 0.9, w: 0.8, h: 1.8 }],
      [{ x: 0.05, y: 0.9, w: 0.8, h: 1.8 }],
    );
    expect(r.committed).toBe(false);
    expect(a.facing).toBe(1);
  });

  it('air vs ground still pushes when boxes overlap', () => {
    const a = body(0, { x: 0, y: 1.4, w: 0.8, h: 1.3 }, true);
    const b = body(0.1, { x: 0, y: 0.9, w: 0.7, h: 1.8 }, false);
    const r = resolvePush(a, b, { minX: -5, maxX: 5 });
    expect(r.separated).toBe(true);
  });

  it('forward jump crosses a close dummy without getting stuck', () => {
    const sim = new MatchSim(fixture, undefined, {
      enablePushResolve: true,
      forceP2Guard: true,
    });
    sim.p1.x = 0.2;
    sim.p2.x = 0.55;
    sim.p1.facing = 1;
    sim.p2.facing = -1;
    const worldDir0 = 1;

    sim.pendingInput = {
      dir: 9,
      relDir: 9,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    sim.step();
    expect(sim.p1.phase).toBe('prejump');
    expect(sim.p1.jumpWorldDir).toBe(worldDir0);
    const vis0 = sim.p1.visualFacing;

    let flips = 0;
    let lastFace = sim.p1.facing;
    let airVisualFlipped = false;
    for (let i = 0; i < 50; i++) {
      sim.pendingInput = N;
      sim.step();
      if (sim.p1.facing !== lastFace) {
        flips += 1;
        lastFace = sim.p1.facing;
      }
      if (
        (sim.p1.phase === 'airborne' ||
          (sim.p1.phase === 'attack' && sim.p1.jumpPhase === 'air')) &&
        sim.p1.visualFacing !== vis0
      ) {
        airVisualFlipped = true;
      }
    }
    expect(airVisualFlipped).toBe(false);
    expect(sim.p1.x).toBeGreaterThan(sim.p2.x);
    expect(sim.p1.jumpWorldDir).toBe(worldDir0);
    expect(flips).toBeLessThan(4);
    expect(
      sim.p1.phase === 'landing' ||
        sim.p1.phase === 'idle' ||
        sim.p1.phase === 'crouch',
    ).toBe(true);
  });

  it('after logical turn, commands use new facing while mesh stays', () => {
    const sim = new MatchSim(fixture);
    sim.p1.x = 2;
    sim.p2.x = 0;
    sim.p1.facing = -1;
    sim.p2.facing = 1;
    sim.p1.visualFacing = 1;
    sim.p1.phase = 'airborne';
    sim.p1.y = 1.5;
    sim.pendingInput = {
      dir: 4,
      relDir: 4,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    sim.step();
    expect(sim.p1.facing).toBe(-1);
    expect(sim.p1.visualFacing).toBe(1);
    expect(sim.pendingInput.relDir).toBe(6);
  });

  it('mid-air facing flip does not reverse jump world dir', () => {
    const sim = new MatchSim(fixture);
    sim.p1.x = 0;
    sim.p2.x = 2;
    sim.pendingInput = {
      dir: 9,
      relDir: 9,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    sim.step();
    for (let i = 0; i < 4; i++) {
      sim.pendingInput = N;
      sim.step();
    }
    expect(sim.p1.phase).toBe('airborne');
    const x0 = sim.p1.x;
    sim.p1.facing = -1;
    sim.pendingInput = N;
    sim.step();
    expect(sim.p1.x).toBeGreaterThan(x0);
  });

  it('buffered rejump after cross snaps visual facing on land (§3.14.3.a)', () => {
    const sim = new MatchSim(fixture, undefined, {
      enablePushResolve: true,
      forceP2Guard: true,
    });
    sim.p1.x = 0.2;
    sim.p2.x = 0.55;
    sim.p1.facing = 1;
    sim.p2.facing = -1;
    sim.p1.visualFacing = 1;

    sim.pendingInput = {
      dir: 9,
      relDir: 9,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    sim.step();

    let sawLogicalFlip = false;
    let landed = false;
    for (let i = 0; i < 80; i++) {
      const air =
        sim.p1.phase === 'airborne' ||
        (sim.p1.phase === 'attack' && sim.p1.jumpPhase === 'air') ||
        sim.p1.phase === 'landing';
      if (air && !landed) {
        if (sim.p1.facing !== 1) sawLogicalFlip = true;
        sim.pendingInput = {
          dir: 8,
          relDir: 8,
          buttons: 0,
          pressed: 0,
          released: 0,
        };
      } else {
        sim.pendingInput = N;
      }
      sim.step();
      if (
        sim.p1.phase === 'prejump' &&
        sim.p1.x > sim.p2.x &&
        sawLogicalFlip
      ) {
        expect(sim.p1.visualFacing).toBe(sim.p1.facing);
        expect(sim.p1.pendingTurnAfterLand).toBe(false);
        landed = true;
        break;
      }
      if (
        sim.p1.phase === 'idle' ||
        sim.p1.phase === 'crouch' ||
        (sim.p1.phase === 'landing' && sim.p1.canAct())
      ) {
        if (sim.p1.facing !== sim.p1.visualFacing || sim.p1.pendingTurnAfterLand) {
          sim.p1.startJump(4, 8);
          expect(sim.p1.visualFacing).toBe(sim.p1.facing);
          expect(sim.p1.pendingTurnAfterLand).toBe(false);
          landed = true;
          break;
        }
      }
    }
    expect(sawLogicalFlip || sim.p1.x > sim.p2.x).toBe(true);
    expect(landed).toBe(true);
  });
});

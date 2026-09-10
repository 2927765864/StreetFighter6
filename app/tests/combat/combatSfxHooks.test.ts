import { describe, expect, it } from 'vitest';
import { MatchSim } from '../../src/combat/match/MatchSim';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { BTN_LP } from '../../src/combat/types';
import type { CombatSfxEvent } from '../../src/combat/sfx/SfxSlots';

function probeMove(
  over: Partial<MoveDefinition> & Pick<MoveDefinition, 'id'>,
): MoveDefinition {
  return {
    characterId: 'ryu',
    moveId: over.id,
    displayName: over.id,
    frames: { startup: 4, active: 3, recovery: 7, total: 14 },
    advantage: { onHit: 1, onBlock: -1 },
    damage: 300,
    hitstun: 12,
    blockstun: 10,
    cancel: { specialCancel: false, targetCombo: [], windows: [] },
    boxes: {
      hurt: [{ from: 0, to: 13, x: 0, y: 0.85, w: 0.7, h: 1.7 }],
      hit: [{ from: 3, to: 5, x: 1.2, y: 0.85, w: 2.5, h: 1.5 }],
      push: [{ from: 0, to: 13, x: 0, y: 0.7, w: 0.55, h: 1.4 }],
    },
    clipId: over.id,
    facingRelative: true,
    review: { status: 'placeholder', notes: '' },
    hitstopOnHit: 0,
    hitstopOnBlock: 0,
    guard: 'high',
    guardStrength: 'L',
    ...over,
  };
}

function pressLp() {
  return {
    dir: 5 as const,
    relDir: 5 as const,
    buttons: BTN_LP,
    pressed: BTN_LP,
    released: 0,
  };
}

function neutral() {
  return {
    dir: 5 as const,
    relDir: 5 as const,
    buttons: 0,
    pressed: 0,
    released: 0,
  };
}

describe('MatchSim combat SFX hooks', () => {
  it('emits swing on first active frame (not on button accept) and hit on contact', () => {
    const mv = probeMove({ id: 'ryu_5lp' });
    const events: CombatSfxEvent[] = [];
    let swingAtMoveFrame = -1;
    const sim = new MatchSim(mv, undefined, {
      dummyGuardPolicy: 'none',
      hitstopFramesOnHit: 0,
      onCombatSfx: (ev) => {
        events.push(ev);
        if (ev.kind === 'swing') {
          // Captured before same-step advance().
          swingAtMoveFrame = sim.p1.mover.moveFrame;
        }
      },
    });

    sim.pendingInput = pressLp();
    sim.step();
    expect(events.filter((e) => e.kind === 'swing')).toHaveLength(0);

    // startup=4 → first active at moveFrame 3 (0-based).
    for (let i = 0; i < 20; i++) {
      sim.pendingInput = neutral();
      sim.step();
      if (events.some((e) => e.kind === 'swing')) break;
    }
    const swings = events.filter((e) => e.kind === 'swing');
    expect(swings).toHaveLength(1);
    expect(swingAtMoveFrame).toBe(3);
    expect(swings[0]).toMatchObject({
      kind: 'swing',
      moveId: 'ryu_5lp',
      guardStrength: 'L',
    });

    for (let i = 0; i < 20; i++) {
      if (sim.lastHitResult === 'hit' || sim.lastHitResult === 'block') break;
      sim.pendingInput = neutral();
      sim.step();
    }
    expect(sim.lastHitResult).toBe('hit');
    expect(events.some((e) => e.kind === 'hit')).toBe(true);
    expect(events.filter((e) => e.kind === 'swing')).toHaveLength(1);
  });

  it('emits block contact when dummy guards', () => {
    const mv = probeMove({ id: 'ryu_5lp', guardStrength: 'M' });
    const events: CombatSfxEvent[] = [];
    const sim = new MatchSim(mv, undefined, {
      dummyGuardPolicy: 'block_all',
      hitstopFramesOnBlock: 0,
      onCombatSfx: (ev) => events.push(ev),
    });

    sim.pendingInput = pressLp();
    sim.step();
    for (let i = 0; i < 20; i++) {
      sim.pendingInput = neutral();
      sim.step();
      if (sim.lastHitResult === 'block') break;
    }
    expect(sim.lastHitResult).toBe('block');
    expect(events.some((e) => e.kind === 'block')).toBe(true);
  });

  it('emits jump, jump_cloth, then land across a short hop', () => {
    const mv = probeMove({ id: 'ryu_5lp' });
    const events: CombatSfxEvent[] = [];
    const sim = new MatchSim(mv, undefined, {
      prejumpFrames: 1,
      airFrames: 4,
      landingFrames: 2,
      landingAnimFrames: 2,
      walkInputFreezeFrames: 0,
      onCombatSfx: (ev) => events.push(ev),
    });

    const jumpUp = {
      dir: 8 as const,
      relDir: 8 as const,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    // Hold-jump through executeIntent so phase edge prev=prejump is recorded.
    sim.pendingInput = jumpUp;
    sim.step();
    expect(events.some((e) => e.kind === 'jump')).toBe(true);
    expect(sim.p1.phase).toBe('prejump');

    for (let i = 0; i < 30; i++) {
      sim.pendingInput = neutral();
      sim.step();
      if (events.some((e) => e.kind === 'land')) break;
    }
    expect(events.some((e) => e.kind === 'jump_cloth')).toBe(true);
    expect(events.some((e) => e.kind === 'land')).toBe(true);
    const clothAt = events.findIndex((e) => e.kind === 'jump_cloth');
    const landAt = events.findIndex((e) => e.kind === 'land');
    expect(clothAt).toBeGreaterThanOrEqual(0);
    expect(landAt).toBeGreaterThan(clothAt);
  });

  it('emits alternating footstep SFX while walking forward', () => {
    const mv = probeMove({ id: 'ryu_5lp' });
    const events: CombatSfxEvent[] = [];
    const sim = new MatchSim(mv, undefined, {
      walkInputFreezeFrames: 0,
      onCombatSfx: (ev) => events.push(ev),
    });
    sim.setMovementTable({
      characterId: 'ryu',
      retrieved: 'test',
      sources: [],
      units: { logicSpace: 'test', frameHz: 60 },
      walk: {
        forwardSpeed: 0.05,
        backSpeed: 0.03,
        firstFrameSpeedScale: 1,
        inputFreezeFrames: 0,
        clipLogicFrames: {
          walk_fwd: { start: 4, loop: 8, end: 4 },
          walk_back: { start: 4, loop: 8, end: 4 },
        },
      },
      dash: {
        forward: { frames: 10, distance: 1 },
        back: { frames: 10, distance: 1 },
      },
      jump: {
        prejumpFrames: 4,
        airFrames: 20,
        landingFrames: 3,
        apexHeight: 2,
        forwardDistance: 1,
        backDistance: 1,
        neutralDistance: 0,
      },
    });

    // Facing-relative forward = dir 6 when facing +1.
    const walkFwd = {
      dir: 6 as const,
      relDir: 6 as const,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    for (let i = 0; i < 24; i++) {
      sim.pendingInput = walkFwd;
      sim.step();
    }
    const steps = events.filter((e) => e.kind === 'footstep');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps[0]).toMatchObject({ kind: 'footstep', side: 'left' });
    expect(steps[1]).toMatchObject({ kind: 'footstep', side: 'right' });
  });
});

import { describe, expect, it } from 'vitest';
import { Fighter } from '../../src/combat/fighter/Fighter';
import { MatchSim } from '../../src/combat/match/MatchSim';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';

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

const DOWN = {
  dir: 2 as const,
  relDir: 2 as const,
  buttons: 0,
  pressed: 0,
  released: 0,
};

const adv = {
  airFrames: 10,
  landingFrames: 3,
  dashSpeed: 0,
  landingAnimFrames: 20,
  neutralLandToRiseIdleRatio: 0,
  neutralLandToRiseTurnRatio: 0,
  neutralRiseToTurnDissolveRatio: 1,
  crouchHeld: false,
};

describe('§3.13.6 land crouch early vs delayed', () => {
  it('early hold: land exit skips residual → crouch loop (no turn)', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'landing';
    f.jumpPhase = 'land';
    f.stateTimer = 1;
    f.jumpClipId = 'jump_f';
    f.clipId = 'jump_f';
    f.preLandCrouchHold = true;
    f.pendingTurnAfterLand = false;

    f.advance({ ...adv, crouchHeld: true });

    expect(f.phase).toBe('crouch');
    expect(f.animTail).toBeNull();
    expect(f.clipId).toBe('crouch');
    expect(f.animRole).toBe('main');
    expect(f.stanceState.logicalCrouch).toBe(true);
    expect(f.stanceState.seg).toBe('none');
    expect(f.turning).toBe(false);
  });

  it('early hold + pending turn: land exit → crouch turn, visual snaps', () => {
    const f = new Fighter('p1', 2, 1, 10000);
    f.facing = -1;
    f.visualFacing = 1;
    f.phase = 'landing';
    f.jumpPhase = 'land';
    f.stateTimer = 1;
    f.jumpClipId = 'jump_f';
    f.preLandCrouchHold = true;
    f.pendingTurnAfterLand = true;

    f.advance({ ...adv, crouchHeld: true });

    expect(f.phase).toBe('crouch');
    expect(f.animTail).toBeNull();
    expect(f.turning).toBe(true);
    expect(f.clipId).toBe('turn_crh');
    expect(f.visualFacing).toBe(-1);
    expect(f.pendingTurnAfterLand).toBe(false);
  });

  it('no early hold: neutral land opens crouch_to_stand then turn; delayed crouch flips to crouch loop', () => {
    const f = new Fighter('p1', 2, 1, 10000);
    f.setStanceConfig({ crouchToStandFrames: 3 });
    f.facing = -1;
    f.visualFacing = 1;
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_f';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.preLandCrouchHold = false;
    f.pendingTurnAfterLand = true;

    f.advance({ ...adv, crouchHeld: false });
    expect(f.phase).toBe('landing');
    // §3.13.7: first landing advance opens crouch_to_stand (not turn yet)
    f.advance({ ...adv, crouchHeld: false });
    expect(f.animTail).toBeNull();
    expect(f.turning).toBe(false);
    expect(f.animRole).toBe('crouch_to_stand');
    expect(f.pendingTurnAfterLand).toBe(true);

    // finish remaining landing hardstun while still rising
    f.advance({ ...adv, crouchHeld: false });
    f.advance({ ...adv, crouchHeld: false });
    expect(f.canAct()).toBe(true);
    expect(f.animRole).toBe('crouch_to_stand');

    // rise completes → stand-turn
    f.advance({ ...adv, crouchHeld: false });
    expect(f.turning).toBe(true);
    expect(f.clipId).toBe('turn_std');
    expect(f.visualFacing).toBe(-1);
    expect(f.phase).toBe('idle');

    f.applyPostureOrWalkIntent('crouch');

    expect(f.phase).toBe('crouch');
    expect(f.animTail).toBeNull();
    expect(f.turning).toBe(false);
    expect(f.clipId).toBe('crouch');
    expect(f.animRole).toBe('main');
    expect(f.visualFacing).toBe(-1);
    expect(f.pendingTurnAfterLand).toBe(false);
    expect(f.stanceState.seg).toBe('none');
  });

  it('delayed crouch mid stand-turn after land: stop turn, flip, crouch loop', () => {
    const f = new Fighter('p1', 2, 1, 10000);
    f.facing = -1;
    f.visualFacing = 1;
    f.phase = 'idle';
    f.pendingTurnAfterLand = true;
    f.beginTurnClip();
    expect(f.clipId).toBe('turn_std');
    expect(f.visualFacing).toBe(-1);

    f.facing = 1; // new logical flip mid-turn (test flip path)
    f.applyPostureOrWalkIntent('crouch');

    expect(f.turning).toBe(false);
    expect(f.phase).toBe('crouch');
    expect(f.clipId).toBe('crouch');
    expect(f.visualFacing).toBe(1);
  });

  it('MatchSim: hold down through forward jump → crouch on first canAct, not to_crouch', () => {
    const sim = new MatchSim(fixture, undefined, {
      enablePushResolve: true,
      forceP2Guard: true,
      airFrames: 12,
      landingFrames: 3,
      landingAnimFrames: 20,
      prejumpFrames: 2,
    });
    sim.p1.x = 0.2;
    sim.p2.x = 0.55;
    sim.p1.facing = 1;
    sim.p2.facing = -1;

    sim.pendingInput = {
      dir: 9,
      relDir: 9,
      buttons: 0,
      pressed: 0,
      released: 0,
    };
    sim.step();
    expect(sim.p1.phase).toBe('prejump');

    // Hold crouch (world 2) for rest of jump — facing may change after cross
    for (let i = 0; i < 80; i++) {
      const face = sim.p1.facing;
      // world down is always 2; relDir will be remapped by MatchSim
      sim.pendingInput = {
        dir: 2,
        relDir: 2,
        buttons: 0,
        pressed: 0,
        released: 0,
      };
      void face;
      sim.step();
      if (sim.p1.canAct() && sim.p1.phase === 'crouch') break;
      if (sim.p1.canAct() && sim.p1.phase === 'idle') break;
    }

    expect(sim.p1.canAct()).toBe(true);
    expect(sim.p1.phase).toBe('crouch');
    expect(sim.p1.animTail).toBeNull();
    expect(sim.p1.stanceState.seg).toBe('none');
    // crouch loop or crouch-turn (if crossed)
    expect(
      sim.p1.clipId === 'crouch' || sim.p1.clipId === 'turn_crh',
    ).toBe(true);
    expect(sim.p1.visualFacing).toBe(sim.p1.facing);
  });
});

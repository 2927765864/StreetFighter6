import { describe, expect, it } from 'vitest';
import { Fighter } from '../../src/combat/fighter/Fighter';
import { MatchSim } from '../../src/combat/match/MatchSim';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';
import { resolveCrossfadeSec, defaultCrossfadeDurations } from '../../src/combat/anim/AnimCrossfade';

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

const adv = {
  airFrames: 10,
  landingFrames: 3,
  dashSpeed: 0,
  landingAnimFrames: 20,
  crouchHeld: false,
};

describe('crouch-turn then release down', () => {
  it('release mid crouch-turn stops turn and opens crouch_to_stand same frame', () => {
    const f = new Fighter('p1', 2, 1, 10000);
    f.facing = -1;
    f.visualFacing = 1;
    f.phase = 'landing';
    f.jumpPhase = 'land';
    f.stateTimer = 1;
    f.jumpClipId = 'jump_f';
    f.preLandCrouchHold = true;
    f.pendingTurnAfterLand = true;
    f.setStanceConfig({ standToCrouchFrames: 10, crouchToStandFrames: 10 });

    f.advance({ ...adv, crouchHeld: true });
    expect(f.turning).toBe(true);
    expect(f.clipId).toBe('turn_crh');

    for (let i = 0; i < 5; i++) {
      f.applyPostureOrWalkIntent('crouch');
      f.advance({ ...adv, crouchHeld: true });
    }
    expect(f.turning).toBe(true);

    // Release down while still in logic turn
    f.applyPostureOrWalkIntent('none');
    expect(f.turning).toBe(false);
    expect(f.stanceState.seg).toBe('to_stand');
    expect(f.animRole).toBe('crouch_to_stand');
    expect(f.clipId).toBe('crouch');
    // visual facing already correct from beginTurnClip — no re-flip required
    expect(f.visualFacing).toBe(f.facing);

    f.advance(adv);
    expect(f.stanceState.seg).toBe('to_stand');
    expect(f.stanceState.frame).toBeGreaterThan(0);
    expect(f.turning).toBe(false);
  });

  it('after full crouch-turn, release still opens crouch_to_stand', () => {
    const f = new Fighter('p1', 2, 1, 10000);
    f.facing = -1;
    f.visualFacing = -1;
    f.phase = 'landing';
    f.jumpPhase = 'land';
    f.stateTimer = 1;
    f.jumpClipId = 'jump_f';
    f.preLandCrouchHold = true;
    f.pendingTurnAfterLand = true;
    f.setStanceConfig({ standToCrouchFrames: 10, crouchToStandFrames: 10 });

    f.advance({ ...adv, crouchHeld: true });
    for (let i = 0; i < 80; i++) {
      f.applyPostureOrWalkIntent('crouch');
      f.advance({ ...adv, crouchHeld: true });
      if (!f.turning) break;
    }
    expect(f.turning).toBe(false);
    expect(f.phase).toBe('crouch');
    expect(f.animRole).toBe('main');

    f.applyPostureOrWalkIntent('none');
    expect(f.stanceState.seg).toBe('to_stand');
    expect(f.animRole).toBe('crouch_to_stand');
  });

  it('turn end with crouchHeld false starts crouch_to_stand if still logical crouch', () => {
    const f = new Fighter('p1', 2, 1, 10000);
    f.facing = -1;
    f.visualFacing = -1;
    f.phase = 'crouch';
    f.stanceState = { seg: 'none', frame: 0, total: 0, logicalCrouch: true };
    f.beginTurnClip();
    expect(f.clipId).toBe('turn_crh');
    f.turnFrame = f.turnTotal - 1;

    // No posture sample this frame (release already processed earlier as none
    // but stance still crouch idle); advance ends turn with crouchHeld false.
    f.advance({ ...adv, crouchHeld: false });
    expect(f.turning).toBe(false);
    expect(f.stanceState.seg).toBe('to_stand');
    expect(f.animRole).toBe('crouch_to_stand');
  });

  it('MatchSim: early crouch-turn then release mid-turn → crouch_to_stand', () => {
    const sim = new MatchSim(fixture, undefined, {
      enablePushResolve: true,
      forceP2Guard: true,
      airFrames: 12,
      landingFrames: 3,
      landingAnimFrames: 20,
      prejumpFrames: 2,
      crouchToStandFrames: 12,
      standToCrouchFrames: 12,
    });
    sim.p1.x = 0.2;
    sim.p2.x = 0.55;
    sim.p1.facing = 1;
    sim.p2.facing = -1;

    sim.pendingInput = { dir: 9, relDir: 9, buttons: 0, pressed: 0, released: 0 };
    sim.step();
    for (let i = 0; i < 80; i++) {
      sim.pendingInput = { dir: 2, relDir: 2, buttons: 0, pressed: 0, released: 0 };
      sim.step();
      if (sim.p1.turning && sim.p1.clipId === 'turn_crh') break;
    }
    expect(sim.p1.turning).toBe(true);

    // a few crouch-turn frames
    for (let i = 0; i < 8; i++) {
      sim.pendingInput = { dir: 2, relDir: 2, buttons: 0, pressed: 0, released: 0 };
      sim.step();
    }
    expect(sim.p1.turning).toBe(true);

    sim.pendingInput = { dir: 5, relDir: 5, buttons: 0, pressed: 0, released: 0 };
    sim.step();
    expect(sim.p1.turning).toBe(false);
    expect(sim.p1.stanceState.seg).toBe('to_stand');
    expect(sim.p1.animRole).toBe('crouch_to_stand');
    expect(sim.p1.visualFacing).toBe(sim.p1.facing);

    sim.step();
    expect(sim.p1.stanceState.frame).toBeGreaterThan(0);
  });

  it('crossfade: turn → crouch_to_stand is hard cut', () => {
    const d = defaultCrossfadeDurations();
    expect(resolveCrossfadeSec('turn_crh::main', 'crouch::crouch_to_stand', d)).toBe(0);
  });
});

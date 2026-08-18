import { describe, expect, it } from 'vitest';
import { Fighter } from '../../src/combat/fighter/Fighter';
import {
  defaultCrossfadeDurations,
  resolveCrossfadeSec,
} from '../../src/combat/anim/AnimCrossfade';

const adv = {
  airFrames: 10,
  landingFrames: 3,
  dashSpeed: 0,
  landingAnimFrames: 20,
  // 0 = first landing advance opens crouch_to_stand
  neutralLandToRiseIdleRatio: 0,
  neutralLandToRiseTurnRatio: 0,
  neutralRiseToTurnDissolveRatio: 1,
  crouchHeld: false,
};

function landOnce(f: Fighter, a = adv): void {
  f.advance(a);
}

describe('§3.13.7 independent land/rise dissolve ratios', () => {
  it('no turn: land hardstun opens crouch_to_stand, not idle', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceConfig({ crouchToStandFrames: 8 });
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_n';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = false;
    f.preLandCrouchHold = false;

    landOnce(f);
    expect(f.phase).toBe('landing');
    expect(f.animRole).toBe('land');

    landOnce(f);
    expect(f.animTail).toBeNull();
    expect(f.clipId).toBe('crouch');
    expect(f.animRole).toBe('crouch_to_stand');
    expect(f.stanceState.seg).toBe('to_stand');
    expect(f.canAct()).toBe(false);

    landOnce(f);
    landOnce(f);
    expect(f.phase).toBe('crouch');
    expect(f.canAct()).toBe(true);
    expect(f.animRole).toBe('crouch_to_stand');
    expect(f.stanceState.seg).toBe('to_stand');
  });

  it('after crouch_to_stand: goes to idle when no pending turn', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceConfig({ crouchToStandFrames: 3 });
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_n';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = false;

    landOnce(f);
    landOnce(f);
    landOnce(f);
    landOnce(f);
    expect(f.canAct()).toBe(true);
    expect(f.animRole).toBe('crouch_to_stand');

    landOnce(f);
    expect(f.clipId).toBe('idle');
    expect(f.animRole).toBe('main');
    expect(f.turning).toBe(false);
    expect(f.phase).toBe('idle');
  });

  it('pending turn: opens turn_std only after crouch_to_stand (rise→turn ratio 1)', () => {
    const f = new Fighter('p1', 2, 1, 10000);
    f.setStanceConfig({ crouchToStandFrames: 3 });
    f.facing = -1;
    f.visualFacing = 1;
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_f';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = true;
    f.preLandCrouchHold = false;

    landOnce(f);
    expect(f.phase).toBe('landing');

    landOnce(f);
    expect(f.turning).toBe(false);
    expect(f.animRole).toBe('crouch_to_stand');
    expect(f.pendingTurnAfterLand).toBe(true);

    landOnce(f);
    landOnce(f);
    expect(f.phase).toBe('crouch');
    expect(f.animRole).toBe('crouch_to_stand');
    expect(f.turning).toBe(false);

    landOnce(f);
    expect(f.turning).toBe(true);
    expect(f.clipId).toBe('turn_std');
    expect(f.visualFacing).toBe(-1);
    expect(f.pendingTurnAfterLand).toBe(false);
  });

  it('idle-path and turn-path land→rise ratios are independent', () => {
    const make = (pending: boolean) => {
      const f = new Fighter('p1', pending ? 2 : 0, 1, 10000);
      f.setStanceConfig({ crouchToStandFrames: 20 });
      if (pending) {
        f.facing = -1;
        f.visualFacing = 1;
        f.pendingTurnAfterLand = true;
      }
      f.phase = 'airborne';
      f.jumpPhase = 'air';
      f.jumpClipId = pending ? 'jump_f' : 'jump_n';
      f.stateTimer = 1;
      f.jumpFrame = 9;
      return f;
    };

    // Idle path: delay = floor(20 * 0.5) = 10 — still on land after hardstun
    const idle = make(false);
    const idleAdv = {
      ...adv,
      landingFrames: 3,
      landingAnimFrames: 20,
      neutralLandToRiseIdleRatio: 0.5,
      neutralLandToRiseTurnRatio: 0, // must not affect idle path
    };
    landOnce(idle, idleAdv);
    landOnce(idle, idleAdv);
    landOnce(idle, idleAdv);
    landOnce(idle, idleAdv); // hardstun end, age 3 < 10
    expect(idle.animRole).toBe('land');
    expect(idle.animTail?.animRole).toBe('land');

    // Turn path: delay = floor(20 * 0) = 0 — opens rise on first land tick
    const turn = make(true);
    const turnAdv = {
      ...adv,
      landingFrames: 3,
      landingAnimFrames: 20,
      neutralLandToRiseIdleRatio: 1, // must not affect turn path
      neutralLandToRiseTurnRatio: 0,
      neutralRiseToTurnDissolveRatio: 1,
    };
    landOnce(turn, turnAdv);
    landOnce(turn, turnAdv);
    expect(turn.animRole).toBe('crouch_to_stand');
  });

  it('rise→turn ratio 0 opens turn as soon as crouch_to_stand starts', () => {
    const f = new Fighter('p1', 2, 1, 10000);
    f.setStanceConfig({ crouchToStandFrames: 20 });
    f.facing = -1;
    f.visualFacing = 1;
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_f';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = true;

    const a = {
      ...adv,
      neutralLandToRiseTurnRatio: 0,
      neutralRiseToTurnDissolveRatio: 0,
    };
    landOnce(f, a);
    landOnce(f, a); // open rise; ratio 0 → turn same tick
    expect(f.turning).toBe(true);
    expect(f.clipId).toBe('turn_std');
    expect(f.animRole).not.toBe('crouch_to_stand');
  });

  it('rise→turn ratio scales with crouchToStandFrames (0.25 of 8 = 2f rise hold)', () => {
    const f = new Fighter('p1', 2, 1, 10000);
    f.setStanceConfig({ crouchToStandFrames: 8 });
    f.facing = -1;
    f.visualFacing = 1;
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_f';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = true;

    // delay = floor(8 * 0.25) = 2
    const a = {
      ...adv,
      landingFrames: 3,
      neutralLandToRiseTurnRatio: 0,
      neutralRiseToTurnDissolveRatio: 0.25,
    };
    landOnce(f, a); // enter land
    landOnce(f, a); // open rise age 0
    expect(f.animRole).toBe('crouch_to_stand');
    expect(f.turning).toBe(false);
    landOnce(f, a); // tick rise age→1; still rising
    expect(f.animRole).toBe('crouch_to_stand');
    expect(f.turning).toBe(false);
    // Next landing tick: age 1→2 then hardstun ends; finish sees age>=2 → turn
    landOnce(f, a);
    expect(f.turning).toBe(true);
    expect(f.clipId).toBe('turn_std');
  });

  it('preLand crouch cancels snap and keeps land until early crouch exit', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_f';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = true;
    f.preLandCrouchHold = true;

    landOnce(f);
    expect(f.phase).toBe('landing');
    expect(f.neutralLandSnap).toBe(false);

    landOnce(f, { ...adv, crouchHeld: true });
    expect(f.animRole).toBe('land');
    expect(f.turning).toBe(false);

    landOnce(f, { ...adv, crouchHeld: true });
    landOnce(f, { ...adv, crouchHeld: true });
    expect(f.phase).toBe('crouch');
    expect(f.turning).toBe(true);
    expect(f.clipId).toBe('turn_crh');
  });

  it('crossfade land → crouch_to_stand; rise → idle/turn soft', () => {
    const d = defaultCrossfadeDurations();
    expect(
      resolveCrossfadeSec('jump_f::land', 'crouch::crouch_to_stand', d),
    ).toBeGreaterThan(0);
    expect(
      resolveCrossfadeSec('crouch::crouch_to_stand', 'idle::main', d),
    ).toBeGreaterThan(0);
    expect(
      resolveCrossfadeSec('crouch::crouch_to_stand', 'turn_std::main', d),
    ).toBeGreaterThan(0);
    expect(resolveCrossfadeSec('jump_f::land', 'idle::main', d)).toBe(0);
    expect(resolveCrossfadeSec('jump_f::land', 'turn_std::main', d)).toBe(0);
  });

  it('ratio scales with landingAnimFrames on idle path (0.25 of 20 = 5f)', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceConfig({ crouchToStandFrames: 20 });
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_n';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = false;

    const a = {
      ...adv,
      landingFrames: 3,
      landingAnimFrames: 20,
      neutralLandToRiseIdleRatio: 0.25,
      neutralLandToRiseTurnRatio: 0,
    };
    landOnce(f, a);
    landOnce(f, a);
    expect(f.animRole).toBe('land');
    landOnce(f, a);
    landOnce(f, a);
    expect(f.phase).toBe('idle');
    expect(f.canAct()).toBe(true);
    expect(f.animTail?.animRole).toBe('land');
    expect(f.animTail?.visualFrame).toBe(3);
    expect(f.animTail?.animFrameCount).toBe(5);

    landOnce(f, a);
    expect(f.animTail?.visualFrame).toBe(4);
    landOnce(f, a);
    expect(f.animTail).toBeNull();
    expect(f.clipId).toBe('crouch');
    expect(f.animRole).toBe('crouch_to_stand');
  });
});

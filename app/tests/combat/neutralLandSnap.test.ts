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
  // 0 = first landing advance opens idle/turn
  neutralLandDissolveRatio: 0,
  crouchHeld: false,
};

describe('§3.13.7 neutral land dissolve ratio', () => {
  it('no turn: land hardstun opens idle without long land residual', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_n';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = false;
    f.preLandCrouchHold = false;

    f.advance(adv);
    expect(f.phase).toBe('landing');
    expect(f.animRole).toBe('land');

    f.advance(adv);
    expect(f.animTail).toBeNull();
    expect(f.clipId).toBe('idle');
    expect(f.animRole).toBe('main');
    expect(f.canAct()).toBe(false); // still landing hardstun

    f.advance(adv);
    f.advance(adv);
    expect(f.phase).toBe('idle');
    expect(f.canAct()).toBe(true);
    expect(f.animTail).toBeNull();
    expect(f.clipId).toBe('idle');
  });

  it('pending turn: opens turn_std during landing, no long land residual', () => {
    const f = new Fighter('p1', 2, 1, 10000);
    f.facing = -1;
    f.visualFacing = 1;
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_f';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = true;
    f.preLandCrouchHold = false;

    f.advance(adv);
    expect(f.phase).toBe('landing');

    f.advance(adv);
    expect(f.animTail).toBeNull();
    expect(f.turning).toBe(true);
    expect(f.clipId).toBe('turn_std');
    expect(f.visualFacing).toBe(-1);
    expect(f.pendingTurnAfterLand).toBe(false);
    expect(f.canAct()).toBe(false);

    f.advance(adv);
    f.advance(adv);
    expect(f.phase).toBe('idle');
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

    f.advance(adv);
    expect(f.phase).toBe('landing');
    expect(f.neutralLandSnap).toBe(false);

    f.advance({ ...adv, crouchHeld: true });
    expect(f.animRole).toBe('land');
    expect(f.turning).toBe(false);

    f.advance({ ...adv, crouchHeld: true });
    f.advance({ ...adv, crouchHeld: true });
    expect(f.phase).toBe('crouch');
    expect(f.turning).toBe(true);
    expect(f.clipId).toBe('turn_crh');
  });

  it('crossfade land → idle and land → turn are soft', () => {
    const d = defaultCrossfadeDurations();
    expect(resolveCrossfadeSec('jump_f::land', 'idle::main', d)).toBeGreaterThan(0);
    expect(resolveCrossfadeSec('jump_f::land', 'turn_std::main', d)).toBeGreaterThan(0);
  });

  it('ratio 0: dissolve on first landing advance', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_n';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = false;

    f.advance({ ...adv, neutralLandDissolveRatio: 0 });
    expect(f.phase).toBe('landing');
    f.advance({ ...adv, neutralLandDissolveRatio: 0 });
    expect(f.clipId).toBe('idle');
    expect(f.animRole).toBe('main');
  });

  it('ratio scales with landingAnimFrames (0.25 of 20 = 5f land hold)', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_n';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = false;

    // delay = floor(20 * 0.25) = 5
    const a = {
      ...adv,
      landingFrames: 3,
      landingAnimFrames: 20,
      neutralLandDissolveRatio: 0.25,
    };
    f.advance(a); // enter land, age will start next
    f.advance(a); // age 0→1 land
    expect(f.animRole).toBe('land');
    f.advance(a); // age 1→2
    f.advance(a); // age 2→3 hardstun ends; continue land at frame 3 until delay 5
    expect(f.phase).toBe('idle');
    expect(f.canAct()).toBe(true);
    expect(f.animTail?.animRole).toBe('land');
    expect(f.animRole).toBe('land');
    expect(f.animTail?.visualFrame).toBe(3);
    expect(f.animTail?.animFrameCount).toBe(5);

    f.advance(a);
    expect(f.animTail?.visualFrame).toBe(4);
    f.advance(a);
    expect(f.animTail).toBeNull();
    expect(f.clipId).toBe('idle');
  });

  it('ratio 1 with short land anim: holds full landAnimFrames before idle', () => {
    const f = new Fighter('p1', 0, 1, 10000);
    f.phase = 'airborne';
    f.jumpPhase = 'air';
    f.jumpClipId = 'jump_n';
    f.stateTimer = 1;
    f.jumpFrame = 9;
    f.pendingTurnAfterLand = false;

    const a = {
      ...adv,
      landingFrames: 3,
      landingAnimFrames: 4,
      neutralLandDissolveRatio: 1,
    };
    f.advance(a); // enter
    // ages 0,1,2 during hardstun → dissolve at age>=4
    f.advance(a);
    f.advance(a);
    f.advance(a); // hardstun end, age 3, continue land 3 → 4
    expect(f.animTail?.animRole).toBe('land');
    expect(f.animTail?.visualFrame).toBe(3);
    expect(f.animTail?.animFrameCount).toBe(4);
    f.advance(a);
    expect(f.animTail).toBeNull();
    expect(f.clipId).toBe('idle');
  });
});

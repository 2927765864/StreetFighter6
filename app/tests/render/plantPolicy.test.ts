import { describe, expect, it } from 'vitest';
import {
  isJumpLandBinding,
  shouldFloorClampAttackSole,
  shouldResetGroundOffset,
  shouldSnapSoleOnLand,
} from '../../src/render/plantPolicy';

describe('plantPolicy land snap', () => {
  it('recognizes jump land bindings only', () => {
    expect(isJumpLandBinding('jump_f::land')).toBe(true);
    expect(isJumpLandBinding('jump_n::air')).toBe(false);
    expect(isJumpLandBinding('ryu_jmp::main')).toBe(false);
  });

  it('does not snap while dissolving from jump attack residual', () => {
    expect(
      shouldSnapSoleOnLand({
        phase: 'landing',
        animRole: 'land',
        fromAir: true,
        enterLanding: true,
        blendingFromNonLand: true,
      }),
    ).toBe(false);
  });

  it('snaps once land pose is authoritative', () => {
    expect(
      shouldSnapSoleOnLand({
        phase: 'landing',
        animRole: 'land',
        fromAir: true,
        enterLanding: true,
        blendingFromNonLand: false,
      }),
    ).toBe(true);
  });

  it('never snaps using air / attack role', () => {
    expect(
      shouldSnapSoleOnLand({
        phase: 'landing',
        animRole: 'air',
        fromAir: true,
        enterLanding: true,
        blendingFromNonLand: false,
      }),
    ).toBe(false);
    expect(
      shouldSnapSoleOnLand({
        phase: 'idle',
        animRole: 'main',
        fromAir: true,
        enterLanding: false,
        blendingFromNonLand: false,
      }),
    ).toBe(false);
  });

  it('resets model Y when leaving air or entering landing', () => {
    expect(shouldResetGroundOffset({ fromAir: true, enterLanding: false })).toBe(
      true,
    );
    expect(shouldResetGroundOffset({ fromAir: false, enterLanding: true })).toBe(
      true,
    );
    expect(shouldResetGroundOffset({ fromAir: false, enterLanding: false })).toBe(
      false,
    );
  });
});

describe('plantPolicy attack sole floor clamp', () => {
  it('clamps grounded attack and grounded animTail', () => {
    expect(
      shouldFloorClampAttackSole({
        phase: 'attack',
        jumpPhase: 'none',
        logicY: 0,
        hasAnimTail: false,
      }),
    ).toBe(true);
    expect(
      shouldFloorClampAttackSole({
        phase: 'idle',
        jumpPhase: 'none',
        logicY: 0,
        hasAnimTail: true,
      }),
    ).toBe(true);
  });

  it('skips hop Place Y, air jump, and air-attack tail', () => {
    expect(
      shouldFloorClampAttackSole({
        phase: 'attack',
        jumpPhase: 'none',
        logicY: 0.12,
        hasAnimTail: false,
      }),
    ).toBe(false);
    expect(
      shouldFloorClampAttackSole({
        phase: 'attack',
        jumpPhase: 'air',
        logicY: 0,
        hasAnimTail: false,
      }),
    ).toBe(false);
    expect(
      shouldFloorClampAttackSole({
        phase: 'airborne',
        jumpPhase: 'air',
        logicY: 1,
        hasAnimTail: true,
        holdAirTail: true,
      }),
    ).toBe(false);
  });

  it('skips plain idle without animTail when headband is off', () => {
    expect(
      shouldFloorClampAttackSole({
        phase: 'idle',
        jumpPhase: 'none',
        logicY: 0,
        hasAnimTail: false,
      }),
    ).toBe(false);
    expect(
      shouldFloorClampAttackSole({
        phase: 'idle',
        jumpPhase: 'none',
        logicY: 0,
        hasAnimTail: false,
        headbandPhysicsEnabled: false,
      }),
    ).toBe(false);
  });

  it('clamps grounded loco while headband physics is on', () => {
    for (const phase of ['idle', 'walk', 'dash', 'crouch'] as const) {
      expect(
        shouldFloorClampAttackSole({
          phase,
          jumpPhase: 'none',
          logicY: 0,
          hasAnimTail: false,
          headbandPhysicsEnabled: true,
        }),
      ).toBe(true);
    }
  });
});

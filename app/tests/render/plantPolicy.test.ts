import { describe, expect, it } from 'vitest';
import {
  isJumpLandBinding,
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

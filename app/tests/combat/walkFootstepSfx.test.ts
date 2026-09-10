import { describe, expect, it } from 'vitest';
import {
  initialWalkFootstepClock,
  stepWalkFootstepClock,
  walkFootstepInterval,
  WALK_FOOTSTEPS_PER_LOOP,
} from '../../src/combat/sfx/WalkFootstepSfx';

describe('WalkFootstepSfx', () => {
  it('derives interval from loop length', () => {
    expect(walkFootstepInterval(114)).toBe(
      Math.round(114 / WALK_FOOTSTEPS_PER_LOOP),
    );
    expect(walkFootstepInterval(8)).toBe(2);
    expect(walkFootstepInterval(1)).toBe(1);
  });

  it('alternates L/R on interval and resets off walk drive', () => {
    let clock = initialWalkFootstepClock();
    const sides: Array<'left' | 'right'> = [];
    for (let i = 0; i < 8; i++) {
      const r = stepWalkFootstepClock(clock, {
        locoPhase: 'loop',
        enteredStart: i === 0,
        loopLen: 8,
        suppress: false,
      });
      clock = r.clock;
      if (r.side) sides.push(r.side);
    }
    // interval = 2 → emit on ticks 2,4,6,8
    expect(sides).toEqual(['left', 'right', 'left', 'right']);

    const ended = stepWalkFootstepClock(clock, {
      locoPhase: 'end',
      enteredStart: false,
      loopLen: 8,
      suppress: false,
    });
    expect(ended.side).toBeNull();
    expect(ended.clock).toEqual(initialWalkFootstepClock());
  });

  it('does not tick while suppressed (input freeze)', () => {
    let clock = initialWalkFootstepClock();
    for (let i = 0; i < 4; i++) {
      const r = stepWalkFootstepClock(clock, {
        locoPhase: 'loop',
        enteredStart: false,
        loopLen: 8,
        suppress: true,
      });
      clock = r.clock;
      expect(r.side).toBeNull();
    }
    expect(clock.tick).toBe(0);
  });
});

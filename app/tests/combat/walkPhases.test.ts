import { describe, expect, it } from 'vitest';
import {
  initialWalkState,
  shouldLocoSoftBlend,
  stepWalk,
} from '../../src/combat/loco/WalkController';

const clips = {
  walk_fwd: { start: 2, loop: 4, end: 2 },
  walk_back: { start: 2, loop: 4, end: 2 },
};

const base = {
  clips,
  forwardSpeed: 0.047,
  backSpeed: 0.032,
  firstFrameSpeedScale: 0.25,
};

describe('WalkController', () => {
  it('start → loop on hold forward', () => {
    let s = initialWalkState();
    let r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    expect(r.state.locoPhase).toBe('start');
    expect(r.enteredStart).toBe(true);
    expect(r.dxFacing).toBeCloseTo(0.047 * 0.25);
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    // after frame advance past start length 2
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    expect(r.state.locoPhase).toBe('loop');
    expect(r.state.animRole).toBe('loop');
  });

  it('release → end → idle with exitCycle01 from loop', () => {
    let s = initialWalkState();
    let r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    expect(r.state.locoPhase).toBe('loop');
    // advance loop a couple frames so exitCycle is mid-segment
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    s = r.state;
    expect(s.locoPhase).toBe('loop');
    expect(s.locoFrame).toBeGreaterThan(0);

    r = stepWalk(s, { ...base, holdFwd: false, holdBack: false });
    expect(r.state.locoPhase).toBe('end');
    expect(r.enteredEnd).toBe(true);
    expect(r.dxFacing).toBe(0);
    expect(r.state.exitCycle01).toBeGreaterThan(0);
    expect(r.state.exitCycle01).toBeLessThanOrEqual(1);
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: false, holdBack: false });
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: false, holdBack: false });
    expect(r.state.locoPhase).toBe('none');
  });

  it('shouldLocoSoftBlend only for walk/idle roles', () => {
    expect(shouldLocoSoftBlend('walk_fwd::loop', 'walk_fwd::end')).toBe(true);
    expect(shouldLocoSoftBlend('walk_fwd::end', 'idle::main')).toBe(true);
    expect(shouldLocoSoftBlend('idle::main', 'walk_fwd::start')).toBe(true);
    expect(shouldLocoSoftBlend('walk_fwd::loop', 'walk_fwd::loop')).toBe(false);
    expect(shouldLocoSoftBlend('ryu_5lp::main', 'idle::main')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  initialWalkState,
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
    expect(r.dxFacing).toBeCloseTo(0.047 * 0.25);
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    // after frame advance past start length 2
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    expect(r.state.locoPhase).toBe('loop');
    expect(r.state.animRole).toBe('loop');
  });

  it('release → end → idle', () => {
    let s = initialWalkState();
    let r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: true, holdBack: false });
    expect(r.state.locoPhase).toBe('loop');
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: false, holdBack: false });
    expect(r.state.locoPhase).toBe('end');
    expect(r.dxFacing).toBe(0);
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: false, holdBack: false });
    s = r.state;
    r = stepWalk(s, { ...base, holdFwd: false, holdBack: false });
    expect(r.state.locoPhase).toBe('none');
  });
});

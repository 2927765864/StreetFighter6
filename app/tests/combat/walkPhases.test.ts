import { describe, expect, it } from 'vitest';
import {
  beginWalkEnd,
  beginWalkStart,
  earlyReleaseEndStartFrame,
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
  earlyReleaseEndKeepRatio: 1,
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

  it('earlyReleaseEndStartFrame keeps ceil(tail) of end', () => {
    // 47 * 0.35 → remain 17 → start at 30
    expect(earlyReleaseEndStartFrame(47, 0.35)).toBe(30);
    expect(earlyReleaseEndStartFrame(47, 1)).toBe(0);
    expect(earlyReleaseEndStartFrame(47, 0.05)).toBe(44); // remain max(1, ceil(2.35))=3 → 44
  });

  it('release during start skips into end tail (keepRatio)', () => {
    const longEnd = {
      walk_fwd: { start: 5, loop: 10, end: 20 },
      walk_back: { start: 5, loop: 10, end: 20 },
    };
    let s = initialWalkState();
    let r = stepWalk(s, {
      ...base,
      clips: longEnd,
      earlyReleaseEndKeepRatio: 0.35,
      holdFwd: true,
      holdBack: false,
    });
    expect(r.state.locoPhase).toBe('start');
    s = r.state;
    // Release before loop
    r = stepWalk(s, {
      ...base,
      clips: longEnd,
      earlyReleaseEndKeepRatio: 0.35,
      holdFwd: false,
      holdBack: false,
    });
    expect(r.enteredEnd).toBe(true);
    expect(r.state.locoPhase).toBe('end');
    // remain = ceil(20*0.35)=7 → startFrame=13
    expect(r.state.locoFrame).toBe(13);
    s = r.state;
    let frames = 1; // entry frame already presented
    while (s.locoPhase === 'end') {
      r = stepWalk(s, {
        ...base,
        clips: longEnd,
        earlyReleaseEndKeepRatio: 0.35,
        holdFwd: false,
        holdBack: false,
      });
      s = r.state;
      if (s.locoPhase === 'end') frames += 1;
    }
    expect(s.locoPhase).toBe('none');
    expect(frames).toBe(7);
  });

  it('beginWalkStart / beginWalkEnd support freeze unfreeze rewind', () => {
    const s0 = beginWalkStart('fwd');
    expect(s0.locoPhase).toBe('start');
    expect(s0.locoFrame).toBe(0);
    expect(s0.clipId).toBe('walk_fwd');

    const endFull = beginWalkEnd('fwd', clips, { earlyRelease: false });
    expect(endFull.locoPhase).toBe('end');
    expect(endFull.locoFrame).toBe(0);

    const endEarly = beginWalkEnd('back', {
      walk_fwd: { start: 5, loop: 10, end: 20 },
      walk_back: { start: 5, loop: 10, end: 20 },
    }, { earlyRelease: true, keepRatio: 0.35 });
    // remain ceil(20*0.35)=7 → start 13
    expect(endEarly.locoFrame).toBe(13);
    expect(endEarly.clipId).toBe('walk_back');
  });

  it('release during loop still plays full end from frame 0', () => {
    const longEnd = {
      walk_fwd: { start: 2, loop: 4, end: 10 },
      walk_back: { start: 2, loop: 4, end: 10 },
    };
    let s = initialWalkState();
    let r = stepWalk(s, {
      ...base,
      clips: longEnd,
      earlyReleaseEndKeepRatio: 0.35,
      holdFwd: true,
      holdBack: false,
    });
    s = r.state;
    r = stepWalk(s, {
      ...base,
      clips: longEnd,
      earlyReleaseEndKeepRatio: 0.35,
      holdFwd: true,
      holdBack: false,
    });
    s = r.state;
    r = stepWalk(s, {
      ...base,
      clips: longEnd,
      earlyReleaseEndKeepRatio: 0.35,
      holdFwd: true,
      holdBack: false,
    });
    expect(r.state.locoPhase).toBe('loop');
    s = r.state;
    r = stepWalk(s, {
      ...base,
      clips: longEnd,
      earlyReleaseEndKeepRatio: 0.35,
      holdFwd: false,
      holdBack: false,
    });
    expect(r.state.locoPhase).toBe('end');
    expect(r.state.locoFrame).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';
import { remapLogicToMotionFrame } from '../../src/render/AnimScrub';

function load(id: string) {
  return parseMoveDefinition(
    JSON.parse(
      readFileSync(
        resolve(__dirname, `../../public/data/overrides/moves/${id}.json`),
        'utf8',
      ),
    ),
  );
}

describe('hadoken L/M/H animRemap (shared SPA_HADO)', () => {
  it('releases the ball on shared motion frame ~13 for all strengths', () => {
    const lp = load('ryu_hadoken_lp');
    const mp = load('ryu_hadoken_mp');
    const hp = load('ryu_hadoken_hp');
    expect(lp.animRemap?.length).toBeGreaterThan(0);
    expect(mp.animRemap?.length).toBeGreaterThan(0);
    expect(hp.animRemap?.length).toBeGreaterThan(0);
    // ShotKey action frames 15 / 13 / 11 all map to motion 13
    expect(remapLogicToMotionFrame(15, lp.animRemap)).toBeCloseTo(13, 5);
    expect(remapLogicToMotionFrame(13, mp.animRemap)).toBeCloseTo(13, 5);
    expect(remapLogicToMotionFrame(11, hp.animRemap)).toBeCloseTo(13, 5);
    // Heavy compresses startup (11 action frames cover 13 motion)
    expect(remapLogicToMotionFrame(0, hp.animRemap)).toBeCloseTo(0, 5);
    expect(remapLogicToMotionFrame(10.5, hp.animRemap)).toBeGreaterThan(12);
  });

  it('uses fabFrame as presentation length', () => {
    expect(load('ryu_hadoken_lp').animFrameCount).toBe(112);
    expect(load('ryu_hadoken_mp').animFrameCount).toBe(110);
    expect(load('ryu_hadoken_hp').animFrameCount).toBe(108);
  });
});

describe('hashogeki L/M/H animRemap + clip role', () => {
  it('light uses HADOSHO_L; medium/heavy use full main HADOSHO', () => {
    expect(load('ryu_hashogeki_lp').animRole).toBe('variant_l');
    expect(load('ryu_hashogeki_mp').animRole).toBe('main');
    expect(load('ryu_hashogeki_hp').animRole).toBe('main');
    // Heavy keeps the complete main clip (no MotionKey compress).
    expect(load('ryu_hashogeki_hp').animRemap).toBeUndefined();
    expect(load('ryu_hashogeki_hp').animFrameCount).toBe(128);
  });

  it('light skips early windup; medium remaps into strike; heavy is identity', () => {
    const lp = load('ryu_hashogeki_lp');
    const mp = load('ryu_hashogeki_mp');
    expect(remapLogicToMotionFrame(0, lp.animRemap)).toBeCloseTo(18, 5);
    expect(remapLogicToMotionFrame(0, mp.animRemap)).toBeCloseTo(14, 5);
    expect(remapLogicToMotionFrame(11, lp.animRemap)).toBeCloseTo(29, 5);
  });

  it('place curves are strength-differentiated', () => {
    const lp = load('ryu_hashogeki_lp');
    const mp = load('ryu_hashogeki_mp');
    const hp = load('ryu_hashogeki_hp');
    const sum = (m: { selfMovement?: number[] }) =>
      (m.selfMovement ?? []).reduce((a, b) => a + b, 0);
    expect(sum(lp)).toBeCloseTo(0.6912, 3);
    expect(sum(mp)).toBeCloseTo(0.7112, 3);
    expect(sum(hp)).toBeCloseTo(0.7112, 3);
  });
});

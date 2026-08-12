import { describe, expect, it } from 'vitest';
import {
  dashSpeedFromTable,
  parseRyuMovement,
} from '../../src/data/loadRyuMovement';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ryu_movement table', () => {
  const raw = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../public/data/systems/ryu_movement.json'),
      'utf8',
    ),
  );

  it('parses SuperCombo-shaped numbers', () => {
    const t = parseRyuMovement(raw);
    expect(t.walk.forwardSpeed).toBe(0.047);
    expect(t.walk.backSpeed).toBe(0.032);
    expect(t.walk.firstFrameSpeedScale).toBe(0.25);
    expect(t.dash.forward.frames).toBe(19);
    expect(t.dash.forward.distance).toBe(1.252);
    expect(t.jump.prejumpFrames + t.jump.airFrames + t.jump.landingFrames).toBe(
      45,
    );
  });

  it('average dash speed = distance / frames (for GUI)', () => {
    expect(dashSpeedFromTable({ frames: 19, distance: 1.252 })).toBeCloseTo(
      1.252 / 19,
      10,
    );
  });

  it('table loads front_heavy profile power', () => {
    const t = parseRyuMovement(raw);
    expect(t.dash.profile).toBe('front_heavy');
    expect(t.dash.frontHeavyPower).toBe(1.5);
  });
});

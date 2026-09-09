import { describe, expect, it } from 'vitest';
import { classifyFpsColor } from '../../src/debug/perf/perfMath';
import { PresentMeter } from '../../src/debug/perf/PresentMeter';

describe('PresentMeter', () => {
  it('reports integer 60 for 30 presents in 500ms', () => {
    const m = new PresentMeter();
    m.setHistoryLength(120);
    let snap = m.sample();
    // 30 frames over 500ms window (first at t=0, refresh on the 30th at t=500)
    for (let i = 0; i < 29; i++) {
      snap = m.tick(i * (500 / 30), 16.6, 1, 500);
    }
    snap = m.tick(500, 16.6, 1, 500);
    expect(snap.presentFps).toBe(60);
    expect(snap.logicHz).toBe(60);
  });

  it('tracks frameMs min/max in history', () => {
    const m = new PresentMeter();
    m.setHistoryLength(10);
    m.tick(0, 10, 1, 1000);
    m.tick(16, 20, 1, 1000);
    m.tick(32, 15, 1, 1000);
    const s = m.sample(15);
    expect(s.frameMsMin).toBe(10);
    expect(s.frameMsMax).toBe(20);
  });
});

describe('classifyFpsColor', () => {
  it('classifies ok/warn/bad', () => {
    expect(classifyFpsColor(60, 45, 30)).toBe('ok');
    expect(classifyFpsColor(40, 45, 30)).toBe('warn');
    expect(classifyFpsColor(20, 45, 30)).toBe('bad');
  });
});

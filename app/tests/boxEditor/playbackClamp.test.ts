import { describe, expect, it, vi } from 'vitest';
import { BoxEditorPlayback } from '../../src/boxEditor/playback/BoxEditorPlayback';

describe('BoxEditorPlayback', () => {
  it('clamps seek and steps with loop', () => {
    const p = new BoxEditorPlayback();
    p.setLength(13);
    p.seek(100);
    expect(p.playhead).toBe(12);
    p.seek(0);
    p.loop = true;
    p.step(-1);
    expect(p.playhead).toBe(12);
    p.step(1);
    expect(p.playhead).toBe(0);
  });

  it('play advances then loops', () => {
    vi.useFakeTimers();
    const p = new BoxEditorPlayback();
    p.setLength(3);
    p.loop = true;
    p.seek(2);
    p.play();
    vi.advanceTimersByTime(20);
    expect(p.playhead).toBe(0);
    p.dispose();
    vi.useRealTimers();
  });
});

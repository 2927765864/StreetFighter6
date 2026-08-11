import { describe, expect, it } from 'vitest';
import {
  SOLDIER_CLIPS,
  XBOT_CLIPS,
  detectProfile,
  resolveClipName,
} from '../../src/render/clipMaps';

describe('clipMaps', () => {
  it('detects soldier profile', () => {
    expect(detectProfile(['Idle', 'Run', 'TPose', 'Walk'])).toBe('soldier');
  });

  it('detects xbot profile', () => {
    expect(detectProfile(['agree', 'idle', 'walk', 'run'])).toBe('xbot');
  });

  it('detects empty as ryu', () => {
    expect(detectProfile([])).toBe('ryu');
  });

  it('resolves Walk before Idle for soldier walk candidates', () => {
    const available = ['Idle', 'Run', 'TPose', 'Walk'];
    const name = resolveClipName(available, SOLDIER_CLIPS.walk!);
    expect(name).toBe('Walk');
  });

  it('resolves xbot walk exactly', () => {
    const available = ['agree', 'idle', 'walk', 'run'];
    expect(resolveClipName(available, XBOT_CLIPS.walk!)).toBe('walk');
  });

  it('does not pick Idle when Walk is requested and present', () => {
    // regression: old fuzzy loop returned Idle first
    const available = ['Idle', 'Walk'];
    expect(resolveClipName(available, ['Walk', 'Idle'])).toBe('Walk');
  });
});

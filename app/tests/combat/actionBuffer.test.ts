import { describe, expect, it } from 'vitest';
import { ActionBuffer } from '../../src/combat/input/ActionBuffer';
import { INTENT_PRIORITY } from '../../src/combat/types';

describe('ActionBuffer', () => {
  it('expires after TTL', () => {
    const b = new ActionBuffer();
    b.set(
      {
        kind: 'normal',
        moveId: 'ryu_5lp',
        priority: INTENT_PRIORITY.normal,
        bufferClass: 'standard',
      },
      10,
      4,
    );
    expect(b.takeIfValid(15)).toBeNull();
  });

  it('higher priority replaces lower', () => {
    const b = new ActionBuffer();
    b.set(
      {
        kind: 'normal',
        moveId: 'ryu_5lp',
        priority: INTENT_PRIORITY.normal,
        bufferClass: 'standard',
      },
      1,
      10,
    );
    b.set(
      {
        kind: 'special',
        moveId: 'ryu_hadoken_lp',
        priority: INTENT_PRIORITY.special,
        bufferClass: 'standard',
      },
      2,
      10,
    );
    const t = b.takeIfValid(3);
    expect(t?.kind).toBe('special');
  });

  it('takeIfValid within window', () => {
    const b = new ActionBuffer();
    b.set(
      {
        kind: 'normal',
        moveId: 'ryu_5lp',
        priority: INTENT_PRIORITY.normal,
        bufferClass: 'standard',
      },
      10,
      4,
    );
    expect(b.takeIfValid(14)?.moveId).toBe('ryu_5lp');
  });
});

import type { DummyGuardPolicy, DummyMode } from '../types';

/**
 * D2: preset stand / crouch / block modes. No record-playback.
 * Guard policy: block_all | stand_block | crouch_block | none.
 */
export class DummyController {
  mode: DummyMode = 'stand_block';
  guardPolicy: DummyGuardPolicy = 'block_all';

  setMode(mode: DummyMode): void {
    this.mode = mode;
    if (mode === 'stand_block') this.guardPolicy = 'stand_block';
    else if (mode === 'crouch_block') this.guardPolicy = 'crouch_block';
    else this.guardPolicy = 'none';
  }

  setGuardPolicy(policy: DummyGuardPolicy): void {
    this.guardPolicy = policy;
    if (policy === 'stand_block') {
      this.mode = 'stand_block';
    } else if (policy === 'crouch_block') {
      this.mode = 'crouch_block';
    } else if (policy === 'block_all') {
      if (this.mode !== 'stand_block' && this.mode !== 'crouch_block') {
        this.mode = 'stand_block';
      }
    } else if (this.mode === 'stand_block') {
      this.mode = 'stand';
    } else if (this.mode === 'crouch_block') {
      this.mode = 'crouch';
    }
  }

  /** Contact-frame stance for block_all. */
  applyBlockAllStance(want: 'stand' | 'crouch'): void {
    this.mode = want === 'crouch' ? 'crouch_block' : 'stand_block';
    this.guardPolicy = 'block_all';
  }

  isBlocking(): boolean {
    return (
      this.guardPolicy === 'block_all' ||
      this.mode === 'stand_block' ||
      this.mode === 'crouch_block'
    );
  }

  isCrouching(): boolean {
    return this.mode === 'crouch' || this.mode === 'crouch_block';
  }
}

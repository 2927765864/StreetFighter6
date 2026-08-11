import type { DummyMode } from '../types';

/**
 * D2: preset stand / crouch / block modes. No record-playback.
 * Crouch modes may warn and map toward stand equivalents in MVP if incomplete.
 */
export class DummyController {
  mode: DummyMode = 'stand';

  setMode(mode: DummyMode): void {
    this.mode = mode;
  }

  isBlocking(): boolean {
    return this.mode === 'stand_block' || this.mode === 'crouch_block';
  }

  isCrouching(): boolean {
    return this.mode === 'crouch' || this.mode === 'crouch_block';
  }
}

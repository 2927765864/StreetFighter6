import { describe, expect, it } from 'vitest';
import { applyConfig, CONFIG } from '../../src/config/store';

/**
 * Smoke: loop flag is a first-class config field used by the editor toolbar
 * and draft persistence (full RAF loop is covered in HitVfxEditorApp).
 */
describe('hitVfxPreviewLoop', () => {
  it('defaults off and round-trips through applyConfig', () => {
    expect(CONFIG.hitVfxPreviewLoop).toBe(false);
    applyConfig({ hitVfxPreviewLoop: true });
    expect(CONFIG.hitVfxPreviewLoop).toBe(true);
    applyConfig({ hitVfxPreviewLoop: false });
    expect(CONFIG.hitVfxPreviewLoop).toBe(false);
  });
});

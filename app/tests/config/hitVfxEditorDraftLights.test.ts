import { describe, expect, it } from 'vitest';
import {
  migrateSavedConfig,
  sanitizeHitVfxEditorDraft,
} from '../../src/config/persist';
import { applyConfig, cloneConfig, CONFIG } from '../../src/config/store';
import { createDefaultLights } from '../../src/config/lightTypes';

describe('hit-vfx editor draft must not wipe lights', () => {
  it('partial draft onto live CONFIG keeps custom lights', () => {
    const custom = createDefaultLights().map((l) =>
      l.id === 'key' ? { ...l, intensity: 2.5, name: 'main-key' } : { ...l },
    );
    applyConfig({ lights: custom }, cloneConfig(CONFIG));
    expect(CONFIG.lights.find((l) => l.id === 'key')?.intensity).toBe(2.5);

    applyConfig(
      sanitizeHitVfxEditorDraft({
        hitVfxTimeScale: 0.25,
        hitVfxPaused: true,
      }),
      cloneConfig(CONFIG),
    );

    expect(CONFIG.hitVfxTimeScale).toBe(0.25);
    expect(CONFIG.hitVfxPaused).toBe(true);
    expect(CONFIG.lights.find((l) => l.id === 'key')?.intensity).toBe(2.5);
    expect(CONFIG.lights.find((l) => l.id === 'key')?.name).toBe('main-key');
  });

  it('migrateSavedConfig on a lights-less draft injects factory lights (the bug)', () => {
    const migrated = migrateSavedConfig({
      __version: 1,
      hitVfxTimeScale: 0.5,
    });
    expect(Array.isArray(migrated.lights)).toBe(true);
    expect((migrated.lights as unknown[]).length).toBeGreaterThan(0);
  });

  it('sanitizeHitVfxEditorDraft strips injected lights and unrelated keys', () => {
    const dirty = migrateSavedConfig({
      hitVfxTimeScale: 0.5,
      hitVfxPaused: true,
      lights: createDefaultLights(),
      bgColor: 0xff00ff,
    });
    const clean = sanitizeHitVfxEditorDraft(dirty);
    expect(clean.lights).toBeUndefined();
    expect(clean.bgColor).toBeUndefined();
    expect(clean.hitVfxTimeScale).toBe(0.5);
    expect(clean.hitVfxPaused).toBe(true);
  });

  it('simulates save-draft then reload: shipping lights survive draft apply', () => {
    const shippingLights = createDefaultLights().map((l) =>
      l.type === 'point' || l.id === 'key'
        ? { ...l, intensity: 3.6, name: `ship-${l.id}` }
        : { ...l, intensity: l.intensity + 0.3 },
    );
    // shipping + local
    applyConfig({ lights: shippingLights }, cloneConfig(CONFIG));
    const before = CONFIG.lights.map((l) => ({
      id: l.id,
      intensity: l.intensity,
    }));

    // draft reload path (must use sanitize, not migrateSavedConfig)
    const draftRaw = {
      __version: CONFIG.__version,
      hitVfxTimeScale: 0.25,
      hitVfxSelectedRecipeId: 'r1',
    };
    applyConfig(sanitizeHitVfxEditorDraft(draftRaw), cloneConfig(CONFIG));

    expect(CONFIG.hitVfxTimeScale).toBe(0.25);
    expect(
      CONFIG.lights.map((l) => ({ id: l.id, intensity: l.intensity })),
    ).toEqual(before);
  });
});

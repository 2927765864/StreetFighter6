import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultFlipbookBank } from '../../src/hitVfxEditor/flipbook2d/defaults';
import {
  loadFlipbookBank,
  loadFlipbookRecipe,
  loadFlipbookState,
  saveFlipbookBank,
} from '../../src/hitVfxEditor/flipbook2d/persist';

const KEY = 'sf6.flipbook2d.hit_ref_v1';
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  });
});

afterEach(() => {
  store.clear();
});

describe('flipbook 2d L/M/H recipes', () => {
  it('defaults to authored L/M/H banks (not identical copies)', () => {
    const bank = defaultFlipbookBank();
    expect(bank.L.strength).toBe('L');
    expect(bank.M.strength).toBe('M');
    expect(bank.H.strength).toBe('H');
    expect(bank.L.layers.map((l) => l.id)).toEqual(bank.M.layers.map((l) => l.id));
    expect(bank.H.layers.map((l) => l.id)).toEqual(bank.M.layers.map((l) => l.id));
    expect(bank.M.layers.map((l) => l.id)).toEqual([
      'E3_ring_smoke',
      'E4_wide_short_smoke',
      'E5_narrow_long_smoke',
      'E6_narrow_long_smoke_rtl',
      'E7_sweat_spray',
      'E7b_sweat_scatter',
      'E7c_sweat_chunks',
      'E8b1_arc_smoke',
      'E8b2_arc_smoke',
      'E8c1_right_spread_smoke',
      'E8c2_right_spread_smoke',
      'E2_near_sparks',
      'E2b_hit_sparks',
      'E1_core_flash',
    ]);
    const e5 = (s: 'L' | 'M' | 'H') =>
      bank[s].layers.find((l) => l.id === 'E5_narrow_long_smoke')!;
    expect(e5('L').scale).toBeLessThan(e5('M').scale);
    expect(e5('M').scale).toBeLessThan(e5('H').scale);
  });

  it('migrates a v1 single recipe into medium and copies it to L/H', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        id: 'hit_ref_v1',
        name: '旧配方',
        fps: 24,
        length: 17,
        layers: [
          {
            id: 'E1_core_flash',
            name: 'E1',
            enabled: true,
            z: 4,
            offsetX: 12,
            offsetY: 0,
            scale: 1.2,
            opacity: 1,
            brightness: 1,
            lift: 0,
            despill: 0.35,
            startFrame: 1,
            duration: 10,
            blend: 'add',
          },
        ],
      }),
    );
    const state = loadFlipbookState();
    expect(state.selected).toBe('M');
    expect(state.recipes.M.fps).toBe(24);
    expect(state.recipes.M.layers.find((l) => l.id === 'E1_core_flash')?.offsetX).toBe(12);
    expect(state.recipes.L.layers.find((l) => l.id === 'E1_core_flash')?.offsetX).toBe(12);
    expect(state.recipes.H.layers.find((l) => l.id === 'E1_core_flash')?.offsetX).toBe(12);
    expect(state.recipes.L.strength).toBe('L');
    expect(state.recipes.H.strength).toBe('H');
  });

  it('keeps L/M/H independent after save', () => {
    const bank = defaultFlipbookBank();
    bank.L.layers[0]!.scale = 0.5;
    bank.H.layers[0]!.scale = 2;
    saveFlipbookBank(bank, 'H');
    expect(loadFlipbookRecipe('L').layers[0]!.scale).toBe(0.5);
    expect(loadFlipbookRecipe('M').layers[0]!.scale).toBe(1);
    expect(loadFlipbookRecipe('H').layers[0]!.scale).toBe(2);
    expect(loadFlipbookState().selected).toBe('H');
    expect(loadFlipbookBank().L.layers[0]!.scale).toBe(0.5);
  });

  it('persists overCharacter and defaults missing field to true', () => {
    const bank = defaultFlipbookBank();
    bank.M.layers[0]!.overCharacter = false;
    saveFlipbookBank(bank, 'M');
    expect(loadFlipbookRecipe('M').layers[0]!.overCharacter).toBe(false);
    expect(loadFlipbookRecipe('L').layers[0]!.overCharacter).not.toBe(false);

    localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 2,
        selected: 'M',
        recipes: {
          L: bank.L,
          M: {
            ...bank.M,
            layers: bank.M.layers.map(({ overCharacter: _oc, ...rest }) => rest),
          },
          H: bank.H,
        },
      }),
    );
    expect(loadFlipbookRecipe('M').layers[0]!.overCharacter).toBe(true);
  });

  it('persists rotation / randomRotation min-max and defaults missing fields', () => {
    const bank = defaultFlipbookBank();
    bank.M.layers[0]!.rotation = 25;
    bank.M.layers[0]!.randomRotation = true;
    bank.M.layers[0]!.randomRotationMinDeg = -5;
    bank.M.layers[0]!.randomRotationMaxDeg = 40;
    saveFlipbookBank(bank, 'M');
    const loaded = loadFlipbookRecipe('M').layers[0]!;
    expect(loaded.rotation).toBe(25);
    expect(loaded.randomRotation).toBe(true);
    expect(loaded.randomRotationMinDeg).toBe(-5);
    expect(loaded.randomRotationMaxDeg).toBe(40);

    localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 2,
        selected: 'M',
        recipes: {
          L: bank.L,
          M: {
            ...bank.M,
            layers: bank.M.layers.map(
              ({
                rotation: _r,
                randomRotation: _rr,
                randomRotationMinDeg: _min,
                randomRotationMaxDeg: _max,
                ...rest
              }) => rest,
            ),
          },
          H: bank.H,
        },
      }),
    );
    const migrated = loadFlipbookRecipe('M').layers[0]!;
    expect(migrated.rotation).toBe(0);
    expect(migrated.randomRotation).toBe(false);
    expect(migrated.randomRotationMinDeg).toBe(-15);
    expect(migrated.randomRotationMaxDeg).toBe(15);
  });

  it('migrates legacy ±randomRotationDeg into min/max', () => {
    const bank = defaultFlipbookBank();
    localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 2,
        selected: 'M',
        recipes: {
          L: bank.L,
          M: {
            ...bank.M,
            layers: bank.M.layers.map(
              ({ randomRotationMinDeg: _a, randomRotationMaxDeg: _b, ...rest }) => ({
                ...rest,
                randomRotation: true,
                randomRotationDeg: 22,
              }),
            ),
          },
          H: bank.H,
        },
      }),
    );
    const layer = loadFlipbookRecipe('M').layers[0]!;
    expect(layer.randomRotation).toBe(true);
    expect(layer.randomRotationMinDeg).toBe(-22);
    expect(layer.randomRotationMaxDeg).toBe(22);
  });
});

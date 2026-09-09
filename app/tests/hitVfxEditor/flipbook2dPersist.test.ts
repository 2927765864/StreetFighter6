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
  it('defaults to three identical E1–E6 copies, tagged L/M/H', () => {
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
      'E2_near_sparks',
      'E1_core_flash',
    ]);
    expect(bank.L.layers[0]?.opacity).toBe(bank.M.layers[0]?.opacity);
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
});

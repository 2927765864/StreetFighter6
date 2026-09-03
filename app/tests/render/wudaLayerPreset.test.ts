import { describe, expect, it } from 'vitest';
import { createDefaultSimConfig } from '../../src/config/constants';
import { createDefaultRuntimeConfig } from '../../src/config/defaults';
import { mergeConfig } from '../../src/config/store';
import { rgb01ToHex } from '../../src/render/wudaParticle/wudaBodyRegions';
import {
  buildWudaCoatCfgShim,
  createDefaultWudaLayerPreset,
  createDefaultWudaLayerPresets,
  listActiveWudaLayersForSide,
  migrateFlatWudaToLayerPresets,
  normalizeWudaLayerPreset,
} from '../../src/render/wudaParticle/wudaLayerPreset';

describe('createDefaultWudaLayerPresets', () => {
  it('creates enabled P1 and P2 defaults', () => {
    const presets = createDefaultWudaLayerPresets();
    expect(presets).toHaveLength(2);
    expect(presets[0]!.id).toBe('wuda_p1_default');
    expect(presets[0]!.side).toBe('p1');
    expect(presets[0]!.name).toBe('P1 默认');
    expect(presets[0]!.enabled).toBe(true);
    expect(presets[1]!.id).toBe('wuda_p2_default');
    expect(presets[1]!.side).toBe('p2');
    expect(presets[1]!.name).toBe('P2 默认');
    expect(presets[1]!.enabled).toBe(true);
  });
});

describe('normalizeWudaLayerPreset', () => {
  it('fills defaults and clamps numeric fields', () => {
    const n = normalizeWudaLayerPreset(
      {
        id: 'custom_layer',
        name: 'Custom',
        side: 'p2',
        enabled: false,
        particleCount: 100.7,
        vertexStride: 0,
        stuckColor: 0xff00aa,
        regionWeightHead: 0.7,
      },
      3,
    );
    expect(n).not.toBeNull();
    expect(n!.id).toBe('custom_layer');
    expect(n!.name).toBe('Custom');
    expect(n!.side).toBe('p2');
    expect(n!.enabled).toBe(false);
    expect(n!.particleCount).toBe(100);
    expect(n!.vertexStride).toBe(1);
    expect(n!.stuckColor).toBe(0xff00aa);
    expect(n!.regionWeightHead).toBeCloseTo(0.7);
    expect(n!.particleCount).toBeGreaterThanOrEqual(0);
  });

  it('returns null for non-objects and synthesizes id/name when missing', () => {
    expect(normalizeWudaLayerPreset(null, 0)).toBeNull();
    expect(normalizeWudaLayerPreset([], 0)).toBeNull();
    const n = normalizeWudaLayerPreset({ side: 'p1' }, 2);
    expect(n!.id).toBe('wuda_layer_2');
    expect(n!.name).toBe('P1 层 3');
  });
});

describe('buildWudaCoatCfgShim', () => {
  it('maps layer fields to wuda* keys and ANDs enabled', () => {
    const global = {
      wudaEnabled: true,
      wudaAttachMode: 'vertexGpuBake' as const,
      wudaCoverMode: 'largestMesh' as const,
      wudaCoverMeshMinVerts: 128,
    };
    const layer = createDefaultWudaLayerPreset('p1', {
      id: 'layer_a',
      enabled: true,
    });
    layer.particleCount = 256;
    layer.stuckColor = 0x112233;
    layer.freeColor = 0x445566;
    layer.vertexStride = 3;
    layer.alsoPlumeBurst = true;
    layer.detachOnlyOnActiveHit = true;
    layer.regionWeightHead = 0.5;
    layer.regionWeightTorso = 0.5;
    layer.regionWeightLimbRoot = 0;
    layer.regionWeightLimbTip = 0;

    const shim = buildWudaCoatCfgShim(global, layer);
    expect(shim.wudaEnabled).toBe(true);
    expect(shim.wudaAttachMode).toBe('vertexGpuBake');
    expect(shim.wudaCoverMode).toBe('largestMesh');
    expect(shim.wudaCoverMeshMinVerts).toBe(128);
    expect(shim.wudaParticleCount).toBe(256);
    expect(shim.wudaStuckColor).toBe(0x112233);
    expect(shim.wudaFreeColor).toBe(0x445566);
    expect(shim.wudaVertexStride).toBe(3);
    expect(shim.wudaAlsoPlumeBurst).toBe(true);
    expect(shim.wudaDetachOnlyOnActiveHit).toBe(true);
    expect(shim.wudaP1RegionWeightHead).toBeCloseTo(0.5);
    expect(shim.wudaP2RegionWeightHead).toBeCloseTo(0.5);

    const offGlobal = buildWudaCoatCfgShim(
      { ...global, wudaEnabled: false },
      layer,
    );
    expect(offGlobal.wudaEnabled).toBe(false);

    const offLayer = buildWudaCoatCfgShim(global, {
      ...layer,
      enabled: false,
    });
    expect(offLayer.wudaEnabled).toBe(false);
  });
});

describe('listActiveWudaLayersForSide', () => {
  it('filters by side and enabled; empty when global off', () => {
    const presets = [
      createDefaultWudaLayerPreset('p1', { id: 'a', enabled: true }),
      createDefaultWudaLayerPreset('p1', { id: 'b', enabled: false }),
      createDefaultWudaLayerPreset('p2', { id: 'c', enabled: true }),
    ];
    expect(listActiveWudaLayersForSide(presets, 'p1', true).map((p) => p.id)).toEqual([
      'a',
    ]);
    expect(listActiveWudaLayersForSide(presets, 'p2', true).map((p) => p.id)).toEqual([
      'c',
    ]);
    expect(listActiveWudaLayersForSide(presets, 'p1', false)).toEqual([]);
  });
});

describe('migrateFlatWudaToLayerPresets', () => {
  it('migrates flat incoming into p1/p2 layer presets', () => {
    const layers = migrateFlatWudaToLayerPresets({
      wudaParticleCount: 777,
      wudaStuckColor: 0xabcdef,
      wudaFreeColor: 0x123456,
      wudaAlsoPlumeBurst: true,
      wudaDetachOnlyOnActiveHit: true,
      wudaVertexStride: 4,
      wudaP1RegionWeightHead: 0.8,
      wudaP1RegionWeightTorso: 0.2,
      wudaP1RegionWeightLimbRoot: 0,
      wudaP1RegionWeightLimbTip: 0,
      wudaP2RegionWeightHead: 0,
      wudaP2RegionWeightTorso: 0,
      wudaP2RegionWeightLimbRoot: 0.3,
      wudaP2RegionWeightLimbTip: 0.7,
    });
    expect(layers).toHaveLength(2);
    const [p1, p2] = layers;
    expect(p1!.id).toBe('wuda_p1_default');
    expect(p2!.id).toBe('wuda_p2_default');
    expect(p1!.particleCount).toBe(777);
    expect(p2!.particleCount).toBe(777);
    expect(p1!.stuckColor).toBe(0xabcdef);
    expect(p1!.alsoPlumeBurst).toBe(true);
    expect(p1!.detachOnlyOnActiveHit).toBe(true);
    expect(p1!.vertexStride).toBe(4);
    expect(p1!.regionWeightHead).toBeCloseTo(0.8);
    expect(p2!.regionWeightLimbTip).toBeCloseTo(0.7);
  });
});

describe('mergeConfig flat shipping-like object', () => {
  it('produces layer presets from flat wuda keys', () => {
    const base = createDefaultRuntimeConfig();
    const merged = mergeConfig(base, {
      wudaEnabled: true,
      wudaParticleCount: 640,
      wudaStuckColor: 0xaabbcc,
      wudaFreeColor: 0xddeeff,
      wudaAlsoPlumeBurst: true,
      wudaDetachOnlyOnHitstun: true,
      wudaRegionWeightHead: 0.4,
      wudaRegionWeightTorso: 0.3,
      wudaRegionWeightLimbRoot: 0.2,
      wudaRegionWeightLimbTip: 0.1,
      wudaStuckColorR: 0.1,
      wudaStuckColorG: 0.2,
      wudaStuckColorB: 0.3,
    });
    expect(merged.wudaEnabled).toBe(true);
    expect(merged.wudaLayerPresets).toHaveLength(2);
    expect(merged.wudaActiveLayerPresetId).toBe('wuda_p1_default');
    const p1 = merged.wudaLayerPresets.find((l) => l.id === 'wuda_p1_default')!;
    const p2 = merged.wudaLayerPresets.find((l) => l.id === 'wuda_p2_default')!;
    expect(p1.particleCount).toBe(640);
    expect(p2.particleCount).toBe(640);
    // Explicit hex wins over RGB floats when both present in migrate path
    // (RGB only fills when stuckColor is absent). Here stuckColor is set.
    expect(p1.stuckColor).toBe(0xaabbcc);
    expect(p1.freeColor).toBe(0xddeeff);
    expect(p1.alsoPlumeBurst).toBe(true);
    expect(p1.detachOnlyOnHitstun).toBe(true);
    expect(p1.regionWeightHead).toBeCloseTo(0.4);
    expect(p2.regionWeightLimbTip).toBeCloseTo(0.1);
  });

  it('migrates RGB floats when hex colors are absent', () => {
    const base = createDefaultRuntimeConfig();
    const merged = mergeConfig(base, {
      wudaParticleCount: 100,
      wudaStuckColorR: 0.45,
      wudaStuckColorG: 0.65,
      wudaStuckColorB: 0.85,
    });
    const p1 = merged.wudaLayerPresets[0]!;
    expect(p1.stuckColor).toBe(rgb01ToHex(0.45, 0.65, 0.85));
  });

  it('keeps factory layer shape on createDefaultSimConfig', () => {
    const cfg = createDefaultSimConfig();
    expect(cfg.wudaLayerPresets.map((p) => p.id)).toEqual([
      'wuda_p1_default',
      'wuda_p2_default',
    ]);
  });
});

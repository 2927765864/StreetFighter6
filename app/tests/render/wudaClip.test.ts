import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDefaultSimConfig } from '../../src/config/constants';
import { mergeConfig } from '../../src/config/store';
import {
  WUDA_CLIP_END_IDLE_PRESENTS,
  WudaClipRecorder,
  parseWudaClip,
  serializeWudaClip,
  worldSamplesToOriginLocal,
  packWudaClipFrame,
} from '../../src/render/wudaParticle/wudaClip';
import { buildWudaCoatCfgShim, createDefaultWudaLayerPreset } from '../../src/render/wudaParticle/wudaLayerPreset';
import type { WudaDrawSample } from '../../src/render/wudaParticle/wudaInstanceWrite';

function sample(partial: Partial<WudaDrawSample>): WudaDrawSample {
  return {
    index: 0,
    x: 1,
    y: 2,
    z: 3,
    vx: 0.5,
    vy: 0,
    vz: 0,
    size: 0.02,
    aspect: 1,
    spin: 0,
    opacity: 0.8,
    stuck: false,
    cr: 1,
    cg: 0.5,
    cb: 0.2,
    ...partial,
  };
}

function shim() {
  return buildWudaCoatCfgShim(
    {
      wudaEnabled: true,
      wudaAttachMode: 'surfaceBary',
      wudaCoverMode: 'allMeshes',
      wudaCoverMeshMinVerts: 0,
      timeScaleAnim: 1,
    },
    createDefaultWudaLayerPreset('p1'),
  );
}

describe('wudaPlayMode config', () => {
  it('defaults to live and mergeConfig only accepts live|clip', () => {
    const cfg = createDefaultSimConfig();
    expect(cfg.wudaPlayMode).toBe('live');
    const base = {
      ...cfg,
      __version: 0,
      expandedSections: {} as never,
    };
    expect(mergeConfig(base, { wudaPlayMode: 'clip' }).wudaPlayMode).toBe('clip');
    expect(mergeConfig(base, { wudaPlayMode: 'nope' }).wudaPlayMode).toBe('live');
  });
});

describe('wuda clip codec', () => {
  it('roundtrips packed samples through JSON', () => {
    const origin = new THREE.Matrix4().makeTranslation(10, 0, 0);
    const local = worldSamplesToOriginLocal([sample({ x: 11, y: 2, z: 3 })], origin);
    expect(local[0]!.x).toBeCloseTo(1);
    expect(local[0]!.y).toBeCloseTo(2);
    const rec = new WudaClipRecorder();
    rec.arm();
    rec.feed({
      layerId: 'L',
      samples: [sample({ x: 11, y: 2, z: 3 })],
      instanceCap: 8,
      dt: 1 / 60,
      originWorld: origin,
      cfg: shim(),
      allowDetach: true,
      viewKey: 'p2',
    });
    rec.feed({
      layerId: 'L',
      samples: [sample({ x: 11.1, y: 2, z: 3, size: 0.01 })],
      instanceCap: 8,
      dt: 1 / 60,
      originWorld: origin,
      cfg: shim(),
      allowDetach: true,
      viewKey: 'p2',
    });
    const clip = rec.finish();
    expect(clip).not.toBeNull();
    const json = serializeWudaClip(clip!);
    const parsed = parseWudaClip(json);
    expect(parsed?.layers[0]?.frames.length).toBe(2);
    expect(parsed?.layers[0]?.counts[0]).toBe(1);
    const packed = parsed!.layers[0]!.frames[0]!;
    expect(packed[1]).toBeCloseTo(1);
  });

  it('pack stride is 15 floats per sample', () => {
    const packed = packWudaClipFrame([sample({ index: 3 })]);
    expect(packed.length).toBe(15);
    expect(packed[0]).toBe(3);
  });
});

describe('WudaClipRecorder', () => {
  it('ignores the other fighter while recording', () => {
    const rec = new WudaClipRecorder();
    rec.arm();
    const origin = new THREE.Matrix4();
    rec.feed({
      layerId: 'A',
      samples: [sample({})],
      instanceCap: 4,
      dt: 1 / 60,
      originWorld: origin,
      cfg: shim(),
      allowDetach: true,
      viewKey: 'p2',
    });
    rec.feed({
      layerId: 'B',
      samples: [sample({ index: 9 })],
      instanceCap: 4,
      dt: 1 / 60,
      originWorld: origin,
      cfg: shim(),
      allowDetach: true,
      viewKey: 'p1',
    });
    const clip = rec.finish();
    expect(clip?.layers.map((l) => l.id)).toEqual(['A']);
  });

  it('ends after idle presents without free particles', () => {
    const rec = new WudaClipRecorder();
    rec.arm();
    const origin = new THREE.Matrix4();
    const opts = {
      layerId: 'A',
      instanceCap: 4,
      dt: 1 / 60,
      originWorld: origin,
      cfg: shim(),
      allowDetach: true,
      viewKey: 'p2',
    };
    rec.feed({ ...opts, samples: [sample({ stuck: false })] });
    let clip = rec.endPresent('p2');
    expect(clip).toBeNull();
    for (let i = 0; i < WUDA_CLIP_END_IDLE_PRESENTS; i++) {
      rec.feed({
        ...opts,
        samples: [sample({ stuck: true, size: 0.01 })],
      });
      clip = rec.endPresent('p2');
    }
    expect(clip).not.toBeNull();
    expect(clip!.layers[0]!.frames.length).toBe(1 + WUDA_CLIP_END_IDLE_PRESENTS);
  });
});

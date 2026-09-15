import { describe, expect, it } from 'vitest';
import {
  applyWudaClipShipping,
  stringifyPresetEnvelope,
} from '../../src/config/persist';
import { isPresetEnvelope } from '../../src/config/types';
import {
  parseWudaClip,
  serializeWudaClip,
  wudaClipHub,
  type WudaParticleClip,
} from '../../src/render/wudaParticle/wudaClip';

function tinyClip(): WudaParticleClip {
  return {
    version: 1,
    appearance: {
      graphicKind: 'disc',
      blendAdditive: false,
      flightCompress: 0,
      seed: 1,
      ellipseAspectJitter: 0,
      stuckOpacity: 0,
      freeOpacity: 0.8,
      stuckColor: 1,
      freeColor: 2,
    },
    origin: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    layers: [
      {
        id: 'L',
        instanceCap: 4,
        frames: [Float32Array.from([0, 1, 2, 3, 0, 0, 0, 0.02, 1, 0, 0.5, 0, 1, 1, 1])],
        counts: [1],
        dts: [1 / 60],
      },
    ],
  };
}

describe('wuda clip shipping envelope', () => {
  it('keeps wudaClip compact inside pretty JSON', () => {
    const clip = serializeWudaClip(tinyClip());
    const text = stringifyPresetEnvelope({
      type: 'runtime-control-preset',
      version: 1,
      name: 'shipping',
      config: { wudaEnabled: true },
      wudaClip: clip,
    });
    expect(text.includes('\n  "wudaClip": {')).toBe(true);
    expect(text.includes('\n      "version"')).toBe(false);
    const parsed = JSON.parse(text) as unknown;
    expect(isPresetEnvelope(parsed)).toBe(true);
    expect(parseWudaClip((parsed as { wudaClip: unknown }).wudaClip)?.layers[0]?.counts[0]).toBe(
      1,
    );
  });

  it('applyWudaClipShipping loads factory clip without requiring localStorage write', () => {
    wudaClipHub.applyFactoryClip(null);
    applyWudaClipShipping(serializeWudaClip(tinyClip()));
    expect(wudaClipHub.clip?.layers[0]?.id).toBe('L');
    expect(wudaClipHub.status).toMatch(/shipping/);
  });
});

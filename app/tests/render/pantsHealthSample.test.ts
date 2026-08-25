import { describe, expect, it } from 'vitest';
import {
  classifyPantsHealth,
  formatPantsHealthMarkdown,
  pantsHealthAbnormalRisingEdge,
  samplePantsHealth,
} from '../../src/render/pants/pantsHealthSample';
import type { PantsParticle } from '../../src/render/pants/spcr/PantsSpcrTypes';
import * as THREE from 'three';

const params = {
  pantsHardness: 0.12,
  pantsGravityPower: 1,
  pantsResistance: 0.82,
  pantsMaxSeparation: 0.55,
  pantsRootSlideLimit: 0.35,
  pantsRootRotateLimitDeg: 35,
};

function freeAt(sep: number): PantsParticle {
  const bone = new THREE.Bone();
  return {
    bone,
    chainId: 'L_PantsA_00',
    region: 'thigh',
    depth: 0,
    isFixed: false,
    boneAxis: new THREE.Vector3(0, -1, 0),
    initialLocalRotation: new THREE.Quaternion(),
    transformLocalQuat: new THREE.Quaternion(),
    positionCurrent: new THREE.Vector3(sep, 0, 0),
    positionPrevious: new THREE.Vector3(sep, 0, 0),
    transformPos: new THREE.Vector3(0, 0, 0),
    aimBone: null,
    bindLocalPos: null,
    bindLocalQuat: null,
  };
}

describe('pantsHealthSample', () => {
  it('classifies ok / warn / abnormal from separation', () => {
    expect(
      classifyPantsHealth({
        enabled: true,
        bound: true,
        maxSeparation: 0.1,
        abnormalThreshold: 0.55,
        warnRatio: 0.55,
      }),
    ).toBe('ok');
    expect(
      classifyPantsHealth({
        enabled: true,
        bound: true,
        maxSeparation: 0.35,
        abnormalThreshold: 0.55,
        warnRatio: 0.55,
      }),
    ).toBe('warn');
    expect(
      classifyPantsHealth({
        enabled: true,
        bound: true,
        maxSeparation: 0.55,
        abnormalThreshold: 0.55,
        warnRatio: 0.55,
      }),
    ).toBe('abnormal');
    expect(
      classifyPantsHealth({
        enabled: false,
        bound: true,
        maxSeparation: 1,
        abnormalThreshold: 0.55,
        warnRatio: 0.55,
      }),
    ).toBe('disabled');
  });

  it('samples maxSeparation from free particles', () => {
    const snap = samplePantsHealth({
      enabled: true,
      bound: true,
      fighterId: 'p1',
      particles: [freeAt(0.4)],
      constraints: [],
      warnRatio: 0.55,
      abnormalThreshold: 0.55,
      warpCountSession: 1,
      clampCountSession: 2,
      lastEvent: 'separation-clamp',
      params,
    });
    expect(snap.maxSeparation).toBeCloseTo(0.4, 5);
    expect(snap.status).toBe('warn');
    expect(snap.warpCountSession).toBe(1);
  });

  it('detects abnormal rising edge once', () => {
    expect(pantsHealthAbnormalRisingEdge(null, 'abnormal')).toBe(true);
    expect(pantsHealthAbnormalRisingEdge('ok', 'abnormal')).toBe(true);
    expect(pantsHealthAbnormalRisingEdge('warn', 'abnormal')).toBe(true);
    expect(pantsHealthAbnormalRisingEdge('abnormal', 'abnormal')).toBe(false);
    expect(pantsHealthAbnormalRisingEdge('abnormal', 'ok')).toBe(false);
  });

  it('formats markdown with status and maxSeparation', () => {
    const snap = samplePantsHealth({
      enabled: true,
      bound: true,
      fighterId: 'p1',
      particles: [freeAt(0.1)],
      constraints: [],
      warnRatio: 0.55,
      abnormalThreshold: 0.55,
      warpCountSession: 0,
      clampCountSession: 0,
      lastEvent: '',
      params,
    });
    const md = formatPantsHealthMarkdown('测试', snap, '手感备注');
    expect(md).toContain('status');
    expect(md).toContain('maxSeparation');
    expect(md).toContain('手感备注');
  });
});

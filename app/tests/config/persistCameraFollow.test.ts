import { describe, expect, it } from 'vitest';
import {
  migrateSavedCameraEdgeMargin,
  migrateSavedCameraFollow,
  migrateSavedStageWidth,
} from '../../src/config/persist';

describe('migrateSavedCameraFollow', () => {
  it('drops factory lerp=0 when deadzone field is absent', () => {
    const out = migrateSavedCameraFollow({ cameraLerp: 0, cameraZ: 11 });
    expect(out.cameraLerp).toBeUndefined();
    expect(out.cameraZ).toBe(11);
  });

  it('keeps an explicit lerp when deadzone already exists', () => {
    const out = migrateSavedCameraFollow({
      cameraLerp: 0,
      cameraFollowDeadzone: 0.2,
    });
    expect(out.cameraLerp).toBe(0);
  });

  it('keeps a tuned lerp from old saves', () => {
    const out = migrateSavedCameraFollow({ cameraLerp: 0.3 });
    expect(out.cameraLerp).toBe(0.3);
  });
});

describe('migrateSavedStageWidth', () => {
  it('derives stageWidth from legacy min/max', () => {
    const out = migrateSavedStageWidth({ stageMinX: -4.5, stageMaxX: 4.5 });
    expect(out.stageWidth).toBe(9);
    expect(out.stageMinX).toBe(-4.5);
    expect(out.stageMaxX).toBe(4.5);
  });

  it('keeps explicit stageWidth and mirrors min/max', () => {
    const out = migrateSavedStageWidth({ stageWidth: 12, stageMinX: -1, stageMaxX: 1 });
    expect(out.stageWidth).toBe(12);
    expect(out.stageMinX).toBe(-6);
    expect(out.stageMaxX).toBe(6);
  });
});

describe('migrateSavedCameraEdgeMargin', () => {
  it('folds charHalf + ndcPad*stageHalf when edgeMargin missing', () => {
    const out = migrateSavedCameraEdgeMargin({
      cameraCharHalfExtent: 0.35,
      cameraNdcPad: 0.2,
      stageWidth: 9,
    });
    expect(out.cameraEdgeMargin).toBeCloseTo(0.35 + 0.2 * 4.5, 6);
  });

  it('keeps explicit cameraEdgeMargin', () => {
    const out = migrateSavedCameraEdgeMargin({
      cameraEdgeMargin: 0.8,
      cameraCharHalfExtent: 0.35,
      cameraNdcPad: 0.2,
    });
    expect(out.cameraEdgeMargin).toBe(0.8);
  });
});

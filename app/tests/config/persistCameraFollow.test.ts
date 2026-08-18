import { describe, expect, it } from 'vitest';
import { migrateSavedCameraFollow } from '../../src/config/persist';

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

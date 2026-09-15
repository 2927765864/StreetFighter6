/**
 * CMOS screen-shake — Three.js camera adapter.
 *
 * Kernel stays engine-free; this layer steps the model and applies FOV
 * plus camera-local position offset after `applyFightCamera`.
 */

import type { PerspectiveCamera } from 'three';
import { CONFIG } from '../config/store';
import {
  CmosScreenShake,
  type CmosShakePresetId,
  type ImpulseArgs,
  type PresetOverride,
} from '../motion/CmosScreenShake';

export class ScreenShakeFx {
  readonly model = new CmosScreenShake();

  play(id: CmosShakePresetId, override?: Partial<PresetOverride>): void {
    this.model.play(id, override);
  }

  impulse(args: ImpulseArgs): void {
    this.model.impulse(args);
  }

  hardReset(): void {
    this.model.hardReset();
  }

  /**
   * Integrate shake with presentation dt (seconds).
   * Default: wall-clock (not scaled by game/hitstop); optional useGameSpeed.
   */
  step(dtSec: number, gameSpeed = 1): void {
    const cfg = CONFIG.cmosShake;
    if (!cfg?.enabled) {
      this.model.hardReset();
      return;
    }
    let t = Math.max(0, dtSec);
    if (cfg.useGameSpeed) {
      const speed =
        typeof gameSpeed === 'number' && Number.isFinite(gameSpeed) && gameSpeed > 0
          ? gameSpeed
          : 1;
      t *= speed;
    }
    this.model.step(t);
  }

  /**
   * FOV + 相机局部位移。需在 applyFightCamera 写完基础 pose/fov 之后调用。
   * 位移沿相机局部轴：+X 右、+Y 上、+Z 相机后方（Three.js 约定）。
   */
  applyToCamera(camera: PerspectiveCamera): void {
    const { fov, offset } = this.model.getOutput();
    if (fov !== 0) {
      camera.fov += fov;
      camera.updateProjectionMatrix();
    }
    if (offset.x !== 0 || offset.y !== 0 || offset.z !== 0) {
      camera.translateX(offset.x);
      camera.translateY(offset.y);
      camera.translateZ(offset.z);
      camera.updateMatrixWorld();
    }
  }

  /** ControlPanel `action:cmosShake:*` handler. */
  handleAction(key: string): void {
    const playPrefix = 'action:cmosShake:play:';
    if (key.startsWith(playPrefix)) {
      this.play(key.slice(playPrefix.length));
      return;
    }
    switch (key) {
      case 'action:cmosShake:tap':
        this.play('tap');
        break;
      case 'action:cmosShake:tick':
        this.play('tick');
        break;
      case 'action:cmosShake:impact':
        this.play('impact');
        break;
      case 'action:cmosShake:heavy':
        this.play('heavy');
        break;
      case 'action:cmosShake:error':
        this.play('error');
        break;
      case 'action:cmosShake:burstTick': {
        for (let i = 0; i < 5; i += 1) {
          window.setTimeout(() => this.play('tick'), i * 50);
        }
        break;
      }
      case 'action:cmosShake:custom': {
        const d = CONFIG.cmosShake.debugImpulse;
        this.impulse({
          impulseVelDeg: d.impulseVelDeg,
          impulsePosDeg: d.impulsePosDeg,
        });
        break;
      }
      case 'action:cmosShake:reset':
        this.hardReset();
        break;
      default:
        console.warn('[cmosShake] unknown action', key);
    }
  }
}

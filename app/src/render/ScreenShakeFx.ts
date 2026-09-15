/**
 * CMOS screen-shake — Three.js camera adapter.
 *
 * Kernel stays engine-free; this layer steps the model and applies FOV
 * offset onto the fight camera after `applyFightCamera`.
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
   * FOV offset after fight pose is applied.
   * 相对基础 fov 的度偏移（正=变宽）；需在 applyFightCamera 写完基础 fov 之后调用。
   */
  applyToCamera(camera: PerspectiveCamera): void {
    const { fov } = this.model.getOutput();
    if (fov === 0) return;
    camera.fov += fov;
    camera.updateProjectionMatrix();
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

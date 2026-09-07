/**
 * CMOS screen-shake — Three.js camera adapter.
 *
 * Kernel stays engine-free; this layer steps the model and applies absolute
 * view-plane offsets onto the fight camera after `applyFightCamera`.
 * Screen convention matches the CMOS contract: +X right, +Y down.
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
   * Absolute camera offset after fight pose is applied.
   * +X → camera local right; +Y (screen-down) → camera local −up; roll on local Z.
   */
  applyToCamera(camera: PerspectiveCamera): void {
    const { x, y, rotation } = this.model.getOutput();
    if (x === 0 && y === 0 && rotation === 0) return;
    camera.translateX(x);
    camera.translateY(-y);
    camera.rotateZ(-rotation);
    camera.updateMatrixWorld(true);
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
        const sample = (a: number, b: number): number => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 0;
          if (hi <= lo) return lo;
          return lo + Math.random() * (hi - lo);
        };
        const angleDeg = d.dirRandom
          ? sample(d.dirAngleMin, d.dirAngleMax)
          : d.dirAngleDeg;
        this.impulse({
          angleDeg,
          radius: d.dirRadius,
          strength: d.strength,
          spin: d.spin,
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

import type { MutableSimConfig } from '../../config/constants';
import { rgb01ToHex } from './wudaBodyRegions';

/** Dust-leaning panel preset (shared runtime; writes cfg fields). */
export function applyWudaPresetDust(cfg: MutableSimConfig): void {
  cfg.wudaGravityPower = 9.8;
  cfg.wudaDrag = 1.5;
  cfg.wudaFreeLifetime = 0.6;
  cfg.wudaStuckSize = 0.008;
  cfg.wudaFreeSize = 0.012;
  cfg.wudaStuckOpacity = 0.55;
  cfg.wudaFreeOpacity = 0.85;
  cfg.wudaStuckColor = rgb01ToHex(0.65, 0.6, 0.5);
  cfg.wudaFreeColor = rgb01ToHex(0.75, 0.7, 0.6);
  cfg.wudaBlendAdditive = false;
}

/** Liquid-leaning preset. */
export function applyWudaPresetWater(cfg: MutableSimConfig): void {
  cfg.wudaGravityPower = 14;
  cfg.wudaDrag = 0.8;
  cfg.wudaFreeLifetime = 0.85;
  cfg.wudaStuckSize = 0.006;
  cfg.wudaFreeSize = 0.01;
  cfg.wudaStuckOpacity = 0.45;
  cfg.wudaFreeOpacity = 0.9;
  cfg.wudaStuckColor = rgb01ToHex(0.45, 0.65, 0.85);
  cfg.wudaFreeColor = rgb01ToHex(0.55, 0.75, 0.95);
  cfg.wudaBlendAdditive = false;
}

/** Gas-leaning preset. */
export function applyWudaPresetGas(cfg: MutableSimConfig): void {
  cfg.wudaGravityPower = 1.2;
  cfg.wudaDrag = 3.5;
  cfg.wudaFreeLifetime = 1.2;
  cfg.wudaStuckSize = 0.014;
  cfg.wudaFreeSize = 0.022;
  cfg.wudaStuckOpacity = 0.25;
  cfg.wudaFreeOpacity = 0.4;
  cfg.wudaStuckColor = rgb01ToHex(0.85, 0.85, 0.88);
  cfg.wudaFreeColor = rgb01ToHex(0.9, 0.9, 0.92);
  cfg.wudaBlendAdditive = true;
}

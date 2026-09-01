import type { MutableSimConfig } from '../../config/constants';

/** Dust-leaning panel preset (shared runtime; writes cfg fields). */
export function applyWudaPresetDust(cfg: MutableSimConfig): void {
  cfg.wudaGravityPower = 9.8;
  cfg.wudaDrag = 1.5;
  cfg.wudaFreeLifetime = 0.6;
  cfg.wudaStuckSize = 0.008;
  cfg.wudaFreeSize = 0.012;
  cfg.wudaStuckOpacity = 0.55;
  cfg.wudaFreeOpacity = 0.85;
  cfg.wudaStuckColorR = 0.65;
  cfg.wudaStuckColorG = 0.6;
  cfg.wudaStuckColorB = 0.5;
  cfg.wudaFreeColorR = 0.75;
  cfg.wudaFreeColorG = 0.7;
  cfg.wudaFreeColorB = 0.6;
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
  cfg.wudaStuckColorR = 0.45;
  cfg.wudaStuckColorG = 0.65;
  cfg.wudaStuckColorB = 0.85;
  cfg.wudaFreeColorR = 0.55;
  cfg.wudaFreeColorG = 0.75;
  cfg.wudaFreeColorB = 0.95;
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
  cfg.wudaStuckColorR = 0.85;
  cfg.wudaStuckColorG = 0.85;
  cfg.wudaStuckColorB = 0.88;
  cfg.wudaFreeColorR = 0.9;
  cfg.wudaFreeColorG = 0.9;
  cfg.wudaFreeColorB = 0.92;
  cfg.wudaBlendAdditive = true;
}

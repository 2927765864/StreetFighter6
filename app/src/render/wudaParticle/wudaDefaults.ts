import { rgb01ToHex } from './wudaBodyRegions';
import type { WudaLayerPreset } from './wudaLayerPreset';

/** Dust-leaning look — writes into one layer preset. */
export function applyWudaPresetDust(layer: WudaLayerPreset): void {
  layer.gravityPower = 9.8;
  layer.drag = 1.5;
  layer.freeLifetime = 0.6;
  layer.stuckSize = 0.008;
  layer.freeSize = 0.012;
  layer.stuckOpacity = 0.55;
  layer.freeOpacity = 0.85;
  layer.stuckColor = rgb01ToHex(0.65, 0.6, 0.5);
  layer.freeColor = rgb01ToHex(0.75, 0.7, 0.6);
  layer.blendAdditive = false;
}

/** Liquid-leaning look. */
export function applyWudaPresetWater(layer: WudaLayerPreset): void {
  layer.gravityPower = 14;
  layer.drag = 0.8;
  layer.freeLifetime = 0.85;
  layer.stuckSize = 0.006;
  layer.freeSize = 0.01;
  layer.stuckOpacity = 0.45;
  layer.freeOpacity = 0.9;
  layer.stuckColor = rgb01ToHex(0.45, 0.65, 0.85);
  layer.freeColor = rgb01ToHex(0.55, 0.75, 0.95);
  layer.blendAdditive = false;
}

/** Gas-leaning look. */
export function applyWudaPresetGas(layer: WudaLayerPreset): void {
  layer.gravityPower = 1.2;
  layer.drag = 3.5;
  layer.freeLifetime = 1.2;
  layer.stuckSize = 0.014;
  layer.freeSize = 0.022;
  layer.stuckOpacity = 0.25;
  layer.freeOpacity = 0.4;
  layer.stuckColor = rgb01ToHex(0.85, 0.85, 0.88);
  layer.freeColor = rgb01ToHex(0.9, 0.9, 0.92);
  layer.blendAdditive = true;
}

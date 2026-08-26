import { createDefaultSimConfig } from './constants';
import type { ExpandedSections, RuntimeConfig } from './types';
import { CONFIG_VERSION } from './types';

export function defaultExpandedSections(): ExpandedSections {
  return {
    sim: true,
    matchTools: true,
    inputBuffer: false,
    cancelHitstop: false,
    guardPush: true,
    locomotion: true,
    renderBoxes: true,
    camera: true,
    lighting: true,
    animDrive: false,
    commandProbe: false,
    moveEdit: false,
    animTest: false,
    headband: true,
    belt: true,
    pants: true,
    hitVfx: true,
    extendedSim: false,
    extendedLoco: false,
    extendedAnim: false,
  };
}

/** Code factory defaults — never mutated by user saves. */
export function createDefaultRuntimeConfig(): RuntimeConfig {
  return {
    ...createDefaultSimConfig(),
    __version: CONFIG_VERSION,
    expandedSections: defaultExpandedSections(),
  };
}

export const DEFAULT_CONFIG: Readonly<RuntimeConfig> = Object.freeze(
  createDefaultRuntimeConfig(),
);

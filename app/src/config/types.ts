import type { MutableSimConfig } from './constants';

/** Bump on breaking config shape changes (triggers local backup / selective drop). */
export const CONFIG_VERSION = 1;

/** Section expand flags — persisted with local default / shipping. */
export type ExpandedSections = {
  sim: boolean;
  matchTools: boolean;
  inputBuffer: boolean;
  cancelHitstop: boolean;
  guardPush: boolean;
  locomotion: boolean;
  renderBoxes: boolean;
  camera: boolean;
  lighting: boolean;
  animDrive: boolean;
  commandProbe: boolean;
  moveEdit: boolean;
  animTest: boolean;
  headband: boolean;
  extendedSim: boolean;
  extendedLoco: boolean;
  extendedAnim: boolean;
};

export type RuntimeConfig = MutableSimConfig & {
  __version: number;
  expandedSections: ExpandedSections;
};

export type PresetEnvelope = {
  type: 'runtime-control-preset';
  version: number;
  name: string;
  config: Partial<RuntimeConfig> & Record<string, unknown>;
};

export function isPresetEnvelope(v: unknown): v is PresetEnvelope {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as PresetEnvelope).type === 'runtime-control-preset' &&
    typeof (v as PresetEnvelope).config === 'object' &&
    (v as PresetEnvelope).config != null
  );
}

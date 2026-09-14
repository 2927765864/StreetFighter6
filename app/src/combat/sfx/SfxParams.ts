/**
 * Tunable combat-SFX enhance params (debug panel + runtime).
 * Defaults from docs/plans/ai-execution-plan-combat-sfx-enhance-v0.md
 */

export type SfxParams = {
  sfxEnabled: boolean;
  sfxMaster: number;

  rateJitter: number;
  gainJitter: number;
  antiRepeat: boolean;

  strengthGainL: number;
  strengthGainM: number;
  strengthGainH: number;
  layerBlendEnabled: boolean;
  layerGainM: number;
  layerGainH: number;
  strengthPitchBias: number;

  ambienceEnabled: boolean;
  ambienceLevel: number;
  duckEnabled: boolean;
  duckTarget: number;
  duckAttack: number;
  duckHold: number;
  duckRelease: number;

  panEnabled: boolean;
  /**
   * Multiplier on world-X pan before StereoPanner.
   * World +X is screen-right with our +Z camera; StereoPanner +1 is right ear.
   * Default -1: measured 2026-09-10 — without it, P1 (left) footsteps/swing
   * imaged to the right ear (hit on P2 felt “ok” because opponent is right).
   */
  panSign: number;
  panScale: number;
  panMax: number;

  reverbEnabled: boolean;
  reverbSend: number;
  irDurationSec: number;
  irDecayPower: number;
};

export function createDefaultSfxParams(): SfxParams {
  return {
    sfxEnabled: true,
    sfxMaster: 0.85,

    rateJitter: 0.06,
    gainJitter: 0.08,
    antiRepeat: true,

    strengthGainL: 0.78,
    strengthGainM: 1.0,
    strengthGainH: 1.18,
    layerBlendEnabled: true,
    layerGainM: 0.15,
    layerGainH: 0.25,
    strengthPitchBias: 0.02,

    ambienceEnabled: true,
    ambienceLevel: 0.06,
    duckEnabled: true,
    duckTarget: 0.22,
    duckAttack: 0.02,
    duckHold: 0.12,
    duckRelease: 0.35,

    panEnabled: true,
    panSign: -1,
    panScale: 0.55,
    panMax: 0.65,

    reverbEnabled: true,
    reverbSend: 0.08,
    irDurationSec: 0.32,
    irDecayPower: 2.0,
  };
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Stereo pan from fighter X relative to mid-point (plan §3.4). */
export function panFromFighterX(
  fighterX: number,
  p1x: number,
  p2x: number,
  panScale: number,
  panMax: number,
): number {
  const mid = (p1x + p2x) / 2;
  const halfSpan = Math.max(Math.abs(p1x - p2x) / 2, 1.5);
  const raw = ((fighterX - mid) / halfSpan) * panScale;
  return clamp(raw, -panMax, panMax);
}

export function strengthGain(
  strength: 'l' | 'm' | 'h',
  p: Pick<SfxParams, 'strengthGainL' | 'strengthGainM' | 'strengthGainH'>,
): number {
  if (strength === 'l') return p.strengthGainL;
  if (strength === 'h') return p.strengthGainH;
  return p.strengthGainM;
}

/** Adjacent sweetener slot for layer blend (plan §3.2). */
export function layerBlendSlot(
  primarySlot: string,
  strength: 'l' | 'm' | 'h',
): { slotId: string; gain: number } | null {
  if (strength === 'l') return null;
  if (!primarySlot.includes('/hit_')) return null;
  if (strength === 'm') {
    return {
      slotId: primarySlot.replace(/_[lmh]$/, '_l'),
      gain: 0, // filled by caller with layerGainM
    };
  }
  return {
    slotId: primarySlot.replace(/_[lmh]$/, '_m'),
    gain: 0,
  };
}

/**
 * Pick variant index with optional anti-repeat.
 * Pure helper for tests + player.
 */
export function pickVariantIndex(
  poolSize: number,
  lastIndex: number,
  antiRepeat: boolean,
  rand: () => number = Math.random,
): number {
  if (poolSize <= 0) return 0;
  if (poolSize === 1) return 0;
  let idx = Math.floor(rand() * poolSize);
  if (antiRepeat && idx === lastIndex) {
    idx = (idx + 1 + Math.floor(rand() * (poolSize - 1))) % poolSize;
  }
  return idx;
}

export function applyJitter(
  base: number,
  jitter: number,
  rand: () => number = Math.random,
): number {
  if (jitter <= 0) return base;
  return base * (1 + (rand() * 2 - 1) * jitter);
}

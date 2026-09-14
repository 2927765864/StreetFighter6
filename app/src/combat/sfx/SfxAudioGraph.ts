/**
 * Shared Web Audio graph for combat SFX:
 * sfxBus + wet convolver send, ambience bus with duck, master + compressor.
 *
 * Wiring (plan §2):
 *   voice → sfxBus → master → compressor → destination
 *   voice → send → convolver → wetGain → master
 *   ambience → ambienceBus → master
 *
 * IR synthesis: noise × (1-t)^decayPower (maxymania gist pattern).
 * Duck: seslen-style cancel + linearRamp on ambienceBus.gain.
 */

import type { SfxParams } from './SfxParams';
import { clamp } from './SfxParams';

export type SfxAudioGraph = {
  ctx: AudioContext;
  master: GainNode;
  sfxBus: GainNode;
  ambienceBus: GainNode;
  wetGain: GainNode;
  sendInput: GainNode;
  convolver: ConvolverNode;
  compressor: DynamicsCompressorNode;
  ambienceSource: AudioBufferSourceNode | null;
  ambienceGain: GainNode;
  /** Last unducked ambience bus level (before duck multipliers). */
  ambienceBase: number;
};

/** Programmatic short stereo room IR (no external asset). */
export function buildTrainingRoomIR(
  ctx: AudioContext,
  opts: { durationSec: number; decayPower: number },
): AudioBuffer {
  const duration = clamp(opts.durationSec, 0.05, 1.5);
  const power = clamp(opts.decayPower, 0.5, 6);
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * duration));
  const buf = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    // Slight L/R decorrelation (different seed offset).
    let seed = (ch + 1) * 9973;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647) * 2 - 1;
    };
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, power);
      data[i] = rnd() * env;
    }
    // Leading impulse keeps attack clarity when normalize=true.
    if (length > 0) data[0] = ch === 0 ? 0.9 : 0.85;
  }
  return buf;
}

/** Looping brown-ish noise bed for ducking to act on. */
export function buildAmbienceLoopBuffer(
  ctx: AudioContext,
  durationSec = 2.0,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * durationSec));
  const buf = ctx.createBuffer(1, length, rate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 0.35;
  }
  return buf;
}

export function createSfxAudioGraph(ctx: AudioContext, params: SfxParams): SfxAudioGraph {
  const master = ctx.createGain();
  master.gain.value = 1;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.12;

  master.connect(compressor);
  compressor.connect(ctx.destination);

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = 1;
  sfxBus.connect(master);

  const ambienceBus = ctx.createGain();
  ambienceBus.gain.value = 1;
  ambienceBus.connect(master);

  const ambienceGain = ctx.createGain();
  ambienceGain.gain.value = params.ambienceEnabled ? params.ambienceLevel : 0;
  ambienceGain.connect(ambienceBus);

  const wetGain = ctx.createGain();
  wetGain.gain.value = params.reverbEnabled ? 1 : 0;
  wetGain.connect(master);

  const convolver = ctx.createConvolver();
  convolver.normalize = true;
  convolver.buffer = buildTrainingRoomIR(ctx, {
    durationSec: params.irDurationSec,
    decayPower: params.irDecayPower,
  });
  convolver.connect(wetGain);

  // Sum of per-voice sends into one convolver.
  const sendInput = ctx.createGain();
  sendInput.gain.value = 1;
  sendInput.connect(convolver);

  let ambienceSource: AudioBufferSourceNode | null = null;
  try {
    ambienceSource = ctx.createBufferSource();
    ambienceSource.buffer = buildAmbienceLoopBuffer(ctx);
    ambienceSource.loop = true;
    ambienceSource.connect(ambienceGain);
    ambienceSource.start(0);
  } catch {
    ambienceSource = null;
  }

  return {
    ctx,
    master,
    sfxBus,
    ambienceBus,
    wetGain,
    sendInput,
    convolver,
    compressor,
    ambienceSource,
    ambienceGain,
    ambienceBase: params.ambienceEnabled ? params.ambienceLevel : 0,
  };
}

export function rebuildConvolverIR(graph: SfxAudioGraph, params: SfxParams): void {
  graph.convolver.buffer = buildTrainingRoomIR(graph.ctx, {
    durationSec: params.irDurationSec,
    decayPower: params.irDecayPower,
  });
}

export function syncAmbienceLevel(graph: SfxAudioGraph, params: SfxParams): void {
  const level = params.ambienceEnabled ? params.ambienceLevel : 0;
  graph.ambienceBase = level;
  const t = graph.ctx.currentTime;
  graph.ambienceGain.gain.cancelScheduledValues(t);
  graph.ambienceGain.gain.setValueAtTime(level, t);
  // Reset bus multiplier to 1 when not mid-duck (caller may duck next).
  graph.ambienceBus.gain.cancelScheduledValues(t);
  graph.ambienceBus.gain.setValueAtTime(1, t);
}

export function syncWetEnabled(graph: SfxAudioGraph, params: SfxParams): void {
  const t = graph.ctx.currentTime;
  graph.wetGain.gain.cancelScheduledValues(t);
  graph.wetGain.gain.setValueAtTime(params.reverbEnabled ? 1 : 0, t);
}

/**
 * Duck ambience bus (seslen BusHandle.duck semantics).
 * Multiplies ambienceBus.gain; dry bed level stays on ambienceGain.
 */
export function duckAmbience(graph: SfxAudioGraph, params: SfxParams): void {
  if (!params.duckEnabled || !params.ambienceEnabled) return;
  const g = graph.ambienceBus.gain;
  const t = graph.ctx.currentTime;
  const attack = Math.max(0.015, params.duckAttack);
  const hold = Math.max(0, params.duckHold);
  const release = Math.max(0.05, params.duckRelease);
  const target = clamp(params.duckTarget, 0, 1);

  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(target, t + attack);
  g.linearRampToValueAtTime(target, t + attack + hold);
  g.linearRampToValueAtTime(1, t + attack + hold + release);
}

/** Category wet send multiplier (plan §3.5). */
export function categoryReverbSendMul(slotId: string): number {
  if (slotId.startsWith('contact/')) return 1.0;
  if (slotId.startsWith('swing/')) return 0.7;
  if (slotId.startsWith('loco/')) return 0.5;
  if (slotId.startsWith('knockdown/')) return 1.1;
  return 0.8;
}

/**
 * Web Audio combat SFX player with variation, strength layers, ducking,
 * stereo pan, and shared convolution reverb send.
 *
 * Graph + defaults: docs/plans/ai-execution-plan-combat-sfx-enhance-v0.md
 */
import {
  loadSfxManifest,
  sfxUrlsForSlot,
  type SfxManifest,
} from './SfxCatalog';
import {
  categoryReverbSendMul,
  createSfxAudioGraph,
  duckAmbience,
  rebuildConvolverIR,
  syncAmbienceLevel,
  syncWetEnabled,
  type SfxAudioGraph,
} from './SfxAudioGraph';
import {
  applyJitter,
  clamp,
  createDefaultSfxParams,
  layerBlendSlot,
  panFromFighterX,
  pickVariantIndex,
  strengthGain,
  type SfxParams,
} from './SfxParams';
import {
  resolveSfxStrength,
  slotIdForCombatEvent,
  type CombatSfxEvent,
  type SfxSourceSide,
  type SfxStrength,
} from './SfxSlots';

export type SfxPlayContext = {
  p1x: number;
  p2x: number;
};

export class CombatSfxPlayer {
  private manifest: SfxManifest | null = null;
  private ctx: AudioContext | null = null;
  private graph: SfxAudioGraph | null = null;
  /** slotId → decoded variant buffers */
  private pools = new Map<string, AudioBuffer[]>();
  private loading = new Map<string, Promise<AudioBuffer[]>>();
  private lastVariant = new Map<string, number>();
  /** Live tunable params (ControlPanel binds this object). */
  readonly params: SfxParams = createDefaultSfxParams();
  private playCtx: SfxPlayContext = { p1x: 0, p2x: 0 };

  async init(manifestUrl?: string): Promise<void> {
    this.manifest = await loadSfxManifest(manifestUrl);
    if (!this.manifest) {
      console.warn('[sfx] manifest missing — combat SFX disabled until export');
      return;
    }
    const accepted = Object.entries(this.manifest.slots).filter(
      ([, e]) => e.status === 'accepted' && (e.file || (e.files && e.files.length)),
    );
    console.info(
      `[sfx] loaded manifest · ${accepted.length} accepted slots · exportedAt=${this.manifest.exportedAt ?? '?'}`,
    );
    this.pools.clear();
    this.loading.clear();
    this.lastVariant.clear();
    await Promise.all(accepted.map(([id]) => this.ensurePool(id)));
  }

  setEnabled(on: boolean): void {
    this.params.sfxEnabled = on;
  }

  setVolume(v: number): void {
    this.params.sfxMaster = clamp(v, 0, 1);
  }

  /** Update fighter positions used for stereo pan. Call each frame or on emit. */
  setPlayContext(ctx: SfxPlayContext): void {
    this.playCtx = ctx;
  }

  getManifest(): SfxManifest | null {
    return this.manifest;
  }

  getParams(): SfxParams {
    return this.params;
  }

  /** Rebuild shared IR after irDurationSec / irDecayPower edits. */
  rebuildIR(): void {
    if (!this.graph) return;
    rebuildConvolverIR(this.graph, this.params);
  }

  /** Push ambience / wet toggles into the live graph. */
  syncGraphFromParams(): void {
    if (!this.graph) return;
    syncAmbienceLevel(this.graph, this.params);
    syncWetEnabled(this.graph, this.params);
  }

  handle(ev: CombatSfxEvent): void {
    if (!this.params.sfxEnabled) return;
    const slotId = slotIdForCombatEvent(ev);
    if (!slotId) return;

    const strength = this.strengthOf(ev);
    const pan = this.resolvePan(ev);
    const stGain = strength != null ? strengthGain(strength, this.params) : 1;
    const pitchBias =
      strength != null
        ? (strength === 'h' ? 1 : strength === 'l' ? -1 : 0) *
          this.params.strengthPitchBias
        : 0;

    void this.playSlot(slotId, {
      pan,
      gainMul: stGain,
      pitchBias,
    });

    if (
      ev.kind === 'hit' &&
      this.params.layerBlendEnabled &&
      strength &&
      strength !== 'l'
    ) {
      const blend = layerBlendSlot(slotId, strength);
      if (blend) {
        const layerGain =
          strength === 'm' ? this.params.layerGainM : this.params.layerGainH;
        if (layerGain > 0) {
          void this.playSlot(blend.slotId, {
            pan,
            gainMul: stGain * layerGain,
            pitchBias: pitchBias * 0.5,
          });
        }
      }
    }

    if (ev.kind === 'hit' || ev.kind === 'block' || ev.kind === 'body_fall') {
      if (this.graph) duckAmbience(this.graph, this.params);
    }
  }

  async playSlot(
    slotId: string,
    opts?: { pan?: number; gainMul?: number; pitchBias?: number },
  ): Promise<void> {
    if (!this.params.sfxEnabled) return;
    this.unlock();
    if (!this.ctx || !this.graph) return;

    const pool = await this.ensurePool(slotId);
    if (!pool.length) return;

    const last = this.lastVariant.get(slotId) ?? -1;
    const idx = pickVariantIndex(
      pool.length,
      last,
      this.params.antiRepeat,
    );
    this.lastVariant.set(slotId, idx);
    const buf = pool[idx];
    if (!buf) return;

    const rate = clamp(
      applyJitter(1, this.params.rateJitter) + (opts?.pitchBias ?? 0),
      0.85,
      1.15,
    );
    const gain =
      this.params.sfxMaster *
      (opts?.gainMul ?? 1) *
      applyJitter(1, this.params.gainJitter);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = this.params.panEnabled
      ? clamp(opts?.pan ?? 0, -1, 1)
      : 0;

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.value = Math.max(0, gain);

    const sendGain = this.ctx.createGain();
    const sendAmt = this.params.reverbEnabled
      ? this.params.reverbSend * categoryReverbSendMul(slotId)
      : 0;
    sendGain.gain.value = sendAmt;

    src.connect(panner);
    panner.connect(voiceGain);
    voiceGain.connect(this.graph.sfxBus);
    voiceGain.connect(sendGain);
    sendGain.connect(this.graph.sendInput);

    try {
      src.start(0);
    } catch {
      /* ignore InvalidStateError if context closed */
    }
  }

  /** Resume AudioContext after a user gesture (keydown / pointer). */
  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.graph = createSfxAudioGraph(this.ctx, this.params);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private strengthOf(ev: CombatSfxEvent): SfxStrength | null {
    if (ev.kind === 'swing' || ev.kind === 'hit' || ev.kind === 'block') {
      return resolveSfxStrength(ev);
    }
    return null;
  }

  private resolvePan(ev: CombatSfxEvent): number {
    if (!this.params.panEnabled) return 0;
    const side: SfxSourceSide = ev.sourceSide ?? 'center';
    const { p1x, p2x } = this.playCtx;
    const x =
      side === 'p1' ? p1x : side === 'p2' ? p2x : (p1x + p2x) / 2;
    const worldPan = panFromFighterX(
      x,
      p1x,
      p2x,
      this.params.panScale,
      this.params.panMax,
    );
    // panSign corrects screen/ear mapping (see SfxParams.panSign).
    return clamp(worldPan * this.params.panSign, -1, 1);
  }

  private ensurePool(slotId: string): Promise<AudioBuffer[]> {
    const cached = this.pools.get(slotId);
    if (cached) return Promise.resolve(cached);
    const inflight = this.loading.get(slotId);
    if (inflight) return inflight;

    const urls = sfxUrlsForSlot(this.manifest, slotId);
    if (urls.length === 0) return Promise.resolve([]);

    const job = (async () => {
      try {
        this.unlock();
        if (!this.ctx) return [];
        const buffers: AudioBuffer[] = [];
        for (const url of urls) {
          try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;
            const raw = await res.arrayBuffer();
            const buf = await this.ctx.decodeAudioData(raw.slice(0));
            buffers.push(buf);
          } catch (e) {
            console.warn('[sfx] decode failed', slotId, url, e);
          }
        }
        this.pools.set(slotId, buffers);
        return buffers;
      } finally {
        this.loading.delete(slotId);
      }
    })();
    this.loading.set(slotId, job);
    return job;
  }
}



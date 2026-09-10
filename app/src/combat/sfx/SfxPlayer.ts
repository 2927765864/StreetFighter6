/**
 * Web Audio player for accepted four-layer slots under /private-runtime/sfx.
 * Missing slots are silent no-ops (manifest status !== accepted).
 */
import {
  loadSfxManifest,
  sfxUrl,
  type SfxManifest,
} from './SfxCatalog';
import {
  slotIdForCombatEvent,
  type CombatSfxEvent,
} from './SfxSlots';

export class CombatSfxPlayer {
  private manifest: SfxManifest | null = null;
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private enabled = true;
  private volume = 0.85;

  async init(manifestUrl?: string): Promise<void> {
    this.manifest = await loadSfxManifest(manifestUrl);
    if (!this.manifest) {
      console.warn('[sfx] manifest missing — combat SFX disabled until export');
      return;
    }
    const accepted = Object.entries(this.manifest.slots).filter(
      ([, e]) => e.status === 'accepted' && e.file,
    );
    console.info(
      `[sfx] loaded manifest · ${accepted.length} accepted slots · exportedAt=${this.manifest.exportedAt ?? '?'}`,
    );
    // Drop any previous decode cache (HMR / soft reload).
    this.buffers.clear();
    this.loading.clear();
    // Warm decode accepted slots (best-effort; failures stay silent).
    await Promise.all(accepted.map(([id]) => this.ensureBuffer(id)));
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  getManifest(): SfxManifest | null {
    return this.manifest;
  }

  handle(ev: CombatSfxEvent): void {
    if (!this.enabled) return;
    const slotId = slotIdForCombatEvent(ev);
    if (!slotId) return;
    void this.playSlot(slotId);
  }

  async playSlot(slotId: string): Promise<void> {
    if (!this.enabled) return;
    const url = sfxUrl(this.manifest, slotId);
    if (!url) return;
    this.unlock();
    const buf = await this.ensureBuffer(slotId);
    if (!buf || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = this.volume;
    src.connect(gain);
    gain.connect(this.ctx.destination);
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
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private ensureBuffer(slotId: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(slotId);
    if (cached) return Promise.resolve(cached);
    const inflight = this.loading.get(slotId);
    if (inflight) return inflight;

    const url = sfxUrl(this.manifest, slotId);
    if (!url) return Promise.resolve(null);

    const job = (async () => {
      try {
        this.unlock();
        if (!this.ctx) return null;
        // Never force-cache: slot paths are stable (hit_punch_l.ogg) but bytes change on export.
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        const raw = await res.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(raw.slice(0));
        this.buffers.set(slotId, buf);
        return buf;
      } catch (e) {
        console.warn('[sfx] decode failed', slotId, e);
        return null;
      } finally {
        this.loading.delete(slotId);
      }
    })();
    this.loading.set(slotId, job);
    return job;
  }
}

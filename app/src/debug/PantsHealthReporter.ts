/**
 * Pants health HUD + optional session recording (start/stop → one file).
 * No continuous auto disk writes (avoids log bloat).
 */
import { formatPantsHealthMarkdown } from '../render/pants/pantsHealthSample';
import type { PantsHealthSnapshot } from '../render/pants/pantsHealthTypes';
import { worsePantsHealthStatus } from '../render/pants/pantsHealthTypes';
import { postPantsFeelLog, postPantsSessionReport } from './pantsReportClient';
import { PantsHealthHud } from './PantsHealthHud';
import {
  createPantsSessionState,
  formatPantsSessionMarkdown,
  startPantsSession,
  stopPantsSession,
  tickPantsSession,
} from './pantsHealthSession';

export class PantsHealthReporter {
  private hud = new PantsHealthHud();
  private session = createPantsSessionState();
  private sessionStartedAtIso = '';

  get isRecording(): boolean {
    return this.session.recording;
  }

  get sessionEntryCount(): number {
    return this.session.entries.length;
  }

  startRecording(snaps: PantsHealthSnapshot[], nowMs = performance.now()): boolean {
    if (this.session.recording) return false;
    this.sessionStartedAtIso = new Date().toISOString();
    startPantsSession(this.session, snaps, nowMs);
    return true;
  }

  async stopRecording(
    snaps: PantsHealthSnapshot[],
    cfg: {
      pantsHealthReportEnabled: boolean;
      pantsHealthSessionMaxEntries: number;
      pantsHealthSessionKeep: number;
      pantsFeelNote: string;
    },
    nowMs = performance.now(),
  ): Promise<{ ok: boolean; file?: string; reason?: string }> {
    if (!this.session.recording) {
      return { ok: false, reason: 'not-recording' };
    }
    const startedIso = this.sessionStartedAtIso || new Date().toISOString();
    const result = stopPantsSession(
      this.session,
      snaps,
      nowMs,
      cfg.pantsHealthSessionMaxEntries,
    );
    this.sessionStartedAtIso = '';
    if (!result) return { ok: false, reason: 'empty' };

    if (!cfg.pantsHealthReportEnabled) {
      return { ok: true, reason: 'disk-disabled' };
    }

    const md = formatPantsSessionMarkdown({
      startedAtIso: startedIso,
      stoppedAtIso: new Date().toISOString(),
      durationSec: result.durationSec,
      entries: result.entries,
      note: cfg.pantsFeelNote,
    });
    const ok = await postPantsSessionReport(md, {
      keep: cfg.pantsHealthSessionKeep,
      json: {
        startedAtIso: startedIso,
        durationSec: result.durationSec,
        entries: result.entries,
      },
    });
    return ok ? { ok: true } : { ok: false, reason: 'write-failed' };
  }

  tick(
    snaps: PantsHealthSnapshot[],
    cfg: {
      pantsHealthReportEnabled: boolean;
      pantsHealthHudEnabled: boolean;
      pantsHealthSnapshotIntervalSec: number;
      pantsHealthHudMinIntervalMs: number;
      pantsHealthSessionMaxEntries: number;
    },
    nowMs = performance.now(),
  ): void {
    if (this.session.recording && snaps.length > 0) {
      tickPantsSession(this.session, snaps, {
        nowMs,
        sparseIntervalSec: cfg.pantsHealthSnapshotIntervalSec,
        maxEntries: cfg.pantsHealthSessionMaxEntries,
      });
    }

    let worst = snaps[0]?.status ?? 'disabled';
    for (const s of snaps) worst = worsePantsHealthStatus(worst, s.status);

    this.hud.update(snaps, {
      enabled: cfg.pantsHealthHudEnabled,
      minIntervalMs: cfg.pantsHealthHudMinIntervalMs,
      nowMs,
      recording: this.session.recording,
      entryCount: this.session.entries.length,
      recordingSec: this.session.recording
        ? (nowMs - this.session.startedAtMs) / 1000
        : 0,
      worstStatus: worst,
    });
  }

  async recordFeel(snaps: PantsHealthSnapshot[], note: string): Promise<boolean> {
    if (snaps.length === 0) return false;
    const md = formatPantsHealthMarkdown('手感记录', snaps, note);
    return postPantsFeelLog(md);
  }

  dispose(): void {
    this.hud.dispose();
  }
}

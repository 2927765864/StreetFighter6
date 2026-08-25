/**
 * Fixed DOM panel for pants health (human-facing).
 * Pattern: three.js stats.module.js — position:fixed overlay, throttled text.
 */
import type {
  PantsHealthSnapshot,
  PantsHealthStatus,
} from '../render/pants/pantsHealthTypes';
import { worsePantsHealthStatus } from '../render/pants/pantsHealthTypes';

function statusLabel(s: PantsHealthStatus): string {
  switch (s) {
    case 'ok':
      return '正常';
    case 'warn':
      return '警告';
    case 'abnormal':
      return '异常';
    default:
      return '关闭/未绑定';
  }
}

function statusColor(s: PantsHealthStatus): string {
  switch (s) {
    case 'ok':
      return '#9f9';
    case 'warn':
      return '#fe5';
    case 'abnormal':
      return '#f45';
    default:
      return '#aaa';
  }
}

export class PantsHealthHud {
  private root: HTMLPreElement | null = null;
  private lastPaintMs = 0;

  ensureDom(): void {
    if (this.root) return;
    const el = document.createElement('pre');
    el.id = 'pants-health-hud';
    el.style.cssText = [
      'position:fixed',
      'right:8px',
      'bottom:8px',
      'z-index:10001',
      'margin:0',
      'padding:8px 10px',
      'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#eee',
      'background:rgba(0,0,0,0.72)',
      'border:1px solid rgba(255,255,255,0.2)',
      'border-radius:6px',
      'pointer-events:none',
      'white-space:pre',
      'min-width:200px',
    ].join(';');
    document.body.appendChild(el);
    this.root = el;
  }

  update(
    snaps: PantsHealthSnapshot[],
    opts: {
      enabled: boolean;
      minIntervalMs: number;
      nowMs?: number;
      recording?: boolean;
      entryCount?: number;
      recordingSec?: number;
      worstStatus?: PantsHealthStatus;
    },
  ): void {
    if (!opts.enabled) {
      if (this.root) this.root.style.display = 'none';
      return;
    }
    this.ensureDom();
    if (!this.root) return;
    this.root.style.display = 'block';

    const now = opts.nowMs ?? performance.now();
    if (now - this.lastPaintMs < Math.max(0, opts.minIntervalMs)) return;
    this.lastPaintMs = now;

    if (snaps.length === 0) {
      this.root.textContent = opts.recording
        ? '裤子健康\n⏺ 记录中（暂无数据）'
        : '裤子健康\n（暂无数据）';
      this.root.style.borderColor = opts.recording ? '#f84' : '#666';
      return;
    }

    let worst = opts.worstStatus ?? snaps[0]!.status;
    for (const s of snaps) worst = worsePantsHealthStatus(worst, s.status);
    this.root.style.borderColor = opts.recording ? '#f84' : statusColor(worst);

    const lines = [
      opts.recording
        ? `裤子健康 · ${statusLabel(worst)} · ⏺ 记录中`
        : `裤子健康 · ${statusLabel(worst)}`,
      '',
    ];
    if (opts.recording) {
      lines.push(
        `  已记 ${opts.entryCount ?? 0} 条 · ${((opts.recordingSec ?? 0)).toFixed(1)}s`,
        '',
      );
    }
    for (const s of snaps) {
      lines.push(
        `${s.fighterId} ${statusLabel(s.status)}`,
        `  最大偏离 ${s.maxSeparation.toFixed(3)}`,
        `  警告/异常 ${s.warnThreshold.toFixed(2)} / ${s.abnormalThreshold.toFixed(2)}`,
        `  熔断 ${s.warpCountSession}  夹紧 ${s.clampCountSession}`,
        `  ${s.lastEvent || '—'}`,
        '',
      );
    }
    this.root.textContent = lines.join('\n').trimEnd();
  }

  dispose(): void {
    this.root?.remove();
    this.root = null;
  }
}

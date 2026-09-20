import type { MatchSim } from '../combat/match/MatchSim';
import type { FrameClock } from '../combat/frameClock';
import type { MutableSimConfig } from '../config/constants';

export class HudDom {
  private el: HTMLPreElement;

  constructor(parent: HTMLElement = document.body) {
    this.el = document.createElement('pre');
    this.el.id = 'h2-hud';
    Object.assign(this.el.style, {
      display: 'none',
      position: 'fixed',
      left: '8px',
      top: '8px',
      margin: '0',
      padding: '8px 10px',
      background: 'rgba(0,0,0,0.72)',
      color: '#b8f5c0',
      font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
      zIndex: '20',
      pointerEvents: 'none',
      maxWidth: '48vw',
      whiteSpace: 'pre-wrap',
    } as CSSStyleDeclaration);
    parent.appendChild(this.el);

    const help = document.createElement('div');
    help.id = 'controls-help';
    Object.assign(help.style, {
      position: 'fixed',
      left: '50%',
      top: '12px',
      transform: 'translateX(-50%)',
      padding: '6px 12px',
      background: 'rgba(0,0,0,0.55)',
      color: '#e8e8e8',
      font: '13px/1.35 system-ui,sans-serif',
      zIndex: '20',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    } as CSSStyleDeclaration);
    help.textContent = '移动-WASD · 轻/中/重拳-U/I/O · 中/重震预设1/2';
    parent.appendChild(help);
  }

  update(match: MatchSim, clock: FrameClock, cfg: MutableSimConfig): void {
    const s = match.snapshot();
    const buf = cfg.showBuffer ? `\n历史: ${s.bufferDirs}` : '';
    const cancel = cfg.showCancelWindow ? `\n取消窗: ${s.cancelWindow}` : '';
    const p = match.debugProbe;
    this.el.textContent =
      `H2 · 逻辑帧 ${clock.logicFrame} (模拟 ${s.logicFrame})\n` +
      `P1 ${s.p1Phase} clip=${p.p1ClipId} role=${p.p1AnimRole}\n` +
      `loco=${p.p1LocoPhase} jump=${p.p1JumpPhase} 招=${s.p1MoveId ?? '—'} 帧 ${s.p1MoveFrame}/${s.p1Total} dx=${p.p1SelfDx.toFixed(4)}\n` +
      `意图 ${s.lastIntent} · relDir=${s.relDir} pressed=0x${s.pressed.toString(16)}\n` +
      `ActionBuffer: ${s.actionBuffer} · hitstop=${s.hitstopTimer}` +
      cancel +
      `\nP2 ${s.p2Phase} 人偶=${s.dummyMode}\n` +
      `HP ${s.p1Hp} / ${s.p2Hp} · Drive ${s.driveBars}\n` +
      `上次命中: ${s.lastHitResult}` +
      buf;
  }
}

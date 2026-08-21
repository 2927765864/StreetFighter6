import * as THREE from 'three/webgpu';
import { RYU_FEEDBACK_MOVE_URLS } from '../combat/move/ryuMoveIds';
import { moveIdFromBaseUrl } from '../data/resolveOverrides';
import {
  loadMoveDefinitionResolved,
  loadStanceTableResolved,
} from '../data/loadMoveWithOverride';
import { attachDragScrub } from '../debug/dragScrub';
import { faceBox, type Box } from '../combat/boxes/Box2D';
import type { MatchSim } from '../combat/match/MatchSim';
import { CONFIG } from '../config/store';
import {
  loadBoxEditorConfig,
  saveBoxEditorConfig,
  type BoxEditorConfig,
} from './config';
import { BoxEditorDocument } from './document/BoxEditorDocument';
import type { BoxKind } from './document/commands';
import { OverrideClient } from './OverrideClient';
import { BoxEditorPlayback } from './playback/BoxEditorPlayback';
import { BoxPointerController } from './pointer/BoxPointerController';
import {
  applyEditMove,
  applyEditStance,
  patchFighterMoveBoxes,
  patchFighterStanceBoxes,
  poseEditFighters,
} from './BoxEditorSceneSync';
import type { OverrideManifest } from '../data/resolveOverrides';
import './boxEditor.css';

function moveIdsFromCatalog(): string[] {
  const ids: string[] = [];
  for (const url of RYU_FEEDBACK_MOVE_URLS) {
    const id = moveIdFromBaseUrl(url);
    if (id) ids.push(id);
  }
  return ids;
}

export type BoxEditorHost = {
  getMatch: () => MatchSim;
  getCamera: () => THREE.Camera;
  getCanvas: () => HTMLCanvasElement;
  setMatchPaused: (paused: boolean) => void;
  setShowOpponentBoxes: (show: boolean) => void;
  onExit?: () => void;
};

export class BoxEditorApp {
  private host: BoxEditorHost;
  private root: HTMLElement;
  private cfg: BoxEditorConfig;
  private doc = new BoxEditorDocument();
  private playback = new BoxEditorPlayback();
  private overrides = new OverrideClient();
  private pointer: BoxPointerController | null = null;
  private manifest: OverrideManifest = { version: 1, moves: {}, stance: false };
  private moveIds = moveIdsFromCatalog();
  private currentListKey: string | null = null;
  private suppressProps = false;
  private running = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  private elMoveList!: HTMLUListElement;
  private elTimeline!: HTMLDivElement;
  private elPlayhead!: HTMLDivElement;
  private elStatus!: HTMLSpanElement;
  private elFrameLabel!: HTMLSpanElement;
  private props = {
    x: null as HTMLInputElement | null,
    y: null as HTMLInputElement | null,
    w: null as HTMLInputElement | null,
    h: null as HTMLInputElement | null,
    from: null as HTMLInputElement | null,
    to: null as HTMLInputElement | null,
    kind: null as HTMLSelectElement | null,
    part: null as HTMLSelectElement | null,
    layer: null as HTMLSelectElement | null,
  };

  constructor(host: BoxEditorHost, parent: HTMLElement = document.body) {
    this.host = host;
    this.cfg = loadBoxEditorConfig();
    this.doc.undoLimit = this.cfg.undoLimit;
    this.doc.minSize = this.cfg.boxDragMinSize;
    this.overrides.autoSaveEnabled = this.cfg.autoSaveEnabled;
    this.overrides.debounceMs = this.cfg.autoSaveDebounceMs;
    this.playback.loop = this.cfg.loop;
    this.playback.playbackFps = this.cfg.playbackFps;

    this.root = document.createElement('div');
    this.root.id = 'box-editor-root';
    this.root.className = 'be-overlay';
    parent.appendChild(this.root);
    this.buildDom();
    this.bindKeys();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    document.body.classList.add('box-edit-mode');
    this.host.setMatchPaused(true);
    this.host.setShowOpponentBoxes(false);
    this.syncMainDebugFlags();

    this.pointer = new BoxPointerController(
      this.host.getCanvas(),
      this.host.getCamera(),
      {
        onSelect: (sel) => {
          this.doc.select(sel);
          this.refreshProps();
          this.refreshTimeline();
          this.syncScene();
        },
        onGeomLive: (kind, index, geom) => {
          this.doc.setBoxGeomLive(kind, index, geom);
          this.refreshProps();
          this.syncScene();
        },
        onGeomCommit: (kind, index, before, after) => {
          this.doc.commitBoxGeom(kind, index, before, after);
          this.afterCommand();
        },
        getBoxes: () => this.doc.getBoxes(),
        getSelection: () => this.doc.selection,
        getPlayhead: () => this.playback.playhead,
        getFacing: () => this.host.getMatch().p1.visualFacing,
        getOrigin: () => {
          const p1 = this.host.getMatch().p1;
          return { x: p1.x, y: p1.y };
        },
        getWorldScale: () => CONFIG.worldScale,
        getMinSize: () => this.cfg.boxDragMinSize,
        showKind: (kind) => {
          if (kind === 'hit') return this.cfg.showHitboxes;
          if (kind === 'hurt') return this.cfg.showHurtboxes;
          return this.cfg.showPushboxes;
        },
      },
    );

    this.playback.setOnChange(() => this.onPlayheadChange());

    await this.refreshManifest();
    await this.selectListKey(this.moveIds[0] ?? 'stance_stand');
  }

  /** Center preview slot — host should size the fight canvas to this rect. */
  getPreviewSlot(): HTMLElement | null {
    return this.root.querySelector('.be-center');
  }

  getPreviewRect(): DOMRect | null {
    const slot = this.getPreviewSlot();
    if (!slot) return null;
    return slot.getBoundingClientRect();
  }

  /** Selected box in world space for DebugDraw highlight (null if none / not on this frame). */
  getHighlightWorldBox(): Box | null {
    const sel = this.doc.selection;
    if (!sel) return null;
    const box = this.doc.getBoxes()[sel.kind][sel.index];
    if (!box) return null;
    const f = Math.floor(this.playback.playhead);
    if (f < box.from || f > box.to) return null;
    const p1 = this.host.getMatch().p1;
    return faceBox(box, p1.x, p1.y, p1.visualFacing);
  }

  /** Reassert moveFrame / stance each host frame while match.step is skipped. */
  tick(): void {
    if (!this.running) return;
    const match = this.host.getMatch();
    if (this.doc.mode === 'move') {
      const def = this.doc.getMove();
      if (def && match.p1.mover.move && match.p2.mover.move) {
        const f = Math.max(
          0,
          Math.min(this.playback.playhead, this.playback.getLength() - 1),
        );
        match.p1.mover.moveFrame = f;
        match.p2.mover.moveFrame = f;
        patchFighterMoveBoxes(match, this.doc.getBoxes());
        poseEditFighters(match);
      } else if (def) {
        this.syncScene();
      }
    } else {
      poseEditFighters(match);
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.playback.pause();
    this.pointer?.dispose();
    this.pointer = null;
    document.body.classList.remove('box-edit-mode');
    this.host.setShowOpponentBoxes(true);
    this.root.remove();
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  private requestExit(): void {
    void this.flushSave().finally(() => {
      this.host.onExit?.();
    });
  }

  private syncMainDebugFlags(): void {
    CONFIG.showHitboxes = this.cfg.showHitboxes;
    CONFIG.showHurtboxes = this.cfg.showHurtboxes;
    CONFIG.showPushboxes = this.cfg.showPushboxes;
    CONFIG.hurtPartColors = this.cfg.hurtPartColors;
    CONFIG.hitboxColor = this.cfg.hitboxColor;
    CONFIG.hurtboxColor = this.cfg.hurtboxColor;
    CONFIG.pushboxColor = this.cfg.pushboxColor;
    CONFIG.scrubFromLogic = this.cfg.scrubFromLogic;
    CONFIG.scrubMode = this.cfg.scrubMode;
  }

  private syncScene(): void {
    const match = this.host.getMatch();
    if (this.doc.mode === 'move') {
      const def = this.doc.buildMoveOverridePayload() ?? this.doc.getMove();
      if (!def) return;
      applyEditMove(match, def, this.playback.playhead);
      patchFighterMoveBoxes(match, this.doc.getBoxes());
      return;
    }
    const stance =
      this.doc.mode === 'stance_crouch' || this.currentListKey === 'stance_crouch'
        ? 'crouch'
        : 'stand';
    applyEditStance(match, stance);
    const table = this.doc.buildStanceOverridePayload() ?? this.doc.getStance();
    if (table) patchFighterStanceBoxes(match, table);
  }

  private buildDom(): void {
    this.root.innerHTML = `
      <div class="be-toolbar">
        <button type="button" data-act="exit">退出编辑</button>
        <button type="button" data-act="play">播放/暂停</button>
        <button type="button" data-act="step-1">⟵</button>
        <button type="button" data-act="step+1">⟶</button>
        <button type="button" data-act="loop">循环</button>
        <button type="button" data-act="add-hit">+攻击框</button>
        <button type="button" data-act="add-hurt">+受击框</button>
        <button type="button" data-act="add-push">+推挤框</button>
        <button type="button" data-act="delete">删除</button>
        <button type="button" data-act="copy">复制到当前帧</button>
        <button type="button" data-act="undo">撤销</button>
        <button type="button" data-act="redo">重做</button>
        <button type="button" data-act="restore-move">恢复当前</button>
        <button type="button" data-act="restore-all">全局恢复</button>
        <span class="be-status" data-status></span>
      </div>
      <aside class="be-left">
        <h3>姿态</h3>
        <ul class="be-move-list" data-stance-list></ul>
        <h3>招式</h3>
        <ul class="be-move-list" data-move-list></ul>
      </aside>
      <div class="be-center"></div>
      <aside class="be-right be-panel">
        <h3>框属性</h3>
        <div class="be-field"><label>中心 X</label><input type="number" step="0.01" data-prop="x" /></div>
        <div class="be-field"><label>中心 Y</label><input type="number" step="0.01" data-prop="y" /></div>
        <div class="be-field"><label>宽</label><input type="number" step="0.01" min="0.05" data-prop="w" /></div>
        <div class="be-field"><label>高</label><input type="number" step="0.01" min="0.05" data-prop="h" /></div>
        <div class="be-field"><label>起始帧</label><input type="number" step="1" min="0" data-prop="from" /></div>
        <div class="be-field"><label>结束帧</label><input type="number" step="1" min="0" data-prop="to" /></div>
        <div class="be-field"><label>种类</label>
          <select data-prop="kind">
            <option value="hit">攻击框</option>
            <option value="hurt">受击框</option>
            <option value="push">推挤框</option>
          </select>
        </div>
        <div class="be-field"><label>部位</label>
          <select data-prop="part">
            <option value="">—</option>
            <option value="head">头</option>
            <option value="body">身</option>
            <option value="leg">腿</option>
            <option value="extend">延伸</option>
            <option value="unknown">未知</option>
          </select>
        </div>
        <div class="be-field"><label>层级</label>
          <select data-prop="layer">
            <option value="">—</option>
            <option value="base">基座</option>
            <option value="extend">延伸</option>
          </select>
        </div>
        <h3>调试 / 配置</h3>
        <div class="be-debug-grid" data-debug></div>
      </aside>
      <div class="be-bottom">
        <div class="be-timeline-meta">
          <span data-frame-label>第 0 / 0 帧</span>
          <span>逻辑帧从 0 计；起始/结束帧为闭区间</span>
        </div>
        <div class="be-timeline" data-timeline>
          <div class="be-timeline-track hit" data-track="hit"></div>
          <div class="be-timeline-track hurt" data-track="hurt"></div>
          <div class="be-timeline-track push" data-track="push"></div>
          <div class="be-playhead" data-playhead></div>
          <div class="be-playhead-handle" data-playhead-handle></div>
        </div>
      </div>
    `;

    this.elMoveList = this.root.querySelector('[data-move-list]')!;
    this.elTimeline = this.root.querySelector('[data-timeline]')!;
    this.elPlayhead = this.root.querySelector('[data-playhead]')!;
    this.elStatus = this.root.querySelector('[data-status]')!;
    this.elFrameLabel = this.root.querySelector('[data-frame-label]')!;

    for (const k of Object.keys(this.props) as (keyof typeof this.props)[]) {
      const el = this.root.querySelector(`[data-prop="${k}"]`);
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        (this.props as Record<string, HTMLElement>)[k] = el;
        if (el instanceof HTMLInputElement && el.type === 'number') {
          attachDragScrub(el);
        }
        el.addEventListener('change', () => this.onPropChange(k));
      }
    }

    this.root.querySelector('.be-toolbar')!.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button[data-act]');
      if (!(t instanceof HTMLButtonElement)) return;
      void this.onToolbar(t.dataset.act!);
    });

    this.buildStanceList();
    this.buildMoveList();
    this.buildDebugPanel();
    this.bindTimelineInteraction();
  }

  private buildStanceList(): void {
    const ul = this.root.querySelector('[data-stance-list]')!;
    ul.innerHTML = '';
    for (const [key, label] of [
      ['stance_stand', '站立待机'],
      ['stance_crouch', '蹲伏待机'],
    ] as const) {
      const li = document.createElement('li');
      li.dataset.key = key;
      li.innerHTML = `<span>${label}</span><span class="be-mark" data-mark></span>`;
      li.addEventListener('click', () => void this.selectListKey(key));
      ul.appendChild(li);
    }
  }

  private buildMoveList(): void {
    this.elMoveList.innerHTML = '';
    for (const id of this.moveIds) {
      const li = document.createElement('li');
      li.dataset.key = id;
      li.innerHTML = `<span>${id}</span><span class="be-mark" data-mark></span>`;
      li.addEventListener('click', () => void this.selectListKey(id));
      this.elMoveList.appendChild(li);
    }
  }

  private buildDebugPanel(): void {
    const host = this.root.querySelector('[data-debug]')!;
    host.innerHTML = '';
    const boolKeys: { key: keyof BoxEditorConfig; label: string }[] = [
      { key: 'showHitboxes', label: '显示攻击框' },
      { key: 'showHurtboxes', label: '显示受击框' },
      { key: 'showPushboxes', label: '显示推挤框' },
      { key: 'hurtPartColors', label: '受击框按部位着色' },
      { key: 'showTimelineHit', label: '时间线·攻击框' },
      { key: 'showTimelineHurt', label: '时间线·受击框' },
      { key: 'showTimelinePush', label: '时间线·推挤框' },
      { key: 'scrubFromLogic', label: '逻辑帧驱动动画' },
      { key: 'loop', label: '循环播放' },
      { key: 'autoSaveEnabled', label: '自动保存' },
      { key: 'preferOverride', label: '优先用改动文件' },
    ];
    for (const { key, label } of boolKeys) {
      const row = document.createElement('div');
      row.className = 'be-field';
      row.innerHTML = `<label>${label}</label>`;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!this.cfg[key];
      input.addEventListener('change', () => {
        (this.cfg as Record<string, unknown>)[key] = input.checked;
        this.onConfigChanged();
      });
      row.appendChild(input);
      host.appendChild(row);
    }

    const numKeys: {
      key: keyof BoxEditorConfig;
      label: string;
      step?: number;
      min?: number;
      max?: number;
    }[] = [
      { key: 'hitboxColor', label: '攻击框颜色', step: 1 },
      { key: 'hurtboxColor', label: '受击框颜色', step: 1 },
      { key: 'pushboxColor', label: '推挤框颜色', step: 1 },
      { key: 'playbackFps', label: '播放帧率', step: 1, min: 1, max: 60 },
      { key: 'playhead', label: '当前帧', step: 1, min: 0 },
      { key: 'boxDragMinSize', label: '框最小尺寸', step: 0.01, min: 0.01 },
      { key: 'autoSaveDebounceMs', label: '自动保存延迟(ms)', step: 50, min: 0 },
      { key: 'undoLimit', label: '撤销步数', step: 1, min: 1 },
    ];
    for (const { key, label, step, min, max } of numKeys) {
      const row = document.createElement('div');
      row.className = 'be-field';
      row.innerHTML = `<label>${label}</label>`;
      const input = document.createElement('input');
      input.type = 'number';
      if (step != null) input.step = String(step);
      if (min != null) input.min = String(min);
      if (max != null) input.max = String(max);
      const v = this.cfg[key];
      if (typeof v === 'number' && key.endsWith('Color')) {
        input.type = 'text';
        input.value = `0x${Number(v).toString(16)}`;
      } else {
        input.value = String(v);
        if (typeof v === 'number') attachDragScrub(input);
      }
      input.addEventListener('change', () => {
        if (key.endsWith('Color')) {
          const n = Number(input.value);
          if (Number.isFinite(n)) (this.cfg as Record<string, unknown>)[key] = n;
        } else {
          const n = Number(input.value);
          if (!Number.isFinite(n)) return;
          (this.cfg as Record<string, unknown>)[key] = n;
          if (key === 'playhead') this.playback.seek(n);
          if (key === 'playbackFps') {
            this.playback.playbackFps = n;
            if (this.playback.playing) {
              this.playback.pause();
              this.playback.play();
            }
          }
          if (key === 'undoLimit') this.doc.undoLimit = n;
          if (key === 'boxDragMinSize') this.doc.minSize = n;
          if (key === 'autoSaveDebounceMs') this.overrides.debounceMs = n;
        }
        this.onConfigChanged();
      });
      row.appendChild(input);
      host.appendChild(row);
    }

    const scrubRow = document.createElement('div');
    scrubRow.className = 'be-field';
    scrubRow.innerHTML = `<label>动画对齐方式</label>`;
    const scrubSel = document.createElement('select');
    for (const m of ['uniform', 'truncate'] as const) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m === 'uniform' ? '均匀拉伸' : '按 60 帧截断';
      if (this.cfg.scrubMode === m) opt.selected = true;
      scrubSel.appendChild(opt);
    }
    scrubSel.addEventListener('change', () => {
      this.cfg.scrubMode = scrubSel.value as 'uniform' | 'truncate';
      this.onConfigChanged();
    });
    scrubRow.appendChild(scrubSel);
    host.appendChild(scrubRow);

    const apiRow = document.createElement('div');
    apiRow.className = 'be-field';
    apiRow.innerHTML = `<label>接口前缀</label>`;
    const apiInput = document.createElement('input');
    apiInput.type = 'text';
    apiInput.value = this.cfg.apiBase;
    apiInput.addEventListener('change', () => {
      this.cfg.apiBase = apiInput.value;
      this.onConfigChanged();
    });
    apiRow.appendChild(apiInput);
    host.appendChild(apiRow);
  }

  private onConfigChanged(): void {
    this.playback.loop = this.cfg.loop;
    this.overrides.autoSaveEnabled = this.cfg.autoSaveEnabled;
    this.overrides.debounceMs = this.cfg.autoSaveDebounceMs;
    this.syncMainDebugFlags();
    this.refreshTimeline();
    this.syncScene();
    saveBoxEditorConfig(this.cfg);
  }

  private async refreshManifest(): Promise<void> {
    this.manifest = await this.overrides.getManifest();
    this.updateListMarks();
  }

  private updateListMarks(): void {
    this.root.querySelectorAll<HTMLLIElement>('.be-move-list li').forEach((li) => {
      const key = li.dataset.key ?? '';
      const mark = li.querySelector('[data-mark]');
      if (!mark) return;
      if (key === 'stance_stand' || key === 'stance_crouch') {
        mark.textContent = this.manifest.stance ? '已改' : '';
      } else {
        mark.textContent = this.manifest.moves[key] ? '已改' : '';
      }
    });
  }

  private setActiveListItem(key: string): void {
    this.root.querySelectorAll('.be-move-list li').forEach((li) => {
      li.classList.toggle('is-active', (li as HTMLElement).dataset.key === key);
    });
  }

  private async selectListKey(key: string): Promise<void> {
    if (this.currentListKey && this.doc.dirty) {
      await this.flushSave();
    }
    this.playback.pause();
    this.currentListKey = key;
    this.setActiveListItem(key);
    this.setStatus('加载中…');
    try {
      if (key === 'stance_stand' || key === 'stance_crouch') {
        const { table } = await loadStanceTableResolved();
        this.doc.loadStance(table, key);
        this.playback.setLength(1);
        this.playback.seek(0);
      } else {
        const { def, fromOverride } = await loadMoveDefinitionResolved(key);
        this.doc.loadMove(key, def);
        this.playback.setLength(this.doc.timelineLength());
        this.playback.seek(0);
        this.setStatus(fromOverride ? `已加载 override: ${key}` : `已加载: ${key}`);
      }
      this.cfg.playhead = 0;
      this.refreshAll();
      if (key.startsWith('stance_')) this.setStatus(`姿态模式: ${key}`);
    } catch (e) {
      this.setStatus(`加载失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }

  private refreshAll(): void {
    this.refreshTimeline();
    this.refreshProps();
    this.syncScene();
    this.updateListMarks();
  }

  private onPlayheadChange(): void {
    this.cfg.playhead = this.playback.playhead;
    this.elFrameLabel.textContent = `第 ${this.playback.playhead} / ${this.playback.getLength() - 1} 帧`;
    this.positionPlayhead();
    this.syncScene();
  }

  private refreshTimeline(): void {
    const len = Math.max(1, this.playback.getLength());
    const boxes = this.doc.getBoxes();
    const tracks: Record<BoxKind, HTMLElement> = {
      hit: this.elTimeline.querySelector('[data-track="hit"]')!,
      hurt: this.elTimeline.querySelector('[data-track="hurt"]')!,
      push: this.elTimeline.querySelector('[data-track="push"]')!,
    };
    const show: Record<BoxKind, boolean> = {
      hit: this.cfg.showTimelineHit,
      hurt: this.cfg.showTimelineHurt,
      push: this.cfg.showTimelinePush,
    };
    for (const kind of ['hit', 'hurt', 'push'] as BoxKind[]) {
      const track = tracks[kind];
      track.style.display = show[kind] ? '' : 'none';
      track.innerHTML = '';
      if (!show[kind]) continue;
      boxes[kind].forEach((b, index) => {
        const bar = document.createElement('div');
        bar.className = `be-timeline-bar ${kind}`;
        if (
          this.doc.selection?.kind === kind &&
          this.doc.selection.index === index
        ) {
          bar.classList.add('is-selected');
        }
        const left = (b.from / len) * 100;
        const width = ((b.to - b.from + 1) / len) * 100;
        bar.style.left = `${left}%`;
        bar.style.width = `${Math.max(0.5, width)}%`;
        bar.dataset.kind = kind;
        bar.dataset.index = String(index);
        const leftEdge = document.createElement('div');
        leftEdge.className = 'be-timeline-edge left';
        const rightEdge = document.createElement('div');
        rightEdge.className = 'be-timeline-edge right';
        bar.append(leftEdge, rightEdge);
        bar.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          this.doc.select({ kind, index });
          this.refreshProps();
          this.refreshTimeline();
          this.syncScene();
          const target = e.target as HTMLElement;
          const edge =
            target.classList.contains('left')
              ? 'from'
              : target.classList.contains('right')
                ? 'to'
                : 'body';
          this.beginTimelineDrag(kind, index, edge, e);
        });
        track.appendChild(bar);
      });
    }
    this.elFrameLabel.textContent = `第 ${this.playback.playhead} / ${len - 1} 帧`;
    this.positionPlayhead();
  }

  private positionPlayhead(): void {
    const len = Math.max(1, this.playback.getLength());
    const pct = ((this.playback.playhead + 0.5) / len) * 100;
    this.elPlayhead.style.left = `${pct}%`;
    const handle = this.root.querySelector(
      '[data-playhead-handle]',
    ) as HTMLElement;
    handle.style.left = `${pct}%`;
  }

  private beginTimelineDrag(
    kind: BoxKind,
    index: number,
    edge: 'from' | 'to' | 'body',
    e: PointerEvent,
  ): void {
    const box = this.doc.getBoxes()[kind][index];
    if (!box) return;
    const startFrom = box.from;
    const startTo = box.to;
    const rect = this.elTimeline.getBoundingClientRect();
    const len = Math.max(1, this.playback.getLength());
    const frameAt = (clientX: number) => {
      const u = (clientX - rect.left) / Math.max(1, rect.width);
      return Math.max(0, Math.min(len - 1, Math.floor(u * len)));
    };
    const startFrame = frameAt(e.clientX);
    const onMove = (ev: PointerEvent) => {
      const f = frameAt(ev.clientX);
      if (edge === 'from') this.doc.setBoxRangeLive(kind, index, f, startTo);
      else if (edge === 'to') this.doc.setBoxRangeLive(kind, index, startFrom, f);
      else {
        const delta = f - startFrame;
        this.doc.setBoxRangeLive(kind, index, startFrom + delta, startTo + delta);
      }
      this.refreshTimeline();
      this.refreshProps();
      this.syncScene();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const cur = this.doc.getBoxes()[kind][index];
      if (!cur) return;
      if (cur.from !== startFrom || cur.to !== startTo) {
        this.doc.commitBoxRange(
          kind,
          index,
          { from: startFrom, to: startTo },
          { from: cur.from, to: cur.to },
        );
        this.afterCommand();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  private bindTimelineInteraction(): void {
    const handle = this.root.querySelector(
      '[data-playhead-handle]',
    ) as HTMLElement;
    const seekFromEvent = (clientX: number) => {
      const rect = this.elTimeline.getBoundingClientRect();
      const len = Math.max(1, this.playback.getLength());
      const u = (clientX - rect.left) / Math.max(1, rect.width);
      this.playback.seek(Math.floor(u * len));
    };
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const onMove = (ev: PointerEvent) => seekFromEvent(ev.clientX);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    this.elTimeline.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.be-timeline-bar')) return;
      seekFromEvent(e.clientX);
    });
  }

  private refreshProps(): void {
    this.suppressProps = true;
    const sel = this.doc.selection;
    const box = sel ? this.doc.getBoxes()[sel.kind][sel.index] : null;
    const setNum = (el: HTMLInputElement | null, v: number | '') => {
      if (el) el.value = v === '' ? '' : String(v);
    };
    if (!box || !sel) {
      setNum(this.props.x, '');
      setNum(this.props.y, '');
      setNum(this.props.w, '');
      setNum(this.props.h, '');
      setNum(this.props.from, '');
      setNum(this.props.to, '');
      if (this.props.kind) this.props.kind.value = 'hit';
      if (this.props.part) this.props.part.value = '';
      if (this.props.layer) this.props.layer.value = '';
      this.suppressProps = false;
      return;
    }
    setNum(this.props.x, box.x);
    setNum(this.props.y, box.y);
    setNum(this.props.w, box.w);
    setNum(this.props.h, box.h);
    setNum(this.props.from, box.from);
    setNum(this.props.to, box.to);
    if (this.props.kind) this.props.kind.value = sel.kind;
    if (this.props.part) this.props.part.value = box.part ?? '';
    if (this.props.layer) this.props.layer.value = box.layer ?? '';
    const stance = this.doc.mode !== 'move';
    if (this.props.from) this.props.from.disabled = stance;
    if (this.props.to) this.props.to.disabled = stance;
    this.suppressProps = false;
  }

  private onPropChange(key: keyof typeof this.props): void {
    if (this.suppressProps || !this.doc.selection) return;
    const { kind, index } = this.doc.selection;
    const box = this.doc.getBoxes()[kind][index];
    if (!box) return;
    if (key === 'kind' && this.props.kind) {
      this.doc.setSelectedKind(this.props.kind.value as BoxKind);
      this.afterCommand();
      return;
    }
    if (key === 'part' || key === 'layer') {
      const part = this.props.part?.value || undefined;
      const layer = this.props.layer?.value || undefined;
      this.doc.setBoxMeta(kind, index, {
        part: part as TimedBoxPart | undefined,
        layer: layer as 'base' | 'extend' | undefined,
      });
      this.afterCommand();
      return;
    }
    if (key === 'from' || key === 'to') {
      const from = Number(this.props.from?.value ?? box.from);
      const to = Number(this.props.to?.value ?? box.to);
      this.doc.setBoxRange(kind, index, from, to);
      this.afterCommand();
      return;
    }
    const x = Number(this.props.x?.value ?? box.x);
    const y = Number(this.props.y?.value ?? box.y);
    const w = Number(this.props.w?.value ?? box.w);
    const h = Number(this.props.h?.value ?? box.h);
    this.doc.setBoxGeom(kind, index, { x, y, w, h });
    this.afterCommand();
  }

  private async onToolbar(act: string): Promise<void> {
    switch (act) {
      case 'exit':
        this.requestExit();
        break;
      case 'play':
        this.playback.togglePlay();
        break;
      case 'step-1':
        this.playback.step(-1);
        break;
      case 'step+1':
        this.playback.step(1);
        break;
      case 'loop':
        this.playback.toggleLoop();
        this.cfg.loop = this.playback.loop;
        saveBoxEditorConfig(this.cfg);
        break;
      case 'add-hit':
        this.doc.addBox('hit', this.playback.playhead);
        this.afterCommand();
        break;
      case 'add-hurt':
        this.doc.addBox('hurt', this.playback.playhead);
        this.afterCommand();
        break;
      case 'add-push':
        this.doc.addBox('push', this.playback.playhead);
        this.afterCommand();
        break;
      case 'delete':
        this.doc.deleteSelected();
        this.afterCommand();
        break;
      case 'copy':
        this.doc.copySelected(this.playback.playhead);
        this.afterCommand();
        break;
      case 'undo':
        if (this.doc.undo()) this.afterCommand();
        break;
      case 'redo':
        if (this.doc.redo()) this.afterCommand();
        break;
      case 'restore-move':
        await this.restoreCurrent();
        break;
      case 'restore-all':
        await this.overrides.restoreAll();
        await this.refreshManifest();
        if (this.currentListKey) await this.selectListKey(this.currentListKey);
        this.setStatus('已全局恢复');
        break;
      default:
        break;
    }
  }

  private async restoreCurrent(): Promise<void> {
    const key = this.currentListKey;
    if (!key) return;
    if (key === 'stance_stand' || key === 'stance_crouch') {
      await this.overrides.restoreStance();
    } else {
      await this.overrides.restoreMove(key);
    }
    await this.refreshManifest();
    await this.selectListKey(key);
    this.setStatus('已恢复原始');
  }

  private afterCommand(): void {
    this.refreshTimeline();
    this.refreshProps();
    this.syncScene();
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (!this.doc.dirty) return;
    this.setStatus('待保存…', 'saving');
    if (this.doc.mode === 'move' && this.doc.moveId) {
      const id = this.doc.moveId;
      this.overrides.scheduleSaveMove(id, () => this.doc.buildMoveOverridePayload());
      window.setTimeout(() => void this.afterSaveTick(id), this.overrides.debounceMs + 50);
    } else {
      this.overrides.scheduleSaveStance(() => this.doc.buildStanceOverridePayload());
      window.setTimeout(() => void this.afterSaveTick(null), this.overrides.debounceMs + 50);
    }
  }

  private async afterSaveTick(moveId: string | null): Promise<void> {
    if (this.overrides.lastError) {
      this.setStatus(`保存失败（已下载备份）: ${this.overrides.lastError}`, 'error');
      return;
    }
    if (!this.overrides.saving) {
      this.doc.markClean();
      await this.refreshManifest();
      this.setStatus(moveId ? `已保存 ${moveId}` : '已保存姿态');
    }
  }

  private async flushSave(): Promise<void> {
    if (this.doc.mode === 'move' && this.doc.moveId) {
      await this.overrides.flushMove(this.doc.moveId, () =>
        this.doc.buildMoveOverridePayload(),
      );
    } else {
      const t = this.doc.buildStanceOverridePayload();
      if (t) await this.overrides.saveStanceNow(t);
    }
    this.doc.markClean();
    await this.refreshManifest();
  }

  private setStatus(msg: string, kind?: 'error' | 'saving'): void {
    this.elStatus.textContent = msg;
    this.elStatus.classList.toggle('is-error', kind === 'error');
    this.elStatus.classList.toggle('is-saving', kind === 'saving');
  }

  private bindKeys(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.running) return;
      if (!document.body.classList.contains('box-edit-mode')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (this.doc.redo()) this.afterCommand();
        } else if (this.doc.undo()) {
          this.afterCommand();
        }
        return;
      }
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        this.playback.togglePlay();
        return;
      }
      if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        this.playback.step(-1);
      }
      if (e.key === 'ArrowRight' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        this.playback.step(1);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.requestExit();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }
}

type TimedBoxPart = 'head' | 'body' | 'leg' | 'extend' | 'unknown';

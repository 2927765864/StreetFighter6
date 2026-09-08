import { BoxEditorPlayback } from '../../boxEditor/playback/BoxEditorPlayback';
import { attachDragScrub, attachDragScrubAll } from '../../debug/dragScrub';
import { FLIPBOOK_SHEETS } from './catalog';
import { cloneRecipe, DEFAULT_FLIPBOOK_RECIPE, findLayer } from './defaults';
import './flipbook2d.css';
import { parseBlend } from './layerLook';
import { loadFlipbookRecipe, saveFlipbookRecipe } from './persist';
import { Flipbook2DCombat } from './Flipbook2DCombat';
import {
  layerEndFrame,
  type FlipbookLayer,
  type FlipbookLayerId,
  type FlipbookRecipe,
} from './types';
import type { HitVfxTriggerArgs } from '../../render/hitVfx/hitVfxTypes';
import { CONFIG } from '../../config/store';

const TRACK_COLORS: Record<FlipbookLayerId, string> = {
  E1_core_flash: '#e8a040',
  E2_near_sparks: '#f0d060',
  E3_ring_smoke: '#8aa0b8',
  E4_wide_short_smoke: '#6a9bb8',
  E5_narrow_long_smoke: '#7ab8a0',
};

export type Flipbook2DHost = {
  appRoot: HTMLElement;
  canvasSlot: HTMLElement;
  treeBody: HTMLElement;
  inspectorBody: HTMLElement;
  viewportPane: HTMLElement;
  world?: {
    combat: Flipbook2DCombat;
    glCanvas: HTMLCanvasElement;
    setOrbitEnabled: (on: boolean) => void;
  };
};

export class Flipbook2DApp {
  private host: Flipbook2DHost;
  private recipe: FlipbookRecipe;
  private playback = new BoxEditorPlayback();
  private selectedId: FlipbookLayerId = 'E1_core_flash';
  private timelineWrap: HTMLElement;
  private elTimeline!: HTMLDivElement;
  private elPlayhead!: HTMLDivElement;
  private elHandle!: HTMLDivElement;
  private elFrameLabel!: HTMLSpanElement;
  private active = false;
  private suppressInsp = false;

  constructor(host: Flipbook2DHost) {
    this.host = host;
    this.recipe = loadFlipbookRecipe();
    this.playback.playbackFps = this.recipe.fps;
    this.playback.loop = true;
    this.playback.setLength(this.recipe.length);
    this.playback.setOnChange(() => this.onPlayhead());

    this.timelineWrap = document.createElement('div');
    this.timelineWrap.className = 'fb2d-timeline-wrap';
    this.timelineWrap.innerHTML = `
      <div class="fb2d-timeline-meta">
        <span data-fb-frame>第 0 帧</span>
        <button type="button" data-fb-act="play">播放</button>
        <button type="button" data-fb-act="pause">暂停</button>
        <button type="button" data-fb-act="prev">上一帧</button>
        <button type="button" data-fb-act="next">下一帧</button>
        <button type="button" data-fb-act="loop" class="is-active">循环</button>
        <label>fps <input type="number" data-fb-fps min="1" max="60" step="1" style="width:56px" /></label>
        <label>总帧 <input type="number" data-fb-len min="1" max="120" step="1" style="width:56px" /></label>
        <button type="button" data-fb-act="reset">恢复默认配方</button>
      </div>
      <div class="fb2d-timeline" data-fb-timeline>
        <div class="fb2d-playhead" data-fb-playhead></div>
        <div class="fb2d-playhead-handle" data-fb-handle></div>
      </div>
    `;
    host.viewportPane.appendChild(this.timelineWrap);
    this.elTimeline = this.timelineWrap.querySelector('[data-fb-timeline]')!;
    this.elPlayhead = this.timelineWrap.querySelector('[data-fb-playhead]')!;
    this.elHandle = this.timelineWrap.querySelector('[data-fb-handle]')!;
    this.elFrameLabel = this.timelineWrap.querySelector('[data-fb-frame]')!;

    this.bindChrome();
    this.bindLayerDrag();
    this.bindTimeline();
  }

  isActive(): boolean {
    return this.active;
  }

  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.host.appRoot.classList.toggle('hvfx-mode-2d', on);
    const treeHead = this.host.appRoot.querySelector('#hvfx-tree-pane .hvfx-pane-header');
    const inspHead = this.host.appRoot.querySelector('#hvfx-inspector-pane .hvfx-pane-header');
    if (treeHead) treeHead.textContent = on ? '2D 层级（上=更靠前）' : '配方 / 分组 / 元素';
    if (inspHead) inspHead.textContent = on ? '2D 层参数' : '检查器';
    if (on) {
      this.playback.playbackFps = this.recipe.fps;
      this.playback.setLength(this.recipe.length);
      this.refreshTree();
      this.refreshInspector();
      this.refreshTimeline();
      this.syncWorld();
    } else {
      this.playback.pause();
      this.host.world?.combat.clearEditor();
    }
  }

  syncWorld(): void {
    if (!this.active || !this.host.world) return;
    const args: HitVfxTriggerArgs = {
      kind: CONFIG.hitVfxPreviewKind,
      strength: CONFIG.hitVfxPreviewStrength,
      height: CONFIG.hitVfxPreviewHeight,
      x: 0,
      // Same orientation as combat: authored +X = screen right (no facing mirror).
      facing: -1,
    };
    this.host.world.combat.syncEditor(
      this.recipe,
      this.playback.playhead,
      args,
    );
  }

  private persist(): void {
    saveFlipbookRecipe(this.recipe);
  }

  private onPlayhead(): void {
    this.positionPlayhead();
    this.elFrameLabel.textContent = `第 ${this.playback.playhead} / ${this.recipe.length - 1} 帧`;
    this.syncWorld();
  }

  private bindChrome(): void {
    this.timelineWrap.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-fb-act]');
      if (!(btn instanceof HTMLButtonElement)) return;
      const act = btn.dataset.fbAct;
      if (act === 'play') this.playback.play();
      if (act === 'pause') this.playback.pause();
      if (act === 'prev') this.playback.step(-1);
      if (act === 'next') this.playback.step(1);
      if (act === 'loop') {
        this.playback.toggleLoop();
        btn.classList.toggle('is-active', this.playback.loop);
      }
      if (act === 'reset') {
        this.recipe = cloneRecipe(DEFAULT_FLIPBOOK_RECIPE);
        this.playback.setLength(this.recipe.length);
        this.playback.playbackFps = this.recipe.fps;
        this.persist();
        this.refreshAll();
      }
    });
    const fps = this.timelineWrap.querySelector('[data-fb-fps]') as HTMLInputElement;
    const len = this.timelineWrap.querySelector('[data-fb-len]') as HTMLInputElement;
    fps.value = String(this.recipe.fps);
    len.value = String(this.recipe.length);
    attachDragScrub(fps);
    attachDragScrub(len);
    const applyFps = (save: boolean) => {
      this.recipe.fps = Math.max(1, Math.floor(Number(fps.value) || 30));
      this.playback.playbackFps = this.recipe.fps;
      if (save) this.persist();
    };
    const applyLen = (save: boolean) => {
      this.recipe.length = Math.max(1, Math.floor(Number(len.value) || 17));
      this.playback.setLength(this.recipe.length);
      this.refreshTimeline();
      if (save) this.persist();
    };
    fps.addEventListener('input', () => applyFps(false));
    fps.addEventListener('change', () => applyFps(true));
    len.addEventListener('input', () => applyLen(false));
    len.addEventListener('change', () => applyLen(true));
  }

  private bindLayerDrag(): void {
    const gl = this.host.world?.glCanvas;
    if (!gl) return;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origX = 0;
    let origY = 0;
    gl.addEventListener('pointerdown', (e) => {
      if (!this.active || !e.shiftKey) return;
      const layer = findLayer(this.recipe, this.selectedId);
      if (!layer) return;
      e.preventDefault();
      dragging = true;
      this.host.world?.setOrbitEnabled(false);
      startX = e.clientX;
      startY = e.clientY;
      origX = layer.offsetX;
      origY = layer.offsetY;
      gl.setPointerCapture(e.pointerId);
    });
    gl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const layer = findLayer(this.recipe, this.selectedId);
      if (!layer) return;
      layer.offsetX = origX + (e.clientX - startX);
      layer.offsetY = origY + (e.clientY - startY);
      this.refreshInspector();
      this.syncWorld();
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      this.host.world?.setOrbitEnabled(true);
      this.persist();
    };
    gl.addEventListener('pointerup', end);
    gl.addEventListener('pointercancel', end);
  }

  private bindTimeline(): void {
    const seekFromEvent = (clientX: number) => {
      const rect = this.elTimeline.getBoundingClientRect();
      const len = Math.max(1, this.recipe.length);
      const u = (clientX - rect.left) / Math.max(1, rect.width);
      this.playback.seek(Math.floor(u * len));
    };
    this.elHandle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const onMove = (ev: PointerEvent) => seekFromEvent(ev.clientX);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    this.elTimeline.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.fb2d-bar')) return;
      seekFromEvent(e.clientX);
    });
  }

  private positionPlayhead(): void {
    const len = Math.max(1, this.recipe.length);
    const pct = ((this.playback.playhead + 0.5) / len) * 100;
    this.elPlayhead.style.left = `${pct}%`;
    this.elHandle.style.left = `${pct}%`;
  }

  private refreshAll(): void {
    this.refreshTree();
    this.refreshInspector();
    this.refreshTimeline();
    this.syncWorld();
    const fps = this.timelineWrap.querySelector('[data-fb-fps]') as HTMLInputElement;
    const len = this.timelineWrap.querySelector('[data-fb-len]') as HTMLInputElement;
    fps.value = String(this.recipe.fps);
    len.value = String(this.recipe.length);
  }

  private refreshTree(): void {
    const layers = [...this.recipe.layers].sort((a, b) => b.z - a.z);
    this.host.treeBody.innerHTML = layers
      .map((l) => {
        const sel = l.id === this.selectedId ? ' is-selected' : '';
        return `<div class="fb2d-layer-row${sel}" data-fb-layer="${l.id}">
          <span class="fb2d-swatch" style="background:${TRACK_COLORS[l.id]}"></span>
          <input type="checkbox" data-fb-en="${l.id}" ${l.enabled ? 'checked' : ''} />
          <span class="name">${l.name}</span>
          <span class="fb2d-zbtns">
            <button type="button" data-fb-z="up" data-id="${l.id}">上</button>
            <button type="button" data-fb-z="down" data-id="${l.id}">下</button>
          </span>
        </div>`;
      })
      .join('');
    this.host.treeBody.querySelectorAll('[data-fb-layer]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('input,button')) return;
        this.selectedId = (row as HTMLElement).dataset.fbLayer as FlipbookLayerId;
        this.refreshAll();
      });
    });
    this.host.treeBody.querySelectorAll<HTMLInputElement>('[data-fb-en]').forEach((box) => {
      box.addEventListener('change', () => {
        const id = box.dataset.fbEn as FlipbookLayerId;
        const layer = findLayer(this.recipe, id);
        if (!layer) return;
        layer.enabled = box.checked;
        this.persist();
        this.syncWorld();
      });
    });
    this.host.treeBody.querySelectorAll<HTMLButtonElement>('[data-fb-z]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id as FlipbookLayerId;
        this.nudgeZ(id, btn.dataset.fbZ === 'up' ? 1 : -1);
      });
    });
  }

  private nudgeZ(id: FlipbookLayerId, dir: number): void {
    const layer = findLayer(this.recipe, id);
    if (!layer) return;
    const ordered = [...this.recipe.layers].sort((a, b) => a.z - b.z);
    const i = ordered.findIndex((l) => l.id === id);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    const other = ordered[j]!;
    const tmp = layer.z;
    layer.z = other.z;
    other.z = tmp;
    this.selectedId = id;
    this.persist();
    this.refreshAll();
  }

  private refreshInspector(): void {
    if (this.suppressInsp) return;
    const layer = findLayer(this.recipe, this.selectedId);
    if (!layer) {
      this.host.inspectorBody.innerHTML = '';
      return;
    }
    const srcN = FLIPBOOK_SHEETS[layer.id]?.length ?? 0;
    this.host.inspectorBody.innerHTML = `
      <div style="padding:12px">
        <h3 style="margin:0 0 10px">${layer.name}</h3>
        <p style="opacity:.7;font-size:12px">素材 ${srcN} 帧 · 混合 ${
          layer.blend === 'add' ? '加法' : layer.blend === 'screen' ? '滤色' : '普通'
        }</p>
        <div class="fb2d-insp-row"><label>显示层级 z</label><input type="number" data-f="z" step="1" value="${layer.z}" /></div>
        <div class="fb2d-insp-row"><label>位置 X</label><input type="number" data-f="offsetX" step="1" value="${layer.offsetX}" /></div>
        <div class="fb2d-insp-row"><label>位置 Y</label><input type="number" data-f="offsetY" step="1" value="${layer.offsetY}" /></div>
        <div class="fb2d-insp-row"><label>缩放</label><input type="number" data-f="scale" step="0.05" min="0.05" value="${layer.scale}" /></div>
        <div class="fb2d-insp-row"><label>透明度</label><input type="number" data-f="opacity" step="0.05" min="0" max="1" value="${layer.opacity}" /></div>
        <div class="fb2d-insp-row"><label>亮度</label><input type="number" data-f="brightness" step="0.05" min="0" max="8" value="${layer.brightness}" /></div>
        <div class="fb2d-insp-row"><label>提亮</label><input type="number" data-f="lift" step="0.05" min="0" max="2" value="${layer.lift}" /></div>
        <div class="fb2d-insp-row"><label>去黑边</label><input type="number" data-f="despill" step="0.05" min="0" max="1" value="${layer.despill}" /></div>
        <div class="fb2d-insp-row"><label>出现帧</label><input type="number" data-f="startFrame" step="1" min="0" value="${layer.startFrame}" /></div>
        <div class="fb2d-insp-row"><label>持续帧数</label><input type="number" data-f="duration" step="1" min="1" value="${layer.duration}" /></div>
        <div class="fb2d-insp-row"><label>混合</label>
          <select data-f="blend">
            <option value="normal" ${layer.blend === 'normal' ? 'selected' : ''}>普通（挡光）</option>
            <option value="screen" ${layer.blend === 'screen' ? 'selected' : ''}>滤色（蒸汽）</option>
            <option value="add" ${layer.blend === 'add' ? 'selected' : ''}>加法（火/火花）</option>
          </select>
        </div>
        <p style="opacity:.65;font-size:12px;line-height:1.45">预览就是训练场 3D 场景（同一套光照）。Shift+拖画面改本层位置；左键拖仍是转镜头。时间线改出现时机。</p>
      </div>
    `;
    attachDragScrubAll(this.host.inspectorBody);
    this.host.inspectorBody.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-f]').forEach((el) => {
      el.addEventListener('input', () => this.onInspField(el, false));
      el.addEventListener('change', () => this.onInspField(el, true));
    });
  }

  private onInspField(
    el: HTMLInputElement | HTMLSelectElement,
    persist: boolean,
  ): void {
    const layer = findLayer(this.recipe, this.selectedId);
    if (!layer) return;
    const f = el.dataset.f as keyof FlipbookLayer;
    if (f === 'blend') {
      layer.blend = parseBlend(el.value);
    } else if (f === 'enabled') {
      /* n/a */
    } else if (typeof layer[f] === 'number') {
      const n = Number(el.value);
      if (!Number.isFinite(n)) return;
      if (f === 'opacity') layer.opacity = Math.max(0, Math.min(1, n));
      else if (f === 'brightness') layer.brightness = Math.max(0, n);
      else if (f === 'lift') layer.lift = Math.max(0, Math.min(2, n));
      else if (f === 'despill') layer.despill = Math.max(0, Math.min(1, n));
      else if (f === 'duration') layer.duration = Math.max(1, Math.floor(n));
      else if (f === 'startFrame') layer.startFrame = Math.max(0, Math.floor(n));
      else if (f === 'z') layer.z = Math.floor(n);
      else if (f === 'scale') layer.scale = Math.max(0.05, n);
      else if (f === 'offsetX') layer.offsetX = n;
      else if (f === 'offsetY') layer.offsetY = n;
    }
    if (persist) this.persist();
    this.suppressInsp = true;
    this.refreshTimeline();
    this.refreshTree();
    this.suppressInsp = false;
    this.syncWorld();
  }

  private refreshTimeline(): void {
    this.elTimeline.querySelectorAll('.fb2d-track').forEach((n) => n.remove());
    const len = Math.max(1, this.recipe.length);
    const ordered = [...this.recipe.layers].sort((a, b) => b.z - a.z);
    ordered.forEach((layer, i) => {
      const track = document.createElement('div');
      track.className = 'fb2d-track';
      track.style.top = `${8 + i * 28}px`;
      const label = document.createElement('div');
      label.className = 'fb2d-track-label';
      label.textContent = layer.name;
      const bar = document.createElement('div');
      bar.className = 'fb2d-bar';
      if (layer.id === this.selectedId) bar.classList.add('is-selected');
      bar.style.background = TRACK_COLORS[layer.id];
      const left = (layer.startFrame / len) * 100;
      const width = (Math.max(1, layer.duration) / len) * 100;
      bar.style.left = `${left}%`;
      bar.style.width = `${Math.max(1.2, width)}%`;
      bar.innerHTML = `<div class="fb2d-edge left"></div><div class="fb2d-edge right"></div>`;
      bar.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.selectedId = layer.id;
        this.refreshTree();
        this.refreshInspector();
        this.refreshTimeline();
        const target = e.target as HTMLElement;
        const edge = target.classList.contains('left')
          ? 'from'
          : target.classList.contains('right')
            ? 'to'
            : 'body';
        this.beginBarDrag(layer.id, edge, e);
      });
      track.append(label, bar);
      this.elTimeline.appendChild(track);
    });
    this.elTimeline.style.height = `${16 + ordered.length * 28}px`;
    this.positionPlayhead();
    this.elFrameLabel.textContent = `第 ${this.playback.playhead} / ${this.recipe.length - 1} 帧`;
  }

  private beginBarDrag(
    id: FlipbookLayerId,
    edge: 'from' | 'to' | 'body',
    e: PointerEvent,
  ): void {
    const layer = findLayer(this.recipe, id);
    if (!layer) return;
    const startFrom = layer.startFrame;
    const startDur = layer.duration;
    const startTo = layerEndFrame(layer);
    const rect = this.elTimeline.getBoundingClientRect();
    const len = Math.max(1, this.recipe.length);
    const frameAt = (clientX: number) => {
      const u = (clientX - rect.left) / Math.max(1, rect.width);
      return Math.max(0, Math.min(len - 1, Math.floor(u * len)));
    };
    const startFrame = frameAt(e.clientX);
    const onMove = (ev: PointerEvent) => {
      const f = frameAt(ev.clientX);
      const cur = findLayer(this.recipe, id);
      if (!cur) return;
      if (edge === 'from') {
        const to = startTo;
        const from = Math.min(f, to);
        cur.startFrame = from;
        cur.duration = to - from + 1;
      } else if (edge === 'to') {
        const from = startFrom;
        const to = Math.max(f, from);
        cur.startFrame = from;
        cur.duration = to - from + 1;
      } else {
        const delta = f - startFrame;
        cur.startFrame = Math.max(0, startFrom + delta);
        cur.duration = startDur;
      }
      this.refreshTimeline();
      this.refreshInspector();
      this.syncWorld();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      this.persist();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
}


/**
 * Three-pane Hit VFX editor UI (Chinese).
 * Plan: docs/plans/ai-execution-plan-hit-vfx-editor-ui-v0.md PR-C/D/E
 */
import './hit-vfx-editor.css';
import { CONFIG } from '../config/store';
import {
  clearHitVfxEditorDraft,
  exportShippingJson,
  saveHitVfxEditorDraft,
} from '../config/persist';
import { attachDragScrubAll } from '../debug/dragScrub';
import {
  CREATABLE_ELEMENT_TYPES,
  type DustParams,
  type SmokeRingParams,
  type HitVfxElement,
  type HitVfxElementPreset,
  type HitVfxElementType,
  type HitVfxGroup,
  type HitVfxRecipe,
  type HitVfxRecipeKind,
  type HitVfxStrength,
  type SparkDebrisParams,
  type SparkParams,
  type SweatParams,
  type VolumeSmokeParams,
} from '../render/hitVfx/hitVfxTypes';
import { GRID } from '../render/hitVfx/volumeSmoke/createStorage3D';
import { randomUint32 } from '../render/hitVfx/volumeSmoke/spawnSeed';
import {
  copyElement,
  copyRecipe,
  materializePastedElement,
  materializePastedRecipe,
  readClipboard,
} from './HitVfxClipboard';
import {
  createElement,
  createEmptyRecipe,
  createGroup,
  deleteElement,
  deleteGroup,
  deleteRecipe,
  elementFromPreset,
  moveElementToGroup,
  renameElement,
  renameGroup,
  saveElementAsPreset,
  setGroupEnabled,
  treeVisibleElements,
} from './hitVfxRecipeOps';

export type HitVfxEditorPanelHooks = {
  /** Fire one preview (or start/stop loop). Returns flash text. */
  replay: () => string;
  /** Always fire one preview (does not toggle loop). */
  replayNow: () => void;
  stepFrame: () => void;
  invalidate: () => void;
  onConfigChanged: (key: string) => void;
  /**
   * Volume-smoke live path: update gizmo + running uniforms without clearing.
   * Panel will also schedule a debounced replay for splat shape.
   */
  onVolumeSmokeParamsChanged?: (
    params: VolumeSmokeParams,
    elementId: string,
  ) => void;
};

export type HitVfxEditorPanelApi = {
  refresh: () => void;
  destroy: () => void;
};

type SelectionKind = 'recipe' | 'group' | 'element';

const ELEMENT_TYPE_LABEL: Record<
  Exclude<HitVfxElementType, 'sparkLight'>,
  string
> = {
  spark: '火花',
  sparkDebris: '小粒子',
  dust: '扬尘(旧)',
  smokeRing: '涡环烟',
  sweat: '汗水',
  volumeSmoke: '体素烟',
};

const STRENGTH_MUL_LABELS: Record<
  keyof HitVfxRecipe['strengthScale']['L'],
  string
> = {
  countMul: '数量倍率',
  sizeMul: '尺寸倍率',
  brightnessMul: '亮度倍率',
  lifetimeMul: '寿命倍率',
  lightIntensityMul: '光强倍率',
};

function hexToColorInput(n: number): string {
  return `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
}

function colorInputToHex(s: string): number {
  const t = s.replace('#', '').trim();
  const n = Number.parseInt(t, 16);
  return Number.isFinite(n) ? n >>> 0 : 0xffffff;
}

function currentRecipe(): HitVfxRecipe | undefined {
  return (
    CONFIG.hitVfxRecipes.find((r) => r.id === CONFIG.hitVfxSelectedRecipeId) ??
    CONFIG.hitVfxRecipes[0]
  );
}

function ensureSelectionDefaults(): void {
  const recipe = currentRecipe();
  if (!recipe) return;
  if (CONFIG.hitVfxSelectedRecipeId !== recipe.id) {
    CONFIG.hitVfxSelectedRecipeId = recipe.id;
  }
  if (!recipe.groups.some((g) => g.id === CONFIG.hitVfxSelectedGroupId)) {
    CONFIG.hitVfxSelectedGroupId = recipe.groups[0]?.id ?? 'main';
  }
}

export function setupHitVfxEditorPanel(
  hooks: HitVfxEditorPanelHooks,
): HitVfxEditorPanelApi {
  let selectionKind: SelectionKind = 'recipe';
  let renamingId: string | null = null;
  let dragElementId: string | null = null;

  const app = document.createElement('div');
  app.id = 'hvfx-app';
  app.innerHTML = `
    <header id="hvfx-topbar" class="hvfx-pe">
      <a class="hvfx-back" href="/">← 回训练场</a>
      <h1 class="hvfx-title">打击特效编辑</h1>
      <div class="hvfx-top-sep"></div>
      <label class="hvfx-top-field">实战未格挡
        <select id="hvfx-active-hit"></select>
      </label>
      <label class="hvfx-top-field">实战格挡
        <select id="hvfx-active-block"></select>
      </label>
      <div class="hvfx-top-sep"></div>
      <button type="button" class="primary" id="hvfx-save-project">保存到项目配置</button>
      <button type="button" id="hvfx-save-draft">存浏览器草稿</button>
      <button type="button" id="hvfx-presets">预设库</button>
      <button type="button" id="hvfx-clear-local">清除本地草稿</button>
      <div id="hvfx-flash"></div>
    </header>
    <div class="hvfx-main">
      <aside id="hvfx-tree-pane" class="hvfx-pe">
        <div class="hvfx-pane-header">配方 / 分组 / 元素</div>
        <div class="hvfx-pane-tools" id="hvfx-tree-tools">
          <button type="button" id="hvfx-new-recipe">新建配方</button>
          <button type="button" id="hvfx-dup-recipe">复制</button>
          <button type="button" id="hvfx-paste-recipe">粘贴</button>
          <button type="button" class="danger" id="hvfx-del-recipe">删除</button>
          <button type="button" id="hvfx-new-group">新建分组</button>
          <select id="hvfx-new-el-type" title="新建元素类型">
            <option value="spark">火花</option>
            <option value="sparkDebris">小粒子</option>
            <option value="sweat">汗水</option>
            <option value="volumeSmoke">体素烟</option>
          </select>
          <button type="button" id="hvfx-new-el">新建元素</button>
          <button type="button" id="hvfx-dup-el">复制元素</button>
          <button type="button" id="hvfx-paste-el">粘贴元素</button>
          <button type="button" id="hvfx-save-preset">存为预设</button>
          <button type="button" class="danger" id="hvfx-del-node">删除选中</button>
        </div>
        <div class="hvfx-pane-body" id="hvfx-tree-body"></div>
      </aside>
      <main id="hvfx-viewport-pane">
        <div id="hvfx-canvas-slot"></div>
        <div class="hvfx-viewport-toolbar hvfx-pe" id="hvfx-viewport-toolbar"></div>
      </main>
      <aside id="hvfx-inspector-pane" class="hvfx-pe">
        <div class="hvfx-pane-header">检查器</div>
        <div class="hvfx-pane-body" id="hvfx-inspector-body"></div>
      </aside>
    </div>
  `;
  document.body.appendChild(app);

  const flashEl = app.querySelector('#hvfx-flash') as HTMLElement;
  let flashTimer = 0;
  const setFlash = (msg: string) => {
    flashEl.textContent = msg;
    if (flashTimer) window.clearTimeout(flashTimer);
    if (msg) {
      flashTimer = window.setTimeout(() => {
        if (flashEl.textContent === msg) flashEl.textContent = '';
      }, 3200);
    }
  };

  const notify = (key: string) => hooks.onConfigChanged(key);

  const bumpRecipes = (structural = false) => {
    notify('hitVfxRecipes');
    hooks.invalidate();
    if (structural) refresh();
  };

  const targetGroupId = (): string => {
    const recipe = currentRecipe();
    if (!recipe) return 'main';
    if (selectionKind === 'group') {
      return (
        recipe.groups.find((g) => g.id === CONFIG.hitVfxSelectedGroupId)?.id ??
        recipe.groups[0]?.id ??
        'main'
      );
    }
    if (selectionKind === 'element') {
      const el = recipe.elements.find(
        (e) => e.id === CONFIG.hitVfxSelectedElementId,
      );
      if (el) return el.groupId;
    }
    return (
      recipe.groups.find((g) => g.id === CONFIG.hitVfxSelectedGroupId)?.id ??
      recipe.groups[0]?.id ??
      'main'
    );
  };

  const selectRecipe = (id: string) => {
    CONFIG.hitVfxSelectedRecipeId = id;
    selectionKind = 'recipe';
    ensureSelectionDefaults();
    notify('hitVfxSelectedRecipeId');
    refresh();
  };

  const selectGroup = (recipeId: string, groupId: string) => {
    CONFIG.hitVfxSelectedRecipeId = recipeId;
    CONFIG.hitVfxSelectedGroupId = groupId;
    selectionKind = 'group';
    notify('hitVfxSelectedRecipeId');
    notify('hitVfxSelectedGroupId');
    refresh();
  };

  const selectElement = (
    recipeId: string,
    groupId: string,
    elementId: string,
  ) => {
    CONFIG.hitVfxSelectedRecipeId = recipeId;
    CONFIG.hitVfxSelectedGroupId = groupId;
    CONFIG.hitVfxSelectedElementId = elementId;
    selectionKind = 'element';
    notify('hitVfxSelectedRecipeId');
    notify('hitVfxSelectedGroupId');
    notify('hitVfxSelectedElementId');
    refresh();
  };

  /* —— Viewport toolbar —— */
  const toolbar = app.querySelector('#hvfx-viewport-toolbar') as HTMLElement;
  toolbar.innerHTML = `
    <label class="tb-item"><input type="checkbox" id="hvfx-enabled" /> 启用特效</label>
    <label class="tb-item"><input type="checkbox" id="hvfx-dummy" /> 显示假人</label>
    <label class="tb-item"><input type="checkbox" id="hvfx-paused" /> 暂停</label>
    <label class="tb-item"><input type="checkbox" id="hvfx-seed-lock" /> 锁随机种子</label>
    <label class="tb-item">种子 <input type="number" id="hvfx-seed" min="0" step="1" /></label>
    <label class="tb-item">时间倍率 <input type="number" id="hvfx-timescale" min="0.05" max="2" step="0.05" /></label>
    <label class="tb-item"><input type="checkbox" id="hvfx-follow-hs" /> 顿帧冻结特效</label>
    <label class="tb-item"><input type="checkbox" id="hvfx-debug" /> 击中点标记</label>
    <span class="tb-sep"></span>
    <label class="tb-item">预览路径
      <select id="hvfx-kind"><option value="onHit">实战未格挡</option><option value="onBlock">实战格挡</option></select>
    </label>
    <label class="tb-item">预览高度
      <select id="hvfx-height"><option value="h">头</option><option value="m">胸</option><option value="l">腿</option></select>
    </label>
    <label class="tb-item">预览力度
      <select id="hvfx-strength"><option value="L">轻</option><option value="M">中</option><option value="H">重</option></select>
    </label>
    <label class="tb-item">并发上限 <input type="number" id="hvfx-max" min="1" max="16" step="1" /></label>
    <label class="tb-item">点光池 <input type="number" id="hvfx-pool" min="1" max="8" step="1" /></label>
    <span class="tb-sep"></span>
    <label class="tb-item"><input type="checkbox" id="hvfx-loop" /> 循环重放</label>
    <button type="button" id="hvfx-replay">重放</button>
    <button type="button" id="hvfx-step">步进一帧</button>
    <button type="button" id="hvfx-rebuild">重建运行时</button>
  `;

  const fillActiveRecipeSelects = () => {
    const recipes = CONFIG.hitVfxRecipes;
    const fill = (sel: HTMLSelectElement, selectedId: string) => {
      const prev = sel.value;
      sel.innerHTML = '';
      for (const r of recipes) {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `${r.name} (${r.kind === 'onHit' ? '未格挡' : '格挡'})`;
        sel.appendChild(opt);
      }
      if (recipes.some((r) => r.id === selectedId)) sel.value = selectedId;
      else if (recipes.some((r) => r.id === prev)) sel.value = prev;
      else if (recipes[0]) sel.value = recipes[0].id;
    };
    fill(
      app.querySelector('#hvfx-active-hit') as HTMLSelectElement,
      CONFIG.hitVfxActiveRecipeOnHitId,
    );
    fill(
      app.querySelector('#hvfx-active-block') as HTMLSelectElement,
      CONFIG.hitVfxActiveRecipeOnBlockId,
    );
  };

  const syncToolbarFromConfig = () => {
    (app.querySelector('#hvfx-enabled') as HTMLInputElement).checked =
      CONFIG.hitVfxEnabled;
    (app.querySelector('#hvfx-dummy') as HTMLInputElement).checked =
      CONFIG.hitVfxPreviewDummyVisible;
    (app.querySelector('#hvfx-paused') as HTMLInputElement).checked =
      CONFIG.hitVfxPaused;
    (app.querySelector('#hvfx-seed-lock') as HTMLInputElement).checked =
      CONFIG.hitVfxSeedLocked;
    (app.querySelector('#hvfx-follow-hs') as HTMLInputElement).checked =
      CONFIG.hitVfxFollowHitstop;
    (app.querySelector('#hvfx-debug') as HTMLInputElement).checked =
      CONFIG.hitVfxDebug;
    (app.querySelector('#hvfx-loop') as HTMLInputElement).checked =
      CONFIG.hitVfxPreviewLoop;
    (app.querySelector('#hvfx-timescale') as HTMLInputElement).value = String(
      CONFIG.hitVfxTimeScale,
    );
    (app.querySelector('#hvfx-seed') as HTMLInputElement).value = String(
      CONFIG.hitVfxSeed,
    );
    (app.querySelector('#hvfx-max') as HTMLInputElement).value = String(
      CONFIG.hitVfxMaxConcurrent,
    );
    (app.querySelector('#hvfx-pool') as HTMLInputElement).value = String(
      CONFIG.hitVfxSparkLightPoolSize,
    );
    (app.querySelector('#hvfx-kind') as HTMLSelectElement).value =
      CONFIG.hitVfxPreviewKind;
    (app.querySelector('#hvfx-height') as HTMLSelectElement).value =
      CONFIG.hitVfxPreviewHeight;
    (app.querySelector('#hvfx-strength') as HTMLSelectElement).value =
      CONFIG.hitVfxPreviewStrength;
  };

  const syncToolbarToConfig = () => {
    CONFIG.hitVfxEnabled = (
      app.querySelector('#hvfx-enabled') as HTMLInputElement
    ).checked;
    CONFIG.hitVfxPreviewDummyVisible = (
      app.querySelector('#hvfx-dummy') as HTMLInputElement
    ).checked;
    CONFIG.hitVfxPaused = (
      app.querySelector('#hvfx-paused') as HTMLInputElement
    ).checked;
    CONFIG.hitVfxSeedLocked = (
      app.querySelector('#hvfx-seed-lock') as HTMLInputElement
    ).checked;
    CONFIG.hitVfxFollowHitstop = (
      app.querySelector('#hvfx-follow-hs') as HTMLInputElement
    ).checked;
    CONFIG.hitVfxDebug = (
      app.querySelector('#hvfx-debug') as HTMLInputElement
    ).checked;
    CONFIG.hitVfxPreviewLoop = (
      app.querySelector('#hvfx-loop') as HTMLInputElement
    ).checked;
    const ts = Number(
      (app.querySelector('#hvfx-timescale') as HTMLInputElement).value,
    );
    if (Number.isFinite(ts)) {
      CONFIG.hitVfxTimeScale = Math.min(2, Math.max(0.05, ts));
    }
    const seed = Number(
      (app.querySelector('#hvfx-seed') as HTMLInputElement).value,
    );
    if (Number.isFinite(seed)) CONFIG.hitVfxSeed = seed >>> 0;
    const max = Number(
      (app.querySelector('#hvfx-max') as HTMLInputElement).value,
    );
    if (Number.isFinite(max)) {
      CONFIG.hitVfxMaxConcurrent = Math.max(1, Math.round(max));
    }
    const pool = Number(
      (app.querySelector('#hvfx-pool') as HTMLInputElement).value,
    );
    if (Number.isFinite(pool)) {
      CONFIG.hitVfxSparkLightPoolSize = Math.max(1, Math.round(pool));
    }
    CONFIG.hitVfxPreviewKind = (
      app.querySelector('#hvfx-kind') as HTMLSelectElement
    ).value as 'onHit' | 'onBlock';
    CONFIG.hitVfxPreviewHeight = (
      app.querySelector('#hvfx-height') as HTMLSelectElement
    ).value as 'h' | 'm' | 'l';
    CONFIG.hitVfxPreviewStrength = (
      app.querySelector('#hvfx-strength') as HTMLSelectElement
    ).value as 'L' | 'M' | 'H';
  };

  /* —— Tree —— */
  const treeBody = app.querySelector('#hvfx-tree-body') as HTMLElement;

  const beginRename = (kind: 'recipe' | 'group' | 'element', id: string) => {
    renamingId = `${kind}:${id}`;
    renderTree();
    const input = treeBody.querySelector(
      'input.rename-input',
    ) as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    }
  };

  const commitRename = (
    kind: 'recipe' | 'group' | 'element',
    id: string,
    name: string,
  ) => {
    if (renamingId === null) return;
    renamingId = null;
    const recipe = currentRecipe();
    if (kind === 'recipe') {
      const r = CONFIG.hitVfxRecipes.find((x) => x.id === id);
      if (r) r.name = name.trim() || r.name;
    } else if (recipe && kind === 'group') {
      renameGroup(recipe, id, name);
    } else if (recipe && kind === 'element') {
      renameElement(recipe, id, name);
    }
    bumpRecipes(true);
  };

  const renderTree = () => {
    ensureSelectionDefaults();
    const recipe = currentRecipe();
    const parts: string[] = [];

    parts.push('<div class="hvfx-section-label">全部配方</div>');
    parts.push('<ul class="hvfx-recipe-list">');
    for (const r of CONFIG.hitVfxRecipes) {
      const sel =
        r.id === CONFIG.hitVfxSelectedRecipeId ? ' selected' : '';
      const renaming = renamingId === `recipe:${r.id}`;
      if (renaming) {
        parts.push(
          `<li class="${sel.trim()}" data-recipe-id="${r.id}"><input class="rename-input" data-rename="recipe" data-id="${r.id}" value="${escapeAttr(r.name)}" /></li>`,
        );
      } else {
        parts.push(
          `<li class="${sel.trim()}" data-recipe-id="${r.id}" data-select="recipe">
            <span class="node-name">${escapeHtml(r.name)}</span>
            <span class="kind-tag">${r.kind === 'onHit' ? '未格挡' : '格挡'}</span>
            <button type="button" class="mini" data-action="rename-recipe" data-id="${r.id}">重命名</button>
          </li>`,
        );
      }
    }
    parts.push('</ul>');

    if (!recipe) {
      parts.push('<p class="hvfx-hint">无配方</p>');
      treeBody.innerHTML = parts.join('');
      bindTreeEvents();
      return;
    }

    parts.push(
      `<div class="hvfx-section-label">结构 · ${escapeHtml(recipe.name)}</div>`,
    );
    parts.push('<ul class="hvfx-tree">');

    const recipeSelected = selectionKind === 'recipe';
    const recipeRenaming = renamingId === `recipe:${recipe.id}`;
    parts.push(`<li class="hvfx-tree-node">
      <div class="hvfx-tree-row${recipeSelected ? ' selected' : ''}" data-node="recipe" data-recipe-id="${recipe.id}">
        <span class="node-icon">◆</span>
        ${
          recipeRenaming
            ? `<input class="rename-input" data-rename="recipe" data-id="${recipe.id}" value="${escapeAttr(recipe.name)}" />`
            : `<span class="node-name" data-select="recipe-root">${escapeHtml(recipe.name)}</span>
               <button type="button" class="mini" data-action="rename-recipe" data-id="${recipe.id}">重命名</button>`
        }
      </div>
    </li>`);

    for (const g of recipe.groups) {
      const gSelected =
        selectionKind === 'group' && g.id === CONFIG.hitVfxSelectedGroupId;
      const gRenaming = renamingId === `group:${g.id}`;
      const els = treeVisibleElements(recipe).filter((e) => e.groupId === g.id);
      parts.push(`<li class="hvfx-tree-node">
        <div class="hvfx-tree-row${gSelected ? ' selected' : ''}" data-node="group" data-group-id="${g.id}" data-recipe-id="${recipe.id}">
          <input type="checkbox" data-group-enabled="${g.id}" ${g.enabled ? 'checked' : ''} title="启用整组" />
          <span class="node-icon">▾</span>
          ${
            gRenaming
              ? `<input class="rename-input" data-rename="group" data-id="${g.id}" value="${escapeAttr(g.name)}" />`
              : `<span class="node-name" data-select="group" data-group-id="${g.id}">${escapeHtml(g.name)}</span>
                 <button type="button" class="mini" data-action="rename-group" data-id="${g.id}">重命名</button>`
          }
        </div>
        <ul class="hvfx-tree hvfx-tree-children${g.enabled ? '' : ' group-disabled'}">`);
      for (const el of els) {
        const eSelected =
          selectionKind === 'element' &&
          el.id === CONFIG.hitVfxSelectedElementId;
        const eRenaming = renamingId === `element:${el.id}`;
        const typeLabel =
          ELEMENT_TYPE_LABEL[
            el.type as Exclude<HitVfxElementType, 'sparkLight'>
          ] ?? el.type;
        parts.push(`<li class="hvfx-tree-node">
          <div class="hvfx-tree-row${eSelected ? ' selected' : ''}" data-node="element" data-element-id="${el.id}" data-group-id="${g.id}" data-recipe-id="${recipe.id}" draggable="true">
            <span class="node-icon">${el.enabled ? '●' : '○'}</span>
            ${
              eRenaming
                ? `<input class="rename-input" data-rename="element" data-id="${el.id}" value="${escapeAttr(el.name)}" />`
                : `<span class="node-name" data-select="element" data-element-id="${el.id}" data-group-id="${g.id}">${escapeHtml(el.name)}</span>
                   <span class="node-type">${typeLabel}</span>
                   <button type="button" class="mini" data-action="rename-element" data-id="${el.id}">重命名</button>`
            }
          </div>
        </li>`);
      }
      parts.push('</ul></li>');
    }
    parts.push('</ul>');

    treeBody.innerHTML = parts.join('');
    bindTreeEvents();
  };

  const bindTreeEvents = () => {
    treeBody.querySelectorAll<HTMLElement>('[data-recipe-id]').forEach((li) => {
      if (!li.matches('.hvfx-recipe-list li')) return;
      li.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button, input')) return;
        const id = li.dataset.recipeId!;
        selectRecipe(id);
      });
      li.addEventListener('dblclick', (e) => {
        if ((e.target as HTMLElement).closest('button, input')) return;
        beginRename('recipe', li.dataset.recipeId!);
      });
    });

    treeBody
      .querySelectorAll<HTMLElement>('[data-select="recipe-root"]')
      .forEach((el) => {
        el.addEventListener('click', () => {
          const recipe = currentRecipe();
          if (recipe) selectRecipe(recipe.id);
        });
        el.addEventListener('dblclick', () => {
          const recipe = currentRecipe();
          if (recipe) beginRename('recipe', recipe.id);
        });
      });

    treeBody
      .querySelectorAll<HTMLElement>('[data-select="group"]')
      .forEach((el) => {
        el.addEventListener('click', () => {
          const recipe = currentRecipe();
          if (!recipe) return;
          selectGroup(recipe.id, el.dataset.groupId!);
        });
        el.addEventListener('dblclick', () => {
          beginRename('group', el.dataset.groupId!);
        });
      });

    treeBody
      .querySelectorAll<HTMLElement>('[data-select="element"]')
      .forEach((el) => {
        el.addEventListener('click', () => {
          const recipe = currentRecipe();
          if (!recipe) return;
          selectElement(recipe.id, el.dataset.groupId!, el.dataset.elementId!);
        });
        el.addEventListener('dblclick', () => {
          beginRename('element', el.dataset.elementId!);
        });
      });

    treeBody
      .querySelectorAll<HTMLButtonElement>('[data-action="rename-recipe"]')
      .forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          beginRename('recipe', btn.dataset.id!);
        });
      });
    treeBody
      .querySelectorAll<HTMLButtonElement>('[data-action="rename-group"]')
      .forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          beginRename('group', btn.dataset.id!);
        });
      });
    treeBody
      .querySelectorAll<HTMLButtonElement>('[data-action="rename-element"]')
      .forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          beginRename('element', btn.dataset.id!);
        });
      });

    treeBody
      .querySelectorAll<HTMLInputElement>('input.rename-input')
      .forEach((input) => {
        const finish = () => {
          const kind = input.dataset.rename as 'recipe' | 'group' | 'element';
          commitRename(kind, input.dataset.id!, input.value);
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish();
          } else if (e.key === 'Escape') {
            renamingId = null;
            renderTree();
            renderInspector();
          }
        });
        input.addEventListener('blur', finish);
      });

    treeBody
      .querySelectorAll<HTMLInputElement>('[data-group-enabled]')
      .forEach((cb) => {
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('change', () => {
          const recipe = currentRecipe();
          if (!recipe) return;
          setGroupEnabled(recipe, cb.dataset.groupEnabled!, cb.checked);
          bumpRecipes(true);
        });
      });

    treeBody
      .querySelectorAll<HTMLElement>('.hvfx-tree-row[data-node="element"]')
      .forEach((row) => {
        row.addEventListener('dragstart', (e) => {
          dragElementId = row.dataset.elementId ?? null;
          e.dataTransfer?.setData('text/plain', dragElementId ?? '');
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
          dragElementId = null;
          treeBody
            .querySelectorAll('.drop-target')
            .forEach((n) => n.classList.remove('drop-target'));
        });
      });

    treeBody
      .querySelectorAll<HTMLElement>('.hvfx-tree-row[data-node="group"]')
      .forEach((row) => {
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          row.classList.add('drop-target');
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        });
        row.addEventListener('dragleave', () => {
          row.classList.remove('drop-target');
        });
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('drop-target');
          const groupEl = (e.target as HTMLElement).closest(
            '[data-node="group"]',
          ) as HTMLElement | null;
          if (!groupEl) return;
          const recipe = currentRecipe();
          const elementId =
            dragElementId || e.dataTransfer?.getData('text/plain') || '';
          const groupId = groupEl.dataset.groupId;
          if (!recipe || !elementId || !groupId) return;
          if (moveElementToGroup(recipe, elementId, groupId)) {
            CONFIG.hitVfxSelectedElementId = elementId;
            CONFIG.hitVfxSelectedGroupId = groupId;
            selectionKind = 'element';
            bumpRecipes(true);
            setFlash('已移动元素到分组');
          }
        });
      });
  };

  /* —— Inspector —— */
  const inspBody = app.querySelector('#hvfx-inspector-body') as HTMLElement;

  const renderInspector = () => {
    ensureSelectionDefaults();
    const recipe = currentRecipe();
    if (!recipe) {
      inspBody.innerHTML = '<p class="hvfx-insp-empty">无配方可选</p>';
      return;
    }

    if (selectionKind === 'recipe') {
      renderRecipeInspector(recipe);
      return;
    }
    if (selectionKind === 'group') {
      const g = recipe.groups.find(
        (x) => x.id === CONFIG.hitVfxSelectedGroupId,
      );
      if (!g) {
        inspBody.innerHTML = '<p class="hvfx-insp-empty">未选中分组</p>';
        return;
      }
      renderGroupInspector(recipe, g);
      return;
    }
    const el = recipe.elements.find(
      (e) => e.id === CONFIG.hitVfxSelectedElementId,
    );
    if (!el || el.type === 'sparkLight') {
      inspBody.innerHTML = '<p class="hvfx-insp-empty">未选中元素</p>';
      return;
    }
    renderElementInspector(recipe, el);
  };

  const renderRecipeInspector = (recipe: HitVfxRecipe) => {
    const bands: HitVfxStrength[] = ['L', 'M', 'H'];
    const bandLabel = { L: '轻', M: '中', H: '重' } as const;
    const mulKeys = Object.keys(
      STRENGTH_MUL_LABELS,
    ) as (keyof typeof STRENGTH_MUL_LABELS)[];

    let strengthHtml = '';
    for (const band of bands) {
      strengthHtml += `<div class="hvfx-insp-section"><h3>力度缩放 · ${bandLabel[band]} (${band})</h3>`;
      for (const key of mulKeys) {
        strengthHtml += `<div class="hvfx-row"><label>${STRENGTH_MUL_LABELS[key]}</label>
          <input type="number" data-str="${band}.${key}" step="0.01" min="0" value="${recipe.strengthScale[band][key]}" /></div>`;
      }
      strengthHtml += '</div>';
    }

    const ho = CONFIG.hitVfxHeightOffsets;
    inspBody.innerHTML = `
      <div class="hvfx-insp-section">
        <h3>配方</h3>
        <div class="hvfx-row"><label>名称</label><input type="text" id="insp-recipe-name" value="${escapeAttr(recipe.name)}" /></div>
        <div class="hvfx-row"><label>种类</label>
          <select id="insp-recipe-kind">
            <option value="onHit" ${recipe.kind === 'onHit' ? 'selected' : ''}>未格挡 onHit</option>
            <option value="onBlock" ${recipe.kind === 'onBlock' ? 'selected' : ''}>格挡 onBlock</option>
          </select>
        </div>
      </div>
      ${strengthHtml}
      <div class="hvfx-insp-section">
        <h3>高度挂点偏移（全局）</h3>
        <div class="hvfx-row pair">
          <div><label>头 Y</label><input type="number" data-ho="h.y" step="0.01" value="${ho.h.y}" /></div>
          <div><label>头 Z</label><input type="number" data-ho="h.z" step="0.01" value="${ho.h.z}" /></div>
        </div>
        <div class="hvfx-row pair">
          <div><label>胸 Y</label><input type="number" data-ho="m.y" step="0.01" value="${ho.m.y}" /></div>
          <div><label>胸 Z</label><input type="number" data-ho="m.z" step="0.01" value="${ho.m.z}" /></div>
        </div>
        <div class="hvfx-row pair">
          <div><label>腿 Y</label><input type="number" data-ho="l.y" step="0.01" value="${ho.l.y}" /></div>
          <div><label>腿 Z</label><input type="number" data-ho="l.z" step="0.01" value="${ho.l.z}" /></div>
        </div>
      </div>
    `;

    (inspBody.querySelector('#insp-recipe-name') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        recipe.name = (e.target as HTMLInputElement).value.trim() || recipe.name;
        bumpRecipes(true);
      },
    );
    (inspBody.querySelector('#insp-recipe-kind') as HTMLSelectElement).addEventListener(
      'change',
      (e) => {
        recipe.kind = (e.target as HTMLSelectElement).value as HitVfxRecipeKind;
        bumpRecipes(true);
      },
    );
    inspBody.querySelectorAll<HTMLInputElement>('[data-str]').forEach((inp) => {
      const apply = () => {
        const [band, key] = inp.dataset.str!.split('.') as [
          HitVfxStrength,
          keyof typeof recipe.strengthScale.L,
        ];
        recipe.strengthScale[band][key] = Math.max(0, Number(inp.value) || 0);
        notify('hitVfxRecipes');
        hooks.invalidate();
      };
      inp.addEventListener('input', apply);
      inp.addEventListener('change', apply);
    });
    inspBody.querySelectorAll<HTMLInputElement>('[data-ho]').forEach((inp) => {
      const apply = () => {
        const [band, axis] = inp.dataset.ho!.split('.') as [
          'h' | 'm' | 'l',
          'y' | 'z',
        ];
        const n = Number(inp.value);
        if (!Number.isFinite(n)) return;
        CONFIG.hitVfxHeightOffsets[band][axis] = n;
        notify('hitVfxHeightOffsets');
      };
      inp.addEventListener('input', apply);
      inp.addEventListener('change', apply);
    });
    attachDragScrubAll(inspBody);
  };

  const renderGroupInspector = (recipe: HitVfxRecipe, group: HitVfxGroup) => {
    inspBody.innerHTML = `
      <div class="hvfx-insp-section">
        <h3>分组</h3>
        <div class="hvfx-row"><label>名称</label><input type="text" id="insp-group-name" value="${escapeAttr(group.name)}" /></div>
        <div class="hvfx-row inline"><label>启用整组</label><input type="checkbox" id="insp-group-en" ${group.enabled ? 'checked' : ''} /></div>
        <p class="hvfx-hint">关闭后该组内元素运行时全部跳过。</p>
      </div>
    `;
    (inspBody.querySelector('#insp-group-name') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        renameGroup(recipe, group.id, (e.target as HTMLInputElement).value);
        bumpRecipes(true);
      },
    );
    (inspBody.querySelector('#insp-group-en') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        setGroupEnabled(
          recipe,
          group.id,
          (e.target as HTMLInputElement).checked,
        );
        bumpRecipes(true);
      },
    );
  };

  const renderElementInspector = (
    recipe: HitVfxRecipe,
    element: HitVfxElement,
  ) => {
    const groupOpts = recipe.groups
      .map(
        (g) =>
          `<option value="${g.id}" ${g.id === element.groupId ? 'selected' : ''}>${escapeHtml(g.name)}</option>`,
      )
      .join('');

    let typeParams = '';
    if (element.type === 'spark') {
      typeParams = sparkParamsHtml(element.params);
    } else if (element.type === 'sparkDebris') {
      typeParams = sparkDebrisParamsHtml(element.params);
    } else if (element.type === 'smokeRing') {
      typeParams = smokeRingParamsHtml(element.params);
    } else if (element.type === 'dust') {
      typeParams = dustParamsHtml(element.params);
    } else if (element.type === 'sweat') {
      typeParams = sweatParamsHtml(element.params);
    } else if (element.type === 'volumeSmoke') {
      typeParams = volumeSmokeParamsHtml(element.params);
    }

    const typeLabel =
      ELEMENT_TYPE_LABEL[
        element.type as Exclude<HitVfxElementType, 'sparkLight'>
      ] ?? element.type;

    inspBody.innerHTML = `
      <div class="hvfx-insp-section">
        <h3>元素 · ${typeLabel}</h3>
        <div class="hvfx-row"><label>名称</label><input type="text" id="insp-el-name" value="${escapeAttr(element.name)}" /></div>
        <div class="hvfx-row inline"><label>启用</label><input type="checkbox" id="insp-el-en" ${element.enabled ? 'checked' : ''} /></div>
        <div class="hvfx-row"><label>所属分组</label><select id="insp-el-group">${groupOpts}</select></div>
        <div class="hvfx-row"><label>开始延迟(秒)</label><input type="number" id="insp-el-delay" step="0.01" min="0" value="${element.startDelaySec}" /></div>
        <div class="hvfx-row inline"><label>接受火花光照</label><input type="checkbox" id="insp-el-recv" ${element.receiveSparkLight ? 'checked' : ''} /></div>
      </div>
      ${typeParams}
    `;

    const paramBump = () => {
      notify('hitVfxRecipes');
      hooks.invalidate();
    };

    (inspBody.querySelector('#insp-el-name') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        renameElement(recipe, element.id, (e.target as HTMLInputElement).value);
        bumpRecipes(true);
      },
    );
    (inspBody.querySelector('#insp-el-en') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        element.enabled = (e.target as HTMLInputElement).checked;
        bumpRecipes(true);
      },
    );
    (inspBody.querySelector('#insp-el-group') as HTMLSelectElement).addEventListener(
      'change',
      (e) => {
        const gid = (e.target as HTMLSelectElement).value;
        moveElementToGroup(recipe, element.id, gid);
        CONFIG.hitVfxSelectedGroupId = gid;
        bumpRecipes(true);
      },
    );
    const delayInp = inspBody.querySelector(
      '#insp-el-delay',
    ) as HTMLInputElement;
    const applyDelay = () => {
      element.startDelaySec = Math.max(0, Number(delayInp.value) || 0);
      paramBump();
    };
    delayInp.addEventListener('input', applyDelay);
    delayInp.addEventListener('change', applyDelay);
    (inspBody.querySelector('#insp-el-recv') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        element.receiveSparkLight = (e.target as HTMLInputElement).checked;
        paramBump();
      },
    );

    if (element.type === 'volumeSmoke') {
      const volumeBump = () => {
        // Persist into CONFIG recipes, but do NOT invalidate/clear the pool —
        // that made the viewport look "frozen" until a manual replay.
        notify('hitVfxRecipes');
        hooks.onVolumeSmokeParamsChanged?.(element.params, element.id);
        scheduleVolumeSmokeReplay();
      };
      bindParamFields(inspBody, element, volumeBump);
      bindVolumeSmokeExtras(inspBody, element, volumeBump);
      // Show seed gizmo immediately when inspector opens.
      hooks.onVolumeSmokeParamsChanged?.(element.params, element.id);
    } else {
      bindParamFields(inspBody, element, paramBump);
    }
    attachDragScrubAll(inspBody);
  };

  let volumeReplayTimer = 0;
  const scheduleVolumeSmokeReplay = () => {
    if (volumeReplayTimer) window.clearTimeout(volumeReplayTimer);
    volumeReplayTimer = window.setTimeout(() => {
      volumeReplayTimer = 0;
      // Clear previous burst, then always re-fire (do not toggle loop).
      hooks.invalidate();
      hooks.replayNow();
    }, 280);
  };

  const bindVolumeSmokeExtras = (
    root: HTMLElement,
    element: Extract<HitVfxElement, { type: 'volumeSmoke' }>,
    bump: () => void,
  ) => {
    const syncSeedShapeRows = () => {
      const shape = element.params.seedShape;
      root.querySelectorAll<HTMLElement>('[data-seed-shapes]').forEach((row) => {
        const allowed = (row.dataset.seedShapes ?? '').split(',');
        row.style.display = allowed.includes(shape) ? '' : 'none';
      });
    };
    syncSeedShapeRows();
    root
      .querySelectorAll<HTMLSelectElement>('[data-p="seedShape"]')
      .forEach((sel) => {
        sel.addEventListener('change', () => {
          // Ensure string enum is written even if binder order differs.
          element.params.seedShape = sel.value as VolumeSmokeParams['seedShape'];
          syncSeedShapeRows();
        });
      });

    const syncEndConditionRows = () => {
      const mode = element.params.endCondition;
      root.querySelectorAll<HTMLElement>('[data-end-mode]').forEach((row) => {
        row.style.display = row.dataset.endMode === mode ? '' : 'none';
      });
      root.querySelectorAll<HTMLElement>('[data-end-hint]').forEach((row) => {
        row.style.display = row.dataset.endHint === mode ? '' : 'none';
      });
      const lifeLabel = root.querySelector<HTMLElement>('[data-smoke-life-label]');
      if (lifeLabel) {
        lifeLabel.textContent =
          mode === 'density' ? '染料寿命 (耗散)' : '烟雾寿命 (秒)';
      }
    };
    syncEndConditionRows();
    root
      .querySelectorAll<HTMLSelectElement>('[data-p="endCondition"]')
      .forEach((sel) => {
        sel.addEventListener('change', () => {
          element.params.endCondition =
            sel.value as VolumeSmokeParams['endCondition'];
          syncEndConditionRows();
        });
      });

    const syncLightingDisabled = () => {
      const project = element.params.lightingMode === 'project';
      root.querySelectorAll<HTMLElement>('[data-original-light]').forEach((row) => {
        row.classList.toggle('hvfx-disabled', project);
        row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select').forEach(
          (inp) => {
            inp.disabled = project;
          },
        );
      });
    };
    syncLightingDisabled();
    root
      .querySelectorAll<HTMLSelectElement>('[data-p="lightingMode"]')
      .forEach((sel) => {
        sel.addEventListener('change', () => {
          // Apply path first via normal binder; then refresh disabled state.
          queueMicrotask(syncLightingDisabled);
        });
      });

    root.querySelectorAll<HTMLElement>('[data-section-key]').forEach((body) => {
      const key = body.dataset.sectionKey as keyof VolumeSmokeParams['expandedSections'];
      const open = element.params.expandedSections[key];
      body.style.display = open ? '' : 'none';
    });
    root.querySelectorAll<HTMLInputElement>('[data-section-toggle]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const key = inp.dataset.sectionToggle as keyof VolumeSmokeParams['expandedSections'];
        element.params.expandedSections[key] = inp.checked;
        const body = root.querySelector<HTMLElement>(
          `[data-section-key="${key}"]`,
        );
        if (body) body.style.display = inp.checked ? '' : 'none';
        bump();
      });
    });

    const reroll = root.querySelector('#hvfx-vs-reroll-seed');
    reroll?.addEventListener('click', () => {
      element.params.spawnSeed = randomUint32();
      const seedInp = root.querySelector<HTMLInputElement>('[data-p="spawnSeed"]');
      if (seedInp) seedInp.value = String(element.params.spawnSeed);
      bump();
    });
  };

  const bindParamFields = (
    root: HTMLElement,
    element: HitVfxElement,
    bump: () => void,
  ) => {
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-p]').forEach(
      (inp) => {
        const apply = () => {
          const path = inp.dataset.p!;
          setParamPath(element.params as Record<string, unknown>, path, inp);
          bump();
        };
        inp.addEventListener('input', apply);
        inp.addEventListener('change', apply);
      },
    );
  };

  /* —— Preset modal —— */
  let modalEl: HTMLElement | null = null;

  const closePresetModal = () => {
    modalEl?.remove();
    modalEl = null;
  };

  const openPresetModal = () => {
    closePresetModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'hvfx-modal-backdrop';
    backdrop.innerHTML = `
      <div class="hvfx-modal" role="dialog" aria-label="预设库">
        <div class="hvfx-modal-header">
          <span>元素预设库</span>
          <button type="button" id="hvfx-modal-close">关闭</button>
        </div>
        <div class="hvfx-modal-body" id="hvfx-preset-list"></div>
        <div class="hvfx-modal-footer">
          <button type="button" id="hvfx-preset-save-cur">从当前元素存为预设</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    modalEl = backdrop;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closePresetModal();
    });
    backdrop
      .querySelector('#hvfx-modal-close')!
      .addEventListener('click', closePresetModal);

    const renderList = () => {
      const list = backdrop.querySelector('#hvfx-preset-list') as HTMLElement;
      const presets = CONFIG.hitVfxElementPresets ?? [];
      if (!presets.length) {
        list.innerHTML = '<p class="hvfx-hint">暂无预设。选中元素后可「存为预设」。</p>';
        return;
      }
      list.innerHTML = presets
        .map((p) => {
          const tl =
            ELEMENT_TYPE_LABEL[
              p.template.type as Exclude<HitVfxElementType, 'sparkLight'>
            ] ?? p.template.type;
          return `<div class="hvfx-preset-item" data-preset-id="${p.id}">
            <span class="name">${escapeHtml(p.name)}</span>
            <span class="type">${tl}</span>
            <button type="button" data-preset-insert="${p.id}">插入当前组</button>
            <button type="button" class="danger" data-preset-del="${p.id}">删除</button>
          </div>`;
        })
        .join('');

      list.querySelectorAll<HTMLButtonElement>('[data-preset-insert]').forEach(
        (btn) => {
          btn.addEventListener('click', () => {
            const recipe = currentRecipe();
            const preset = CONFIG.hitVfxElementPresets.find(
              (p) => p.id === btn.dataset.presetInsert,
            );
            if (!recipe || !preset) return;
            const el = elementFromPreset(recipe, preset, targetGroupId());
            if (!el) {
              setFlash('插入失败');
              return;
            }
            CONFIG.hitVfxSelectedElementId = el.id;
            CONFIG.hitVfxSelectedGroupId = el.groupId;
            selectionKind = 'element';
            notify('hitVfxElementPresets');
            bumpRecipes(true);
            setFlash(`已插入预设「${preset.name}」`);
            closePresetModal();
          });
        },
      );
      list.querySelectorAll<HTMLButtonElement>('[data-preset-del]').forEach(
        (btn) => {
          btn.addEventListener('click', () => {
            const preset = CONFIG.hitVfxElementPresets.find(
              (p) => p.id === btn.dataset.presetDel,
            );
            if (!preset) return;
            if (
              !window.confirm(
                `确定删除预设「${preset.name}」？不可恢复。`,
              )
            ) {
              return;
            }
            CONFIG.hitVfxElementPresets = CONFIG.hitVfxElementPresets.filter(
              (p) => p.id !== preset.id,
            );
            notify('hitVfxElementPresets');
            renderList();
            setFlash('预设已删除');
          });
        },
      );
    };

    renderList();

    backdrop
      .querySelector('#hvfx-preset-save-cur')!
      .addEventListener('click', () => {
        saveCurrentElementAsPreset();
        renderList();
      });
  };

  const saveCurrentElementAsPreset = () => {
    const recipe = currentRecipe();
    const el = recipe?.elements.find(
      (e) => e.id === CONFIG.hitVfxSelectedElementId,
    );
    if (!recipe || !el || el.type === 'sparkLight') {
      setFlash('请先选中可存为预设的元素');
      return;
    }
    const name = window.prompt('预设名称', el.name);
    if (name == null) return;
    const preset = saveElementAsPreset(
      el,
      name,
      CONFIG.hitVfxElementPresets as HitVfxElementPreset[],
    );
    if (!preset) {
      setFlash('存预设失败');
      return;
    }
    notify('hitVfxElementPresets');
    setFlash(`已存预设「${preset.name}」`);
  };

  /* —— Actions —— */
  const refresh = () => {
    fillActiveRecipeSelects();
    syncToolbarFromConfig();
    renderTree();
    renderInspector();
  };

  const bindCheck = (id: string, key: keyof typeof CONFIG) => {
    const el = app.querySelector(id) as HTMLInputElement;
    el.addEventListener('change', () => {
      (CONFIG as unknown as Record<string, unknown>)[key as string] = el.checked;
      notify(key as string);
    });
  };
  bindCheck('#hvfx-enabled', 'hitVfxEnabled');
  bindCheck('#hvfx-dummy', 'hitVfxPreviewDummyVisible');
  bindCheck('#hvfx-paused', 'hitVfxPaused');
  bindCheck('#hvfx-seed-lock', 'hitVfxSeedLocked');
  bindCheck('#hvfx-follow-hs', 'hitVfxFollowHitstop');
  bindCheck('#hvfx-debug', 'hitVfxDebug');
  bindCheck('#hvfx-loop', 'hitVfxPreviewLoop');

  const bindNum = (id: string, key: string, apply: (n: number) => void) => {
    const el = app.querySelector(id) as HTMLInputElement;
    const commit = () => {
      const n = Number(el.value);
      if (!Number.isFinite(n)) return;
      apply(n);
      notify(key);
    };
    el.addEventListener('change', commit);
    el.addEventListener('input', commit);
  };
  bindNum('#hvfx-timescale', 'hitVfxTimeScale', (n) => {
    CONFIG.hitVfxTimeScale = Math.min(2, Math.max(0.05, n));
  });
  bindNum('#hvfx-seed', 'hitVfxSeed', (n) => {
    CONFIG.hitVfxSeed = n >>> 0;
  });
  bindNum('#hvfx-max', 'hitVfxMaxConcurrent', (n) => {
    CONFIG.hitVfxMaxConcurrent = Math.max(1, Math.round(n));
  });
  bindNum('#hvfx-pool', 'hitVfxSparkLightPoolSize', (n) => {
    CONFIG.hitVfxSparkLightPoolSize = Math.max(1, Math.round(n));
    hooks.invalidate();
  });
  attachDragScrubAll(toolbar);

  (app.querySelector('#hvfx-kind') as HTMLSelectElement).addEventListener(
    'change',
    (e) => {
      CONFIG.hitVfxPreviewKind = (e.target as HTMLSelectElement).value as
        | 'onHit'
        | 'onBlock';
      notify('hitVfxPreviewKind');
    },
  );
  (app.querySelector('#hvfx-height') as HTMLSelectElement).addEventListener(
    'change',
    (e) => {
      CONFIG.hitVfxPreviewHeight = (e.target as HTMLSelectElement).value as
        | 'h'
        | 'm'
        | 'l';
      notify('hitVfxPreviewHeight');
    },
  );
  (app.querySelector('#hvfx-strength') as HTMLSelectElement).addEventListener(
    'change',
    (e) => {
      CONFIG.hitVfxPreviewStrength = (e.target as HTMLSelectElement).value as
        | 'L'
        | 'M'
        | 'H';
      notify('hitVfxPreviewStrength');
    },
  );

  (app.querySelector('#hvfx-active-hit') as HTMLSelectElement).addEventListener(
    'change',
    (e) => {
      CONFIG.hitVfxActiveRecipeOnHitId = (e.target as HTMLSelectElement).value;
      notify('hitVfxActiveRecipeOnHitId');
    },
  );
  (
    app.querySelector('#hvfx-active-block') as HTMLSelectElement
  ).addEventListener('change', (e) => {
    CONFIG.hitVfxActiveRecipeOnBlockId = (e.target as HTMLSelectElement).value;
    notify('hitVfxActiveRecipeOnBlockId');
  });

  (app.querySelector('#hvfx-replay') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      setFlash(hooks.replay());
    },
  );
  (app.querySelector('#hvfx-step') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      hooks.stepFrame();
      setFlash('步进 1 帧');
    },
  );
  (app.querySelector('#hvfx-rebuild') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      hooks.invalidate();
      notify('hitVfxRecipes');
      setFlash('已重建运行时');
    },
  );

  (app.querySelector('#hvfx-save-project') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      exportShippingJson();
      setFlash(
        '已下载 shipping.json，请覆盖放入 app/public/presets/shipping.json 后提交',
      );
    },
  );
  (app.querySelector('#hvfx-save-draft') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      syncToolbarToConfig();
      saveHitVfxEditorDraft();
      hooks.invalidate();
      setFlash('已存浏览器草稿，刷新后会按此恢复');
    },
  );
  (app.querySelector('#hvfx-presets') as HTMLButtonElement).addEventListener(
    'click',
    () => openPresetModal(),
  );
  (app.querySelector('#hvfx-clear-local') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      if (
        !window.confirm(
          '清除特效编辑草稿（配方预览栏）？不会动主场景灯光/本地默认配置，也不会删 shipping。',
        )
      ) {
        return;
      }
      clearHitVfxEditorDraft();
      setFlash('特效草稿已清除（主场景灯光配置未改动）');
    },
  );

  (app.querySelector('#hvfx-new-recipe') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      const kind: HitVfxRecipeKind =
        CONFIG.hitVfxPreviewKind === 'onBlock' ? 'onBlock' : 'onHit';
      const r = createEmptyRecipe(kind);
      CONFIG.hitVfxRecipes.push(r);
      selectRecipe(r.id);
      bumpRecipes(true);
      setFlash('已新建配方');
    },
  );

  (app.querySelector('#hvfx-dup-recipe') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      const recipe = currentRecipe();
      if (!recipe) return;
      copyRecipe(recipe);
      setFlash('配方已复制到剪贴板');
    },
  );

  (app.querySelector('#hvfx-paste-recipe') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      void (async () => {
        const payload = await readClipboard();
        if (!payload || payload.kind !== 'recipe') {
          setFlash('剪贴板中无配方');
          return;
        }
        const r = materializePastedRecipe(payload);
        if (!r) {
          setFlash('粘贴失败');
          return;
        }
        CONFIG.hitVfxRecipes.push(r);
        selectRecipe(r.id);
        bumpRecipes(true);
        setFlash('已粘贴配方');
      })();
    },
  );

  (app.querySelector('#hvfx-del-recipe') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      const recipe = currentRecipe();
      if (!recipe) return;
      if (
        !window.confirm(`确定删除配方「${recipe.name}」？不可恢复。`)
      ) {
        return;
      }
      const result = deleteRecipe(CONFIG.hitVfxRecipes, recipe.id);
      if (!result.ok) {
        setFlash(result.error);
        return;
      }
      CONFIG.hitVfxRecipes = result.list;
      const next = CONFIG.hitVfxRecipes[0];
      if (next) {
        CONFIG.hitVfxSelectedRecipeId = next.id;
        selectionKind = 'recipe';
      }
      bumpRecipes(true);
      setFlash('配方已删除');
    },
  );

  (app.querySelector('#hvfx-new-group') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      const recipe = currentRecipe();
      if (!recipe) return;
      const g = createGroup(recipe);
      selectGroup(recipe.id, g.id);
      bumpRecipes(true);
      setFlash('已新建分组');
    },
  );

  (app.querySelector('#hvfx-new-el') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      const recipe = currentRecipe();
      if (!recipe) return;
      const typeSel = app.querySelector(
        '#hvfx-new-el-type',
      ) as HTMLSelectElement;
      const type = typeSel.value as (typeof CREATABLE_ELEMENT_TYPES)[number];
      if (!CREATABLE_ELEMENT_TYPES.includes(type)) return;
      const el = createElement(recipe, type, targetGroupId());
      if (!el) {
        setFlash('新建元素失败');
        return;
      }
      selectElement(recipe.id, el.groupId, el.id);
      bumpRecipes(true);
      setFlash(`已新建${ELEMENT_TYPE_LABEL[type]}`);
    },
  );

  (app.querySelector('#hvfx-dup-el') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      const recipe = currentRecipe();
      const src = recipe?.elements.find(
        (e) => e.id === CONFIG.hitVfxSelectedElementId,
      );
      if (!recipe || !src || src.type === 'sparkLight') {
        setFlash('请先选中元素');
        return;
      }
      copyElement(src);
      setFlash('元素已复制到剪贴板');
    },
  );

  (app.querySelector('#hvfx-paste-el') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      void (async () => {
        const recipe = currentRecipe();
        if (!recipe) return;
        const payload = await readClipboard();
        if (!payload || payload.kind !== 'element') {
          setFlash('剪贴板中无元素');
          return;
        }
        const el = materializePastedElement(payload);
        if (!el) {
          setFlash('粘贴失败');
          return;
        }
        el.groupId = targetGroupId();
        recipe.elements.push(el);
        selectElement(recipe.id, el.groupId, el.id);
        bumpRecipes(true);
        setFlash('已粘贴元素');
      })();
    },
  );

  (app.querySelector('#hvfx-save-preset') as HTMLButtonElement).addEventListener(
    'click',
    () => saveCurrentElementAsPreset(),
  );

  (app.querySelector('#hvfx-del-node') as HTMLButtonElement).addEventListener(
    'click',
    () => {
      const recipe = currentRecipe();
      if (!recipe) return;
      if (selectionKind === 'element') {
        const el = recipe.elements.find(
          (e) => e.id === CONFIG.hitVfxSelectedElementId,
        );
        if (!el) return;
        if (
          !window.confirm(`确定删除元素「${el.name}」？不可恢复。`)
        ) {
          return;
        }
        deleteElement(recipe, el.id);
        selectionKind = 'group';
        bumpRecipes(true);
        setFlash('元素已删除');
        return;
      }
      if (selectionKind === 'group') {
        const g = recipe.groups.find(
          (x) => x.id === CONFIG.hitVfxSelectedGroupId,
        );
        if (!g) return;
        if (
          !window.confirm(
            `确定删除分组「${g.name}」？组内元素将一并删除，不可恢复。`,
          )
        ) {
          return;
        }
        const result = deleteGroup(recipe, g.id);
        if (!result.ok) {
          setFlash(result.error);
          return;
        }
        selectionKind = 'recipe';
        bumpRecipes(true);
        setFlash('分组已删除');
        return;
      }
      // recipe
      if (
        !window.confirm(`确定删除配方「${recipe.name}」？不可恢复。`)
      ) {
        return;
      }
      const result = deleteRecipe(CONFIG.hitVfxRecipes, recipe.id);
      if (!result.ok) {
        setFlash(result.error);
        return;
      }
      CONFIG.hitVfxRecipes = result.list;
      const next = CONFIG.hitVfxRecipes[0];
      if (next) {
        CONFIG.hitVfxSelectedRecipeId = next.id;
        selectionKind = 'recipe';
      }
      bumpRecipes(true);
      setFlash('配方已删除');
    },
  );

  // Infer selection kind from existing config on boot
  {
    const recipe = currentRecipe();
    if (
      recipe &&
      CONFIG.hitVfxSelectedElementId &&
      recipe.elements.some(
        (e) =>
          e.id === CONFIG.hitVfxSelectedElementId && e.type !== 'sparkLight',
      )
    ) {
      selectionKind = 'element';
    } else if (
      recipe &&
      CONFIG.hitVfxSelectedGroupId &&
      recipe.groups.some((g) => g.id === CONFIG.hitVfxSelectedGroupId)
    ) {
      selectionKind = 'group';
    } else {
      selectionKind = 'recipe';
    }
  }

  refresh();

  return {
    refresh,
    destroy: () => {
      closePresetModal();
      if (flashTimer) window.clearTimeout(flashTimer);
      app.remove();
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function setParamPath(
  params: Record<string, unknown>,
  path: string,
  inp: HTMLInputElement | HTMLSelectElement,
): void {
  const parts = path.split('.');
  if (parts.length === 1) {
    const key = parts[0]!;
    if (inp instanceof HTMLSelectElement) {
      // Keep enum/string selects as strings (seedShape, lightingMode, toneMapping).
      // Number("sphere") is NaN — but Number("") is 0; never coerce selects.
      params[key] = inp.value;
      return;
    }
    if (inp instanceof HTMLInputElement && inp.type === 'checkbox') {
      params[key] = inp.checked;
    } else if (
      inp instanceof HTMLInputElement &&
      inp.type === 'color' &&
      inp.dataset.cssColor === '1'
    ) {
      params[key] = inp.value;
    } else if (inp instanceof HTMLInputElement && inp.type === 'color') {
      params[key] = colorInputToHex(inp.value);
    } else if (inp instanceof HTMLInputElement && inp.dataset.hex === '1') {
      params[key] = colorInputToHex(inp.value);
    } else {
      const n = Number((inp as HTMLInputElement).value);
      params[key] = Number.isFinite(n) ? n : (inp as HTMLInputElement).value;
    }
    return;
  }
  if (parts.length === 2) {
    const [a, b] = parts as [string, string];
    if (b === '0' || b === '1') {
      const arr = params[a];
      if (Array.isArray(arr)) {
        arr[Number(b)] = Number((inp as HTMLInputElement).value);
      }
      return;
    }
    const nested = params[a];
    if (nested && typeof nested === 'object') {
      const obj = nested as Record<string, unknown>;
      if (inp instanceof HTMLInputElement && inp.type === 'checkbox') {
        obj[b] = inp.checked;
      } else if (inp instanceof HTMLInputElement && inp.type === 'color') {
        obj[b] = colorInputToHex(inp.value);
      } else {
        const n = Number((inp as HTMLInputElement).value);
        obj[b] = Number.isFinite(n) ? n : (inp as HTMLInputElement).value;
      }
    }
  }
}

function numRow(label: string, path: string, value: number, step = 'any'): string {
  return `<div class="hvfx-row"><label>${label}</label><input type="number" data-p="${path}" step="${step}" value="${value}" /></div>`;
}

function pairRow(
  label: string,
  path: string,
  value: [number, number],
  step = 'any',
): string {
  return `<div class="hvfx-row pair">
    <div><label>${label} 最小</label><input type="number" data-p="${path}.0" step="${step}" value="${value[0]}" /></div>
    <div><label>${label} 最大</label><input type="number" data-p="${path}.1" step="${step}" value="${value[1]}" /></div>
  </div>`;
}

function colorRow(label: string, path: string, value: number): string {
  return `<div class="hvfx-row"><label>${label}</label>
    <input type="color" data-p="${path}" value="${hexToColorInput(value)}" />
  </div>`;
}

function checkRow(label: string, path: string, value: boolean): string {
  return `<div class="hvfx-row inline"><label>${label}</label><input type="checkbox" data-p="${path}" ${value ? 'checked' : ''} /></div>`;
}

function sparkParamsHtml(p: SparkParams): string {
  return `
    <div class="hvfx-insp-section">
      <h3>火花参数</h3>
      ${numRow('数量', 'count', p.count, '1')}
      ${pairRow('寿命(秒)', 'lifetimeSec', p.lifetimeSec)}
      ${pairRow('速度', 'speed', p.speed)}
      ${pairRow('尺寸', 'size', p.size)}
      ${colorRow('起始色', 'colorStart', p.colorStart)}
      ${colorRow('结束色', 'colorEnd', p.colorEnd)}
      ${numRow('亮度', 'brightness', p.brightness)}
      ${numRow('锥角(弧度)', 'coneAngleRad', p.coneAngleRad)}
      ${numRow('阻力', 'drag', p.drag)}
      ${numRow('重力Y', 'gravityY', p.gravityY)}
      <div class="hvfx-row"><label>混合</label><div class="hvfx-readonly">additive（只读）</div></div>
    </div>
    <div class="hvfx-insp-section">
      <h3>火花光照</h3>
      ${checkRow('光照启用', 'light.enabled', p.light.enabled)}
      ${colorRow('光颜色', 'light.color', p.light.color)}
      ${numRow('光强度', 'light.intensity', p.light.intensity)}
      ${numRow('光强度结束', 'light.intensityEnd', p.light.intensityEnd)}
      ${numRow('光距离', 'light.distance', p.light.distance)}
      ${numRow('光衰减', 'light.decay', p.light.decay)}
      ${numRow('光寿命', 'light.lifetimeSec', p.light.lifetimeSec)}
      ${checkRow('启用点光', 'light.castOnCharacter', p.light.castOnCharacter)}
      ${checkRow('照同组特效', 'light.castOnVfxElements', p.light.castOnVfxElements)}
      <p class="hvfx-hint">点光仅在命中特效层生效，不会照亮角色与场景；「照同组特效」会提高粒子亮度倍率。</p>
    </div>
  `;
}

function sparkDebrisParamsHtml(p: SparkDebrisParams): string {
  return `
    <div class="hvfx-insp-section">
      <h3>小粒子参数</h3>
      ${numRow('数量', 'count', p.count, '1')}
      ${pairRow('寿命(秒)', 'lifetimeSec', p.lifetimeSec)}
      ${pairRow('速度', 'speed', p.speed)}
      ${pairRow('尺寸', 'size', p.size)}
      ${colorRow('颜色', 'color', p.color)}
      ${numRow('重力Y', 'gravityY', p.gravityY)}
      ${numRow('阻力', 'drag', p.drag)}
      ${numRow('锥角(弧度)', 'coneAngleRad', p.coneAngleRad)}
      <div class="hvfx-row"><label>混合</label><div class="hvfx-readonly">additive（只读）</div></div>
    </div>
  `;
}

function dustParamsHtml(p: DustParams): string {
  return `
    <div class="hvfx-insp-section">
      <h3>扬尘参数（旧，加载后会迁成涡环烟）</h3>
      ${numRow('数量', 'count', p.count, '1')}
      ${pairRow('寿命(秒)', 'lifetimeSec', p.lifetimeSec)}
      ${pairRow('速度', 'speed', p.speed)}
      ${pairRow('尺寸', 'size', p.size)}
      ${colorRow('颜色', 'color', p.color)}
      ${numRow('不透明度', 'opacity', p.opacity)}
      ${numRow('重力Y', 'gravityY', p.gravityY)}
      ${numRow('阻力', 'drag', p.drag)}
      ${numRow('锥角(弧度)', 'coneAngleRad', p.coneAngleRad)}
      <div class="hvfx-row"><label>混合</label><div class="hvfx-readonly">alpha（只读）</div></div>
    </div>
  `;
}

function smokeRingParamsHtml(p: SmokeRingParams): string {
  return `
    <div class="hvfx-insp-section">
      <h3>涡环烟参数</h3>
      ${numRow('染料数量', 'dyeCount', p.dyeCount, '1')}
      ${numRow('细丝数量', 'filamentCount', p.filamentCount, '1')}
      ${pairRow('寿命(秒)', 'lifetimeSec', p.lifetimeSec)}
      ${pairRow('细丝寿命', 'filamentLifetimeSec', p.filamentLifetimeSec)}
      ${numRow('环半径', 'ringRadius', p.ringRadius)}
      ${numRow('管半径', 'tubeRadius', p.tubeRadius)}
      ${numRow('切向涡强(环量)', 'vortexStrength', p.vortexStrength)}
      ${numRow('径向扩张', 'expandStrength', p.expandStrength)}
      ${numRow('轴向速度', 'axialSpeed', p.axialSpeed)}
      ${numRow('curl振幅', 'curlAmplitude', p.curlAmplitude)}
      ${numRow('curl频率', 'curlFrequency', p.curlFrequency)}
      ${numRow('curl时间速度', 'curlSpeed', p.curlSpeed)}
      ${numRow('阻力', 'drag', p.drag)}
      ${numRow('重力Y', 'gravityY', p.gravityY)}
      ${pairRow('尺寸', 'size', p.size)}
      ${numRow('细丝宽度', 'filamentWidth', p.filamentWidth)}
      ${colorRow('颜色', 'color', p.color)}
      ${numRow('不透明度', 'opacity', p.opacity)}
      ${numRow('helix helicity', 'helixHelicity', p.helixHelicity)}
      ${numRow('helix coherence', 'helixCoherence', p.helixCoherence)}
      ${numRow('helix decay', 'helixDecay', p.helixDecay)}
      ${numRow('势网格', 'potentialGrid', p.potentialGrid, '1')}
      ${checkRow('深度排序', 'sortByDepth', p.sortByDepth)}
      <div class="hvfx-row"><label>混合</label><div class="hvfx-readonly">alpha（只读）</div></div>
    </div>
  `;
}

function sweatParamsHtml(p: SweatParams): string {
  return `
    <div class="hvfx-insp-section">
      <h3>汗水参数</h3>
      ${numRow('数量', 'count', p.count, '1')}
      ${pairRow('寿命(秒)', 'lifetimeSec', p.lifetimeSec)}
      ${pairRow('速度', 'speed', p.speed)}
      ${pairRow('尺寸', 'size', p.size)}
      ${colorRow('颜色', 'color', p.color)}
      ${numRow('重力Y', 'gravityY', p.gravityY)}
      ${numRow('阻力', 'drag', p.drag)}
      ${numRow('锥角(弧度)', 'coneAngleRad', p.coneAngleRad)}
      <div class="hvfx-row"><label>混合</label><div class="hvfx-readonly">alpha（只读）</div></div>
      <div class="hvfx-row"><label>碰地</label><div class="hvfx-readonly">仅寿命消失（collideGround=false，只读）</div></div>
    </div>
  `;
}

function selectRow(
  label: string,
  path: string,
  value: string,
  options: { value: string; label: string }[],
): string {
  const opts = options
    .map(
      (o) =>
        `<option value="${escapeAttr(o.value)}" ${o.value === value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`,
    )
    .join('');
  return `<div class="hvfx-row"><label>${label}</label><select data-p="${path}">${opts}</select></div>`;
}

function cssColorRow(label: string, path: string, value: string): string {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#b0b0b0';
  return `<div class="hvfx-row"><label>${label}</label>
    <input type="color" data-p="${path}" data-css-color="1" value="${hex}" />
  </div>`;
}

function vec3Row(
  label: string,
  path: string,
  value: { x: number; y: number; z: number },
  step = 'any',
): string {
  return `<div class="hvfx-row hvfx-vec3"><label>${label}</label>
    <div class="hvfx-vec3-inputs">
      <input type="number" data-p="${path}.x" step="${step}" value="${value.x}" title="X" aria-label="${label} X" />
      <input type="number" data-p="${path}.y" step="${step}" value="${value.y}" title="Y" aria-label="${label} Y" />
      <input type="number" data-p="${path}.z" step="${step}" value="${value.z}" title="Z" aria-label="${label} Z" />
    </div>
  </div>`;
}

function sectionBlock(
  title: string,
  sectionKey: keyof VolumeSmokeParams['expandedSections'],
  expanded: boolean,
  body: string,
): string {
  return `
    <div class="hvfx-insp-section hvfx-vs-section">
      <div class="hvfx-vs-section-header">
        <h3>${title}</h3>
        <label class="hvfx-vs-expand"><span>${expanded ? '展开' : '收起'}</span>
          <input type="checkbox" data-section-toggle="${sectionKey}" ${expanded ? 'checked' : ''} />
        </label>
      </div>
      <div data-section-key="${sectionKey}" class="hvfx-vs-section-body">
        ${body}
      </div>
    </div>
  `;
}

function volumeSmokeParamsHtml(p: VolumeSmokeParams): string {
  const ex = p.expandedSections;
  const dyeDissipation =
    p.smokeLifespan >= 100 ? 0 : Number((1 / p.smokeLifespan).toFixed(4));
  const velDissipation = Number((1 / Math.max(0.001, p.tempLifespan)).toFixed(4));
  const originalOnly = p.lightingMode === 'project' ? ' hvfx-disabled' : '';

  return `
    ${sectionBlock(
      '【基础】运行控制',
      'basicRun',
      ex.basicRun,
      `
      ${checkRow('启用模拟', 'simulate', p.simulate)}
      ${numRow('模拟速度', 'simSpeed', p.simSpeed)}
      <div class="hvfx-row"><label>网格尺寸（只读）</label><div class="hvfx-readonly">${GRID}</div></div>
      <div class="hvfx-row"><label>涡度模式（只读）</label><div class="hvfx-readonly">Official-Precompute</div></div>
      `,
    )}
    ${sectionBlock(
      '【模拟】流体域',
      'simDomain',
      ex.simDomain,
      `
      ${numRow('方盒尺寸 (米)', 'volumeSize', p.volumeSize)}
      ${checkRow('无限制(外扩)', 'unrestricted', p.unrestricted)}
      ${numRow('无限制盒尺寸 (米)', 'unrestrictedVolumeSize', p.unrestrictedVolumeSize)}
      ${numRow('压力迭代次数（偶数）', 'pressureIterations', p.pressureIterations, '2')}
      `,
    )}
    ${sectionBlock(
      '【模拟】时间步进',
      'simTime',
      ex.simTime,
      `${numRow('固定子步频率 (Hz)', 'fixedSubstepsHz', p.fixedSubstepsHz, '1')}`,
    )}
    ${sectionBlock(
      '【受击】溅射与种子',
      'hitSplat',
      ex.hitSplat,
      `
      ${numRow('烟雾初始半径 (米)', 'hitRadius', p.hitRadius)}
      <p class="hvfx-hint">控制烟团整体大小（球/盘/环/柱共用）</p>
      ${selectRow('烟团形状', 'seedShape', p.seedShape, [
        { value: 'sphere', label: '球' },
        { value: 'disk', label: '盘' },
        { value: 'ring', label: '环' },
        { value: 'column', label: '柱' },
      ])}
      <div data-seed-shapes="disk,ring">${numRow('盘/环厚度比', 'shapeThickness', p.shapeThickness)}</div>
      <div data-seed-shapes="ring">${numRow('环中心半径比', 'ringRadiusRatio', p.ringRadiusRatio)}</div>
      <div data-seed-shapes="ring">${numRow('环管宽度比', 'ringWidth', p.ringWidth)}</div>
      <div data-seed-shapes="column">${numRow('柱高度比', 'columnHeight', p.columnHeight)}</div>
      <div data-seed-shapes="disk,ring,column">
        ${vec3Row('烟团旋转 (° XYZ)', 'seedRotation', p.seedRotation, '1')}
        <p class="hvfx-hint">先对齐受击方向，再按 XYZ 欧拉角倾斜（球对称，旋转无效）</p>
      </div>
      ${vec3Row('烟团偏移 (UVW)', 'seedOffset', p.seedOffset, '0.01')}
      <p class="hvfx-hint">相对盒心偏移种子位置（UVW；0.5≈半盒）；过大可能被裁切</p>
      ${checkRow('显示初始形状', 'showSeedShape', p.showSeedShape)}
      ${numRow('随机种子', 'spawnSeed', p.spawnSeed, '1')}
      <p class="hvfx-hint">同一种子 + 相同参数/命中 → 烟雾过程完全一样</p>
      ${numRow('随机幅度', 'spawnVariationAmount', p.spawnVariationAmount)}
      <p class="hvfx-hint">0=完全不随机；1=当前默认抖动；大于1可加大抖动</p>
      ${checkRow('每次随机种子', 'randomizeSeed', p.randomizeSeed)}
      <div class="hvfx-row"><button type="button" id="hvfx-vs-reroll-seed">掷一次种子</button></div>
      ${numRow('烟雾出现高度偏置 (米)', 'spawnHeight', p.spawnHeight)}
      ${numRow('冲击力', 'hitImpulse', p.hitImpulse)}
      ${numRow('爆炸占比', 'impulseRadial', p.impulseRadial)}
      <p class="hvfx-hint">0=沿受击方向推；1=四面炸开（容易被压力吃掉）</p>
      ${numRow('旋转推力', 'impulseSwirl', p.impulseSwirl)}
      <p class="hvfx-hint">绕受击方向打转，更能真正带动烟雾</p>
      ${numRow('持续施力子步', 'impulseSubsteps', p.impulseSubsteps, '1')}
      ${checkRow('推力随盒子缩放', 'impulseScaleWithBox', p.impulseScaleWithBox)}
      ${numRow('密度', 'hitDensity', p.hitDensity)}
      ${numRow('温度', 'hitTemperature', p.hitTemperature)}
      ${numRow('显示速度扭曲', 'velDisplayWarp', p.velDisplayWarp)}
      <p class="hvfx-hint">过大容易闪白；与冲击运动无关</p>
      `,
    )}
    ${sectionBlock(
      '【受击】对象池',
      'hitPool',
      ex.hitPool,
      `
      ${numRow('对象池数量', 'poolSize', p.poolSize, '1')}
      <p class="hvfx-hint">更改对象池会重建体积实例，可能短暂卡顿。</p>
      `,
    )}
    ${sectionBlock(
      '【流体】浮力与湍流',
      'fluidForces',
      ex.fluidForces,
      `
      ${numRow('浮力', 'buoyancy', p.buoyancy)}
      ${numRow('重力', 'weight', p.weight)}
      ${numRow('湍流强度', 'turbulence', p.turbulence)}
      ${numRow('湍流衰减', 'turbulenceDecay', p.turbulenceDecay)}
      ${numRow('湍流频率', 'turbFrequency', p.turbFrequency)}
      ${numRow('湍流偏向程度', 'turbulenceBias', p.turbulenceBias)}
      ${vec3Row('湍流方向 (XYZ)', 'turbulenceDir', p.turbulenceDir)}
      ${checkRow('显示湍流方向', 'showTurbulenceDir', p.showTurbulenceDir)}
      ${numRow('速度阻尼', 'velDamping', p.velDamping)}
      `,
    )}
    ${sectionBlock(
      '【流体】关闭与渐隐',
      'fluidLife',
      ex.fluidLife,
      `
      ${selectRow('关闭条件', 'endCondition', p.endCondition, [
        { value: 'lifespan', label: '烟雾寿命' },
        { value: 'density', label: '密度截止' },
      ])}
      <div data-end-mode="density">
        ${numRow('密度截止', 'densityStop', p.densityStop)}
        <p class="hvfx-hint">体积内最大密度 ≤ 该值时开始渐隐。</p>
      </div>
      <div class="hvfx-row">
        <label data-smoke-life-label>${
          p.endCondition === 'density' ? '染料寿命 (耗散)' : '烟雾寿命 (秒)'
        }</label>
        <input type="number" step="any" data-p="smokeLifespan" value="${p.smokeLifespan}" />
      </div>
      <p class="hvfx-hint" data-end-hint="lifespan">到达寿命后开始渐隐，并同时驱动染料耗散。</p>
      <p class="hvfx-hint" data-end-hint="density">染料寿命不负责关闭，只影响耗散快慢。</p>
      ${numRow('渐隐时长 (秒)', 'fadeOutSec', p.fadeOutSec)}
      ${selectRow('渐隐曲线', 'fadeCurve', p.fadeCurve, [
        { value: 'linear', label: '线性' },
        { value: 'easeOut', label: '缓出 easeOut' },
        { value: 'easeIn', label: '缓入 easeIn' },
        { value: 'smoothstep', label: '平滑 smoothstep' },
      ])}
      ${numRow('温度寿命 (秒)', 'tempLifespan', p.tempLifespan)}
      <div class="hvfx-row"><label>染料耗散预览</label><div class="hvfx-readonly">${dyeDissipation}</div></div>
      <div class="hvfx-row"><label>速度耗散预览</label><div class="hvfx-readonly">${velDissipation}</div></div>
      `,
    )}
    ${sectionBlock(
      '【渲染】光线与外观',
      'renderLook',
      ex.renderLook,
      `
      ${numRow('光线步进次数', 'raymarchSteps', p.raymarchSteps, '1')}
      ${cssColorRow('烟雾颜色', 'smokeColor', p.smokeColor)}
      ${numRow('密度增益', 'densityGain', p.densityGain)}
      ${numRow('阴影吸收', 'shadowAbsorption', p.shadowAbsorption)}
      ${numRow('阴影环境光', 'shadowAmbient', p.shadowAmbient)}
      ${numRow('粉末效应', 'powderStrength', p.powderStrength)}
      ${numRow('多重散射', 'multiScattering', p.multiScattering)}
      ${numRow('相位不对称 (g)', 'phaseAsymmetry', p.phaseAsymmetry)}
      `,
    )}
    ${sectionBlock(
      '【渲染】后期与管线',
      'renderPost',
      ex.renderPost,
      `
      ${numRow('渲染分辨率缩放', 'resolutionScale', p.resolutionScale)}
      ${checkRow('启用降噪', 'denoise', p.denoise)}
      ${numRow('降噪强度', 'denoiseStrength', p.denoiseStrength)}
      ${checkRow('步进随时间衰减', 'stepsDecayEnable', p.stepsDecayEnable)}
      ${checkRow('使用渲染管线', 'useRenderPipeline', p.useRenderPipeline)}
      <p class="hvfx-hint">宿主场景默认直渲；开启管线目前仅保留参数兼容。</p>
      `,
    )}
    ${sectionBlock(
      '【场景】光照与色调',
      'sceneLight',
      ex.sceneLight,
      `
      ${selectRow('光照模式', 'lightingMode', p.lightingMode, [
        { value: 'original', label: '原项目光照' },
        { value: 'project', label: '本项目光照' },
      ])}
      <div data-original-light class="${originalOnly.trim()}">
        ${selectRow('色调映射', 'toneMapping', p.toneMapping, [
          { value: 'None', label: '无' },
          { value: 'Linear', label: '线性' },
          { value: 'Reinhard', label: 'Reinhard' },
          { value: 'Cineon', label: 'Cineon' },
          { value: 'ACESFilmic', label: 'ACESFilmic' },
          { value: 'AgX', label: 'AgX' },
          { value: 'Neutral', label: 'Neutral' },
        ])}
        ${numRow('曝光', 'exposure', p.exposure)}
        ${numRow('主光强度', 'keyLightIntensity', p.keyLightIntensity, '1')}
        ${checkRow('全局光', 'globalLight', p.globalLight)}
        ${checkRow('显示地面', 'showFloor', p.showFloor)}
        <p class="hvfx-hint">以上五项仅「原项目光照」生效；本项目光照使用 LightRig。原项目主光只照体素烟自身（及可选 debug 地面），不会照亮角色与场景；共享场景下默认不改写全局色调映射/曝光。</p>
      </div>
      `,
    )}
  `;
}

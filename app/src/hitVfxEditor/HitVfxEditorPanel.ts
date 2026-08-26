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
import {
  CREATABLE_ELEMENT_TYPES,
  type DustParams,
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
} from '../render/hitVfx/hitVfxTypes';
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
  replay: () => void;
  stepFrame: () => void;
  invalidate: () => void;
  onConfigChanged: (key: string) => void;
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
  dust: '扬尘',
  sweat: '汗水',
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
            <option value="dust">扬尘</option>
            <option value="sweat">汗水</option>
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
      inp.addEventListener('change', () => {
        const [band, key] = inp.dataset.str!.split('.') as [
          HitVfxStrength,
          keyof typeof recipe.strengthScale.L,
        ];
        recipe.strengthScale[band][key] = Math.max(0, Number(inp.value) || 0);
        notify('hitVfxRecipes');
        hooks.invalidate();
      });
    });
    inspBody.querySelectorAll<HTMLInputElement>('[data-ho]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const [band, axis] = inp.dataset.ho!.split('.') as [
          'h' | 'm' | 'l',
          'y' | 'z',
        ];
        const n = Number(inp.value);
        if (!Number.isFinite(n)) return;
        CONFIG.hitVfxHeightOffsets[band][axis] = n;
        notify('hitVfxHeightOffsets');
      });
    });
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
    } else if (element.type === 'dust') {
      typeParams = dustParamsHtml(element.params);
    } else if (element.type === 'sweat') {
      typeParams = sweatParamsHtml(element.params);
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
    (inspBody.querySelector('#insp-el-delay') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        element.startDelaySec = Math.max(
          0,
          Number((e.target as HTMLInputElement).value) || 0,
        );
        paramBump();
      },
    );
    (inspBody.querySelector('#insp-el-recv') as HTMLInputElement).addEventListener(
      'change',
      (e) => {
        element.receiveSparkLight = (e.target as HTMLInputElement).checked;
        paramBump();
      },
    );

    bindParamFields(inspBody, element, paramBump);
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
      hooks.replay();
      setFlash('已重放');
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
      const type = typeSel.value as Exclude<HitVfxElementType, 'sparkLight'>;
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
    if (inp instanceof HTMLInputElement && inp.type === 'checkbox') {
      params[key] = inp.checked;
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
      ${checkRow('照角色', 'light.castOnCharacter', p.light.castOnCharacter)}
      ${checkRow('照同组特效', 'light.castOnVfxElements', p.light.castOnVfxElements)}
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
      <h3>扬尘参数</h3>
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

/**
 * CMOS screen-shake ControlPanel section: DOM + bindings + preset CRUD.
 * FOV-only: translation / rotation channels are not exposed.
 */

import {
  normalizeCmosShakeEffectPreset,
  type CmosShakeEffectPreset,
} from '../config/cmosShake';
import { CONFIG, getPath, setPath } from '../config/store';
import type { RuntimeConfig } from '../config/types';
import { attachDragScrub } from './dragScrub';

type OnChange = (key: string, value: unknown, config: RuntimeConfig) => void;

function formatNumber(v: number, digits: number): string {
  if (!Number.isFinite(v)) return '—';
  const f = 10 ** digits;
  return String(Math.round(v * f) / f);
}

/** 参数名 + 旁注（调大效果等） */
function paramLabel(name: string, hint: string, valueId?: string): string {
  const val = valueId
    ? `<span class="val" id="${valueId}">—</span>`
    : '';
  return `<div class="panel-row-header">
      <span class="param-name"><span>${name}</span><span class="param-hint">${hint}</span></span>
      ${val}
    </div>`;
}

export function cmosShakeSectionHtml(): string {
  return `
      <details class="panel-group" data-cat="屏幕震动">
        <summary>屏幕震动</summary>
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">【屏幕震动】FOV 弹簧悬挂</span>
            <label>展开 <span id="val-expandCmosShake">展开</span>
              <input id="inp-expandCmosShake" type="checkbox" />
            </label>
          </div>
          <div class="section-body" id="sect-cmosShake">
            <p class="panel-hint">FOV 按弹簧阻尼 MSMD：一次位置阶跃 + 速度冲量，目标回 0。业务 play(预设id)。</p>

            <div class="panel-row row-toggle">
              ${paramLabel('启用震动', '关=完全不抖（无障碍）；开=允许冲量与输出', 'val-cmosShakeEnabled')}
              <input id="inp-cmosShakeEnabled" type="checkbox" />
            </div>
            <div class="panel-row">
              ${paramLabel('全局强度', '调大→FOV 伸缩更猛；0=等同关闭（推荐无障碍开关）', 'val-cmosShakeIntensity')}
              <input id="inp-cmosShakeIntensity" type="number" min="0" max="1" step="0.01" />
            </div>
            <div class="panel-row row-toggle">
              ${paramLabel('跟随游戏倍速', '开=卡帧/慢放时震动也变慢；关=墙钟感（推荐，命中停顿仍能感到冲击）', 'val-cmosShakeUseGameSpeed')}
              <input id="inp-cmosShakeUseGameSpeed" type="checkbox" />
            </div>
            <p class="panel-hint" style="font-weight:600;margin-top:6px">按轻/中/重自动选预设</p>
            <p class="panel-hint">招式强度 L→S、M→M、H→L。默认 S_impact / M_impact / L_impact；空=该档不震。</p>
            <div class="panel-row">
              ${paramLabel('轻攻击命中 (S)', '轻拳/轻脚命中时 play 的预设 id', 'val-cmosPresetOnHitS')}
              <input id="inp-cmosPresetOnHitS" type="text" spellcheck="false" placeholder="S_impact" />
            </div>
            <div class="panel-row">
              ${paramLabel('中攻击命中 (M)', '中拳/中脚命中时 play 的预设 id', 'val-cmosPresetOnHitM')}
              <input id="inp-cmosPresetOnHitM" type="text" spellcheck="false" placeholder="M_impact" />
            </div>
            <div class="panel-row">
              ${paramLabel('重攻击命中 (L)', '重拳/重脚命中时 play 的预设 id', 'val-cmosPresetOnHitL')}
              <input id="inp-cmosPresetOnHitL" type="text" spellcheck="false" placeholder="L_impact" />
            </div>
            <div class="panel-row">
              ${paramLabel('轻攻击防御 (S)', '轻攻击被格挡时 play 的预设 id', 'val-cmosPresetOnBlockS')}
              <input id="inp-cmosPresetOnBlockS" type="text" spellcheck="false" placeholder="S_impact" />
            </div>
            <div class="panel-row">
              ${paramLabel('中攻击防御 (M)', '中攻击被格挡时 play 的预设 id', 'val-cmosPresetOnBlockM')}
              <input id="inp-cmosPresetOnBlockM" type="text" spellcheck="false" placeholder="M_impact" />
            </div>
            <div class="panel-row">
              ${paramLabel('重攻击防御 (L)', '重攻击被格挡时 play 的预设 id', 'val-cmosPresetOnBlockL')}
              <input id="inp-cmosPresetOnBlockL" type="text" spellcheck="false" placeholder="L_impact" />
            </div>

            <p class="panel-hint" style="font-weight:600;margin-top:8px">震动效果预设</p>
            <p class="panel-hint">单次 MSMD 激励（不是下方全局弹簧）。用稳定 id 调用 play(id)。</p>
            <div class="panel-row">
              ${paramLabel('选择预设', '从已存列表载入到下方编辑器')}
              <select id="sel-cmos-effect-preset" style="width:100%"></select>
            </div>
            <div class="panel-row">
              ${paramLabel('调用标识', '代码里 play("这个id")；字母开头，仅字母数字下划线')}
              <input id="inp-cmosEffectId" type="text" placeholder="例如 impact / rumble" spellcheck="false" />
            </div>
            <div class="panel-row">
              ${paramLabel('显示名称', '面板上给人看的中文名，不影响调用')}
              <input id="inp-cmosEffectLabel" type="text" placeholder="例如 主冲击" />
            </div>
            <div class="panel-row">
              ${paramLabel('位置阶跃 (°)', '开始时 x+=Δ；正=变宽，负=变窄（冲击感常用负）', 'val-cmosEffectImpulsePos')}
              <input id="inp-cmosEffectImpulsePos" type="number" min="-5" max="5" step="0.05" />
            </div>
            <div class="panel-row">
              ${paramLabel('速度冲量 (°/s)', '开始时 v+=v0', 'val-cmosEffectImpulseVel')}
              <input id="inp-cmosEffectImpulseVel" type="number" min="-40" max="40" step="0.1" />
            </div>
            <div class="panel-actions-row">
              <button type="button" id="btn-cmosEffect-new">新建</button>
              <button type="button" id="btn-cmosEffect-save">保存修改</button>
              <button type="button" id="btn-cmosEffect-delete">删除</button>
              <button type="button" id="btn-cmosEffect-test">试射此预设</button>
              <button type="button" id="btn-cmosEffect-fromDebug">从自定义冲量填入</button>
            </div>
            <p class="panel-hint">快捷试射：</p>
            <div id="cmos-effect-quick-btns" class="panel-actions-row" style="flex-wrap:wrap"></div>
            <div class="panel-actions-row">
              <button type="button" id="btn-cmosShake-burstTick">连射×5 轻击</button>
              <button type="button" id="btn-cmosShake-custom">自定义冲量试射</button>
              <button type="button" id="btn-cmosShake-reset">硬复位回中</button>
            </div>

            <p class="panel-hint" style="font-weight:600;margin-top:8px">自定义冲量（草稿试射）</p>
            <div class="panel-row">
              ${paramLabel('位置阶跃 (°)', '这一脚瞬间 FOV 偏移', 'val-cmosDebugImpulsePos')}
              <input id="inp-cmosDebugImpulsePos" type="number" min="-5" max="5" step="0.05" />
            </div>
            <div class="panel-row">
              ${paramLabel('速度冲量 (°/s)', '这一脚 FOV 速度', 'val-cmosDebugImpulseVel')}
              <input id="inp-cmosDebugImpulseVel" type="number" min="-40" max="40" step="0.1" />
            </div>

            <p class="panel-hint" style="font-weight:600;margin-top:8px">全局动力学（所有预设共用）</p>
            <p class="panel-hint">一根 MSMD 弹簧。先 ωn 定脆度，再 ζ 定过冲；mass 默认 1。</p>
            <div class="panel-row">
              ${paramLabel('自然频率 ωn', '调大→回弹更快更脆（rad/s）', 'val-cmosFovAngularFreq')}
              <input id="inp-cmosFovAngularFreq" type="number" min="4" max="40" step="0.5" />
            </div>
            <div class="panel-row">
              ${paramLabel('阻尼比 ζ', '调大→少过冲；调小→来回伸缩更弹', 'val-cmosFovDampingRatio')}
              <input id="inp-cmosFovDampingRatio" type="number" min="0.2" max="1.5" step="0.02" />
            </div>
            <div class="panel-row">
              ${paramLabel('最大 FOV 偏移 (°)', '软夹持上限；建议 ≤2.5', 'val-cmosMaxFovDeg')}
              <input id="inp-cmosMaxFovDeg" type="number" min="0" max="8" step="0.1" />
            </div>
            <div class="panel-row">
              ${paramLabel('单帧积分时间上限 (秒)', '调大→掉帧时一步走更远（易飞）；一般保持 0.05', 'val-cmosMaxDtSec')}
              <input id="inp-cmosMaxDtSec" type="number" min="0.01" max="0.1" step="0.005" />
            </div>
            <div class="panel-row">
              ${paramLabel('积分子步数', '调大→更稳更准、略耗 CPU；通常 4', 'val-cmosSubsteps')}
              <input id="inp-cmosSubsteps" type="number" min="1" max="8" step="1" />
            </div>
            <div class="panel-row">
              ${paramLabel('质量 mass', '与刚度同比例；ωn/ζ 固定时手感几乎不变，一般保持 1', 'val-cmosFovMass')}
              <input id="inp-cmosFovMass" type="number" min="0.1" max="5" step="0.1" />
            </div>
          </div>
        </div>
      </details>
  `;
}

const CMOS_NUM_BINDS: Array<{ id: string; path: string }> = [
  { id: 'cmosShakeIntensity', path: 'cmosShake.intensity' },
  { id: 'cmosFovAngularFreq', path: 'cmosShake.fovAngularFreq' },
  { id: 'cmosFovDampingRatio', path: 'cmosShake.fovDampingRatio' },
  { id: 'cmosMaxFovDeg', path: 'cmosShake.maxFovDeg' },
  { id: 'cmosMaxDtSec', path: 'cmosShake.maxDtSec' },
  { id: 'cmosSubsteps', path: 'cmosShake.substeps' },
  { id: 'cmosFovMass', path: 'cmosShake.fovMass' },
  { id: 'cmosDebugImpulsePos', path: 'cmosShake.debugImpulse.impulsePosDeg' },
  { id: 'cmosDebugImpulseVel', path: 'cmosShake.debugImpulse.impulseVelDeg' },
];

export function bindCmosShakePanel(opts: {
  root: HTMLElement;
  syncers: Array<() => void>;
  onChange: OnChange;
  setFlash: (msg: string) => void;
  bindNumber: (inputId: string, path: string, valueId?: string) => void;
  bindToggle: (
    inputId: string,
    path: string,
    labels?: [string, string],
    valueId?: string,
  ) => void;
  bindSectionExpand: (
    inputId: string,
    valueId: string,
    sectionKey: 'cmosShake',
    bodyId: string,
  ) => void;
}): void {
  const { root, syncers, onChange, setFlash, bindNumber, bindToggle, bindSectionExpand } =
    opts;

  bindSectionExpand(
    'inp-expandCmosShake',
    'val-expandCmosShake',
    'cmosShake',
    'sect-cmosShake',
  );
  bindToggle('inp-cmosShakeEnabled', 'cmosShake.enabled', ['关', '开'], 'val-cmosShakeEnabled');
  bindToggle(
    'inp-cmosShakeUseGameSpeed',
    'cmosShake.useGameSpeed',
    ['关', '开'],
    'val-cmosShakeUseGameSpeed',
  );
  for (const { id, path } of CMOS_NUM_BINDS) {
    bindNumber(`inp-${id}`, path, `val-${id}`);
  }

  const bindText = (inputId: string, path: string, valueId: string) => {
    const input = root.querySelector(`#${CSS.escape(inputId)}`) as HTMLInputElement | null;
    const valEl = root.querySelector(`#${CSS.escape(valueId)}`);
    if (!input) return;
    const sync = () => {
      const v = String(getPath(CONFIG, path) ?? '');
      if (document.activeElement !== input) input.value = v;
      if (valEl) valEl.textContent = v || '—';
    };
    input.addEventListener('change', () => {
      const v = input.value.trim();
      setPath(CONFIG as unknown as Record<string, unknown>, path, v);
      if (valEl) valEl.textContent = v || '—';
      onChange(path, v, CONFIG);
    });
    syncers.push(sync);
    sync();
  };
  bindText('inp-cmosPresetOnHitS', 'cmosShake.presetOnHitByStrength.S', 'val-cmosPresetOnHitS');
  bindText('inp-cmosPresetOnHitM', 'cmosShake.presetOnHitByStrength.M', 'val-cmosPresetOnHitM');
  bindText('inp-cmosPresetOnHitL', 'cmosShake.presetOnHitByStrength.L', 'val-cmosPresetOnHitL');
  bindText(
    'inp-cmosPresetOnBlockS',
    'cmosShake.presetOnBlockByStrength.S',
    'val-cmosPresetOnBlockS',
  );
  bindText(
    'inp-cmosPresetOnBlockM',
    'cmosShake.presetOnBlockByStrength.M',
    'val-cmosPresetOnBlockM',
  );
  bindText(
    'inp-cmosPresetOnBlockL',
    'cmosShake.presetOnBlockByStrength.L',
    'val-cmosPresetOnBlockL',
  );

  const bindCmosAction = (btnId: string, actionKey: string) => {
    root.querySelector(`#${CSS.escape(btnId)}`)?.addEventListener('click', () => {
      onChange(actionKey, null, CONFIG);
    });
  };
  bindCmosAction('btn-cmosShake-burstTick', 'action:cmosShake:burstTick');
  bindCmosAction('btn-cmosShake-custom', 'action:cmosShake:custom');
  bindCmosAction('btn-cmosShake-reset', 'action:cmosShake:reset');

  {
    const select = root.querySelector(
      '#sel-cmos-effect-preset',
    ) as HTMLSelectElement | null;
    const idInput = root.querySelector('#inp-cmosEffectId') as HTMLInputElement | null;
    const labelInput = root.querySelector(
      '#inp-cmosEffectLabel',
    ) as HTMLInputElement | null;
    const posInput = root.querySelector(
      '#inp-cmosEffectImpulsePos',
    ) as HTMLInputElement | null;
    const velInput = root.querySelector(
      '#inp-cmosEffectImpulseVel',
    ) as HTMLInputElement | null;

    const posVal = root.querySelector('#val-cmosEffectImpulsePos');
    const velVal = root.querySelector('#val-cmosEffectImpulseVel');
    const quickHost = root.querySelector('#cmos-effect-quick-btns');

    const CMOS_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

    const ensurePresetsMutable = (): Record<string, CmosShakeEffectPreset> => {
      if (!CONFIG.cmosShake.presets || typeof CONFIG.cmosShake.presets !== 'object') {
        CONFIG.cmosShake.presets = {};
      }
      return CONFIG.cmosShake.presets;
    };

    const readEditor = (): CmosShakeEffectPreset & { id: string } => {
      const id = (idInput?.value ?? '').trim();
      const label = (labelInput?.value ?? '').trim() || id;
      const num = (el: HTMLInputElement | null, fallback: number) => {
        const v = el ? Number(el.value) : NaN;
        return Number.isFinite(v) ? v : fallback;
      };
      const toV = CONFIG.cmosShake.fovToVelocity;
      const partial: Partial<CmosShakeEffectPreset> = {
        label,
        impulsePosDeg: num(posInput, 0),
        impulseVelDeg: num(velInput, 0),
      };
      const normalized = normalizeCmosShakeEffectPreset(
        id || 'draft',
        partial,
        null,
        toV,
      );
      return { id, ...normalized };
    };

    const writeEditor = (id: string, p: CmosShakeEffectPreset): void => {
      const n = normalizeCmosShakeEffectPreset(
        id,
        p,
        null,
        CONFIG.cmosShake.fovToVelocity,
      );
      if (idInput) idInput.value = id;
      if (labelInput) labelInput.value = n.label ?? id;
      if (posInput) posInput.value = formatNumber(n.impulsePosDeg, 2);
      if (velInput) velInput.value = formatNumber(n.impulseVelDeg, 2);

      if (posVal) posVal.textContent = formatNumber(n.impulsePosDeg, 2);
      if (velVal) velVal.textContent = formatNumber(n.impulseVelDeg, 2);
    };

    const refreshQuickButtons = (): void => {
      if (!quickHost) return;
      const presets = ensurePresetsMutable();
      const ids = Object.keys(presets).sort((a, b) => a.localeCompare(b));
      quickHost.innerHTML = '';
      for (const id of ids) {
        const p = presets[id]!;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = p.label && p.label !== id ? `${id}（${p.label}）` : id;
        btn.title = `播放「${id}」`;
        btn.addEventListener('click', () => {
          onChange(`action:cmosShake:play:${id}`, null, CONFIG);
        });
        quickHost.appendChild(btn);
      }
    };

    const refreshSelect = (preferId?: string): void => {
      if (!select) return;
      const presets = ensurePresetsMutable();
      const ids = Object.keys(presets).sort((a, b) => a.localeCompare(b));
      const keep =
        preferId && presets[preferId]
          ? preferId
          : select.value && presets[select.value]
            ? select.value
            : (ids[0] ?? '');
      select.innerHTML = '';
      if (ids.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- 无预设 --';
        select.appendChild(opt);
        select.value = '';
        refreshQuickButtons();
        return;
      }
      for (const id of ids) {
        const p = presets[id]!;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent =
          p.label && p.label !== id ? `${id} — ${p.label}` : id;
        select.appendChild(opt);
      }
      select.value = keep;
      const cur = presets[keep];
      if (cur) writeEditor(keep, cur);
      refreshQuickButtons();
    };

    const syncFromConfig = (): void => {
      const prefer = (idInput?.value ?? '').trim() || select?.value || undefined;
      refreshSelect(prefer);
    };
    syncFromConfig();
    syncers.push(syncFromConfig);

    select?.addEventListener('change', () => {
      const id = select.value;
      const p = CONFIG.cmosShake.presets[id];
      if (p) writeEditor(id, p);
    });

    const bindValLabel = (
      input: HTMLInputElement | null,
      labelEl: Element | null,
      digits: number,
    ) => {
      if (!input) return;
      attachDragScrub(input);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        if (labelEl && Number.isFinite(v)) {
          labelEl.textContent = formatNumber(v, digits);
        }
      });
    };
    bindValLabel(posInput, posVal, 2);
    bindValLabel(velInput, velVal, 2);

    root.querySelector('#btn-cmosEffect-new')?.addEventListener('click', () => {
      const editor = readEditor();
      let id = editor.id;
      if (!id || !CMOS_ID_RE.test(id)) {
        id =
          window
            .prompt(
              '新建震动效果 id（字母/数字/下划线，字母开头）\n例如 impact、rumble',
              id || 'customShake',
            )
            ?.trim() ?? '';
      }
      if (!id) return;
      if (!CMOS_ID_RE.test(id)) {
        setFlash('id 格式无效：需字母开头，仅含字母数字下划线');
        return;
      }
      const presets = ensurePresetsMutable();
      if (presets[id] && !window.confirm(`预设「${id}」已存在，覆盖？`)) return;
      const { id: _drop, ...fields } = editor;
      void _drop;
      const next = normalizeCmosShakeEffectPreset(
        id,
        {
          ...fields,
          label: editor.label || id,
        },
        null,
        CONFIG.cmosShake.fovToVelocity,
      );
      presets[id] = next;
      writeEditor(id, next);
      refreshSelect(id);
      onChange('cmosShake.presets', presets, CONFIG);
      setFlash(`已新建震动预设 ${id}`);
    });

    root.querySelector('#btn-cmosEffect-save')?.addEventListener('click', () => {
      const editor = readEditor();
      const oldId = select?.value ?? '';
      const newId = editor.id;
      if (!newId || !CMOS_ID_RE.test(newId)) {
        setFlash('请填写合法 id（字母开头，字母数字下划线）');
        return;
      }
      const presets = ensurePresetsMutable();
      if (oldId && oldId !== newId) {
        if (
          presets[newId] &&
          !window.confirm(`目标 id「${newId}」已存在，覆盖并删除旧 id「${oldId}」？`)
        ) {
          return;
        }
        delete presets[oldId];
      } else if (!presets[newId] && !window.confirm(`预设「${newId}」不存在，是否新建？`)) {
        return;
      }
      const { id: _drop, ...fields } = editor;
      void _drop;
      const next = normalizeCmosShakeEffectPreset(
        newId,
        {
          ...fields,
          label: editor.label || newId,
        },
        null,
        CONFIG.cmosShake.fovToVelocity,
      );
      presets[newId] = next;
      refreshSelect(newId);
      onChange('cmosShake.presets', presets, CONFIG);
      setFlash(`已保存震动预设 ${newId}（记得点「存为本地默认」）`);
    });

    root.querySelector('#btn-cmosEffect-delete')?.addEventListener('click', () => {
      const id = select?.value || (idInput?.value ?? '').trim();
      if (!id) {
        setFlash('没有可删除的预设');
        return;
      }
      const presets = ensurePresetsMutable();
      if (!presets[id]) {
        setFlash(`预设「${id}」不存在`);
        return;
      }
      if (!window.confirm(`删除震动预设「${id}」？`)) return;
      delete presets[id];
      refreshSelect();
      onChange('cmosShake.presets', presets, CONFIG);
      setFlash(`已删除 ${id}`);
    });

    root.querySelector('#btn-cmosEffect-test')?.addEventListener('click', () => {
      const editor = readEditor();
      const { id: editId, ...fields } = editor;
      const draft = normalizeCmosShakeEffectPreset(
        editId || 'draft',
        fields,
        null,
        CONFIG.cmosShake.fovToVelocity,
      );
      if (editId && CMOS_ID_RE.test(editId) && CONFIG.cmosShake.presets[editId]) {
        const backup = { ...CONFIG.cmosShake.presets[editId]! };
        CONFIG.cmosShake.presets[editId] = draft;
        onChange(`action:cmosShake:play:${editId}`, null, CONFIG);
        CONFIG.cmosShake.presets[editId] = backup;
        setFlash(`试射 ${editId}`);
        return;
      }
      const tempId = '__panelDraft';
      const presets = ensurePresetsMutable();
      const had = presets[tempId];
      presets[tempId] = { ...draft, label: draft.label || '草稿试射' };
      onChange(`action:cmosShake:play:${tempId}`, null, CONFIG);
      if (had) presets[tempId] = had;
      else delete presets[tempId];
      setFlash('试射草稿（未保存）');
    });

    root.querySelector('#btn-cmosEffect-fromDebug')?.addEventListener('click', () => {
      const d = CONFIG.cmosShake.debugImpulse;
      if (posInput) posInput.value = formatNumber(d.impulsePosDeg, 2);
      if (velInput) velInput.value = formatNumber(d.impulseVelDeg, 2);
      if (posVal) posVal.textContent = formatNumber(d.impulsePosDeg, 2);
      if (velVal) velVal.textContent = formatNumber(d.impulseVelDeg, 2);
      setFlash('已从自定义冲量填入编辑器（需点保存写入预设）');
    });
  }
}

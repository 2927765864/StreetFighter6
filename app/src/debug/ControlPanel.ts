import './control-panel.css';
import type { MatchSim } from '../combat/match/MatchSim';
import type { FrameClock } from '../combat/frameClock';
import { syncMatchOpts } from '../config/constants';
import { CONFIG, getPath, resetToFactoryActiveDefault, setPath } from '../config/store';
import type { ExpandedSections, RuntimeConfig } from '../config/types';
import {
  clearSavedConfig,
  deleteNamedPreset,
  exportNamedPresetJson,
  exportShippingJson,
  importPresetFromObject,
  listNamedPresets,
  loadNamedPreset,
  saveCurrentConfig,
  saveNamedPreset,
} from '../config/persist';
import {
  copyFollowLightsP1toP2,
  createLightByType,
  duplicateLightAsNew,
  enableLightFollow,
  enforceLightRules,
  fighterFollowOriginFromLogic,
  isLightFollowing,
  lightSupportsFollow,
  newLightId,
  syncLegacyFollowOffsets,
  type FighterFollowOrigin,
  type LightDesc,
  type LightFollowTarget,
  type LightType,
} from '../config/lightTypes';
import type { DummyGuardPolicy } from '../combat/types';
import { attachDragScrub, attachDragScrubAll } from './dragScrub';
import {
  fetchRyuAnimCatalog,
  type AnimCatalogCategory,
  type AnimCatalogClip,
} from '../data/animCatalog';
import type { FighterView } from '../render/FighterView';
import { reloadMoveFromPublic } from './DebugGui';

export type ControlPanelHooks = {
  paused: boolean;
  stepOnce: () => void;
  reloadMoveJson: () => Promise<void>;
  p1View?: FighterView;
  p2View?: FighterView;
  /** World follow origin (logic X + hips Y). Falls back to logic Y if omitted. */
  getLightFollowOrigin?: (who: 'p1' | 'p2') => FighterFollowOrigin;
};

export type LightEditPanelHooks = {
  setGizmoMode: (mode: 'position' | 'target') => void;
  reattach: () => void;
};

export type ControlPanelApi = {
  refresh: () => void;
  setFlash: (msg: string) => void;
  destroy: () => void;
};

type OnChange = (key: string, value: unknown, config: RuntimeConfig) => void;

type BindCtx = {
  onChange: OnChange;
  syncers: Array<() => void>;
  root: HTMLElement;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function byId<T extends HTMLElement>(root: ParentNode, id: string): T {
  const n = root.querySelector(`#${CSS.escape(id)}`);
  if (!n) throw new Error(`control panel missing #${id}`);
  return n as T;
}

function bindNumber(
  ctx: BindCtx,
  inputId: string,
  path: string,
  valueId?: string,
): void {
  const input = byId<HTMLInputElement>(ctx.root, inputId);
  const valEl = valueId ? ctx.root.querySelector(`#${CSS.escape(valueId)}`) : null;

  const read = (): number => {
    const v = getPath(CONFIG, path);
    return typeof v === 'number' ? v : Number(input.value) || 0;
  };

  const sync = () => {
    const v = read();
    if (document.activeElement !== input) input.value = String(v);
    if (valEl) valEl.textContent = String(v);
  };

  const write = () => {
    let v = Number(input.value);
    if (!Number.isFinite(v)) return;
    if (input.min !== '') v = Math.max(Number(input.min), v);
    if (input.max !== '') v = Math.min(Number(input.max), v);
    setPath(CONFIG as unknown as Record<string, unknown>, path, v);
    if (valEl) valEl.textContent = String(v);
    ctx.onChange(path, v, CONFIG);
  };

  input.addEventListener('input', write);
  input.addEventListener('change', write);
  ctx.syncers.push(sync);
  sync();
}

function bindToggle(
  ctx: BindCtx,
  inputId: string,
  path: string,
  labels: [string, string] = ['关', '开'],
  valueId?: string,
): void {
  const input = byId<HTMLInputElement>(ctx.root, inputId);
  const valEl = valueId ? ctx.root.querySelector(`#${CSS.escape(valueId)}`) : null;

  const sync = () => {
    const v = Boolean(getPath(CONFIG, path));
    input.checked = v;
    if (valEl) valEl.textContent = v ? labels[1] : labels[0];
  };

  input.addEventListener('change', () => {
    const v = input.checked;
    setPath(CONFIG as unknown as Record<string, unknown>, path, v);
    if (valEl) valEl.textContent = v ? labels[1] : labels[0];
    ctx.onChange(path, v, CONFIG);
  });
  ctx.syncers.push(sync);
  sync();
}

function bindSelect(
  ctx: BindCtx,
  selectId: string,
  path: string,
  mapValue?: (raw: string) => unknown,
): void {
  const select = byId<HTMLSelectElement>(ctx.root, selectId);
  const sync = () => {
    const v = getPath(CONFIG, path);
    select.value = String(v ?? '');
  };
  select.addEventListener('change', () => {
    const raw = select.value;
    const v = mapValue ? mapValue(raw) : raw;
    setPath(CONFIG as unknown as Record<string, unknown>, path, v);
    ctx.onChange(path, v, CONFIG);
  });
  ctx.syncers.push(sync);
  sync();
}

function bindSectionExpand(
  ctx: BindCtx,
  inputId: string,
  valueId: string,
  sectionKey: keyof ExpandedSections,
  bodyId: string,
): void {
  const path = `expandedSections.${sectionKey}`;
  bindToggle(ctx, inputId, path, ['收起', '展开'], valueId);
  const input = byId<HTMLInputElement>(ctx.root, inputId);
  const body = byId<HTMLElement>(ctx.root, bodyId);
  const sync = () => {
    body.classList.toggle('is-collapsed', !input.checked);
  };
  input.addEventListener('change', sync);
  ctx.syncers.push(sync);
  sync();
}

function rowNumber(
  id: string,
  label: string,
  min: number | string,
  max: number | string,
  step: number | string,
): string {
  return `<div class="panel-row">
    <div class="panel-row-header"><span>${label}</span><span class="val" id="val-${id}">—</span></div>
    <input id="inp-${id}" type="number" min="${min}" max="${max}" step="${step}" />
  </div>`;
}

function rowToggle(id: string, label: string): string {
  return `<div class="panel-row row-toggle">
    <div class="panel-row-header"><span>${label}</span><span class="val" id="val-${id}">关</span></div>
    <input id="inp-${id}" type="checkbox" />
  </div>`;
}

function sectionShell(
  key: string,
  title: string,
  bodyHtml: string,
  expandId: string,
): string {
  return `<div class="section-block">
    <div class="section-header">
      <span class="section-title">${title}</span>
      <label>展开 <span id="val-${expandId}">展开</span>
        <input id="inp-${expandId}" type="checkbox" />
      </label>
    </div>
    <div class="section-body" id="sect-${key}">${bodyHtml}</div>
  </div>`;
}

function buildDom(): HTMLElement {
  const root = el('div');
  root.innerHTML = `
<div id="panel-trigger" title="连点三次打开控制面板">调试</div>
<aside id="control-panel" aria-hidden="true">
  <div id="panel-header">
    <span class="panel-title">控制面板 · SF6 训练</span>
    <label class="panel-header-dummy">
      <span>人偶格挡</span>
      <select id="sel-dummyMode" title="对手格挡策略">
        <option value="block_all">全部格挡</option>
        <option value="stand_block">仅站立格挡</option>
        <option value="crouch_block">仅蹲下格挡</option>
        <option value="none">不防（挨打）</option>
      </select>
    </label>
    <div class="panel-actions">
      <button type="button" id="btn-panel-hide">隐藏</button>
    </div>
  </div>
  <div id="panel-body">
    <nav id="panel-tabs"></nav>
    <div id="panel-content">
      <details class="panel-group" data-cat="存档" open>
        <summary>存档</summary>
        <p class="panel-hint">本地默认仅本机浏览器；Shipping 导出后放入 public/presets/shipping.json 可跨设备。数字框可左右拖动调参（Shift 精细，Ctrl 加速）。</p>
        <div class="panel-actions-col">
          <button type="button" class="btn-primary" id="btn-save-local">把当前参数存为本地默认</button>
          <button type="button" id="btn-reset-factory">恢复出厂默认</button>
          <button type="button" id="btn-export-shipping">一键导出 Shipping 预设 (shipping.json)</button>
          <button type="button" class="btn-danger" id="btn-clear-local">清除本机本地默认</button>
        </div>
        <div class="section-block" style="margin-top:10px">
          <div class="section-header"><span class="section-title">命名预设</span></div>
          <div class="section-body">
            <div class="panel-row">
              <div class="panel-row-header"><span>预设名称</span></div>
              <input id="inp-preset-name" type="text" placeholder="例如：贴身手感" />
            </div>
            <div class="panel-actions-row">
              <button type="button" id="btn-preset-save">保存当前</button>
              <button type="button" id="btn-preset-load">载入选中</button>
              <button type="button" id="btn-preset-delete">删除选中</button>
              <button type="button" id="btn-preset-export">导出 JSON</button>
              <button type="button" id="btn-preset-import">从文件导入</button>
            </div>
            <input id="inp-preset-file" type="file" accept="application/json,.json" style="display:none" />
            <div class="preset-list" id="preset-list"></div>
          </div>
        </div>
        <p class="panel-flash" id="panel-flash"></p>
      </details>

      <details class="panel-group" data-cat="模拟">
        <summary>模拟</summary>
        ${sectionShell(
          'sim',
          '【模拟】时钟与步进',
          `
          <div class="panel-actions-row">
            <button type="button" id="btn-toggle-pause">暂停 / 继续</button>
            <button type="button" id="btn-step-once">单帧步进</button>
          </div>
          ${rowNumber('logicFps', '逻辑帧率 (fps)', 30, 120, 1)}
          ${rowNumber('maxLogicStepsPerRaf', '每帧最大逻辑步', 1, 8, 1)}
          ${rowNumber('maxFrameTimeMs', '最大帧耗时 (ms)', 16, 250, 1)}
          <div class="ext-block">
            ${rowToggle('extendedSim', '显示扩展参数')}
            <div id="ext-sim" class="is-collapsed">
              <p class="panel-hint">扩展：通常保持默认即可。</p>
            </div>
          </div>
          `,
          'expandSim',
        )}
      </details>

      <details class="panel-group" data-cat="对局">
        <summary>对局</summary>
        ${sectionShell(
          'matchTools',
          '【对局】工具',
          `
          <p class="panel-hint">人偶格挡（全部 / 仅站立 / 仅蹲下）在面板<strong>顶栏</strong>，以及左侧「战斗」分页的防住一节。</p>
          ${rowNumber('p1Hp', 'P1 血量', 0, 10000, 1)}
          ${rowNumber('p2Hp', 'P2 血量', 0, 10000, 1)}
          ${rowNumber('driveBars', 'Drive 条数', 0, 6, 1)}
          <div class="panel-actions-row">
            <button type="button" id="btn-reset-match">重置对局</button>
          </div>
          <p class="panel-hint">快捷键 R：训练位重置（不经过本面板）。</p>
          `,
          'expandMatchTools',
        )}
      </details>

      <details class="panel-group" data-cat="输入">
        <summary>输入</summary>
        ${sectionShell(
          'inputBuffer',
          '【输入】缓冲与指令窗',
          `
          ${rowNumber('motionHistoryCapacity', '历史容量', 8, 64, 1)}
          ${rowNumber('actionBufferStandard', '标准预输入 (f)', 1, 15, 1)}
          ${rowNumber('actionBufferDash', 'Dash 预输入 (f)', 1, 15, 1)}
          ${rowNumber('motionStepGapMax', '指令步间隙 (f)', 1, 20, 1)}
          ${rowNumber('dashDirHoldMax', 'Dash 方向窗 (f)', 1, 16, 1)}
          ${rowNumber('dashNeutralMax', 'Dash 中性窗 (f)', 1, 16, 1)}
          ${rowToggle('enableActionBuffer', '启用 ActionBuffer')}
          ${rowToggle('showBuffer', '显示方向历史')}
          `,
          'expandInputBuffer',
        )}
      </details>

      <details class="panel-group" data-cat="战斗">
        <summary>战斗</summary>
        ${sectionShell(
          'cancelHitstop',
          '【战斗】取消与硬直',
          `
          ${rowToggle('enableCancel', '启用 Cancel')}
          ${rowToggle('enableSpecials', '启用必杀指令')}
          ${rowToggle('enableThrows', '启用投技指令')}
          ${rowNumber('hitstopFramesOnHit', 'Hitstop 命中 (f)', 0, 30, 1)}
          ${rowNumber('hitstopFramesOnBlock', 'Hitstop 防御 (f)', 0, 30, 1)}
          ${rowToggle('showCancelWindow', 'HUD 显示取消窗')}
          `,
          'expandCancelHitstop',
        )}
        ${sectionShell(
          'guardPush',
          '【战斗】防住 / 推挤 / 位移',
          `
          <div class="panel-row">
            <div class="panel-row-header"><span>人偶格挡</span></div>
            <select id="sel-dummyMode-combat" title="对手格挡策略">
              <option value="block_all">全部格挡</option>
              <option value="stand_block">仅站立格挡</option>
              <option value="crouch_block">仅蹲下格挡</option>
              <option value="none">不防（挨打）</option>
            </select>
          </div>
          <div class="panel-row">
            <div class="panel-row-header"><span>不防姿势</span></div>
            <select id="sel-dummyUnguardedStance" title="none 时站/蹲">
              <option value="stand">站立</option>
              <option value="crouch">蹲下</option>
            </select>
          </div>
          <div class="panel-row">
            <div class="panel-row-header"><span>Dummy 起身</span></div>
            <select id="sel-dummyWakeupStyle" title="倒地起身">
              <option value="normal">普通起</option>
              <option value="back">后跳起</option>
            </select>
          </div>
          ${rowNumber('hitstunOverride', '击中硬直覆盖 (-1=表)', -1, 60, 1)}
          ${rowNumber('knockdownFramesOverride', '倒地总帧覆盖 (-1=表)', -1, 180, 1)}
          ${rowNumber('knockdownDownHoldOverride', '躺地保持覆盖 (-1=表)', -1, 120, 1)}
          ${rowNumber('wakeupBackDxTotal', '后跳起位移', 0, 2, 0.05)}
          ${rowToggle('enableHitPush', '启用命中推开')}
          ${rowNumber('hitPushbackTotal', '命中推开 fallback', 0, 1.5, 0.01)}
          ${rowToggle('enablePushResolve', '启用推挤')}
          ${rowToggle('enableBlockPush', '启用防御推开')}
          ${rowNumber('blockPushbackTotal', '防御推开总量', 0, 1.5, 0.01)}
          ${rowNumber('blockPushEasePower', '防推 ease-out 幂', 1, 8, 0.5)}
          ${rowNumber('blockstunOverride', 'blockstun 覆盖 (-1=表)', -1, 40, 1)}
          ${rowNumber('damageScale', '伤害倍率', 0, 2, 0.05)}
          ${rowToggle('applySelfMovement', '启用攻击 Place 位移')}
          ${rowNumber('selfMovementScale', 'selfMovementScale', 0, 3, 0.05)}
          ${rowNumber('mmdkUnitScale', 'mmdkUnitScale', 0.001, 2, 0.001)}
          ${rowNumber('stageMinX', '舞台 minX', -10, 0, 0.1)}
          ${rowNumber('stageMaxX', '舞台 maxX', 0, 10, 0.1)}
          `,
          'expandGuardPush',
        )}
      </details>

      <details class="panel-group" data-cat="移动">
        <summary>移动</summary>
        ${sectionShell(
          'locomotion',
          '【移动】走 / 冲 / 跳',
          `
          ${rowNumber('walkSpeed', '前走速', 0.01, 0.2, 0.001)}
          ${rowNumber('walkBackSpeed', '后走速', 0.01, 0.2, 0.001)}
          ${rowNumber('walkFirstFrameScale', '走首帧比例', 0.05, 1, 0.05)}
          ${rowNumber('dashFrames', '前冲帧数', 1, 40, 1)}
          ${rowNumber('dashBackFrames', '后冲帧数', 1, 40, 1)}
          ${rowNumber('dashFrontHeavyPower', 'dash 前重指数', 0.5, 4, 0.05)}
          ${rowNumber('dashSpeed', '前冲均速 (总距/帧)', 0.02, 0.4, 0.001)}
          ${rowNumber('dashBackSpeed', '后冲速度', 0.02, 0.4, 0.001)}
          ${rowNumber('prejumpFrames', 'Prejump (f)', 1, 10, 1)}
          ${rowNumber('airFrames', '滞空 (f)', 5, 60, 1)}
          ${rowNumber('landingFrames', '落地硬直 (f)', 1, 15, 1)}
          ${rowNumber('neutralLandToRiseIdleRatio', '落地→蹲起(接待机)溶图起点比例', 0, 1, 0.01)}
          ${rowNumber('neutralLandToRiseTurnRatio', '落地→蹲起(接转身)溶图起点比例', 0, 1, 0.01)}
          ${rowNumber('neutralRiseToTurnDissolveRatio', '蹲起→转身溶图起点比例', 0, 1, 0.01)}
          ${rowNumber('jumpApex', '跳顶点高', 0.5, 4, 0.01)}
          ${rowNumber('jumpFwdDist', '前跳距', 0, 4, 0.01)}
          ${rowNumber('jumpBackDist', '后跳距', 0, 4, 0.01)}
          <div class="ext-block">
            ${rowToggle('extendedLoco', '显示扩展参数')}
            <div id="ext-loco">
              ${rowNumber('standToCrouchFrames', '站→蹲 过渡帧', 1, 120, 1)}
              ${rowNumber('crouchToStandFrames', '蹲→站 过渡帧', 1, 120, 1)}
              ${rowNumber('dashAnimFrames', '前冲动画帧', 1, 80, 1)}
              ${rowNumber('dashBackAnimFrames', '后冲动画帧', 1, 80, 1)}
              ${rowNumber('landingAnimFrames', '落地动画帧', 1, 60, 1)}
              ${rowNumber('jumpNeutralDist', '中跳距', 0, 4, 0.01)}
            </div>
          </div>
          <div class="panel-actions-row">
            <button type="button" id="btn-reload-movement">重载 ryu_movement.json</button>
          </div>
          `,
          'expandLocomotion',
        )}
      </details>

      <details class="panel-group" data-cat="渲染">
        <summary>渲染</summary>
        ${sectionShell(
          'renderBoxes',
          '【渲染】模型 / 框 / 舞台',
          `
          ${rowToggle('showHitboxes', '显示攻击框')}
          ${rowToggle('showHurtboxes', '显示受击框')}
          ${rowToggle('showPushboxes', '显示推挤框')}
          ${rowToggle('hurtPartColors', '受击框按 part 染色')}
          ${rowNumber('worldScale', '世界缩放', 0.01, 10, 0.01)}
          ${rowNumber('modelScale', '模型缩放', 0.01, 10, 0.01)}
          ${rowNumber('modelYOffset', '模型 Y 偏移', -2, 2, 0.01)}
          ${rowNumber('stageFitWidth', '拟合宽度', 0, 40, 0.1)}
          ${rowNumber('stageOriginX', '舞台原点 X', -10, 10, 0.01)}
          ${rowNumber('stageOriginZ', '舞台原点 Z', -10, 10, 0.01)}
          ${rowToggle('showFallbackGround', '显示垫底地面')}
          ${rowToggle('showDebugGrid', '显示调试网格')}
          ${rowToggle('showAxes', '显示坐标轴')}
          ${rowNumber('timeScaleAnim', '动画时间倍率', 0, 2, 0.05)}
          `,
          'expandRenderBoxes',
        )}
      </details>

      <details class="panel-group" data-cat="摄影机">
        <summary>摄影机</summary>
        ${sectionShell(
          'camera',
          '【摄影机】平时对打镜头',
          `
          ${rowNumber('cameraZ', '相机距离 Z', 1, 30, 0.1)}
          ${rowNumber('cameraY', '相机高度 Y', 0, 5, 0.05)}
          ${rowNumber('cameraLookY', '看点高度', 0, 3, 0.05)}
          ${rowNumber('cameraFov', '视野 FOV', 20, 70, 0.5)}
          ${rowToggle('cameraZoomEnabled', '开启间距变焦')}
          ${rowNumber('cameraZoomSepK', '变焦系数', 0, 3, 0.01)}
          ${rowNumber('cameraZMax', '变焦最远', 1, 40, 0.1)}
          ${rowNumber('cameraNdcPad', '画面边距', 0, 0.3, 0.01)}
          ${rowNumber('cameraLerp', '镜头跟随平滑', 0, 1, 0.01)}
          ${rowNumber('cameraFollowDeadzone', '镜头跟随死区', 0, 2, 0.01)}
          ${rowNumber('cameraNear', '近裁', 0.01, 1, 0.01)}
          ${rowNumber('cameraFar', '远裁', 50, 2000, 10)}
          `,
          'expandCamera',
        )}
      </details>

      <details class="panel-group" data-cat="打光">
        <summary>打光</summary>
        ${sectionShell(
          'lighting',
          '【打光】全局与各灯卡片',
          `
          ${rowToggle('lightHelpersVisible', '显示灯光辅助')}
          ${rowToggle('lightOrbitMode', '摆灯自由视角')}
          ${rowNumber('lightOrbitPipX', '预览窗左边距 (px)', 0, 800, 1)}
          ${rowNumber('lightOrbitPipY', '预览窗底边距 (px)', 0, 800, 1)}
          ${rowNumber('lightOrbitPipWidth', '预览窗宽度 (px)', 120, 960, 1)}
          ${rowNumber('lightOrbitPipHeight', '预览窗高度 (px)', 80, 540, 1)}
          ${rowToggle('shadowMapEnabled', '启用阴影总开关')}
          ${rowNumber('shadowMapSize', '阴影贴图边长', 256, 4096, 256)}
          ${rowNumber('shadowCameraExtent', '阴影范围 extent', 5, 80, 0.5)}
          ${rowNumber('shadowCameraNear', '阴影近裁', 0.01, 10, 0.01)}
          ${rowNumber('shadowCameraFar', '阴影远裁', 10, 200, 1)}
          ${rowNumber('shadowBias', '阴影 bias', -0.01, 0.01, 0.0001)}
          ${rowNumber('shadowNormalBias', '阴影 normalBias', 0, 0.2, 0.001)}
          ${rowNumber('shadowRadius', '阴影 radius', 0, 8, 0.1)}
          <div class="panel-row light-color-row">
            <div class="panel-row-header"><span>背景色</span></div>
            <input id="inp-bgColorPicker" type="color" title="背景色" />
          </div>
          <div class="panel-row light-color-row">
            <div class="panel-row-header"><span>雾色</span></div>
            <input id="inp-fogColorPicker" type="color" title="雾色" />
          </div>
          ${rowNumber('fogNear', '雾近', 1, 200, 1)}
          ${rowNumber('fogFar', '雾远', 10, 400, 1)}
          ${rowNumber('lightMaxCount', '灯数量上限', 5, 30, 1)}
          <div class="panel-row">
            <div class="panel-row-header"><span>Gizmo 模式</span></div>
            <select id="sel-lightGizmoMode">
              <option value="position">位置</option>
              <option value="target">目标点</option>
            </select>
          </div>
          <div class="light-toolbar">
            <button type="button" id="btn-lightAddDir">+ 方向光</button>
            <button type="button" id="btn-lightAddPoint">+ 点光</button>
            <button type="button" id="btn-lightAddSpot">+ 聚光</button>
            <button type="button" id="btn-lightAddAmbient">+ 环境光</button>
            <button type="button" id="btn-lightAddHemi">+ 半球光</button>
            <button type="button" id="btn-lightPaste">粘贴灯</button>
            <button type="button" id="btn-lightCopyP1FollowToP2" title="将所有跟随 P1 的灯按相同本地偏移平行复制为跟随 P2">复制 P1跟随光 → P2</button>
          </div>
          <div id="light-cards" class="light-cards"></div>
          `,
          'expandLighting',
        )}
      </details>

      <details class="panel-group" data-cat="动画">
        <summary>动画</summary>
        ${sectionShell(
          'animDrive',
          '【动画】驱动与溶图',
          `
          ${rowToggle('scrubFromLogic', '逻辑帧驱动动画')}
          <div class="panel-row">
            <div class="panel-row-header"><span>scrubMode</span></div>
            <select id="sel-scrubMode">
              <option value="uniform">uniform</option>
              <option value="truncate">truncate</option>
            </select>
          </div>
          <div class="panel-row">
            <div class="panel-row-header"><span>plantMode</span></div>
            <select id="sel-plantMode">
              <option value="consensus">consensus（信动画）</option>
              <option value="legacy">legacy（每帧追地）</option>
            </select>
          </div>
          ${rowToggle('footPlantEnabled', '出招支撑脚 XZ')}
          ${rowToggle('rootPoseLockAttack', 'rootPoseLockAttack')}
          ${rowNumber('locoBlendSec', 'loco 溶图 (s)', 0, 0.35, 0.01)}
          ${rowNumber('residualToMoveBlendSec', 'residual→移动溶图 (s)', 0, 0.35, 0.01)}
          ${rowNumber('residualToAttackBlendSec', 'residual→攻溶图 (s)', 0, 0.2, 0.01)}
          ${rowNumber('residualToStanceBlendSec', 'residual→站蹲 (s)', 0, 0.35, 0.01)}
          <div class="panel-row">
            <div class="panel-row-header"><span>溶图旧层模式</span></div>
            <select id="sel-crossfadeAdvanceMode">
              <option value="dual">dual（双推进）</option>
              <option value="freeze">freeze（冻结）</option>
            </select>
          </div>
          ${rowNumber('plantSlewPerSec', 'plantSlew (仅 legacy)', 0.05, 2, 0.01)}
          ${rowToggle('showFootDebug', '显示脚部调试')}
          `,
          'expandAnimDrive',
        )}
        ${sectionShell(
          'animTest',
          '【动画】测试浏览器',
          `
          ${rowToggle('animPreview', '预览模式')}
          <div class="panel-row">
            <div class="panel-row-header"><span>分类</span></div>
            <select id="sel-anim-category"></select>
          </div>
          <div class="panel-row">
            <div class="panel-row-header"><span>动作包</span></div>
            <select id="sel-anim-pack"></select>
          </div>
          <div class="panel-row">
            <div class="panel-row-header"><span>动画</span></div>
            <select id="sel-anim-clip"></select>
          </div>
          ${rowToggle('animReinstallMesh', '整模重载(慢)')}
          <div class="panel-actions-row">
            <button type="button" id="btn-anim-play">加载并循环</button>
            <button type="button" id="btn-anim-exit">退出预览</button>
            <button type="button" id="btn-anim-reload">刷新列表</button>
          </div>
          <p class="panel-hint" id="anim-test-status">idle</p>
          `,
          'expandAnimTest',
        )}
      </details>

      <details class="panel-group" data-cat="反馈">
        <summary>反馈</summary>
        ${sectionShell(
          'commandProbe',
          '【调试】指令与装配探针',
          `
          <div class="probe-grid" id="probe-grid"></div>
          <div class="panel-actions-row" style="margin-top:8px">
            <button type="button" id="btn-reload-catalog">重载 Catalog</button>
            <button type="button" id="btn-list-catalog">打印 Catalog IDs</button>
            <button type="button" id="btn-reload-stance">重载姿态框</button>
            <button type="button" id="btn-clear-action-boxes">强制关动作层</button>
          </div>
          ${rowToggle('logCommandsToConsole', '出招打 Console')}
          `,
          'expandCommandProbe',
        )}
      </details>

      <details class="panel-group" data-cat="招式">
        <summary>招式</summary>
        ${sectionShell(
          'moveEdit',
          '【招式】5LP 快速编辑',
          `
          ${rowNumber('mv-startup', '起手帧', 0, 60, 1)}
          ${rowNumber('mv-active', '判定帧', 0, 60, 1)}
          ${rowNumber('mv-recovery', '硬直帧', 0, 60, 1)}
          ${rowNumber('mv-damage', '伤害', 0, 5000, 1)}
          ${rowNumber('mv-hitstun', '击中硬直', 0, 60, 1)}
          ${rowNumber('mv-blockstun', '防御硬直', 0, 60, 1)}
          ${rowNumber('mv-hitBoxX', '攻击框 X', -5, 5, 0.01)}
          ${rowNumber('mv-hitBoxY', '攻击框 Y', -1, 4, 0.01)}
          ${rowNumber('mv-hitBoxW', '攻击框 宽', 0.05, 5, 0.01)}
          ${rowNumber('mv-hitBoxH', '攻击框 高', 0.05, 5, 0.01)}
          ${rowNumber('mv-hurtBoxX', '受击框 X', -5, 5, 0.01)}
          ${rowNumber('mv-hurtBoxY', '受击框 Y', -1, 4, 0.01)}
          ${rowNumber('mv-hurtBoxW', '受击框 宽', 0.05, 5, 0.01)}
          ${rowNumber('mv-hurtBoxH', '受击框 高', 0.05, 5, 0.01)}
          <p class="panel-hint">审核：<span id="mv-review">—</span></p>
          <div class="panel-actions-row">
            <button type="button" id="btn-reload-move-json">重载 JSON</button>
          </div>
          `,
          'expandMoveEdit',
        )}
      </details>
    </div>
  </div>
</aside>`;
  // Flatten: append children to body
  const wrap = el('div', 'control-panel-host');
  while (root.firstChild) wrap.appendChild(root.firstChild);
  document.body.appendChild(wrap);
  return wrap;
}

const SIM_PATHS: Array<{ id: string; path: keyof RuntimeConfig | string }> = [
  { id: 'logicFps', path: 'logicFps' },
  { id: 'maxLogicStepsPerRaf', path: 'maxLogicStepsPerRaf' },
  { id: 'maxFrameTimeMs', path: 'maxFrameTimeMs' },
  { id: 'motionHistoryCapacity', path: 'motionHistoryCapacity' },
  { id: 'actionBufferStandard', path: 'actionBufferStandard' },
  { id: 'actionBufferDash', path: 'actionBufferDash' },
  { id: 'motionStepGapMax', path: 'motionStepGapMax' },
  { id: 'dashDirHoldMax', path: 'dashDirHoldMax' },
  { id: 'dashNeutralMax', path: 'dashNeutralMax' },
  { id: 'enableActionBuffer', path: 'enableActionBuffer' },
  { id: 'showBuffer', path: 'showBuffer' },
  { id: 'enableCancel', path: 'enableCancel' },
  { id: 'enableSpecials', path: 'enableSpecials' },
  { id: 'enableThrows', path: 'enableThrows' },
  { id: 'hitstopFramesOnHit', path: 'hitstopFramesOnHit' },
  { id: 'hitstopFramesOnBlock', path: 'hitstopFramesOnBlock' },
  { id: 'showCancelWindow', path: 'showCancelWindow' },
  { id: 'enablePushResolve', path: 'enablePushResolve' },
  { id: 'enableBlockPush', path: 'enableBlockPush' },
  { id: 'blockPushbackTotal', path: 'blockPushbackTotal' },
  { id: 'blockPushEasePower', path: 'blockPushEasePower' },
  { id: 'blockstunOverride', path: 'blockstunOverride' },
  { id: 'hitstunOverride', path: 'hitstunOverride' },
  { id: 'knockdownFramesOverride', path: 'knockdownFramesOverride' },
  { id: 'knockdownDownHoldOverride', path: 'knockdownDownHoldOverride' },
  { id: 'wakeupBackDxTotal', path: 'wakeupBackDxTotal' },
  { id: 'enableHitPush', path: 'enableHitPush' },
  { id: 'hitPushbackTotal', path: 'hitPushbackTotal' },
  { id: 'damageScale', path: 'damageScale' },
  { id: 'applySelfMovement', path: 'applySelfMovement' },
  { id: 'selfMovementScale', path: 'selfMovementScale' },
  { id: 'mmdkUnitScale', path: 'mmdkUnitScale' },
  { id: 'stageMinX', path: 'stageMinX' },
  { id: 'stageMaxX', path: 'stageMaxX' },
  { id: 'walkSpeed', path: 'walkSpeed' },
  { id: 'walkBackSpeed', path: 'walkBackSpeed' },
  { id: 'walkFirstFrameScale', path: 'walkFirstFrameScale' },
  { id: 'dashFrames', path: 'dashFrames' },
  { id: 'dashBackFrames', path: 'dashBackFrames' },
  { id: 'dashFrontHeavyPower', path: 'dashFrontHeavyPower' },
  { id: 'dashSpeed', path: 'dashSpeed' },
  { id: 'dashBackSpeed', path: 'dashBackSpeed' },
  { id: 'prejumpFrames', path: 'prejumpFrames' },
  { id: 'airFrames', path: 'airFrames' },
  { id: 'landingFrames', path: 'landingFrames' },
  { id: 'neutralLandToRiseIdleRatio', path: 'neutralLandToRiseIdleRatio' },
  { id: 'neutralLandToRiseTurnRatio', path: 'neutralLandToRiseTurnRatio' },
  { id: 'neutralRiseToTurnDissolveRatio', path: 'neutralRiseToTurnDissolveRatio' },
  { id: 'jumpApex', path: 'jumpApex' },
  { id: 'jumpFwdDist', path: 'jumpFwdDist' },
  { id: 'jumpBackDist', path: 'jumpBackDist' },
  { id: 'standToCrouchFrames', path: 'standToCrouchFrames' },
  { id: 'crouchToStandFrames', path: 'crouchToStandFrames' },
  { id: 'dashAnimFrames', path: 'dashAnimFrames' },
  { id: 'dashBackAnimFrames', path: 'dashBackAnimFrames' },
  { id: 'landingAnimFrames', path: 'landingAnimFrames' },
  { id: 'jumpNeutralDist', path: 'jumpNeutralDist' },
  { id: 'showHitboxes', path: 'showHitboxes' },
  { id: 'showHurtboxes', path: 'showHurtboxes' },
  { id: 'showPushboxes', path: 'showPushboxes' },
  { id: 'hurtPartColors', path: 'hurtPartColors' },
  { id: 'worldScale', path: 'worldScale' },
  { id: 'modelScale', path: 'modelScale' },
  { id: 'modelYOffset', path: 'modelYOffset' },
  { id: 'cameraZ', path: 'cameraZ' },
  { id: 'cameraY', path: 'cameraY' },
  { id: 'cameraLookY', path: 'cameraLookY' },
  { id: 'cameraFov', path: 'cameraFov' },
  { id: 'cameraZoomEnabled', path: 'cameraZoomEnabled' },
  { id: 'cameraZoomSepK', path: 'cameraZoomSepK' },
  { id: 'cameraZMax', path: 'cameraZMax' },
  { id: 'cameraNdcPad', path: 'cameraNdcPad' },
  { id: 'cameraLerp', path: 'cameraLerp' },
  { id: 'cameraFollowDeadzone', path: 'cameraFollowDeadzone' },
  { id: 'cameraNear', path: 'cameraNear' },
  { id: 'cameraFar', path: 'cameraFar' },
  { id: 'stageFitWidth', path: 'stageFitWidth' },
  { id: 'stageOriginX', path: 'stageOriginX' },
  { id: 'stageOriginZ', path: 'stageOriginZ' },
  { id: 'showFallbackGround', path: 'showFallbackGround' },
  { id: 'showDebugGrid', path: 'showDebugGrid' },
  { id: 'showAxes', path: 'showAxes' },
  { id: 'lightHelpersVisible', path: 'lightHelpersVisible' },
  { id: 'lightOrbitMode', path: 'lightOrbitMode' },
  { id: 'lightOrbitPipX', path: 'lightOrbitPipX' },
  { id: 'lightOrbitPipY', path: 'lightOrbitPipY' },
  { id: 'lightOrbitPipWidth', path: 'lightOrbitPipWidth' },
  { id: 'lightOrbitPipHeight', path: 'lightOrbitPipHeight' },
  { id: 'shadowMapEnabled', path: 'shadowMapEnabled' },
  { id: 'shadowMapSize', path: 'shadowMapSize' },
  { id: 'shadowCameraExtent', path: 'shadowCameraExtent' },
  { id: 'shadowCameraNear', path: 'shadowCameraNear' },
  { id: 'shadowCameraFar', path: 'shadowCameraFar' },
  { id: 'shadowBias', path: 'shadowBias' },
  { id: 'shadowNormalBias', path: 'shadowNormalBias' },
  { id: 'shadowRadius', path: 'shadowRadius' },
  { id: 'fogNear', path: 'fogNear' },
  { id: 'fogFar', path: 'fogFar' },
  { id: 'lightMaxCount', path: 'lightMaxCount' },
  { id: 'timeScaleAnim', path: 'timeScaleAnim' },
  { id: 'scrubFromLogic', path: 'scrubFromLogic' },
  { id: 'footPlantEnabled', path: 'footPlantEnabled' },
  { id: 'rootPoseLockAttack', path: 'rootPoseLockAttack' },
  { id: 'locoBlendSec', path: 'locoBlendSec' },
  { id: 'residualToMoveBlendSec', path: 'residualToMoveBlendSec' },
  { id: 'residualToAttackBlendSec', path: 'residualToAttackBlendSec' },
  { id: 'residualToStanceBlendSec', path: 'residualToStanceBlendSec' },
  { id: 'plantSlewPerSec', path: 'plantSlewPerSec' },
  { id: 'showFootDebug', path: 'showFootDebug' },
];

const TOGGLE_IDS = new Set([
  'enableActionBuffer',
  'showBuffer',
  'enableCancel',
  'enableSpecials',
  'enableThrows',
  'showCancelWindow',
  'enablePushResolve',
  'enableBlockPush',
  'applySelfMovement',
  'showHitboxes',
  'showHurtboxes',
  'showPushboxes',
  'hurtPartColors',
  'scrubFromLogic',
  'footPlantEnabled',
  'rootPoseLockAttack',
  'showFootDebug',
  'cameraZoomEnabled',
  'showFallbackGround',
  'showDebugGrid',
  'showAxes',
  'lightHelpersVisible',
  'lightOrbitMode',
  'shadowMapEnabled',
  'lightEnabled',
  'lightCastShadow',
]);

export function setupControlPanel(
  match: MatchSim,
  clock: FrameClock,
  hooks: ControlPanelHooks,
  opts?: { onChange?: OnChange; lightEdit?: LightEditPanelHooks },
): ControlPanelApi {
  const host = buildDom();
  const panel = byId<HTMLElement>(host, 'control-panel');
  const trigger = byId<HTMLElement>(host, 'panel-trigger');
  const flashEl = byId<HTMLElement>(host, 'panel-flash');
  const syncers: Array<() => void> = [];
  const userOnChange = opts?.onChange;
  const lightEditHooks = opts?.lightEdit;

  const setFlash = (msg: string) => {
    flashEl.textContent = msg;
    if (msg) {
      window.setTimeout(() => {
        if (flashEl.textContent === msg) flashEl.textContent = '';
      }, 2800);
    }
  };

  const PURE_VIEW_KEYS = new Set([
    'cameraZ',
    'cameraY',
    'cameraLookY',
    'cameraFov',
    'cameraZoomEnabled',
    'cameraZoomSepK',
    'cameraZMax',
    'cameraNdcPad',
    'cameraLerp',
    'cameraFollowDeadzone',
    'cameraNear',
    'cameraFar',
    'stageFitWidth',
    'stageOriginX',
    'stageOriginZ',
    'showFallbackGround',
    'showDebugGrid',
    'showAxes',
    'lights',
    'lightSelectedId',
    'lightHelpersVisible',
    'lightOrbitMode',
    'lightOrbitPipX',
    'lightOrbitPipY',
    'lightOrbitPipWidth',
    'lightOrbitPipHeight',
    'lightMaxCount',
    'lightUseDynamicLighting',
    'shadowMapEnabled',
    'shadowMapSize',
    'shadowCameraExtent',
    'shadowCameraNear',
    'shadowCameraFar',
    'shadowBias',
    'shadowNormalBias',
    'shadowRadius',
    'fogColor',
    'fogNear',
    'fogFar',
    'bgColor',
    'modelScale',
    'modelYOffset',
    'worldScale',
    'timeScaleAnim',
    'showHitboxes',
    'showHurtboxes',
    'showPushboxes',
    'hurtPartColors',
    'showBuffer',
    'showCancelWindow',
    'showFootDebug',
    'scrubFromLogic',
    'scrubMode',
    'plantMode',
    'footPlantEnabled',
    'rootPoseLockAttack',
    'locoBlendSec',
    'residualToMoveBlendSec',
    'residualToAttackBlendSec',
    'residualToStanceBlendSec',
    'crossfadeAdvanceMode',
    'plantSlewPerSec',
  ]);

  const notify: OnChange = (key, value, config) => {
    if (
      key === '*' ||
      key === 'logicFps' ||
      key === 'maxLogicStepsPerRaf' ||
      key === 'maxFrameTimeMs'
    ) {
      clock.reconfigure(CONFIG.logicFps, CONFIG.maxLogicStepsPerRaf, CONFIG.maxFrameTimeMs);
    }
    if (key === 'motionHistoryCapacity') {
      CONFIG.bufferFrames = CONFIG.motionHistoryCapacity;
    }
    if (key === 'dummyGuardPolicy') {
      match.dummy.setGuardPolicy(CONFIG.dummyGuardPolicy);
    }
    const isUiOnly =
      key.startsWith('expandedSections.') || (key !== '*' && PURE_VIEW_KEYS.has(key));
    if (!isUiOnly) {
      try {
        syncMatchOpts(match, CONFIG);
      } catch {
        /* ignore */
      }
    }
    userOnChange?.(key, value, config);
  };

  const ctx: BindCtx = { onChange: notify, syncers, root: host };

  // --- Tabs ---
  const groups = [...host.querySelectorAll<HTMLDetailsElement>('.panel-group')];
  const tabsNav = byId<HTMLElement>(host, 'panel-tabs');
  groups.forEach((g, i) => {
    const name = g.dataset.cat || g.querySelector('summary')?.textContent || `分类${i}`;
    const tab = el('button', 'panel-tab', name);
    tab.type = 'button';
    tab.addEventListener('click', () => {
      groups.forEach((gg) => {
        gg.classList.remove('is-active');
        gg.open = false;
      });
      tabsNav.querySelectorAll('.panel-tab').forEach((t) => t.classList.remove('is-active'));
      g.classList.add('is-active');
      g.open = true;
      tab.classList.add('is-active');
    });
    tabsNav.appendChild(tab);
    if (i === 0) {
      g.classList.add('is-active');
      g.open = true;
      tab.classList.add('is-active');
    }
  });

  // --- Section expands ---
  const sectionMap: Array<[string, keyof ExpandedSections, string]> = [
    ['expandSim', 'sim', 'sect-sim'],
    ['expandMatchTools', 'matchTools', 'sect-matchTools'],
    ['expandInputBuffer', 'inputBuffer', 'sect-inputBuffer'],
    ['expandCancelHitstop', 'cancelHitstop', 'sect-cancelHitstop'],
    ['expandGuardPush', 'guardPush', 'sect-guardPush'],
    ['expandLocomotion', 'locomotion', 'sect-locomotion'],
    ['expandRenderBoxes', 'renderBoxes', 'sect-renderBoxes'],
    ['expandCamera', 'camera', 'sect-camera'],
    ['expandLighting', 'lighting', 'sect-lighting'],
    ['expandAnimDrive', 'animDrive', 'sect-animDrive'],
    ['expandAnimTest', 'animTest', 'sect-animTest'],
    ['expandCommandProbe', 'commandProbe', 'sect-commandProbe'],
    ['expandMoveEdit', 'moveEdit', 'sect-moveEdit'],
  ];
  for (const [expandId, key, bodyId] of sectionMap) {
    bindSectionExpand(ctx, `inp-${expandId}`, `val-${expandId}`, key, bodyId);
  }

  // Extended folds (not in CONFIG expandedSections keys for loco/sim — use dedicated toggles)
  const bindExt = (toggleId: string, boxId: string, sectionKey: keyof ExpandedSections) => {
    const input = byId<HTMLInputElement>(host, `inp-${toggleId}`);
    const box = byId<HTMLElement>(host, boxId);
    const path = `expandedSections.${sectionKey}`;
    const sync = () => {
      const v = Boolean(getPath(CONFIG, path));
      input.checked = v;
      box.style.display = v ? '' : 'none';
    };
    input.addEventListener('change', () => {
      setPath(CONFIG as unknown as Record<string, unknown>, path, input.checked);
      box.style.display = input.checked ? '' : 'none';
      notify(path, input.checked, CONFIG);
    });
    syncers.push(sync);
    sync();
  };
  bindExt('extendedSim', 'ext-sim', 'extendedSim');
  bindExt('extendedLoco', 'ext-loco', 'extendedLoco');

  // Config fields
  for (const { id, path } of SIM_PATHS) {
    if (TOGGLE_IDS.has(id)) {
      bindToggle(ctx, `inp-${id}`, path, ['关', '开'], `val-${id}`);
    } else {
      bindNumber(ctx, `inp-${id}`, path, `val-${id}`);
    }
  }
  bindSelect(ctx, 'sel-scrubMode', 'scrubMode');
  bindSelect(ctx, 'sel-plantMode', 'plantMode');
  bindSelect(ctx, 'sel-crossfadeAdvanceMode', 'crossfadeAdvanceMode');

  // --- Lights: accordion cards (all lights visible) ---
  const TYPE_LABEL: Record<LightType, string> = {
    ambient: '环境光',
    hemisphere: '半球光',
    directional: '方向光',
    point: '点光',
    spot: '聚光',
  };

  const hexToColorInput = (n: number): string =>
    `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  const colorInputToHex = (s: string): number => {
    const t = s.replace('#', '');
    const v = Number.parseInt(t, 16);
    return Number.isFinite(v) ? v & 0xffffff : 0xffffff;
  };

  let lightClipboard: LightDesc | null = null;
  /** Remember which cards were open across rebuilds. */
  const lightCardOpen = new Map<string, boolean>();
  const lightCardsHost = byId<HTMLElement>(host, 'light-cards');
  const gizmoModeSel = byId<HTMLSelectElement>(host, 'sel-lightGizmoMode');
  const bgColorPicker = byId<HTMLInputElement>(host, 'inp-bgColorPicker');
  const fogColorPicker = byId<HTMLInputElement>(host, 'inp-fogColorPicker');

  const findLight = (id: string) => CONFIG.lights.find((l) => l.id === id);

  const followOriginOf = (who: 'p1' | 'p2'): FighterFollowOrigin => {
    if (hooks.getLightFollowOrigin) return hooks.getLightFollowOrigin(who);
    const f = who === 'p1' ? match.p1 : match.p2;
    const view = who === 'p1' ? hooks.p1View : hooks.p2View;
    if (view) {
      return { x: f.x * CONFIG.worldScale, y: view.getLightFollowAnchorY() };
    }
    return fighterFollowOriginFromLogic(
      f.x,
      f.y,
      CONFIG.worldScale,
      CONFIG.modelYOffset,
    );
  };

  const cloneLightDesc = (l: LightDesc, opts?: { newId?: boolean; nameSuffix?: string }): LightDesc => ({
    ...l,
    id: opts?.newId ? newLightId(l.type) : l.id,
    name: opts?.nameSuffix ? `${l.name}${opts.nameSuffix}` : l.name,
    position: { ...l.position },
    target: { ...l.target },
    castShadow: false,
    follow: lightSupportsFollow(l.type) ? (l.follow ?? 'none') : 'none',
    followOffsetPosX: l.followOffsetPosX,
    followOffsetTargetX: l.followOffsetTargetX,
    followOffsetPosY: l.followOffsetPosY,
    followOffsetTargetY: l.followOffsetTargetY,
    shadowOnly: l.type === 'directional' ? !!l.shadowOnly : undefined,
  });

  /** Panel edits local coords directly when following — only sync legacy offset mirrors. */
  const syncFollowLocalsFor = (ids: Iterable<string>) => {
    const want = new Set(ids);
    for (const l of CONFIG.lights) {
      if (!want.has(l.id)) continue;
      if (!isLightFollowing(l)) continue;
      syncLegacyFollowOffsets(l);
    }
  };

  /**
   * @param syncFollowIds - follow lights whose panel local edits need legacy offset sync.
   *   Default empty: do NOT touch siblings on dup/add.
   */
  const emitLights = (
    rebuild: boolean,
    syncFollowIds: string[] = [],
  ) => {
    if (syncFollowIds.length > 0) syncFollowLocalsFor(syncFollowIds);
    // Drop accidental duplicate config ids (keep first).
    const seen = new Set<string>();
    CONFIG.lights = CONFIG.lights.filter((l) => {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });
    CONFIG.lights = enforceLightRules(CONFIG.lights, CONFIG.lightMaxCount);
    if (!CONFIG.lights.some((l) => l.id === CONFIG.lightSelectedId)) {
      CONFIG.lightSelectedId = CONFIG.lights[0]?.id ?? '';
    }
    notify('lights', CONFIG.lights, CONFIG);
    lightEditHooks?.reattach();
    if (rebuild) renderLightCards();
    else updateLightCardChrome();
  };

  const selectLight = (id: string) => {
    if (CONFIG.lightSelectedId === id) return;
    CONFIG.lightSelectedId = id;
    notify('lightSelectedId', id, CONFIG);
    lightEditHooks?.reattach();
    updateLightCardChrome();
  };

  const setFieldIfIdle = (
    card: HTMLElement,
    key: string,
    value: number,
  ) => {
    const inp = card.querySelector<HTMLInputElement>(
      `input[data-light-field="${key}"]`,
    );
    if (!inp) return;
    if (document.activeElement === inp) return;
    const s = String(value);
    if (inp.value !== s) inp.value = s;
  };

  /** Push CONFIG → open card fields (used after gizmo drag). */
  const updateLightCardChrome = () => {
    lightCardsHost.querySelectorAll<HTMLElement>('.light-card').forEach((card) => {
      const id = card.dataset.lightId ?? '';
      card.classList.toggle('is-selected', id === CONFIG.lightSelectedId);
      const l = findLight(id);
      if (!l) return;
      const sw = card.querySelector<HTMLElement>('.light-card-swatch');
      const title = card.querySelector<HTMLElement>('.light-card-title');
      if (sw) sw.style.background = hexToColorInput(l.color);
      if (title && document.activeElement?.closest(`[data-light-id="${id}"]`) == null) {
        title.textContent = l.name;
      }
      const colorInp = card.querySelector<HTMLInputElement>('input[type="color"]');
      // First color input is light color; ground is second if present.
      const colorInputs = card.querySelectorAll<HTMLInputElement>('input[type="color"]');
      if (colorInputs[0] && document.activeElement !== colorInputs[0]) {
        colorInputs[0].value = hexToColorInput(l.color);
      }
      if (l.type === 'hemisphere' && colorInputs[1] && document.activeElement !== colorInputs[1]) {
        colorInputs[1].value = hexToColorInput(l.groundColor ?? 0x444444);
      }
      void colorInp;
      setFieldIfIdle(card, 'intensity', l.intensity);
      setFieldIfIdle(card, 'posX', l.position.x);
      setFieldIfIdle(card, 'posY', l.position.y);
      setFieldIfIdle(card, 'posZ', l.position.z);
      setFieldIfIdle(card, 'tgtX', l.target.x);
      setFieldIfIdle(card, 'tgtY', l.target.y);
      setFieldIfIdle(card, 'tgtZ', l.target.z);
      const followSel = card.querySelector<HTMLSelectElement>(
        'select[data-light-field="follow"]',
      );
      if (followSel && document.activeElement !== followSel) {
        followSel.value =
          l.follow === 'p1' || l.follow === 'p2' ? l.follow : 'none';
      }
      setFieldIfIdle(card, 'distance', l.distance ?? 0);
      setFieldIfIdle(card, 'decay', l.decay ?? 2);
      setFieldIfIdle(card, 'angle', l.angle ?? Math.PI / 6);
      setFieldIfIdle(card, 'penumbra', l.penumbra ?? 0.2);
    });
  };

  const fieldNum = (
    label: string,
    value: number,
    step: string,
    fieldKey: string,
    onInput: (v: number) => void,
    opts?: { min?: number; max?: number; recaptureId?: string },
  ): HTMLLabelElement => {
    const lab = el('label', 'light-field');
    lab.appendChild(document.createTextNode(label));
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = step;
    if (opts?.min != null) inp.min = String(opts.min);
    if (opts?.max != null) inp.max = String(opts.max);
    inp.value = String(value);
    inp.dataset.lightField = fieldKey;
    inp.addEventListener('input', () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      onInput(v);
      emitLights(
        false,
        opts?.recaptureId ? [opts.recaptureId] : [],
      );
    });
    // Cards are built after attachDragScrubAll(host); bind per-input.
    attachDragScrub(inp);
    lab.appendChild(inp);
    return lab;
  };

  const fieldColor = (
    label: string,
    value: number,
    onInput: (v: number) => void,
  ): HTMLDivElement => {
    const row = el('div', 'panel-row light-color-row');
    const head = el('div', 'panel-row-header');
    head.appendChild(el('span', undefined, label));
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = hexToColorInput(value);
    inp.title = label;
    inp.addEventListener('input', () => {
      onInput(colorInputToHex(inp.value));
      emitLights(false);
    });
    row.appendChild(head);
    row.appendChild(inp);
    return row;
  };

  const buildLightCard = (l: LightDesc): HTMLDetailsElement => {
    const card = document.createElement('details');
    card.className = 'light-card';
    card.dataset.lightId = l.id;
    if (lightCardOpen.get(l.id) ?? l.id === CONFIG.lightSelectedId) {
      card.open = true;
    }
    if (l.id === CONFIG.lightSelectedId) card.classList.add('is-selected');

    const summary = document.createElement('summary');
    const swatch = el('span', 'light-card-swatch');
    swatch.style.background = hexToColorInput(l.color);
    const title = el('span', 'light-card-title', l.name);
    const typeEl = el('span', 'light-card-type', TYPE_LABEL[l.type] ?? l.type);
    summary.append(swatch, title, typeEl);
    summary.addEventListener('click', () => {
      selectLight(l.id);
    });
    card.addEventListener('toggle', () => {
      lightCardOpen.set(l.id, card.open);
      if (card.open) {
        selectLight(l.id);
        // Keep expanded body in the panel scrollport (avoid clipped lower fields).
        requestAnimationFrame(() => {
          card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      }
    });

    const body = el('div', 'light-card-body');

    const nameRow = el('div', 'panel-row');
    const nameHead = el('div', 'panel-row-header');
    nameHead.appendChild(el('span', undefined, '名称'));
    nameRow.appendChild(nameHead);
    const nameInp = document.createElement('input');
    nameInp.type = 'text';
    nameInp.value = l.name;
    nameInp.addEventListener('change', () => {
      const cur = findLight(l.id);
      if (!cur) return;
      cur.name = nameInp.value.trim() || cur.id;
      title.textContent = cur.name;
      emitLights(false);
    });
    nameRow.appendChild(nameInp);
    body.appendChild(nameRow);

    const enRow = el('label', 'light-inline-toggle');
    const enCb = document.createElement('input');
    enCb.type = 'checkbox';
    enCb.checked = l.enabled;
    enCb.addEventListener('change', () => {
      const cur = findLight(l.id);
      if (!cur) return;
      cur.enabled = enCb.checked;
      emitLights(false);
    });
    enRow.append(enCb, document.createTextNode('启用'));
    body.appendChild(enRow);

    body.appendChild(
      fieldColor('颜色', l.color, (v) => {
        const cur = findLight(l.id);
        if (!cur) return;
        cur.color = v;
        swatch.style.background = hexToColorInput(v);
      }),
    );

    if (l.type === 'hemisphere') {
      body.appendChild(
        fieldColor('地面色', l.groundColor ?? 0x444444, (v) => {
          const cur = findLight(l.id);
          if (!cur) return;
          cur.groundColor = v;
        }),
      );
    }

    body.appendChild(
      fieldNum(
        l.type === 'directional' && l.shadowOnly ? '阴影强度' : '强度',
        l.intensity,
        '0.05',
        'intensity',
        (v) => {
          const cur = findLight(l.id);
          if (cur) cur.intensity = v;
        },
      ),
    );

    if (l.type !== 'ambient' && l.type !== 'hemisphere') {
      const following = isLightFollowing(l);
      const posLabel = (axis: string) =>
        following ? `本地 ${axis}` : `位置 ${axis}`;
      const grid = el('div', 'light-field-grid');
      const rid = l.id;
      grid.append(
        fieldNum(
          posLabel('X'),
          l.position.x,
          '0.1',
          'posX',
          (v) => {
            const cur = findLight(l.id);
            if (cur) cur.position.x = v;
          },
          { recaptureId: rid },
        ),
        fieldNum(
          posLabel('Y'),
          l.position.y,
          '0.1',
          'posY',
          (v) => {
            const cur = findLight(l.id);
            if (cur) cur.position.y = v;
          },
          { recaptureId: rid },
        ),
        fieldNum(
          posLabel('Z'),
          l.position.z,
          '0.1',
          'posZ',
          (v) => {
            const cur = findLight(l.id);
            if (cur) cur.position.z = v;
          },
          { recaptureId: rid },
        ),
      );
      body.appendChild(grid);
    }

    if (l.type === 'directional' || l.type === 'spot') {
      const following = isLightFollowing(l);
      const tgtLabel = (axis: string) =>
        following ? `本地目标 ${axis}` : `目标 ${axis}`;
      const grid = el('div', 'light-field-grid');
      const rid = l.id;
      grid.append(
        fieldNum(
          tgtLabel('X'),
          l.target.x,
          '0.1',
          'tgtX',
          (v) => {
            const cur = findLight(l.id);
            if (cur) cur.target.x = v;
          },
          { recaptureId: rid },
        ),
        fieldNum(
          tgtLabel('Y'),
          l.target.y,
          '0.1',
          'tgtY',
          (v) => {
            const cur = findLight(l.id);
            if (cur) cur.target.y = v;
          },
          { recaptureId: rid },
        ),
        fieldNum(
          tgtLabel('Z'),
          l.target.z,
          '0.1',
          'tgtZ',
          (v) => {
            const cur = findLight(l.id);
            if (cur) cur.target.z = v;
          },
          { recaptureId: rid },
        ),
      );
      body.appendChild(grid);
    }

    if (l.type === 'point' || l.type === 'spot') {
      const grid = el('div', 'light-field-grid');
      grid.append(
        fieldNum('距离', l.distance ?? 0, '0.5', 'distance', (v) => {
          const cur = findLight(l.id);
          if (cur) cur.distance = v;
        }),
        fieldNum('衰减', l.decay ?? 2, '0.05', 'decay', (v) => {
          const cur = findLight(l.id);
          if (cur) cur.decay = v;
        }),
      );
      if (l.type === 'spot') {
        grid.append(
          fieldNum('锥角', l.angle ?? Math.PI / 6, '0.01', 'angle', (v) => {
            const cur = findLight(l.id);
            if (cur) cur.angle = v;
          }),
          fieldNum('半影', l.penumbra ?? 0.2, '0.01', 'penumbra', (v) => {
            const cur = findLight(l.id);
            if (cur) cur.penumbra = v;
          }),
        );
      }
      body.appendChild(grid);
    }

    if (lightSupportsFollow(l.type)) {
      const followRow = el('div', 'panel-row');
      const followHead = el('div', 'panel-row-header');
      followHead.appendChild(el('span', undefined, '跟随角色'));
      followRow.appendChild(followHead);
      const followSel = document.createElement('select');
      followSel.dataset.lightField = 'follow';
      for (const [val, label] of [
        ['none', '不跟随'],
        ['p1', '跟随 P1'],
        ['p2', '跟随 P2'],
      ] as const) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        followSel.appendChild(opt);
      }
      followSel.value = l.follow === 'p1' || l.follow === 'p2' ? l.follow : 'none';
      followSel.addEventListener('change', () => {
        const cur = findLight(l.id);
        if (!cur || !lightSupportsFollow(cur.type)) return;
        const v = followSel.value as LightFollowTarget;
        if (v !== 'none' && cur.shadowOnly) {
          cur.shadowOnly = false;
        }
        enableLightFollow(cur, v, followOriginOf('p1'), followOriginOf('p2'));
        // World↔local conversion already done in enableLightFollow; rebuild labels.
        emitLights(true, []);
        const hint =
          cur.type === 'point'
            ? '仅照该角色；本地 XY 随平移/跳跃/下蹲'
            : '仅照该角色；灯与目标本地 XY 随平移/跳跃/下蹲';
        setFlash(
          v === 'none'
            ? `「${cur.name}」已取消跟随（恢复世界坐标 / 照全场）`
            : `「${cur.name}」跟随 ${v.toUpperCase()}（${hint}）`,
        );
      });
      followRow.appendChild(followSel);
      body.appendChild(followRow);
    }

    if (l.type === 'directional') {
      const sh = el('label', 'light-inline-toggle');
      const shCb = document.createElement('input');
      shCb.type = 'checkbox';
      shCb.checked = !!l.castShadow;
      shCb.addEventListener('change', () => {
        const cur = findLight(l.id);
        if (!cur) return;
        cur.castShadow = shCb.checked;
        if (!cur.castShadow) cur.shadowOnly = false;
        if (cur.castShadow) {
          for (const o of CONFIG.lights) {
            if (o.id !== cur.id) {
              o.castShadow = false;
              o.shadowOnly = false;
            }
          }
        }
        emitLights(true);
      });
      sh.append(shCb, document.createTextNode('投射阴影（全场仅一盏）'));
      body.appendChild(sh);

      const so = el('label', 'light-inline-toggle');
      const soCb = document.createElement('input');
      soCb.type = 'checkbox';
      soCb.checked = !!l.shadowOnly;
      soCb.title = '不进入照明列表；阴影经遮挡通道压暗环境/间接光';
      soCb.addEventListener('change', () => {
        const cur = findLight(l.id);
        if (!cur || cur.type !== 'directional') return;
        cur.shadowOnly = soCb.checked;
        if (cur.shadowOnly) {
          cur.castShadow = true;
          if (cur.follow === 'p1' || cur.follow === 'p2') {
            enableLightFollow(cur, 'none', followOriginOf('p1'), followOriginOf('p2'));
          }
          for (const o of CONFIG.lights) {
            if (o.id !== cur.id) {
              o.castShadow = false;
              o.shadowOnly = false;
            }
          }
          setFlash(`「${cur.name}」仅投射阴影（不照明）`);
        } else {
          setFlash(`「${cur.name}」恢复普通投影照明`);
        }
        emitLights(true);
      });
      so.append(soCb, document.createTextNode('仅投射阴影（不照明）'));
      body.appendChild(so);
    }

    const actions = el('div', 'light-card-actions');
    const btnCopy = el('button', undefined, '复制');
    btnCopy.type = 'button';
    btnCopy.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = findLight(l.id);
      if (!cur) return;
      lightClipboard = cloneLightDesc(cur);
      setFlash(`已复制「${cur.name}」`);
    });
    const btnPasteOver = el('button', undefined, '粘贴覆盖');
    btnPasteOver.type = 'button';
    btnPasteOver.title = '用剪贴板灯光参数覆盖本灯（保留 id/名称可选）';
    btnPasteOver.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!lightClipboard) {
        setFlash('剪贴板为空，请先复制一盏灯');
        return;
      }
      const cur = findLight(l.id);
      if (!cur) return;
      const keepId = cur.id;
      const keepName = cur.name;
      Object.assign(cur, cloneLightDesc(lightClipboard, { newId: false }));
      cur.id = keepId;
      cur.name = keepName;
      cur.type = lightClipboard.type;
      cur.castShadow = false;
      emitLights(true);
      setFlash(`已粘贴覆盖「${keepName}」`);
    });
    const btnDup = el('button', undefined, '复制为新灯');
    btnDup.type = 'button';
    btnDup.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = findLight(l.id);
      if (!cur) return;
      if (cur.type === 'ambient' && CONFIG.lights.some((x) => x.type === 'ambient' && x.id !== cur.id)) {
        setFlash('已有环境光');
        return;
      }
      if (
        cur.type === 'hemisphere' &&
        CONFIG.lights.some((x) => x.type === 'hemisphere' && x.id !== cur.id)
      ) {
        setFlash('已有半球光');
        return;
      }
      if (CONFIG.lights.filter((x) => x.enabled).length >= CONFIG.lightMaxCount) {
        setFlash(`已达上限 ${CONFIG.lightMaxCount}`);
        return;
      }
      if (cur.type === 'ambient' || cur.type === 'hemisphere') {
        setFlash('环境/半球光每种最多一盏，请用顶部「粘贴灯」仅在缺失时添加');
        return;
      }
      // Independent lamp: new id, no follow, +X nudge — do not recapture siblings.
      const copy = duplicateLightAsNew(cur, ' 副本');
      if (CONFIG.lights.some((x) => x.id === copy.id)) {
        setFlash('生成 id 冲突，请再点一次复制');
        return;
      }
      CONFIG.lights.push(copy);
      CONFIG.lightSelectedId = copy.id;
      lightCardOpen.set(copy.id, true);
      emitLights(true, []);
      setFlash(
        `已复制「${copy.name}」（已取消跟随、位置 +0.5X；可再手动开跟随）`,
      );
    });
    const btnDel = el('button', undefined, '删除');
    btnDel.type = 'button';
    btnDel.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (CONFIG.lights.length <= 1) {
        setFlash('至少保留一盏灯');
        return;
      }
      CONFIG.lights = CONFIG.lights.filter((x) => x.id !== l.id);
      lightCardOpen.delete(l.id);
      CONFIG.lightSelectedId = CONFIG.lights[0]?.id ?? '';
      emitLights(true);
    });
    actions.append(btnCopy, btnPasteOver, btnDup, btnDel);
    body.appendChild(actions);

    card.append(summary, body);
    return card;
  };

  const renderLightCards = () => {
    // Preserve open state from DOM
    lightCardsHost.querySelectorAll<HTMLDetailsElement>('.light-card').forEach((c) => {
      if (c.dataset.lightId) lightCardOpen.set(c.dataset.lightId, c.open);
    });
    lightCardsHost.replaceChildren();
    for (const l of CONFIG.lights) {
      lightCardsHost.appendChild(buildLightCard(l));
    }
  };

  const syncGlobalColors = () => {
    if (document.activeElement !== bgColorPicker) {
      bgColorPicker.value = hexToColorInput(CONFIG.bgColor);
    }
    if (document.activeElement !== fogColorPicker) {
      fogColorPicker.value = hexToColorInput(CONFIG.fogColor);
    }
  };
  bgColorPicker.addEventListener('input', () => {
    CONFIG.bgColor = colorInputToHex(bgColorPicker.value);
    notify('bgColor', CONFIG.bgColor, CONFIG);
  });
  fogColorPicker.addEventListener('input', () => {
    CONFIG.fogColor = colorInputToHex(fogColorPicker.value);
    notify('fogColor', CONFIG.fogColor, CONFIG);
  });

  gizmoModeSel.addEventListener('change', () => {
    const m = gizmoModeSel.value === 'target' ? 'target' : 'position';
    lightEditHooks?.setGizmoMode(m);
  });

  const addLight = (type: LightType) => {
    if (type === 'ambient' && CONFIG.lights.some((l) => l.type === 'ambient')) {
      setFlash('已有环境光');
      return;
    }
    if (type === 'hemisphere' && CONFIG.lights.some((l) => l.type === 'hemisphere')) {
      setFlash('已有半球光');
      return;
    }
    if (CONFIG.lights.filter((l) => l.enabled).length >= CONFIG.lightMaxCount) {
      setFlash(`已达上限 ${CONFIG.lightMaxCount}`);
      return;
    }
    const desc = createLightByType(type);
    CONFIG.lights.push(desc);
    CONFIG.lightSelectedId = desc.id;
    lightCardOpen.set(desc.id, true);
    emitLights(true);
  };

  byId<HTMLButtonElement>(host, 'btn-lightAddDir').addEventListener('click', () =>
    addLight('directional'),
  );
  byId<HTMLButtonElement>(host, 'btn-lightAddPoint').addEventListener('click', () =>
    addLight('point'),
  );
  byId<HTMLButtonElement>(host, 'btn-lightAddSpot').addEventListener('click', () =>
    addLight('spot'),
  );
  byId<HTMLButtonElement>(host, 'btn-lightAddAmbient').addEventListener('click', () =>
    addLight('ambient'),
  );
  byId<HTMLButtonElement>(host, 'btn-lightAddHemi').addEventListener('click', () =>
    addLight('hemisphere'),
  );
  byId<HTMLButtonElement>(host, 'btn-lightCopyP1FollowToP2').addEventListener(
    'click',
    () => {
      const p1Follow = CONFIG.lights.filter(
        (l) => lightSupportsFollow(l.type) && l.follow === 'p1',
      );
      if (p1Follow.length === 0) {
        setFlash('没有跟随 P1 的灯可复制');
        return;
      }
      const enabledCount = CONFIG.lights.filter((x) => x.enabled).length;
      const room = Math.max(0, CONFIG.lightMaxCount - enabledCount);
      if (room <= 0) {
        setFlash(`已达上限 ${CONFIG.lightMaxCount}，无法再复制`);
        return;
      }
      const copies = copyFollowLightsP1toP2(p1Follow);
      const toAdd = copies.slice(0, room);
      if (toAdd.length === 0) {
        setFlash(`已达上限 ${CONFIG.lightMaxCount}，无法再复制`);
        return;
      }
      for (const c of toAdd) {
        if (CONFIG.lights.some((x) => x.id === c.id)) continue;
        CONFIG.lights.push(c);
        lightCardOpen.set(c.id, true);
      }
      CONFIG.lightSelectedId = toAdd[toAdd.length - 1]!.id;
      emitLights(true, []);
      const skipped = copies.length - toAdd.length;
      setFlash(
        skipped > 0
          ? `已复制 ${toAdd.length} 盏 P1→P2（平行本地偏移）；另有 ${skipped} 盏因上限未加`
          : `已复制 ${toAdd.length} 盏跟随光 P1→P2（平行复制本地偏移）`,
      );
    },
  );

  byId<HTMLButtonElement>(host, 'btn-lightPaste').addEventListener('click', () => {
    if (!lightClipboard) {
      setFlash('剪贴板为空，请先在某盏灯上点「复制」');
      return;
    }
    if (
      lightClipboard.type === 'ambient' &&
      CONFIG.lights.some((l) => l.type === 'ambient')
    ) {
      setFlash('已有环境光，无法再粘贴');
      return;
    }
    if (
      lightClipboard.type === 'hemisphere' &&
      CONFIG.lights.some((l) => l.type === 'hemisphere')
    ) {
      setFlash('已有半球光，无法再粘贴');
      return;
    }
    if (CONFIG.lights.filter((l) => l.enabled).length >= CONFIG.lightMaxCount) {
      setFlash(`已达上限 ${CONFIG.lightMaxCount}`);
      return;
    }
    const copy = duplicateLightAsNew(lightClipboard, ' 粘贴');
    if (CONFIG.lights.some((x) => x.id === copy.id)) {
      setFlash('生成 id 冲突，请再点一次粘贴');
      return;
    }
    CONFIG.lights.push(copy);
    CONFIG.lightSelectedId = copy.id;
    lightCardOpen.set(copy.id, true);
    emitLights(true, []);
    setFlash(`已粘贴「${copy.name}」（已取消跟随、位置 +0.5X）`);
  });

  const syncLightUi = () => {
    syncGlobalColors();
    // Full rebuild only when card count / ids mismatch (external load)
    const ids = CONFIG.lights.map((l) => l.id).join('|');
    const domIds = [...lightCardsHost.querySelectorAll('.light-card')]
      .map((c) => (c as HTMLElement).dataset.lightId)
      .join('|');
    if (ids !== domIds) renderLightCards();
    else updateLightCardChrome();
  };

  syncers.push(syncLightUi);
  renderLightCards();
  syncGlobalColors();

  // Match tools (not pure CONFIG)
  const dummySel = byId<HTMLSelectElement>(host, 'sel-dummyMode');
  const dummySelCombat = byId<HTMLSelectElement>(host, 'sel-dummyMode-combat');
  const applyDummyPolicy = (v: DummyGuardPolicy) => {
    match.dummy.setGuardPolicy(v);
    CONFIG.dummyGuardPolicy = v;
    match.opts.dummyGuardPolicy = v;
    dummySel.value = v;
    dummySelCombat.value = v;
  };
  const syncDummy = () => {
    const v = match.dummy.guardPolicy as DummyGuardPolicy;
    dummySel.value = v;
    dummySelCombat.value = v;
  };
  dummySel.addEventListener('change', () => {
    applyDummyPolicy(dummySel.value as DummyGuardPolicy);
  });
  dummySelCombat.addEventListener('change', () => {
    applyDummyPolicy(dummySelCombat.value as DummyGuardPolicy);
  });
  syncers.push(syncDummy);

  const stanceSel = byId<HTMLSelectElement>(host, 'sel-dummyUnguardedStance');
  const wakeupSel = byId<HTMLSelectElement>(host, 'sel-dummyWakeupStyle');
  stanceSel.value = CONFIG.dummyUnguardedStance;
  wakeupSel.value = CONFIG.dummyWakeupStyle;
  stanceSel.addEventListener('change', () => {
    const v = stanceSel.value as 'stand' | 'crouch';
    CONFIG.dummyUnguardedStance = v;
    match.opts.dummyUnguardedStance = v;
    match.dummy.setUnguardedStance(v);
  });
  wakeupSel.addEventListener('change', () => {
    const v = wakeupSel.value as 'normal' | 'back';
    CONFIG.dummyWakeupStyle = v;
    match.opts.dummyWakeupStyle = v;
    match.dummy.setWakeupStyle(v);
  });
  syncers.push(() => {
    stanceSel.value = CONFIG.dummyUnguardedStance;
    wakeupSel.value = CONFIG.dummyWakeupStyle;
  });

  const p1Hp = byId<HTMLInputElement>(host, 'inp-p1Hp');
  const p2Hp = byId<HTMLInputElement>(host, 'inp-p2Hp');
  const driveBars = byId<HTMLInputElement>(host, 'inp-driveBars');
  const syncHp = () => {
    if (document.activeElement !== p1Hp) p1Hp.value = String(match.p1.hp);
    if (document.activeElement !== p2Hp) p2Hp.value = String(match.p2.hp);
    if (document.activeElement !== driveBars)
      driveBars.value = String(match.drive.currentBars);
    host.querySelector('#val-p1Hp')!.textContent = String(match.p1.hp);
    host.querySelector('#val-p2Hp')!.textContent = String(match.p2.hp);
    host.querySelector('#val-driveBars')!.textContent = String(match.drive.currentBars);
  };
  p1Hp.addEventListener('input', () => {
    match.p1.hp = Number(p1Hp.value) || 0;
  });
  p2Hp.addEventListener('input', () => {
    match.p2.hp = Number(p2Hp.value) || 0;
  });
  driveBars.addEventListener('input', () => {
    match.drive.setBars(Number(driveBars.value) || 0);
  });
  syncers.push(syncHp);

  byId<HTMLButtonElement>(host, 'btn-reset-match').addEventListener('click', () => {
    match.reset();
    syncHp();
    setFlash('对局已重置');
  });

  byId<HTMLButtonElement>(host, 'btn-toggle-pause').addEventListener('click', () => {
    hooks.paused = !hooks.paused;
    setFlash(hooks.paused ? '已暂停' : '继续运行');
  });
  byId<HTMLButtonElement>(host, 'btn-step-once').addEventListener('click', () => {
    hooks.stepOnce();
  });

  // Move edit
  const moveFields = [
    'startup',
    'active',
    'recovery',
    'damage',
    'hitstun',
    'blockstun',
    'hitBoxX',
    'hitBoxY',
    'hitBoxW',
    'hitBoxH',
    'hurtBoxX',
    'hurtBoxY',
    'hurtBoxW',
    'hurtBoxH',
  ] as const;
  type MoveField = (typeof moveFields)[number];
  const moveState = {} as Record<MoveField, number>;

  const pullMove = () => {
    const m = match.move5lp;
    const hit0 = m.boxes.hit[0] ?? { x: 0.55, y: 1.15, w: 0.6, h: 0.4 };
    const hurt0 = m.boxes.hurt[0] ?? { x: 0, y: 0.85, w: 0.7, h: 1.7 };
    moveState.startup = m.frames.startup;
    moveState.active = m.frames.active;
    moveState.recovery = m.frames.recovery;
    moveState.damage = m.damage;
    moveState.hitstun = m.hitstun;
    moveState.blockstun = m.blockstun;
    moveState.hitBoxX = hit0.x;
    moveState.hitBoxY = hit0.y;
    moveState.hitBoxW = hit0.w;
    moveState.hitBoxH = hit0.h;
    moveState.hurtBoxX = hurt0.x;
    moveState.hurtBoxY = hurt0.y;
    moveState.hurtBoxW = hurt0.w;
    moveState.hurtBoxH = hurt0.h;
    for (const f of moveFields) {
      const input = byId<HTMLInputElement>(host, `inp-mv-${f}`);
      if (document.activeElement !== input) input.value = String(moveState[f]);
      host.querySelector(`#val-mv-${f}`)!.textContent = String(moveState[f]);
    }
    host.querySelector('#mv-review')!.textContent = m.review.status;
  };

  const applyMove = () => {
    match.applyMoveEdit({
      startup: moveState.startup,
      active: moveState.active,
      recovery: moveState.recovery,
      damage: moveState.damage,
      hitstun: moveState.hitstun,
      blockstun: moveState.blockstun,
      hitBox: {
        x: moveState.hitBoxX,
        y: moveState.hitBoxY,
        w: moveState.hitBoxW,
        h: moveState.hitBoxH,
      },
      hurtBox: {
        x: moveState.hurtBoxX,
        y: moveState.hurtBoxY,
        w: moveState.hurtBoxW,
        h: moveState.hurtBoxH,
      },
    });
  };

  for (const f of moveFields) {
    const input = byId<HTMLInputElement>(host, `inp-mv-${f}`);
    input.addEventListener('input', () => {
      moveState[f] = Number(input.value) || 0;
      host.querySelector(`#val-mv-${f}`)!.textContent = String(moveState[f]);
      applyMove();
    });
  }
  syncers.push(pullMove);
  pullMove();

  byId<HTMLButtonElement>(host, 'btn-reload-move-json').addEventListener('click', () => {
    void hooks.reloadMoveJson().then(() => {
      pullMove();
      setFlash('招式 JSON 已重载');
    });
  });

  // Probe + tools
  const probeGrid = byId<HTMLElement>(host, 'probe-grid');
  const probeKeys: Array<[string, () => string]> = [
    ['Intent kind', () => String(match.debugProbe.lastIntentKind)],
    ['Intent moveId', () => String(match.debugProbe.lastIntentMoveId)],
    ['Command id', () => String(match.debugProbe.lastCommandId)],
    ['P1 phase', () => String(match.debugProbe.p1Phase)],
    ['P1 clipId', () => String(match.debugProbe.p1ClipId)],
    ['P1 animRole', () => String(match.debugProbe.p1AnimRole)],
    ['P1 locoPhase', () => String(match.debugProbe.p1LocoPhase)],
    ['P1 jumpPhase', () => String(match.debugProbe.p1JumpPhase)],
    ['P1 selfDx', () => String(match.debugProbe.p1SelfDx)],
    ['Catalog 招数', () => String(match.debugProbe.catalogCount)],
    ['Catalog 未命中', () => String(match.debugProbe.lastMoveMiss)],
    ['上次出招', () => String(match.debugProbe.lastExecuteOk)],
    ['姿态', () => String(match.debugProbe.p1StanceId)],
    ['动作时间轴帧', () => String(match.debugProbe.p1ActionTimelineFrame)],
    ['timelineFrame', () => String(match.debugProbe.p1TimelineFrame)],
    ['逻辑 total', () => String(match.debugProbe.p1Total)],
    ['canAct', () => String(match.debugProbe.p1CanAct)],
    ['动作层激活', () => String(match.debugProbe.p1ActionTimelineActive)],
    ['attackResidual', () => String(match.debugProbe.p1HasAttackResidual)],
    ['hurt 块数', () => String(match.debugProbe.p1HurtCount)],
    ['hit 块数', () => String(match.debugProbe.p1HitCount)],
    ['当前招 review', () => String(match.debugProbe.reviewStatus)],
    ['hitstop', () => String(match.debugProbe.hitstopTimer)],
    ['lastHit', () => String(match.debugProbe.lastHitResult)],
    ['lastGuardLevel', () => String(match.debugProbe.lastGuardLevel)],
    ['lastGuardOk', () => String(match.debugProbe.lastGuardOk)],
    ['dummyGuardPolicy', () => String(match.debugProbe.dummyGuardPolicy)],
    ['P2 phase', () => String(match.debugProbe.p2Phase)],
    ['P2 stunTimer', () => String(match.debugProbe.p2StunTimer)],
    ['P2 clipId', () => String(match.debugProbe.p2ClipId)],
    ['P2 kdPhase', () => String(match.debugProbe.p2KdPhase)],
    ['lastHitReaction', () => String(match.debugProbe.lastHitReaction)],
    ['lastHitClipId', () => String(match.debugProbe.lastHitClipId)],
    ['hitClipFallback', () => String(match.debugProbe.hitClipFallback)],
    ['dummyWakeup', () => String(match.debugProbe.dummyWakeupStyle)],
    ['P2 crouching', () => String(match.debugProbe.p2Crouching)],
    ['pushOverlapX', () => String(match.debugProbe.pushOverlapX)],
    ['P2 blockPushDx', () => String(match.debugProbe.p2BlockPushDx)],
  ];
  for (const [k] of probeKeys) {
    const row = el('div');
    row.innerHTML = `<span class="k">${k}</span><span class="v" data-probe="${k}">—</span>`;
    // flatten
    while (row.firstChild) probeGrid.appendChild(row.firstChild);
  }
  const refreshProbe = () => {
    for (const [k, fn] of probeKeys) {
      const v = probeGrid.querySelector(`[data-probe="${CSS.escape(k)}"]`);
      if (v) v.textContent = fn();
    }
  };
  const probeTimer = window.setInterval(refreshProbe, 200);

  const logToggle = byId<HTMLInputElement>(host, 'inp-logCommandsToConsole');
  logToggle.checked = Boolean(match.debugProbe.logCommandsToConsole);
  logToggle.addEventListener('change', () => {
    match.debugProbe.logCommandsToConsole = logToggle.checked;
    host.querySelector('#val-logCommandsToConsole')!.textContent = logToggle.checked
      ? '开'
      : '关';
  });
  host.querySelector('#val-logCommandsToConsole')!.textContent = logToggle.checked
    ? '开'
    : '关';

  byId<HTMLButtonElement>(host, 'btn-reload-catalog').addEventListener('click', () => {
    void (async () => {
      const { loadFeedbackCatalog } = await import('../combat/move/MoveCatalog');
      const { catalog, loaded, failed } = await loadFeedbackCatalog();
      match.catalog = catalog;
      const m5 = catalog.get('ryu_5lp');
      if (m5) match.move5lp = m5;
      match.debugProbe.catalogCount = catalog.size;
      pullMove();
      setFlash(`Catalog 重载 ${loaded.length} 成功 / ${failed.length} 失败`);
    })();
  });
  byId<HTMLButtonElement>(host, 'btn-list-catalog').addEventListener('click', () => {
    console.info('[panel] catalog ids', match.catalog.listMoveIds());
    setFlash('已打印 Catalog IDs 到控制台');
  });
  byId<HTMLButtonElement>(host, 'btn-reload-stance').addEventListener('click', () => {
    void (async () => {
      try {
        const { fetchStanceBoxTable } = await import('../data/loadStanceBoxes');
        const t = await fetchStanceBoxTable();
        match.setStanceTable(t);
        setFlash(`姿态框已重载 (${t.review.status})`);
      } catch (e) {
        setFlash(`姿态框重载失败: ${String(e)}`);
      }
    })();
  });
  byId<HTMLButtonElement>(host, 'btn-clear-action-boxes').addEventListener('click', () => {
    match.p1.debugClearActionBoxes = true;
    match.p1.clearActionTimeline();
    setFlash('已强制关闭动作层');
  });
  byId<HTMLButtonElement>(host, 'btn-reload-movement').addEventListener('click', () => {
    void import('../data/loadRyuMovement').then(async (m) => {
      try {
        const t = await m.fetchRyuMovement();
        Object.assign(CONFIG, m.movementToSimDefaults(t));
        match.setMovementTable(t);
        syncMatchOpts(match, CONFIG);
        refreshAll();
        setFlash('ryu_movement 已重载');
      } catch (e) {
        setFlash(`移动表失败: ${String(e)}`);
      }
    });
  });

  // Anim test
  setupAnimTest(host, hooks);

  // Archive buttons
  byId<HTMLButtonElement>(host, 'btn-save-local').addEventListener('click', () => {
    saveCurrentConfig();
    setFlash('已存为本地默认（刷新后保留）');
  });
  byId<HTMLButtonElement>(host, 'btn-reset-factory').addEventListener('click', () => {
    if (!confirm('恢复出厂默认？将回到 shipping/代码默认（不删本地存档文件，仅重置当前会话）。'))
      return;
    resetToFactoryActiveDefault();
    syncMatchOpts(match, CONFIG);
    clock.reconfigure(CONFIG.logicFps, CONFIG.maxLogicStepsPerRaf, CONFIG.maxFrameTimeMs);
    refreshAll();
    notify('*', CONFIG, CONFIG);
    setFlash('已恢复出厂默认');
  });
  byId<HTMLButtonElement>(host, 'btn-export-shipping').addEventListener('click', () => {
    exportShippingJson();
    setFlash('已下载 shipping.json — 放入 public/presets/ 后提交仓库');
  });
  byId<HTMLButtonElement>(host, 'btn-clear-local').addEventListener('click', () => {
    if (!confirm('清除本机 localStorage 中的本地默认？')) return;
    clearSavedConfig();
    setFlash('本地默认已清除（刷新后将仅用 shipping/代码默认）');
  });

  // Named presets
  let selectedPreset = '';
  const presetList = byId<HTMLElement>(host, 'preset-list');
  const nameInput = byId<HTMLInputElement>(host, 'inp-preset-name');
  const refreshPresetList = () => {
    presetList.innerHTML = '';
    const map = listNamedPresets();
    const names = Object.keys(map).sort();
    if (names.length === 0) {
      presetList.innerHTML = '<p class="panel-hint" style="padding:6px">暂无命名预设</p>';
      return;
    }
    for (const n of names) {
      const b = el('button', selectedPreset === n ? 'is-selected' : '', n);
      b.type = 'button';
      b.addEventListener('click', () => {
        selectedPreset = n;
        nameInput.value = n;
        refreshPresetList();
      });
      presetList.appendChild(b);
    }
  };
  byId<HTMLButtonElement>(host, 'btn-preset-save').addEventListener('click', () => {
    const name = nameInput.value.trim() || selectedPreset;
    if (!name) {
      setFlash('请填写预设名称');
      return;
    }
    saveNamedPreset(name);
    selectedPreset = name;
    refreshPresetList();
    setFlash(`预设「${name}」已保存`);
  });
  byId<HTMLButtonElement>(host, 'btn-preset-load').addEventListener('click', () => {
    const name = nameInput.value.trim() || selectedPreset;
    if (!name || !loadNamedPreset(name)) {
      setFlash('未找到预设');
      return;
    }
    syncMatchOpts(match, CONFIG);
    clock.reconfigure(CONFIG.logicFps, CONFIG.maxLogicStepsPerRaf, CONFIG.maxFrameTimeMs);
    refreshAll();
    notify('*', CONFIG, CONFIG);
    setFlash(`已载入「${name}」`);
  });
  byId<HTMLButtonElement>(host, 'btn-preset-delete').addEventListener('click', () => {
    const name = nameInput.value.trim() || selectedPreset;
    if (!name) return;
    deleteNamedPreset(name);
    if (selectedPreset === name) selectedPreset = '';
    refreshPresetList();
    setFlash(`已删除「${name}」`);
  });
  byId<HTMLButtonElement>(host, 'btn-preset-export').addEventListener('click', () => {
    const name = nameInput.value.trim() || selectedPreset || 'preset';
    exportNamedPresetJson(name);
    setFlash(`已导出 ${name}.json`);
  });
  const fileInput = byId<HTMLInputElement>(host, 'inp-preset-file');
  byId<HTMLButtonElement>(host, 'btn-preset-import').addEventListener('click', () => {
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!importPresetFromObject(data)) {
          setFlash('导入失败：格式无效');
          return;
        }
        syncMatchOpts(match, CONFIG);
        clock.reconfigure(CONFIG.logicFps, CONFIG.maxLogicStepsPerRaf, CONFIG.maxFrameTimeMs);
        refreshAll();
        notify('*', CONFIG, CONFIG);
        setFlash(`已导入 ${file.name}`);
      } catch (e) {
        setFlash(`导入失败: ${String(e)}`);
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  });
  refreshPresetList();

  // Open / hide / drag
  let clickTimes: number[] = [];
  trigger.addEventListener('click', () => {
    const now = performance.now();
    clickTimes = clickTimes.filter((t) => now - t < 600);
    clickTimes.push(now);
    if (clickTimes.length >= 3) {
      clickTimes = [];
      openPanel(true);
    }
  });
  byId<HTMLButtonElement>(host, 'btn-panel-hide').addEventListener('click', () => {
    openPanel(false);
  });

  function openPanel(open: boolean): void {
    panel.classList.toggle('is-open', open);
    panel.style.display = open ? 'flex' : 'none';
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) refreshAll();
  }

  // Header drag
  const header = byId<HTMLElement>(host, 'panel-header');
  let drag: { ox: number; oy: number; sx: number; sy: number } | null = null;
  header.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = panel.getBoundingClientRect();
    drag = { ox: e.clientX, oy: e.clientY, sx: rect.left, sy: rect.top };
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = drag.sx + (e.clientX - drag.ox);
    const y = drag.sy + (e.clientY - drag.oy);
    panel.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, x))}px`;
    panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, y))}px`;
    panel.style.right = 'auto';
  });
  header.addEventListener('pointerup', () => {
    drag = null;
  });

  // Isolate events from game canvas
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  panel.addEventListener('keydown', (e) => e.stopPropagation());

  attachDragScrubAll(host);

  function refreshAll(): void {
    for (const s of syncers) s();
    refreshProbe();
  }

  // Initial sync of match opts from CONFIG
  syncMatchOpts(match, CONFIG);
  refreshAll();

  return {
    refresh: refreshAll,
    setFlash,
    destroy: () => {
      window.clearInterval(probeTimer);
      host.remove();
    },
  };
}

function setupAnimTest(host: HTMLElement, hooks: ControlPanelHooks): void {
  const statusEl = byId<HTMLElement>(host, 'anim-test-status');
  const catSel = byId<HTMLSelectElement>(host, 'sel-anim-category');
  const packSel = byId<HTMLSelectElement>(host, 'sel-anim-pack');
  const clipSel = byId<HTMLSelectElement>(host, 'sel-anim-clip');
  const previewToggle = byId<HTMLInputElement>(host, 'inp-animPreview');
  const reinstallToggle = byId<HTMLInputElement>(host, 'inp-animReinstallMesh');
  const valPreview = host.querySelector('#val-animPreview')!;
  const valReinstall = host.querySelector('#val-animReinstallMesh')!;

  let categories: AnimCatalogCategory[] = [];
  let allClips: AnimCatalogClip[] = [];

  const setStatus = (s: string) => {
    statusEl.textContent = s;
  };

  const findCategory = (id: string) => categories.find((c) => c.category === id);
  const findPack = (cat: AnimCatalogCategory | undefined, packId: string) =>
    cat?.packs.find((p) => p.pack === packId);

  const fillSelect = (
    select: HTMLSelectElement,
    options: Array<{ label: string; value: string }>,
    keep?: string,
  ) => {
    select.innerHTML = '';
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      select.appendChild(opt);
    }
    if (keep && options.some((o) => o.value === keep)) select.value = keep;
    else if (options[0]) select.value = options[0].value;
  };

  const rebuildPacks = () => {
    const cat = findCategory(catSel.value);
    const opts =
      cat?.packs.map((p) => ({
        label: `${p.packName || p.pack} (${p.clipCount})`,
        value: p.pack,
      })) ?? [];
    fillSelect(packSel, opts.length ? opts : [{ label: '(无动作包)', value: '' }], packSel.value);
    rebuildClips();
  };

  const rebuildClips = () => {
    const pack = findPack(findCategory(catSel.value), packSel.value);
    const opts =
      pack?.clips.map((c) => ({ label: c.label, value: c.id })) ?? [];
    fillSelect(clipSel, opts.length ? opts : [{ label: '(无动画)', value: '' }], clipSel.value);
  };

  const resolveClip = (): AnimCatalogClip | undefined => {
    const id = clipSel.value;
    if (!id) return undefined;
    return (
      allClips.find((c) => c.id === id) ??
      findPack(findCategory(catSel.value), packSel.value)?.clips.find((c) => c.id === id)
    );
  };

  const play = async () => {
    const view = hooks.p1View;
    if (!view) {
      setStatus('无 P1 视图');
      return;
    }
    const clip = resolveClip();
    if (!clip) {
      setStatus('请先选择有效动画');
      return;
    }
    previewToggle.checked = true;
    valPreview.textContent = '开';
    setStatus(`加载中 ${clip.category}/${clip.packName} · ${clip.stem}…`);
    const wasPaused = hooks.paused;
    hooks.paused = true;
    try {
      const result = await view.loadAndLoopClipFromUrl(clip.url, {
        reinstallMesh: reinstallToggle.checked,
      });
      setStatus(
        `循环: ${clip.category}/${clip.packName} · ${result.clipName} · ${result.duration.toFixed(2)}s`,
      );
    } catch (err) {
      setStatus(`加载失败: ${String(err)}`);
      previewToggle.checked = false;
      valPreview.textContent = '关';
    } finally {
      hooks.paused = wasPaused;
    }
  };

  const loadList = async () => {
    setStatus('拉取 /api/ryu-anims…');
    try {
      const data = await fetchRyuAnimCatalog();
      allClips = data.clips.filter((c) => c.status !== 'error');
      categories = data.categories ?? [];
      fillSelect(
        catSel,
        categories.length
          ? categories.map((c) => ({
              label: `${c.category} (${c.clipCount})`,
              value: c.category,
            }))
          : [{ label: '(无分类)', value: '' }],
        catSel.value ||
          categories.find((c) => c.category === 'basic')?.category ||
          categories[0]?.category,
      );
      rebuildPacks();
      setStatus(
        allClips.length
          ? `已加载 ${allClips.length} 条 · ${categories.length} 类`
          : `列表空 sources=${(data.sources ?? []).join(',') || 'none'}`,
      );
    } catch (err) {
      setStatus(`列表失败: ${String(err)}`);
    }
  };

  catSel.addEventListener('change', () => {
    rebuildPacks();
    if (previewToggle.checked) void play();
  });
  packSel.addEventListener('change', () => {
    rebuildClips();
    if (previewToggle.checked) void play();
  });
  clipSel.addEventListener('change', () => {
    if (previewToggle.checked) void play();
  });

  previewToggle.addEventListener('change', () => {
    valPreview.textContent = previewToggle.checked ? '开' : '关';
    if (!previewToggle.checked) {
      hooks.p1View?.exitPreviewMode();
      setStatus('已退出预览 → 逻辑 clip');
    } else if (resolveClip()) {
      void play();
    }
  });
  reinstallToggle.addEventListener('change', () => {
    valReinstall.textContent = reinstallToggle.checked ? '开' : '关';
  });
  valPreview.textContent = '关';
  valReinstall.textContent = '关';

  byId<HTMLButtonElement>(host, 'btn-anim-play').addEventListener('click', () => {
    void play();
  });
  byId<HTMLButtonElement>(host, 'btn-anim-exit').addEventListener('click', () => {
    previewToggle.checked = false;
    valPreview.textContent = '关';
    hooks.p1View?.exitPreviewMode();
    setStatus('已退出预览 → 逻辑 clip');
  });
  byId<HTMLButtonElement>(host, 'btn-anim-reload').addEventListener('click', () => {
    void loadList();
  });

  void loadList();
}

// Re-export for main convenience
export { reloadMoveFromPublic };

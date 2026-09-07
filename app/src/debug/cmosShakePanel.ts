/**
 * CMOS screen-shake ControlPanel section: DOM + bindings + preset CRUD.
 */

import {
  normalizeCmosShakeEffectPreset,
  normalizeCmosShakeMode,
  type CmosShakeEffectPreset,
  type CmosShakePresetMode,
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

function modeLabelZh(mode: string | undefined): string {
  switch (mode) {
    case 'pulse':
      return '脉冲串';
    case 'oscillate':
      return '衰减摆动';
    case 'impulse':
    default:
      return '单次冲量';
  }
}

export function cmosShakeSectionHtml(): string {
  return `
      <details class="panel-group" data-cat="屏幕震动">
        <summary>屏幕震动</summary>
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">【屏幕震动】弹簧悬挂模型</span>
            <label>展开 <span id="val-expandCmosShake">展开</span>
              <input id="inp-expandCmosShake" type="checkbox" />
            </label>
          </div>
          <div class="section-body" id="sect-cmosShake">
            <p class="panel-hint">整幅画面像传感器被撞一下再弹回中心。偏移用世界单位；业务调用 play(预设id)。改完请存本地默认 / 导出 Shipping。</p>

            <div class="panel-row row-toggle">
              ${paramLabel('启用震动', '关=完全不抖（无障碍）；开=允许冲量与输出', 'val-cmosShakeEnabled')}
              <input id="inp-cmosShakeEnabled" type="checkbox" />
            </div>
            <div class="panel-row">
              ${paramLabel('全局强度', '调大→画面晃得更猛；0=等同关闭（推荐无障碍开关）', 'val-cmosShakeIntensity')}
              <input id="inp-cmosShakeIntensity" type="number" min="0" max="1" step="0.01" />
            </div>
            <div class="panel-row row-toggle">
              ${paramLabel('跟随游戏倍速', '开=卡帧/慢放时震动也变慢；关=墙钟感（推荐，命中停顿仍能感到冲击）', 'val-cmosShakeUseGameSpeed')}
              <input id="inp-cmosShakeUseGameSpeed" type="checkbox" />
            </div>
            <div class="panel-row">
              ${paramLabel('命中时播放预设', '未格挡命中自动 play 的预设 id；空=不自动震', 'val-cmosPresetOnHit')}
              <input id="inp-cmosPresetOnHit" type="text" spellcheck="false" placeholder="例如 impact" />
            </div>
            <div class="panel-row">
              ${paramLabel('防御时播放预设', '格挡命中自动 play 的预设 id；空=不自动震', 'val-cmosPresetOnBlock')}
              <input id="inp-cmosPresetOnBlock" type="text" spellcheck="false" placeholder="例如 tap" />
            </div>

            <p class="panel-hint" style="font-weight:600;margin-top:8px">震动效果预设</p>
            <p class="panel-hint">单次效果表（不是下方全局弹簧）。模式：单次冲量 / 脉冲串 / 衰减摆动。用稳定 id 调用 play(id)。</p>
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
              ${paramLabel('播放模式', '单次=一下冲击；脉冲串=连踢可来回；衰减摆动=持续晃一阵')}
              <select id="sel-cmosEffectMode" style="width:100%">
                <option value="impulse">单次冲量 — 一下冲击后回正</option>
                <option value="pulse">脉冲串 — 多次踢 / 可左右来回</option>
                <option value="oscillate">衰减摆动 — 有限时长正弦驱动</option>
              </select>
            </div>
            <div class="panel-row">
              ${paramLabel('冲击强度', '调大→平移踢得更猛（速度冲量）', 'val-cmosEffectStrength')}
              <input id="inp-cmosEffectStrength" type="number" min="0" max="3" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('旋转冲击', '调大→画面扭得更厉害（角速度冲量）', 'val-cmosEffectSpin')}
              <input id="inp-cmosEffectSpin" type="number" min="-1" max="1" step="0.005" />
            </div>
            <div class="panel-row">
              ${paramLabel('冲击方向角 (°)', '0=右 · 90=下 · 180=左 · 270=上；改角度换震动方向', 'val-cmosEffectDirAngle')}
              <input id="inp-cmosEffectDirAngle" type="number" min="0" max="360" step="1" />
            </div>
            <div class="panel-row">
              ${paramLabel('方向半径', '≈0 时退回默认向下；一般保持 1', 'val-cmosEffectDirRadius')}
              <input id="inp-cmosEffectDirRadius" type="number" min="0" max="10" step="0.05" />
            </div>
            <div class="panel-row row-toggle">
              ${paramLabel('随机方向角', '开=每次播放在下方区间内随机方向；同一次脉冲串共用一次采样', 'val-cmosEffectDirRandom')}
              <input id="inp-cmosEffectDirRandom" type="checkbox" />
            </div>
            <div class="panel-row" id="row-cmosEffectDirAngleRange">
              ${paramLabel('随机角度区间 (°)', '区间越大→方向越散；仅随机方向开启时有效', 'val-cmosEffectDirAngleRange')}
              <div style="display:flex;gap:8px;align-items:center;">
                <input id="inp-cmosEffectDirAngleMin" type="number" min="0" max="360" step="1" style="flex:1" title="最小角" />
                <span style="opacity:0.6">~</span>
                <input id="inp-cmosEffectDirAngleMax" type="number" min="0" max="360" step="1" style="flex:1" title="最大角" />
              </div>
            </div>
            <div class="panel-row">
              ${paramLabel('位置踢', '调大→瞬间位移更大（先顿一下再回弹）', 'val-cmosEffectPosKick')}
              <input id="inp-cmosEffectPosKick" type="number" min="-1" max="1" step="0.001" />
            </div>
            <div class="panel-row">
              ${paramLabel('角度踢 (°)', '调大→瞬间扭转更大', 'val-cmosEffectAngleKick')}
              <input id="inp-cmosEffectAngleKick" type="number" min="-5" max="5" step="0.05" />
            </div>

            <p class="panel-hint" style="font-weight:600">脉冲串参数（播放模式=脉冲串时）</p>
            <div class="panel-row">
              ${paramLabel('脉冲次数', '调大→连踢更多下', 'val-cmosEffectCount')}
              <input id="inp-cmosEffectCount" type="number" min="1" max="20" step="1" />
            </div>
            <div class="panel-row">
              ${paramLabel('脉冲间隔 (毫秒)', '调大→两下之间更疏、更慢', 'val-cmosEffectIntervalMS')}
              <input id="inp-cmosEffectIntervalMS" type="number" min="0" max="500" step="5" />
            </div>
            <div class="panel-row row-toggle">
              ${paramLabel('交替翻转方向', '开=左右/上下来回踢；关=始终同向', 'val-cmosEffectAlternate')}
              <input id="inp-cmosEffectAlternate" type="checkbox" />
            </div>
            <div class="panel-row">
              ${paramLabel('逐拍衰减', '调小→后面几下明显变弱（如 0.8）；1=每拍一样猛', 'val-cmosEffectFalloff')}
              <input id="inp-cmosEffectFalloff" type="number" min="0" max="1.5" step="0.05" />
            </div>

            <p class="panel-hint" style="font-weight:600">衰减摆动参数（播放模式=衰减摆动时）</p>
            <div class="panel-row">
              ${paramLabel('摆动时长 (毫秒)', '调大→持续晃更久', 'val-cmosEffectDurationMS')}
              <input id="inp-cmosEffectDurationMS" type="number" min="0" max="3000" step="10" />
            </div>
            <div class="panel-row">
              ${paramLabel('摆动频率 (Hz)', '调大→晃得更密、更碎', 'val-cmosEffectFreqHz')}
              <input id="inp-cmosEffectFreqHz" type="number" min="0" max="40" step="0.5" />
            </div>
            <div class="panel-row">
              ${paramLabel('平移振幅', '调大→左右/上下晃幅更大', 'val-cmosEffectAmp')}
              <input id="inp-cmosEffectAmp" type="number" min="0" max="1" step="0.001" />
            </div>
            <div class="panel-row">
              ${paramLabel('旋转振幅 (°)', '调大→扭角晃幅更大', 'val-cmosEffectAmpRotDeg')}
              <input id="inp-cmosEffectAmpRotDeg" type="number" min="0" max="5" step="0.05" />
            </div>
            <div class="panel-row">
              ${paramLabel('包络衰减', '调大→更快收住；0=全程不衰减', 'val-cmosEffectDecay')}
              <input id="inp-cmosEffectDecay" type="number" min="0" max="20" step="0.1" />
            </div>
            <div class="panel-row">
              ${paramLabel('初相位 (°)', '改变起步位置；通常保持 0 即可', 'val-cmosEffectPhaseDeg')}
              <input id="inp-cmosEffectPhaseDeg" type="number" min="-180" max="180" step="5" />
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
              ${paramLabel('方向角 (°)', '0=右 · 90=下；决定这一脚往哪推', 'val-cmosDebugDirAngle')}
              <input id="inp-cmosDebugDirAngle" type="number" min="0" max="360" step="1" />
            </div>
            <div class="panel-row">
              ${paramLabel('方向半径', '≈0 退回向下；一般保持 1', 'val-cmosDebugDirRadius')}
              <input id="inp-cmosDebugDirRadius" type="number" min="0" max="10" step="0.05" />
            </div>
            <div class="panel-row row-toggle">
              ${paramLabel('随机方向角', '开=试射时在区间内随机方向', 'val-cmosDebugDirRandom')}
              <input id="inp-cmosDebugDirRandom" type="checkbox" />
            </div>
            <div class="panel-row" id="row-cmosDebugDirAngleRange">
              ${paramLabel('随机角度区间 (°)', '区间越大→试射方向越散', 'val-cmosDebugDirAngleRange')}
              <div style="display:flex;gap:8px;align-items:center;">
                <input id="inp-cmosDebugDirAngleMin" type="number" min="0" max="360" step="1" style="flex:1" />
                <span style="opacity:0.6">~</span>
                <input id="inp-cmosDebugDirAngleMax" type="number" min="0" max="360" step="1" style="flex:1" />
              </div>
            </div>
            <div class="panel-row">
              ${paramLabel('冲击强度', '调大→这一脚踢得更猛', 'val-cmosDebugStrength')}
              <input id="inp-cmosDebugStrength" type="number" min="0" max="2" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('旋转冲击', '调大→这一脚扭得更狠', 'val-cmosDebugSpin')}
              <input id="inp-cmosDebugSpin" type="number" min="0" max="1" step="0.01" />
            </div>

            <p class="panel-hint" style="font-weight:600;margin-top:8px">全局动力学（所有预设共用）</p>
            <div class="panel-row">
              ${paramLabel('平移自然频率', '调大→回正更快更脆；调小→更肉、晃得久', 'val-cmosAngularFreq')}
              <input id="inp-cmosAngularFreq" type="number" min="4" max="40" step="0.5" />
            </div>
            <div class="panel-row">
              ${paramLabel('平移阻尼比', '调大→少过冲、更快停；调小→更果冻、来回晃', 'val-cmosDampingRatio')}
              <input id="inp-cmosDampingRatio" type="number" min="0.2" max="1.5" step="0.02" />
            </div>
            <div class="panel-row">
              ${paramLabel('旋转自然频率', '调大→扭转回正更快', 'val-cmosRotAngularFreq')}
              <input id="inp-cmosRotAngularFreq" type="number" min="4" max="40" step="0.5" />
            </div>
            <div class="panel-row">
              ${paramLabel('旋转阻尼比', '调大→扭角更快消；通常略高于平移阻尼', 'val-cmosRotDampingRatio')}
              <input id="inp-cmosRotDampingRatio" type="number" min="0.2" max="1.5" step="0.02" />
            </div>
            <div class="panel-row">
              ${paramLabel('水平最大偏移', '调大→允许晃得更远（易晕）；超过会软夹持', 'val-cmosMaxOffsetX')}
              <input id="inp-cmosMaxOffsetX" type="number" min="0" max="2" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('垂直最大偏移', '调大→上下晃幅上限更高', 'val-cmosMaxOffsetY')}
              <input id="inp-cmosMaxOffsetY" type="number" min="0" max="2" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('最大转角 (°)', '调大→允许扭得更斜；建议 ≤1.2 以免字难读', 'val-cmosMaxAngleDeg')}
              <input id="inp-cmosMaxAngleDeg" type="number" min="0" max="5" step="0.1" />
            </div>
            <div class="panel-row">
              ${paramLabel('强度→平移速度', '调大→同样「冲击强度」实际踢得更猛（全局灵敏度）', 'val-cmosStrengthToVelocity')}
              <input id="inp-cmosStrengthToVelocity" type="number" min="0.5" max="80" step="0.5" />
            </div>
            <div class="panel-row">
              ${paramLabel('旋转冲击→角速度', '调大→同样「旋转冲击」扭得更狠', 'val-cmosSpinToVelocity')}
              <input id="inp-cmosSpinToVelocity" type="number" min="0" max="40" step="0.5" />
            </div>
            <div class="panel-row">
              ${paramLabel('平移速度上限', '调大→连击可叠得更猛；防「振动马达」可调小', 'val-cmosMaxSpeedXY')}
              <input id="inp-cmosMaxSpeedXY" type="number" min="1" max="200" step="1" />
            </div>
            <div class="panel-row">
              ${paramLabel('旋转速度上限', '调大→扭角速度可叠更高', 'val-cmosMaxSpeedRot')}
              <input id="inp-cmosMaxSpeedRot" type="number" min="1" max="100" step="1" />
            </div>
            <div class="panel-row">
              ${paramLabel('最小冲量间隔 (毫秒)', '调大→连打时后几下自动减弱（防马达）；0=不限制', 'val-cmosMinImpulseIntervalMS')}
              <input id="inp-cmosMinImpulseIntervalMS" type="number" min="0" max="200" step="5" />
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
              ${paramLabel('平移质量', '与刚度同比例；频率/阻尼固定时手感几乎不变，一般保持 1', 'val-cmosMass')}
              <input id="inp-cmosMass" type="number" min="0.1" max="5" step="0.1" />
            </div>
            <div class="panel-row">
              ${paramLabel('旋转质量', '同平移质量；一般保持 1', 'val-cmosRotMass')}
              <input id="inp-cmosRotMass" type="number" min="0.1" max="5" step="0.1" />
            </div>
          </div>
        </div>
      </details>
  `;
}

const CMOS_NUM_BINDS: Array<{ id: string; path: string }> = [
  { id: 'cmosShakeIntensity', path: 'cmosShake.intensity' },
  { id: 'cmosAngularFreq', path: 'cmosShake.angularFreq' },
  { id: 'cmosDampingRatio', path: 'cmosShake.dampingRatio' },
  { id: 'cmosRotAngularFreq', path: 'cmosShake.rotAngularFreq' },
  { id: 'cmosRotDampingRatio', path: 'cmosShake.rotDampingRatio' },
  { id: 'cmosMaxOffsetX', path: 'cmosShake.maxOffsetX' },
  { id: 'cmosMaxOffsetY', path: 'cmosShake.maxOffsetY' },
  { id: 'cmosMaxAngleDeg', path: 'cmosShake.maxAngleDeg' },
  { id: 'cmosStrengthToVelocity', path: 'cmosShake.strengthToVelocity' },
  { id: 'cmosSpinToVelocity', path: 'cmosShake.spinToVelocity' },
  { id: 'cmosMaxSpeedXY', path: 'cmosShake.maxSpeedXY' },
  { id: 'cmosMaxSpeedRot', path: 'cmosShake.maxSpeedRot' },
  { id: 'cmosMinImpulseIntervalMS', path: 'cmosShake.minImpulseIntervalMS' },
  { id: 'cmosMaxDtSec', path: 'cmosShake.maxDtSec' },
  { id: 'cmosSubsteps', path: 'cmosShake.substeps' },
  { id: 'cmosMass', path: 'cmosShake.mass' },
  { id: 'cmosRotMass', path: 'cmosShake.rotMass' },
  { id: 'cmosDebugDirAngle', path: 'cmosShake.debugImpulse.dirAngleDeg' },
  { id: 'cmosDebugDirRadius', path: 'cmosShake.debugImpulse.dirRadius' },
  { id: 'cmosDebugDirAngleMin', path: 'cmosShake.debugImpulse.dirAngleMin' },
  { id: 'cmosDebugDirAngleMax', path: 'cmosShake.debugImpulse.dirAngleMax' },
  { id: 'cmosDebugStrength', path: 'cmosShake.debugImpulse.strength' },
  { id: 'cmosDebugSpin', path: 'cmosShake.debugImpulse.spin' },
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

  // Text fields for hit/block preset ids
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
  bindText('inp-cmosPresetOnHit', 'cmosShake.presetOnHit', 'val-cmosPresetOnHit');
  bindText('inp-cmosPresetOnBlock', 'cmosShake.presetOnBlock', 'val-cmosPresetOnBlock');

  bindToggle(
    'inp-cmosDebugDirRandom',
    'cmosShake.debugImpulse.dirRandom',
    ['关', '开'],
    'val-cmosDebugDirRandom',
  );
  {
    const syncDebugDirRandomUi = () => {
      const on = !!CONFIG.cmosShake.debugImpulse.dirRandom;
      const row = root.querySelector('#row-cmosDebugDirAngleRange') as HTMLElement | null;
      if (row) row.style.display = on ? '' : 'none';
      const d = CONFIG.cmosShake.debugImpulse;
      const rangeVal = root.querySelector('#val-cmosDebugDirAngleRange');
      if (rangeVal) {
        rangeVal.textContent = `${formatNumber(d.dirAngleMin, 0)} ~ ${formatNumber(d.dirAngleMax, 0)}`;
      }
    };
    root
      .querySelector('#inp-cmosDebugDirRandom')
      ?.addEventListener('change', syncDebugDirRandomUi);
    for (const id of ['inp-cmosDebugDirAngleMin', 'inp-cmosDebugDirAngleMax']) {
      root.querySelector(`#${id}`)?.addEventListener('input', syncDebugDirRandomUi);
    }
    syncers.push(syncDebugDirRandomUi);
    syncDebugDirRandomUi();
  }

  const bindCmosAction = (btnId: string, actionKey: string) => {
    root.querySelector(`#${CSS.escape(btnId)}`)?.addEventListener('click', () => {
      onChange(actionKey, null, CONFIG);
    });
  };
  bindCmosAction('btn-cmosShake-burstTick', 'action:cmosShake:burstTick');
  bindCmosAction('btn-cmosShake-custom', 'action:cmosShake:custom');
  bindCmosAction('btn-cmosShake-reset', 'action:cmosShake:reset');

  // --- Preset CRUD ---
  {
    const select = root.querySelector(
      '#sel-cmos-effect-preset',
    ) as HTMLSelectElement | null;
    const idInput = root.querySelector('#inp-cmosEffectId') as HTMLInputElement | null;
    const labelInput = root.querySelector(
      '#inp-cmosEffectLabel',
    ) as HTMLInputElement | null;
    const modeSelect = root.querySelector(
      '#sel-cmosEffectMode',
    ) as HTMLSelectElement | null;
    const strengthInput = root.querySelector(
      '#inp-cmosEffectStrength',
    ) as HTMLInputElement | null;
    const spinInput = root.querySelector('#inp-cmosEffectSpin') as HTMLInputElement | null;
    const dirAngleInput = root.querySelector(
      '#inp-cmosEffectDirAngle',
    ) as HTMLInputElement | null;
    const dirRadiusInput = root.querySelector(
      '#inp-cmosEffectDirRadius',
    ) as HTMLInputElement | null;
    const dirRandomInput = root.querySelector(
      '#inp-cmosEffectDirRandom',
    ) as HTMLInputElement | null;
    const dirAngleMinInput = root.querySelector(
      '#inp-cmosEffectDirAngleMin',
    ) as HTMLInputElement | null;
    const dirAngleMaxInput = root.querySelector(
      '#inp-cmosEffectDirAngleMax',
    ) as HTMLInputElement | null;
    const posKickInput = root.querySelector(
      '#inp-cmosEffectPosKick',
    ) as HTMLInputElement | null;
    const angleKickInput = root.querySelector(
      '#inp-cmosEffectAngleKick',
    ) as HTMLInputElement | null;
    const countInput = root.querySelector(
      '#inp-cmosEffectCount',
    ) as HTMLInputElement | null;
    const intervalInput = root.querySelector(
      '#inp-cmosEffectIntervalMS',
    ) as HTMLInputElement | null;
    const alternateInput = root.querySelector(
      '#inp-cmosEffectAlternate',
    ) as HTMLInputElement | null;
    const falloffInput = root.querySelector(
      '#inp-cmosEffectFalloff',
    ) as HTMLInputElement | null;
    const durationInput = root.querySelector(
      '#inp-cmosEffectDurationMS',
    ) as HTMLInputElement | null;
    const freqInput = root.querySelector(
      '#inp-cmosEffectFreqHz',
    ) as HTMLInputElement | null;
    const ampInput = root.querySelector('#inp-cmosEffectAmp') as HTMLInputElement | null;
    const ampRotInput = root.querySelector(
      '#inp-cmosEffectAmpRotDeg',
    ) as HTMLInputElement | null;
    const decayInput = root.querySelector(
      '#inp-cmosEffectDecay',
    ) as HTMLInputElement | null;
    const phaseInput = root.querySelector(
      '#inp-cmosEffectPhaseDeg',
    ) as HTMLInputElement | null;

    const strengthVal = root.querySelector('#val-cmosEffectStrength');
    const spinVal = root.querySelector('#val-cmosEffectSpin');
    const dirAngleVal = root.querySelector('#val-cmosEffectDirAngle');
    const dirRadiusVal = root.querySelector('#val-cmosEffectDirRadius');
    const dirRandomVal = root.querySelector('#val-cmosEffectDirRandom');
    const dirAngleRangeVal = root.querySelector('#val-cmosEffectDirAngleRange');
    const posKickVal = root.querySelector('#val-cmosEffectPosKick');
    const angleKickVal = root.querySelector('#val-cmosEffectAngleKick');
    const countVal = root.querySelector('#val-cmosEffectCount');
    const intervalVal = root.querySelector('#val-cmosEffectIntervalMS');
    const alternateVal = root.querySelector('#val-cmosEffectAlternate');
    const falloffVal = root.querySelector('#val-cmosEffectFalloff');
    const durationVal = root.querySelector('#val-cmosEffectDurationMS');
    const freqVal = root.querySelector('#val-cmosEffectFreqHz');
    const ampVal = root.querySelector('#val-cmosEffectAmp');
    const ampRotVal = root.querySelector('#val-cmosEffectAmpRotDeg');
    const decayVal = root.querySelector('#val-cmosEffectDecay');
    const phaseVal = root.querySelector('#val-cmosEffectPhaseDeg');
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
      const mode = normalizeCmosShakeMode(modeSelect?.value ?? 'impulse');
      const partial: Partial<CmosShakeEffectPreset> = {
        label,
        mode,
        strength: num(strengthInput, 0.3),
        spin: num(spinInput, 0),
        dirAngleDeg: num(dirAngleInput, 90),
        dirRadius: num(dirRadiusInput, 1),
        dirRandom: !!dirRandomInput?.checked,
        dirAngleMin: num(dirAngleMinInput, 0),
        dirAngleMax: num(dirAngleMaxInput, 360),
        posKick: num(posKickInput, 0),
        angleKickDeg: num(angleKickInput, 0),
        count: num(countInput, 1),
        intervalMS: num(intervalInput, 50),
        alternate: !!alternateInput?.checked,
        falloff: num(falloffInput, 1),
        durationMS: num(durationInput, 300),
        freqHz: num(freqInput, 12),
        amp: num(ampInput, 0),
        ampRotDeg: num(ampRotInput, 0),
        decay: num(decayInput, 4),
        phaseDeg: num(phaseInput, 0),
      };
      const normalized = normalizeCmosShakeEffectPreset(id || 'draft', partial);
      return { id, ...normalized };
    };

    const writeEditor = (id: string, p: CmosShakeEffectPreset): void => {
      const n = normalizeCmosShakeEffectPreset(id, p);
      if (idInput) idInput.value = id;
      if (labelInput) labelInput.value = n.label ?? id;
      if (modeSelect) modeSelect.value = n.mode;
      if (strengthInput) strengthInput.value = formatNumber(n.strength, 2);
      if (spinInput) spinInput.value = formatNumber(n.spin, 3);
      if (dirAngleInput) dirAngleInput.value = formatNumber(n.dirAngleDeg, 0);
      if (dirRadiusInput) dirRadiusInput.value = formatNumber(n.dirRadius, 2);
      if (dirRandomInput) dirRandomInput.checked = !!n.dirRandom;
      if (dirAngleMinInput) dirAngleMinInput.value = formatNumber(n.dirAngleMin, 0);
      if (dirAngleMaxInput) dirAngleMaxInput.value = formatNumber(n.dirAngleMax, 0);
      if (posKickInput) posKickInput.value = formatNumber(n.posKick, 3);
      if (angleKickInput) angleKickInput.value = formatNumber(n.angleKickDeg, 2);
      if (countInput) countInput.value = String(n.count);
      if (intervalInput) intervalInput.value = formatNumber(n.intervalMS, 0);
      if (alternateInput) alternateInput.checked = !!n.alternate;
      if (falloffInput) falloffInput.value = formatNumber(n.falloff, 2);
      if (durationInput) durationInput.value = formatNumber(n.durationMS, 0);
      if (freqInput) freqInput.value = formatNumber(n.freqHz, 1);
      if (ampInput) ampInput.value = formatNumber(n.amp, 3);
      if (ampRotInput) ampRotInput.value = formatNumber(n.ampRotDeg, 2);
      if (decayInput) decayInput.value = formatNumber(n.decay, 2);
      if (phaseInput) phaseInput.value = formatNumber(n.phaseDeg, 0);

      if (strengthVal) strengthVal.textContent = formatNumber(n.strength, 2);
      if (spinVal) spinVal.textContent = formatNumber(n.spin, 3);
      if (dirAngleVal) dirAngleVal.textContent = formatNumber(n.dirAngleDeg, 0);
      if (dirRadiusVal) dirRadiusVal.textContent = formatNumber(n.dirRadius, 2);
      if (dirRandomVal) dirRandomVal.textContent = n.dirRandom ? '开' : '关';
      if (dirAngleRangeVal) {
        dirAngleRangeVal.textContent = `${formatNumber(n.dirAngleMin, 0)} ~ ${formatNumber(n.dirAngleMax, 0)}`;
      }
      const rowAngle = root.querySelector('#row-cmosEffectDirAngleRange') as HTMLElement | null;
      if (rowAngle) rowAngle.style.display = n.dirRandom ? '' : 'none';
      if (posKickVal) posKickVal.textContent = formatNumber(n.posKick, 3);
      if (angleKickVal) angleKickVal.textContent = formatNumber(n.angleKickDeg, 2);
      if (countVal) countVal.textContent = String(n.count);
      if (intervalVal) intervalVal.textContent = formatNumber(n.intervalMS, 0);
      if (alternateVal) alternateVal.textContent = n.alternate ? '开' : '关';
      if (falloffVal) falloffVal.textContent = formatNumber(n.falloff, 2);
      if (durationVal) durationVal.textContent = formatNumber(n.durationMS, 0);
      if (freqVal) freqVal.textContent = formatNumber(n.freqHz, 1);
      if (ampVal) ampVal.textContent = formatNumber(n.amp, 3);
      if (ampRotVal) ampRotVal.textContent = formatNumber(n.ampRotDeg, 2);
      if (decayVal) decayVal.textContent = formatNumber(n.decay, 2);
      if (phaseVal) phaseVal.textContent = formatNumber(n.phaseDeg, 0);
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
        const mode = p.mode ?? 'impulse';
        btn.title = `播放「${id}」· ${modeLabelZh(mode)}`;
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
        const modeTag =
          p.mode && p.mode !== 'impulse' ? ` · ${modeLabelZh(p.mode)}` : '';
        opt.textContent =
          p.label && p.label !== id
            ? `${id} — ${p.label}${modeTag}`
            : `${id}${modeTag}`;
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
    bindValLabel(strengthInput, strengthVal, 2);
    bindValLabel(spinInput, spinVal, 3);
    bindValLabel(dirAngleInput, dirAngleVal, 0);
    bindValLabel(dirRadiusInput, dirRadiusVal, 2);
    bindValLabel(posKickInput, posKickVal, 3);
    bindValLabel(angleKickInput, angleKickVal, 2);
    bindValLabel(countInput, countVal, 0);
    bindValLabel(intervalInput, intervalVal, 0);
    bindValLabel(falloffInput, falloffVal, 2);
    bindValLabel(durationInput, durationVal, 0);
    bindValLabel(freqInput, freqVal, 1);
    bindValLabel(ampInput, ampVal, 3);
    bindValLabel(ampRotInput, ampRotVal, 2);
    bindValLabel(decayInput, decayVal, 2);
    bindValLabel(phaseInput, phaseVal, 0);

    const syncEffectDirRangeLabels = (): void => {
      const amin = Number(dirAngleMinInput?.value);
      const amax = Number(dirAngleMaxInput?.value);
      if (dirAngleRangeVal && Number.isFinite(amin) && Number.isFinite(amax)) {
        dirAngleRangeVal.textContent = `${formatNumber(amin, 0)} ~ ${formatNumber(amax, 0)}`;
      }
    };
    const syncEffectDirRandomUi = (): void => {
      const on = !!dirRandomInput?.checked;
      if (dirRandomVal) dirRandomVal.textContent = on ? '开' : '关';
      const row = root.querySelector('#row-cmosEffectDirAngleRange') as HTMLElement | null;
      if (row) row.style.display = on ? '' : 'none';
      syncEffectDirRangeLabels();
    };
    for (const el of [dirAngleMinInput, dirAngleMaxInput]) {
      if (!el) continue;
      attachDragScrub(el);
      el.addEventListener('input', syncEffectDirRangeLabels);
    }
    dirRandomInput?.addEventListener('change', syncEffectDirRandomUi);
    syncEffectDirRandomUi();

    alternateInput?.addEventListener('change', () => {
      if (alternateVal) {
        alternateVal.textContent = alternateInput.checked ? '开' : '关';
      }
    });

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
      const next = normalizeCmosShakeEffectPreset(id, {
        ...fields,
        label: editor.label || id,
      });
      presets[id] = next;
      writeEditor(id, next);
      refreshSelect(id);
      onChange('cmosShake.presets', presets, CONFIG);
      setFlash(`已新建震动预设 ${id}（${modeLabelZh(next.mode)}）`);
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
      const next = normalizeCmosShakeEffectPreset(newId, {
        ...fields,
        label: editor.label || newId,
      });
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
      const draft = normalizeCmosShakeEffectPreset(editId || 'draft', fields);
      if (editId && CMOS_ID_RE.test(editId) && CONFIG.cmosShake.presets[editId]) {
        const backup = { ...CONFIG.cmosShake.presets[editId]! };
        CONFIG.cmosShake.presets[editId] = draft;
        onChange(`action:cmosShake:play:${editId}`, null, CONFIG);
        CONFIG.cmosShake.presets[editId] = backup;
        setFlash(`试射 ${editId}（${modeLabelZh(draft.mode)}）`);
        return;
      }
      const tempId = '__panelDraft';
      const presets = ensurePresetsMutable();
      const had = presets[tempId];
      presets[tempId] = { ...draft, label: draft.label || '草稿试射' };
      onChange(`action:cmosShake:play:${tempId}`, null, CONFIG);
      if (had) presets[tempId] = had;
      else delete presets[tempId];
      setFlash(`试射草稿（${modeLabelZh(draft.mode)}，未保存）`);
    });

    root.querySelector('#btn-cmosEffect-fromDebug')?.addEventListener('click', () => {
      const d = CONFIG.cmosShake.debugImpulse;
      if (strengthInput) strengthInput.value = formatNumber(d.strength, 2);
      if (spinInput) spinInput.value = formatNumber(d.spin, 3);
      if (dirAngleInput) dirAngleInput.value = formatNumber(d.dirAngleDeg, 0);
      if (dirRadiusInput) dirRadiusInput.value = formatNumber(d.dirRadius, 2);
      if (dirRandomInput) dirRandomInput.checked = !!d.dirRandom;
      if (dirAngleMinInput) dirAngleMinInput.value = formatNumber(d.dirAngleMin ?? 0, 0);
      if (dirAngleMaxInput) dirAngleMaxInput.value = formatNumber(d.dirAngleMax ?? 360, 0);
      if (modeSelect) modeSelect.value = 'impulse' satisfies CmosShakePresetMode;
      if (strengthVal) strengthVal.textContent = formatNumber(d.strength, 2);
      if (spinVal) spinVal.textContent = formatNumber(d.spin, 3);
      if (dirAngleVal) dirAngleVal.textContent = formatNumber(d.dirAngleDeg, 0);
      if (dirRadiusVal) dirRadiusVal.textContent = formatNumber(d.dirRadius, 2);
      syncEffectDirRandomUi();
      setFlash('已从自定义冲量填入编辑器（需点保存写入预设）');
    });
  }
}

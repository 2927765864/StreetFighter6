/**
 * Combat SFX enhance ControlPanel section.
 * Binds directly to CombatSfxPlayer.params (not CONFIG store).
 */

import type { CombatSfxPlayer } from '../combat/sfx/SfxPlayer';
import type { SfxParams } from '../combat/sfx/SfxParams';

function paramLabel(name: string, hint: string, valueId?: string): string {
  const val = valueId
    ? `<span class="val" id="${valueId}">—</span>`
    : '';
  return `<div class="panel-row-header">
      <span class="param-name"><span>${name}</span><span class="param-hint">${hint}</span></span>
      ${val}
    </div>`;
}

export function sfxSectionHtml(): string {
  return `
      <details class="panel-group" data-cat="音效">
        <summary>音效</summary>
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">【音效】变化 / 力度 / Duck / Pan / 混响</span>
          </div>
          <div class="section-body" id="sect-sfx">
            <p class="panel-hint">运行时 Web Audio 增强（方案 combat-sfx-enhance-v0）。参数即时生效；混响 IR 改时长/衰减后点「重建 IR」。</p>

            <div class="panel-row row-toggle">
              ${paramLabel('启用 SFX', '关=静音全部战斗音效', 'val-sfxEnabled')}
              <input id="inp-sfxEnabled" type="checkbox" />
            </div>
            <div class="panel-row">
              ${paramLabel('主音量', 'SFX master gain', 'val-sfxMaster')}
              <input id="inp-sfxMaster" type="number" min="0" max="1" step="0.01" />
            </div>

            <p class="panel-hint" style="font-weight:600;margin-top:8px">1 · 变化</p>
            <div class="panel-row">
              ${paramLabel('音高抖动', '± rateJitter，约 0.06=±6%', 'val-rateJitter')}
              <input id="inp-rateJitter" type="number" min="0" max="0.2" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('音量抖动', '± gainJitter', 'val-gainJitter')}
              <input id="inp-gainJitter" type="number" min="0" max="0.3" step="0.01" />
            </div>
            <div class="panel-row row-toggle">
              ${paramLabel('Anti-repeat', '多样本时禁止连播同一变体', 'val-antiRepeat')}
              <input id="inp-antiRepeat" type="checkbox" />
            </div>

            <p class="panel-hint" style="font-weight:600;margin-top:8px">2 · 力度分层</p>
            <div class="panel-row">
              ${paramLabel('轻增益 L', 'strengthGainL', 'val-strengthGainL')}
              <input id="inp-strengthGainL" type="number" min="0.5" max="1.5" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('中增益 M', 'strengthGainM', 'val-strengthGainM')}
              <input id="inp-strengthGainM" type="number" min="0.5" max="1.5" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('重增益 H', 'strengthGainH', 'val-strengthGainH')}
              <input id="inp-strengthGainH" type="number" min="0.5" max="1.5" step="0.01" />
            </div>
            <div class="panel-row row-toggle">
              ${paramLabel('层混合', '命中时附加相邻强度甜味层', 'val-layerBlendEnabled')}
              <input id="inp-layerBlendEnabled" type="checkbox" />
            </div>
            <div class="panel-row">
              ${paramLabel('M 附层增益', 'layerGainM', 'val-layerGainM')}
              <input id="inp-layerGainM" type="number" min="0" max="0.5" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('H 附层增益', 'layerGainH', 'val-layerGainH')}
              <input id="inp-layerGainH" type="number" min="0" max="0.5" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('力度音高偏置', 'H +bias / L −bias', 'val-strengthPitchBias')}
              <input id="inp-strengthPitchBias" type="number" min="0" max="0.08" step="0.005" />
            </div>

            <p class="panel-hint" style="font-weight:600;margin-top:8px">3 · 环境床 & Duck</p>
            <div class="panel-row row-toggle">
              ${paramLabel('环境床', '合成噪声床，供 duck 可听', 'val-ambienceEnabled')}
              <input id="inp-ambienceEnabled" type="checkbox" />
            </div>
            <div class="panel-row">
              ${paramLabel('环境音量', 'ambienceLevel', 'val-ambienceLevel')}
              <input id="inp-ambienceLevel" type="number" min="0" max="0.3" step="0.01" />
            </div>
            <div class="panel-row row-toggle">
              ${paramLabel('启用 Duck', '命中/格挡时压环境', 'val-duckEnabled')}
              <input id="inp-duckEnabled" type="checkbox" />
            </div>
            <div class="panel-row">
              ${paramLabel('Duck 目标', '压到 base×target', 'val-duckTarget')}
              <input id="inp-duckTarget" type="number" min="0" max="1" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('Duck Attack', '秒', 'val-duckAttack')}
              <input id="inp-duckAttack" type="number" min="0.005" max="0.1" step="0.005" />
            </div>
            <div class="panel-row">
              ${paramLabel('Duck Hold', '秒', 'val-duckHold')}
              <input id="inp-duckHold" type="number" min="0" max="0.5" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('Duck Release', '秒', 'val-duckRelease')}
              <input id="inp-duckRelease" type="number" min="0.05" max="1" step="0.01" />
            </div>

            <p class="panel-hint" style="font-weight:600;margin-top:8px">4 · 立体声像</p>
            <div class="panel-row row-toggle">
              ${paramLabel('启用 Pan', '按角色左右轻微声像', 'val-panEnabled')}
              <input id="inp-panEnabled" type="checkbox" />
            </div>
            <div class="panel-row">
              ${paramLabel('Pan 符号', '1=世界X；-1=纠正左右反（默认）', 'val-panSign')}
              <input id="inp-panSign" type="number" min="-1" max="1" step="2" />
            </div>
            <div class="panel-row">
              ${paramLabel('Pan 缩放', 'panScale', 'val-panScale')}
              <input id="inp-panScale" type="number" min="0" max="1" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('Pan 上限', 'panMax', 'val-panMax')}
              <input id="inp-panMax" type="number" min="0" max="1" step="0.01" />
            </div>

            <p class="panel-hint" style="font-weight:600;margin-top:8px">5 · 小房间混响</p>
            <div class="panel-row row-toggle">
              ${paramLabel('启用混响', '共享 Convolver send', 'val-reverbEnabled')}
              <input id="inp-reverbEnabled" type="checkbox" />
            </div>
            <div class="panel-row">
              ${paramLabel('Send 量', '默认宜低，保脆', 'val-reverbSend')}
              <input id="inp-reverbSend" type="number" min="0" max="0.4" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('IR 时长 (s)', '改后需重建 IR', 'val-irDurationSec')}
              <input id="inp-irDurationSec" type="number" min="0.1" max="1" step="0.01" />
            </div>
            <div class="panel-row">
              ${paramLabel('IR 衰减幂', '越大尾巴越短', 'val-irDecayPower')}
              <input id="inp-irDecayPower" type="number" min="1" max="4" step="0.1" />
            </div>
            <div class="panel-row">
              <button type="button" id="btn-sfx-rebuild-ir" class="panel-btn">重建 IR</button>
              <button type="button" id="btn-sfx-test-hit" class="panel-btn">试听命中</button>
            </div>
          </div>
        </div>
      </details>`;
}

type NumKey = {
  [K in keyof SfxParams]: SfxParams[K] extends number ? K : never;
}[keyof SfxParams];

type BoolKey = {
  [K in keyof SfxParams]: SfxParams[K] extends boolean ? K : never;
}[keyof SfxParams];

const NUM_KEYS: NumKey[] = [
  'sfxMaster',
  'rateJitter',
  'gainJitter',
  'strengthGainL',
  'strengthGainM',
  'strengthGainH',
  'layerGainM',
  'layerGainH',
  'strengthPitchBias',
  'ambienceLevel',
  'duckTarget',
  'duckAttack',
  'duckHold',
  'duckRelease',
  'panSign',
  'panScale',
  'panMax',
  'reverbSend',
  'irDurationSec',
  'irDecayPower',
];

const BOOL_KEYS: BoolKey[] = [
  'sfxEnabled',
  'antiRepeat',
  'layerBlendEnabled',
  'ambienceEnabled',
  'duckEnabled',
  'panEnabled',
  'reverbEnabled',
];

const GRAPH_SYNC_KEYS = new Set<string>([
  'ambienceEnabled',
  'ambienceLevel',
  'reverbEnabled',
]);

export function bindSfxPanel(
  root: HTMLElement,
  player: CombatSfxPlayer | undefined,
  syncers: Array<() => void>,
): void {
  if (!player) return;
  const p = player.params;

  const fmt = (n: number) => {
    if (!Number.isFinite(n)) return '—';
    return String(Math.round(n * 1000) / 1000);
  };

  for (const key of BOOL_KEYS) {
    const inp = root.querySelector<HTMLInputElement>(`#inp-${key}`);
    const val = root.querySelector<HTMLElement>(`#val-${key}`);
    if (!inp) continue;
    const sync = () => {
      inp.checked = p[key];
      if (val) val.textContent = p[key] ? '开' : '关';
    };
    syncers.push(sync);
    sync();
    inp.addEventListener('change', () => {
      p[key] = inp.checked;
      if (GRAPH_SYNC_KEYS.has(key)) player.syncGraphFromParams();
      sync();
    });
  }

  for (const key of NUM_KEYS) {
    const inp = root.querySelector<HTMLInputElement>(`#inp-${key}`);
    const val = root.querySelector<HTMLElement>(`#val-${key}`);
    if (!inp) continue;
    const sync = () => {
      inp.value = String(p[key]);
      if (val) val.textContent = fmt(p[key]);
    };
    syncers.push(sync);
    sync();
    inp.addEventListener('change', () => {
      const n = Number(inp.value);
      if (!Number.isFinite(n)) return;
      p[key] = n;
      if (GRAPH_SYNC_KEYS.has(key)) player.syncGraphFromParams();
      sync();
    });
  }

  root.querySelector('#btn-sfx-rebuild-ir')?.addEventListener('click', () => {
    player.unlock();
    player.rebuildIR();
  });
  root.querySelector('#btn-sfx-test-hit')?.addEventListener('click', () => {
    player.unlock();
    player.handle({
      kind: 'hit',
      moveId: 'ryu_5mp',
      guardStrength: 'M',
      sourceSide: 'p2',
    });
  });
}

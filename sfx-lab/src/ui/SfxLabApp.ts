import { LAYER_LABELS, SFX_SLOTS, type SfxLayer, type SfxSlotDef } from '../data/slots';

type BankSummary = {
  id: string;
  layerHint: string | null;
  count: number;
  converted: number;
  note?: string | null;
  sourceRoot?: string | null;
  likelyIncomplete?: boolean;
  hircObjects?: number | null;
};

type CatalogEntry = {
  wemId: number;
  file: string;
  bytes: number;
  preview?: string | null;
  wav?: string | null;
  durationSec?: number | null;
  convert?: { ok?: boolean; error?: string };
  /** Best-effort Wwise event label (resolved name or bank-index fallback). */
  eventLabel?: string | null;
  events?: Array<{
    eventId?: number | null;
    name?: string | null;
    display?: string | null;
    switches?: string[];
  }>;
};

type Catalog = {
  bankId?: string;
  layerHint?: string | null;
  count: number;
  entries: CatalogEntry[];
};

type Assignment = {
  status: 'accepted' | 'candidate' | 'rejected';
  bankId: string;
  wemId: number;
  note?: string;
};

type Acceptance = {
  version: number;
  assignments: Record<string, Assignment>;
};

type SlotBind = { slotId: string; label: string; status: Assignment['status'] };

export class SfxLabApp {
  private root: HTMLElement;
  private banks: BankSummary[] = [];
  private bankId: string | null = null;
  private catalog: Catalog | null = null;
  private selectedWemId: number | null = null;
  private selectedSlotId: string = SFX_SLOTS[0]!.id;
  private acceptance: Acceptance = { version: 1, assignments: {} };
  private audio = new Audio();
  private statusEl: HTMLElement | null = null;
  private saveSeq = 0;
  private saving = false;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async start(): Promise<void> {
    this.renderShell();
    await this.reloadAll();
  }

  private slotById(id: string): SfxSlotDef | undefined {
    return SFX_SLOTS.find((s) => s.id === id);
  }

  /** All slots currently bound to a given bank/wem sample. */
  private bindsForSample(bankId: string | null, wemId: number): SlotBind[] {
    if (!bankId) return [];
    const out: SlotBind[] = [];
    for (const [slotId, a] of Object.entries(this.acceptance.assignments)) {
      if (a.bankId === bankId && a.wemId === wemId) {
        out.push({
          slotId,
          label: this.slotById(slotId)?.label ?? slotId,
          status: a.status,
        });
      }
    }
    return out.sort((a, b) => a.slotId.localeCompare(b.slotId));
  }

  private async reloadAll(): Promise<void> {
    try {
      const [banksRes, accRes] = await Promise.all([
        fetch('/api/banks'),
        fetch('/api/acceptance'),
      ]);
      const banksJson = (await banksRes.json()) as { banks: BankSummary[] };
      this.banks = banksJson.banks || [];
      this.acceptance = (await accRes.json()) as Acceptance;
      if (!this.acceptance.assignments) this.acceptance.assignments = {};
      if (!this.bankId && this.banks[0]) this.bankId = this.banks[0].id;
      if (this.bankId) await this.loadBank(this.bankId);
      else this.paint();
    } catch (e) {
      this.setStatus(`加载失败：${String(e)}\n请先在 sfx-lab 目录运行 npm run pipeline`);
      this.paint();
    }
  }

  private async loadBank(id: string, preferWemId?: number | null): Promise<void> {
    this.bankId = id;
    const res = await fetch(`/api/banks/${encodeURIComponent(id)}`);
    if (!res.ok) {
      this.catalog = null;
      this.setStatus('bank catalog 不存在，请 npm run pipeline');
      this.paint();
      return;
    }
    this.catalog = (await res.json()) as Catalog;
    const hasPrefer =
      preferWemId != null && this.catalog.entries.some((e) => e.wemId === preferWemId);
    this.selectedWemId = hasPrefer
      ? preferWemId!
      : (this.catalog.entries[0]?.wemId ?? null);
    this.paint();
    if (hasPrefer && preferWemId != null) this.scrollSampleIntoView(preferWemId);
  }

  private scrollSampleIntoView(wemId: number): void {
    requestAnimationFrame(() => {
      const el = this.root.querySelector(`[data-pane="samples"] [data-wem="${wemId}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  }

  /** Jump samples list to the clip bound to this slot; no-op if empty. */
  private async focusSlotSample(slotId: string): Promise<void> {
    this.selectedSlotId = slotId;
    const a = this.acceptance.assignments[slotId];
    if (!a) {
      this.paint();
      this.setStatus(`${slotId} 尚未指定片段`);
      return;
    }
    if (this.bankId === a.bankId && this.catalog) {
      const exists = this.catalog.entries.some((e) => e.wemId === a.wemId);
      if (!exists) {
        this.paint();
        this.setStatus(`${slotId} 绑定的 ${a.bankId}/${a.wemId} 不在当前 bank catalog`);
        return;
      }
      this.playWem(a.wemId);
      this.scrollSampleIntoView(a.wemId);
      this.setStatus(`已定位 ${slotId} → ${a.bankId}/${a.wemId}`);
      return;
    }
    await this.loadBank(a.bankId, a.wemId);
    this.playWem(a.wemId);
    this.setStatus(`已定位 ${slotId} → ${a.bankId}/${a.wemId}`);
  }

  private previewUrl(entry: CatalogEntry): string | null {
    if (!this.bankId || !entry.preview) return null;
    return `/work/banks/${encodeURIComponent(this.bankId)}/${entry.preview}`;
  }

  private playWem(wemId: number): void {
    this.selectedWemId = wemId;
    const entry = this.catalog?.entries.find((e) => e.wemId === wemId);
    if (!entry) return;
    const url = this.previewUrl(entry);
    if (!url) {
      this.setStatus('该条尚无 preview（需 convert 成功）');
      this.paint();
      return;
    }
    this.audio.src = url;
    void this.audio.play().catch((e) => this.setStatus(`播放失败：${String(e)}`));
    this.paint();
  }

  /** Persist acceptance after every mutation. */
  private async saveAcceptance(quiet = false): Promise<void> {
    const seq = ++this.saveSeq;
    this.saving = true;
    if (!quiet) this.setStatus('保存中…');
    try {
      const res = await fetch('/api/acceptance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.acceptance),
      });
      if (seq !== this.saveSeq) return;
      if (!res.ok) {
        this.setStatus('自动保存失败');
        return;
      }
      this.setStatus(`已自动保存 · ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      if (seq !== this.saveSeq) return;
      this.setStatus(`自动保存失败：${String(e)}`);
    } finally {
      if (seq === this.saveSeq) this.saving = false;
    }
  }

  /** Assign current bank sample → slot as accepted (overwrites that slot). */
  private async assignSampleToSlot(wemId: number, slotId: string): Promise<void> {
    if (!this.bankId) return;
    this.selectedWemId = wemId;
    this.selectedSlotId = slotId;
    this.acceptance.assignments[slotId] = {
      status: 'accepted',
      bankId: this.bankId,
      wemId,
    };
    this.paint();
    await this.saveAcceptance();
  }

  private async clearSlot(slotId: string): Promise<void> {
    delete this.acceptance.assignments[slotId];
    if (this.selectedSlotId === slotId) {
      /* keep selection for overview */
    }
    this.paint();
    await this.saveAcceptance();
  }

  private async exportRuntime(): Promise<void> {
    if (this.saving) await this.saveAcceptance(true);
    this.setStatus('正在导出到 private/runtime/sfx …');
    const res = await fetch('/api/export', { method: 'POST' });
    const json = (await res.json()) as { ok: boolean; stdout?: string; stderr?: string };
    if (!json.ok) {
      this.setStatus(`导出失败\n${json.stderr || json.stdout || ''}`);
      return;
    }
    this.setStatus(`导出成功\n${json.stdout || ''}`);
  }

  private setStatus(msg: string): void {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  private slotOptionsHtml(selectedSlotId?: string): string {
    const groups = (Object.keys(LAYER_LABELS) as SfxLayer[]).map((layer) => {
      const opts = SFX_SLOTS.filter((s) => s.layer === layer)
        .map(
          (s) =>
            `<option value="${s.id}" ${s.id === selectedSlotId ? 'selected' : ''}>${s.label} (${s.id})</option>`,
        )
        .join('');
      return `<optgroup label="${LAYER_LABELS[layer]}">${opts}</optgroup>`;
    });
    return `<option value="">指定到槽位…</option>${groups.join('')}`;
  }

  private renderShell(): void {
    this.root.innerHTML = `
      <header>
        <h1>SFX Lab · 四层音效验收</h1>
        <span class="hint">在采样行直接指定槽位（自动 accepted + 自动保存）→ 导出 private/runtime/sfx</span>
        <button type="button" data-act="reload">刷新</button>
        <button type="button" class="primary" data-act="export">导出到 runtime</button>
      </header>
      <div class="layout">
        <aside class="panel" data-pane="banks"></aside>
        <main class="panel" data-pane="samples"></main>
        <aside class="panel" data-pane="slots"></aside>
      </div>
      <div class="player-bar">
        <button type="button" data-act="play">试听选中</button>
        <audio controls></audio>
        <div class="status" data-status></div>
      </div>
    `;
    this.statusEl = this.root.querySelector('[data-status]');
    const audioEl = this.root.querySelector('audio');
    if (audioEl) this.audio = audioEl;

    this.root.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;

      // Don't treat control clicks as row selection.
      if (t.closest('select, option, button, a, input, label, .slot-chip')) {
        const act = t.getAttribute('data-act') || t.closest('[data-act]')?.getAttribute('data-act');
        if (act === 'reload') void this.reloadAll();
        if (act === 'export') void this.exportRuntime();
        if (act === 'play') {
          if (this.selectedWemId != null) this.playWem(this.selectedWemId);
        }
        if (act === 'clear-slot') {
          const slotId = t.getAttribute('data-slot-id') || t.closest('[data-slot-id]')?.getAttribute('data-slot-id');
          if (slotId) void this.clearSlot(slotId);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (act === 'unbind-chip') {
          const slotId = t.getAttribute('data-slot-id');
          if (slotId) void this.clearSlot(slotId);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (t.closest('select, option, button, input, label, .slot-chip')) {
          // bank/slot row handling below may still apply for non-control areas
          if (t.closest('select, button, .slot-chip')) return;
        }
      }

      const bank = t.closest('[data-bank]') as HTMLElement | null;
      if (bank?.dataset.bank) {
        void this.loadBank(bank.dataset.bank);
        return;
      }

      const sample = t.closest('[data-wem]') as HTMLElement | null;
      if (sample?.dataset.wem && !t.closest('select, button, .slot-chip')) {
        this.playWem(Number(sample.dataset.wem));
        return;
      }

      const slot = t.closest('[data-slot]') as HTMLElement | null;
      if (slot?.dataset.slot && !t.closest('button')) {
        void this.focusSlotSample(slot.dataset.slot);
      }
    });

    this.root.addEventListener('change', (ev) => {
      const t = ev.target as HTMLSelectElement | null;
      if (!t || t.tagName !== 'SELECT') return;
      if (t.dataset.assignWem) {
        const wemId = Number(t.dataset.assignWem);
        const slotId = t.value;
        t.value = '';
        if (!slotId || !Number.isFinite(wemId)) return;
        void this.assignSampleToSlot(wemId, slotId);
      }
    });
  }

  private paint(): void {
    const banksPane = this.root.querySelector('[data-pane="banks"]');
    const samplesPane = this.root.querySelector('[data-pane="samples"]');
    const slotsPane = this.root.querySelector('[data-pane="slots"]');
    if (!banksPane || !samplesPane || !slotsPane) return;

    if (this.banks.length === 0) {
      banksPane.innerHTML = `
        <h2>Banks</h2>
        <p class="meta">尚无 work/banks。在本目录执行：</p>
        <pre class="status">npm run pipeline</pre>
      `;
    } else {
      banksPane.innerHTML = `
        <h2>Banks</h2>
        <ul class="bank-list">
          ${this.banks
            .map(
              (b) => `
            <li data-bank="${b.id}" class="${b.id === this.bankId ? 'active' : ''}">
              <div><strong>${b.id}</strong>
                ${b.likelyIncomplete ? '<span class="badge rejected">incomplete?</span>' : ''}
                ${b.layerHint === 'swing_confirmed' ? '<span class="badge accepted">confirmed</span>' : ''}
              </div>
              <div class="meta">${b.layerHint ?? '—'} · ${b.converted}/${b.count} preview · ${b.sourceRoot ?? '?'}${b.hircObjects != null ? ` · HIRC ${b.hircObjects}` : ''}</div>
              ${b.note ? `<div class="meta">${b.note}</div>` : ''}
            </li>`,
            )
            .join('')}
        </ul>
      `;
    }

    const entries = this.catalog?.entries ?? [];
    samplesPane.innerHTML = `
      <h2>Samples · ${this.bankId ?? '—'}</h2>
      <p class="meta">下拉直接指定槽位（写入 accepted 并自动保存）。芯片上的 × 可解除绑定。</p>
      <div class="row">
        <button type="button" data-act="play">试听选中</button>
        <span class="meta">${entries.length} 条</span>
      </div>
      <ul class="sample-list">
        ${entries
          .map((e) => {
            const dur =
              e.durationSec != null && Number.isFinite(e.durationSec)
                ? `${e.durationSec.toFixed(2)}s`
                : '—';
            const ready = e.preview ? 'ready' : 'no-preview';
            const binds = this.bindsForSample(this.bankId, e.wemId);
            const chips =
              binds.length === 0
                ? `<span class="badge missing">未指定槽位</span>`
                : binds
                    .map(
                      (b) => `
                  <span class="slot-chip ${b.status}" title="${b.slotId}">
                    ${b.label}
                    <button type="button" class="chip-x" data-act="unbind-chip" data-slot-id="${b.slotId}" aria-label="解除 ${b.slotId}">×</button>
                  </span>`,
                    )
                    .join('');
            const eventLabel = e.eventLabel || '(未还原事件名)';
            const named = Boolean(e.events?.some((ev) => ev.name));
            return `
            <li data-wem="${e.wemId}" class="${e.wemId === this.selectedWemId ? 'active' : ''} ${binds.length ? 'bound' : ''}">
              <div class="sample-head">
                <div>
                  <div class="event-label ${named ? 'named' : 'fallback'}" title="${eventLabel}">${eventLabel}</div>
                  <strong class="wem-id">${e.wemId}</strong>
                  <span class="badge">${ready}</span>
                  ${named ? '<span class="badge accepted">named</span>' : '<span class="badge missing">id-only</span>'}
                  <span class="meta">${(e.bytes / 1024).toFixed(1)} KB · ${dur}</span>
                </div>
                <select data-assign-wem="${e.wemId}" title="指定到槽位">
                  ${this.slotOptionsHtml()}
                </select>
              </div>
              <div class="bind-row">${chips}</div>
            </li>`;
          })
          .join('')}
      </ul>
    `;

    const byLayer = (layer: SfxLayer) => SFX_SLOTS.filter((s) => s.layer === layer);
    slotsPane.innerHTML = `
      <h2>槽位总览</h2>
      <p class="meta">点击已绑定槽位可跳到对应采样；空槽不跳转。清除用芯片 × 或下方按钮。</p>
      ${(Object.keys(LAYER_LABELS) as SfxLayer[])
        .map((layer) => {
          const items = byLayer(layer)
            .map((s) => {
              const a = this.acceptance.assignments[s.id];
              const badge = a
                ? `<span class="badge ${a.status}">${a.status} · ${a.bankId}/${a.wemId}</span>`
                : `<span class="badge missing">empty</span>`;
              const clearBtn = a
                ? `<button type="button" data-act="clear-slot" data-slot-id="${s.id}">清除</button>`
                : '';
              return `
              <li data-slot="${s.id}" class="${s.id === this.selectedSlotId ? 'active' : ''}">
                <div><strong>${s.label}</strong></div>
                <div class="meta">${s.id}</div>
                <div class="row">${badge} ${clearBtn}</div>
              </li>`;
            })
            .join('');
          return `<h2>${LAYER_LABELS[layer]}</h2><ul class="slot-list">${items}</ul>`;
        })
        .join('')}
    `;
  }
}

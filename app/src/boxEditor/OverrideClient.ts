import type { MoveDefinition } from '../combat/move/MoveDefinition';
import type { StanceBoxTable } from '../data/loadStanceBoxes';
import {
  fetchOverrideManifest,
  type OverrideManifest,
} from '../data/resolveOverrides';
import { downloadJson } from '../config/persist';

async function putJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body, null, 2),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PUT ${url} failed: ${res.status} ${t}`);
  }
}

async function del(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`DELETE ${url} failed: ${res.status} ${t}`);
  }
}

export class OverrideClient {
  autoSaveEnabled = true;
  debounceMs = 300;
  private moveTimer: ReturnType<typeof setTimeout> | null = null;
  private stanceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingMoveId: string | null = null;
  lastError: string | null = null;
  saving = false;

  async getManifest(): Promise<OverrideManifest> {
    try {
      const res = await fetch('/api/box-overrides/manifest', {
        cache: 'no-store',
      });
      if (res.ok) return (await res.json()) as OverrideManifest;
    } catch {
      /* fall through */
    }
    return fetchOverrideManifest();
  }

  async saveMoveNow(moveId: string, def: MoveDefinition): Promise<void> {
    this.saving = true;
    this.lastError = null;
    try {
      await putJson(`/api/box-overrides/moves/${encodeURIComponent(moveId)}`, def);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      downloadJson(`${moveId}.override.json`, def);
      throw e;
    } finally {
      this.saving = false;
    }
  }

  scheduleSaveMove(moveId: string, getDef: () => MoveDefinition | null): void {
    if (!this.autoSaveEnabled) return;
    this.pendingMoveId = moveId;
    if (this.moveTimer) clearTimeout(this.moveTimer);
    this.moveTimer = setTimeout(() => {
      const id = this.pendingMoveId;
      this.moveTimer = null;
      if (!id) return;
      const def = getDef();
      if (!def || def.moveId !== id && def.id !== id) return;
      void this.saveMoveNow(id, def).catch(() => undefined);
    }, this.debounceMs);
  }

  async flushMove(moveId: string, getDef: () => MoveDefinition | null): Promise<void> {
    if (this.moveTimer) {
      clearTimeout(this.moveTimer);
      this.moveTimer = null;
    }
    const def = getDef();
    if (def) await this.saveMoveNow(moveId, def);
  }

  async saveStanceNow(table: StanceBoxTable): Promise<void> {
    this.saving = true;
    this.lastError = null;
    try {
      await putJson('/api/box-overrides/stance', table);
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      downloadJson('ryu_stance_boxes.override.json', table);
      throw e;
    } finally {
      this.saving = false;
    }
  }

  scheduleSaveStance(getTable: () => StanceBoxTable | null): void {
    if (!this.autoSaveEnabled) return;
    if (this.stanceTimer) clearTimeout(this.stanceTimer);
    this.stanceTimer = setTimeout(() => {
      this.stanceTimer = null;
      const t = getTable();
      if (t) void this.saveStanceNow(t).catch(() => undefined);
    }, this.debounceMs);
  }

  async restoreMove(moveId: string): Promise<void> {
    await del(`/api/box-overrides/moves/${encodeURIComponent(moveId)}`);
  }

  async restoreStance(): Promise<void> {
    await del('/api/box-overrides/stance');
  }

  async restoreAll(): Promise<void> {
    await del('/api/box-overrides/all');
  }
}

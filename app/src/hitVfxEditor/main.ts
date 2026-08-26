import { cloneConfig, CONFIG, setActiveDefaultConfig } from '../config/store';
import {
  loadHitVfxEditorDraft,
  loadSavedConfig,
  loadShippingConfig,
} from '../config/persist';
import { bootHitVfxEditor } from './HitVfxEditorApp';

async function main(): Promise<void> {
  setActiveDefaultConfig(cloneConfig(CONFIG));
  await loadShippingConfig();
  loadSavedConfig();
  loadHitVfxEditorDraft();
  await bootHitVfxEditor();
}

main().catch((err) => {
  console.error('[hit-vfx editor] boot failed', err);
  const pre = document.createElement('pre');
  pre.style.cssText =
    'position:fixed;left:12px;top:12px;z-index:20;padding:12px;background:#300;color:#fcc;max-width:90vw;white-space:pre-wrap';
  pre.textContent = String(err?.stack ?? err);
  document.body.appendChild(pre);
});

import {
  HITBOX_COLOR,
  HURTBOX_COLOR,
  PUSHBOX_COLOR,
  createDefaultSimConfig,
} from '../config/constants';

export const BOX_EDITOR_STORAGE_KEY = 'sf6BoxEditorConfig';

export type BoxEditorConfig = {
  showHitboxes: boolean;
  showHurtboxes: boolean;
  showPushboxes: boolean;
  hurtPartColors: boolean;
  hitboxColor: number;
  hurtboxColor: number;
  pushboxColor: number;
  showTimelineHit: boolean;
  showTimelineHurt: boolean;
  showTimelinePush: boolean;
  showDebugGrid: boolean;
  showOriginMarker: boolean;
  scrubFromLogic: boolean;
  scrubMode: 'uniform' | 'truncate';
  playbackFps: number;
  loop: boolean;
  playhead: number;
  worldScale: number;
  modelScale: number;
  modelYOffset: number;
  editorFacing: 1 | -1;
  originX: number;
  originY: number;
  boxDragMinSize: number;
  autoSaveDebounceMs: number;
  undoLimit: number;
  autoSaveEnabled: boolean;
  preferOverride: boolean;
  apiBase: string;
  cameraZ: number;
  cameraY: number;
  cameraLookY: number;
  cameraFov: number;
};

export function createDefaultBoxEditorConfig(): BoxEditorConfig {
  const sim = createDefaultSimConfig();
  return {
    showHitboxes: true,
    showHurtboxes: true,
    showPushboxes: true,
    hurtPartColors: true,
    hitboxColor: HITBOX_COLOR,
    hurtboxColor: HURTBOX_COLOR,
    pushboxColor: PUSHBOX_COLOR,
    showTimelineHit: true,
    showTimelineHurt: true,
    showTimelinePush: true,
    showDebugGrid: true,
    showOriginMarker: true,
    scrubFromLogic: true,
    scrubMode: 'uniform',
    playbackFps: 60,
    loop: true,
    playhead: 0,
    worldScale: sim.worldScale,
    modelScale: sim.modelScale,
    modelYOffset: sim.modelYOffset,
    editorFacing: 1,
    originX: 0,
    originY: 0,
    boxDragMinSize: 0.05,
    autoSaveDebounceMs: 300,
    undoLimit: 100,
    autoSaveEnabled: true,
    preferOverride: true,
    apiBase: '',
    cameraZ: sim.cameraZ,
    cameraY: sim.cameraY,
    cameraLookY: sim.cameraLookY,
    cameraFov: sim.cameraFov,
  };
}

export function loadBoxEditorConfig(): BoxEditorConfig {
  const base = createDefaultBoxEditorConfig();
  try {
    const raw = localStorage.getItem(BOX_EDITOR_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<BoxEditorConfig>;
    return { ...base, ...parsed, editorFacing: parsed.editorFacing === -1 ? -1 : 1 };
  } catch {
    return base;
  }
}

export function saveBoxEditorConfig(cfg: BoxEditorConfig): void {
  try {
    localStorage.setItem(BOX_EDITOR_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* quota */
  }
}

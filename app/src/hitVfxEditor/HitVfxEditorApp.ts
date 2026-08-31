import * as THREE from 'three/webgpu';
import { DynamicLighting } from 'three/addons/lighting/DynamicLighting.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from '../config/store';
import { createLightRig } from '../render/LightRig';
import { refreshTrainingLighting } from '../render/trainingLighting';
import { StageView } from '../render/StageView';
import { HitVfxRuntime } from '../render/hitVfx/HitVfxRuntime';
import { HitVfxDirector } from '../render/hitVfx/HitVfxDirector';
import { HitVfxPreviewDummy } from '../render/hitVfx/HitVfxPreviewDummy';
import { setupHitVfxEditorPanel } from './HitVfxEditorPanel';

import stageUrl from '@interim/SF6 Training Stage/SF6 Training Stage.glb?url';

/** MatchSim round-start X so follow lights resolve like standing fighters. */
const EDITOR_P1_LOGIC_X = -1.2;
const EDITOR_P2_LOGIC_X = 1.2;

function editorGizmoElementId(): string | null {
  const recipe =
    CONFIG.hitVfxRecipes.find((r) => r.id === CONFIG.hitVfxSelectedRecipeId) ??
    CONFIG.hitVfxRecipes[0];
  const el = recipe?.elements.find(
    (e) => e.id === CONFIG.hitVfxSelectedElementId,
  );
  return el?.type === 'volumeSmoke' ? el.id : null;
}

function runtimeSlice() {
  return {
    hitVfxEnabled: CONFIG.hitVfxEnabled,
    hitVfxRecipes: CONFIG.hitVfxRecipes,
    hitVfxActiveRecipeOnHitId: CONFIG.hitVfxActiveRecipeOnHitId,
    hitVfxActiveRecipeOnBlockId: CONFIG.hitVfxActiveRecipeOnBlockId,
    hitVfxTimeScale: CONFIG.hitVfxTimeScale,
    hitVfxPaused: CONFIG.hitVfxPaused,
    hitVfxStepFrames: CONFIG.hitVfxStepFrames,
    hitVfxSeedLocked: CONFIG.hitVfxSeedLocked,
    hitVfxSeed: CONFIG.hitVfxSeed,
    hitVfxFollowHitstop: CONFIG.hitVfxFollowHitstop,
    hitVfxHeightOffsets: CONFIG.hitVfxHeightOffsets,
    hitVfxMaxConcurrent: CONFIG.hitVfxMaxConcurrent,
    hitVfxSparkLightPoolSize: CONFIG.hitVfxSparkLightPoolSize,
    hitVfxDebug: CONFIG.hitVfxDebug,
    modelYOffset: CONFIG.modelYOffset,
    hitVfxEditorGizmoElementId: editorGizmoElementId(),
  };
}

function sizeRendererToSlot(
  renderer: THREE.WebGPURenderer,
  camera: THREE.PerspectiveCamera,
  slot: HTMLElement,
): void {
  const w = Math.max(1, slot.clientWidth);
  const h = Math.max(1, slot.clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

export async function bootHitVfxEditor(): Promise<void> {
  const host = document.createElement('div');
  host.id = 'hitvfx-canvas-host';

  const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: false });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(1, 1, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  if (CONFIG.lightUseDynamicLighting) {
    const r = renderer as THREE.WebGPURenderer & {
      lighting?: InstanceType<typeof DynamicLighting>;
    };
    r.lighting = new DynamicLighting({
      maxDirectionalLights: 12,
      // +2: volume-smoke original Point key + spark pool headroom
      maxPointLights: 12 + Math.max(4, CONFIG.hitVfxSparkLightPoolSize) + 2,
      // +1: volume-smoke original Spot key
      maxSpotLights: 8 + 1,
      maxHemisphereLights: 2,
    });
  }
  renderer.shadowMap.enabled = CONFIG.shadowMapEnabled;

  const scene = new THREE.Scene();
  // Same as main: Fog must exist before applyEnvironment updates it.
  scene.fog = new THREE.Fog(CONFIG.fogColor, CONFIG.fogNear, CONFIG.fogFar);

  const camera = new THREE.PerspectiveCamera(
    CONFIG.cameraFov,
    window.innerWidth / window.innerHeight,
    CONFIG.cameraNear,
    CONFIG.cameraFar,
  );
  camera.position.set(0, CONFIG.cameraY, CONFIG.cameraZ);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, CONFIG.cameraLookY, 0);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, CONFIG.cameraLookY, 0);

  const lights = createLightRig(THREE, scene);
  const editorFollowOrigins = () => ({
    p1: {
      x: EDITOR_P1_LOGIC_X * CONFIG.worldScale,
      y: CONFIG.modelYOffset,
    },
    p2: {
      x: EDITOR_P2_LOGIC_X * CONFIG.worldScale,
      y: CONFIG.modelYOffset,
    },
  });

  const stage = new StageView(scene);
  await stage.load(stageUrl, CONFIG.stageFitWidth);
  stage.applyLayout({
    targetWidth: CONFIG.stageFitWidth,
    originX: CONFIG.stageOriginX,
    originZ: CONFIG.stageOriginZ,
  });

  // Same overlay scene as training — spark lights stay out of the stage graph.
  const hitVfxScene = new THREE.Scene();
  hitVfxScene.name = 'HitVfxOverlay';

  const hitVfxRuntime = new HitVfxRuntime({
    renderer,
    scene: hitVfxScene,
    camera,
    config: runtimeSlice(),
    lightRig: lights,
  });
  const hitVfxDirector = new HitVfxDirector(hitVfxRuntime);

  const dummy = new HitVfxPreviewDummy();
  scene.add(dummy.root);
  dummy.setPosition(0, 0, 0);
  dummy.setVisible(CONFIG.hitVfxPreviewDummyVisible);

  // Same selective roots shape as main (p1/p2). Dummy stands in for p1.
  const emptyP2 = new THREE.Group();
  emptyP2.name = 'HitVfxEditorEmptyP2';

  const refreshLighting = (): void => {
    // Spark pool lives in hitVfxScene — never bind into character lightsNode.
    refreshTrainingLighting({
      THREE,
      renderer,
      scene,
      rig: lights,
      cfg: CONFIG,
      origins: editorFollowOrigins(),
      roots: {
        stage: stage.root,
        p1: dummy.root,
        p2: emptyP2,
      },
    });
    lights.helperGroup.visible = false;
  };

  refreshLighting();

  const syncRuntime = (): void => {
    hitVfxRuntime.applyConfig(runtimeSlice());
    dummy.setVisible(CONFIG.hitVfxPreviewDummyVisible);
    refreshLighting();
  };

  /** True while auto-replaying after「循环重放」+「重放」. */
  let loopPlaying = false;
  /** Avoid retrigger before the first spawn is counted as active. */
  let sawActiveWhileLooping = false;

  const firePreview = (): void => {
    syncRuntime();
    const prevHit = CONFIG.hitVfxActiveRecipeOnHitId;
    const prevBlock = CONFIG.hitVfxActiveRecipeOnBlockId;
    if (CONFIG.hitVfxPreviewKind === 'onHit') {
      CONFIG.hitVfxActiveRecipeOnHitId = CONFIG.hitVfxSelectedRecipeId;
    } else {
      CONFIG.hitVfxActiveRecipeOnBlockId = CONFIG.hitVfxSelectedRecipeId;
    }
    hitVfxRuntime.applyConfig(runtimeSlice());
    hitVfxDirector.previewTrigger({
      kind: CONFIG.hitVfxPreviewKind,
      strength: CONFIG.hitVfxPreviewStrength,
      height: CONFIG.hitVfxPreviewHeight,
      x: 0,
      facing: 1,
    });
    CONFIG.hitVfxActiveRecipeOnHitId = prevHit;
    CONFIG.hitVfxActiveRecipeOnBlockId = prevBlock;
    hitVfxRuntime.applyConfig(runtimeSlice());
  };

  const stopLoop = (): void => {
    loopPlaying = false;
    sawActiveWhileLooping = false;
  };

  setupHitVfxEditorPanel({
    replay: () => {
      if (loopPlaying) {
        stopLoop();
        return '已停止循环重放';
      }
      firePreview();
      if (CONFIG.hitVfxPreviewLoop) {
        loopPlaying = true;
        sawActiveWhileLooping = hitVfxRuntime.getActiveCount() > 0;
        return '已开始循环重放';
      }
      return '已重放';
    },
    replayNow: () => {
      firePreview();
      if (loopPlaying) {
        sawActiveWhileLooping = hitVfxRuntime.getActiveCount() > 0;
      }
    },
    replayVolumeSmokeElement: (elementId) => {
      syncRuntime();
      const prevHit = CONFIG.hitVfxActiveRecipeOnHitId;
      const prevBlock = CONFIG.hitVfxActiveRecipeOnBlockId;
      if (CONFIG.hitVfxPreviewKind === 'onHit') {
        CONFIG.hitVfxActiveRecipeOnHitId = CONFIG.hitVfxSelectedRecipeId;
      } else {
        CONFIG.hitVfxActiveRecipeOnBlockId = CONFIG.hitVfxSelectedRecipeId;
      }
      hitVfxRuntime.applyConfig(runtimeSlice());
      hitVfxRuntime.replayVolumeSmokeElement(elementId, {
        kind: CONFIG.hitVfxPreviewKind,
        strength: CONFIG.hitVfxPreviewStrength,
        height: CONFIG.hitVfxPreviewHeight,
        x: 0,
        facing: 1,
      });
      CONFIG.hitVfxActiveRecipeOnHitId = prevHit;
      CONFIG.hitVfxActiveRecipeOnBlockId = prevBlock;
      hitVfxRuntime.applyConfig(runtimeSlice());
      if (loopPlaying) {
        sawActiveWhileLooping = hitVfxRuntime.getActiveCount() > 0;
      }
    },
    stepFrame: () => {
      CONFIG.hitVfxPaused = true;
      CONFIG.hitVfxStepFrames += 1;
    },
    invalidate: () => {
      hitVfxRuntime.invalidatePrefabs();
      syncRuntime();
    },
    onConfigChanged: (key) => {
      if (
        key === 'hitVfxRecipes' ||
        key === 'hitVfxSparkLightPoolSize' ||
        key === '*'
      ) {
        // Volume-smoke param edits notify hitVfxRecipes but handle live update
        // via onVolumeSmokeParamsChanged + debounced replay — skip hard clear here
        // when only soft-notifying would wipe the viewport between keystrokes.
        // Structural edits still call hooks.invalidate() explicitly.
        if (key === 'hitVfxSparkLightPoolSize' || key === '*') {
          hitVfxRuntime.invalidatePrefabs();
        }
      }
      if (key === 'hitVfxPreviewLoop' && !CONFIG.hitVfxPreviewLoop) {
        stopLoop();
      }
      syncRuntime();
    },
    onVolumeSmokeParamsChanged: (params, elementId) => {
      const recipe =
        CONFIG.hitVfxRecipes.find(
          (r) => r.id === CONFIG.hitVfxSelectedRecipeId,
        ) ?? CONFIG.hitVfxRecipes[0];
      const strength = CONFIG.hitVfxPreviewStrength;
      const sizeMul = recipe?.strengthScale[strength]?.sizeMul ?? 1;
      hitVfxRuntime.applyVolumeSmokeEditorParams(params, {
        x: 0,
        height: CONFIG.hitVfxPreviewHeight,
        facing: 1,
        elementId,
        strength,
        sizeMul,
      });
    },
  });

  const slot =
    document.getElementById('hvfx-canvas-slot') ?? document.body;
  slot.appendChild(host);
  const fit = () => sizeRendererToSlot(renderer, camera, slot);
  fit();
  const ro = new ResizeObserver(() => fit());
  ro.observe(slot);
  window.addEventListener('resize', fit);

  let last = performance.now();
  const frame = (now: number): void => {
    const wallDt = (now - last) / 1000;
    last = now;
    orbit.update();
    const steps = CONFIG.hitVfxStepFrames;
    if (steps > 0) CONFIG.hitVfxStepFrames = 0;
    hitVfxRuntime.tick(wallDt, false, () => steps);

    if (loopPlaying && CONFIG.hitVfxPreviewLoop) {
      const n = hitVfxRuntime.getActiveCount();
      if (n > 0) {
        sawActiveWhileLooping = true;
      } else if (sawActiveWhileLooping) {
        firePreview();
        sawActiveWhileLooping = hitVfxRuntime.getActiveCount() > 0;
      }
    } else if (loopPlaying && !CONFIG.hitVfxPreviewLoop) {
      stopLoop();
    }

    void (async () => {
      await renderer.render(scene, camera);
      const prevBackground = scene.background;
      const prevAutoClear = renderer.autoClear;
      const prevAutoClearColor = renderer.autoClearColor;
      const prevAutoClearDepth = renderer.autoClearDepth;
      scene.background = null;
      renderer.autoClear = false;
      renderer.autoClearColor = false;
      renderer.autoClearDepth = false;
      renderer.clearDepth();
      await renderer.render(hitVfxScene, camera);
      scene.background = prevBackground;
      renderer.autoClear = prevAutoClear;
      renderer.autoClearColor = prevAutoClearColor;
      renderer.autoClearDepth = prevAutoClearDepth;
      requestAnimationFrame(frame);
    })();
  };
  requestAnimationFrame(frame);

  window.setTimeout(() => {
    hitVfxDirector.previewTrigger({
      kind: CONFIG.hitVfxPreviewKind,
      strength: CONFIG.hitVfxPreviewStrength,
      height: CONFIG.hitVfxPreviewHeight,
      x: 0,
      facing: 1,
    });
  }, 400);
}

import './style.css';
import * as THREE from 'three/webgpu';
import { applyConfigToMatchOpts, syncMatchOpts } from './config/constants';
import { cloneConfig, CONFIG, setActiveDefaultConfig } from './config/store';
import { loadSavedConfig, loadShippingConfig } from './config/persist';
import { FrameClock } from './combat/frameClock';
import { parseMoveDefinition } from './combat/move/MoveDefinition';
import { MatchSim } from './combat/match/MatchSim';
import { KeyboardSource } from './combat/input/KeyboardSource';
import { loadJson } from './data/loadJson';
import { FighterView } from './render/FighterView';
import {
  enableFighterDisplayLayersOnLight,
  LAYER_FIGHTER_BACK,
  LAYER_FIGHTER_FRONT,
  LAYER_SCENE,
  pickDisplayFrontId,
} from './render/fighterDisplayOrder';
import { StageView } from './render/StageView';
import {
  applyFightCamera,
  CameraRig,
} from './render/CameraRig';
import {
  applyEnvironment,
  applyLightTransformsFromConfig,
  createLightRig,
  syncLightsFromConfig,
  updateLightHelpers,
} from './render/LightRig';
import { refreshTrainingLighting } from './render/trainingLighting';
import { createLightEditControls } from './render/LightEditControls';
import {
  applyLightFollow,
  fighterFollowOriginFromLogic,
  type FighterFollowOrigin,
} from './config/lightTypes';
import { applySelectiveLightNodes } from './render/LightSelective';
import { DebugDraw } from './render/DebugDraw';
import { DynamicLighting } from 'three/addons/lighting/DynamicLighting.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HudDom } from './render/HudDom';
import {
  reloadMoveFromPublic,
  setupControlPanel,
} from './debug/ControlPanel';
import { PantsHealthReporter } from './debug/PantsHealthReporter';
import { FpsHud } from './debug/FpsHud';
import { BoxEditorApp } from './boxEditor/BoxEditorApp';
import type { MoveDefinition } from './combat/move/MoveDefinition';
import {
  bakeRyuMeshTemplate,
  ensureRyuFallbackAlbedoCatalog,
  isPreparedTexturedModel,
  worldBox,
} from './render/materialUtils';
import { applyPreparedRyuArtMaterials } from './render/applyPreparedRyuArt';
import { fixRyuHandSkinWeights } from './render/fixHandSkinWeights';
import {
  BOOT_PRELOAD_LOGIC_IDS,
  LogicGlbMap,
  RYU_MESH_FBX_URL,
  RYU_MESH_ONLY_URL,
  RYU_MESH_PUBLIC_FALLBACK_URL,
} from './data/logicGlbMap';
import { AnimClipLibrary } from './render/AnimClipLibrary';
import { loadFighterMeshFromUrl } from './render/loadFighterMesh';
import { HitVfxRuntime } from './render/hitVfx/HitVfxRuntime';
import { WudaPlumeBurst } from './render/wudaParticle/WudaPlumeBurst';
import { HitVfxDirector } from './render/hitVfx/HitVfxDirector';

// Mesh-only skinned Ryu; combat clips from private/assets/ryu/anims via map
import stageUrl from '@interim/SF6 Training Stage/SF6 Training Stage.glb?url';
import soldierUrl from '@interim/characters/Soldier.glb?url';
import xbotUrl from '@interim/characters/Xbot.glb?url';

function setBootStatus(msg: string): void {
  let el = document.getElementById('boot-status');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'boot-status';
    el.style.cssText =
      'position:fixed;left:12px;bottom:48px;z-index:20;margin:0;padding:8px 12px;' +
      'background:rgba(0,0,0,0.75);color:#9f8;font:12px/1.4 ui-monospace,monospace;max-width:90vw';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  console.info('[boot-status]', msg);
}

async function boot(): Promise<void> {
  if (!('gpu' in navigator) || !navigator.gpu) {
    document.body.innerHTML =
      '<pre style="color:#fff;background:#200;padding:1rem">WebGPU required (desktop Chrome). See consensus §4.2.</pre>';
    return;
  }

  setBootStatus('Init WebGPU + load feedback catalog…');
  const { loadFeedbackCatalog } = await import('./combat/move/MoveCatalog');
  const { catalog, loaded, failed } = await loadFeedbackCatalog(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  });
  console.info(
    '[boot] catalog loaded',
    loaded.length,
    'failed',
    failed.length,
    failed.slice(0, 5),
  );
  if (failed.length) {
    console.warn('[boot] catalog failures', failed);
  }
  // GUI 5LP editor needs a live move5lp reference
  let move = catalog.get('ryu_5lp');
  if (!move) {
    const moveRaw = await loadJson<MoveDefinition>('/data/moves/ryu_5lp.json');
    move = parseMoveDefinition(moveRaw);
    catalog.register(move);
  }
  // Live config is the single source (CONFIG). Content tables seed defaults,
  // then shipping + localStorage may override before the panel attaches.
  const cfg = CONFIG;
  try {
    const ib = await loadJson<{
      ACTION_BUFFER_STANDARD?: number;
      ACTION_BUFFER_DASH?: number;
      MOTION_STEP_GAP_MAX?: number;
      DASH_DIR_HOLD_MAX?: number;
      DASH_NEUTRAL_MAX?: number;
      MOTION_HISTORY_CAPACITY?: number;
    }>('/data/systems/input_buffer.json');
    if (ib.ACTION_BUFFER_STANDARD != null)
      cfg.actionBufferStandard = ib.ACTION_BUFFER_STANDARD;
    if (ib.ACTION_BUFFER_DASH != null) cfg.actionBufferDash = ib.ACTION_BUFFER_DASH;
    if (ib.MOTION_STEP_GAP_MAX != null) cfg.motionStepGapMax = ib.MOTION_STEP_GAP_MAX;
    if (ib.DASH_DIR_HOLD_MAX != null) cfg.dashDirHoldMax = ib.DASH_DIR_HOLD_MAX;
    if (ib.DASH_NEUTRAL_MAX != null) cfg.dashNeutralMax = ib.DASH_NEUTRAL_MAX;
    if (ib.MOTION_HISTORY_CAPACITY != null) {
      cfg.motionHistoryCapacity = ib.MOTION_HISTORY_CAPACITY;
      cfg.bufferFrames = ib.MOTION_HISTORY_CAPACITY;
    }
  } catch {
    /* use defaults */
  }
  // Local movement table (consensus §6.7 / plan Step 0)
  let ryuMovement: import('./data/loadRyuMovement').RyuMovementTable | null =
    null;
  try {
    const { fetchRyuMovement, movementToSimDefaults } = await import(
      './data/loadRyuMovement'
    );
    ryuMovement = await fetchRyuMovement();
    Object.assign(cfg, movementToSimDefaults(ryuMovement));
  } catch (e) {
    console.warn('[boot] ryu_movement.json failed', e);
  }

  // Session display defaults (overridden by shipping / local default below)
  cfg.cameraZ = 11;
  cfg.cameraY = 1.55;
  cfg.cameraLookY = 1.1;
  cfg.modelScale = 0.9;
  cfg.worldScale = 1;

  // Content-seeded snapshot becomes the "project default" baseline before shipping.
  setActiveDefaultConfig(cloneConfig(cfg));
  await loadShippingConfig();
  loadSavedConfig();

  const match = new MatchSim(move, catalog, applyConfigToMatchOpts(cfg));
  if (ryuMovement) match.setMovementTable(ryuMovement);
  try {
    const { loadStanceTableResolved } = await import(
      './data/loadMoveWithOverride'
    );
    const { table: stance } = await loadStanceTableResolved();
    match.setStanceTable(stance);
    console.info(
      '[boot] stance boxes',
      stance.review.status,
      'stand.hurt',
      stance.stances.stand.hurt.length,
    );
  } catch (e) {
    console.warn('[boot] ryu_stance_boxes.json failed — using fallback', e);
    const { fallbackStanceTable } = await import('./data/loadStanceBoxes');
    match.setStanceTable(fallbackStanceTable());
  }
  syncMatchOpts(match, cfg);

  const clock = new FrameClock(
    1 / cfg.logicFps,
    cfg.maxLogicStepsPerRaf,
    cfg.maxFrameTimeMs / 1000,
  );

  const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: false });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = 'block';
  document.body.appendChild(renderer.domElement);

  // Plan §S3: DynamicLighting for WebGPU add/remove without full recompile.
  if (cfg.lightUseDynamicLighting) {
    const r = renderer as THREE.WebGPURenderer & {
      lighting?: InstanceType<typeof DynamicLighting>;
    };
    // Reserve room for training-stage point lights + hit-VFX spark light pool (plan §12.7).
    r.lighting = new DynamicLighting({
      maxDirectionalLights: 12,
      // +2: volume-smoke original Point key + spark pool headroom
      maxPointLights: 12 + Math.max(4, cfg.hitVfxSparkLightPoolSize) + 2,
      // +1: volume-smoke original Spot key
      maxSpotLights: 8 + 1,
      maxHemisphereLights: 2,
    });
  }
  renderer.shadowMap.enabled = cfg.shadowMapEnabled;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.bgColor);
  scene.fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);

  const camera = new THREE.PerspectiveCamera(
    cfg.cameraFov,
    window.innerWidth / window.innerHeight,
    cfg.cameraNear,
    cfg.cameraFar,
  );
  camera.position.set(0, cfg.cameraY, cfg.cameraZ);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, cfg.cameraLookY, 0);

  // Overlay scene: hit VFX never share the fighter layer passes, so they always
  // composite above both characters after a depth clear.
  const hitVfxScene = new THREE.Scene();
  hitVfxScene.name = 'HitVfxOverlay';

  const hitVfxRuntime = new HitVfxRuntime({
    renderer,
    scene: hitVfxScene,
    camera,
    config: {
      hitVfxEnabled: cfg.hitVfxEnabled,
      hitVfxRecipes: cfg.hitVfxRecipes,
      hitVfxActiveRecipeOnHitId: cfg.hitVfxActiveRecipeOnHitId,
      hitVfxActiveRecipeOnBlockId: cfg.hitVfxActiveRecipeOnBlockId,
      hitVfxTimeScale: cfg.hitVfxTimeScale,
      hitVfxPaused: cfg.hitVfxPaused,
      hitVfxStepFrames: cfg.hitVfxStepFrames,
      hitVfxSeedLocked: cfg.hitVfxSeedLocked,
      hitVfxSeed: cfg.hitVfxSeed,
      hitVfxFollowHitstop: cfg.hitVfxFollowHitstop,
      hitVfxHeightOffsets: cfg.hitVfxHeightOffsets,
      hitVfxMaxConcurrent: cfg.hitVfxMaxConcurrent,
      hitVfxSparkLightPoolSize: cfg.hitVfxSparkLightPoolSize,
      hitVfxDebug: cfg.hitVfxDebug,
      modelYOffset: cfg.modelYOffset,
    },
  });
  const hitVfxDirector = new HitVfxDirector(hitVfxRuntime);
  match.opts.onHitVfx = (ev) => hitVfxDirector.onMatchContact(ev);

  // Wuda coat detach splash: same overlay scene as hit VFX (composites above fighters).
  const wudaPlumeBurst = new WudaPlumeBurst({
    renderer,
    scene: hitVfxScene,
    camera,
  });

  /** Training-field keeps combat VFX only; editing lives on /hit-vfx.html. */
  const syncHitVfxFromConfig = (): void => {
    hitVfxRuntime.applyConfig({
      hitVfxEnabled: cfg.hitVfxEnabled,
      hitVfxRecipes: cfg.hitVfxRecipes,
      hitVfxActiveRecipeOnHitId: cfg.hitVfxActiveRecipeOnHitId,
      hitVfxActiveRecipeOnBlockId: cfg.hitVfxActiveRecipeOnBlockId,
      hitVfxTimeScale: cfg.hitVfxTimeScale,
      hitVfxPaused: cfg.hitVfxPaused,
      hitVfxStepFrames: cfg.hitVfxStepFrames,
      hitVfxSeedLocked: cfg.hitVfxSeedLocked,
      hitVfxSeed: cfg.hitVfxSeed,
      hitVfxFollowHitstop: cfg.hitVfxFollowHitstop,
      hitVfxHeightOffsets: cfg.hitVfxHeightOffsets,
      hitVfxMaxConcurrent: cfg.hitVfxMaxConcurrent,
      hitVfxSparkLightPoolSize: cfg.hitVfxSparkLightPoolSize,
      hitVfxDebug: cfg.hitVfxDebug,
      modelYOffset: cfg.modelYOffset,
    });
  };
  syncHitVfxFromConfig();

  /** Fight-camera only; used for PIP when lightOrbitMode (main view is free orbit). */
  const fightCamera = new THREE.PerspectiveCamera(
    cfg.cameraFov,
    window.innerWidth / window.innerHeight,
    cfg.cameraNear,
    cfg.cameraFar,
  );
  fightCamera.up.set(0, 1, 0);

  const pipFrame = document.createElement('div');
  pipFrame.id = 'light-orbit-pip-frame';
  pipFrame.innerHTML = '<span class="pip-label">对战镜头</span>';
  pipFrame.style.display = 'none';
  document.body.appendChild(pipFrame);

  /**
   * PIP layout in CSS pixels from bottom-left (user params).
   * WebGPURenderer setViewport/setScissor use **upper-left** origin (see three
   * Renderer.js setViewport docs) — convert y when applying to renderer.
   */
  const clampPip = () => {
    const maxW = Math.max(120, window.innerWidth - 8);
    const maxH = Math.max(80, window.innerHeight - 8);
    const w = Math.min(Math.max(120, Math.round(cfg.lightOrbitPipWidth)), maxW);
    const h = Math.min(Math.max(80, Math.round(cfg.lightOrbitPipHeight)), maxH);
    const x = Math.min(
      Math.max(0, Math.round(cfg.lightOrbitPipX)),
      Math.max(0, window.innerWidth - w),
    );
    const yBottom = Math.min(
      Math.max(0, Math.round(cfg.lightOrbitPipY)),
      Math.max(0, window.innerHeight - h),
    );
    const yTop = window.innerHeight - yBottom - h;
    return { x, yBottom, yTop, w, h };
  };

  const updatePipChrome = () => {
    if (!cfg.lightOrbitMode) {
      pipFrame.style.display = 'none';
      return;
    }
    const { x, yBottom, w, h } = clampPip();
    pipFrame.style.display = 'block';
    pipFrame.style.left = `${x}px`;
    pipFrame.style.bottom = `${yBottom}px`;
    pipFrame.style.width = `${w}px`;
    pipFrame.style.height = `${h}px`;
  };

  const lights = createLightRig(THREE, scene);
  hitVfxRuntime.setLightRig(lights);
  const syncFighterDisplayLightLayers = (): void => {
    for (const rt of lights.runtimes.values()) {
      enableFighterDisplayLayersOnLight(rt.light);
    }
  };
  syncFighterDisplayLightLayers();
  /** Logic-Y fallback until FighterViews exist; swapped to hips Y after load. */
  const followOriginRef: {
    get: (who: 'p1' | 'p2') => FighterFollowOrigin;
  } = {
    get: (who) => {
      const f = who === 'p1' ? match.p1 : match.p2;
      return fighterFollowOriginFromLogic(
        f.x,
        f.y,
        cfg.worldScale,
        cfg.modelYOffset,
      );
    },
  };
  const fighterFollowOrigins = () => ({
    p1: followOriginRef.get('p1'),
    p2: followOriginRef.get('p2'),
  });
  syncLightsFromConfig(THREE, scene, lights, cfg, fighterFollowOrigins());
  syncFighterDisplayLightLayers();
  applyEnvironment(THREE, scene, cfg);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enabled = false;
  orbit.enableDamping = true;
  orbit.target.set(0, cfg.cameraLookY, 0);

  let lightDragActive = false;
  /** Set after control panel mounts — refreshes position fields after gizmo drag. */
  let refreshLightPanel: (() => void) | null = null;
  const lightEdit = createLightEditControls(
    THREE,
    scene,
    camera,
    renderer.domElement,
    lights,
    cfg,
    {
      onDraggingChanged: (dragging) => {
        lightDragActive = dragging;
        if (cfg.lightOrbitMode) orbit.enabled = !dragging;
        if (!dragging) {
          // Drag ended: helpers + panel fields from CONFIG (already written by writeBack).
          updateLightHelpers(lights);
          refreshLightPanel?.();
        }
      },
      onLightsChanged: () => {
        // Mid-drag: do NOT syncLightsFromConfig (re-applies desc→light and fights gizmo).
        // Only refresh helpers so DirectionalLightHelper tracks the move;
        // panel fields re-read CONFIG.lights positions.
        updateLightHelpers(lights);
        refreshLightPanel?.();
      },
      getFighterFollowOrigin: (who) => followOriginRef.get(who),
    },
  );
  lightEdit.attachSelected();

  let wasOrbitMode = cfg.lightOrbitMode;
  /** Set after stage + fighters exist; also used by refreshTrainingLighting roots. */
  let refreshSelectiveLights: () => void = () => {};
  const refreshLighting = () => {
    // Same helper as hit-VFX editor — both pages read CONFIG.lights in place.
    refreshTrainingLighting({
      THREE,
      renderer,
      scene,
      rig: lights,
      cfg,
      origins: fighterFollowOrigins(),
      roots: {
        stage: stage.root,
        ground,
        p1: p1View.root,
        p2: p2View.root,
      },
      afterSyncLights: () => {
        syncFighterDisplayLightLayers();
      },
    });
    lightEdit.attachSelected();
    if (cfg.lightOrbitMode && !wasOrbitMode) {
      // Enter place-light mode from current camera (plan §S6).
      orbit.target.set(0, cfg.cameraLookY, 0);
      orbit.enabled = !lightDragActive;
      orbit.update();
    } else if (!cfg.lightOrbitMode) {
      orbit.enabled = false;
    } else {
      orbit.enabled = !lightDragActive;
    }
    wasOrbitMode = cfg.lightOrbitMode;
    updatePipChrome();
  };

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a4555, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  ground.visible = cfg.showFallbackGround;
  scene.add(ground);
  const grid = new THREE.GridHelper(20, 40, 0x6688aa, 0x334455);
  grid.position.y = 0.001;
  grid.visible = cfg.showDebugGrid;
  scene.add(grid);

  const axes = new THREE.AxesHelper(2);
  axes.visible = cfg.showAxes;
  scene.add(axes);

  const stage = new StageView(scene);
  const applyStageLayout = () => {
    stage.applyLayout({
      targetWidth: cfg.stageFitWidth,
      originX: cfg.stageOriginX,
      originZ: cfg.stageOriginZ,
    });
    ground.visible = cfg.showFallbackGround;
    grid.visible = cfg.showDebugGrid;
    axes.visible = cfg.showAxes;
  };
  try {
    setBootStatus('Loading training stage…');
    await stage.load(stageUrl, cfg.stageFitWidth);
    applyStageLayout();
    console.info('[boot] training stage loaded');
  } catch (e) {
    console.warn('[boot] stage load failed', e);
    cfg.showFallbackGround = true;
    ground.visible = true;
  }

  const cameraRig = new CameraRig();

  const p1View = new FighterView(scene, 0x4a90d9);
  const p2View = new FighterView(scene, 0xd94a4a);
  p1View.setWudaPlumeBurst(wudaPlumeBurst);
  p2View.setWudaPlumeBurst(wudaPlumeBurst);
  p1View.setWudaRenderer(renderer);
  p2View.setWudaRenderer(renderer);
  // Prefer hips world Y so crouch animation and jump both drive follow lights.
  followOriginRef.get = (who) => {
    const f = who === 'p1' ? match.p1 : match.p2;
    const view = who === 'p1' ? p1View : p2View;
    return {
      x: f.x * cfg.worldScale,
      y: view.getLightFollowAnchorY(),
    };
  };

  async function loadFighters(): Promise<void> {
    /**
     * Mesh candidates (first success wins):
     * Prefer mesh_only / FBX skin (intact glove weights). Do NOT prefer Blender
     * re-exported ryu_c1_textured.glb — re-export corrupts hand skinning.
     * Prepared PNGs are applied in Three via applyPreparedRyuArtMaterials.
     *
     * Combat clips always come from private/assets/ryu/anims via LogicGlbMap.
     */
    async function loadRyuMeshScene(): Promise<THREE.Object3D> {
      const candidates = [
        {
          url: RYU_MESH_ONLY_URL,
          label: 'private/runtime ryu_c1_mesh_only.glb (skin-safe)',
        },
        {
          url: RYU_MESH_FBX_URL,
          label: 'private/runtime esf001_TPose.fbx',
        },
        {
          url: RYU_MESH_PUBLIC_FALLBACK_URL,
          label: 'public/models/ryu_c1 mesh (clips discarded)',
        },
      ];
      let lastErr: unknown;
      for (const c of candidates) {
        try {
          setBootStatus(`Loading Ryu mesh (${c.label})…`);
          console.info('[boot] mesh try', c.url);
          const loaded = await loadFighterMeshFromUrl(c.url);
          console.info(
            `[boot] mesh OK ${c.label} format=${loaded.format} meshes=`,
            countMeshes(loaded.scene),
            'embeddedAnimsIgnored=',
            loaded.embeddedAnimCount,
          );
          return loaded.scene;
        } catch (e) {
          lastErr = e;
          console.warn('[boot] mesh candidate failed', c.url, e);
        }
      }
      throw lastErr ?? new Error('No Ryu mesh candidate succeeded');
    }

    try {
      setBootStatus('Loading Ryu mesh + textures + anims map…');
      const t0 = performance.now();
      const meshScene = await loadRyuMeshScene();
      // Fix Root-weighted glove/hand verts BEFORE clone (stretch/twist on wraps)
      fixRyuHandSkinWeights(meshScene);
      // Apply prepared PNG art onto intact skin (hides cape; black belt; etc.)
      setBootStatus('Applying prepared Ryu textures…');
      try {
        await applyPreparedRyuArtMaterials(meshScene);
      } catch (e) {
        console.warn('[boot] applyPreparedRyuArt failed, interim albedo fallback', e);
        await ensureRyuFallbackAlbedoCatalog();
      }
      if (!isPreparedTexturedModel(meshScene)) {
        await ensureRyuFallbackAlbedoCatalog();
      }
      // cm→m + rebind once on the template, then clone for P1/P2 (do not bake per clone)
      bakeRyuMeshTemplate(meshScene);
      console.info(
        `[boot] mesh ready in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
      );

      // Combat clips come from private/assets/ryu/anims — never use c1 test tracks.
      p1View.installFromTemplate(meshScene, [], { targetHeight: 1.85 });
      p2View.installFromTemplate(meshScene, [], { targetHeight: 1.85 });

      const mapRaw = await loadJson<unknown>(
        '/data/clips/ryu_logic_to_glb_map.json',
      );
      const logicMap = LogicGlbMap.fromJson(mapRaw);
      // Jump/ground residual needs animFrameCount when move JSON omitted it (§3.13.5)
      const enriched = catalog.enrichAnimFromMap(logicMap);
      if (enriched > 0) {
        console.info('[boot] enriched move animFrameCount from map', enriched);
        const live5 = catalog.get('ryu_5lp');
        if (live5) match.move5lp = live5;
      }
      const clipLib = new AnimClipLibrary();
      p1View.setAnimsBackend(logicMap, clipLib);
      p2View.setAnimsBackend(logicMap, clipLib);

      setBootStatus(
        `Preloading ${BOOT_PRELOAD_LOGIC_IDS.length} anims clips…`,
      );
      await Promise.all([
        p1View.preloadLogicClips(BOOT_PRELOAD_LOGIC_IDS),
        p2View.preloadLogicClips(BOOT_PRELOAD_LOGIC_IDS),
      ]);
      p1View.playBest('idle');
      p2View.playBest('idle');
      console.info('[boot] anims backend preloaded', [...BOOT_PRELOAD_LOGIC_IDS]);

      if (!isReasonableFighter(p1View)) {
        console.warn(
          '[boot] Ryu bounds unreasonable → Soldier fallback',
          p1View.lastWorldSize,
        );
        setBootStatus('Ryu bounds bad — falling back to Soldier/Xbot…');
        await p1View.loadGltf(soldierUrl);
        await p2View.loadGltf(xbotUrl);
      } else {
        console.info(
          '[boot] Ryu+anims OK',
          p1View.lastWorldSize.toArray(),
          'animsMode=',
          p1View.usesAnimsBackend,
        );
        setBootStatus(
          `Ryu anims OK size=(${p1View.lastWorldSize.x.toFixed(2)},${p1View.lastWorldSize.y.toFixed(2)},${p1View.lastWorldSize.z.toFixed(2)})`,
        );
      }
    } catch (e) {
      console.warn('[boot] Ryu/anims failed → Soldier/Xbot', e);
      setBootStatus(`Ryu load failed: ${String(e)} — using Soldier/Xbot`);
      await p1View.loadGltf(soldierUrl).catch(() => p1View.loadGltf(xbotUrl));
      await p2View.loadGltf(xbotUrl).catch(() => p2View.loadGltf(soldierUrl));
    }
  }

  await loadFighters();
  // Clear status after a short delay so user can read the result
  window.setTimeout(() => {
    document.getElementById('boot-status')?.remove();
  }, 8000);

  // Follow lights: only illuminate followed fighter (TSL material.lightsNode).
  refreshSelectiveLights = () => {
    applySelectiveLightNodes(cfg.lights, lights, {
      stage: stage.root,
      ground,
      p1: p1View.root,
      p2: p2View.root,
    });
  };
  refreshSelectiveLights();

  // Sync once so root transforms applied, then log world boxes
  {
    const p1Front =
      pickDisplayFrontId(
        match.p1.lastAttackAcceptSeq,
        match.p2.lastAttackAcceptSeq,
      ) === 'p1';
    p1View.syncFromLogic(match.p1, cfg, 1 / 60, 1, { displayFront: p1Front });
    p2View.syncFromLogic(match.p2, cfg, 1 / 60, 1, { displayFront: !p1Front });
  }
  logBox('p1', p1View);
  logBox('p2', p2View);
  logBox('stage', stage.root);

  const debugDraw = new DebugDraw(scene);
  const hud = new HudDom();
  const fpsHud = new FpsHud();
  const keys = new KeyboardSource();

  let boxEditor: BoxEditorApp | null = null;
  /** Last preview size while in box-edit (for aspect / setSize). */
  let boxEditView = { w: 0, h: 0, left: 0, top: 0 };

  const restoreFightCanvasLayout = (): void => {
    const canvas = renderer.domElement;
    if (canvas.parentElement !== document.body) {
      document.body.appendChild(canvas);
    }
    canvas.style.position = '';
    canvas.style.left = '';
    canvas.style.top = '';
    canvas.style.right = '';
    canvas.style.bottom = '';
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.style.zIndex = '';
    canvas.style.inset = '';
    const fullW = window.innerWidth;
    const fullH = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(fullW, fullH, false);
    camera.aspect = fullW / Math.max(fullH, 1);
    camera.updateProjectionMatrix();
    fightCamera.aspect = camera.aspect;
    fightCamera.updateProjectionMatrix();
    boxEditView = { w: 0, h: 0, left: 0, top: 0 };
  };

  /** Reparent fight canvas into .be-center so it fills the preview slot. */
  const layoutFightCanvasForBoxEdit = (): void => {
    if (!hooks.boxEditActive || !boxEditor) {
      restoreFightCanvasLayout();
      return;
    }
    const slot = boxEditor.getPreviewSlot();
    if (!slot) return;
    const canvas = renderer.domElement;
    if (canvas.parentElement !== slot) {
      slot.appendChild(canvas);
    }
    const w = Math.max(1, Math.floor(slot.clientWidth));
    const h = Math.max(1, Math.floor(slot.clientHeight));
    if (w !== boxEditView.w || h !== boxEditView.h) {
      boxEditView = { w, h, left: 0, top: 0 };
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fightCamera.aspect = camera.aspect;
      fightCamera.updateProjectionMatrix();
    }
  };

  const exitBoxEdit = (): void => {
    if (!boxEditor) return;
    hooks.boxEditActive = false;
    cfg.showOpponentBoxes = true;
    // Canvas must leave overlay before stop() removes #box-editor-root.
    restoreFightCanvasLayout();
    boxEditor.stop();
    boxEditor = null;
    match.reset();
    hooks.paused = false;
  };

  const enterBoxEdit = (): void => {
    if (boxEditor) return;
    hooks.boxEditActive = true;
    hooks.paused = true;
    cfg.showOpponentBoxes = false;
    boxEditor = new BoxEditorApp({
      getMatch: () => match,
      getCamera: () => camera,
      getCanvas: () => renderer.domElement,
      setMatchPaused: (paused) => {
        hooks.paused = paused;
      },
      setShowOpponentBoxes: (show) => {
        cfg.showOpponentBoxes = show;
      },
      onExit: exitBoxEdit,
    });
    void boxEditor.start().then(() => {
      // Wait a frame so grid layout has real .be-center metrics.
      requestAnimationFrame(() => layoutFightCanvasForBoxEdit());
    }).catch((e) => {
      console.error('[box-editor] start failed', e);
      exitBoxEdit();
    });
  };

  const pantsHealthReporter = new PantsHealthReporter();
  const collectPantsHealth = () => {
    const snaps: NonNullable<
      ReturnType<FighterView['getPantsHealthSnapshot']>
    >[] = [];
    const a = p1View.getPantsHealthSnapshot();
    const b = p2View.getPantsHealthSnapshot();
    if (a) snaps.push(a);
    if (b) snaps.push(b);
    return snaps;
  };
  const hooks = {
    paused: false,
    boxEditActive: false,
    enterBoxEdit,
    exitBoxEdit,
    stepOnce: () => {
      if (hooks.boxEditActive) return;
      match.pendingInput = keys.sample();
      match.step();
    },
    reloadMoveJson: async () => {
      await reloadMoveFromPublic(match);
    },
    p1View,
    p2View,
    getLightFollowOrigin: (who: 'p1' | 'p2') => followOriginRef.get(who),
    recordPantsFeel: () =>
      pantsHealthReporter.recordFeel(
        collectPantsHealth(),
        String(CONFIG.pantsFeelNote ?? ''),
      ),
    startPantsRecord: () => {
      pantsHealthReporter.startRecording(collectPantsHealth());
    },
    stopPantsRecord: () =>
      pantsHealthReporter.stopRecording(collectPantsHealth(), CONFIG),
    isPantsRecording: () => pantsHealthReporter.isRecording,
  };
  const panelApi = setupControlPanel(match, clock, hooks, {
    onChange: (key) => {
      if (
        key === '*' ||
        key === 'stageFitWidth' ||
        key === 'stageOriginX' ||
        key === 'stageOriginZ' ||
        key === 'showFallbackGround' ||
        key === 'showDebugGrid' ||
        key === 'showAxes'
      ) {
        applyStageLayout();
      }
      if (
        key === '*' ||
        key === 'lights' ||
        key.startsWith('light') ||
        key.startsWith('shadow') ||
        key === 'fogColor' ||
        key === 'fogNear' ||
        key === 'fogFar' ||
        key === 'bgColor'
      ) {
        refreshLighting();
      }
      if (key === '*' || key.startsWith('hitVfx')) {
        if (
          key === '*' ||
          key === 'hitVfxRecipes' ||
          key === 'hitVfxSparkLightPoolSize'
        ) {
          hitVfxRuntime.invalidatePrefabs();
        }
        syncHitVfxFromConfig();
      }
    },
    lightEdit: {
      setGizmoMode: (m) => lightEdit.setMode(m),
      reattach: () => lightEdit.attachSelected(),
    },
  });
  refreshLightPanel = () => panelApi.refresh();

  /** R: return both fighters to start positions / idle state (training reset). */
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyR' || e.repeat) return;
    if (hooks.boxEditActive) return;
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.isContentEditable)
    ) {
      return;
    }
    e.preventDefault();
    keys.clear();
    match.reset();
  });

  window.addEventListener('resize', () => {
    if (hooks.boxEditActive) {
      layoutFightCanvasForBoxEdit();
    } else {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      fightCamera.aspect = camera.aspect;
      fightCamera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    updatePipChrome();
  });

  let last = performance.now();
  let presentAccum = 0;
  let logicStepsSincePresent = 0;
  let loggedFrame = false;
  function frame(now: number): void {
    const wallDt = (now - last) / 1000;
    last = now;
    presentAccum += wallDt;

    ground.visible = cfg.showFallbackGround;
    grid.visible = cfg.showDebugGrid;
    axes.visible = cfg.showAxes;

    let logicSteps = 0;
    if (hooks.boxEditActive && boxEditor) {
      layoutFightCanvasForBoxEdit();
      boxEditor.tick();
    } else if (!hooks.paused) {
      logicSteps = clock.tick(wallDt);
      for (let i = 0; i < logicSteps; i++) {
        match.pendingInput = keys.sample();
        match.step();
      }
    }
    logicStepsSincePresent += logicSteps;

    // High-refresh: skip empty presents so display stays locked to logicFps.
    // Pause / box-edit still draw every rAF for tooling.
    const mustPresent =
      hooks.boxEditActive ||
      hooks.paused ||
      !cfg.lockPresentToLogic ||
      logicSteps > 0;
    if (!mustPresent) {
      requestAnimationFrame(frame);
      return;
    }

    const presentDt = presentAccum;
    presentAccum = 0;
    const presentLogicSteps = logicStepsSincePresent;
    logicStepsSincePresent = 0;
    fpsHud.tick(now, presentLogicSteps);

    {
      const steps = cfg.hitVfxStepFrames;
      if (steps > 0) cfg.hitVfxStepFrames = 0;
      hitVfxRuntime.tick(presentDt, match.hitstopTimer > 0, () => steps);
      // Coat detach splash keeps moving on wall clock (same as coat free particles).
      wudaPlumeBurst.setCamera(camera);
      wudaPlumeBurst.tick(presentDt, camera);
    }

    const fullW = window.innerWidth;
    const fullH = window.innerHeight;
    const viewW =
      hooks.boxEditActive && boxEditView.w > 0 ? boxEditView.w : fullW;
    const viewH =
      hooks.boxEditActive && boxEditView.h > 0 ? boxEditView.h : fullH;
    const viewAspect = viewW / Math.max(viewH, 1);

    const fightPose = cameraRig.update(
      {
        p1x: match.p1.x,
        p2x: match.p2.x,
        worldScale: cfg.worldScale,
        cameraY: cfg.cameraY,
        cameraZ: cfg.cameraZ,
        cameraLookY: cfg.cameraLookY,
        cameraFov: cfg.cameraFov,
        aspect: viewAspect,
        zoomEnabled: cfg.cameraZoomEnabled,
        zoomSepK: cfg.cameraZoomSepK,
        zMax: cfg.cameraZMax,
        ndcPad: cfg.cameraNdcPad,
      },
      {
        lerp: cfg.cameraLerp,
        dt: presentDt,
        deadzone: cfg.cameraFollowDeadzone,
      },
    );

    let pose = fightPose;

    if (cfg.lightOrbitMode && !hooks.boxEditActive) {
      orbit.enabled = !lightDragActive;
      orbit.update();
      pose = {
        camX: camera.position.x,
        camY: camera.position.y,
        camZ: camera.position.z,
        lookX: orbit.target.x,
        lookY: orbit.target.y,
        lookZ: orbit.target.z,
      };
    } else {
      orbit.enabled = false;
      applyFightCamera(camera, fightPose, {
        fov: cfg.cameraFov,
        near: cfg.cameraNear,
        far: cfg.cameraFar,
        aspect: viewAspect,
      });
    }

    // Free-run + dual-advance clip time use presentLogicSteps/60 (authored 60Hz).
    // Present dt drives blend *weight* windows and cloth physics.
    // Hitstop: logic freeze + presentation hit-slow via hitstopPresentTicks.
    {
      const hitstopPresentTicks = match.hitstopPresentTicks;
      match.hitstopPresentTicks = 0;
      const inHitstop = match.hitstopTimer > 0 || hitstopPresentTicks > 0;
      const p1Front =
        pickDisplayFrontId(
          match.p1.lastAttackAcceptSeq,
          match.p2.lastAttackAcceptSeq,
        ) === 'p1';
      p1View.syncFromLogic(match.p1, cfg, presentDt, presentLogicSteps, {
        displayFront: p1Front,
        hitstopPresentTicks,
        inHitstop,
      });
      p2View.syncFromLogic(match.p2, cfg, presentDt, presentLogicSteps, {
        displayFront: !p1Front,
        hitstopPresentTicks,
        inHitstop,
      });
    }

    pantsHealthReporter.tick(collectPantsHealth(), cfg);

    // Follow after fighter sync so hips Y (jump + crouch) is current.
    if (!lightDragActive) {
      const origins = fighterFollowOrigins();
      if (applyLightFollow(cfg.lights, origins.p1, origins.p2)) {
        applyLightTransformsFromConfig(lights, cfg, origins);
      }
    }
    updateLightHelpers(lights);

    debugDraw.update(match, cfg, boxEditor?.getHighlightWorldBox() ?? null);
    hud.update(match, clock, cfg);

    if (!loggedFrame) {
      loggedFrame = true;
      logBox('p1@frame0', p1View);
      console.info(
        '[boot] camera',
        camera.position.toArray(),
        'look',
        pose.lookX,
        pose.lookY,
        pose.lookZ,
      );
    }

    updatePipChrome();

    const gizmoHelper = lightEdit.transform.getHelper();

    /**
     * True 2.5D fighter priority + hit VFX above both fighters:
     * 1) main scene + back fighter
     * 2) clearDepth, then front fighter only
     * 3) clearDepth, then hitVfxScene overlay (plume / volume smoke / spark lights)
     *
     * Important (WebGPU / three Background): a Color `scene.background` sets
     * forceClear on every render, which would wipe pass 1 even when
     * autoClear=false. Later passes must temporarily clear background + disable
     * autoClearColor so the color buffer is loaded, not cleared.
     */
    const renderFightDisplayLayers = async (
      cam: THREE.Camera,
      autoClearFirst: boolean,
    ): Promise<void> => {
      cam.layers.set(LAYER_SCENE);
      cam.layers.enable(LAYER_FIGHTER_BACK);
      renderer.autoClear = autoClearFirst;
      await renderer.render(scene, cam);

      const prevBackground = scene.background;
      const prevAutoClear = renderer.autoClear;
      const prevAutoClearColor = renderer.autoClearColor;
      const prevAutoClearDepth = renderer.autoClearDepth;
      scene.background = null;
      renderer.autoClear = false;
      renderer.autoClearColor = false;
      renderer.autoClearDepth = false;

      renderer.clearDepth();
      cam.layers.set(LAYER_FIGHTER_FRONT);
      await renderer.render(scene, cam);

      // Overlay uses its own scene (default layer 0). Restore SCENE on the
      // camera so VFX meshes are visible; fighters are not in hitVfxScene.
      renderer.clearDepth();
      cam.layers.set(LAYER_SCENE);
      await renderer.render(hitVfxScene, cam);

      scene.background = prevBackground;
      renderer.autoClear = prevAutoClear;
      renderer.autoClearColor = prevAutoClearColor;
      renderer.autoClearDepth = prevAutoClearDepth;

      cam.layers.set(LAYER_SCENE);
      cam.layers.enable(LAYER_FIGHTER_BACK);
      cam.layers.enable(LAYER_FIGHTER_FRONT);
      renderer.autoClear = true;
    };

    const fullRender = async () => {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, viewW, viewH);
      await renderFightDisplayLayers(camera, true);

      if (!cfg.lightOrbitMode || hooks.boxEditActive) return;

      // PIP: normal fight camera, no light gizmos/helpers.
      const { x, yTop, w, h } = clampPip();
      const helpersWas = lights.helperGroup.visible;
      const gizmoWas = gizmoHelper.visible;
      lights.helperGroup.visible = false;
      gizmoHelper.visible = false;

      applyFightCamera(fightCamera, fightPose, {
        fov: cfg.cameraFov,
        near: cfg.cameraNear,
        far: cfg.cameraFar,
        aspect: w / Math.max(h, 1),
      });

      // WebGPU viewport/scissor origin = upper-left (not CSS bottom).
      // Color already filled by main view; PIP clears via first layered pass.
      renderer.setScissorTest(true);
      renderer.setViewport(x, yTop, w, h);
      renderer.setScissor(x, yTop, w, h);
      await renderFightDisplayLayers(fightCamera, true);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, fullW, fullH);

      lights.helperGroup.visible = helpersWas;
      gizmoHelper.visible = gizmoWas;
    };

    void fullRender().then(() => {
      requestAnimationFrame(frame);
    });
    return;
  }
  requestAnimationFrame(frame);
}

function countMeshes(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++;
  });
  return n;
}

function isReasonableFighter(view: FighterView): boolean {
  const s = view.lastWorldSize;
  // After normalize: human height, and no multi-meter spike from bad submeshes
  if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z)) return false;
  if (s.y < 0.5 || s.y > 4) return false;
  if (s.x > 6 || s.z > 6) return false; // was 22m deep when Eye Tear leaked in
  return true;
}

function logBox(label: string, target: FighterView | THREE.Object3D): void {
  const root = target instanceof THREE.Object3D ? target : target.root;
  const box = worldBox(root);
  if (!box) {
    console.warn(`[bounds] ${label}: EMPTY`);
    return;
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  console.info(
    `[bounds] ${label} center=(${center.x.toFixed(2)},${center.y.toFixed(2)},${center.z.toFixed(2)}) ` +
      `size=(${size.x.toFixed(2)},${size.y.toFixed(2)},${size.z.toFixed(2)})`,
  );
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#fff;background:#400;padding:1rem">${String(err)}</pre>`;
});

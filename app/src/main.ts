import './style.css';
import * as THREE from 'three/webgpu';
import {
  applyConfigToMatchOpts,
  createDefaultSimConfig,
  syncMatchOpts,
} from './config/constants';
import { FrameClock } from './combat/frameClock';
import { parseMoveDefinition } from './combat/move/MoveDefinition';
import { MatchSim } from './combat/match/MatchSim';
import { KeyboardSource } from './combat/input/KeyboardSource';
import { loadJson } from './data/loadJson';
import { FighterView } from './render/FighterView';
import { StageView } from './render/StageView';
import { DebugDraw } from './render/DebugDraw';
import { HudDom } from './render/HudDom';
import { createDebugGui, reloadMoveFromPublic } from './debug/DebugGui';
import type { MoveDefinition } from './combat/move/MoveDefinition';
import {
  bakeRyuMeshTemplate,
  ensureRyuFallbackAlbedoCatalog,
  worldBox,
} from './render/materialUtils';
import {
  BOOT_PRELOAD_LOGIC_IDS,
  LogicGlbMap,
  RYU_MESH_FBX_URL,
  RYU_MESH_ONLY_URL,
  RYU_MESH_PUBLIC_FALLBACK_URL,
} from './data/logicGlbMap';
import { AnimClipLibrary } from './render/AnimClipLibrary';
import { loadFighterMeshFromUrl } from './render/loadFighterMesh';

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
  const cfg = createDefaultSimConfig();
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
  const match = new MatchSim(move, catalog, applyConfigToMatchOpts(cfg));
  if (ryuMovement) match.setMovementTable(ryuMovement);
  try {
    const { fetchStanceBoxTable } = await import('./data/loadStanceBoxes');
    const stance = await fetchStanceBoxTable();
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
  cfg.cameraZ = 8;
  cfg.cameraY = 1.4;
  cfg.modelScale = 0.9;
  cfg.worldScale = 1;
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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2030);
  // Fog can hide mis-scaled content; keep mild
  scene.fog = new THREE.Fog(0x1a2030, 40, 80);

  const camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.05,
    500,
  );
  camera.position.set(0, cfg.cameraY, cfg.cameraZ);
  camera.lookAt(0, 1.0, 0);

  // Strong lighting for MeshStandardMaterials (PBR)
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const hemi = new THREE.HemisphereLight(0xe8f0ff, 0x4a4035, 1.35);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff5e6, 2.4);
  dir.position.set(4, 14, 9);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0x99bbff, 0.85);
  fill.position.set(-9, 5, -3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.45);
  rim.position.set(0, 3, -8);
  scene.add(rim);

  // Always-visible ground (do NOT remove when stage loads — stage may be transparent/black)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a4555, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(20, 40, 0x6688aa, 0x334455);
  grid.position.y = 0.001;
  scene.add(grid);

  // Origin axes helper (visibility diagnostic)
  scene.add(new THREE.AxesHelper(2));

  const stage = new StageView(scene);
  try {
    setBootStatus('Loading training stage…');
    await stage.load(stageUrl, 18);
    console.info('[boot] training stage loaded (ground kept underneath)');
  } catch (e) {
    console.warn('[boot] stage load failed', e);
  }

  const p1View = new FighterView(scene, 0x4a90d9);
  const p2View = new FighterView(scene, 0xd94a4a);

  async function loadFighters(): Promise<void> {
    /**
     * Mesh candidates (first success wins):
     * 1) esf001_TPose.fbx — project target mesh (cm→m + skeleton unify at bake)
     * 2) runtime mesh-only glb fallback
     * 3) public ryu_c1 glb (mesh only; clips discarded)
     *
     * Combat clips always come from private/assets/ryu/anims via LogicGlbMap.
     */
    async function loadRyuMeshScene(): Promise<THREE.Object3D> {
      const candidates = [
        {
          url: RYU_MESH_FBX_URL,
          label: 'private/runtime esf001_TPose.fbx (target)',
        },
        {
          url: RYU_MESH_ONLY_URL,
          label: 'private/runtime mesh-only glb fallback',
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
      const [meshScene] = await Promise.all([
        loadRyuMeshScene(),
        ensureRyuFallbackAlbedoCatalog(),
      ]);
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

  // Sync once so root transforms applied, then log world boxes
  p1View.syncFromLogic(match.p1, cfg);
  p2View.syncFromLogic(match.p2, cfg);
  logBox('p1', p1View);
  logBox('p2', p2View);
  logBox('stage', stage.root);

  const debugDraw = new DebugDraw(scene);
  const hud = new HudDom();
  const keys = new KeyboardSource();

  const hooks = {
    paused: false,
    stepOnce: () => {
      match.pendingInput = keys.sample();
      match.step();
    },
    reloadMoveJson: async () => {
      await reloadMoveFromPublic(match);
    },
    p1View,
  };
  createDebugGui(match, clock, cfg, hooks);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let last = performance.now();
  let loggedFrame = false;
  function frame(now: number): void {
    const wallDt = (now - last) / 1000;
    last = now;

    camera.position.set(0, cfg.cameraY, cfg.cameraZ);
    camera.lookAt(0, 1.0, 0);

    if (!hooks.paused) {
      const steps = clock.tick(wallDt);
      for (let i = 0; i < steps; i++) {
        match.pendingInput = keys.sample();
        match.step();
      }
    }

    // Pass wallDt so free-running anims (idle) stay 1× real-time on 120Hz displays.
    // Do NOT use fixed 1/60 per rAF — that doubles speed at 120fps.
    p1View.syncFromLogic(match.p1, cfg, wallDt);
    p2View.syncFromLogic(match.p2, cfg, wallDt);
    debugDraw.update(match, cfg);
    hud.update(match, clock, cfg);

    if (!loggedFrame) {
      loggedFrame = true;
      logBox('p1@frame0', p1View);
      console.info(
        '[boot] camera',
        camera.position.toArray(),
        'looking at 0,1,0',
      );
    }

    void renderer.render(scene, camera);
    requestAnimationFrame(frame);
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

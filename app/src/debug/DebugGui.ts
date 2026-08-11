import GUI from 'three/addons/libs/lil-gui.module.min.js';
import type { MatchSim } from '../combat/match/MatchSim';
import type { FrameClock } from '../combat/frameClock';
import { syncMatchOpts, type MutableSimConfig } from '../config/constants';
import type { DummyMode } from '../combat/types';
import { parseMoveDefinition } from '../combat/move/MoveDefinition';
import {
  fetchRyuAnimCatalog,
  type AnimCatalogCategory,
  type AnimCatalogClip,
  type AnimCatalogPack,
} from '../data/animCatalog';
import type { FighterView } from '../render/FighterView';

export type GuiHooks = {
  paused: boolean;
  stepOnce: () => void;
  reloadMoveJson: () => Promise<void>;
  /** P1 view used by the animation test panel */
  p1View?: FighterView;
};

export function createDebugGui(
  match: MatchSim,
  clock: FrameClock,
  cfg: MutableSimConfig,
  hooks: GuiHooks,
): GUI {
  const gui = new GUI({ title: 'SF6 MVP 调试' });

  const sim = gui.addFolder('模拟');
  sim.add(hooks, 'paused').name('暂停');
  sim.add(hooks, 'stepOnce').name('单帧步进');
  sim
    .add(cfg, 'logicFps', 30, 120, 1)
    .name('逻辑帧率')
    .onChange(() => {
      clock.reconfigure(cfg.logicFps, cfg.maxLogicStepsPerRaf, cfg.maxFrameTimeMs);
    });
  sim
    .add(cfg, 'maxLogicStepsPerRaf', 1, 8, 1)
    .name('每帧最大逻辑步')
    .onChange(() => {
      clock.reconfigure(cfg.logicFps, cfg.maxLogicStepsPerRaf, cfg.maxFrameTimeMs);
    });
  sim
    .add(cfg, 'maxFrameTimeMs', 16, 250, 1)
    .name('最大帧耗时(ms)')
    .onChange(() => {
      clock.reconfigure(cfg.logicFps, cfg.maxLogicStepsPerRaf, cfg.maxFrameTimeMs);
    });

  const matchFolder = gui.addFolder('对局');
  const matchState = {
    dummyMode: match.dummy.mode as string,
    p1Hp: match.p1.hp,
    p2Hp: match.p2.hp,
    driveBars: match.drive.currentBars,
    resetMatch: () => {
      match.reset();
      matchState.p1Hp = match.p1.hp;
      matchState.p2Hp = match.p2.hp;
      matchState.driveBars = match.drive.currentBars;
    },
  };
  matchFolder
    .add(matchState, 'dummyMode', {
      站立: 'stand',
      站立防御: 'stand_block',
      下蹲: 'crouch',
      下蹲防御: 'crouch_block',
    })
    .name('人偶模式')
    .onChange((v: string) => {
      if (v === 'crouch' || v === 'crouch_block') {
        console.warn('MVP: 下蹲模式使用下蹲受击框；防御路径共用');
      }
      match.dummy.setMode(v as DummyMode);
    });
  matchFolder.add(matchState, 'resetMatch').name('重置对局');
  matchFolder
    .add(matchState, 'p1Hp', 0, 10000, 1)
    .name('P1 血量')
    .onChange((v: number) => {
      match.p1.hp = v;
    });
  matchFolder
    .add(matchState, 'p2Hp', 0, 10000, 1)
    .name('P2 血量')
    .onChange((v: number) => {
      match.p2.hp = v;
    });
  matchFolder
    .add(matchState, 'driveBars', 0, 6, 1)
    .name('Drive 条数')
    .onChange((v: number) => {
      match.drive.setBars(v);
    });

  const move = gui.addFolder('招式 5LP');
  const m = match.move5lp;
  const hit0 = m.boxes.hit[0] ?? {
    x: 0.55,
    y: 1.15,
    w: 0.6,
    h: 0.4,
    from: 3,
    to: 5,
  };
  const hurt0 = m.boxes.hurt[0] ?? {
    x: 0,
    y: 0.85,
    w: 0.7,
    h: 1.7,
    from: 0,
    to: 13,
  };
  const moveState = {
    startup: m.frames.startup,
    active: m.frames.active,
    recovery: m.frames.recovery,
    damage: m.damage,
    hitstun: m.hitstun,
    blockstun: m.blockstun,
    hitBoxX: hit0.x,
    hitBoxY: hit0.y,
    hitBoxW: hit0.w,
    hitBoxH: hit0.h,
    hurtBoxX: hurt0.x,
    hurtBoxY: hurt0.y,
    hurtBoxW: hurt0.w,
    hurtBoxH: hurt0.h,
    reviewStatus: m.review.status,
    reloadJson: () => {
      void hooks.reloadMoveJson().then(() => {
        const mm = match.move5lp;
        moveState.startup = mm.frames.startup;
        moveState.active = mm.frames.active;
        moveState.recovery = mm.frames.recovery;
        moveState.damage = mm.damage;
        moveState.hitstun = mm.hitstun;
        moveState.blockstun = mm.blockstun;
        moveState.reviewStatus = mm.review.status;
      });
    },
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
  move.add(moveState, 'startup', 0, 60, 1).name('起手帧').onChange(applyMove);
  move.add(moveState, 'active', 0, 60, 1).name('判定帧').onChange(applyMove);
  move.add(moveState, 'recovery', 0, 60, 1).name('硬直帧').onChange(applyMove);
  move.add(moveState, 'damage', 0, 5000, 1).name('伤害').onChange(applyMove);
  move.add(moveState, 'hitstun', 0, 60, 1).name('击中硬直').onChange(applyMove);
  move.add(moveState, 'blockstun', 0, 60, 1).name('防御硬直').onChange(applyMove);
  move.add(moveState, 'hitBoxX').name('攻击框 X').onChange(applyMove);
  move.add(moveState, 'hitBoxY').name('攻击框 Y').onChange(applyMove);
  move.add(moveState, 'hitBoxW').name('攻击框 宽').onChange(applyMove);
  move.add(moveState, 'hitBoxH').name('攻击框 高').onChange(applyMove);
  move.add(moveState, 'hurtBoxX').name('受击框 X').onChange(applyMove);
  move.add(moveState, 'hurtBoxY').name('受击框 Y').onChange(applyMove);
  move.add(moveState, 'hurtBoxW').name('受击框 宽').onChange(applyMove);
  move.add(moveState, 'hurtBoxH').name('受击框 高').onChange(applyMove);
  move.add(moveState, 'reviewStatus').name('审核状态').disable();
  move.add(moveState, 'reloadJson').name('重载 JSON');

  const render = gui.addFolder('渲染');
  render.add(cfg, 'showHitboxes').name('显示攻击框');
  render.add(cfg, 'showHurtboxes').name('显示受击框');
  render.add(cfg, 'worldScale', 0.01, 10, 0.01).name('世界缩放');
  render.add(cfg, 'modelScale', 0.01, 10, 0.01).name('模型缩放');
  render.add(cfg, 'modelYOffset', -2, 2, 0.01).name('模型 Y 偏移');
  render.add(cfg, 'cameraZ', 1, 20, 0.1).name('相机 Z');
  render.add(cfg, 'cameraY', 0, 5, 0.05).name('相机 Y');
  render.add(cfg, 'timeScaleAnim', 0, 2, 0.05).name('动画时间倍率');

  const syncOpts = () => syncMatchOpts(match, cfg);

  const input = gui.addFolder('缓冲 / 输入');
  input
    .add(cfg, 'motionHistoryCapacity', 8, 64, 1)
    .name('历史容量')
    .onChange((v: number) => {
      cfg.bufferFrames = v;
      syncOpts();
    });
  input
    .add(cfg, 'actionBufferStandard', 1, 15, 1)
    .name('标准预输入(f)')
    .onChange(syncOpts);
  input
    .add(cfg, 'actionBufferDash', 1, 15, 1)
    .name('Dash预输入(f)')
    .onChange(syncOpts);
  input
    .add(cfg, 'motionStepGapMax', 1, 20, 1)
    .name('指令步间隙(f)')
    .onChange(syncOpts);
  input
    .add(cfg, 'dashDirHoldMax', 1, 16, 1)
    .name('Dash方向窗(f)')
    .onChange(syncOpts);
  input
    .add(cfg, 'dashNeutralMax', 1, 16, 1)
    .name('Dash中性窗(f)')
    .onChange(syncOpts);
  input.add(cfg, 'enableActionBuffer').name('启用ActionBuffer').onChange(syncOpts);
  input.add(cfg, 'showBuffer').name('显示方向历史');

  // Plan: feedback-full-commands-exec-v1 §2.9 — intent / catalog probe
  const cmdFolder = gui.addFolder('指令反馈');
  const probe = match.debugProbe;
  cmdFolder.add(probe, 'lastIntentKind').name('Intent kind').listen();
  cmdFolder.add(probe, 'lastIntentMoveId').name('Intent moveId').listen();
  cmdFolder.add(probe, 'lastCommandId').name('Command id').listen();
  cmdFolder.add(probe, 'p1Phase').name('P1 phase').listen();
  cmdFolder.add(probe, 'p1ClipId').name('P1 clipId').listen();
  cmdFolder.add(probe, 'p1AnimRole').name('P1 animRole').listen();
  cmdFolder.add(probe, 'p1LocoPhase').name('P1 locoPhase').listen();
  cmdFolder.add(probe, 'p1JumpPhase').name('P1 jumpPhase').listen();
  cmdFolder.add(probe, 'p1SelfDx').name('P1 selfDx').listen();
  cmdFolder.add(probe, 'catalogCount').name('Catalog 招数').listen();
  cmdFolder.add(probe, 'lastMoveMiss').name('Catalog 未命中').listen();
  cmdFolder.add(probe, 'lastExecuteOk').name('上次出招成功').listen();
  cmdFolder.add(probe, 'logCommandsToConsole').name('出招打 Console');
  const cmdActions = {
    reloadCatalog: () => {
      void (async () => {
        const { loadFeedbackCatalog } = await import('../combat/move/MoveCatalog');
        const { catalog, loaded, failed } = await loadFeedbackCatalog();
        match.catalog = catalog;
        const m5 = catalog.get('ryu_5lp');
        if (m5) match.move5lp = m5;
        probe.catalogCount = catalog.size;
        console.info('[gui] catalog reload', loaded.length, 'fail', failed.length);
      })();
    },
    listCatalog: () => {
      console.info('[gui] catalog ids', match.catalog.listMoveIds());
    },
  };
  cmdFolder.add(cmdActions, 'reloadCatalog').name('重载 Catalog');
  cmdFolder.add(cmdActions, 'listCatalog').name('打印 Catalog IDs');

  const cancelFolder = gui.addFolder('取消 / 硬直');
  cancelFolder.add(cfg, 'enableCancel').name('启用Cancel').onChange(syncOpts);
  cancelFolder
    .add(cfg, 'hitstopFramesOnHit', 0, 30, 1)
    .name('Hitstop命中(f)')
    .onChange(syncOpts);
  cancelFolder
    .add(cfg, 'hitstopFramesOnBlock', 0, 30, 1)
    .name('Hitstop防御(f)')
    .onChange(syncOpts);
  cancelFolder.add(cfg, 'showCancelWindow').name('HUD显示取消窗');

  const moveStateFolder = gui.addFolder('移动状态');
  moveStateFolder
    .add(cfg, 'walkSpeed', 0.01, 0.2, 0.001)
    .name('前走速')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'walkBackSpeed', 0.01, 0.2, 0.001)
    .name('后走速')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'walkFirstFrameScale', 0.05, 1, 0.05)
    .name('走首帧比例')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'dashFrames', 1, 40, 1)
    .name('前冲帧数')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'dashBackFrames', 1, 40, 1)
    .name('后冲帧数')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'dashSpeed', 0.02, 0.4, 0.001)
    .name('前冲速度')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'dashBackSpeed', 0.02, 0.4, 0.001)
    .name('后冲速度')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'prejumpFrames', 1, 10, 1)
    .name('Prejump(f)')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'airFrames', 5, 60, 1)
    .name('滞空(f)')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'landingFrames', 1, 15, 1)
    .name('落地硬直(f)')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'jumpApex', 0.5, 4, 0.01)
    .name('跳顶点高')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'jumpFwdDist', 0, 4, 0.01)
    .name('前跳距')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'jumpBackDist', 0, 4, 0.01)
    .name('后跳距')
    .onChange(syncOpts);

  const movTable = gui.addFolder('移动表 (ryu_movement)');
  movTable
    .add(
      {
        reload: () => {
          void import('../data/loadRyuMovement').then(async (m) => {
            try {
              const t = await m.fetchRyuMovement();
              Object.assign(cfg, m.movementToSimDefaults(t));
              match.setMovementTable(t);
              syncOpts();
              console.info('[gui] reloaded ryu_movement', t.retrieved);
            } catch (e) {
              console.warn('[gui] reload movement failed', e);
            }
          });
        },
      },
      'reload',
    )
    .name('reloadMovementJson');

  const animDrive = gui.addFolder('动画驱动');
  animDrive.add(cfg, 'scrubFromLogic').name('逻辑帧驱动动画');
  animDrive
    .add(cfg, 'scrubMode', { uniform: 'uniform', truncate: 'truncate' })
    .name('scrubMode');
  animDrive
    .add(cfg, 'plantMode', { consensus: 'consensus', legacy: 'legacy' })
    .name('plantMode');
  animDrive.add(cfg, 'footPlantEnabled').name('footPlantEnabled');
  animDrive.add(cfg, 'rootPoseLockAttack').name('rootPoseLockAttack');
  animDrive.add(cfg, 'showFootDebug').name('showFootDebug');

  const disp = gui.addFolder('位移调试');
  disp.add(cfg, 'applySelfMovement').name('applySelfMovement').onChange(syncOpts);
  disp
    .add(cfg, 'selfMovementScale', 0, 3, 0.05)
    .name('selfMovementScale')
    .onChange(syncOpts);

  render.add(cfg, 'timeScaleAnim', 0.1, 2, 0.05).name('表现倍速');

  if (hooks.p1View) {
    attachAnimTestFolder(gui, hooks.p1View, hooks);
  }

  return gui;
}

/**
 * Animation browser: lists private/assets/ryu/anims via /api/ryu-anims,
 * auto-splits into categories/packs from directory layout, cascade select,
 * loads the selected glb clip onto P1 and loops it in preview mode.
 *
 * Layout (no hard-coded category names):
 *   anims/<category>/<pack>/catalog.json | glb/*.glb
 *
 * lil-gui note: `add(obj, prop, { displayName: value })` shows displayName in the
 * dropdown but **writes `value` into obj[prop]** on change. We store stable ids
 * (category name, pack path, clip id) as option values.
 */
function attachAnimTestFolder(
  gui: GUI,
  view: FighterView,
  hooks: GuiHooks,
): void {
  const folder = gui.addFolder('动画测试');
  const PLACEHOLDER = '';
  const state = {
    enabled: false,
    category: PLACEHOLDER,
    pack: PLACEHOLDER,
    /** Always a catalog clip id once the list is loaded (lil-gui option value). */
    selected: PLACEHOLDER,
    status: 'idle',
    reinstallMesh: false,
    reloadList: () => {
      void loadList();
    },
    playSelected: () => {
      void play();
    },
    exitPreview: () => {
      state.enabled = false;
      view.exitPreviewMode();
      state.status = '已退出预览 → 逻辑 clip';
      refreshControllers();
    },
  };

  let categories: AnimCatalogCategory[] = [];
  let allClips: AnimCatalogClip[] = [];
  let categoryOptions: Record<string, string> = { '(加载中…)': PLACEHOLDER };
  let packOptions: Record<string, string> = { '(—)': PLACEHOLDER };
  let clipOptions: Record<string, string> = { '(—)': PLACEHOLDER };

  const enabledCtrl = folder
    .add(state, 'enabled')
    .name('预览模式')
    .onChange((v: boolean) => {
      if (!v) {
        view.exitPreviewMode();
        state.status = '已退出预览 → 逻辑 clip';
      } else if (resolveSelectedClip()) {
        void play();
      }
      refreshControllers();
    });

  // Cascade lives in a subfolder so rebuild never shuffles action buttons.
  const selectFolder = folder.addFolder('选择 (自动分类)');
  selectFolder.open();

  // Controllers rebuilt when option maps change (lil-gui has no setOptions).
  let categoryCtrl = selectFolder
    .add(state, 'category', categoryOptions)
    .name('分类')
    .onChange(() => {
      onCategoryChange();
    });
  let packCtrl = selectFolder
    .add(state, 'pack', packOptions)
    .name('动作包')
    .onChange(() => {
      onPackChange();
    });
  let selectCtrl = selectFolder
    .add(state, 'selected', clipOptions)
    .name('动画')
    .onChange(() => {
      if (state.enabled) void play();
    });

  folder.add(state, 'reinstallMesh').name('整模重载(慢)');
  folder.add(state, 'playSelected').name('加载并循环');
  folder.add(state, 'exitPreview').name('退出预览');
  folder.add(state, 'reloadList').name('刷新列表');
  const statusCtrl = folder.add(state, 'status').name('状态').listen();
  statusCtrl.disable();

  function findCategory(id: string): AnimCatalogCategory | undefined {
    return categories.find((c) => c.category === id);
  }

  function findPack(
    cat: AnimCatalogCategory | undefined,
    packId: string,
  ): AnimCatalogPack | undefined {
    if (!cat) return undefined;
    return cat.packs.find((p) => p.pack === packId);
  }

  function clipsInScope(): AnimCatalogClip[] {
    const cat = findCategory(state.category);
    const pack = findPack(cat, state.pack);
    return pack?.clips ?? [];
  }

  function resolveSelectedClip(): AnimCatalogClip | undefined {
    const raw = state.selected;
    if (!raw) return undefined;
    const scope = clipsInScope();
    const byId = scope.find((c) => c.id === raw) ?? allClips.find((c) => c.id === raw);
    if (byId) return byId;
    const byLabel =
      scope.find((c) => c.label === raw) ?? allClips.find((c) => c.label === raw);
    if (byLabel) {
      state.selected = byLabel.id;
      return byLabel;
    }
    const mappedId = clipOptions[raw];
    if (mappedId) {
      const clip = allClips.find((c) => c.id === mappedId);
      if (clip) {
        state.selected = clip.id;
        return clip;
      }
    }
    return undefined;
  }

  function preferClip(list: AnimCatalogClip[]): AnimCatalogClip | undefined {
    if (list.length === 0) return undefined;
    return list.find((c) => /BAS_STD_Loop/i.test(c.baseName)) ?? list[0];
  }

  function refreshControllers(): void {
    enabledCtrl.updateDisplay();
    categoryCtrl.updateDisplay();
    packCtrl.updateDisplay();
    selectCtrl.updateDisplay();
  }

  /** Rebuild cascade dropdowns inside selectFolder (stable button order outside). */
  function rebuildCascadeControllers(): void {
    categoryCtrl.destroy();
    packCtrl.destroy();
    selectCtrl.destroy();

    categoryCtrl = selectFolder
      .add(state, 'category', categoryOptions)
      .name('分类')
      .onChange(() => {
        onCategoryChange();
      });
    packCtrl = selectFolder
      .add(state, 'pack', packOptions)
      .name('动作包')
      .onChange(() => {
        onPackChange();
      });
    selectCtrl = selectFolder
      .add(state, 'selected', clipOptions)
      .name('动画')
      .onChange(() => {
        if (state.enabled) void play();
      });

    refreshControllers();
  }

  function setPackOptionsForCategory(cat: AnimCatalogCategory | undefined): void {
    packOptions = {};
    if (!cat || cat.packs.length === 0) {
      packOptions['(无动作包)'] = PLACEHOLDER;
      state.pack = PLACEHOLDER;
      return;
    }
    for (const p of cat.packs) {
      const label = `${p.packName || p.pack} (${p.clipCount})`;
      packOptions[label] = p.pack;
    }
    const keep = cat.packs.find((p) => p.pack === state.pack);
    state.pack = keep?.pack ?? cat.packs[0]!.pack;
  }

  function setClipOptionsForPack(pack: AnimCatalogPack | undefined): void {
    clipOptions = {};
    if (!pack || pack.clips.length === 0) {
      clipOptions['(无动画)'] = PLACEHOLDER;
      state.selected = PLACEHOLDER;
      return;
    }
    for (const c of pack.clips) {
      clipOptions[c.label] = c.id;
    }
    const keep = pack.clips.find((c) => c.id === state.selected);
    state.selected = keep?.id ?? preferClip(pack.clips)?.id ?? PLACEHOLDER;
  }

  function onCategoryChange(): void {
    const cat = findCategory(state.category);
    setPackOptionsForCategory(cat);
    setClipOptionsForPack(findPack(cat, state.pack));
    rebuildCascadeControllers();
    if (state.enabled && resolveSelectedClip()) void play();
  }

  function onPackChange(): void {
    const cat = findCategory(state.category);
    setClipOptionsForPack(findPack(cat, state.pack));
    rebuildCascadeControllers();
    if (state.enabled && resolveSelectedClip()) void play();
  }

  function applyCatalog(
    cats: AnimCatalogCategory[],
    clips: AnimCatalogClip[],
  ): void {
    categories = cats;
    allClips = clips;

    categoryOptions = {};
    if (cats.length === 0) {
      categoryOptions['(无分类)'] = PLACEHOLDER;
      state.category = PLACEHOLDER;
      packOptions = { '(—)': PLACEHOLDER };
      clipOptions = { '(—)': PLACEHOLDER };
      state.pack = PLACEHOLDER;
      state.selected = PLACEHOLDER;
      rebuildCascadeControllers();
      return;
    }

    for (const c of cats) {
      categoryOptions[`${c.category} (${c.clipCount})`] = c.category;
    }

    // Keep previous category if still present; else prefer basic, else first
    const keepCat =
      cats.find((c) => c.category === state.category) ??
      cats.find((c) => c.category === 'basic') ??
      cats[0]!;
    state.category = keepCat.category;

    // If previous selection maps to a clip, restore its pack
    const prevClip = allClips.find((c) => c.id === state.selected);
    if (prevClip && prevClip.category === state.category) {
      state.pack = prevClip.pack;
    }

    setPackOptionsForCategory(keepCat);
    setClipOptionsForPack(findPack(keepCat, state.pack));
    rebuildCascadeControllers();
  }

  async function loadList(): Promise<void> {
    state.status = '拉取 /api/ryu-anims…';
    try {
      const data = await fetchRyuAnimCatalog();
      const clips = data.clips.filter((c) => c.status !== 'error');
      const cats = data.categories ?? [];
      applyCatalog(cats, clips);

      if (clips.length === 0) {
        state.status = `列表空 sources=${(data.sources ?? []).join(',') || 'none'}`;
      } else {
        const catSummary = cats
          .map((c) => `${c.category}:${c.clipCount}`)
          .join(', ');
        state.status = `已加载 ${clips.length} 条 · ${cats.length} 类 [${catSummary}]`;
      }
    } catch (err) {
      state.status = `列表失败: ${String(err)}`;
      console.warn('[AnimTest]', err);
    }
  }

  async function play(): Promise<void> {
    const clip = resolveSelectedClip();
    if (!clip) {
      state.status = '请先选择有效动画';
      console.warn('[AnimTest] no clip for selected=', state.selected, {
        category: state.category,
        pack: state.pack,
        clipCount: allClips.length,
      });
      return;
    }
    state.selected = clip.id;
    state.category = clip.category;
    state.pack = clip.pack;
    selectCtrl.updateDisplay();

    state.enabled = true;
    state.status = `加载中 ${clip.category}/${clip.packName} · ${clip.stem}…`;
    enabledCtrl.updateDisplay();
    const wasPaused = hooks.paused;
    hooks.paused = true;
    try {
      const result = await view.loadAndLoopClipFromUrl(clip.url, {
        reinstallMesh: state.reinstallMesh,
      });
      state.status =
        `循环: ${clip.category}/${clip.packName} · ${result.clipName} · ` +
        `${result.duration.toFixed(2)}s · ${clip.frameCount ?? '?'}f`;
      console.info('[AnimTest] playing', clip, result);
    } catch (err) {
      state.status = `加载失败: ${String(err)}`;
      console.warn('[AnimTest] load failed', clip.url, err);
      state.enabled = false;
      enabledCtrl.updateDisplay();
    } finally {
      hooks.paused = wasPaused;
    }
  }

  void loadList();
  folder.open();
}

export async function reloadMoveFromPublic(match: MatchSim): Promise<void> {
  const res = await fetch('/data/moves/ryu_5lp.json');
  match.move5lp = parseMoveDefinition(await res.json());
  match.catalog.register(match.move5lp);
  try {
    const h = await fetch('/data/moves/ryu_hadoken_lp.json');
    if (h.ok) {
      match.catalog.register(parseMoveDefinition(await h.json()));
    }
  } catch {
    /* optional */
  }
}

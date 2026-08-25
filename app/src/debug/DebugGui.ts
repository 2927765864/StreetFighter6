import GUI from 'three/addons/libs/lil-gui.module.min.js';
import type { MatchSim } from '../combat/match/MatchSim';
import type { FrameClock } from '../combat/frameClock';
import { syncMatchOpts, type MutableSimConfig } from '../config/constants';
import type { DummyGuardPolicy } from '../combat/types';
import { parseMoveDefinition } from '../combat/move/MoveDefinition';
import {
  fetchRyuAnimCatalog,
  type AnimCatalogCategory,
  type AnimCatalogClip,
  type AnimCatalogPack,
} from '../data/animCatalog';
import type { FighterView } from '../render/FighterView';
import * as THREE from 'three/webgpu';

export type GuiHooks = {
  paused: boolean;
  stepOnce: () => void;
  reloadMoveJson: () => Promise<void>;
  /** P1 view used by the animation test panel */
  p1View?: FighterView;
};

/** Live-apply character-art debug toggles to a FighterView root. */
export function applyArtConfigToViews(
  view: FighterView | undefined,
  cfg: MutableSimConfig,
): void {
  const root = view?.root;
  if (!root) return;
  const ny = cfg.artFlipNormalY ? -Math.abs(cfg.artNormalScale) : cfg.artNormalScale;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) {
      const mat = m as THREE.MeshStandardMaterial;
      if (!mat.isMeshStandardMaterial) continue;
      if (mat.userData?.__artNormalMap === undefined) {
        mat.userData.__artNormalMap = mat.normalMap;
      }
      if (mat.userData?.__artRoughnessMap === undefined) {
        mat.userData.__artRoughnessMap = mat.roughnessMap;
      }
      const storedN = mat.userData.__artNormalMap as THREE.Texture | null;
      const storedR = mat.userData.__artRoughnessMap as THREE.Texture | null;
      mat.normalMap = cfg.artEnableNormalMap ? storedN : null;
      if (mat.normalMap) {
        mat.normalScale.set(cfg.artNormalScale, ny);
      }
      mat.roughnessMap = cfg.artEnableRoughnessMap ? storedR : null;
      mat.roughness = cfg.artRoughness;
      mat.needsUpdate = true;
    }
  });
}

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
    dummyGuardPolicy: match.dummy.guardPolicy as string,
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
    .add(matchState, 'dummyGuardPolicy', {
      全部格挡: 'block_all',
      仅站立格挡: 'stand_block',
      仅蹲下格挡: 'crouch_block',
      不防挨打: 'none',
    })
    .name('人偶格挡')
    .onChange((v: string) => {
      match.dummy.setGuardPolicy(v as DummyGuardPolicy);
      cfg.dummyGuardPolicy = v as DummyGuardPolicy;
      match.opts.dummyGuardPolicy = v as DummyGuardPolicy;
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
  render.add(cfg, 'showPushboxes').name('显示推挤框');
  render.add(cfg, 'worldScale', 0.01, 10, 0.01).name('世界缩放');
  render.add(cfg, 'modelScale', 0.01, 10, 0.01).name('模型缩放');
  render.add(cfg, 'modelYOffset', -2, 2, 0.01).name('模型 Y 偏移');
  render.add(cfg, 'stageFitWidth', 0, 40, 0.1).name('拟合宽度');
  render.add(cfg, 'stageOriginX', -10, 10, 0.01).name('舞台原点 X');
  render.add(cfg, 'stageOriginZ', -10, 10, 0.01).name('舞台原点 Z');
  render.add(cfg, 'showFallbackGround').name('显示垫底地面');
  render.add(cfg, 'showDebugGrid').name('显示调试网格');
  render.add(cfg, 'showAxes').name('显示坐标轴');
  render.add(cfg, 'timeScaleAnim', 0, 2, 0.05).name('动画时间倍率');

  const camera = gui.addFolder('摄影机');
  camera.add(cfg, 'cameraZ', 1, 30, 0.1).name('相机距离 Z');
  camera.add(cfg, 'cameraY', 0, 5, 0.05).name('相机高度 Y');
  camera.add(cfg, 'cameraLookY', 0, 3, 0.05).name('看点高度');
  camera.add(cfg, 'cameraFov', 20, 70, 0.5).name('视野 FOV');
  camera.add(cfg, 'cameraZoomEnabled').name('开启间距变焦');
  camera.add(cfg, 'cameraZoomSepK', 0, 3, 0.01).name('变焦系数');
  camera.add(cfg, 'cameraZMax', 1, 40, 0.1).name('变焦最远');
  camera.add(cfg, 'cameraNdcPad', 0, 0.3, 0.01).name('画面边距');
  camera.add(cfg, 'cameraLerp', 0, 1, 0.01).name('镜头跟随平滑');
  camera.add(cfg, 'cameraFollowDeadzone', 0, 2, 0.01).name('镜头跟随死区');
  camera.add(cfg, 'cameraNear', 0.01, 1, 0.01).name('近裁');
  camera.add(cfg, 'cameraFar', 50, 2000, 10).name('远裁');

  const light = gui.addFolder('打光');
  light.add(cfg, 'lightHelpersVisible').name('显示灯光辅助');
  light.add(cfg, 'lightOrbitMode').name('摆灯自由视角');
  light.add(cfg, 'lightOrbitPipX', 0, 800, 1).name('预览窗左边距');
  light.add(cfg, 'lightOrbitPipY', 0, 800, 1).name('预览窗底边距');
  light.add(cfg, 'lightOrbitPipWidth', 120, 960, 1).name('预览窗宽度');
  light.add(cfg, 'lightOrbitPipHeight', 80, 540, 1).name('预览窗高度');
  light.add(cfg, 'shadowMapEnabled').name('启用阴影');
  light.add(cfg, 'shadowMapSize', 256, 4096, 256).name('阴影贴图边长');
  light.add(cfg, 'shadowCameraExtent', 5, 80, 0.5).name('阴影范围');
  light.add(cfg, 'shadowCameraNear', 0.01, 10, 0.01).name('阴影近裁');
  light.add(cfg, 'shadowCameraFar', 10, 200, 1).name('阴影远裁');
  light.add(cfg, 'shadowBias', -0.01, 0.01, 0.0001).name('阴影 bias');
  light.add(cfg, 'shadowNormalBias', 0, 0.2, 0.001).name('阴影 normalBias');
  light.add(cfg, 'shadowRadius', 0, 8, 0.1).name('阴影 radius');
  light.add(cfg, 'lightMaxCount', 5, 30, 1).name('灯数量上限');
  light.addColor(cfg, 'fogColor').name('雾色');
  light.add(cfg, 'fogNear', 1, 200, 1).name('雾近');
  light.add(cfg, 'fogFar', 10, 400, 1).name('雾远');
  light.addColor(cfg, 'bgColor').name('背景色');
  // Per-light list editing: primary UI is ControlPanel「打光」.

  const art = gui.addFolder('角色外观');
  const applyArt = () => applyArtConfigToViews(hooks.p1View, cfg);
  art.add(cfg, 'artEnableNormalMap').name('法线贴图').onChange(applyArt);
  art
    .add(cfg, 'artNormalScale', 0, 2, 0.05)
    .name('法线强度')
    .onChange(applyArt);
  art.add(cfg, 'artFlipNormalY').name('翻转法线Y').onChange(applyArt);
  art.add(cfg, 'artEnableRoughnessMap').name('粗糙贴图').onChange(applyArt);
  art.add(cfg, 'artRoughness', 0, 1, 0.01).name('基础粗糙度').onChange(applyArt);

  const headband = gui.addFolder('头巾物理');
  headband.add(cfg, 'headbandPhysicsEnabled').name('启用头巾物理');
  headband.add(cfg, 'headbandUseCenter').name('头部 Center');
  headband.add(cfg, 'headbandStiffness', 0, 4, 0.05).name('刚度');
  headband.add(cfg, 'headbandDragForce', 0, 1, 0.01).name('阻尼');
  headband.add(cfg, 'headbandGravityPower', 0, 2, 0.05).name('重力强度');
  headband.add(cfg, 'headbandGravityDirX', -1, 1, 0.05).name('重力X');
  headband.add(cfg, 'headbandGravityDirY', -1, 1, 0.05).name('重力Y');
  headband.add(cfg, 'headbandGravityDirZ', -1, 1, 0.05).name('重力Z');
  headband.add(cfg, 'headbandHitRadius', 0, 0.08, 0.001).name('带节半径');
  headband.add(cfg, 'headbandGravityAirScale', 0, 1.5, 0.05).name('滞空重力');
  headband.add(cfg, 'headbandBreathAmp', 0, 0.1, 0.001).name('呼吸幅度');
  headband.add(cfg, 'headbandBreathHz', 0, 2, 0.05).name('呼吸Hz');
  headband.add(cfg, 'headbandMaxDeltaSec', 0.016, 0.1, 0.001).name('dt上限');
  headband
    .add(cfg, 'headbandColliderHeadRadius', 0, 0.25, 0.005)
    .name('头碰撞半径');
  headband
    .add(cfg, 'headbandColliderNeckRadius', 0, 0.2, 0.005)
    .name('颈碰撞半径');
  headband
    .add(cfg, 'headbandColliderShoulderRadius', 0, 0.25, 0.005)
    .name('肩碰撞半径');
  headband
    .add(cfg, 'headbandColliderHeadYOffset', -0.1, 0.1, 0.005)
    .name('头球Y偏移');
  headband
    .add(cfg, 'headbandColliderShoulderXOffset', -0.5, 0.5, 0.01)
    .name('肩球局部X(前后)');
  headband
    .add(cfg, 'headbandStiffnessTipScale', 0.2, 1.2, 0.05)
    .name('梢刚度乘子');
  headband.add(cfg, 'headbandShowColliders').name('显示碰撞Helper');
  headband.add(cfg, 'headbandShowChainHelpers').name('显示链Helper');

  const belt = gui.addFolder('腰带物理');
  belt.add(cfg, 'beltPhysicsEnabled').name('启用腰带物理');
  belt.add(cfg, 'beltUseCenter').name('髋部 Center');
  belt.add(cfg, 'beltStiffness', 0, 4, 0.05).name('刚度');
  belt.add(cfg, 'beltDragForce', 0, 1, 0.01).name('阻尼');
  belt.add(cfg, 'beltGravityPower', 0, 2, 0.05).name('重力强度');
  belt.add(cfg, 'beltGravityDirX', -1, 1, 0.05).name('重力X');
  belt.add(cfg, 'beltGravityDirY', -1, 1, 0.05).name('重力Y');
  belt.add(cfg, 'beltGravityDirZ', -1, 1, 0.05).name('重力Z');
  belt.add(cfg, 'beltHitRadius', 0, 0.08, 0.001).name('带节半径');
  belt.add(cfg, 'beltGravityAirScale', 0, 1.5, 0.05).name('滞空重力');
  belt.add(cfg, 'beltMaxDeltaSec', 0.016, 0.1, 0.001).name('dt上限');
  belt.add(cfg, 'beltColliderHipRadius', 0, 0.3, 0.005).name('髋碰撞半径');
  belt.add(cfg, 'beltColliderThighRadius', 0, 0.3, 0.005).name('大腿碰撞半径');
  belt.add(cfg, 'beltColliderHipYOffset', -0.2, 0.2, 0.005).name('髋球Y偏移');
  belt
    .add(cfg, 'beltColliderThighYOffset', -0.2, 0.3, 0.005)
    .name('大腿球Y偏移');
  belt
    .add(cfg, 'beltColliderThighZOffset', -0.2, 0.2, 0.005)
    .name('大腿球Z偏移');
  belt.add(cfg, 'beltStiffnessTipScale', 0.2, 1.2, 0.05).name('梢刚度乘子');
  belt.add(cfg, 'beltShowColliders').name('显示碰撞Helper');
  belt.add(cfg, 'beltShowChainHelpers').name('显示链Helper');

  const pants = gui.addFolder('裤子物理');
  pants.add(cfg, 'pantsPhysicsEnabled').name('启用裤子物理');
  pants.add(cfg, 'pantsSubSteps', 1, 4, 1).name('子步数');
  pants.add(cfg, 'pantsConstraintIterations', 1, 12, 1).name('约束迭代');
  pants.add(cfg, 'pantsResistance', 0, 1, 0.01).name('惯性保留');
  pants.add(cfg, 'pantsHardness', 0, 1, 0.01).name('拉回硬度');
  pants.add(cfg, 'pantsHardnessTipScale', 0.1, 1.2, 0.05).name('梢硬度乘子');
  pants.add(cfg, 'pantsGravityPower', 0, 3, 0.05).name('重力(1≈地球)');
  pants.add(cfg, 'pantsGravityDirX', -1, 1, 0.05).name('重力X');
  pants.add(cfg, 'pantsGravityDirY', -1, 1, 0.05).name('重力Y');
  pants.add(cfg, 'pantsGravityDirZ', -1, 1, 0.05).name('重力Z');
  pants.add(cfg, 'pantsGravityAirScale', 0, 1.5, 0.05).name('滞空重力');
  pants.add(cfg, 'pantsWindScale', 0, 2, 0.05).name('风总乘子');
  pants.add(cfg, 'pantsBreathAmp', 0, 3, 0.05).name('呼吸幅度');
  pants.add(cfg, 'pantsBreathHz', 0, 2, 0.05).name('呼吸Hz');
  pants.add(cfg, 'pantsBreathDirX', -1, 1, 0.05).name('呼吸风X');
  pants.add(cfg, 'pantsBreathDirY', -1, 1, 0.05).name('呼吸风Y');
  pants.add(cfg, 'pantsBreathDirZ', -1, 1, 0.05).name('呼吸风Z');
  pants.add(cfg, 'pantsEnableHorizontal').name('横连约束');
  pants.add(cfg, 'pantsEnableShear').name('剪切约束');
  pants.add(cfg, 'pantsEnableBending').name('弯曲约束');
  pants
    .add(cfg, 'pantsStructuralShrinkHorizontal', 0, 2, 0.05)
    .name('横缩');
  pants
    .add(cfg, 'pantsStructuralStretchHorizontal', 0, 2, 0.05)
    .name('横伸');
  pants.add(cfg, 'pantsPointRadius', 0, 0.05, 0.001).name('粒子半径');
  pants.add(cfg, 'pantsMaxDeltaSec', 0.016, 0.1, 0.001).name('dt上限');
  pants.add(cfg, 'pantsRootSlideLimit', 0.05, 2, 0.05).name('Root位移熔断');
  pants.add(cfg, 'pantsRootRotateLimitDeg', 5, 180, 1).name('Root旋转熔断°');
  pants.add(cfg, 'pantsMaxSeparation', 0.1, 1.5, 0.05).name('最大离动画距');
  pants.add(cfg, 'pantsHealthReportEnabled').name('停止记录时写盘');
  pants.add(cfg, 'pantsHealthHudEnabled').name('健康小面板');
  pants
    .add(cfg, 'pantsHealthSnapshotIntervalSec', 0.5, 30, 0.5)
    .name('记录稀疏间隔秒');
  pants.add(cfg, 'pantsHealthWarnRatio', 0.1, 1, 0.05).name('警告比例');
  pants
    .add(cfg, 'pantsHealthSessionMaxEntries', 100, 5000, 50)
    .name('会话最大条数');
  pants.add(cfg, 'pantsHealthSessionKeep', 1, 50, 1).name('会话文件保留');
  pants
    .add(cfg, 'pantsHealthAutoShowConstraintsOnAbnormal')
    .name('异常自动显示线');
  pants
    .add(cfg, 'pantsColliderThighRadius', 0, 0.25, 0.005)
    .name('大腿胶囊');
  pants
    .add(cfg, 'pantsColliderThighHeadInset', 0, 0.6, 0.01)
    .name('大腿起点下移');
  pants
    .add(cfg, 'pantsColliderCalfRadius', 0, 0.2, 0.005)
    .name('小腿胶囊');
  pants.add(cfg, 'pantsColliderHipRadius', 0, 0.3, 0.005).name('髋球');
  pants.add(cfg, 'pantsColliderBeltRadius', 0, 0.3, 0.005).name('腰带球');
  pants.add(cfg, 'pantsUsePushIn').name('PushIn(易成球)');
  pants.add(cfg, 'pantsShowColliders').name('显示碰撞Helper');
  pants.add(cfg, 'pantsShowConstraints').name('显示约束线');

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
  cancelFolder.add(cfg, 'enableSpecials').name('启用必杀指令').onChange(syncOpts);
  cancelFolder.add(cfg, 'enableThrows').name('启用投技指令').onChange(syncOpts);
  cancelFolder
    .add(cfg, 'hitstopFramesOnHit', 0, 30, 1)
    .name('Hitstop命中(f)')
    .onChange(syncOpts);
  cancelFolder
    .add(cfg, 'hitstopFramesOnBlock', 0, 30, 1)
    .name('Hitstop防御(f)')
    .onChange(syncOpts);
  cancelFolder.add(cfg, 'showCancelWindow').name('HUD显示取消窗');

  const guardFolder = gui.addFolder('防住 / 推挤 / 位移');
  guardFolder.add(cfg, 'enablePushResolve').name('启用推挤').onChange(syncOpts);
  guardFolder.add(cfg, 'enableBlockPush').name('启用防御推开').onChange(syncOpts);
  guardFolder
    .add(cfg, 'blockPushbackTotal', 0, 1.5, 0.01)
    .name('防御推开总量')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'blockPushEasePower', 1, 8, 0.5)
    .name('防推ease幂')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'blockstunOverride', -1, 40, 1)
    .name('blockstun覆盖(-1表)')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'dummyUnguardedStance', { 站: 'stand', 蹲: 'crouch' })
    .name('不防姿势')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'dummyWakeupStyle', { 普通起: 'normal', 后跳起: 'back' })
    .name('Dummy起身')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'hitstunOverride', -1, 60, 1)
    .name('击中硬直覆盖')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'knockdownFramesOverride', -1, 180, 1)
    .name('倒地总帧覆盖')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'knockdownDownHoldOverride', -1, 120, 1)
    .name('躺地保持覆盖')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'wakeupBackDxTotal', 0, 2, 0.05)
    .name('后跳起位移')
    .onChange(syncOpts);
  guardFolder.add(cfg, 'enableHitPush').name('启用命中推开').onChange(syncOpts);
  guardFolder
    .add(cfg, 'hitPushbackTotal', 0, 1.5, 0.01)
    .name('命中推开fallback')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'damageScale', 0, 2, 0.05)
    .name('伤害倍率')
    .onChange(syncOpts);
  guardFolder.add(cfg, 'applySelfMovement').name('启用攻击Place').onChange(syncOpts);
  guardFolder
    .add(cfg, 'selfMovementScale', 0, 3, 0.05)
    .name('selfMovementScale')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'mmdkUnitScale', 0.001, 2, 0.001)
    .name('mmdkUnitScale')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'stageMinX', -10, 0, 0.1)
    .name('舞台minX')
    .onChange(syncOpts);
  guardFolder
    .add(cfg, 'stageMaxX', 0, 10, 0.1)
    .name('舞台maxX')
    .onChange(syncOpts);

  const boxesFolder = gui.addFolder('框显示');
  boxesFolder.add(cfg, 'showHitboxes').name('显示 Hit');
  boxesFolder.add(cfg, 'showHurtboxes').name('显示 Hurt');
  boxesFolder.add(cfg, 'showPushboxes').name('显示 Push');
  boxesFolder.add(cfg, 'hurtPartColors').name('按 part 染色绿框');

  const assemblyFolder = gui.addFolder('装配 / 时间轴');
  const probeTl = match.debugProbe;
  assemblyFolder.add(probeTl, 'p1StanceId').name('姿态').listen();
  assemblyFolder.add(probeTl, 'p1ActionTimelineFrame').name('动作时间轴帧').listen();
  assemblyFolder.add(probeTl, 'p1TimelineFrame').name('timelineFrame').listen();
  assemblyFolder.add(probeTl, 'p1Total').name('逻辑 total').listen();
  assemblyFolder.add(probeTl, 'p1CanAct').name('canAct').listen();
  assemblyFolder.add(probeTl, 'p1ActionTimelineActive').name('动作层激活').listen();
  assemblyFolder.add(probeTl, 'p1HasAttackResidual').name('attackResidual').listen();
  assemblyFolder.add(probeTl, 'p1HurtCount').name('本帧 hurt 块数').listen();
  assemblyFolder.add(probeTl, 'p1HitCount').name('本帧 hit 块数').listen();
  assemblyFolder.add(probeTl, 'reviewStatus').name('当前招 review').listen();
  assemblyFolder
    .add(
      {
        debugClearActionBoxes: () => {
          match.p1.debugClearActionBoxes = true;
          match.p1.clearActionTimeline();
        },
      },
      'debugClearActionBoxes',
    )
    .name('强制关动作层');
  assemblyFolder
    .add(
      {
        reloadStance: async () => {
          try {
            const { loadStanceTableResolved } = await import(
              '../data/loadMoveWithOverride'
            );
            const { table: t } = await loadStanceTableResolved();
            match.setStanceTable(t);
            console.info('[gui] stance reloaded', t.review);
          } catch (e) {
            console.warn('[gui] stance reload failed', e);
          }
        },
      },
      'reloadStance',
    )
    .name('重载姿态框 JSON');
  assemblyFolder.add(probeTl, 'hitstopTimer').name('hitstop').listen();
  assemblyFolder.add(probeTl, 'lastHitResult').name('lastHit').listen();
  assemblyFolder.add(probeTl, 'lastGuardLevel').name('lastGuardLevel').listen();
  assemblyFolder.add(probeTl, 'lastGuardOk').name('lastGuardOk').listen();
  assemblyFolder.add(probeTl, 'dummyGuardPolicy').name('dummyGuardPolicy').listen();
  assemblyFolder.add(probeTl, 'p2Phase').name('P2 phase').listen();
  assemblyFolder.add(probeTl, 'p2StunTimer').name('P2 stunTimer').listen();
  assemblyFolder.add(probeTl, 'p2ClipId').name('P2 clipId').listen();
  assemblyFolder.add(probeTl, 'p2KdPhase').name('P2 kdPhase').listen();
  assemblyFolder.add(probeTl, 'lastHitReaction').name('lastHitReaction').listen();
  assemblyFolder.add(probeTl, 'lastHitClipId').name('lastHitClipId').listen();
  assemblyFolder.add(probeTl, 'p2Crouching').name('P2 crouching').listen();
  assemblyFolder.add(probeTl, 'pushOverlapX').name('pushOverlapX').listen();
  assemblyFolder.add(probe, 'p1SelfDx').name('P1 selfDx').listen();
  assemblyFolder.add(probeTl, 'p2BlockPushDx').name('P2 blockPushDx').listen();

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
    .add(cfg, 'dashFrontHeavyPower', 0.5, 4, 0.05)
    .name('dash前重指数')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'dashSpeed', 0.02, 0.4, 0.001)
    .name('前冲均速(总距/帧)')
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
    .add(cfg, 'neutralLandToRiseIdleRatio', 0, 1, 0.01)
    .name('落地→蹲起(接待机)溶图起点比例')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'neutralLandToRiseTurnRatio', 0, 1, 0.01)
    .name('落地→蹲起(接转身)溶图起点比例')
    .onChange(syncOpts);
  moveStateFolder
    .add(cfg, 'neutralRiseToTurnDissolveRatio', 0, 1, 0.01)
    .name('蹲起→转身溶图起点比例')
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
    .name('plantMode(信动画/每帧追地)');
  animDrive.add(cfg, 'footPlantEnabled').name('出招支撑脚XZ');
  animDrive.add(cfg, 'rootPoseLockAttack').name('rootPoseLockAttack');
  animDrive
    .add(cfg, 'locoBlendSec', 0, 0.35, 0.01)
    .name('locoBlendSec');
  animDrive
    .add(cfg, 'residualToMoveBlendSec', 0, 0.35, 0.01)
    .name('residual→move溶图');
  animDrive
    .add(cfg, 'residualToAttackBlendSec', 0, 0.2, 0.01)
    .name('residual→攻溶图');
  animDrive
    .add(cfg, 'residualToStanceBlendSec', 0, 0.35, 0.01)
    .name('residual→站蹲过渡');
  animDrive
    .add(cfg, 'crossfadeAdvanceMode', { dual: 'dual', freeze: 'freeze' })
    .name('溶图旧层模式');
  animDrive
    .add(cfg, 'plantSlewPerSec', 0.05, 2, 0.01)
    .name('plantSlew(仅legacy)');
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

# AI 可执行方案：隆头巾物理（脑后飘带）v0

> **文档类型**：给 **AI / 人类执行者** 的实现规范（非共识原文）  
> **节点**：2026-08-24  
> **对齐共识（必须全文服从）**：`docs/headband-physics-consensus-v0.md`  
> **对齐调查（选型依据，非共识）**：`docs/research/headband-physics-research-2026-08-24.md`  
> **元共识**：`docs/consensus-v0.md` §0 写进即全做  
> **技术栈（以仓库为准）**：`three@^0.185.1`、Vite、Vitest、`MutableSimConfig` + `ControlPanel` / `DebugGui` + `persist.ts` / `shipping.json`  
> **本方案补充检索**：VRMC_springBone 规范、pixiv three-vrm-springbone 源码、three.js Discourse 骨覆盖闪烁、hitstop 附属继续动、Verlet 穿模/爆炸、VRM center 防抖（见 §1 / §12）

---

## 0. 执行者硬性规则（违反即停）

1. **禁止自我发挥架构**：不得改用整片网格布料（`three-simplecloth` / 官方 cloth 网格）作为主路径；不得引入 Unity MagicaCloth / PhysBones / DynamicBone 运行时；不得为「通用布料中台」搭抽象层。  
2. **算法权威固定**：二次运动必须实现 **VRMC_springBone 1.0 非规范伪代码中的 Verlet 弹簧骨**（见 **SPEC-SB**），以 **`@pixiv/three-vrm-springbone` 源码行为**为参照实现（见 **PKG-SB**）。禁止自造欧拉积分弹簧、禁止自造无约束的「每骨加噪声」。  
3. **`combat/` 禁止 `import 'three'`**；头巾模拟只允许在 `app/src/render/`（及测试）。  
4. **只做隆**：骨名写死为下文 `L_Hairband_*` / `R_Hairband_*`；P2 若同模型可共用模块，但不得扩展其他角色 API。  
5. **额头固定 / 只动脑后**：不得对绑在头上、非 `Hairband` 链的网格做顶点布料；不得改 `C_Head` 本地旋转作为「假物理」。  
6. **受击定住 / 硬直豁免**：头巾 `update(deltaSec)` **不得**因 `match.hitstopTimer > 0` 或 `fighter.phase === 'hitstun'` 而跳过；`deltaSec` 取 **墙钟**（与 `FighterView.syncFromLogic` 的 `wallDtSec` 同源），不得用「逻辑帧是否推进」门控。  
7. **每步必须有验收**；缺依赖写 `BLOCKED:` 停工，不得用猜测骨名继续。  
8. **配置字段名以本方案 §7 为准**；禁止另起同义字段而不接面板/持久化。

---

## 1. 权威依据总表（每步只能引用这些，禁止「我觉得」）

### 1.1 项目内

| ID | 路径 / 内容 | 用途 |
|----|-------------|------|
| **C-HB** | `docs/headband-physics-consensus-v0.md` | 观感、豁免、防穿模、可调可存、只做隆 |
| **R-HB** | `docs/research/headband-physics-research-2026-08-24.md` | 案例与选型背景（非定案条文） |
| **APP-VIEW** | `app/src/render/FighterView.ts` | `syncFromLogic(fighter, cfg, wallDtSec)`；动画驱动后挂接点 |
| **APP-MAIN** | `app/src/main.ts` | rAF：`p1View.syncFromLogic(..., wallDt)`；墙钟 `wallDt` |
| **APP-MATCH** | `app/src/combat/match/MatchSim.ts` ~696–699 | `hitstopTimer > 0` 时 **提前 return**，逻辑不推进 → 身体姿态因 scrub 定住 |
| **APP-CONST** | `app/src/config/constants.ts` `MutableSimConfig` | 新字段必须加类型 + `createDefaultSimConfig` |
| **APP-STORE** | `app/src/config/store.ts` `mergeConfig` | **number/boolean/string** 可自动 merge；新标量字段即可进 local/shipping |
| **APP-PERSIST** | `app/src/config/persist.ts` | 本地默认 / 导出 shipping.json |
| **APP-PANEL** | `app/src/debug/ControlPanel.ts` | 主调试面板滑条 |
| **APP-GUI** | `app/src/debug/DebugGui.ts` | lil-gui 同步滑条（若该文件仍维护同 cfg） |
| **ASSET-GLB** | `app/public/models/ryu/ryu_c1_textured.glb`（及同骨架 `ryu_c1.glb`） | 已含网格 `Group_0_Sub_0__esf_HeadBand` 与骨链（见 §2） |
| **PKG-THREE** | `app/package.json` → `"three": "^0.185.1"` | Three 版本 |

### 1.2 规范 / 开源实现（算法与 API，必须按此实现）

| ID | 来源 | 本方案采用的语义 |
|----|------|------------------|
| **SPEC-SB** | [VRMC_springBone 1.0](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_springBone-1.0/README.md) § SpringBone Algorithm | Verlet：`inertia=(current-prev)*(1-dragForce)`；`stiffness=dt*parentRot*initialLocalRot*boneAxis*stiffness`；`external=dt*gravityDir*gravityPower`；定长约束；球/胶囊碰撞；再写回 Head 旋转；**center space** 可选 |
| **PKG-SB** | npm [`@pixiv/three-vrm-springbone`](https://www.npmjs.com/package/@pixiv/three-vrm-springbone) · 源码 [pixiv/three-vrm `packages/three-vrm-springbone`](https://github.com/pixiv/three-vrm/tree/dev/packages/three-vrm-springbone) | **允许依赖此包**（与 three 0.185 对齐的最新 3.x）；核心类：`VRMSpringBoneManager`、`VRMSpringBoneJoint`、`VRMSpringBoneCollider` / `VRMSpringBoneColliderGroup`、`VRMSpringBoneColliderShapeSphere`（及 capsule 若用） |
| **PKG-SB-JOINT** | [`VRMSpringBoneJoint.ts`](https://github.com/pixiv/three-vrm/blob/dev/packages/three-vrm-springbone/src/VRMSpringBoneJoint.ts) | `update(delta)`：center 空间惯性 + 世界空间刚度/重力 + `_collision` + 旋转写回 |
| **PKG-SB-MGR** | [`VRMSpringBoneManager.ts`](https://github.com/pixiv/three-vrm/blob/dev/packages/three-vrm-springbone/src/VRMSpringBoneManager.ts) | `update(delta)`：先更新祖先世界矩阵，再按根→叶更新 joints |
| **PKG-SB-EX** | [springbone examples](https://pixiv.github.io/three-vrm/packages/three-vrm-springbone/examples) | `multiple.html` / `collider.html`：手工建链 + 碰撞参考 |
| **UNI-SB** | [UniVRM `VRMSpringBone.cs`](https://github.com/vrm-c/UniVRM/blob/master/Assets/VRM/Runtime/SpringBone/VRMSpringBone.cs) 注释 | 算法源自 rocketjump；**DefaultExecutionOrder 在动画之后** |
| **DOC-CENTER** | SPEC-SB「Center Space」+ [UniVRM secondary 文档 · Prevents shaking when moving](https://vrm.dev/en/univrm/springbone/univrm_secondary/) | `center` 用于走跑时过抖；头饰可绑头 |

### 1.3 角色饰品参数与碰撞参考（抄数值区间，不抄引擎）

| ID | 来源 | 写入本方案 |
|----|------|------------|
| **REF-KAWAII-RIBBON** | [KawaiiPhysics Wiki · Accessories · Ribbons & Capes](https://github.com/pafuhana1213/KawaiiPhysics/wiki/Tutorial-Accessories-en) | 丝带：中等阻尼、保形刚度、球形限制防穿头 |
| **REF-CHAIN** | [samlletas/verlet-chain-system](https://github.com/samlletas/verlet-chain-system) | 围巾/披风向：固定步长、idle 风、**跳跃时 Override 重力** |
| **REF-HITSTOP** | [Unity Discussions · fighting hitstop · hair still bounces](https://discussions.unity.com/t/hello-i-am-looking-to-recreate-a-hit-stop-effect-similar-to-how-you-see-in-fighting-games/910407) | 停 Animator；动态骨继续 |
| **REF-HITSTOP-CAPCOM** | [Shane Sicienski · Hitstop in Capcom Beat 'Em Ups](https://shane-sicienski.com/blog/blog-post-title-one-55pmn) | 只停参与打击的角色更新，附属可继续 |

### 1.4 陷阱与社区（必须按 §12 处理）

| ID | 来源 | 结论 |
|----|------|------|
| **TRAP-MIXER** | [Discourse: overriding bone after mixer flickers](https://discourse.threejs.org/t/overriding-an-animation-by-modifying-a-bone-causes-flickering/69909) | **每帧在 `AnimationMixer.update` 之后**再写骨；必要时 `updateMatrix` / `updateWorldMatrix` |
| **TRAP-DT** | [N.E.K.O / three-vrm springbone 调试笔记](https://tessl.io/registry/skills/github/Project-N-E-K-O/N.E.K.O/vrm-springbone-physics) | `delta` 必须是**秒**；tab 切换要 **clamp**（建议 `min(dt, 0.05)`）否则爆炸上飞 |
| **TRAP-CENTER** | SPEC-SB Center + VRoid「移动时过度摇晃」说明 | 世界空间过抖用 center；过稳则关 center 或降 drag |
| **TRAP-COLLIDER** | 同上 Tessl 笔记 | 头碰撞半径过大 → 头发/带「炸开」；半径要可调并默认偏小 |
| **TRAP-VERLET** | [toqoz.fyi · Verlet Rope](https://toqoz.fyi/game-rope.html) · [Unity verlet rope lag thread](https://discussions.unity.com/t/verlet-rope-lags-behind-the-transform-its-supposed-to-follow/925595) | 定长约束/迭代；根附着顺序；高速穿模 |

---

## 2. 资产事实（2026-08-24 实测 `ryu_c1_textured.glb`，禁止改名猜）

| 项 | 事实 |
|----|------|
| 头巾网格 | 节点/网格名含 `esf_HeadBand`（`Group_0_Sub_0__esf_HeadBand`），带 `JOINTS_0`/`WEIGHTS_0` **蒙皮** |
| 左飘带骨链（根→梢） | `L_Hairband_00_01` → `_02` → … → `_09` → `L_Hairband_00_end` |
| 右飘带骨链 | `R_Hairband_00_01` → … → `_09` → `R_Hairband_00_end` |
| 链父节点 | `C_Head` 的 children 含 `191`/`201`（即左右 `_01`） |
| 额头「绑住」 | **不**把非 Hairband 的头巾蒙皮权重改为布料；靠 **不把 `C_Head` 当 spring head 乱扭** + 网格仍蒙在头+带上，仅带骨被弹簧改旋转 |
| 动画是否驱动 Hairband | **是**。抽样 idle/受击/攻击 glb 均含大量 `Hairband` 通道（约 60/片）。因此必须 **mixer 之后覆盖**（TRAP-MIXER），不得假设「骨没有动画轨道」 |

碰撞挂点骨名（同 glb 存在）：

| 用途 | 骨名 |
|------|------|
| 头 | `C_Head` |
| 颈 | `C_Neck`（若缺则仅用 `C_Head`） |
| 肩 | `L_Shoulder`、`R_Shoulder` |
| 胸（可选） | `C_Chest` |

---

## 3. 目标行为（验收语义）

| 项 | 要求 |
|----|------|
| 造型 | 不改网格长度；左右现有链 |
| 跟手 | 跑/急停/变向、起跳/滞空/落地有可见甩尾；攻击有跟随（可略宽） |
| 默认手感 | **偏硬偏短**（高 stiffness、偏高 drag、中低 gravity；见 §7 默认值） |
| 呼吸感 | 静止时低频微扰（§6.5），不抢戏 |
| 防穿 | 头/颈/肩球碰撞，少钻头肩 |
| 定住豁免 | `hitstopTimer>0` 时身体定住，飘带仍用墙钟 `dt` 更新 |
| 硬直豁免 | `phase===hitstun` 全程飘带仍更新 |
| 存档 | §7 字段进 ControlPanel + localStorage/shipping |
| 开关 | `headbandPhysicsEnabled` 可关，关则不写骨（保留动画原轨） |

---

## 4. 固定架构（禁止另起炉灶）

```
rAF (main.ts)
  MatchSim.step（hitstop 时可能提前 return → 逻辑姿态冻结）
  FighterView.syncFromLogic(fighter, cfg, wallDt)
      1) 写 root 位姿 / facing
      2) AnimationMixer 路径（scrub 或 free-run）→ 骨架含 Hairband 动画轨
      3) 【新增】若 cfg.headbandPhysicsEnabled：
            headband.update({
              deltaSec: clamp(wallDt * timeScaleAnim, 0, headbandMaxDeltaSec),
              cfg,
              jumpPhase: fighter.jumpPhase,  // 供重力 override
            })
      4) 既有 plantFeet 等后处理（不得再覆盖 Hairband 旋转）
  render
```

**模块落点（文件名固定）**

| 文件 | 职责 |
|------|------|
| `app/src/render/headband/RyuHeadbandPhysics.ts` | 绑定骨链、建 `VRMSpringBoneManager`、读 cfg、每帧 `update`、debug helpers |
| `app/src/render/headband/ryuHeadbandBoneNames.ts` | 导出左右链名字数组常量（唯一骨名来源） |
| `app/src/render/FighterView.ts` | 持有 `RyuHeadbandPhysics \| null`；在 `syncFromLogic` **mixer 完成之后**调用 |
| `app/src/config/constants.ts` | §7 字段 |
| `app/src/debug/ControlPanel.ts` | 「头巾物理」分区滑条 |
| `app/src/debug/DebugGui.ts` | 同名字段（保持双面板一致） |
| `app/tests/render/ryuHeadbandPhysics.test.ts` | 纯逻辑：dt clamp、enabled 开关、（可 mock Object3D）更新不因 hitstop 标志跳过 |

**依赖安装（必须）**

```bash
cd app && npm install @pixiv/three-vrm-springbone@^3
```

- 以安装时 npm 上与 `three@0.185` peer 兼容的 **3.x 最新**为准。  
- **禁止**安装整包 `@pixiv/three-vrm` 仅因头巾（过重）；本方案只用 **springbone 子包** 的 Manager/Joint/Collider API。  
- 若 peer 冲突：`BLOCKED:` 记录版本，允许 **vendor** `node_modules/@pixiv/three-vrm-springbone` 中 `VRMSpringBone*.js` 到 `app/src/render/headband/vendor/` 并保留 LICENSE 注释；**禁止重写公式**。

---

## 5. 具体实现步骤（按序执行）

### Step 0 — 资产门禁

1. 加载当前训练场所用隆模板（与 `FighterView` 同源 glb）。  
2. 断言存在骨：`L_Hairband_00_01`…`_end`、`R_Hairband_00_01`…`_end`、`C_Head`。  
3. 缺任一：`BLOCKED: missing Hairband bones` 停工（不得改用头发 `C_Hair*` 冒充）。

**验收**：控制台或单测列出链长 = 10 节点/侧（01–09+end）。

---

### Step 1 — 安装并引用 springbone 包

```ts
import { VRMSpringBoneManager } from '@pixiv/three-vrm-springbone';
import { VRMSpringBoneJoint } from '@pixiv/three-vrm-springbone';
import { VRMSpringBoneCollider } from '@pixiv/three-vrm-springbone';
import { VRMSpringBoneColliderGroup } from '@pixiv/three-vrm-springbone';
import { VRMSpringBoneColliderShapeSphere } from '@pixiv/three-vrm-springbone';
```

（若导出名与版本略有差异，以包内 `exports` / `.d.ts` 为准，但**类职责不得换**。）

对照 **PKG-SB-EX** `multiple.html`：对每个 Head→子节点建 `VRMSpringBoneJoint(bone, child, settings, colliderGroups)`，`manager.addJoint(joint)`，每帧 `manager.update(delta)`。

**验收**：空场景两节骨 + 重力，尾部下垂；关页不报错。

---

### Step 2 — 绑定隆双链（`RyuHeadbandPhysics.bind(root)`）

1. `root.getObjectByName` 取 §2 骨。  
2. **左链 joints 列表**（顺序根→叶）：  
   `L_Hairband_00_01` … `L_Hairband_00_09`，`L_Hairband_00_end` 仅作最后一节的 child/tail（SPEC-SB：末 joint 只需 node）。  
3. 右链对称。  
4. 对每一对 `(joints[i], joints[i+1])` 创建 `VRMSpringBoneJoint`，settings 来自 cfg（§7）。  
5. `center`：当 `cfg.headbandUseCenter === true` 时，两链 `center = C_Head`（SPEC-SB / DOC-CENTER）；否则 `center` 不设（世界空间，跟手更强、更易过抖）。  
6. `manager.setInitState()`（或包内等价：在**当前 bind 姿态**采 rest）——必须在角色已摆到可用 bind/首帧姿态后调用一次。  
7. 传送/重载模型时：`manager.reset()` 再 `setInitState()`。

**禁止**：把 `C_Hair*` 加入 spring；禁止分支链（SPEC-SB branching undefined）。

**验收**：`enabled` 时 idle，带相对纯动画有额外下垂/微晃；`enabled=false` 与改前动画一致。

---

### Step 3 — 碰撞体（身体，不管场景）

创建 `VRMSpringBoneColliderGroup`，加入球体（**ShapeSphere**）：

| colliderId | 附着骨 | 默认半径字段 | 默认（米，模型已是 m 级） |
|------------|--------|--------------|---------------------------|
| head | `C_Head` | `headbandColliderHeadRadius` | `0.09` |
| neck | `C_Neck` | `headbandColliderNeckRadius` | `0.06` |
| lShoulder | `L_Shoulder` | `headbandColliderShoulderRadius` | `0.08` |
| rShoulder | `R_Shoulder` | 同上 | `0.08` |

- offset 默认 `(0,0,0)`；若穿模，用面板 `headbandColliderHeadYOffset`（默认 `0.02`）只调头球局部 Y。  
- 左右链 **共用** 同一 colliderGroup。  
- **不做**地面/舞台碰撞（共识）。  
- 半径过大导致带外翻：按 TRAP-COLLIDER **减小**，禁止「加大 stiffness 硬扛」当唯一手段。

**验收**：调试 `headbandShowColliders=true` 时可见球；低头/出拳时带不长期埋进头网格。

---

### Step 4 — 挂到 `FighterView.syncFromLogic`（TRAP-MIXER + 豁免）

在 **所有** `this.mixer.update(...)` / `scrubActionTo` 完成、**且**本帧骨架已反映逻辑姿态之后，调用：

```ts
this.headband?.update({
  deltaSec: Math.min(Math.max(wallDtSec, 0), cfg.headbandMaxDeltaSec) * (cfg.timeScaleAnim || 1),
  cfg,
  jumpPhase: fighter.jumpPhase,
});
```

硬性：

1. **不**读取 `hitstopTimer` 来决定是否 update。  
2. `deltaSec` 单位为**秒**（TRAP-DT）；`headbandMaxDeltaSec` 默认 `0.05`。  
3. `update` 内：`manager.update(deltaSec)`（PKG-SB-MGR）。  
4. 若包要求写骨后更新矩阵：对改写过的 bone `updateMatrix()`；manager 已处理则勿重复破坏。  
5. `previewMode`：同样可跑物理（便于调参）；或跟 `cfg.headbandPhysicsEnabled`。

**手测豁免**：调大 `hitstopFramesOnHit`，打中 P2：身体定住期间头巾仍晃。

---

### Step 5 — 跳跃重力 Override（REF-CHAIN）

在调用 `manager.update` **之前**，按 `jumpPhase` 临时缩放写入各 joint 的 `settings.gravityPower`：

| `fighter.jumpPhase` | 乘数配置键 | 默认 |
|---------------------|------------|------|
| `'air'` | `headbandGravityAirScale` | `0.55` |
| 其他（含落地瞬间后站立） | `1.0` | — |

落地后恢复 `cfg.headbandGravityPower`。  
依据：verlet-chain-system README「decreasing simulation gravity during a character jump」。

**验收**：起跳带上扬/滞后可见；落地有回甩；默认可仍偏硬。

---

### Step 6 — 静止呼吸感（微风）

在 inertia/external 路径上叠加（二选一，**优先 A**）：

- **A（推荐）**：每帧给 `settings` 或 external 增加  
  `wind = (sin(t * headbandBreathHz * 2π) * headbandBreathAmp)` 沿角色**局部侧向+微后向**（用 `C_Head` 世界矩阵变换），幅度默认极小。  
- **B**：仿 REF-CHAIN `VerletWave` 思路的低频位移，但必须进同一 Verlet 状态，禁止直接改 mesh 顶点。

`t` 用墙钟累计，**hitstop 期间继续累加**。

**验收**：站立 idle 微动；`headbandBreathAmp=0` 可关。

---

### Step 7 — 配置、面板、持久化

见 §7。必须：

1. `MutableSimConfig` + `createDefaultSimConfig`  
2. `ControlPanel` 新 section `headband`（`expandedSections.headband`）  
3. `DebugGui` 同步  
4. 依赖现有「保存本地默认 / 导出 shipping」——标量字段经 `mergeConfig` 即可，**不必**改 merge 特例  

---

### Step 8 — 测试

| 测试 | 断言 |
|------|------|
| `ryuHeadbandPhysics.test.ts` | `maxDelta` clamp；`enabled=false` 不调用 manager.update（mock）；重力 air scale 选择正确 |
| 可选 | 固定 `delta` 两帧后 `currentTail` 改变（mock 两骨） |
| 手测清单 | 共识 §5 全表 |

禁止：用「截图 AI 观感」代替手测条目打勾。

---

## 6. 算法落点（执行时对照 SPEC-SB，禁止改公式）

每个 joint 每帧（包内已实现；vendor 时逐字对齐）：

1. **Inertia**（可在 center 空间）：`(currentTail - prevTail) * (1 - dragForce)`  
2. **Stiffness**：`delta * parentWorldRot * initialLocalRot * boneAxis * stiffness`  
3. **External**：`delta * gravityDir * gravityPower`（+ 本方案呼吸风）  
4. `nextTail = currentTail + inertia + stiffness + external`  
5. **定长**：拉回 `boneLength`  
6. **碰撞**：球（头颈肩）；穿透则沿法线推出再定长  
7. 写 `prev/current`；用 fromTo 四元数更新 **Head** 局部旋转  

排序：根→叶（PKG-SB-MGR）。

---

## 7. 必须公开到调试面板的参数（字段名冻结）

全部进入 `MutableSimConfig`；ControlPanel 中文标签如下；默认值服务共识「偏硬偏短 + 微呼吸」。

| 字段 | 类型 | 默认 | 范围建议 | 面板标签 | 依据 |
|------|------|------|----------|----------|------|
| `headbandPhysicsEnabled` | boolean | `true` | — | 启用头巾物理 | 共识可关对比 |
| `headbandUseCenter` | boolean | `true` | — | 使用头部 Center（减走过抖） | SPEC-SB / DOC-CENTER |
| `headbandStiffness` | number | `1.35` | 0–4 | 刚度（回弹/硬度） | SPEC-SB stiffness；偏硬 >1 |
| `headbandDragForce` | number | `0.48` | 0–1 | 阻尼 dragForce | SPEC-SB；偏高更稳 |
| `headbandGravityPower` | number | `0.35` | 0–2 | 重力强度 | SPEC-SB；中低 |
| `headbandGravityDirX/Y/Z` | number | `0,-1,0` | -1–1 | 重力方向 | SPEC-SB gravityDir |
| `headbandHitRadius` | number | `0.012` | 0–0.08 | 带节碰撞半径 | SPEC-SB hitRadius |
| `headbandGravityAirScale` | number | `0.55` | 0–1.5 | 滞空重力乘数 | REF-CHAIN |
| `headbandBreathAmp` | number | `0.012` | 0–0.1 | 呼吸/微风幅度 | 共识呼吸感 |
| `headbandBreathHz` | number | `0.35` | 0–2 | 呼吸频率 Hz | 低频 |
| `headbandMaxDeltaSec` | number | `0.05` | 0.016–0.1 | 单帧 dt 上限（秒） | TRAP-DT |
| `headbandColliderHeadRadius` | number | `0.09` | 0–0.25 | 头碰撞球半径 | TRAP-COLLIDER |
| `headbandColliderNeckRadius` | number | `0.06` | 0–0.2 | 颈碰撞球半径 | 共识头肩 |
| `headbandColliderShoulderRadius` | number | `0.08` | 0–0.25 | 肩碰撞球半径 | 共识头肩 |
| `headbandColliderHeadYOffset` | number | `0.02` | -0.1–0.1 | 头球局部 Y 偏移 | 调穿模 |
| `headbandShowColliders` | boolean | `false` | — | 显示碰撞球 Helper | 调试 |
| `headbandShowChainHelpers` | boolean | `false` | — | 显示链骨轴/点 | 调试 |

**可选但不强制（若做必须同名）**

| 字段 | 默认 | 说明 |
|------|------|------|
| `headbandStiffnessTipScale` | `0.85` | 越靠梢刚度乘子（更软梢）；实现为按 joint 索引 lerp |

每帧从 cfg **复制到** joint.settings（允许调参热更新）。改 `UseCenter` / enabled / 碰撞半径：需要 rebuild colliders 或 `setInitState` 时在面板 onChange 调 `headband.rebuildFromConfig()`。

---

## 8. 明确不做（共识 + 本方案）

| 不做 | 原因 |
|------|------|
| 加长造型 / 新做飘带 mesh | 共识 |
| 额头绑带顶点布料 | 共识；资产为整网蒙皮 |
| 场景地墙碰撞 | 共识 |
| `three-simplecloth` / WebGPU compute cloth 主路径 | 依赖 WebGPU 涂色工作流；过重；R-HB 备选非主 |
| 驱动 `C_Hair*` | 非头巾共识范围 |
| 慢动作/暂停/回放特殊策略 | 共识 ⬜ |
| 改 `MatchSim` hitstop 语义 | 只需渲染侧解耦 |

---

## 9. 与 hitstop / 硬直的关系（实现核对表）

| 现象 | 原因（现仓） | 头巾侧 |
|------|--------------|--------|
| 命中后身体停几帧 | `MatchSim` hitstop 提前 return，逻辑帧不涨；scrub 动画时间钉死 | 仍用 `wallDt` 调 `manager.update` |
| 硬直中身体播受击片 | phase hitstun，逻辑推进后 scrub | 同样每帧物理 |
| idle free-run | mixer 走 `animDt` | 物理在 mixer 后，双轨都动 |

依据：REF-HITSTOP、REF-HITSTOP-CAPCOM、APP-MATCH。

---

## 10. 手测脚本（执行者打勾）

1. 启用物理，站立：微呼吸；关呼吸 amp=0：几乎只剩重力静平衡。  
2. 前跑急停：带明显前冲回摆。  
3. 跳起滞空：重力减弱可见；落地回摆。  
4. 5LP/脚：出招收招有跟随。  
5. 调 `hitstopFramesOnHit=20` 打中：定住期带头仍动。  
6. 受击硬直全程：带头仍动。  
7. 低头/转身：少穿头肩；必要时降 collider 半径。  
8. 关 `headbandPhysicsEnabled`：回到动画轨。  
9. 改刚度/阻尼 → 保存本地默认 → 刷新仍在。  
10. 导出 shipping 含新字段。

---

## 11. 坑与方案内对策（检索补充）

| 坑 | 检索来源 | 本方案对策 |
|----|----------|------------|
| mixer 与手写骨抢权重闪烁 | TRAP-MIXER | **严格** mixer 之后 update；enabled 时覆盖 Hairband |
| dt 用错单位 / 大 dt 爆炸 | TRAP-DT | 秒；`headbandMaxDeltaSec` clamp |
| 走跑过抖 | SPEC-SB center、DOC-CENTER | 默认 `headbandUseCenter=true`；要更跟手再关 |
| 头碰撞过大外翻 | TRAP-COLLIDER | 默认小半径 + 面板 |
| 动画轨每帧写回 Hairband | 本仓 glb 实测 | 覆盖策略；勿删全部 clip 轨除非另立资产管线 |
| Verlet 根附着滞后 | Unity verlet rope 讨论 | 链父已随 `C_Head`；先同步角色 root/头再 spring |
| 定长拉伸感 | toqoz Verlet 文 | 使用包内定长；勿再叠错误缩放 |
| 依赖 peer 冲突 | npm three-vrm-springbone | vendor 源码，禁止改公式 |
| 把 hitstop 整页暂停 | 错误实现 | **禁止** `if (hitstop) return` 包住 headband |

---

## 12. 相关文件

| 文件 | 关系 |
|------|------|
| `docs/headband-physics-consensus-v0.md` | 上位共识 |
| `docs/research/headband-physics-research-2026-08-24.md` | 调研 |
| 本文件 | AI 执行规范 |

---

## 13. 完成定义（给 AI 的 Definition of Done）

同时满足：

1. 共识 §5 手测条目可勾。  
2. 代码路径符合 §4–§6；依赖为 `@pixiv/three-vrm-springbone` 或 vendor 同源。  
3. §7 全部字段在 ControlPanel 可见且能进 local/shipping。  
4. 存在 `app/tests/render/ryuHeadbandPhysics.test.ts` 且 `npm test` 通过。  
5. 未引入整片布料主路径；未改 combat hitstop 规则。  

任一不满足 → **未完成**，不得声称「头巾物理已做成」。

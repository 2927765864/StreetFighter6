# AI 可执行方案：隆腰带物理（Obi 垂尾）v0

> **文档类型**：给 **AI / 人类执行者** 的实现规范（非共识原文）  
> **节点**：2026-08-24  
> **对齐共识（必须全文服从）**：`docs/belt-physics-consensus-v0.md`  
> **对齐参照共识**：`docs/headband-physics-consensus-v0.md`（同路径二次运动；腰带独立参数、更硬更短、无呼吸感）  
> **对齐头巾执行方案（代码模板，必须镜像结构）**：`docs/plans/ai-execution-plan-headband-physics-v0.md`  
> **对齐调查（选型依据，非共识）**：`docs/research/headband-physics-research-2026-08-24.md`  
> **元共识**：`docs/consensus-v0.md` §0 写进即全做  
> **技术栈（以仓库为准）**：已安装 `@pixiv/three-vrm-springbone`、`three@^0.185.1`、Vite、Vitest、`MutableSimConfig` + `ControlPanel` / `DebugGui` + `persist.ts` / `shipping.json`  
> **本方案补充检索**：Decentraland Spring Bones「Belt / hanging ornament」参数表与 `Avatar_Hips` center；VRMC_springBone；UniVRM HumanoidCollider 腿胶囊半径；three.js Discourse mixer 后写骨；UniVRM center 层级陷阱；裙子/下身 spring 穿模讨论（见 §1 / §11）

---

## 0. 执行者硬性规则（违反即停）

1. **禁止自我发挥架构**：不得改用整片网格布料；不得引入 MagicaCloth / PhysBones / DynamicBone 运行时；不得为「通用布料中台」搭抽象层。  
2. **算法权威固定**：必须使用 **VRMC_springBone 1.0 Verlet 弹簧骨**，以已依赖的 **`@pixiv/three-vrm-springbone`** 为唯一实现（与头巾相同）。禁止自造欧拉积分、禁止无约束噪声假物理。  
3. **复用头巾代码路径**：镜像 `app/src/render/headband/` 的模块拆分与 `FighterView` 挂接顺序；腰带独立模块与独立 cfg 字段。**禁止**把头巾与腰带硬编码成同一组数值。  
4. **`combat/` 禁止 `import 'three'`**；腰带模拟只允许在 `app/src/render/`（及测试）。  
5. **只做隆**：骨名写死为下文 `L_Obi_*` / `R_Obi_*` / `C_ObiRoot_*` / 髋大腿碰撞骨；不得扩展其他角色 API。  
6. **环腰固定 / 只动带尾**：`C_ObiRoot_00_00` **不得**加入 spring joint；只对左右 `*_Obi_00_*` 链建 joint。  
7. **受击定住 / 硬直豁免**：腰带 `update(deltaSec)` **不得**因 `match.hitstopTimer > 0` 或 `fighter.phase === 'hitstun'` 而跳过；`deltaSec` 取 **墙钟**（与头巾相同来源）。  
8. **不做静止呼吸感**：不得实现/公开 `beltBreathAmp` / `beltBreathHz`；不得把头巾 breath 逻辑复制进腰带默认路径。  
9. **每步必须有验收**；缺依赖写 `BLOCKED:` 停工，不得用猜测骨名继续。  
10. **配置字段名以本方案 §7 为准**；禁止另起同义字段而不接面板/持久化。

---

## 1. 权威依据总表（每步只能引用这些，禁止「我觉得」）

### 1.1 项目内

| ID | 路径 / 内容 | 用途 |
|----|-------------|------|
| **C-BELT** | `docs/belt-physics-consensus-v0.md` | 观感、豁免、防大腿/髋、独立参数、无呼吸、只做隆 |
| **C-HB** | `docs/headband-physics-consensus-v0.md` | 同路径语义参照 |
| **P-HB** | `docs/plans/ai-execution-plan-headband-physics-v0.md` | 步骤/文件/挂接/陷阱对策模板 |
| **R-HB** | `docs/research/headband-physics-research-2026-08-24.md` | 选型背景 |
| **APP-HB** | `app/src/render/headband/RyuHeadbandPhysics.ts` 等 | **必须镜像**的实现 |
| **APP-VIEW** | `app/src/render/FighterView.ts` | `afterAnimPose` → mixer 后二次运动；已有 `updateHeadbandPhysics` |
| **APP-MAIN** | `app/src/main.ts` | rAF 墙钟 `wallDt` |
| **APP-MATCH** | `app/src/combat/match/MatchSim.ts` | hitstop 提前 return → 身体定住 |
| **APP-CONST** | `app/src/config/constants.ts` | 新字段 + defaults |
| **APP-STORE** | `app/src/config/store.ts` `mergeConfig` | 标量自动 merge |
| **APP-PANEL** | `app/src/debug/ControlPanel.ts` | 主调试面板 |
| **APP-GUI** | `app/src/debug/DebugGui.ts` | lil-gui 同步 |
| **ASSET-GLB** | `app/public/models/ryu/ryu_c1_textured.glb`（及同骨架） | Obi 骨链实测见 §2 |
| **PKG-THREE** | `app/package.json` → `three` / `@pixiv/three-vrm-springbone` | **已安装，勿重复选型** |

### 1.2 规范 / 开源实现（算法与 API）

| ID | 来源 | 本方案采用的语义 |
|----|------|------------------|
| **SPEC-SB** | [VRMC_springBone 1.0](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_springBone-1.0/README.md) | Verlet 惯性/刚度/重力/定长/球碰撞；可选 center |
| **PKG-SB** | [`@pixiv/three-vrm-springbone`](https://github.com/pixiv/three-vrm/tree/dev/packages/three-vrm-springbone) | `VRMSpringBoneManager` / `VRMSpringBoneJoint` / `VRMSpringBoneCollider` / `VRMSpringBoneColliderShapeSphere` / Helpers |
| **PKG-SB-EX** | [springbone examples](https://pixiv.github.io/three-vrm/packages/three-vrm-springbone/examples) | 手工建链 + collider |
| **DOC-CENTER** | [UniVRM secondary · Prevents shaking](https://vrm.dev/en/univrm/springbone/univrm_secondary/) | center 减走过抖 |
| **REF-BELT-PARAM** | [Decentraland Spring Bones · Belt / hanging ornament](https://docs.decentraland.org/creator/wearables-and-emotes/wearables/spring-bones) | 腰带推荐：stiffness **1.5–2.5**、drag **0.5–0.7**、gravity 0.3–0.8、center **`Avatar_Hips`**、Higher drag for heavier items |
| **REF-LEG-COLLIDER** | [UniVRM `HumanoidCollider.cs` 腿胶囊](https://github.com/vrm-c/UniVRM/blob/aba3114c9d97d4a7656e039dc740af2073a7ee2e/Assets/VRM10_Samples/ClothSample/ClothViewer/HumanoidCollider.cs) | UpperLeg 半径约 **0.06**（米级参考）；本方案用 **Sphere** 绑 `L_Thigh`/`R_Thigh`/`C_Hip`，半径可调，默认同量级略放大以适配蒙皮腰带 |
| **REF-CHAIN** | [samlletas/verlet-chain-system](https://github.com/samlletas/verlet-chain-system) | 跳跃时降低重力 |
| **REF-HITSTOP** | Unity Discussions hitstop · hair still bounces；Shane Sicienski Capcom hitstop | 主时间停、附属继续 |

### 1.3 陷阱与社区（必须按 §11 处理）

| ID | 来源 | 结论 |
|----|------|------|
| **TRAP-MIXER** | [Discourse: overriding bone after mixer flickers](https://discourse.threejs.org/t/overriding-an-animation-by-modifying-a-bone-causes-flickering/69909) | **每帧在 mixer/scrub 之后**再写 Obi 骨 |
| **TRAP-ANIM-OBI** | 本仓实测攻击 glb（`ATK_5LP`/`5MK`）含 **全部** `C_ObiRoot` + `L/R_Obi_*` 通道 | 与头巾相同：enabled 时必须覆盖尾链；`C_ObiRoot` 留给动画（环腰固定） |
| **TRAP-DT** | N.E.K.O / three-vrm springbone 调试笔记 | `delta` 为秒；clamp 防 tab 爆炸 |
| **TRAP-CENTER** | SPEC-SB；[UniVRM #2053 center 层级](https://github.com/vrm-c/UniVRM/issues/2053) | 腰带 center = **`C_Hip`**（REF-BELT-PARAM）；center **不得**是 spring 链内节点 |
| **TRAP-COLLIDER** | Tessl 笔记；裙摆穿模常见讨论 [three-vrm #1464](https://github.com/pixiv/three-vrm/discussions/1464) | 髋/大腿球过大 → 带尾外翻；默认偏小 + 面板；第一版不做 extended inside collider |
| **TRAP-HITRADIUS** | [VRM4U #316 hitRadius 与末端](https://github.com/ruyo/VRM4U/issues/316) | 调 `hitRadius` 与大腿球配合；过大像裙摆悬空 |
| **TRAP-HELPER-PARENT** | 头巾实现注释（helpers 必须挂 scene） | 腰带 helpers 同样 `helperParent = scene`，禁止挂在 fighter 下 |
| **TRAP-BRANCH** | SPEC-SB / Decentraland：链必须线性 | `C_ObiRoot` 有双子女 → **禁止**把 root 当 spring head；分左右两条线性链 |

---

## 2. 资产事实（2026-08-24 实测 `ryu_c1_textured.glb`，禁止改名猜）

| 项 | 事实 |
|----|------|
| 腰带网格 | `Group_3_Sub_0__esf_Obi`；结饰 `Group_3_Sub_2__esf_ObiSign` |
| 环腰根（**固定，不进 spring**） | `C_ObiRoot_00_00`，父骨 = **`C_Hip`** |
| 左垂尾（根→梢） | `L_Obi_00_00` → `_01` → `_02` → `_03` → `_04` → `L_Obi_00_end`（**6 节点 / 5 joints**） |
| 右垂尾 | `R_Obi_00_00` → `_01` → `_02` → `_03` → `R_Obi_00_end`（**5 节点 / 4 joints**） |
| 链父 | `L_Obi_00_00` / `R_Obi_00_00` 的父均为 `C_ObiRoot_00_00` |
| 动画是否驱动 Obi | **是**（攻击片含完整 Obi 通道）→ **TRAP-MIXER + TRAP-ANIM-OBI** |
| 碰撞挂点（glb 存在） | `C_Hip`、`L_Thigh`、`R_Thigh`（可选辅助：`L_Hip`/`R_Hip` 若要用必须先 `getObjectByName` 成功） |

**可动区语义（对齐共识）**

- 环腰：依赖 `C_ObiRoot_00_00` **保持动画轨**（不建 joint）→ 主体不二次变形。  
- 带尾：仅左右 Obi 链建 `VRMSpringBoneJoint`，mixer 后覆盖。

---

## 3. 目标行为（验收语义）

| 项 | 要求 |
|----|------|
| 造型 | 不改网格长度；用现有左右链 |
| 跟手 | 移动/跳跃/攻击均有可见甩尾（**不规定**优先级） |
| 默认手感 | **比头巾更硬更短**：更高 stiffness、更高 drag、偏低 gravity（§7） |
| 呼吸感 | **不做** |
| 防穿 | 主要大腿/髋球；少钻腿 |
| 定住/硬直豁免 | 同头巾：墙钟更新 |
| 存档 | §7 字段进 ControlPanel + local/shipping |
| 开关 | `beltPhysicsEnabled`；关则不写尾骨（动画原轨） |
| 独立性 | 调腰带不影响头巾默认；两边可分别开关 |

---

## 4. 固定架构（禁止另起炉灶）

```
rAF (main.ts)
  MatchSim.step（hitstop 可能冻逻辑姿态）
  FighterView.syncFromLogic(..., wallDt)
      … AnimationMixer / scrub …
      afterAnimPose:
        1) maybePlantAfterPose
        2) updateHeadbandPhysics   // 已有
        3) updateBeltPhysics       // 【新增】同序：mixer 与脚掌之后
        4) modelRoot.updateMatrixWorld(true)
  render
```

**模块落点（文件名固定）**

| 文件 | 职责 |
|------|------|
| `app/src/render/belt/ryuBeltBoneNames.ts` | Obi 链名、碰撞骨名常量（唯一骨名来源） |
| `app/src/render/belt/beltPhysicsMath.ts` | 纯函数：可 **re-export/委托** `headbandPhysicsMath` 的 `clampHeadbandDeltaSec`、`headbandGravityScaleForJumpPhase`、`headbandStiffnessAtJoint`（公式禁止改）；可另加腰带专用别名包装 |
| `app/src/render/belt/RyuBeltPhysics.ts` | 镜像 `RyuHeadbandPhysics`：bind / update / dispose / helpers；**无 breath**；center=`C_Hip`；碰撞=髋+大腿 |
| `app/src/render/FighterView.ts` | 持有 `RyuBeltPhysics \| null`；`installModel` bind；`afterAnimPose` 调 `updateBeltPhysics` |
| `app/src/config/constants.ts` | §7 字段 |
| `app/src/debug/ControlPanel.ts` | 「腰带物理」分区 |
| `app/src/debug/DebugGui.ts` | 同名字段 |
| `app/tests/render/ryuBeltPhysics.test.ts` | 骨名长度、defaults、bind/update、enabled 门闩、无 hitstop 门控 |

**依赖**：使用现有 `@pixiv/three-vrm-springbone`，**禁止**再装整包 `@pixiv/three-vrm`。

---

## 5. 具体实现步骤（按序执行）

### Step 0 — 资产门禁

1. 加载与 `FighterView` 同源 glb。  
2. 断言存在：`C_Hip`、`C_ObiRoot_00_00`、§2 左右整链、`L_Thigh`、`R_Thigh`。  
3. 缺任一：`BLOCKED: missing Obi/belt bones` 停工（不得用 `Mantle_*` / `Pants_*` 冒充）。

**验收**：左链 6 节点、右链 5 节点；`C_ObiRoot` 不在 spring 名表。

---

### Step 1 — 引用 springbone API（与头巾相同 import）

```ts
import {
  VRMSpringBoneManager,
  VRMSpringBoneJoint,
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeSphere,
  VRMSpringBoneColliderHelper,
  VRMSpringBoneJointHelper,
  type VRMSpringBoneColliderGroup,
} from '@pixiv/three-vrm-springbone';
```

对照 **PKG-SB-EX** + **APP-HB**：对每对 `(bones[i], bones[i+1])` 建 joint，`manager.addJoint`，每帧 `manager.update(delta)`。

**验收**：合成骨架双链 + 重力，尾部下垂；dispose 无残留。

---

### Step 2 — `RyuBeltPhysics.bind(modelRoot, { helperParent: scene })`

1. `getObjectByName` 解析 §2 链。  
2. **禁止**对 `C_ObiRoot_00_00` 建 joint。  
3. 左链 joints：`L_Obi_00_00`…`L_Obi_00_04`（end 作最后 child）。  
4. 右链：`R_Obi_00_00`…`R_Obi_00_03`。  
5. `center`：`cfg.beltUseCenter === true` 时 `center = C_Hip`（**REF-BELT-PARAM / TRAP-CENTER**）；否则 null。  
6. `manager.setInitState()` 在 bind 姿态后调用一次。  
7. helpers 挂到 **scene**（TRAP-HELPER-PARENT）。

**验收**：`enabled` 时 idle/移动尾相对纯动画有额外下垂/甩；`enabled=false` 与动画一致；环腰结饰不出现弹簧乱扭（`C_ObiRoot` 仍跟动画）。

---

### Step 3 — 碰撞体（大腿/髋，不管场景）

创建 collider group，**ShapeSphere**（与头巾一致；第一版不用 capsule / extended inside）：

| colliderId | 附着骨 | 默认半径字段 | 默认（m） | 依据 |
|------------|--------|--------------|-----------|------|
| hip | `C_Hip` | `beltColliderHipRadius` | `0.10` | 共识髋；略大于 REF-LEG 0.06 因腰带蒙皮体积 |
| lThigh | `L_Thigh` | `beltColliderThighRadius` | `0.085` | REF-LEG + 可调 |
| rThigh | `R_Thigh` | 同上 | `0.085` | 对称 |

- 局部偏移：`beltColliderHipYOffset`（默认 `0`）、`beltColliderThighYOffset`（默认 `0.05`，沿大腿局部 Y，面板可拧）。  
- 左右大腿共用同一半径字段；若需前后微调：`beltColliderThighZOffset`（默认 `0`）。  
- **不做**地面/舞台碰撞。  
- 半径过大外翻：按 TRAP-COLLIDER **减小**，禁止只加 stiffness 硬扛。

**验收**：`beltShowColliders=true` 可见球；踢腿/下蹲时带尾不长期埋进大腿网格。

---

### Step 4 — 挂到 `FighterView`（TRAP-MIXER + 豁免）

在 `installModel`：`new RyuBeltPhysics().bind(model, { helperParent: this.scene })`。  
在 `afterAnimPose` 于 `updateHeadbandPhysics` **之后**调用：

```ts
private updateBeltPhysics(fighter, cfg, wallDtSec): void {
  if (!this.belt?.isBound) return;
  const deltaSec = clampHeadbandDeltaSec( // 或 belt 别名，公式同 P-HB
    wallDtSec,
    cfg.beltMaxDeltaSec,
    cfg.timeScaleAnim || 1,
  );
  this.belt.update({
    deltaSec,
    cfg,
    jumpPhase: fighter.jumpPhase,
  });
}
```

硬性：

1. **不**读 `hitstopTimer` / hitstun 来决定是否 update。  
2. `deltaSec` 为秒；`beltMaxDeltaSec` 默认 `0.05`。  
3. `belt.update` 内 `manager.update(deltaSec)`。  
4. dispose 模型时 `belt.dispose()`。

**手测豁免**：加大 hitstop 打中：身体定住期间腰带尾仍晃。

---

### Step 5 — 跳跃重力 Override（REF-CHAIN，同头巾）

`jumpPhase === 'air'` 时 `gravityPower *= beltGravityAirScale`（默认 `0.50`）；否则 `1.0`。

**验收**：起跳/落地有可见反馈；默认仍偏硬。

---

### Step 6 — 明确跳过呼吸感

- **不实现** breath wind。  
- `applyJointSettings` 仅重力 + airScale + stiffness/drag/hitRadius。  

**验收**：站立无专门微风项；面板无呼吸滑条。

---

### Step 7 — 配置、面板、持久化

见 §7。必须：

1. `MutableSimConfig` + `createDefaultSimConfig`  
2. `ControlPanel` 新 section `belt`（`expandedSections.belt` / `expandBelt`）  
3. `DebugGui` 同步  
4. 标量经 `mergeConfig` 进 local/shipping  

---

### Step 8 — 测试

| 测试 | 断言 |
|------|------|
| `ryuBeltPhysics.test.ts` | 左 6 / 右 5 节点；defaults 符合 §7；bind 成功；update 改尾骨四元数；`enabled=false` 不再改；clamp / air scale 委托数学函数 |
| `npm test` | 通过 |
| 手测 | 共识 §5 + 本方案 §10 |

---

## 6. 算法落点（对照 SPEC-SB，禁止改公式）

与头巾相同，包内实现：

1. Inertia（可 center 空间）：`(current-prev)*(1-dragForce)`  
2. Stiffness：`delta * parentRot * initialLocalRot * boneAxis * stiffness`  
3. External：`delta * gravityDir * gravityPower`（**无** breath）  
4. 定长 → 球碰撞 → 写回 Head 旋转  
5. 根→叶（Manager）

刚度梢乘子：复用 `headbandStiffnessAtJoint(base, index, count, tipScale)`。

---

## 7. 必须公开到调试面板的参数（字段名冻结）

全部进入 `MutableSimConfig`。默认服务共识「比头巾更硬更短」+ **REF-BELT-PARAM** 区间。

对照头巾现行默认（`headbandStiffness=1.35`, `drag=0.48`, `gravity=0.35`），腰带默认取：

| 字段 | 类型 | 默认 | 范围建议 | 面板标签 | 依据 |
|------|------|------|----------|----------|------|
| `beltPhysicsEnabled` | boolean | `true` | — | 启用腰带物理 | 共识可关 |
| `beltUseCenter` | boolean | `true` | — | 使用髋部 Center（减走过抖） | REF-BELT-PARAM / SPEC-SB |
| `beltStiffness` | number | `1.85` | 0–4 | 刚度（回弹/硬度） | REF-BELT 1.5–2.5；> 头巾 1.35 |
| `beltDragForce` | number | `0.62` | 0–1 | 阻尼 dragForce | REF-BELT 0.5–0.7；> 头巾 0.48 |
| `beltGravityPower` | number | `0.28` | 0–2 | 重力强度 | 偏低 → 摆幅更短；REF-BELT 0.3–0.8 下沿 |
| `beltGravityDirX/Y/Z` | number | `0,-1,0` | -1–1 | 重力方向 | SPEC-SB |
| `beltHitRadius` | number | `0.014` | 0–0.08 | 带节碰撞半径 | SPEC-SB；TRAP-HITRADIUS |
| `beltGravityAirScale` | number | `0.50` | 0–1.5 | 滞空重力乘数 | REF-CHAIN |
| `beltMaxDeltaSec` | number | `0.05` | 0.016–0.1 | 单帧 dt 上限（秒） | TRAP-DT |
| `beltColliderHipRadius` | number | `0.10` | 0–0.3 | 髋碰撞球半径 | 共识髋 |
| `beltColliderThighRadius` | number | `0.085` | 0–0.3 | 大腿碰撞球半径 | REF-LEG |
| `beltColliderHipYOffset` | number | `0` | -0.2–0.2 | 髋球局部 Y 偏移 | 调穿模 |
| `beltColliderThighYOffset` | number | `0.05` | -0.2–0.3 | 大腿球局部 Y 偏移 | 调穿模 |
| `beltColliderThighZOffset` | number | `0` | -0.2–0.2 | 大腿球局部 Z 偏移 | 前后微调 |
| `beltStiffnessTipScale` | number | `0.95` | 0.2–1.2 | 梢端刚度乘子 | 比头巾 0.85 更硬梢 → 更短手感 |
| `beltShowColliders` | boolean | `false` | — | 显示碰撞球 Helper | 调试 |
| `beltShowChainHelpers` | boolean | `false` | — | 显示链骨 Helper | 调试 |

**禁止加入面板（共识不做）**：`beltBreathAmp`、`beltBreathHz`。

每帧从 cfg 复制到 `joint.settings`。`UseCenter` 变化时 `applyCenter` + `setInitState`（镜像头巾）。

---

## 8. 明确不做

| 不做 | 原因 |
|------|------|
| 加长/重做 Obi mesh | 共识 |
| `C_ObiRoot` 进 spring | 共识环腰固定；TRAP-BRANCH |
| 呼吸微风 | 共识 |
| 移动/跳跃优先于攻击的特殊加权 | 共识 |
| 场景地墙碰撞 | 共识 |
| 头肩碰撞作为本版主目标 | 共识大腿/髋 |
| 整片布料 / 新物理引擎 | 共识 + P-HB |
| 与头巾共用同一组 cfg 数值 | 共识 |
| `VRMC_springBone_extended_collider` inside 球 | 可选后补；本版 Sphere 足够先验收 |
| 改 MatchSim hitstop | 只需渲染侧解耦 |

---

## 9. 与 hitstop / 硬直

| 现象 | 腰带侧 |
|------|--------|
| hitstop 身体定住 | 仍用 `wallDt` → `belt.update` |
| hitstun 播受击 | 同样每帧物理 |
| 关 `beltPhysicsEnabled` | 不写骨，Obi 动画轨可见 |

依据：REF-HITSTOP、APP-MATCH、P-HB §9。

---

## 10. 手测脚本（执行者打勾）

1. 启用腰带物理，站立：尾可有重力静平衡；**无**专门呼吸项。  
2. 前跑急停：带尾可见甩回。  
3. 跳跃起落：可见反馈。  
4. 5LP/脚：出招收招有跟随。  
5. 大 hitstop 打中：定住期尾仍动。  
6. 受击硬直全程：尾仍动。  
7. 踢腿/下蹲：少钻大腿；必要时降 collider。  
8. 关 `beltPhysicsEnabled`：回动画轨；头巾开关互不影响。  
9. 改刚度/阻尼 → 保存本地默认 → 刷新仍在。  
10. 导出 shipping 含 `belt*` 字段。  
11. `beltShowColliders` / `beltShowChainHelpers` 开关正常，无 facing 双重旋转错位。

---

## 11. 坑与方案内对策（检索补充）

| 坑 | 检索来源 | 本方案对策 |
|----|----------|------------|
| mixer 后写骨闪烁 | TRAP-MIXER | `afterAnimPose` 内、mixer 之后 update |
| Obi 全通道动画每帧写回 | TRAP-ANIM-OBI | enabled 覆盖尾链；root 留给动画 |
| 把 `C_ObiRoot` 当 spring 致分支未定义 | TRAP-BRANCH / SPEC-SB | 只绑 L/R 线性链 |
| 走过抖 | REF-BELT-PARAM center=Hips | 默认 `beltUseCenter=true`，center=`C_Hip` |
| center 挂错层级致暴走 | UniVRM #2053 | center 必须是 `C_Hip`（基骨架），不在 Obi 链内 |
| 大腿球过大外翻 | TRAP-COLLIDER | 默认 0.085 + 面板 |
| hitRadius 过大像裙摆悬空 | VRM4U #316 | 默认 0.014，可拧 |
| dt 爆炸 | TRAP-DT | `beltMaxDeltaSec` |
| helper 挂 fighter 错位 | APP-HB 注释 | `helperParent=scene` |
| 误做呼吸 | 共识不做 | 无 breath 代码/字段 |
| 与头巾抢同一 manager | — | **独立** `VRMSpringBoneManager` 实例 |

---

## 12. 相关文件

| 文件 | 关系 |
|------|------|
| `docs/belt-physics-consensus-v0.md` | 上位共识 |
| `docs/plans/ai-execution-plan-headband-physics-v0.md` | 镜像模板 |
| `docs/research/headband-physics-research-2026-08-24.md` | 调研 |
| 本文件 | AI 执行规范 |

---

## 13. 完成定义（Definition of Done）

同时满足：

1. 共识 §5 与本方案 §10 手测可勾。  
2. 代码路径符合 §4–§6；依赖为现有 `@pixiv/three-vrm-springbone`。  
3. §7 全部字段在 ControlPanel + DebugGui 可见且能进 local/shipping。  
4. 存在 `app/tests/render/ryuBeltPhysics.test.ts` 且 `npm test` 相关用例通过。  
5. 未引入整片布料；未改 combat hitstop；无腰带呼吸参数；`C_ObiRoot` 不在 spring。  
6. 头巾与腰带参数相互独立可开关。  

任一不满足 → **未完成**，不得声称「腰带物理已做成」。

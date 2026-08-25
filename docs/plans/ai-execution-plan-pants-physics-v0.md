# AI 可执行方案：隆道服裤物理（骨布 + 横连 + 腿胶囊）v0（未完成 · 已抛弃）

> **状态**：**未完成 · 已抛弃**（2026-08-25）  
> **原因**：用户决定不再继续完成裤子物理子系统；上位共识 `docs/pants-physics-consensus-v0.md` 已抛弃。  
> **效力**：本方案**失效**，不得再按本文推进实现或验收；保留作历史记录。  
> **同批抛弃**：`docs/plans/ai-execution-plan-pants-health-report-v0.md`、`docs/research/pants-physics-research-2026-08-24.md`、`docs/reports/pants/`  
> **历史说明（废止前）**：曾为 AI/人类执行规范；对齐共识与调研；节点 2026-08-24。技术栈与 SPCR 选型说明见下方正文（不再执行）。

---

## 0. 执行者硬性规则（违反即停）（历史 · 已抛弃）

1. **禁止自我发挥架构**：不得用「只给每条裤骨挂 VRMSpringBone 单链」冒充完成；不得引入 MagicaCloth / PhysBones / DynamicBone / Unity 运行时；不得把 `three-simplecloth`（WebGPU）或整包 `@pixiv/three-vrm` 作为裤子运行依赖；不得搭「通用衣物中台」。  
2. **算法权威固定**：必须实现 **SPCRJointDynamics 文档与源码中的骨布交叉约束模型**（mass-spring-damper + Structural/Shear/Bending 约束 + 球/胶囊推出碰撞），以 **MIT 仓库 `SPARK-inc/SPCRJointDynamics`** 为唯一算法母本（见 **PKG-SPCR**）。积分与约束松弛语义对齐 **Jakobsen *Advanced Character Physics***（**REF-JAKOBSEN**）与 SPCR Job 中的 `Position_Previous` / `Resistance` / `Hardness` / 约束长度投影。  
3. **与头巾/腰带独立**：新目录 `app/src/render/pants/`；**禁止** `import` 头巾/腰带的 springbone manager 来驱动裤子；可 **只复用** 与物理无关的工程习惯（`wallDt`、`ControlPanel` 分区、`clamp*MaxDeltaSec` 公式可抄数值，但函数放在 `pantsPhysicsMath.ts`）。  
4. **`combat/` 禁止 `import 'three'`**；裤子模拟只允许在 `app/src/render/`（及测试）。  
5. **只做隆**：骨名写死为 §2；不得扩展其他角色 API。  
6. **腰/裆固定**：`Pants_Weist_*` 与 `C_Pants_*` **不得**进入自由粒子（`isFixed=true` 或根本不进求解器）；只对 §2「可动链」求解。  
7. **受击定住 / 硬直豁免**：裤子 `update(deltaSec)` **不得**因 `match.hitstopTimer > 0` 或 `fighter.phase === 'hitstun'` 而跳过；`deltaSec` 取 **墙钟**（与 `FighterView.syncFromLogic` 的 `wallDtSec` 同源）。  
8. **必须有横向结构约束**：`Structural Horizontal`（及默认开启的 Shear / Bending）按 §5 邻接表生成；禁止只有纵向父子链。依据 **TRAP-NOLATERAL**。  
9. **每步必须有验收**；缺骨写 `BLOCKED:` 停工，不得猜骨名。  
10. **配置字段名以本方案 §7 为准**；禁止另起同义字段而不接面板/持久化。  
11. **许可证**：移植 SPCR 算法的每个 TS 文件顶部必须保留 MIT 版权声明（见 PKG-SPCR `LICENSE`）；不得删除作者信息。

---

## 1. 权威依据总表（每步只能引用这些，禁止「我觉得」）

### 1.1 项目内

| ID | 路径 / 内容 | 用途 |
|----|-------------|------|
| **C-PANTS** | `docs/pants-physics-consensus-v0.md` | 观感三项一次做全、腰固定、几乎不穿腿、少穿腰带、定住+硬直豁免、偏软下垂、呼吸感、独立设计、可调可存 |
| **R-PANTS** | `docs/research/pants-physics-research-2026-08-24.md` | 选型：骨布+横连；非头巾弹簧链 |
| **APP-VIEW** | `app/src/render/FighterView.ts` | `afterAnimPose`：已有 `updateHeadbandPhysics` → `updateBeltPhysics`；裤子接在其后 |
| **APP-MAIN** | `app/src/main.ts` | rAF 墙钟 `wallDt` |
| **APP-MATCH** | `app/src/combat/match/MatchSim.ts` | hitstop 提前 return → 身体定住 |
| **APP-CONST** | `app/src/config/constants.ts` | 新字段 + defaults |
| **APP-STORE** | `app/src/config/store.ts` `mergeConfig` | 标量自动 merge |
| **APP-PANEL** | `app/src/debug/ControlPanel.ts` | 主调试面板 |
| **APP-GUI** | `app/src/debug/DebugGui.ts` | lil-gui 同步 |
| **APP-HB** / **APP-BELT** | `app/src/render/headband/*`、`belt/*` | **仅对照**挂接顺序与面板习惯；**禁止**复用其求解器完成裤子 |
| **ASSET-GLB** | `private/runtime/ryu/ryu_c1_textured.glb` / `app/public/models/ryu/ryu_c1_textured.glb` | §2 骨名实测 |
| **PKG-THREE** | `app/package.json` → `three` | Three 版本 |

### 1.2 算法母本 / 开源（必须按此实现）

| ID | 来源 | 本方案采用的语义 |
|----|------|------------------|
| **PKG-SPCR** | [SPARK-inc/SPCRJointDynamics](https://github.com/SPARK-inc/SPCRJointDynamics) · MIT · 锚定提交 **`7ebe63eb48e7737f3c443511ad2dc2caf1bf96b9`** | 骨布引擎；裙摆开发动机；约束种类定义见 README |
| **PKG-SPCR-CTRL** | `unity/Packages/SPCRJointDynamics/Runtime/SPCRJointDynamicsController.cs` | 约束表生成、`_IsFixed`（depth==0）、`_Gravity`/`_WindForce`、`_ResistanceCurve`/`_HardnessCurve`、Structural/Shear/Bending shrink·stretch 标量、`_SubSteps`、`_BlendRatio` |
| **PKG-SPCR-JOB** | `…/SPCRJointDynamicsJob.cs` | 粒子步进：`Position_Previous`、位移×`Resistance`、向动画位姿的 `Hardness` 恢复、约束投影、**`Collision.PushoutFromCapsule` / `PushoutFromSphere` / `PushInFromCapsule`**（约 L1671–1767）、写回 `localRotation`（Aim `BoneAxis`，约 L2095–2102） |
| **PKG-SPCR-COL** | `…/SPCRJointDynamicsCollider.cs` | `Height>0` ⇒ 胶囊；`Height==0` ⇒ 球；`Radius` / `RadiusTailScale` / `Friction` |
| **PKG-SPCR-PT** | `…/SPCRJointDynamicsPoint.cs` | `_IsFixed`、`_Mass`、`_PointRadius`、`_BoneAxis` |
| **PKG-SPCR-WIND** | `unity/Assets/SPCRJointDynamics_Example/Scripts/RandomWind.cs` | 多频 `sin` 合成风 → `_WindForce`（呼吸微晃母本） |
| **PKG-SPCR-UE** | [SPCRJointDynamicsUE4 README](https://github.com/SPARK-inc/SPCRJointDynamicsUE4) | 环形裙需首尾横连；约束帮助减少腿穿出；腿上加 collider |
| **REF-ADB** | [OneYoungMean/Automatic-DynamicBone](https://github.com/OneYoungMean/Automatic-DynamicBone) | 明确基于 SPCR；裙/发自动骨——对照「裙关键词=横连骨布」，**不**引入其 Unity 包 |
| **REF-JAKOBSEN** | [Jakobsen · Advanced Character Physics](https://www.cs.unc.edu/~lin/COMP259/PAPERS/verlet.doc) | Verlet + 约束松弛迭代 + 碰撞投影；本方案约束迭代次数的理论依据 |
| **REF-VERLET-CLOTH** | [Pikuma · Verlet cloth](https://pikuma.com/blog/verlet-integration-2d-cloth-physics-simulation) | 约束：积分后投影回静止长度；需多轮迭代 |
| **REF-MAGICA-SKIRT** | [Magica Soft · Skirt by BoneCloth](https://magicasoft.jp/en/boneclothskirtguide2/) | **处方对照（不引入 Magica）**：Mesh Automatic 横连、双腿胶囊、Penetration、腰 Influence、软垂降刚度/重力升 Drag |
| **REF-MAGICA-PEN** | [Magica Soft · Preventing penetration](https://magicasoft.jp/en/prevent-penetration-2/) | 高速动作腿穿布：Collider Penetration；本方案用 SPCR `PushIn`/`Pushout` + 略大胶囊半径实现同等产品意图 |
| **REF-MAGICA-COL** | [Magica Soft · Collision setup](https://magicasoft.jp/en/mc2_collision_setup/) | 裙：腿胶囊 + 腰碰撞 |
| **REF-SIMPLECLOTH** | [bandinopla/three-simplecloth](https://github.com/bandinopla/three-simplecloth) | **仅概念**：腰区「粘住」、独立衣物网格、`update(delta)` 解耦；**禁止**作运行依赖（WebGPU） |
| **REF-HITSTOP** | [Unity Discussions · hitstop · hair still bounces](https://discussions.unity.com/t/hello-i-am-looking-to-recreate-a-hit-stop-effect-similar-to-how-you-see-in-fighting-games/910407) | 停 Animator；附属物理继续 |
| **REF-HITSTOP-CAPCOM** | [Shane Sicienski · Capcom hitstop](https://shane-sicienski.com/blog/blog-post-title-one-55pmn) | 只停参与打击的角色，其他可继续 |
| **REF-LEG-CLIP-BLOG** | [Bugnet · cloth clipping body](https://bugnet.io/blog/how-to-fix-cloth-clipping-through-the-character-body)（2026-06） | 显式球/胶囊、半径略大、提高迭代 |
| **REF-DOA2** | [X · DOA2 cloth physics 访谈摘录](https://x.com/oirandrive/status/1996761632320458965) | 格斗衣物要物理但需限制乱扭；裙腿穿模是硬问题 |

### 1.3 陷阱与社区（必须按 §11 处理）

| ID | 来源 | 结论 |
|----|------|------|
| **TRAP-MIXER** | [Discourse: overriding bone after mixer flickers](https://discourse.threejs.org/t/overriding-an-animation-by-modifying-a-bone-causes-flickering/69909) · [three.js #25518](https://github.com/mrdoob/three.js/issues/25518) | **每帧在 AnimationMixer/scrub 之后**再写裤骨；必要时 `updateMatrixWorld` |
| **TRAP-ANIM-PANTS** | 本仓实测 `ATK_5LP` 等 glb：**约 98** 条 Pants/Obi 相关轨道 | 动画会驱动全部裤骨 → 必须 mixer 后覆盖可动链；固定链留给动画 |
| **TRAP-NOLATERAL** | Magica 论坛/文档：BoneCloth 默认只有父子纵连；裙必须 Mesh 横连否则腿从骨缝钻出；[@chaorzzz 2026-03](https://x.com/chaorzzz/status/2038710234978381827)；note 文「Line→Automatic Mesh」 | **无横连 = 方案失败** |
| **TRAP-PHYSBONE-SKIRT** | [r/VRchat · skirts clip thighs](https://www.reddit.com/r/VRchat/comments/1m0czo9/good_physics_for_skirts_so_they_dont_clip_through/) | 仅靠单链+弱碰撞，坐下/蹲穿腿；需合理碰撞与铰链感 |
| **TRAP-DT** | 头巾/腰带方案 TRAP-DT；Verlet 大 dt 爆炸 | `delta` 为秒；`pantsMaxDeltaSec` clamp（默认 0.05） |
| **TRAP-COLLIDER-SIZE** | Magica 调参；Tessl/裙穿模常识；REF-LEG-CLIP-BLOG | 过大 → 裤管悬空外翻；过小 → 穿腿；默认略大于肉身 + **必须上面板** |
| **TRAP-WRAP** | REF-MAGICA-PEN | 粒子绕到胶囊背面；用推出 +（可选）PushIn/侧向记忆；高速踢腿多 **substeps/iterations** |
| **TRAP-WAIST-SIM** | C-PANTS 腰固定；Magica 固定粒子涂腰 | 把 `Pants_Weist_*` / `C_Pants_*` 当自由粒子 → 腰扭垮、穿腰带 |
| **TRAP-OBI-CROSS** | C-PANTS 少穿腰带；APP-BELT 已模拟 Obi 尾 | 裤子求解 **不得**写 `L_Obi_*`/`R_Obi_*`/`C_ObiRoot_*`；另加腰带区碰撞球 |
| **TRAP-GLOBAL-TIMESCALE** | [@HappyEndStudio HitStop TimeDilation](https://x.com/HappyEndStudio/status/2076282877541765617) | 禁止用全局 `timeScale=0` 实现 hitstop 来「顺便」冻裤子 |
| **TRAP-HELPER-PARENT** | 头巾/腰带实现注释 | debug helpers 挂 **scene**，禁止挂 fighter 子树导致双重变换 |

---

## 2. 资产事实（2026-08-24 实测，禁止改名猜）

| 项 | 事实 |
|----|------|
| 裤子网格 | `Group_3_Sub_1__esf_DougiPants`（独立蒙皮网格） |
| 腰带网格（禁写） | `Group_3_Sub_0__esf_Obi`、`Group_3_Sub_2__esf_ObiSign` |
| 动画是否驱动裤骨 | **是**（攻击片含大量 `Pants_*` / `Weist` / `PantsA/B/C` 通道）→ **TRAP-MIXER + TRAP-ANIM-PANTS** |

### 2.1 固定集（不进自由求解 / `isFixed=true`，保持动画）

| 组 | 骨名 |
|----|------|
| 腰围链整组 | 所有 `Pants_Weist_*`（含 `Front/Back/Side/L/R` 及 `*A*`/`*B*` 与 `_00/_01/_end`） |
| 裆/中缝 HJ | `C_Pants_LFront_HJ_00`、`C_Pants_RFront_HJ_00`、`C_Pants_LUnder_HJ_00`、`C_Pants_RUnder_HJ_00`、`C_Pants_LUnder_HJ_01`、`C_Pants_RUnder_HJ_01` |
| 辅助父（不单独当布粒子） | `L_PantsShin_HJ`、`R_PantsShin_HJ`（其子链可动；HJ 本身跟随腿动画） |

### 2.2 可动链（必须求解；根→梢）

每条链登记为 SPCR 意义下的一条 vertical chain；**链根（depth 0）`isFixed=true`**（钉在绑点世界位姿上，随大腿/小腿动画走），子级自由。

| chainId | 节点（根→梢） | 父附着（事实） |
|---------|----------------|----------------|
| `L_PantsA_00` | `L_PantsA_00_00` → `L_PantsA_00_end` | `L_Thigh` |
| `L_PantsA_01` | `L_PantsA_01_00` → `L_PantsA_02_end` | `L_Thigh`（glb 父子如此，**不得改名重排**） |
| `L_PantsA_02` | `L_PantsA_02_00` → `L_PantsA_01_end` | `L_Thigh` |
| `L_PantsThigh` | `L_PantsThigh_HJ_01` → `L_PantsThigh_HJ_02` | `L_Thigh` |
| `L_PantsB_00` | `L_PantsB_00_00` → `L_PantsB_00_end` | `L_Shin_2` |
| `L_PantsB_02` | `L_PantsB_02_00` → `L_PantsB_02_end` | `L_Calf_HJ_04` |
| `L_PantsC_00` | `L_PantsC_00_00` → `L_PantsC_00_end` | `L_PantsShin_HJ` |
| `L_PantsC_01` | `L_PantsC_01_00` → `L_PantsC_01_end` | `L_PantsShin_HJ` |
| `L_PantsC_02` | `L_PantsC_02_00` → `L_PantsC_02_end` | `L_PantsShin_HJ` |
| `R_*` | 与左对称：`R_PantsA_*` / `R_PantsThigh_*` / `R_PantsB_*` / `R_PantsC_*` | `R_Thigh` / `R_Shin_2` / `R_PantsShin_HJ` 等 |

> `L_PantsA_01` / `L_PantsA_02` 在 glb 中存在交叉命名的 end 节点；**执行时以 `getObjectByName` 实测父子为准**，常量文件必须写出上表完整名字，bind 时断言 `parent` 关系，失败则 `BLOCKED:`。

### 2.3 横向邻接表（Structural Horizontal / Shear 的环）

同一「环」内相邻 chain 在 **相同 depth 索引** 的粒子之间建水平约束；环内 **首尾相接**（对齐 PKG-SPCR-UE「round skirt loop」意图，用于单腿周向）。

| ringId | 有序 chainId 列表（闭环） |
|--------|---------------------------|
| `L_ThighRing` | `L_PantsA_00`, `L_PantsA_01`, `L_PantsA_02`, `L_PantsThigh` |
| `R_ThighRing` | `R_PantsA_00`, `R_PantsA_01`, `R_PantsA_02`, `R_PantsThigh` |
| `L_ShinRing` | `L_PantsB_00`, `L_PantsB_02`（仅 2 条：互连；若缺骨则跳过并日志） |
| `R_ShinRing` | `R_PantsB_00`, `R_PantsB_02` |
| `L_CuffRing` | `L_PantsC_00`, `L_PantsC_01`, `L_PantsC_02` |
| `R_CuffRing` | `R_PantsC_00`, `R_PantsC_01`, `R_PantsC_02` |

**禁止**在 L/R 大腿环之间建强制横连（会在分腿时拉垮）；左右分离由各自腿胶囊约束。

### 2.4 碰撞挂点（glb 必须存在）

| colliderId | 类型 | 附着 | 说明 |
|------------|------|------|------|
| `lThighCap` | 胶囊 | `L_Thigh` → `L_Knee` | 主防穿大腿 |
| `rThighCap` | 胶囊 | `R_Thigh` → `R_Knee` | 对称 |
| `lCalfCap` | 胶囊 | `L_Knee` → `L_Foot`（若缺 `L_Foot` 则用小腿末端骨，断言成功） | 防穿小腿/裤脚 |
| `rCalfCap` | 胶囊 | `R_Knee` → `R_Foot` | 对称 |
| `hipSphere` | 球 | `C_Hip` | 髋/裆附近 |
| `beltSphere` | 球 | `C_ObiRoot_00_00`（存在）或 `C_Hip` 回退 | **少穿腰带** |

---

## 3. 目标行为（验收语义）

| 项 | 要求 |
|----|------|
| 三项观感 | 裤脚晃动 + 大腿到小腿布感 + 宽松下垂 **同时可见** |
| 腰 | 固定集不二次扭腰 |
| 动作 | 走跑急停、跳跃、踢腿、蹲起均合格 |
| 手感默认 | **偏软下垂**（相对头巾/腰带更低 hardness、更高 gravity 影响、足够横连） |
| 呼吸 | 静止低频微风（PKG-SPCR-WIND） |
| 防穿腿 | 几乎看不到钻进大腿/小腿 |
| 防穿腰带 | 尽量少；beltSphere 可调 |
| 定住/硬直 | 墙钟继续更新 |
| 存档 | §7 进面板 + local/shipping |
| 开关 | `pantsPhysicsEnabled`；关则不写可动链（动画原轨） |

---

## 4. 固定架构（禁止另起炉灶）

```
rAF (main.ts)
  MatchSim.step（hitstop 可能冻逻辑姿态）
  FighterView.syncFromLogic(..., wallDt)
      … AnimationMixer / scrub …
      afterAnimPose:
        1) maybePlantAfterPose
        2) updateHeadbandPhysics
        3) updateBeltPhysics
        4) updatePantsPhysics   // 【新增】必须在 mixer 之后
        5) modelRoot.updateMatrixWorld(true)
  render
```

**模块落点（文件名冻结）**

| 文件 | 职责 | 算法来源 |
|------|------|----------|
| `app/src/render/pants/ryuPantsBoneNames.ts` | §2 固定集、可动链、横连环、碰撞骨名常量 | 本方案 §2 |
| `app/src/render/pants/spcr/PantsSpcrTypes.ts` | Point / Constraint / Collider 数据结构 | PKG-SPCR-JOB 字段子集 |
| `app/src/render/pants/spcr/pantsSpcrCollision.ts` | `pushoutFromSphere` / `pushoutFromCapsule` / `pushInFromCapsule` | **逐行移植** PKG-SPCR-JOB `Collision.*`（L1671–1767 语义） |
| `app/src/render/pants/spcr/pantsSpcrConstraints.ts` | 建 vertical/horizontal/shear/bending 约束表；长度取 bind 姿态静止长 | PKG-SPCR-CTRL 约束种类 + README |
| `app/src/render/pants/spcr/pantsSpcrSolver.ts` | 子步：惯性位移×resistance、hardness 拉回动画位姿、约束松弛迭代、碰撞、写回骨旋转 | PKG-SPCR-JOB 步进 + REF-JAKOBSEN |
| `app/src/render/pants/pantsPhysicsMath.ts` | `clampPantsDeltaSec`、跳跃重力缩放、呼吸风向量（移植 RandomWind 公式） | PKG-SPCR-WIND；TRAP-DT |
| `app/src/render/pants/RyuPantsPhysics.ts` | bind / update / dispose / helpers；读 cfg | 本方案 |
| `app/src/render/FighterView.ts` | 持有实例；`afterAnimPose` 调用 | APP-VIEW |
| `app/src/config/constants.ts` | §7 | — |
| `app/src/debug/ControlPanel.ts` | 「裤子物理」分区 | — |
| `app/src/debug/DebugGui.ts` | 同名字段 | — |
| `app/tests/render/ryuPantsPhysics.test.ts` | 见 Step 8 | — |
| `app/tests/render/pantsSpcrCollision.test.ts` | 胶囊推出单元测试（已知点应被推到半径外） | PKG-SPCR-JOB |

**禁止新增 npm 依赖** 来跑 Unity/WebGPU 布料。只使用现有 `three`。

**源码获取（执行者必须）**：克隆或浏览  
`https://github.com/SPARK-inc/SPCRJointDynamics/tree/7ebe63eb48e7737f3c443511ad2dc2caf1bf96b9`  
对照移植；**不要**把 C# Jobs/Burst 搬进浏览器，只移植 **标量数学与约束/碰撞语义**。

---

## 5. 具体实现步骤（按序执行）

### Step 0 — 资产门禁

1. 加载与 `FighterView` 同源 glb。  
2. 断言 §2.1 固定名、§2.2 每条可动链每个节点、`L_Thigh`/`R_Thigh`/`L_Knee`/`R_Knee`/`C_Hip`/`C_ObiRoot_00_00` 均可 `getObjectByName`。  
3. 断言每条可动链父子关系与 glb 一致。  
4. 缺任一：`BLOCKED: missing pants bones …` 停工。

**验收**：测试打印 chain 数量（左 9 + 右 9 = 18 条，若对称完整）；固定集不在 free 列表。

---

### Step 1 — 移植碰撞数学（PKG-SPCR-JOB）

实现 `pantsSpcrCollision.ts`：

- `pushoutFromSphere(center, radius, pointRadius, point) → boolean`  
- `pushoutFromCapsule(col, point, pointRadius) → boolean`（含 `radiusTailScale`、沿轴向端点球面）  
- `pushInFromCapsule`（用于 TRAP-WRAP / 防绕背，默认对腿胶囊开启）

数值用 `three.Vector3`；逻辑不得简化成「只做球」。

**验收**：单元测试：点在胶囊轴中点内侧，推出后距轴 ≥ 半径；端点行为与球一致。

---

### Step 2 — 约束表生成（PKG-SPCR README + CTRL）

对每条可动链：

1. **Structural Vertical**：父子相邻粒子。  
2. **Bending Vertical**：隔代（A–C）。  
3. 按 §2.3 环生成 **Structural Horizontal**（同 depth 邻居 + 闭环）。  
4. **Shear**：环上邻居链的交叉 depth（i↔i+1 斜接），对齐 SPCR Shear 意图。  
5. **Bending Horizontal**：环上隔一个邻居。  

每条约束存 `restLength = bind 时世界距离`。  
`isFixed` 粒子在约束投影时质量/权重为 0（不动）。

默认开关（对齐 SPCR 控制器常用全开横/剪/弯）：

- structural V/H、shear、bending V/H：**全部启用**（可用 cfg 布尔关闭做调试，默认 true）。

**验收**：debug 画线可见每条腿大腿环有闭环横连；关掉 horizontal 时踢腿穿腿明显恶化（对照实验，手测）。

---

### Step 3 — 求解器一步（PKG-SPCR-JOB + Jakobsen）

每帧 `deltaSec`（已 clamp）拆成 `pantsSubSteps`（默认 2）子步，子步 dt = delta/subSteps。

每个自由粒子每子步（语义对齐 Job）：

1. 读当前骨骼动画世界坐标作为 `transformPos`（mixer 后）。  
2. Verlet 式位移：`disp = (current - previous) * resistance`；`previous = current`；`current += disp`。  
3. 加重力：`current += gravityDir * gravityPower * dt²`（或与 SPCR 等价的重力项；**禁止**改用无文档的随意系数而不进面板）。  
4. 加呼吸风：`current += wind * windScale * dt²`（§6）。  
5. Hardness 拉回：`current += (transformPos - current) * hardness`（根固定粒子直接 `current = transformPos`）。  
6. 重复 `pantsConstraintIterations` 次：对所有约束做长度投影（shrink/stretch 标量按约束类型乘 cfg，对应 SPCR `_StructuralShrinkHorizontal` 等）。  
7. 对每个自由粒子：腿/髋/腰带碰撞 `pushout`；腿胶囊额外 `pushIn`（cfg 开关，默认 true）。  
8. 写回：对每个非 fixed 骨，用子粒子位置构造朝向（Aim `boneAxis`，对齐 Job 写回），设 `quaternion`；**不要**写 fixed 骨。

**验收**：无碰撞时裤脚在重力下下垂；有碰撞时蹲/踢不明显穿大腿。

---

### Step 4 — `RyuPantsPhysics.bind` / `update` / `dispose`

- `bind(modelRoot, { helperParent: scene })`：解析骨、建粒子、采 restLength、建约束、建碰撞描述符、`setInitState`。  
- `update({ deltaSec, cfg, jumpPhase, timeSec })`：写 cfg→solver 参数；`jumpPhase==='air'` 时 `gravityPower *= pantsGravityAirScale`；调用 solver。  
- Helpers：碰撞胶囊/球、约束线段；挂 **scene**（TRAP-HELPER-PARENT）。  
- `dispose`：移除 helpers，断引用。

**验收**：`enabled=false` 与纯动画一致；`enabled=true` idle 可见下垂差。

---

### Step 5 — 挂到 `FighterView`（豁免 + TRAP-MIXER）

在 `afterAnimPose` 于 `updateBeltPhysics` **之后**：

```ts
private updatePantsPhysics(fighter, cfg, wallDtSec): void {
  if (!this.pants?.isBound) return;
  const deltaSec = clampPantsDeltaSec(wallDtSec, cfg.pantsMaxDeltaSec, cfg.timeScaleAnim || 1);
  this.pants.update({
    deltaSec,
    cfg,
    jumpPhase: fighter.jumpPhase,
    timeSec: /* 累积墙钟，供呼吸风 */,
  });
}
```

硬性：

1. **不**读 hitstop / hitstun 决定是否 update。  
2. `installModel` bind；换模 `dispose`。  
3. 手测：加大 hitstop 时身体定住，裤管仍晃。

---

### Step 6 — 呼吸微晃（PKG-SPCR-WIND）

移植 `RandomWind`：

```
windForce = sin(t*ω) + 0.5*sin(t*ω*1.75) + 0.25*sin(t*ω*3.5)
wind = windDir * (windForce * pantsBreathAmp / 1.75)
```

- `pantsBreathHz` → ω = 2πf。  
- 默认小幅度（§7），不抢戏。

**验收**：站立开启时有极轻微晃动；`pantsBreathAmp=0` 则无。

---

### Step 7 — 配置、面板、持久化

见 §7。必须：`MutableSimConfig` + defaults；`ControlPanel` section `pants`；`DebugGui` 同步；标量进 `mergeConfig` / shipping。

---

### Step 8 — 测试与手测

| 测试 | 断言 |
|------|------|
| `pantsSpcrCollision.test.ts` | 球/胶囊推出 |
| `ryuPantsPhysics.test.ts` | 骨名表完整；bind；update 改变可动梢骨四元数；fixed 腰骨四元数不被改；enabled 门闩；clamp；**无** hitstop 早退分支 |
| `npm test` | 通过 |
| 手测 | 共识 §5 + 本方案 §10 |

---

## 6. 算法落点摘要（禁止改母本语义）

| 步骤 | 母本 |
|------|------|
| 约束种类 V/H/Shear/Bend | PKG-SPCR README + CTRL |
| 固定 depth0 | CTRL：`Point._IsFixed = Point._Depth == 0` |
| 阻力 / 硬度 | Job：`Displacement *= Resistance`；`Restore *= Hardness` |
| 胶囊碰撞 | Job `PushoutFromCapsule` / `PushInFromCapsule` |
| 写回旋转 | Job Aim `BoneAxis` + `InitialLocalRotation` |
| 呼吸风 | RandomWind.cs |
| 松弛迭代 | Jakobsen；次数 = `pantsConstraintIterations` |
| 横连防穿 | Magica/社群处方；实现用 SPCR 水平约束而非 Magica 运行时 |

---

## 7. 必须公开到调试面板的参数（字段名冻结）

全部进入 `MutableSimConfig` + `ControlPanel`「裤子物理」+ `DebugGui` 同名。  
默认服务共识 **偏软下垂**（对照 Magica SoftSkirt 调参方向：偏低结构硬度、可见重力、足够阻尼；**不是**头巾的硬短默认）。

| 字段 | 类型 | 默认 | 范围建议 | 面板标签 | 依据 |
|------|------|------|----------|----------|------|
| `pantsPhysicsEnabled` | boolean | `true` | — | 启用裤子物理 | C-PANTS |
| `pantsSubSteps` | number | `2` | 1–4 | 子步数 | PKG-SPCR `_SubSteps`；TRAP-WRAP |
| `pantsConstraintIterations` | number | `4` | 1–12 | 约束迭代 | REF-JAKOBSEN；穿腿时升高 |
| `pantsResistance` | number | `0.82` | 0–1 | 惯性保留（越高越滑） | SPCR Resistance 语义；偏软可略高惯性 |
| `pantsHardness` | number | `0.12` | 0–1 | 拉回动画硬度 | SPCR Hardness；偏低 → 更布 |
| `pantsHardnessTipScale` | number | `0.55` | 0.1–1.2 | 梢硬度乘子 | SoftSkirt：梢更软 |
| `pantsGravityPower` | number | `0.85` | 0–2 | 重力强度 | 偏软下垂；REF-MAGICA-SKIRT |
| `pantsGravityDirX/Y/Z` | number | `0,-1,0` | -1–1 | 重力方向 | SPCR `_Gravity` |
| `pantsGravityAirScale` | number | `0.65` | 0–1.5 | 滞空重力乘数 | 头巾/腰带同产品习惯；跳跃反馈 |
| `pantsWindScale` | number | `1.0` | 0–2 | 风/呼吸总乘子 | SPCR WindForceScale |
| `pantsBreathAmp` | number | `0.035` | 0–0.2 | 呼吸幅度 | C-PANTS；PKG-SPCR-WIND |
| `pantsBreathHz` | number | `0.35` | 0–2 | 呼吸频率 Hz | 不抢戏 |
| `pantsBreathDirX/Y/Z` | number | `0.15,0,0.05` | -1–1 | 呼吸风向 | RandomWind 方向可调 |
| `pantsStructuralShrinkVertical` | number | `1.0` | 0–2 | 纵缩约束 | SPCR |
| `pantsStructuralStretchVertical` | number | `1.0` | 0–2 | 纵伸约束 | SPCR |
| `pantsStructuralShrinkHorizontal` | number | `1.0` | 0–2 | 横缩约束 | SPCR；TRAP-NOLATERAL |
| `pantsStructuralStretchHorizontal` | number | `1.0` | 0–2 | 横伸约束 | SPCR |
| `pantsShearShrink` | number | `1.0` | 0–2 | 剪切缩 | SPCR |
| `pantsShearStretch` | number | `1.0` | 0–2 | 剪切伸 | SPCR |
| `pantsBendingShrinkVertical` | number | `0.85` | 0–2 | 纵弯缩 | SPCR；略松 → 更软 |
| `pantsBendingStretchVertical` | number | `0.85` | 0–2 | 纵弯伸 | SPCR |
| `pantsBendingShrinkHorizontal` | number | `0.85` | 0–2 | 横弯缩 | SPCR |
| `pantsBendingStretchHorizontal` | number | `0.85` | 0–2 | 横弯伸 | SPCR |
| `pantsEnableHorizontal` | boolean | `true` | — | 启用横连约束 | TRAP-NOLATERAL |
| `pantsEnableShear` | boolean | `true` | — | 启用剪切约束 | SPCR |
| `pantsEnableBending` | boolean | `true` | — | 启用弯曲约束 | SPCR |
| `pantsPointRadius` | number | `0.012` | 0–0.05 | 粒子碰撞半径 | SPCR `_PointRadius` |
| `pantsMaxDeltaSec` | number | `0.05` | 0.016–0.1 | 单帧 dt 上限 | TRAP-DT |
| `pantsColliderThighRadius` | number | `0.095` | 0–0.25 | 大腿胶囊半径 | REF-MAGICA-COL；略大于肉 |
| `pantsColliderThighTailScale` | number | `0.85` | 0.3–1.5 | 大腿胶囊末端半径比 | SPCR RadiusTailScale |
| `pantsColliderCalfRadius` | number | `0.07` | 0–0.2 | 小腿胶囊半径 | 防裤脚穿小腿 |
| `pantsColliderCalfTailScale` | number | `0.75` | 0.3–1.5 | 小腿末端半径比 | SPCR |
| `pantsColliderHipRadius` | number | `0.11` | 0–0.3 | 髋球半径 | 共识髋 |
| `pantsColliderBeltRadius` | number | `0.09` | 0–0.3 | 腰带区球半径 | C-PANTS 少穿腰带 |
| `pantsColliderHipYOffset` | number | `0` | -0.2–0.2 | 髋球 Y 偏移 | 调穿模 |
| `pantsColliderBeltYOffset` | number | `0.02` | -0.2–0.2 | 腰带球 Y 偏移 | 调穿模 |
| `pantsUsePushIn` | boolean | `true` | — | 腿胶囊 PushIn 防绕背 | PKG-SPCR PushIn；TRAP-WRAP |
| `pantsShowColliders` | boolean | `false` | — | 显示碰撞 Helper | 调试 |
| `pantsShowConstraints` | boolean | `false` | — | 显示约束线 | 调试横连 |

**面板分区建议顺序**：启用 → 软硬/重力/呼吸 → 约束迭代与横连开关 → 约束强度组 → 碰撞半径组 → Helper。

---

## 8. 与头巾/腰带的边界

| 项 | 规则 |
|----|------|
| 求解器 | 独立 SPCR 骨布；**不用** `VRMSpringBoneManager` 驱动裤骨 |
| 骨写入 | 裤子只写 §2.2；腰带只写 Obi 尾；互不覆盖 |
| 碰撞 | 裤子可读 `C_ObiRoot` 世界矩阵做 beltSphere；**不**修改 Obi 弹簧状态 |
| 参数 | `pants*` 与 `headband*`/`belt*` 完全分离 |

---

## 9. 不做（写进计划以免执行者扩 scope）

- 地面/墙场景碰撞硬验收  
- WebGPU 顶点布料主路径  
- 重做/加长裤网格  
- 其他角色  
- 把 `Pants_Weist_*` 做成大扭腰布袋  
- 慢动作/暂停/回放特殊时间策略（共识未定）

---

## 10. 验收清单（执行完成定义）

- [ ] §2 骨门禁通过；固定腰不二次扭  
- [ ] 横连默认开启；debug 线可见大腿/裤脚环  
- [ ] idle：偏软下垂 + 呼吸微晃  
- [ ] 走跑急停、跳跃、踢腿、蹲起：布感可见  
- [ ] 几乎不穿大腿/小腿；腰带交叠可调到可接受  
- [ ] hitstop / hitstun：裤子仍更新  
- [ ] §7 字段全在 ControlPanel + DebugGui，且可保存重开  
- [ ] 单元测试 + `npm test` 通过  
- [ ] LICENSE 头注释存在于移植文件  

---

## 11. 坑与对策（执行中必须遵守）

| 坑 | 对策 |
|----|------|
| 只有纵链，踢腿穿腿 | 强制 §2.3 横连；手测对比 `pantsEnableHorizontal=false` |
| mixer 后闪烁/弹回 | afterAnimPose 写骨；TRAP-MIXER |
| 动画轨盖掉物理 | enabled 时覆盖可动链；关则不写 |
| 大 dt 爆炸 | `pantsMaxDeltaSec` + substeps |
| 胶囊过大外翻 | 降半径，勿只加 hardness 硬撑 |
| 绕到腿背 | `pantsUsePushIn` + 增 iterations |
| 腰/腰带乱穿 | 固定 Weist；beltSphere；禁写 Obi |
| 误用 springbone「做完了」 | §0 规则 2–3；验收三项观感 |
| HitStop 用全局 timeScale | 禁止；用墙钟 delta |
| Helpers 跟着角色缩放出错 | helperParent=scene |

---

## 12. 相关文件

| 文件 | 关系 |
|------|------|
| `docs/pants-physics-consensus-v0.md` | 目标共识（**已抛弃**） |
| `docs/research/pants-physics-research-2026-08-24.md` | 调研（**已抛弃**） |
| `docs/plans/ai-execution-plan-pants-health-report-v0.md` | 监测方案（**已抛弃**） |
| `docs/plans/ai-execution-plan-headband-physics-v0.md` | 挂接/面板/豁免工程对照 |
| `docs/plans/ai-execution-plan-belt-physics-v0.md` | 同上；Obi 边界 |
| https://github.com/SPARK-inc/SPCRJointDynamics | 算法母本（历史） |
| https://magicasoft.jp/en/boneclothskirtguide2/ | 横连/腿胶囊处方对照（历史） |

---

## 13. 一句话交给执行 AI（历史 · 已抛弃）

> **不再执行。** 以下为抛弃前的交付摘要，仅作历史记录。

在 `app/src/render/pants/` **按 SPCRJointDynamics（提交 7ebe63e）语义**实现带 **纵向+横向+剪切+弯曲约束** 的裤子骨布，腿用 **胶囊 Pushout/PushIn**，腰/裆固定，mixer 后墙钟更新并豁免 hitstop；**禁止**用头巾 springbone 单链或 WebGPU 布料包冒充完成；§7 参数必须全部上调试面板并可持久化。

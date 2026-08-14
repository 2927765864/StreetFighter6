# AI 可执行方案：表现溶图 方案一（双播旧尾 + 溶新）

> **文档类型**：给 **AI / 人类执行者** 的实现规范（非共识原文）  
> **节点**：2026-08-14  
> **对齐共识（必须全文服从）**：  
> - `docs/character-control/consensus-design-v0.md` **§3.11（2026-08-14 修订）**  
> - 同文档 §3.7.1 动画残留、§3.7.2 必接片、§3.10 落地贴地量脚、§3.13 跳攻残留  
> **对齐现仓（只改这些文件的语义，禁止另起混合器架构）**：  
> - `app/src/render/FighterView.ts`（`PoseBlend` / `beginPoseBlend` / `stepPoseBlend` / `syncFromFighter` 各 phase 溶图分支）  
> - `app/src/combat/anim/AnimCrossfade.ts`（策略表注释；**时长解析逻辑禁止改表意**）  
> - `app/src/config/constants.ts`（`MutableSimConfig` 溶图相关字段注释 + 可选对比开关）  
> - `app/src/debug/DebugGui.ts`（lil-gui 参数）  
> - `app/tests/combat/animCrossfade.test.ts`（策略单测保持；可增推进单测）  
> - 可选：`app/tests/combat/` 新增 `poseBlendDualAdvance.test.ts`（若可纯函数抽取）  
> **本方案不改**：`Fighter` phase 机、`animTail` 生命周期、`resolveCrossfadeSec` 分情况表数字语义、攻击锁定内硬切规则。

---

## 0. 执行者硬性规则（违反即停）

1. **禁止自我发挥架构**：不得引入第二套 AnimationMixer、不得默认改用 `AnimationAction.crossFadeTo` 作为主路径（见 §6 陷阱）、不得为旧片伪造逻辑 residual。  
2. **逻辑权威不变**：`MatchSim` / `Fighter` 决定何时切 clip；`AnimationMixer` 只影响骨架。溶图不得推迟 `canAct`、不得改框/位移。  
3. **`combat/` 禁止 `import 'three'`**；Three 仅在 `render/`、`debug/`、测试允许的 mock。  
4. **共识 §3.11 默认 = 双播旧尾**。允许调试开关临时回退「冻旧」仅用于对比，**默认值必须是 dual-advance**。  
5. 每步结束必须满足该步 **验收** + 列出的 **单测/手测**；缺依赖写 `BLOCKED:` 停工。  
6. 改注释/文档字符串中所有 `freeze-old` / 「冻旧」默认描述，改为双播旧尾，避免后人按旧机制改代码。

---

## 1. 权威依据总表

### 1.1 项目内

| ID | 路径 / 内容 | 用途 |
|----|-------------|------|
| **C-CC-311** | `docs/character-control/consensus-design-v0.md` §3.11（2026-08-14） | 双播旧尾 + 溶新；时长=权重交叉窗口；否决默认冻旧 |
| **C-CC-37** | 同上 §3.7.1 / §3.7.2 | 残留与必接片；溶图不替代必接 |
| **C-CC-310** | 同上落地贴地量脚行 | 溶未到 land 时先归零竖直偏移；溶完再贴 |
| **APP-VIEW** | `app/src/render/FighterView.ts` | 现实现：`PoseBlend`、`beginPoseBlend`、`stepPoseBlend`、`scrubActionTo`、`switchToLogicAction`、`syncFromFighter` |
| **APP-XF** | `app/src/combat/anim/AnimCrossfade.ts` | `resolveCrossfadeSec` / `defaultCrossfadeDurations` / `categorizeBinding` |
| **APP-CONST** | `app/src/config/constants.ts` | `locoBlendSec`、`residualToMoveBlendSec`、`residualToStanceBlendSec`、`residualToAttackBlendSec` |
| **APP-GUI** | `app/src/debug/DebugGui.ts` | lil-gui `animDrive` 文件夹已有溶图秒数滑条 |
| **TEST-XF** | `app/tests/combat/animCrossfade.test.ts` | 策略表秒数回归 |
| **PKG-THREE** | `app/package.json` → `"three": "^0.185.1"` | 运行时 Three 版本锁定参考 |

### 1.2 Three.js 官方 API（必须按文档语义使用，禁止臆造）

| ID | 来源 | 本方案采用的语义 |
|----|------|------------------|
| **THREE-AA** | [AnimationAction](https://threejs.org/docs/#api/en/animation/AnimationAction) | `time`、`paused`、`enabled`、`setEffectiveWeight(w)`、`play()`、`stop()`、`reset()`、`setLoop`、`clampWhenFinished`；**`paused === true` 时 effectiveTimeScale=0，时间不随 mixer.update(dt) 前进** |
| **THREE-MIX** | [AnimationMixer](https://threejs.org/docs/#api/en/animation/AnimationMixer) | `update(delta)` 推进未暂停 action；对 **paused + 手写 time** 的双轨，本仓既有约定用 `update(0)` 应用姿态（见 APP-VIEW `scrubActionTo` 注释） |
| **THREE-CF** | [AnimationAction.crossFadeTo](https://threejs.org/docs/#api/en/animation/AnimationAction.crossFadeTo) | 官方权重交叉 API；**本方案主路径不调用**（见 §6：与逻辑 scrub 冲突、社区权重前置条件坑） |
| **THREE-BLEND-EX** | [webgl_animation_skinning_blending](https://threejs.org/examples/?q=animation#webgl_animation_skinning_blending) | 官方示例：多 `AnimationAction` 同时 `play` + 权重混合角色骨架（概念对照） |
| **THREE-SRC-AA** | 本仓 `app/node_modules/three/src/animation/AnimationAction.js` | 查阅 `setEffectiveWeight` / `_scheduleFading` 真实行为；禁止复制进业务仓 |

### 1.3 社区讨论（陷阱与做法依据）

| ID | 来源 | 结论写入本方案 |
|----|------|----------------|
| **DISC-CF-63467** | [discourse: AnimationAction.crossFadeTo not working](https://discourse.threejs.org/t/animationaction-crossfadeto-not-working/63467) (2024) | 官方 `crossFadeTo` 若目标 weight 未就绪会溶到 rest/T-pose；作者改用 **每帧手写 weight 增减** 可靠。**本方案延续仓内手写 weight（smoothstep），不改用 crossFadeTo 主路径。** |
| **REDDIT-CF** | [r/threejs: Clarification on crossFade and fade](https://www.reddit.com/r/threejs/comments/1cvd7mu/clarification_on_the_effect_of_crossfade_and_fade/) | 文档对 fade 起止 weight 表述易误解；手写 weight 更可控。 |
| **SO-SCRUB** | [SO: manually control animation frame by frame](https://stackoverflow.com/questions/53004301/how-to-manually-control-animation-frame-by-frame) | 逐帧设 `action.time` + mixer 更新；与 APP-VIEW 现路径一致。 |
| **SO-CF-79049** | [SO: how to get three.js crossFadeTo() working](https://stackoverflow.com/questions/79049045/how-to-get-three-js-crossfadeto-working) | 多 action 同时 enabled/weight 配置敏感；印证手写双轨更稳。 |
| **APP-VIEW-NOTE** | `FighterView.scrubActionTo` 内注释 | **禁止** 在 paused 路径依赖 `mixer.setTime()` 推进 action.time（effectiveTimeScale=0 会卡帧 0）——双播旧尾时旧层也必须 **手写 `action.time += dt`** 或等价，不可假定 unpause + 单次 mixer.update 能正确双 scrub。 |

### 1.4 权重曲线（数学，非开源仓）

| ID | 公式 | 用途 |
|----|------|------|
| **MATH-SMOOTH** | 现码：`u = clamp(elapsed/duration)`；`w = u*u*(3-2*u)`（smoothstep） | **保留**；与改机制前一致，仅旧层时间推进方式变 |

---

## 2. 目标行为（验收语义）

### 2.1 与旧行为相同（禁止改）

| 项 | 要求 |
|----|------|
| 触发时机 | 仍由 `switchToLogicAction` + `resolveCrossfadeSec(fromKey,toKey,d)` 决定；`blendSec<=0` 硬切 |
| 时长含义 | 权重从旧→新交叉的墙钟秒数（`PoseBlend.duration`） |
| 分情况表 | `AnimCrossfade.resolveCrossfadeSec` 分支与默认秒数语义不变 |
| 攻击锁定 | `phase===attack` 且 move 存在 → 继续 `HARD_CUT` + 清 `poseBlend` |
| 逻辑 | 不改 `Fighter` / `MatchSim` / `animTail` 开始结束规则 |

### 2.2 必须改变（相对 2026-08-11 冻旧实现）

| 项 | 旧（方案二 · 现码） | 新（方案一 · 本方案） |
|----|---------------------|----------------------|
| 溶图中旧层 `from.time` | 每帧钉在 `fromTimeSec` | 每帧 **`fromTimeSec` 起点 + 墙钟累加**，夹在 `[0, clip.duration-ε]` |
| 溶图中新层 idle/crouch | 钉在 `time=0`（`syncFromFighter` idle 分支） | **从 0 起按墙钟/free-run 前进**（权重 `w`） |
| 溶图中新层 walk/land/stance/turn | 逻辑 scrub（保持） | **保持** 逻辑 scrub + 权重 `w` |
| 片尾 | N/A（已冻） | 旧层到片尾后 **夹末帧**，权重交叉继续直到 `duration` 结束 |

### 2.3 画面一句话

同一 `duration` 窗口内：**前动画尾巴继续动 + 后动画前段在动**，旧权重 1→0、新权重 0→1。

---

## 3. 具体实现（禁止偏离下列算法）

### 3.1 数据结构（`FighterView.ts`）

将现有：

```ts
type PoseBlend = {
  from: THREE.AnimationAction;
  to: THREE.AnimationAction;
  fromKey: string;
  toKey: string;
  duration: number;
  elapsed: number;
  fromTimeSec: number; // 冻住的时间
  toFreeRun: boolean;
};
```

改为（字段名固定，禁止另起同义字段）：

```ts
type PoseBlend = {
  from: THREE.AnimationAction;
  to: THREE.AnimationAction;
  fromKey: string;
  toKey: string;
  duration: number;
  elapsed: number;
  /** 切换瞬间旧片 time（秒）；双播时作为起点。 */
  fromStartTimeSec: number;
  /** 溶图窗口内旧片已前进的墙钟秒（仅 dual-advance）。 */
  fromAdvancedSec: number;
  toFreeRun: boolean;
  /**
   * 'dual' = 共识默认双播旧尾；
   * 'freeze' = 调试回退：旧层钉 fromStartTimeSec（历史方案二）。
   */
  mode: 'dual' | 'freeze';
};
```

迁移：删除 `fromTimeSec`；所有读写改 `fromStartTimeSec` + `fromAdvancedSec`。

### 3.2 `beginPoseBlend`（同文件）

**依据**：THREE-AA（paused 时 time 不自动走）；DISC-CF-63467（手写 weight）；C-CC-311。

算法（伪代码 = 必须实现语义）：

```
if blendSec <= ε:
  现有硬切路径（stopAll / to weight 1）— 禁止改行为
  return

若已有 poseBlend 且 from 不是当前 from：停掉旧 poseBlend.from（现逻辑）

fromStart = from.time
from.enabled = true
from.paused = true          // 双轨均手写 time，禁止依赖 mixer dt 只推一侧
from.setEffectiveWeight(1)

to.reset()
to.setLoop(toFreeRun ? LoopRepeat : LoopOnce, Infinity)
to.clampWhenFinished = !toFreeRun
to.enabled = true
to.paused = true            // 由 sync 路径 scrub 或本 step 推进 free-run
to.setEffectiveWeight(0)
to.time = 0
to.play()
from.play()                 // 确保 from 仍在 mixer 求值列表（THREE-AA play）

poseBlend = {
  from, to, fromKey, toKey,
  duration: blendSec,
  elapsed: 0,
  fromStartTimeSec: fromStart,
  fromAdvancedSec: 0,
  toFreeRun,
  mode: cfg.crossfadeAdvanceMode === 'freeze' ? 'freeze' : 'dual'
}
mixer.update(0)
```

**禁止**：`from.crossFadeTo(to, blendSec)` 作为主路径。  
**禁止**：`mixer.stopAllAction()` 在 soft 路径（会杀掉 from，无法双播）——现 soft 路径已避免 stopAll；保持。

### 3.3 `stepPoseBlend(wallDtSec)`（同文件）

```
b.elapsed += clamp(wallDtSec, 0, 0.1)
u = min(1, b.elapsed / max(ε, b.duration))
w = u*u*(3-2*u)   // MATH-SMOOTH，禁止改曲线除非 GUI 增加且默认仍 smoothstep

// --- 旧层时间 ---
if b.mode === 'freeze':
  fromT = b.fromStartTimeSec
else: // dual
  b.fromAdvancedSec += clamp(wallDtSec, 0, 0.1)
  fromT = b.fromStartTimeSec + b.fromAdvancedSec

clipDur = b.from.getClip().duration
fromT = clamp(fromT, 0, max(0, clipDur - 1e-4))

scrubActionTo(b.from, fromT, 1-w, false)   // 复用现方法；weight=1-w

if u >= 1:
  停 from；to weight=1；若 toFreeRun 则 to.paused=false
  poseBlend=null
  mixer.update(0)
  return 1
return w
```

**理论依据**：旧状态逻辑已切走 → 无 locoFrame/animTail 权威（C-CC-311「旧层推进」）→ 仅墙钟。片尾 clamp = 共识「片尾耗尽」条。

### 3.4 `syncFromFighter` 各分支（必须逐条改注释 + idle 行为）

下列分支在 `poseBlend && poseBlend.to === action` 时：

| 分支 | 新层 `to` | 旧层 |
|------|-----------|------|
| animTail | 已有 visualFrame scrub + weight `w` | `stepPoseBlend` 内推进 |
| stance transition | stance frame scrub + `w` | 同上 |
| walk | locoFrame scrub + `w` | 同上 |
| jump land | jumpFrame scrub + `w` | 同上 |
| turn | turnFrame scrub + `w` | 同上 |
| **idle / crouch free-run** | **删除**「Still blending: hold idle at start pose」；改为：`to.time` 在溶图窗口内按 `wallDtSec`/`animDt` 从 0 累加（或 unpause 仅 to 时需保证 from 仍 paused+手写 time 且 **一次** `mixer.update(0)` 在双 scrub 之后）。**推荐与旧层一致：全程 paused + 手写 to.time += dt，weight=w**，避免 mixer.update(animDt) 误推 from。 |

**推荐 idle 溶图中实现（强制优先此写法）**：

```
const w = stepPoseBlend(wallDtSec)  // 内部已写 from.time / weights
if (poseBlend still active) {
  // to free-run 表现：用墙钟从 0 前进
  const t = min(poseBlend.elapsed /* 或单独 toAdvanced */, clip.duration-ε)
  // 更干净：在 PoseBlend 增加 toAdvancedSec，begin 时 0，step 里 toFreeRun 时同步 += wallDt
  scrubActionTo(to, toT, w, true)
} else {
  // 溶完：现有 free-run mixer.update(animDt)
}
```

为实现精确，**允许** 在 `PoseBlend` 增加：

```ts
toAdvancedSec: number; // begin=0；step 中若 toFreeRun 则 += wallDt
```

`stepPoseBlend` **不**负责写 `to.time`（仍由 sync 分支写），但 `toAdvancedSec` 可在 `stepPoseBlend` 递增供 idle 分支读取。  
非 free-run 的 `to` 忽略 `toAdvancedSec`，继续逻辑 scrub。

### 3.5 配置项（`constants.ts`）

**保留**（已有，调试面板已挂，禁止删除）：

| 字段 | 默认（createDefaultSimConfig） | 含义 |
|------|-------------------------------|------|
| `locoBlendSec` | 0.12 | 走↔停等 loco 溶图秒 |
| `residualToMoveBlendSec` | 0.10 | 攻击/冲刺残留 → 移动/待机 |
| `residualToStanceBlendSec` | 0.10 | 残留 → 站蹲过渡 |
| `residualToAttackBlendSec` | 0 | 残留 → 攻（默认硬切） |

**新增（必须）**：

| 字段 | 类型 | 默认 | 含义 |
|------|------|------|------|
| `crossfadeAdvanceMode` | `'dual' \| 'freeze'` | **`'dual'`** | 溶图旧层：`dual`=双播旧尾（共识）；`freeze`=冻旧（对比/回退） |

注释必须写清对齐 §3.11 2026-08-14。  
`defaultCrossfadeDurations` **不**纳入 mode（mode 是执行器，不是策略秒数）。

### 3.6 调试面板（`DebugGui.ts` · lil-gui）

在现有 `animDrive`（或同级 Animation / 表现）文件夹 **必须** 公开：

| GUI 显示名（中文优先） | 绑定字段 | 范围 / 控件 |
|------------------------|----------|-------------|
| `locoBlendSec` | `cfg.locoBlendSec` | 0–0.35 step 0.01（已有） |
| `residual→move溶图` | `cfg.residualToMoveBlendSec` | 0–0.35 step 0.01（已有） |
| `residual→攻溶图` | `cfg.residualToAttackBlendSec` | 0–0.2 step 0.01（已有） |
| `residual→站蹲过渡` | `cfg.residualToStanceBlendSec` | 0–0.35 step 0.01（已有） |
| **`溶图旧层模式`** | `cfg.crossfadeAdvanceMode` | dropdown：`dual` / `freeze`（**新增**） |

可选（推荐，非阻塞）：

| GUI | 字段 | 说明 |
|-----|------|------|
| `溶图进行中` 只读 | 从 view 暴露 `getPoseBlendDebug()` | 显示 fromKey→toKey、elapsed/duration、fromT、mode；便于确认双播在跑 |

`getPoseBlendDebug` 若实现，签名固定：

```ts
// FighterView
getPoseBlendDebug(): null | {
  mode: 'dual' | 'freeze';
  fromKey: string;
  toKey: string;
  elapsed: number;
  duration: number;
  fromTimeSec: number; // 当前旧层 time
  toWeight: number;
}
```

### 3.7 策略模块注释（`AnimCrossfade.ts`）

文件头改为：

```
* Presentation crossfade policy (§3.11).
* Mechanism (executor in FighterView): dual-advance old clip + blend-to-new
*   (optional debug freeze-old via crossfadeAdvanceMode).
* Policy table decides whether to blend and for how long — not a single global fade.
```

`resolveCrossfadeSec` **函数体禁止改分支结果**（单测锁死）。仅允许改注释里的 freeze-old 字样。

### 3.8 `switchToLogicAction`

- 继续 `resolveCrossfadeSec` → `beginPoseBlend`。  
- 将 `cfg` 的 mode 传入 `beginPoseBlend`（需给 `beginPoseBlend` 增加 `mode` 参数，或从 `FighterView` 成员读取最新 cfg——**若 sync 已持有 cfg，在 begin 时传入 mode**）。  
- `playBest` 签名可增加 mode 来源：从 `syncFromFighter(cfg)` 闭包读取 `cfg.crossfadeAdvanceMode`，在 `switchToLogicAction` 增加参数 `mode: 'dual'|'freeze'`。

---

## 4. 分步执行清单（逐步验收）

### Step A — 配置与 GUI

1. `MutableSimConfig` + `createDefaultSimConfig` 增加 `crossfadeAdvanceMode: 'dual'`。  
2. `DebugGui` dropdown 绑定。  
3. **验收**：启动训练场，面板可见「溶图旧层模式」，默认 dual。

### Step B — PoseBlend 双播核心

1. 改 `PoseBlend` 字段；实现 §3.2–3.3。  
2. 全文件替换 freeze-old 注释。  
3. **单测**（优先纯函数）：若将  
   `advanceFromTime(start, advanced, dt, clipDuration, mode) → number`  
   抽到 `app/src/combat/anim/PoseBlendMath.ts`（**无 three 依赖**，可被 combat 测试引用），则：

```ts
// dual: start=1.0, adv=0, dt=0.05, dur=2 → 1.05
// dual: start=1.9, adv=0, dt=0.5, dur=2 → 2-1e-4 clamp
// freeze: 任意 dt → 仍为 start
```

4. **验收**：vitest 绿；无 three 的 math 测必须过。

### Step C — idle/crouch 溶图中新层前进

1. 删除 idle 分支「hold at 0」。  
2. 按 §3.4 用 `toAdvancedSec` + scrub。  
3. **手测**：5LP 残留结束自然回 idle，或残留中点松开后回 idle——过渡窗口内待机应有轻微呼吸/循环起动，而非整段 T 静止再弹。

### Step D — 回归策略单测与关键路径手测

1. `npm test` / `vitest run`：`animCrossfade.test.ts` 全过。  
2. 手测矩阵（默认 dual，时长用默认秒）：

| # | 操作 | 期望 |
|---|------|------|
| H1 | 5LP 后立刻前走 | 旧招尾仍动，叠进 walk start/loop；无「长定格再硬切」的溶图段 |
| H2 | 2LK 后松下 → crouch_to_stand | 必接片完整；切入软；旧尾双播 |
| H3 | 跳攻残留落地 land | 可溶；溶完再贴地；无整身按进地（C-CC-310） |
| H4 | 出招锁定中连按另一招 | 仍硬切（residualToAttack 默认 0） |
| H5 | GUI 切 `freeze` | 旧层钉切换帧（对比）；再切回 dual |

### Step E — 文档字符串与共识引用

1. `constants.ts` / `AnimCrossfade.ts` / `FighterView.ts` 注释对齐 §3.11 2026-08-14。  
2. 本执行方案勾选完成；**禁止**改回共识为冻旧。

---

## 5. 明确不做

| 不做 | 原因 |
|------|------|
| 改 `resolveCrossfadeSec` 表意 / 默认秒数 | 共识：时机与时长表不变 |
| 用 `crossFadeTo` 替换手写 weight | DISC-CF-63467 / 与 scrub 冲突 |
| 溶图延长 `animTail` 逻辑 | 否决：伪造 residual |
| 攻击锁定内开溶 | §3.11 侵占禁令 |
| 改 plant 算法本体 | 仅保持「溶未完成不 snap land」现逻辑（`blendingFromNonLand`） |
| 全局动画图状态机（如 UE ABP） | 超出本仓；本仓为 clip binding + phase |

---

## 6. 坑与技术陷阱（检索 + 仓内）

| ID | 坑 | 依据 | 本方案强制规避 |
|----|----|------|----------------|
| T1 | `crossFadeTo` 目标 weight 未设好 → 溶到 rest/T-pose | DISC-CF-63467 | 禁用主路径 crossFadeTo；手写 `setEffectiveWeight` |
| T2 | `paused` 时 mixer.update(dt) **不**推进 `action.time` | THREE-AA；APP-VIEW-NOTE | 旧层/新层 free-run 均手写 `time += dt` |
| T3 | soft 路径 `stopAllAction` 杀掉旧片 | Three mixer 行为；现硬切路径用 stopAll | soft 禁止 stopAll |
| T4 | 双轨一个 unpause+update(dt)、一个 scrub → from 被错误推进或 to 被跳过 | 仓内混合历史 | 溶图窗口内 **两轨 paused + 手写 time + update(0)** |
| T5 | 旧片逻辑已切走仍去读 animTail.visualFrame | 状态机竞态 | 只读 begin 时的 from.time + 墙钟 |
| T6 | 片尾不 clamp → time 越界 / 循环 LoopOnce 怪异 | THREE-AA clamp | `duration - 1e-4` clamp |
| T7 | land 溶图中用跳攻姿势量脚 → 整身下压 | C-CC-310；现 `pendingLandPlant` | 保持 `blendingFromNonLand` 不 snap；溶完再 plant |
| T8 | idle 钉 0 + 旧冻 → 静对静，观感假溶图 | 现码 idle 分支 | 方案一废止 idle 钉 0 |
| T9 | 权重未归一或只设一侧 | REDDIT-CF / 官方 fade 语义混淆 | 每帧显式 `from=1-w` `to=w`（smoothstep） |
| T10 | GUI 改秒数不热更新 | lil-gui 绑 cfg 引用 | 沿用现有 cfg 对象引用；mode 亦绑同一 cfg |
| T11 | 测改了策略秒数却当推进 bug | 职责分离 | 策略测与 `PoseBlendMath` 测分开 |

---

## 7. 源码锚点（改哪里 · 行级指引以符号为准）

执行时用符号搜索，勿死记行号（文件会变）：

| 符号 | 文件 | 动作 |
|------|------|------|
| `type PoseBlend` | `FighterView.ts` | 改字段 |
| `beginPoseBlend` | `FighterView.ts` | 双播初始化 |
| `stepPoseBlend` | `FighterView.ts` | 旧层时间推进 |
| `scrubActionTo` | `FighterView.ts` | 复用；勿改 paused 语义 |
| `switchToLogicAction` | `FighterView.ts` | 传入 mode |
| idle 分支 `hold idle at start pose` | `FighterView.ts` | 删除并改为 to 前进 |
| `resolveCrossfadeSec` | `AnimCrossfade.ts` | 只改注释 |
| `MutableSimConfig` | `constants.ts` | 加 mode |
| `residual→move溶图` 旁 | `DebugGui.ts` | 加 dropdown |

---

## 8. 完成定义（DoD）

- [x] 共识 §3.11 已是双播旧尾（文档侧已由本轮修订；代码注释一致）  
- [x] 默认 `crossfadeAdvanceMode === 'dual'`  
- [x] GUI 可切换 dual/freeze  
- [x] `stepPoseBlend` dual 下旧 `time` 随墙钟增加并 clamp  
- [x] idle 溶图中新层不整段钉 0  
- [x] `animCrossfade.test.ts` 全绿（+ `poseBlendMath.test.ts`；2026-08-14 vitest 172 passed）  
- [ ] 手测 H1–H5 通过（执行者本机训练场确认）  
- [x] 无 `crossFadeTo` 主路径、无伪造 animTail、无攻击锁内溶图  

---

## 9. 修订记录

| 日期 | 内容 |
|------|------|
| 2026-08-14 | 初版：对齐 §3.11 方案一；手写双轨 + 配置/GUI；陷阱表含 three 社区与仓内 scrub 约束 |
| 2026-08-14 | 代码落地：PoseBlendMath、FighterView dual-advance、cfg/GUI、单测全绿；手测 H1–H5 待本机确认 |

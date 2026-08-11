# AI 可执行方案：动画映射 · 逻辑帧驱动 · 脚部 · 位移（四大问题）

> **文档类型**：给 **AI / 人类执行者** 的实现规范（非共识原文、非排期口号）  
> **节点**：2026-08-11  
> **对齐共识**（已落盘，禁止偏离）：  
> - `docs/character-control/consensus-design-v0.md` **§3.7–§3.10、§6.7**  
> - ADR-001 / ADR-003  
> **对齐数据/映射**：  
> - `docs/character-control/action-tables/ryu-logic-to-glb-map.{md,json}`  
> - `docs/character-control/action-tables/sources.md`（S4 Movement、R2 Ryu/Data）  
> - `app/public/data/clips/ryu_logic_to_glb_map.json`  
> **对齐现仓**：`app/src/combat/*`、`app/src/render/FighterView.ts`、`app/src/data/logicGlbMap.ts`、`app/src/debug/DebugGui.ts`、`app/src/config/constants.ts`  
> **相关旧方案**（勿重复做已完成的输入/缓冲 P0）：`docs/plans/ai-execution-plan-character-control-p0-v0.md`

---

## 0. 执行者硬性规则（违反即停）

1. **禁止自我发挥架构**：只允许本文件列出的目录、类名、字段、配置键与引用源码的**语义**。用 TypeScript **在本仓重写**；禁止 vendoring 整仓、禁止粘贴版权美术。  
2. **逻辑权威 = 本地 JSON/配置 + `MatchSim`/`Fighter` 状态**；`AnimationMixer` / clip 时长 **不得**决定出招结束、cancel、位移权威（共识 §3.7、§3.10）。  
3. **`combat/` 禁止 `import 'three'`**；Three / GLTF / CCDIK 仅在 `render/`、`tools/`、`debug/`、离线脚本。  
4. **公开数字必须先落本地**再被运行时读取（共识 §6.7）；禁止运行时 HTTP 拉 wiki。  
5. 每步结束必须满足该步 **验收** + 列出的 **单测/手测**；缺依赖写 `BLOCKED:` 停工，不发明第二套方案。  
6. 改动现有行为时：**保持可解释**；破坏旧测须同步改断言并说明原因。  
7. **明确不做（本方案）**：超必杀接线、投技 tech/抓取结算、完整 Drive、联网 rollback、全招审查盒挖矿、走路/待机支撑脚锁定（共识 §3.9）。

---

## 1. 权威依据总表（全文引用 ID）

### 1.1 项目内

| ID | 路径 / 内容 | 用途 |
|----|-------------|------|
| **C-CC-37** | `consensus-design-v0.md` §3.7 | 60 格驱动画面、截断/均匀取样、待机 free-run |
| **C-CC-38** | 同上 §3.8 | 跳/投表现/走三段；投先播动画；超杀后置 |
| **C-CC-39** | 同上 §3.9 | 出招支撑脚；走/待机不锁脚；待机止抖 |
| **C-CC-310** | 同上 §3.10 | 走冲跳公开数；攻击自位移从动画估；单写者 |
| **C-CC-67** | 同上 §6.7 | 公开数据落本地 |
| **ADR-001** | `docs/decisions/ADR-001-logic-fps-60.md` | 逻辑 60 Hz |
| **ADR-003** | `docs/decisions/ADR-003-move-frame-indexing.md` | `moveFrame` 0-based |
| **C-MAP** | `action-tables/ryu-logic-to-glb-map.*` | moveId → glb roles |
| **C-SRC** | `action-tables/sources.md` S4/R2 | 权威 URL 清单 |
| **APP-VIEW** | `app/src/render/FighterView.ts` | scrub / plantFeet / playBest |
| **APP-LGM** | `app/src/data/logicGlbMap.ts` | 现仅 `primaryPath` |
| **APP-SIM** | `app/src/combat/match/MatchSim.ts` | walk/dash/jump 执行 |
| **APP-FT** | `app/src/combat/fighter/Fighter.ts` | phase / clipId / timers |
| **APP-MP** | `app/src/combat/move/MovePlayer.ts` | 招式 localFrame |
| **APP-MD** | `app/src/combat/move/MoveDefinition.ts` | 招式 JSON 解析 |
| **APP-GUI** | `app/src/debug/DebugGui.ts` | lil-gui |
| **APP-CONST** | `app/src/config/constants.ts` | walkSpeed 等默认 |
| **DATA-5LP** | `app/public/data/moves/ryu_5lp.json` | 样板招 |
| **SO-SCRUB** | 仓内注释 + 外部 SO（见下） | scrub 时禁止依赖 paused 的 mixer.setTime |

### 1.2 外部公开数据（必须抄入本地，禁止只链外网）

| ID | 来源 | 本方案采用的数字（隆 Ryu；**写入本地后以本地为准**） |
|----|------|------------------------------------------------------|
| **SC-MOVE** | [SuperCombo SF6/Movement](https://wiki.supercombo.gg/w/Street_Fighter_6/Movement) | 走首帧 **1/4** 速度；prejump 多数 **4f**；landing **3f** |
| **SC-RYU** | [SuperCombo SF6/Ryu](https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu) / Data | 前走 **0.047**、后走 **0.032**；前冲 **19f / 距离 1.252**；后冲 **23f / 0.923**；跳 **4+38+3**；顶点高 **2.115**；前跳距 **1.90**、后跳 **1.52** |
| **CAP-FD** | [Capcom Ryu Frame Data](https://www.streetfighter.com/6/en-us/character/ryu/frame) | 出招 startup/active/recovery 对照（不提供自位移曲线） |
| **MUGEN-AIR** | [Elecbyte AIR](https://www.elecbyte.com/mugendocs-11b1/air.html) | 动画元素以 **game-ticks** 计时；looptime=元素时间之和（工程类比，不移植格式） |

### 1.3 外部技术 / 开源（语义参考，在本仓重写）

| ID | 来源 | 用法 |
|----|------|------|
| **SO-MIXER** | [SO: manually control animation frame by frame](https://stackoverflow.com/questions/53004301/how-to-manually-control-animation-frame-by-frame) | 逐帧控制 AnimationAction |
| **THREE-AA** | [AnimationAction docs](https://threejs.org/docs/#api/en/animation/AnimationAction) | `paused`、`time`、`setEffectiveWeight`；**paused 时 effectiveTimeScale=0** |
| **THREE-MIX** | [AnimationMixer](https://threejs.org/docs/#api/en/animation/AnimationMixer) | `update(delta)`；固定姿势用 `update(0)` |
| **THREE-CCDIK** | 本仓依赖 `three` → `examples/jsm/animation/CCDIKSolver.js`（[docs CCDIKSolver](https://threejs.org/docs/#examples/en/animation/CCDIKSolver)） | **可选**腿部 IK；本方案 **P0 优先世界坐标钉脚**，P1 才允许 CCDIK |
| **THREE-DISC-RM** | [three.js discourse: root motion loop](https://discourse.threejs.org/t/looping-skinned-mesh-animation-with-root-motion/5116) | root 位移从 clip 抽出、in-place 播动画的讨论 |
| **UE-RM** | [Unreal Root Motion](https://dev.epicgames.com/documentation/unreal-engine/root-motion-in-unreal-engine) | 概念：位移通道与 pose 分离（不引入 UE） |
| **U-RM** | [Unity Root Motion manual](https://docs.unity3d.com/Manual/RootMotion.html) | Root Transform XZ 与 Bake Into Pose 概念 |
| **GH-SPIDER** | [majidmanzarpour/threejs-procedural-spider](https://github.com/majidmanzarpour/threejs-procedural-spider) | 双骨解析 IK + **世界系 plant 脚**语义（仅概念；不拷蜘蛛） |
| **GH-IKEMEN** | [Ikemen-GO](https://github.com/ikemen-engine/Ikemen-GO) | 状态时间 vs anim 时间概念；不移植 |
| **GAFFER** | [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) | 逻辑固定步；表现可插值（本仓已有 FrameClock） |

**禁止当权威**：SF6 二进制再分发；把 glb 时长当出招 total；运行时 root motion 直接改逻辑 `x` 且不写表。

---

## 2. 目标架构（固定）

```
Input → MatchSim.step (60Hz)
          │
          ├─ Fighter: phase, locoPhase, localFrame/stateTimer, x, facing, clipBinding
          │            MovePlayer: moveFrame / frames.total / selfMovement[]
          │            读本地: movement_ryu.json + move JSON
          │
          └─ snapshot → FighterView.syncFromLogic
                          │
                          ├─ resolve clip by logicId + role (LogicGlbMap.pathForRole)
                          ├─ scrub: action.time = f(localFrame) ; mixer.update(0)
                          ├─ idle: mixer.update(wallDt) 仅 idle（§3.7）
                          ├─ plantFeet: OFF idle/walk；attack 用 plant 窗
                          └─ foot lock (attack only): 钉支撑脚世界 XZ
```

**分层铁律**

| 层 | 写什么 | 不写什么 |
|----|--------|----------|
| 逻辑 | `x`、phase、localFrame、命中 | 骨骼、AnimationAction |
| 表现 | 姿势、clip role、脚 IK/钉脚 | 不得在未写表时改逻辑 `x` |

---

## 3. 分阶段步骤（按序执行）

### Step 0 — 公开移动数据落本地（§6.7 / §3.10）

**理论依据**：C-CC-67、C-CC-310、SC-MOVE、SC-RYU、C-SRC。

**实现**

1. 新建人类可读 + 机器可读：  
   - `docs/character-control/action-tables/sourced-movement/ryu-movement.md`（出处、日期、单位说明）  
   - `docs/character-control/action-tables/sourced-movement/ryu-movement.json`  
   - 同步运行时：`app/public/data/systems/ryu_movement.json`（与 docs 内容数字一致）

2. JSON **固定 schema**（字段名不可自创别名）：

```json
{
  "characterId": "ryu",
  "retrieved": "2026-08-11",
  "sources": [
    {
      "id": "SC-MOVE",
      "url": "https://wiki.supercombo.gg/w/Street_Fighter_6/Movement",
      "notes": "walk first frame 1/4; prejump; landing"
    },
    {
      "id": "SC-RYU",
      "url": "https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu",
      "notes": "Ryu walk/dash/jump numbers"
    }
  ],
  "units": {
    "logicSpace": "SF6 wiki character units as published; same as combat x before worldScale",
    "frameHz": 60
  },
  "walk": {
    "forwardSpeed": 0.047,
    "backSpeed": 0.032,
    "firstFrameSpeedScale": 0.25
  },
  "dash": {
    "forward": { "frames": 19, "distance": 1.252 },
    "back": { "frames": 23, "distance": 0.923 }
  },
  "jump": {
    "prejumpFrames": 4,
    "airFrames": 38,
    "landingFrames": 3,
    "apexHeight": 2.115,
    "forwardDistance": 1.9,
    "backDistance": 1.52,
    "neutralDistance": 0
  }
}
```

3. 加载器：`app/src/data/loadRyuMovement.ts`  
   - `fetch('/data/systems/ryu_movement.json')`  
   - 校验 number 有限；失败 throw，禁止静默默认冒充 wiki。

4. `MatchSim` / `constants`：**默认 walk/dash/jump 参数从该 JSON 注入**；GUI 可覆盖（见 §5）。

**冲刺速度推导（必须写进代码注释 + md）**  
- 公开表给的是 **总帧 + 总距离**，非逐帧曲线。  
- 本方案 **P0 匀速近似**（无更细公开曲线时的标准做法）：  
  - `dashSpeedFwd = distance / frames` → `1.252/19`  
  - `dashSpeedBack = 0.923/23`  
- 依据：SC-RYU 距离与帧；匀速是 **可审查占位**，在 `ryu-movement.md` 标明 `approx: uniform`。

**跳跃竖直（P0）**  
- 使用 `prejumpFrames=4`、`airFrames=38`、`landingFrames=3`（SC-RYU Jump Speed `4+38+3`）。  
- 水平：前跳总位移 `1.90`、后跳 `1.52`、中性 `0`，**空中段匀速分配**（同样标 approx）。  
- 竖直：用简单抛物线使 `apexHeight≈2.115`：  
  - 空中段帧索引 `i=0..airFrames-1`，中点附近达顶点；  
  - 公式固定为：`y = 4 * apex * t * (1-t)`，`t=(i+0.5)/airFrames`（标准单峰抛物，注明非官方物理曲线）。  
- **禁止**用 glb 播完决定落地帧。

**验收**  
- [ ] 文件存在且含 sources.retrieved  
- [ ] 启动后 `match.opts.walkSpeed` 等与 JSON 一致（GUI 未改时）  
- [ ] 单测：JSON parse + `1.252/19` 常量

**单测路径**：`app/tests/combat/movementTable.test.ts`

---

### Step 1 — LogicGlbMap 多 role 解析（§3.8）

**理论依据**：C-MAP 已列 start/loop/end、prejump/air/land；APP-LGM 现状只 `primaryPath`。

**实现**

1. 扩展 `app/src/data/logicGlbMap.ts`：

```ts
// 必须实现（语义）
pathForRole(logicId: string, role: string): string | null
// 查找顺序：clips.find(c => c.role === role) → null
// 禁止再把 walk 的 start 当 loop

urlForRole(logicId: string, role: string): string | null
// urlForAnimsRelPath(pathForRole(...))

listRoles(logicId: string): string[]
```

2. `primaryPath` **保留**作 fallback，但 walk/jump **调用方必须传 role**。

3. `FighterView.ensureLogicClip`：键改为 `` `${canonical}::${role}` `` 缓存 action，避免 start/loop 互相覆盖。

**参考**：C-MAP `walk_fwd` roles start/loop/end；`jump_n` prejump/air/land。

**验收**  
- [ ] 单测：map JSON 中 `walk_fwd` 三 role 路径不同  
- [ ] 加载 `walk_fwd::loop` 与 `walk_fwd::start` 为两个 action

---

### Step 2 — 逻辑位移状态机：走路三段 + 跳相位（§3.8 / §3.10）

**理论依据**：C-CC-38 多段按逻辑阶段；SC-MOVE 走首帧 1/4；APP-FT/APP-SIM 现只有 phase 与常量 walk。

**实现**

1. 扩展 `app/src/combat/types.ts`（或同文件新类型）：

```ts
export type LocoPhase = 'none' | 'start' | 'loop' | 'end';
export type JumpPhase = 'none' | 'prejump' | 'air' | 'land';
```

2. `Fighter` 增加字段（名称固定）：

| 字段 | 类型 | 含义 |
|------|------|------|
| `locoPhase` | LocoPhase | 走路段 |
| `locoFrame` | number | 本段 0-based 逻辑帧 |
| `locoDir` | -1 \| 0 \| 1 | 相对前进：前=+facing 世界符号在 sim 算 |
| `jumpPhase` | JumpPhase | 跳段 |
| `jumpFrame` | number | 本段帧 |
| `jumpHorizSign` | -1\|0\|1 | 中/前/后跳 |
| `animRole` | string | 当前表现 role：`main`\|`start`\|`loop`\|`end`\|`prejump`\|`air`\|`land` |
| `clipId` | string | 逻辑 id：`walk_fwd` / `jump_f` / `throw_fwd` 等 |

3. **走路规则（精确）** — 写在 `MatchSim` 或新 `app/src/combat/loco/WalkController.ts`：

| 事件 | 行为 |
|------|------|
| `canAct` 且意图 walk 前/后，且 locoPhase∈{none,end} | → `start`，`locoFrame=0`，`clipId=walk_fwd\|walk_back`，`animRole=start` |
| `start` 且 `locoFrame+1 >= START_FRAMES` | → `loop`，`locoFrame=0`，`animRole=loop` |
| `loop` 且仍按住同向 | 保持 loop；`locoFrame` 递增（可对 loop 长度取模） |
| 松手或方向变为非走 | → `end`，`locoFrame=0`，`animRole=end`（**不可**再加速；位移可用 end 表速度或 0——**P0：end 段水平速度=0**） |
| `end` 且帧满 | → idle，`locoPhase=none`，`clipId=idle`，`animRole=main` |
| start/loop 中再次同向 | 保持；反向：P0 直接进新向 `start` |

**START_FRAMES / END_FRAMES / LOOP_FRAMES 来源**（禁止拍脑袋）：  
- 从 C-MAP 条目 `frameCount` 读取：  
  - walk_fwd start **19**、loop **114**、end **47**（见 `ryu-logic-to-glb-map.md`）  
  - walk_back start **15**、loop（map 内 loop 文件）、end（map）  
- 写入 `ryu_movement.json` 的 `walk.clipLogicFrames` **或** 运行时读 map 的 `frameCount`。  
- **逻辑段长 = map.frameCount**（与 glb 标注一致）；若与「手感」冲突，只改本地 map/表，不在代码写魔法数。

**速度（每逻辑帧）**  
```
base = dirIsForward ? walk.forwardSpeed : walk.backSpeed
scale = (locoPhase==='start' && locoFrame===0) ? firstFrameSpeedScale : 1
if (locoPhase==='end') scale = 0  // P0
x += worldSign * base * scale
```
依据：SC-MOVE 首帧 1/4；SC-RYU 速度。

4. **跳跃规则**  

| 段 | 帧数源 | clipId | animRole | 位移 |
|----|--------|--------|----------|------|
| prejump | jump.prejumpFrames | jump_n/f/b | prejump | x 不变，y=0 |
| air | jump.airFrames | 同上 | air | 水平匀速累计至总距离；y 抛物 |
| land | jump.landingFrames | 同上 | land | x 不变；y=0 |

- `Fighter.startJump` **必须**根据输入 relDir 设 `jump_n` / `jump_f` / `jump_b`（现实现写死 `jump_n`——**必须改**）。  
- 意图 `jump` 时：9→f，7→b，8→n（相对面向）。  
- 落地后 `canAct` 规则保持现有；landing 期间不可走（与 SC-MOVE landing recovery 一致的简化）。

5. **投技表现（§3.8）**  
- 指令已有 LP+LK 时：`phase='attack'` **或** 专用 `phase` 仍用 attack + move 占位。  
- **最小**：`MoveDefinition` 或硬编码 `throw_fwd` / `throw_back`：  
  - `frames.total`：来自 map frameCount（throw_fwd **122**、throw_back **127**）或单独 JSON  
  - `clipId`：`throw_fwd` / `throw_back`  
  - **无 hitbox 结算、无抓取**（共识）  
- `MovePlayer.advance` 走完回 idle。  
- 若无 move JSON：允许 `app/public/data/moves/ryu_throw_fwd_placeholder.json` 标 `review.status=placeholder`。

**验收**  
- [ ] 按住前：clip 顺序 start→loop；HUD 显示 locoPhase  
- [ ] 松手：end 后 idle  
- [ ] 跳：prejump 4f → air 38f → land 3f；前跳水平总位移在 ±5% 内接近 1.90（逻辑单位）  
- [ ] LP+LK：播放 throw clip，逻辑帧走完回 idle，不判定抓取  
- [ ] 单测：WalkController 相位转换纯函数；Jump 水平积分

**单测**：`app/tests/combat/walkPhases.test.ts`、`jumpDisplacement.test.ts`

---

### Step 3 — 表现：逻辑帧 scrub 统一（§3.7）

**理论依据**：C-CC-37；THREE-AA（paused ⇒ effectiveTimeScale 0）；APP-VIEW 已有 `scrubActionTo` 注释禁止 `mixer.setTime` 在 paused 下推进；SO-MIXER。

**实现（固定算法）**

1. 新建 `app/src/render/AnimScrub.ts`（纯函数，可单测）：

```ts
/**
 * logicFrame: 0-based local frame within segment
 * logicTotal: segment length in frames (>=1)
 * clipDurationSec: AnimationClip.duration
 * mode: 'uniform' | 'truncate'
 *
 * C-CC-37: 一格对应画面进度；收招看逻辑不看 clip 播完。
 * default mode = 'uniform'（整段姿势压进 logicTotal）
 * truncate: t = min(logicFrame, last) / sampleRate — 仅当 clip 以 60fps 采样且 frameCount≈duration*60
 */
export function logicFrameToClipTime(
  logicFrame: number,
  logicTotal: number,
  clipDurationSec: number,
  mode: 'uniform' | 'truncate' = 'uniform',
): number
```

- **uniform（默认）**：`u = clamp(logicFrame / max(logicTotal,1), 0, 1-eps)`；`t = u * clipDuration`  
- **truncate**：假设源按 60Hz 采样：`sampleCount = max(1, round(clipDuration*60))`；`t = min(logicFrame, sampleCount-1) / 60`；若 logicTotal < sampleCount，只播前 logicTotal 格。  
- GUI 可选 mode（§5）；**默认 uniform**（与现 `moveFrame/total * duration` 一致并推广到全状态）。

2. `FighterView.syncFromLogic` **重写分支**（禁止再对 dash/jump free-run wall clock，除非 cfg 显式关闭 scrub——默认开）：

| phase / 条件 | 时钟 | role |
|--------------|------|------|
| attack / throw 占位 | `mover.moveFrame` / `mover.total` | map role `main` 或 start/end 按招 |
| walk | `locoFrame` / 本段 total | animRole |
| prejump/air/land | `jumpFrame` / 本段 total | animRole |
| dash | `dashFrames - stateTimer` 或 elapsed / dash.frames | `main` |
| idle / crouch | **wallDt** `mixer.update`（§3.7 待机自由循环） | main/loop |
| hitstun/blockstun | 优先 scrub（stun 剩余反推或正向帧）；P0 可用 free-run **仅当**无 total——本方案要求 stun 也有固定帧，用 scrub |

3. **scrub 调用序列（必须照抄语义，APP-VIEW 已验证）**：

```ts
action.enabled = true;
action.paused = true;
action.time = t; // clamp 到 [0, duration-eps]
action.setEffectiveWeight(1);
mixer.update(0);
// 禁止：paused 时依赖 mixer.setTime 推进 action.time（THREE-AA）
```

4. `playBest`：切换 ``clipId+role`` 时 `stopAllAction` + 绑定对应 action；**同一 binding 不每帧 reset**。

5. `cfg.scrubFromLogic`：true 时走表；false 仅调试对比（保留）。

**验收**  
- [ ] 5LP：逻辑 total 结束瞬间回 idle，与 clip 是否播完无关  
- [ ] 120Hz 显示器：攻击 scrub 不加倍（已有 wallDt 与逻辑分离）  
- [ ] 单测：`logicFrameToClipTime` 边界 0、total-1、total  

**单测**：`app/tests/render/animScrub.test.ts`（纯函数，不启 WebGPU）

---

### Step 4 — 待机止抖：关闭有害 plant（§3.9）

**理论依据**：C-CC-39；APP-VIEW `plantFeetOnGround` 每帧最低脚贴地 → 左右脚交替导致 Y 抖（本仓已知问题）。

**实现**

1. 将 `plantFeetOnGround` 拆为策略：

| 模式 | 何时 | 行为 |
|------|------|------|
| `off` | idle、walk、crouch（默认） | **不调用**每帧 plant |
| `onClipChange` | 刚切换到 idle 的第一帧 | 调用 **一次** plant 或 `snapRootYOnce` |
| `attackPlant` | attack 且 plant 窗激活 | 见 Step 6 |

2. 配置：`cfg.plantMode: 'legacy' | 'consensus'`  
   - 默认 **`consensus`**（off + onClipChange）  
   - `legacy` = 旧每帧 plant（仅对比调试）

3. 禁止在 idle 使用「遍历全部 Foot/Toe 取 minY」每帧改 `modelRoot.position.y`。

**验收**  
- [ ] 待机 5s 录屏/观察：脚不再每帧上下跳  
- [ ] GUI 切 legacy 可复现旧抖（证明开关有效）

---

### Step 5 — 攻击自身位移：从动画估计 + 表驱动（§3.10）

**理论依据**：C-CC-310；CAP-FD 无自位移曲线；THREE-DISC-RM / UE-RM / U-RM（root 与 pose 分离概念）；位移逻辑单写者。

#### 5.1 离线估计工具（Node 或 Vite 脚本，非运行时猜数）

路径：`tools/estimate_root_motion/estimate_move_dx.mjs`（或 `app` 下 ts-node，二选一，**固定一种**写清 package script）。

**算法（必须实现如下，禁止改成「肉眼填」作为唯一路径）**：

1. 用 `GLTFLoader`（three 官方 addons，与 APP-VIEW 相同）加载招式 glb。  
2. 取 clip；找 root 候选轨（按名优先）：  
   - `Hips` / `hips` / `Root` / `root` / `COG` / 轨道名含 `position` 的最高级骨  
   - 与 RE 提取骨骼名对齐：以 `private` 样例 glb 实际 track 名为准（脚本打印 tracks 列表）。  
3. 对 `i = 0 .. logicTotal-1`：  
   - `t = logicFrameToClipTime(i, logicTotal, duration, 'uniform')`  
   - 采样该时刻 root 水平位置（模型局部 X 或 Z——**以角色前进轴为准**；本仓 FighterView 使用 `rotation.y = π/2` 与 scale.z 镜像，估计脚本在 **动画局部空间** 取「角色前向」轴，写入 JSON 时转为 **逻辑 x 增量，前进为正**）。  
4. `dx[i] = pos[i] - pos[i-1]`（i=0 为 0）；再乘 `unitScale`（与 mesh 归一化一致的可配置系数，默认先 1，用 GUI/`worldScale` 对照调）。  
5. 输出：

```json
{
  "moveId": "ryu_2hk",
  "logicTotal": 35,
  "method": "gltf_root_delta_uniform_scrub",
  "sourceGlb": "...",
  "selfMovement": [0, 0.01, ...],
  "notes": "estimate; tune in review"
}
```

6. 人工审查后合并进 `app/public/data/moves/ryu_2hk.json`（及 5LP 全 0）。

**参考实现线索**（重写，不 vendor）：  
- THREE KeyframeTrack 插值：`track.createInterpolant()` 官方用法  
- Discourse root motion 抽出讨论 THREE-DISC-RM  

#### 5.2 运行时

1. 扩展 `MoveDefinition`：

```ts
selfMovement?: number[]; // length 建议 == total；缺省 = 全 0
// 另预留（可空不实现结算）：
// pushbackHit?: number; pushbackBlock?: number;
```

`parseMoveDefinition` 读取数组；长度不足则后续帧 0。

2. `MovePlayer.advance` 或 `Fighter.advance` attack 分支：

```ts
const dx = move.selfMovement?.[moveFrame] ?? 0;
fighter.x += fighter.facing * dx;
// 在 moveFrame 递增之后或之前必须固定：采用「进入本帧时应用 selfMovement[moveFrame]」
// 单测锁死顺序；本方案规定：advance 开头用当前 moveFrame 取 dx，再 moveFrame++
```

3. **表现**：攻击 clip 水平 root **Bake into pose / 忽略**：  
   - P0：scrub 后把 root/hips 的 **世界水平** 相对绑定姿势清零——若轨道含位移，在 `prepare` 时剥离 position 轨的 XZ（工具预烘焙 in-place glb）**或** 每帧 scrub 后将 hips 本地 XZ 锁到帧 0。  
   - **推荐 P0**：估计时用原 glb；运行时 glb 若含 root，**仍只信 selfMovement**；`FighterView` 在 attack 下对 root 骨 `position.x/z` 乘 0 相对首帧（钉 pose）——实现放 `render/rootPoseLock.ts`。

4. 样板数据：  
   - `ryu_5lp.json`：`selfMovement` 全 0 或省略  
   - `ryu_2hk.json`：先跑估计脚本再人工改；无 2HK 帧表则先建 placeholder total 与公开帧对齐（CAP-FD / SC 2HK startup 9 等）

**验收**  
- [ ] 5LP 出招逻辑 x 不变（容差 1e-6）  
- [ ] 2HK placeholder：x 随 selfMovement 变；关闭 selfMovement 则不变  
- [ ] 单测：MovePlayer/Fighter 应用 dx 顺序  

---

### Step 6 — 出招支撑脚（§3.9）

**理论依据**：C-CC-39 仅出招；GH-SPIDER 世界系 plant；Unity Animation Rigging foot plant 概念；THREE-CCDIK 可选。

**P0 算法（钉世界位置，不用完整 CCD 也可验收）**

1. 数据字段（招式 JSON 或旁路 `plant`）：

```json
"plant": {
  "foot": "L" | "R",
  "fromFrame": 0,
  "toFrame": 12
}
```

- 踢类默认：支撑脚为 **非踢腿**（2HK 等需人工标；无数据则 plant 关闭）。  
- **禁止**对 walk/idle 写 plant。

2. `FighterView` 在 attack scrub **之后**：

```
if (cfg.footPlantEnabled && inPlantWindow):
  if first frame of window: store supportFootWorldXZ
  else: two-bone or direct: set foot bone world XZ = stored; keep Y ground
  updateMatrixWorld
```

3. **P0 实现选择（固定为 A，P1 才 B）**  
   - **A. 直接钉 foot 骨世界 XZ**（可能拉伸骨骼，可接受为中间态）  
   - **B. `CCDIKSolver`**（`three/addons/animation/CCDIKSolver.js`）：配置 hip→knee→foot 链；`solver.update()` 在 plant 后调用。骨骼名必须从实际 glb 打印，禁止猜。  

4. 与 Step 4 关系：attack 不用 legacy minY plant；改用 plant 窗。

**验收**  
- [ ] 有 plant 的招：窗内支撑脚世界 X 标准差低于阈值（调试绘点）  
- [ ] idle 无 plant  
- [ ] GUI 可关 `footPlantEnabled`  

---

### Step 7 — 接线预加载与 HUD（§3.8）

**实现**

1. `BOOT_PRELOAD_LOGIC_IDS`（`logicGlbMap.ts`）必须包含：  
   `idle, walk_fwd, walk_back, crouch, jump_n, jump_f, jump_b, dash_fwd, dash_back, throw_fwd, throw_back, ryu_5lp`（及已有 combat 集）  
2. 预加载时对多 role：**每个 role 各 load 一次**（start/loop/end 或 prejump/air/land）。  
3. `HudDom` / debugProbe 增加只读：  
   - `p1LocoPhase`、`p1AnimRole`、`p1JumpPhase`、`p1MoveFrame`、`p1SelfDx`  

**验收**：冷启动后跳/走/投不出现长时间 T-pose（允许首帧异步，但第二次应命中缓存）。

---

### Step 8 — 调试面板（强制公开参数）

在 `DebugGui.ts` 用 **lil-gui**（现栈）增加文件夹，**下列键名必须存在**（可分组）：

#### 文件夹 `移动表 (ryu_movement)`

| 控件 | 绑定 | 说明 |
|------|------|------|
| `walkForwardSpeed` | cfg / movement 覆盖 | 默认 0.047 |
| `walkBackSpeed` | | 默认 0.032 |
| `walkFirstFrameScale` | | 默认 0.25 |
| `dashFwdFrames` | | 19 |
| `dashFwdDistance` | | 1.252 → 重算 speed |
| `dashBackFrames` | | 23 |
| `dashBackDistance` | | 0.923 |
| `prejumpFrames` | | 4 |
| `airFrames` | | 38 |
| `landingFrames` | | 3 |
| `jumpApex` | | 2.115 |
| `jumpFwdDist` / `jumpBackDist` | | 1.9 / 1.52 |
| `reloadMovementJson` | button | 重新 fetch 本地 JSON |

#### 文件夹 `动画驱动`

| 控件 | 说明 |
|------|------|
| `scrubFromLogic` | 已有；保持 |
| `scrubMode` | `uniform` \| `truncate` |
| `plantMode` | `consensus` \| `legacy` |
| `footPlantEnabled` | bool |
| `showFootDebug` | 绘支撑脚世界点 |
| `rootPoseLockAttack` | attack 时锁 hips XZ 相对首帧 |
| `timeScaleAnim` | 已有则保留；**不得**改变逻辑帧率 |

#### 文件夹 `位移调试`

| 控件 | 说明 |
|------|------|
| `applySelfMovement` | bool，关则攻击 dx=0 |
| `selfMovementScale` | 乘在 selfMovement 上，默认 1 |
| `logSelfDx` | 每逻辑帧 console 当前 dx |

#### 只读 listen

| 字段 |
|------|
| `p1Phase` `p1LocoPhase` `p1AnimRole` `p1JumpPhase` `p1ClipId` `p1MoveFrame` `p1X` |

**依据**：现有 DebugGui 模式；共识可调试 H2。

---

## 4. 技术陷阱与规避（互联网/官方 + 本仓）

| 陷阱 | 来源 | 本方案规避 |
|------|------|------------|
| `paused` 时 `effectiveTimeScale=0`，`mixer.setTime` 不推进 action | THREE-AA；APP-VIEW 注释 | 只设 `action.time` + `mixer.update(0)` |
| 显示 120Hz 用固定 1/60 推进 loop → 动画加速 | APP-VIEW 注释；GAFFER | idle 用 wallDt；攻击用逻辑 scrub |
| clip 时长当出招结束 | C-CC-37 否决 | MovePlayer.total 结束 |
| 每帧 lowest-foot plant → idle 抖 | 本仓现象；C-CC-39 | plantMode=consensus |
| 逻辑 dx + 动画 root 双计 | C-CC-310；U-RM Bake | rootPoseLock + 表驱动 dx |
| wiki 距离单位与 mesh 单位混用 | 实践常见 | movement JSON 声明 units；selfMovementScale GUI |
| map 只取 primary → 走路永远 start | APP-LGM | pathForRole |
| jump clipId 写死 jump_n | APP-FT | 按方向 jump_f/b |
| CCDIK 骨骼名错误致爆炸 | THREE-CCDIK 使用前提 | P0 不用 CCD；P1 打印骨骼再绑 |
| 冲刺只有总距离无曲线 | SC-RYU | 匀速 approx 写进 md |
| 异步 ensureLogicClip 竞态旧请求覆盖新 clip | 常见 loader 坑 | 请求令牌 / 比较 currentClip+role |
| hitstop 时逻辑停、动画仍 wall 走 | FG 常见 | hitstop 期间 attack 保持 scrub 到冻结帧（与现 MatchSim skip advance 一致） |
| scale.z 镜像后脚世界 X 符号反 | APP-VIEW facing | plant 存世界坐标，钉世界而非本地 |

**社群结论摘要**  
- Root motion：引擎侧普遍 **抽出位移给 gameplay，pose in-place**（Unity/UE/three discourse）。  
- Foot lock：世界落点 + 腿 IK 或直接约束；本方案攻击窗内锁定。  
- FG 帧：MUGEN AIR 证明 **tick 驱动元素**，与「clip 秒数驱动逻辑」相反。

---

## 5. 文件变更清单（允许创建/修改）

| 路径 | 操作 |
|------|------|
| `docs/character-control/action-tables/sourced-movement/ryu-movement.{md,json}` | 新建 |
| `app/public/data/systems/ryu_movement.json` | 新建（与上同步） |
| `app/src/data/loadRyuMovement.ts` | 新建 |
| `app/src/data/logicGlbMap.ts` | 扩展 role API |
| `app/src/combat/types.ts` | loco/jump 类型 |
| `app/src/combat/fighter/Fighter.ts` | 字段与 jump 方向 |
| `app/src/combat/loco/WalkController.ts` | 新建（推荐） |
| `app/src/combat/match/MatchSim.ts` | 走/跳/投接线 |
| `app/src/combat/move/MoveDefinition.ts` | selfMovement/plant |
| `app/src/combat/move/MovePlayer.ts` | 可选：暴露 frame 供 dx |
| `app/public/data/moves/ryu_5lp.json` | selfMovement 0 |
| `app/public/data/moves/ryu_2hk.json` 等 | 估计后写入 |
| `app/public/data/moves/ryu_throw_*_placeholder.json` | 新建 |
| `app/src/render/AnimScrub.ts` | 新建 |
| `app/src/render/FighterView.ts` | scrub/plant/role |
| `app/src/render/rootPoseLock.ts` | 新建 |
| `app/src/debug/DebugGui.ts` | §3 面板 |
| `app/src/config/constants.ts` | 新 cfg 键 |
| `app/src/render/HudDom.ts` | 只读字段 |
| `tools/estimate_root_motion/*` | 新建估计脚本 |
| `app/tests/combat/*.ts` `app/tests/render/animScrub.test.ts` | 新建 |

**禁止**：改 `docs/character-control/consensus-design-v0.md` 共识正文（除非新对话确认）；在 `combat/` import three。

---

## 6. 建议提交顺序（原子可验收）

1. Step 0 移动表 + 加载 + 单测  
2. Step 1 map role API + 单测  
3. Step 3 AnimScrub + FighterView 攻击/有限状态 scrub 统一（不破坏 5LP）  
4. Step 4 plantMode 止抖  
5. Step 2 走路三段 + 跳相位 + 位移用表  
6. Step 7 预加载 + HUD  
7. Step 5 selfMovement 管线 + 5LP/2HK  
8. Step 6 foot plant  
9. Step 8 GUI 收齐  

每步可独立 PR/提交；前一步红测不得进下一步。

---

## 7. 总验收清单（四大问题）

| 问题 | 验收 |
|------|------|
| **1 映射** | 跳三向、投两向、走三段均能进入正确 role 动画；超杀未接可接受 |
| **2 逻辑帧** | 出招/走段/跳段画面跟 localFrame；结束跟逻辑 total；待机可循环且不抖（配合 4） |
| **3 脚** | 待机不抖；走路三段+速度表；出招 plant 窗内支撑脚不滑；走路无 plant |
| **4 位移** | 走冲跳数字来自本地 JSON；攻击 dx 来自估计表；逻辑 x 单写；公开出处在 sourced-movement |

---

## 8. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-11 | 初版：对齐 §3.7–3.10 / §6.7；绑定 three scrub/CCDIK、SuperCombo 数字、本仓路径与陷阱 |

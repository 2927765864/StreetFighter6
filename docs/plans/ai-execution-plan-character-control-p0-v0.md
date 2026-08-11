# AI 可执行方案：角色控制 P0（输入 · 三层缓冲 · 状态机 · cancel · 动画接线）

> **文档类型**：给 **AI / 人类执行者** 的实现规范（非共识、非排期口号）  
> **节点**：2026-08-10 · 对齐  
> - `docs/character-control/consensus-design-v0.md` §1–4、§6  
> - `docs/research/sf6-character-control-research-2026-08-10.md`  
> - `docs/research/character-control-implementation-cases-2026-08-10.md`  
> - `docs/character-control/action-tables/schema-move-table.md`  
> - 现仓 `app/src/combat/*`（5LP MVP 已可跑）  
> **目标切片（P0）**：训练场内，**逻辑表驱动** 的  
> 1) 全六键边沿 + 面向相对方向  
> 2) 三层预输入（Action 4f / Motion 历史 / Cancel 窗消费）  
> 3) 指令识别：5/2 普攻 + 66/44 dash + **一条** special（236+P Hadoken LP）  
> 4) 5LP cancel 窗内可打断进 Hadoken  
> 5) Hitstop 最小实现  
> 6) Jump / Dash **最小状态**（可不接完整空中攻击）  
> 7) `moveId/clipId` 经 **logic→glb 映射表** 或现有 `clip_map` 切换表现（允许占位 clip）  
> **明确不做（P0）**：Modern、联网、完整 Drive、SA、真实逐帧盒挖矿、全招审查、投 tech 精修、DR 冻结相位。

---

## 0. 执行者硬性规则（违反即停）

1. **禁止自我发挥架构**：只允许本文件列出的目录、类名、字段、配置键与引用仓库的**语义**（用 TypeScript **重写**，禁止粘贴版权美术 / 禁止 vendoring 整仓）。  
2. **逻辑权威 = 本地 JSON + 配置表**；`AnimationMixer` / clip 长度 **不得**决定 startup/active/recovery/cancel（共识 R2）。  
3. **`combat/` 禁止 `import 'three'`**；Three 仅在 `render/`、`main.ts`、`debug/`。  
4. **私有资源**：`private/` 不进 git 公开远程；运行时加载路径遵守既有 Vite alias / 现有 `ryuAnimAssets` 插件。  
5. 每步结束必须满足该步 **验收标准** + 列出的 **单测**；缺依赖写 `BLOCKED:` 原因停工，不发明第二套方案。  
6. 改动现有 5LP 单测时：**保持行为可解释**；破坏旧测必须同步改断言并在 PR/提交说明写原因。  
7. 遗漏项（§O）**只登记、不在 P0 实现**，除非本文件某步显式引用。

---

## 1. 权威依据总表（全文引用 ID）

| ID | 依据 | 用途 |
|----|------|------|
| C-CC | `docs/character-control/consensus-design-v0.md` §1–4、§6 | 输入、三层缓冲、FSM、cancel、盒 |
| C-SCHEMA | `docs/character-control/action-tables/schema-move-table.md` | 字段、缓冲默认、cancel windows |
| C-CMD | `docs/character-control/action-tables/ryu-command-list-classic.md` | 指令 ↔ moveId |
| C-MAP | `docs/character-control/action-tables/ryu-logic-to-glb-map.md` + `app/public/data/clips/ryu_logic_to_glb_map.json` | 动画映射 |
| C-NOTATION | `docs/character-control/action-tables/notation.md` | cancel 记法 |
| R-SF6 | `docs/research/sf6-character-control-research-2026-08-10.md` | 4f/7f、9f 间隙、例外 |
| R-CASES | `docs/research/character-control-implementation-cases-2026-08-10.md` | 开源案例索引 |
| ADR-001 | `docs/decisions/ADR-001-logic-fps-60.md` | 60 Hz |
| ADR-002 | `docs/decisions/ADR-002-box-center-convention.md` | 盒坐标 |
| ADR-003 | `docs/decisions/ADR-003-move-frame-indexing.md` | `moveFrame` 0-based active 公式 |
| T-GAFFER | https://gafferongames.com/post/fix_your_timestep/ | 固定步 + spiral |
| T-CRIT | https://critpoints.net/2025/02/05/how-to-code-fighting-game-motion-inputs/ | motion 缓冲与匹配 |
| T-ANDREA | https://andrea-jens.medium.com/i-wanna-make-a-fighting-game-a-practical-guide-for-beginners-part-6-311c51ab21c4 | buffer、优先级、cancel 列表 |
| T-SC | https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data | SF6 Input Buffer 4f/7f |
| T-FACE | CritPoints 同文「facing flip ±2」段 | 面向镜像 numpad |
| GH-MOTION | https://github.com/evilagram/Fightmans/blob/master/inputmotion.cs | motion 匹配参考实现 |
| GH-IKEMEN | https://github.com/ikemen-engine/Ikemen-GO | 状态/指令概念（不移植） |
| GH-SAKUGA | https://github.com/NoisyChain/Sakuga-Engine | 表驱动状态/盒概念（不抄 rollback） |
| GH-CASTAGNE | https://github.com/panthavma/castagne | 逻辑层与引擎分离 |
| GH-CHRIS | https://github.com/chriscourses/fighting-game | 最小攻击/受击闭环语义 |
| GH-BUF | https://github.com/drkitt/godot-input-buffer | Action buffer「过早输入延迟到可执行帧」 |
| GH-UEIN | https://github.com/M1m1c/StateAndInputSystemUE4 | 多帧 input → state machine |
| GH-SE | https://gamedev.stackexchange.com/questions/96576/how-to-implement-a-professional-fighting-game-input-buffer | 环形缓冲与消费 |
| SO-MIXER | https://stackoverflow.com/questions/53004301/how-to-manually-control-animation-frame-by-frame | Mixer 逐帧 |
| THREE-MIX | https://threejs.org/docs/#api/en/animation/AnimationMixer.setTime | `setTime` / scrub |
| T4-WEB | three#26626 / Threlte WebGPU Vite target esnext | 已有 `main` 用 `boot()`；勿破坏 |
| DATA-5LP | `app/public/data/moves/ryu_5lp.json` | 样板帧+cancel |
| DATA-HADO | `app/public/data/moves/generated/ryu_hadoken_lp.json` | special 样板 |
| DATA-IDX | `app/public/data/moves/ryu_index.json` | 招表索引 |
| APP-KB | `app/src/combat/input/KeyboardSource.ts` | 现输入 |
| APP-BUF | `app/src/combat/input/InputBuffer.ts` | 现历史环（保留为 motion 历史存储或重构） |
| APP-SIM | `app/src/combat/match/MatchSim.ts` | 步进编排 |
| APP-FT | `app/src/combat/fighter/Fighter.ts` | 相位 |
| APP-MP | `app/src/combat/move/MovePlayer.ts` | 帧推进 / active |
| APP-MD | `app/src/combat/move/MoveDefinition.ts` | **须扩展** 以解析 cancel.windows |
| APP-GUI | `app/src/debug/DebugGui.ts` | lil-gui |
| APP-CONST | `app/src/config/constants.ts` | 配置 |

**禁止引用当权威**：任意 SF6 二进制再分发；Sakuga rollback 模块进依赖；R3F 替换 vanilla Three 主路径。

---

## 2. 目标架构（固定；禁止另起体系）

在现有 `app/src/combat/` 上**增量**，不得改名整棵树为第二套架构。

```text
app/src/combat/
  types.ts                 # 扩展 InputSample、FighterPhase、Intent
  config/
    combatConfig.ts        # 缓冲默认（可被 GUI 覆盖的副本在 MutableSimConfig）
  input/
    KeyboardSource.ts      # 扩展：全键 just + 可选注入 facing
    InputHistory.ts        # 原 InputBuffer 升级：方向/按钮历史（层 B 存储）
    ActionBuffer.ts        # 层 A：意图 + TTL
    facing.ts              # worldDir → facing-relative numpad（T-FACE）
  command/
    CommandDef.ts          # 指令定义（motion 步骤 + 按钮掩码）
    MotionMatcher.ts       # 按 T-CRIT / GH-MOTION 语义匹配
    IntentResolver.ts      # 同帧优先级（C-CC §1.5）
    ryuCommands.ts         # P0 固定指令表（仅列表内招）
  move/
    MoveDefinition.ts      # 扩展 cancel.windows；load 适配 generated JSON
    MovePlayer.ts          # cancelWindowAt(frame)；hitstop 不在此偷帧
    MoveCatalog.ts         # 从 index 加载 moveId → MoveDefinition
  fighter/
    Fighter.ts             # 相位扩展；startMove；canAct；cancel 切入
  match/
    MatchSim.ts            # 唯一步进编排：采样→历史→意图→FSM→碰撞→hitstop
    DummyController.ts
  systems/
    DriveStub.ts           # 不动，仅保留
  boxes/ …
  frameClock.ts

app/src/config/constants.ts   # 增加缓冲键默认值
app/src/debug/DebugGui.ts     # §8 全部参数
app/public/data/
  systems/input_buffer.json   # 新建：4/7/9 等（运行时可读）
  moves/                      # 使用 5lp + hadoken；可选从 generated 复制审查副本
  clips/ryu_logic_to_glb_map.json

app/tests/combat/
  facing.test.ts
  motionMatcher.test.ts
  actionBuffer.test.ts
  intentResolver.test.ts
  cancelWindow.test.ts
  matchSim_buffer_5lp.test.ts
  matchSim_cancel_hado.test.ts
  matchSim_dash.test.ts
```

**MatchSim 每逻辑帧固定顺序（禁止打乱）** — 依据 C-CC §1–2 + T-ANDREA 消费时机：

1. 采样键盘 → `InputSample`（世界方向 + 按钮边沿）  
2. `facingRelativeDir = toFacingRelative(dir, p1.facing)`（T-FACE）  
3. `history.push`（层 B）  
4. 若 `hitstopTimer > 0`：递减；**仍 push 历史与 ActionBuffer 登记**；**位移/招式帧不推进**（R-SF6 §2.3 / 惯例）  
5. 否则：解析 Intent（读 history + 刚按下键）→ 写入 ActionBuffer 或即时执行  
6. 消费：若 `canCancel` 或 `canAct` → 按优先级执行 Intent（C-CC §1.5）  
7. 碰撞（active hit）  
8. `fighter.advance()`（attack/stun/dash/jump）  
9. 产出 `MatchSnapshot`（HUD）

---

## 3. 配置与数据（禁止魔法数散落）

### 3.1 新建 `app/public/data/systems/input_buffer.json`

```json
{
  "ACTION_BUFFER_STANDARD": 4,
  "ACTION_BUFFER_DASH": 7,
  "MOTION_STEP_GAP_MAX": 9,
  "DASH_DIR_HOLD_MAX": 8,
  "DASH_NEUTRAL_MAX": 8,
  "MOTION_HISTORY_CAPACITY": 32,
  "sources": [
    {
      "name": "SuperCombo SF6 Game Data Input Buffer",
      "url": "https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data",
      "note": "4f standard; 7f dash/wakeup"
    },
    {
      "name": "Gelatin / research motion gap ~9f",
      "via": "docs/research/sf6-character-control-research-2026-08-10.md"
    }
  ],
  "wakeup_buffer_frames_note": "Defense 页 10f 与 Game Data 7f 冲突 → P0 统一用 ACTION_BUFFER_DASH=7；见遗漏表 O-WAKE"
}
```

依据：C-SCHEMA §3、T-SC、R-SF6 §2.1。

### 3.2 `constants.ts` / `MutableSimConfig` 必须增加（GUI 可改）

| 键 | 默认 | 依据 |
|----|------|------|
| `actionBufferStandard` | 4 | T-SC |
| `actionBufferDash` | 7 | T-SC |
| `motionStepGapMax` | 9 | R-SF6 / C-CC |
| `dashDirHoldMax` | 8 | R-SF6 dash |
| `dashNeutralMax` | 8 | R-SF6 dash |
| `motionHistoryCapacity` | 32 | 实现容量（> gap×最长 motion） |
| `hitstopFramesOnHit` | 8 | **P0 占位默认**（非官方精确表；标 placeholder；可 GUI 调） |
| `hitstopFramesOnBlock` | 8 | 同上 |
| `enableCancel` | true | 调试开关 |
| `enableActionBuffer` | true | 调试开关 |
| `showBuffer` | 已有 | HUD |
| `showCancelWindow` | true | HUD 是否显示窗 |

### 3.3 招式数据加载规则

| 规则 | 说明 |
|------|------|
| P0 必载 | `ryu_5lp.json` + **一份** hadoken 运行时文件 |
| Hadoken 来源 | 以 `generated/ryu_hadoken_lp.json` 为输入；**复制**到 `moves/ryu_hadoken_lp.json`（或 `moves/runtime/`）并修 `parseMoveDefinition` 使 `frames.total` 合法：若 `recovery` null，用 `total - startup - active` 或 `startup+active+recovery` 重算（见坑 P-JSON） |
| 索引 | `MoveCatalog` 可读 `ryu_index.json` 但 **P0 只 register 白名单** moveId：`5LP`/`ryu_5lp`、`2LP`（可选）、`ryu_hadoken_lp`、dash 用**状态而非 move JSON** |
| cancel.windows | 5LP 已有 placeholder 窗；Hadoken windows 可空（被 cancel 进，自己不再 cancel） |
| 盒 | 保持 placeholder；**禁止**本步挖真盒 |

### 3.4 `MoveDefinition` 扩展（必须）

当前 `MoveDefinition.ts` **缺少** JSON 中的 `cancel.windows`。执行者必须：

```ts
// 语义对齐 C-SCHEMA / DATA-5LP
cancel: {
  specialCancel: boolean;
  superOnly?: boolean;
  targetCombo: string[];
  notes?: string;
  raw?: string;
  windows: Array<{
    fromFrame: number; // inclusive, moveFrame 0-based（ADR-003）
    toFrame: number;   // inclusive
    into: string;      // 例 "special|super|di|dr" 用 | 分割 token
  }>;
};
```

`parseMoveDefinition`：缺 `windows` 时默认 `[]`；若 `specialCancel===true` 且 windows 空，**不**自动发明全帧 cancel（C-CC §3.5 禁止 active 全开）；5LP 依赖 JSON 已有 windows。

`MovePlayer.isInCancelWindow(intoToken: string): boolean`：  
`moveFrame` 落在任一 window 且 `into` 含 token（`special` / `super` / …）。

---

## 4. 分步执行（严格顺序）

### Step 0 — 基线冻结与测试绿

**理论**：先保证 MVP 不烂再扩展（R-CASES / 既有 plan）。  
**动作**：

1. `cd app && npm test` 全绿。  
2. 记录当前 `MatchSim`/`KeyboardSource` 行为快照（5LP 命中）。  
3. **禁止**本步改玩法。

**验收**：`npm test` exit 0。

---

### Step 1 — 类型与配置加载

**理论**：C-CC §1–2；配置表驱动 R-SF6「禁魔法数」。  
**动作**：

1. 写 `public/data/systems/input_buffer.json`（§3.1）。  
2. 扩展 `MutableSimConfig` + `createDefaultSimConfig`（§3.2）。  
3. `loadJson` 启动时读 buffer JSON，写入 cfg（失败则用 constants 默认并 `console.warn`）。  
4. 扩展 `types.ts`：

```ts
// 按钮沿用 BTN_*；InputSample 改为：
export type InputSample = {
  dir: NumpadDir;           // 世界空间（键位）
  relDir: NumpadDir;        // 面向相对，由 MatchSim 填写
  buttons: number;          // held
  pressed: number;          // 本帧边沿 just-down 掩码
  released: number;         // 本帧 just-up 掩码（P0 可算可不消费）
};

export type FighterPhase =
  | 'idle' | 'walk' | 'crouch'
  | 'attack'
  | 'hitstun' | 'blockstun' | 'knockdown'
  | 'dash' | 'prejump' | 'airborne' | 'landing';

export type IntentKind =
  | 'none'
  | 'walk' | 'crouch' | 'jump'
  | 'dash_fwd' | 'dash_back'
  | 'normal'
  | 'special'
  | 'throw'      // P0 可不执行，可识别占位
  | 'drive';     // P0 不执行

export type Intent = {
  kind: IntentKind;
  moveId?: string;     // catalog key
  priority: number;    // 见 IntentResolver
  bufferClass: 'standard' | 'dash';
};
```

**参考**：C-CC §1.5 优先级数字写死在 `IntentResolver`：

| priority 高→低 | kind |
|----------------|------|
| 100 | special（P0 无 super） |
| 80 | throw（识别不执行可） |
| 60 | drive（不执行） |
| 40 | normal |
| 20 | dash |
| 10 | jump |
| 0 | walk/crouch |

**验收**：TS 编译通过；加载 JSON 单测或启动无抛。

---

### Step 2 — 键盘：全键边沿 + 面向相对

**理论**：C-CC §1.1–1.2；T-FACE facing flip。  
**动作**：

1. `KeyboardSource.sample()` 返回 `buttons` held + **计算 pressed**：  
   内部保存 `prevButtons`，`pressed = buttons & ~prevButtons`，再更新 prev。  
2. **删除**仅 `lpJust` 特殊字段；迁移调用点用 `(pressed & BTN_LP) !== 0`。  
3. 键位保持现文件注释（U/I/O 拳，J/K/L 或 Z/X/C 脚，方向箭头/WASD）——**禁止**改成 Modern。  
4. 新建 `facing.ts`：

```ts
/** CritPoints: flip L/R by ±2 on numpad corners/sides when facing left (facing === -1). */
export function toFacingRelative(worldDir: NumpadDir, facing: Facing): NumpadDir;
```

规则（T-FACE）：`facing === 1` 时 rel=world；`facing === -1` 时交换 4↔6、1↔3、7↔9，2/5/8 不变。

**参考实现语义**：GH-MOTION / T-CRIT（不复制 C#）。  
**验收**：

- 单测：facing=-1 时 world 6 → rel 4；world 236 序列在匹配前应先镜像。  
- 手动：面朝左时仍应用「前」为朝向对手方向。

**GUI**：无新参数（键位固定）。

---

### Step 3 — 层 B：InputHistory（方向/按钮历史）

**理论**：T-CRIT 方向缓冲；T-ANDREA 多帧记录；GH-SE 环形。  
**动作**：

1. 将 `InputBuffer` **重命名或包装**为 `InputHistory`：  
   - `push({ relDir, buttons, pressed, logicFrame })`  
   - `capacity` 默认 `motionHistoryCapacity`  
   - `dirs(): NumpadDir[]`、`formatDirs()` 保留给 HUD  
2. `MatchSim.buffer` 改用 History；DebugGui `setCapacity` 仍可用。  
3. **禁止**在本步做 special 匹配。

**验收**：单测 push 超容量丢最旧；`formatDirs` 与帧序一致。

**GUI**：`bufferFrames` / `motionHistoryCapacity` 绑定 History.capacity。

---

### Step 4 — 层 A：ActionBuffer

**理论**：T-SC 4f/7f；GH-BUF 过早输入延迟执行；C-CC §2.1 层 A。  
**动作**：

新建 `ActionBuffer.ts`：

```ts
type BufferedIntent = { intent: Intent; expiresAtLogicFrame: number };

class ActionBuffer {
  // 同时只保留「最高优先级」一条（T-ANDREA / Smash 惯例：不能多意图并列胜出）
  set(intent: Intent, now: number, ttlFrames: number): void;
  peek(): BufferedIntent | null;
  takeIfReady(now: number): Intent | null; // 过期丢弃
  clear(): void;
}
```

TTL：`intent.bufferClass === 'dash' ? actionBufferDash : actionBufferStandard`。  
写入时机（MatchSim）：

- 当解析出 **非 none** 意图，但当前 **不能执行**（`!canAct && !canCancelThatIntent`）→ `actionBuffer.set`  
- 当可执行 → 直接执行并 `clear`  
- 每帧若 buffer 未过期且变为可执行 → `takeIfReady` 执行  

**坑**：见 §7 P-BUF-GHOST（过长 buffer 幽灵输入）——P0 严格用 4/7，GUI 可调但默认不放大。

**验收**：

- 单测：attack recovery 最后 4 帧内写入 normal intent，recovery 结束帧 `phase===attack` 新招。  
- 单测：过期 1 帧后不触发。

**GUI**：`actionBufferStandard`、`actionBufferDash`、`enableActionBuffer`。

---

### Step 5 — MotionMatcher + 固定指令表

**理论**：T-CRIT `checkValidInput` 逆向扫描；Andrea 多余方向可接受；R-SF6 ~9f 间隙；dash 独立规则 C-CC §1.4。  
**动作**：

1. `CommandDef`：

```ts
type MotionStep = { dir: NumpadDir | NumpadDir[]; /* 允许 2 或 [1,2,3] 蹲类 */ };
type CommandDef = {
  id: string;
  moveId: string;
  kind: IntentKind;
  priority: number;
  bufferClass: 'standard' | 'dash';
  /** 空 = 无 motion，仅按钮 */
  motion: MotionStep[];
  /** 需要的 pressed 掩码（全部 bits 本帧或窗口内） */
  buttonMask: number;
  /** 按钮与 motion 末步的最大间隔帧，默认 motionStepGapMax */
  buttonGapMax?: number;
};
```

2. **P0 `ryuCommands.ts` 白名单（仅这些）**：

| id | motion (rel) | button | moveId / 行为 |
|----|--------------|--------|----------------|
| hado_lp | 2,3,6 | LP | `ryu_hadoken_lp` |
| hado_any_p | 2,3,6 | LP\|MP\|HP（P0 可只 LP） | 同上 |
| dash_f | 特殊规则 6-5-6 或 6-6 | — | phase dash_fwd |
| dash_b | 4-5-4 或 4-4 | — | phase dash_back |
| n_5lp | [] 或 [5] | LP，且 relDir∈{5,4,6} 非下 | `ryu_5lp` |
| n_2lp | relDir∈{1,2,3} | LP | 可选：若无 2LP 数据则 map 到 5LP **禁止**；无数据则 **不做 2LP** |
| jump | relDir∈{7,8,9} | 无键 | prejump |

3. **Motion 匹配算法（必须按此，禁止自创 AI 模糊匹配）**：

依据 T-CRIT：

- 在 `InputHistory` 上 **从新到旧** 找 motion 最后一步 dir 出现位置；  
- 再往旧找前一步，步间逻辑帧差 ≤ `motionStepGapMax`；  
- 中间允许夹杂其它方向（Andrea 多余方向）；  
- **同一方向连持**不重复计步（仅在 dir **变化** 时记入历史，或匹配时跳过连续重复）——采用 T-CRIT「只在方向变化时入缓冲」：**History 可存每帧 dir，匹配时 collapse 连续重复**。  
- 按钮：`pressed & buttonMask` 在 motion 完成后 `buttonGapMax` 帧内。

4. **Dash 独立**（C-CC §1.4，R-SF6）：

- 前 dash：在 `DASH_DIR_HOLD_MAX` 内出现 rel 6，再中性(5) ≤ `DASH_NEUTRAL_MAX`，再 6；**或** 连续两帧 rel 6 且中间无 4（简化双敲：检测最近 2 次「进入 6」边沿间隔 ≤ 8+8）。  
- P0 **实现规范（二选一写死，禁止两套并存）**：  
  **采用双敲边沿**：记录上次 `relDir` 从非6→6 的 logicFrame；若再次非6→6 且 `now-prev ≤ dashDirHoldMax + dashNeutralMax` 且中间曾出现 5 或时间差≥1，则 dash_fwd。后撤对 4 对称。  
- Dash **不**走 special 同一匹配器（C-CC）。

5. **同帧多命令**：`IntentResolver.resolve(candidates): Intent` 取 priority 最大；相等时 special > normal > dash > jump（T-ANDREA 复杂指令优先）。

**参考源码语义**：GH-MOTION `InputMotion`；Ikemen command 仅概念。  
**验收**：

- 单测：历史 dirs `…236` + LP pressed → hado。  
- 单测：`2636` + LP 仍可 hado（多余方向）。  
- 单测：间隙 10f > 9 → 失败。  
- 单测：`623`+P **不要**在 P0 实现升龙（未列入白名单）。

**GUI**：`motionStepGapMax`、`dashDirHoldMax`、`dashNeutralMax`。

---

### Step 6 — MoveCatalog + 解析 generated 差异

**理论**：C-SCHEMA；DATA-IDX。  
**动作**：

1. 扩展 `parseMoveDefinition`：兼容  
   - `hitstun`/`blockstun` 缺失时用占位：`hitstun = max(0, advantage.onHit + recovery)` **仅当字段缺失**（注释 placeholder）；5LP 已有则用文件。  
   - `cancel.windows` 数组  
   - `frames.total` 若缺失：`startup+active+(recovery??0)`；若 recovery null 且 total 有：`recovery = total - startup - active`  
2. `MoveCatalog.loadP0()`：fetch  
   - `/data/moves/ryu_5lp.json`  
   - `/data/moves/ryu_hadoken_lp.json`（从 generated 复制并 **手修 total/recovery** 使 `total = startup+active+recovery`）  
3. `MatchSim` 持有 catalog；`startMoveById(id)`。

**验收**：加载两招；5LP 旧测仍过。

---

### Step 7 — Cancel 消费（层 C）+ 5LP→Hadoken

**理论**：C-CC §3.4–3.5；T-ANDREA cancel 列表；DATA-5LP windows。  
**动作**：

1. `MovePlayer.inCancelWindow(token: string): boolean`  
2. `Fighter.canSpecialCancel(): boolean` = phase===attack && move.cancel.specialCancel && inCancelWindow('special') && cfg.enableCancel  
3. MatchSim：若 intent.kind==='special' 且 `canSpecialCancel()` → **立即** `startMove(hado)`（打断当前），`actionBuffer.clear`，**不**等 recovery。  
4. 若 specialCancel 但窗已过 → 可进 ActionBuffer 等到 canAct（标准 4f），**不得**窗外硬切。  
5. Snapshot `cancelWindow` 字段改为：`in=1/0 token=special f=from-to` 可读字符串。

**验收**：

- 单测：5LP 在 windows 内帧注入 236+LP → moveId 变为 hadoken，phase 仍 attack。  
- 单测：窗外且非 recovery 末 buffer → 不切换。  
- 单测：recovery 末 4f buffer special → 结束后出 hadoken。

**GUI**：`enableCancel`；HUD 显示 cancel 窗。

---

### Step 8 — FSM 最小扩展：Dash / Prejump

**理论**：C-CC §3.2；R-SF6 prejump 约 4f。  
**动作**：

1. **Dash**：`phase='dash'`，`dashTimer` 默认 **15** 逻辑帧（占位，GUI `dashFrames`）；期间 `canAct=false`；结束 → idle。位移：每帧 `facing * dashSpeed`（GUI `dashSpeed` 默认 0.12）。P0 **不做** dash 中 Parry cancel（遗漏 O-DASH-PARRY）。  
2. **Jump**：`prejump` 4 帧（`PREJUMP_FRAMES=4` 常量，R-SF6）→ `airborne` 固定 **30** 帧占位 → `landing` **3** 帧 → idle。P0 **空中不可攻击**。  
3. `canAct`：仅 idle|walk|crouch。  
4. prejump 期间 **允许** special cancel 意图进入 ActionBuffer 或立即 special（C-CC §3.4）；P0 若实现成本高：**仅允许 buffer 到 airborne 后不执行**——**强制**：prejump 中 special **写入 ActionBuffer**，落地 canAct 再出（简化）；登记遗漏 O-PREJUMP-SC。

**验收**：双敲 6 进入 dash；8 进入 prejump 计数。

**GUI**：`dashFrames`、`dashSpeed`、`prejumpFrames`、`airFrames`、`landingFrames`。

---

### Step 9 — Hitstop

**理论**：R-SF6 §2.3 hitstop 时位移/招式帧可停，**仍须接受** cancel/buffer 输入；C-CC §2.3。  
**动作**：

1. `MatchSim.hitstopTimer`。命中/防御成功时设为 `hitstopFramesOnHit/OnBlock`。  
2. `hitstopTimer>0` 时：  
   - **不** `mover.advance` / 不 stun 递减？——**P0 规范**：hitstop 期间 **双方** attack 与 stun 计时器 **暂停**；输入与 buffer **照常**。  
3. 调试 Snapshot：`hitstopTimer`。

**验收**：单测 hit 后 N 帧内 moveFrame 不变，第 N+1 帧继续；期间可登记 buffer。

**GUI**：`hitstopFramesOnHit`、`hitstopFramesOnBlock`。

---

### Step 10 — MatchSim 接线与 5LP 路径回归

**理论**：GH-CHRIS 闭环；现有 match 测。  
**动作**：

1. 删除「仅 `lpJust` → 5LP」短路；全部经 IntentResolver。  
2. 保持 Dummy 模式。  
3. 走位：canAct 且 intent walk/crouch。  
4. 更新所有测试夹具 `InputSample` 字段。

**验收**：旧 5LP hit/block 测绿；新 buffer/cancel/dash 测绿；`npm test`。

---

### Step 11 — 表现层 clip 接线（逻辑权威不变）

**理论**：C-CC §3.1、§3.6；SO-MIXER / THREE-MIX scrub；C-MAP。  
**动作**：

1. `Fighter.clipId` 已随 move 更新；扩展：dash→`dash_fwd`/`dash_back`，prejump/air/land→映射表 id，hitstun→`hitstun_light`，block→`block_stand`。  
2. `FighterView`（或现有 scrub 路径）：  
   - 优先 `clip_map.json` 的 animation 名（现有合并 glb）；  
   - 若无 clip，**保持** idle 占位，**不得**抛错中断逻辑。  
3. scrub 公式（强制）：

```ts
// ADR-003 / 既有 MVP：逻辑帧驱动
const t = move.total > 0
  ? (moveFrame / move.total) * clipDurationSeconds
  : 0;
action.paused = true;
mixer.setTime(t); // 或 action.time = t; mixer.update(0);
```

依据 SO-MIXER、THREE-MIX。  
4. **禁止**用 glb 的 f39 覆盖 5LP total=13/14。  
5. 可选：读 `ryu_logic_to_glb_map.json` 仅用于 **debug 面板显示 path**，P0 不强制运行时 fetch 每个 glb（见遗漏 O-MULTI-GLB）。

**验收**：出 5LP 时 clipId 变化；逻辑帧与 HUD `p1MoveFrame` 同步；无 WebGPU 回归。

**GUI**：已有 `timeScaleAnim`；新增 `scrubFromLogic` 默认 true（若 false 仅调试用 mixer 自由播——默认 true 禁止关导致规则错乱时写警告）。

---

### Step 12 — Debug GUI 与 HUD 全量参数（强制公开）

使用 **three 自带** `three/addons/libs/lil-gui.module.min.js`（与现 APP-GUI 一致）。

#### 12.1 必须出现在 lil-gui 的参数

| 文件夹 | 参数 | 读写 |
|--------|------|------|
| 模拟 | paused, stepOnce, logicFps, maxLogicStepsPerRaf, maxFrameTimeMs | 已有+保留 |
| 缓冲 | actionBufferStandard, actionBufferDash, motionStepGapMax, dashDirHoldMax, dashNeutralMax, motionHistoryCapacity, enableActionBuffer | **新建** |
| 取消/硬直 | enableCancel, hitstopFramesOnHit, hitstopFramesOnBlock | **新建** |
| 移动状态 | dashFrames, dashSpeed, prejumpFrames, airFrames, landingFrames, walkSpeed | 新建/已有 |
| 对局 | dummyMode, resetMatch, p1Hp, p2Hp | 已有 |
| 显示 | showHitboxes, showHurtboxes, showBuffer, showCancelWindow | 扩展 |
| 招式 | reload 5LP JSON、reload buffer JSON | 按钮 |
| 相机/模型 | 已有 camera/model | 保留 |

#### 12.2 HUD（HudDom）每帧只读

必须显示：

- `logicFrame`  
- `p1.phase` / `p2.phase`  
- `p1.moveId` + `moveFrame/total`  
- `cancelWindow` 摘要  
- `hitstopTimer`  
- `actionBuffer`：当前意图 id + 剩余帧  
- `history` dirs 串（`showBuffer` 时）  
- `lastIntent` kind+moveId  
- `relDir` / `pressed` 掩码（十六进制）

依据：共识 H2 调试；C-CC §3.5 调试要求。

---

### Step 13 — 文档与遗漏回写

**动作**：

1. 在 `docs/plans/` 本文件末修订记录勾选「已实现步骤」。  
2. 确认 §O 遗漏表未删。  
3. 若实现中发现新坑，追加 §7，**禁止**静默改共识。

**验收**：人类可读；AI 可据 §O 开后续任务。

---

## 5. 单测清单（P0 必须全部存在且绿）

| 文件 | 断言要点 |
|------|----------|
| `facing.test.ts` | 镜像 4↔6、1↔3 |
| `motionMatcher.test.ts` | 236P 成功；间隙失败；collapse 重复 dir |
| `actionBuffer.test.ts` | TTL；高优先级覆盖低优先级 |
| `intentResolver.test.ts` | special > normal |
| `cancelWindow.test.ts` | MovePlayer 窗内/窗外 |
| `matchSim_buffer_5lp.test.ts` | recovery 预输入 |
| `matchSim_cancel_hado.test.ts` | 窗内 cancel |
| `matchSim_dash.test.ts` | 双敲 dash phase |
| 既有 `matchSim_5lp` / `movePlayer` / `collision` | 回归 |

运行：`cd app && npm test`。

---

## 6. 手动验收清单（Chrome + WebGPU）

1. 站立点 LP → 5LP，Dummy 进 hitstun，框可见。  
2. 5LP 后 recovery 提前 4f 内再点 LP → 一结束立即再 5LP。  
3. 5LP cancel 窗内做 236+LP → 收招被打断进 Hadoken（动画可占位）。  
4. 双敲前 → dash 位移。  
5. 点上 → prejump→air→land。  
6. GUI 改 `actionBufferStandard=1` 手感变严。  
7. 暂停 + 单帧步进，HUD 帧号与 cancel 一致。  
8. 面朝左（站右侧）236 相对前仍出 Hadoken。

---

## 7. 坑与技术陷阱（检索补充 → 方案约束）

| ID | 坑 | 来源 | 方案内约束 |
|----|----|------|------------|
| P-TLA | Vite + Three WebGPU top-level await | three#26626、discourse 68189 | **保持** `async boot()` + `build.target esnext`；禁止新 top-level await |
| P-BUF-GHOST | buffer 过长 → 幽灵出招 | moonjump / gamedev 讨论；Andrea | 默认 4/7；GUI 上限建议 ≤15 |
| P-PRIO | 236P 被读成 6P；623 vs 236 | Andrea priority；T-CRIT | 固定表 special 先匹配；白名单顺序先 special 再 normal |
| P-AUTOCOMBO | 复杂度优先导致永远最高段 | YouTube FG buffer 评论区问题 | P0 **无** autocombo 链；禁止「最长序列永远胜」误伤 normal |
| P-HOLD-DIR | 方向按住重复计入 motion | T-CRIT | collapse 连续相同 dir |
| P-FACE | 左侧 236 变 214 | T-FACE；Godot 论坛 | 匹配 **只**用 relDir |
| P-SAME-F | 按钮与最后方向同帧 | Andrea | 允许 button 与末 dir 同帧 |
| P-CANCEL-ALL | active 全程 cancel | C-CC §3.5 | 禁止空 windows 自动全开 |
| P-JSON | generated recovery null / total 短 | 本仓 hadoken JSON | Step 6 规范化 total |
| P-CLIP | 动画 f39 ≠ 逻辑 14 | C-CC R2；SO-MIXER | scrub 用逻辑比；不改 total |
| P-HITSTOP | hitstop 丢输入 | R-SF6 | 停帧仍采样 |
| P-DOUBLE | history 与 action 双消费 | Andrea | 执行成功后 clear action 并标记 pressed 已消费 |
| P-TEST | 仅改运行时忘测 | 工程纪律 | Step 验收绑 `npm test` |
| P-PRIVATE | glb 提交 git | 共识 | 不复制 Capcom 资产到公开路径 |
| P-MULTI-INTENT | buffer 多条 | Smash 词条「不能同时 buffer 多个」 | ActionBuffer **单槽**最高优先级 |

---

## 8. 遗漏项登记（不挡 P0；不得删除）

| ID | 项 | 现状 | 建议后续 |
|----|----|------|----------|
| O-WAKE | 起身缓冲 7f vs 10f | P0 用 7 | 本地拍板进配置分支 |
| O-§5 | 投 tech、CH/PC、站蹲 hurt 过渡、Juggle | 共识待定 | 升格共识后再做 |
| O-DRIVE | DI/Parry/DR/Reversal 真行为 | stub | 接口预留 |
| O-DR-FREEZE | DR 冻结与 buffer 相位 | 未做 | 独立任务 |
| O-SA | SA1–3 映射 deferred | map 已标 | 资产+指令 |
| O-6HK | 6HK unmapped | map | 补 glb 或占位 |
| O-FULL-CMD | 全普攻/TC/全 special 指令 | 仅白名单 | 扩 `ryuCommands` + catalog |
| O-TRUE-BOX | 逐帧真盒 | placeholder | 挖矿/审查 |
| O-REVIEW | generated 帧审查 | placeholder | SuperCombo/UFD 对照 |
| O-PREJUMP-SC | prejump special cancel 即时 | P0 简化 | 对齐 R-SF6 |
| O-DASH-PARRY | dash 前 2f→Parry | 未做 | Drive 期 |
| O-MULTI-GLB | 每招独立 glb 运行时加载 | P0 不强制 | 管线任务 |
| O-NEGEDGE | negative edge | 未做 | §5 |
| O-CHARGE | 22 蓄力 keep | 未做 | special 扩展 |
| O-PRIORITY-OFFICIAL | Move Input Priority 完整官方序 | 初表 | wiki 更新后修订 |
| O-GAMEPAD | 手柄 | 仅键盘 | 同 Classic 语义 |
| O-2LP-DATA | 蹲轻拳独立数据/clip | 可选未做 | 加 JSON 后进白名单 |
| O-SHORYU | 623 升龙 | 有 glb map | 第二 special |
| O-HITSTOP-TABLE | 逐招 hitstop 表 | 全局占位 | 表驱动 |
| O-LATE-CANCEL | 「必须晚 cancel」策略 | 未做 | 例外表 |

---

## 9. 建议提交粒度（每步可 1 commit）

1. `feat(combat): config + types for buffer/cancel`  
2. `feat(input): edge masks + facing-relative dirs`  
3. `feat(input): InputHistory + ActionBuffer`  
4. `feat(command): MotionMatcher + ryu P0 commands`  
5. `feat(move): catalog + cancel windows parse`  
6. `feat(match): intent resolve, cancel to hadoken, hitstop`  
7. `feat(fighter): dash + prejump phases`  
8. `feat(debug): gui/hud buffer cancel params`  
9. `test(combat): buffer cancel dash motion`  
10. `chore(data): runtime hadoken json + input_buffer.json`

---

## 10. 给 AI 的「完成定义」检查表

全部勾选才算 P0 完成：

- [ ] `npm test` 全绿  
- [ ] 手动清单 §6 全过  
- [ ] GUI §12.1 参数均存在且改缓冲影响行为  
- [ ] HUD 显示 phase / moveFrame / cancel / buffer / hitstop  
- [ ] combat 无 three import  
- [ ] 无 private 大文件被 copy 进 `app/public` 二进制（JSON 映射除外）  
- [ ] §O 遗漏表仍在文档中  
- [ ] 5LP 仍可由本地 JSON 驱动帧数（改 JSON startup 行为变）

---

## 11. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-08-10 | v0：P0 完整 AI 执行方案；遗漏登记；坑表来自 Web/社区 + 本仓案例检索 |
| 2026-08-10 | **已执行 P0 代码**：三层缓冲、facing、MotionMatcher、5LP cancel→Hadoken、dash/jump、hitstop、GUI/HUD、单测 29 绿。遗漏 §O 仍未做。 |

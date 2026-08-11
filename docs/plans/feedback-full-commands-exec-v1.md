# 执行方案 v1：尽可能全操作皆有反馈（逻辑 + anims）

> **状态**：可给 AI / 人直接执行  
> **范围**：Classic 隆主力操作反馈（不含投/主动防/Drive/SA 完整系统）  
> **禁止**：无依据自创优先级、自创指令、静默回退 5LP、合并大 glb 作为主路径  

---

## 0. 目标与非目标

### 0.1 目标（验收）

| # | 验收项 |
|---|--------|
| V1 | 站立六键 U/I/O/J/K/L → 六个不同 `moveId`（`ryu_5lp`…`ryu_5hk`） |
| V2 | 下+六键 → `ryu_2lp`…`ryu_2hk`，不与 5 系串 |
| V3 | 跳中六键 → `ryu_jlp`…（canonical），`phase` 允许 airborne 出 normal |
| V4 | Unique：6MP/6HP/4HP/4HK/6HK 能 resolve + catalog 有则 startMove |
| V5 | Special：236P / 623P / 214K / 236K / 214P / 22P 各强度可 resolve |
| V6 | 236 仍优先于 5P（同帧 special > normal） |
| V7 | catalog 无该招时 **不** 静默变 5LP；日志/HUD 可见 |
| V8 | anims：`clipId` → `LogicGlbMap` → preload/ensure；缺资源 console + HUD |

### 0.2 非目标（本 v1 不做）

- 投、主动防御、Drive Impact/Parry/Rush、OD 双键、TC 链、SA
- 真 hitbox 审查、精确 cancel 窗调参
- Prod 打包 private glb（记债；dev `/private-assets` 继续用）

---

## 1. 理论依据与参考源（必须遵守）

### 1.1 输入 / 指令优先级

| 依据 | 要点 | 本仓库落点 |
|------|------|------------|
| [Andrea Jens — FG guide part 6](https://andrea-jens.medium.com/i-wanna-make-a-fighting-game-a-practical-guide-for-beginners-part-6-311c51ab21c4) | 每招 **unique priority**；高优先级先匹配；cancel 列表约束 | `INTENT_PRIORITY` + `CommandDef.priority` |
| [CritPoints — Motion inputs](https://critpoints.net/2025/02/05/how-to-code-fighting-game-motion-inputs/) + [Fightmans GameController](https://github.com/evilagram/Fightmans/blob/master/GameController.cs) | 方向历史缓冲、步间 gap、倒序匹配 | 已有 `InputHistory` + `matchMotion` |
| SuperCombo / Capcom 记法 | 236/623/214/22 + 按钮 | `docs/.../ryu-command-list-classic.md` |
| 本仓库 `consensus-design-v0.md` §1.5 | Super>Special>Throw>Drive>TC>Normal>Dash/Jump | 扩表时 **不得** 打乱该序；unique 插在 Normal 之上、Throw 之下 → **priority 50** |

### 1.2 帧数据 / moveId

| 依据 | 要点 | 本仓库落点 |
|------|------|------------|
| [4rays/sf6-move-data](https://github.com/4rays/sf6-move-data) | TOML input 记法、moveType | `docs/.../sourced-framedata/4rays-ryu.toml`；`generated/*.json` 已生成 |
| Capcom / UFD 语义 | startup/active/recovery @ 60Hz | `parseMoveDefinition`；ADR-001 60Hz |
| `ryu-command-list-classic.md` | 逻辑 `moveId` 命名 | 指令 `moveId` **必须** 与此表一致（`ryu_jlp` 非 `ryu_j>lp`） |

### 1.3 动画

| 依据 | 要点 | 本仓库落点 |
|------|------|------------|
| three.js `AnimationMixer.clipAction` | 多 clip 绑同一 skeleton | `FighterView` animsMode |
| three.js Discourse：外置 glTF 动画需 clone track 到现有 root | RE 导出 glb 按需 load | `ensureLogicClip` + `prepareReExtractedFighter` |
| `ryu_logic_to_glb_map.json` policy | 逻辑帧 scrub，不跟 glb frameCount | `scrubFromLogic` + map policy |

### 1.4 社群已知坑（执行时必防）

| 坑 | 来源 | 对策 |
|----|------|------|
| 无 priority 时同帧多指令竞争 | Andrea | special 100 / unique 50 / normal 40 固定 |
| 仅扩 Command 不 load catalog → 全变默认招 | 本仓库 `executeIntent` fallback | **删除** fallback 到 5LP |
| 站/蹲未分流 → 蹲下出 5LP | 本仓库 hardcode `n_5lp` | 数据化 `requireDirs`/`forbidDirs` |
| 空中无 canAct → j. 只进 buffer | 本仓库 `Fighter.canAct` | `airOnly` + airborne 可出 normal |
| 空中出招后 `phase=idle` 浮空 | 状态机 | 攻击结束恢复 `airborne` + 剩余 timer |
| generated `ryu_j>lp` vs map `ryu_jlp` | 本仓库 id 分裂 | 加载时 canonicalize |
| Mixer 异步未就绪 → 首帧像没按 | three.js 异步 load | preload 白名单 + HUD `clipMissing` |
| 同帧 LP+LK 满足单键 mask | bit 包含匹配 | v1 可接受；投后置时再 exact mask |
| 120Hz 显示器动画加倍 | 本仓库已注 | 继续 wallDt 驱动 free-run clip |

---

## 2. 架构改动（精准到文件）

```
KeyboardSource (已 6 键)
    → MatchSim.step
        → resolveIntent(history, frame, cfg, { phase })
            → RYU_FEEDBACK_COMMANDS (扩表)
            → tryMatchCommand (dirs/air 规则)
        → canExecute / executeIntent
            → catalog.get(moveId)  // 无则失败，不回 5LP
        → Fighter.startMove / air resume
    → FighterView.playBest(clipId) / scrub
        → LogicGlbMap + anims glb
```

### 2.1 `CommandDef` 扩展字段

文件：`app/src/combat/command/CommandDef.ts`

```ts
/** 若设置：当前 relDir 必须 ∈ 列表（unique / 蹲系） */
requireDirs?: NumpadDir[];
/** 若设置：当前 relDir 不得 ∈ 列表（站立 5 系禁 1/2/3） */
forbidDirs?: NumpadDir[];
/** true：仅 airborne 匹配；地面 special/normal 在 airborne 时不匹配 */
airOnly?: boolean;
```

**依据**：Andrea conditional triggers；CritPoints motion+button；本仓库 crouch hardcode 升级。

### 2.2 `MotionMatcher.tryMatchCommand`

文件：`app/src/combat/command/MotionMatcher.ts`

1. 删除 `cmd.id === 'n_5lp'` hardcode。  
2. button-only 与 motion+button 成功后，读 `entries` 最后一帧 `relDir`：  
   - `requireDirs` 不满足 → null  
   - `forbidDirs` 命中 → null  
3. 返回 Intent 时带上 `airOnly?: boolean`（扩展 `Intent` 类型）。

### 2.3 `Intent` 扩展

文件：`app/src/combat/types.ts`

```ts
airOnly?: boolean;
```

`INTENT_PRIORITY` 增加：

```ts
unique: 50, // 介于 throw(80) 与 normal(40) 之间；consensus §1.5 扩展
```

Unique 命令 `kind` 仍为 `'normal'`（消费路径同普攻），`priority: INTENT_PRIORITY.unique`。

### 2.4 `ryuCommands.ts` 全表

文件：`app/src/combat/command/ryuCommands.ts`

导出：

- `RYU_FEEDBACK_COMMANDS: CommandDef[]`（主表）  
- `RYU_P0_COMMANDS` **别名** = 同上（兼容旧测试 import）

**生成规则（禁止手滑编造 moveId）**：

| 类 | moveId 来源 | motion / dirs | button | priority |
|----|-------------|---------------|--------|----------|
| 站 5 系 | `ryu-command-list-classic.md` §2 | motion `[]`，forbidDirs `[1,2,3]` | 单键 | normal 40 |
| 蹲 2 系 | 同上 | requireDirs `[1,2,3]` | 单键 | normal 40 |
| 空中 j. | 同上 `ryu_jlp`… | airOnly true | 单键 | normal 40 |
| Unique | §3 | requireDirs 6 或 4 | 对应键 | unique 50 |
| 236+P | §5 hadoken | `[2],[3],[6]` | LP/MP/HP | special 100 |
| 623+P | shoryuken | `[6],[2],[3]` | LP/MP/HP | special 100 |
| 214+K | tatsu | `[2],[1],[4]` | LK/MK/HK | special 100 |
| 236+K | blade | `[2],[3],[6]` | LK/MK/HK | special 100 |
| 214+P | hashogeki | `[2],[1],[4]` | LP/MP/HP | special 100 |
| 22+P | denjin | `[2],[2]` | LP（先 LP；MP/HP 可同 move 或后续） | special 100 |

按钮常量：`BTN_LP`…`BTN_HK`（`types.ts` 已有）。

**顺序**：数组内 special 在前、unique、再 normal（sort 仍按 priority；顺序仅作 tie-break 稳妥）。

### 2.5 `resolveIntent` 上下文

文件：`app/src/combat/command/IntentResolver.ts`

```ts
export type ResolveContext = {
  phase: FighterPhase;
};

// 匹配每条 cmd 前：
// if cmd.airOnly && phase !== 'airborne' → skip
// if !cmd.airOnly && (kind normal|special) && phase === 'airborne' → skip
```

`MatchSim.step` 传入 `{ phase: this.p1.phase }`。

### 2.6 空中执行

文件：`app/src/combat/fighter/Fighter.ts`、`MatchSim.ts`

- `canAirAct(): boolean` → `phase === 'airborne'`
- `canExecute(normal)`：若 `intent.airOnly` → `canAirAct()`；else `canAct()`
- `startMove`：若当前 `airborne`，保存 `stateTimer` 到 `airTimeRemain`
- `advance` 攻击结束：若 `airTimeRemain > 0` → 回 `airborne` 并恢复 timer；否则 idle

### 2.7 Catalog 白名单加载

文件：`app/src/combat/move/MoveCatalog.ts`、新建 `app/src/combat/move/ryuMoveIds.ts`

`ryuMoveIds.ts` 内容：

1. `MOVE_ID_ALIASES: Record<string, string>`  
   - `'ryu_j>lp' → 'ryu_jlp'` … 六个空中  
2. `RYU_FEEDBACK_MOVE_URLS: string[]`  
   - 全部 `/data/moves/generated/ryu_5*.json`、`2*`、`j>*`、unique、special 强度文件  
   - 与磁盘文件名一致（`ryu_j>lp.json` URL 需 encode：`encodeURI` 对 `>`）  
3. `canonicalizeMoveDefinition(m): MoveDefinition` 改写 id/moveId/clipId  

`loadFeedbackCatalog(fetchJson)`：

- 对每个 URL try/catch；失败 `console.warn`，不中断  
- register canonical  
- 返回 `{ catalog, loaded, failed }`

`main.ts` boot 使用 `loadFeedbackCatalog` 替代只 load 2 招。

`executeIntent`：

```ts
const move = (id === ryu_5lp 且 GUI 编辑) ? cloneMove(move5lp) : catalog.get(id);
if (!move) {
  console.warn('[MatchSim] move not in catalog', id);
  return false; // 禁止 fallback 5LP
}
```

### 2.8 Preload 动画

文件：`app/src/data/logicGlbMap.ts`

扩展 `BOOT_PRELOAD_LOGIC_IDS`：

- 原有 locomotion/hit/block  
- 全部 `ryu_5*` `ryu_2*` `ryu_j*` unique  
- special 主 clip：`ryu_hadoken`、`ryu_shoryuken`（若 map 有）、等 — **以 map.mappedIds 与白名单交集为准**

实现：`export function feedbackPreloadIds(map: LogicGlbMap): string[]`  
= locomotion 固定表 ∪ catalog move clipIds 能 primaryPath 的。

`main.ts`：`preloadLogicClips(feedbackPreloadIds(logicMap))`。

### 2.9 调试面板（必须公开参数）

文件：`app/src/debug/DebugGui.ts` + `HudDom`（只读字段可放 GUI）

**新建文件夹「指令反馈」**，绑定可变对象每帧由 main 或 gui 控制器刷新（lil-gui 读对象引用）：

| 参数 / 字段 | 类型 | 读写 | 依据 |
|-------------|------|------|------|
| `lastIntentKind` | string | 只读 | 验证 resolve |
| `lastIntentMoveId` | string | 只读 | V1–V5 |
| `lastCommandId` | string | 只读 | |
| `p1Phase` | string | 只读 | 空中/硬直 |
| `p1ClipId` | string | 只读 | 动画对齐 |
| `catalogCount` | number | 只读 | 加载是否成功 |
| `lastMoveMiss` | string | 只读 | 无 catalog 时 id |
| `enableFeedbackCommands` | bool | 写，默认 true | 回退仅 P0 调试（可选；若实现成本高可只做只读表） |
| `motionStepGapMax` | 已有 | 写 | CritPoints gap |
| `actionBufferStandard` | 已有 | 写 | Andrea buffer |
| `enableCancel` | 已有 | 写 | cancel |
| `scrubFromLogic` | 已有 | 写 | map policy |
| `reloadCatalog` | button | 写 | 重拉 generated |
| `logCommandsToConsole` | bool | 写 | 每次成功 execute 打 log |

**实现方式**：`match` 上增加 `debugProbe: { ... }` 字段，`step` 内更新；GUI `folder.add(match.debugProbe, 'lastIntentMoveId').listen()`（lil-gui `.listen()`）。

---

## 3. 分步执行清单（AI 按序）

| Step | 动作 | 完成标准 |
|------|------|----------|
| S0 | 落盘本计划（本文件） | 路径存在 |
| S1 | 扩展 CommandDef / Intent / INTENT_PRIORITY.unique | 编译通过 |
| S2 | MotionMatcher 通用 dirs；删 n_5lp hardcode | 单测：蹲 LP→需 2lp 规则 |
| S3 | 写满 `RYU_FEEDBACK_COMMANDS` | 条数 ≥ 12+6+5+特殊强度 |
| S4 | IntentResolver + phase 上下文 | 空中不匹配地面 normal |
| S5 | Fighter 空中 + MatchSim canExecute/execute | 无 5LP fallback |
| S6 | ryuMoveIds + loadFeedbackCatalog + main boot | catalogCount ≥ 30 |
| S7 | BOOT_PRELOAD / feedbackPreloadIds | boot 日志打印数量 |
| S8 | DebugGui 指令反馈面板 | listen 字段可见 |
| S9 | 单测：5/2 分流、236 优先、unique 优先 5、catalog miss | vitest 绿 |
| S10 | （可选后续）多段 special 状态机、投/防 | 不在本 v1 强制 |

---

## 4. 测试用例（必须写）

文件建议：`app/tests/combat/ryuCommands_feedback.test.ts`

1. 中立 + LP pressed → `ryu_5lp`  
2. relDir=2 + LP → `ryu_2lp`，不是 5lp  
3. 236+LP → `ryu_hadoken_lp` priority > 5lp  
4. relDir=6 + MP → `ryu_6mp` 非 `ryu_5mp`  
5. phase airborne + LP → `ryu_jlp`；phase idle + airOnly 不匹配  
6. catalog 无 move 时 execute 返回 false（集成或单测 mock）

参考现有：`motionMatcher.test.ts`、`matchSim_cancel_hado.test.ts`。

---

## 5. 风险与回滚

| 风险 | 缓解 |
|------|------|
| generated JSON 个别 parse 失败 | 单文件 catch，其余继续 |
| 6HK 无 glb | 逻辑可出；动画 warn；map unmapped |
| 指令过多导致误触 special | gap 可调；调试面板暴露 motionStepGapMax |
| 性能：preload 过多 glb | 先 preload 普攻+locomotion；special 可 ensure 懒加载 |

回滚：保留 `RYU_P0_COMMANDS` 最小子集 git 历史；boot 可环境变量不需要。

---

## 6. 参考链接速查

- Andrea priority/buffer: https://andrea-jens.medium.com/i-wanna-make-a-fighting-game-a-practical-guide-for-beginners-part-6-311c51ab21c4  
- CritPoints motion: https://critpoints.net/2025/02/05/how-to-code-fighting-game-motion-inputs/  
- Fightmans buffer 源码: https://github.com/evilagram/Fightmans  
- 4rays sf6-move-data: https://github.com/4rays/sf6-move-data  
- three.js AnimationMixer: https://threejs.org/docs/#api/en/animation/AnimationMixer.clipAction  
- 本仓库指令表: `docs/character-control/action-tables/ryu-command-list-classic.md`  
- 本仓库共识: `docs/character-control/consensus-design-v0.md`  
- 本仓库 map: `app/public/data/clips/ryu_logic_to_glb_map.json`  

---

## 7. 本 v1 完成后仍缺（诚实列表）

- 投 / 防 / Drive / SA / OD / TC  
- 多段 special clip 状态机  
- Prod 资产管线  
- 帧/盒人工审查  

以上不阻塞「主力键+主必杀有逻辑与动画反馈」。

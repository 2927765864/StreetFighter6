# AI 可执行方案：格挡受击（段位判定 · Dummy 三模式 · GRD 族 · 硬直权威）

> **文档类型**：实现执行规范，**不是**共识正文。  
> **节点**：2026-08-19  
> **唯一行为规格**：`docs/character-control/consensus-block-guard-v0.md`  
> **上级**：`docs/character-control/consensus-design-v0.md` §4.7（已升级指向专项共识）· `docs/consensus-v0.md` §0（写进即全做）  
> **调研**：`docs/research/sf6-block-hit-reaction-research-2026-08-18.md`  
> **帧表盘点**：`docs/character-control/action-tables/sourced-framedata/block-frame-inventory-2026-08-19.md`  
> **产品要求**：对手 Dummy 必须提供 **三个可选行为**：全部格挡 / 仅站立格挡 / 仅蹲下格挡。  
> **明确禁止**：接近防、Drive/完美格挡、chip、空中格挡、用 FAT 覆盖 MMDK blockstun、干挨分部位精做、自我发明第二套状态机/单位制。

---

## 硬性规则（执行者必读）

1. **禁止自我发挥**：每步只能用本文件列出的路径、函数、字段、算法与外部仓库。缺映射 → 写 `BLOCKED:` + 缺什么，**不要**另起架构。  
2. **`combat/` 禁止 import three**。动画只通过现有 `Fighter.clipId` + `FighterView` + `ryu_logic_to_glb_map.json`。  
3. **逻辑权威**是本地 JSON + MMDK 已转换字段；glb 时长 **不得**决定 `blockstun` / `canAct`。  
4. **写进共识 = 完整实现**（总共识 §0）：本方案步骤是验收顺序，不是「先 5LP 就算完」。GRD 映射表必须覆盖现有磁盘 `GRD_*` 族。  
5. 每步结束必须有 **Vitest** 和/或 **手动清单**。  
6. 不提交 `private/` 原始 dump。映射只写 `app/public/data/` 与 `docs/character-control/action-tables/`。

---

## 0. 现状基线（禁止推倒重写）

| 已有 | 路径 | 本阶段如何用 |
|------|------|----------------|
| Dummy 四模式 | `DummyController.ts`：`stand` / `crouch` / `stand_block` / `crouch_block` | **扩展语义**：新增 **全部格挡**；站防/蹲防改为「姿势锁死 + 段位判定」 |
| 打上即防 | `MatchSim.ts` L687：`forceP2Guard \|\| dummy.isBlocking()` | **删除无条件防住**；改为 `canBlock(level, stance)` |
| 防住结算 | `BlockResolve.ts` `resolveBlockOnHit` / `distributePushback` | **保留**；不改均分算法 |
| 硬直相位 | `Fighter.applyBlockstun` / `stunTimer` | **改**：clip 按表选；硬直结束若仍防 → 防姿 Loop 而非 `idle` |
| 招式 JSON | `app/public/data/moves/ryu_*.json` 已有 `guard`/`blockstun`/`hitstopOnBlock`/`blockPushbackTotal` | **解析进** `MoveDefinition`（当前 **未读 `guard`**，见下缺口） |
| 动画加载 | `logicGlbMap.ts` + `public/data/clips/ryu_logic_to_glb_map.json` | 现仅 `block_stand` → `GRD_STD_START`；**按映射表加 clip** |
| 调试 | `DebugGui.ts` / `ControlPanel.ts` | Dummy 下拉 + `forceP2Guard` 与新共识冲突，**必须改** |
| 单测 | `app/tests/combat/blockOnHit.test.ts`、`matchSim_5lp.test.ts` | 默认 `forceP2Guard: true` 会失效；**按新策略改夹具** |
| GRD 磁盘 | `private/assets/ryu/anims/basic/esf001v00_idle_tired/glb/` **41** 个 `GRD_*` | 命名规律见 §2；禁止另造文件名 |

**必须关闭的缺口**

| 缺口 | 证据 |
|------|------|
| `MoveDefinition` 无 `guard` | `MoveDefinition.ts` 返回对象无该字段；JSON 有但运行时读不到 |
| 强制真格挡无视站蹲×段位 | `MatchSim.ts` L687 |
| 防错仍可能被 `forceP2Guard` 挡掉 | `constants.ts` 默认 `forceP2Guard: true` |
| 格挡片永远 `block_stand` | `Fighter.ts` `applyBlockstun` L1165 |
| 硬直结束强制 `idle` | `Fighter.ts` L1241–1244（违反共识 §6「保持防姿循环」） |
| `6MP` 段位标错 | 本地 `guard: high`；FAT `atkLvl: M`（共识 §1 / 验收句 7） |

---

## 1. 权威依据总表（禁止用未列来源替代）

### 1.1 本仓库规格

| ID | 路径 | 用途 |
|----|------|------|
| C0 | `docs/character-control/consensus-block-guard-v0.md` | 行为唯一规格 |
| C1 | `docs/character-control/consensus-design-v0.md` §4.6–4.10 | 位移分通道、hitstop、验收 |
| C2 | `docs/decisions/ADR-001.md` | 逻辑 60Hz |
| C3 | `docs/character-control/action-tables/schema-move-table.md` | `guard` 字段（mid/high/low/throw） |
| C4 | `docs/character-control/action-tables/sourced-framedata/block-frame-inventory-2026-08-19.md` | 齐全度；MMDK vs FAT |
| C5 | `docs/character-control/action-tables/sourced-framedata/mmdk-ryu-hitdt-block-fields.json` | 抽测 5LP HitStun=13 |
| C6 | `docs/character-control/action-tables/sourced-framedata/FAT-ryu.json` | **仅**纠 `atkLvl`（如 6MP→M），不改 blockstun |
| C7 | `app/public/data/clips/ryu_logic_to_glb_map.json` | 现有映射扩展点 |

### 1.2 外部规则 / 数据

| ID | 资源 | URL | 允许用法 |
|----|------|-----|----------|
| D1 | SuperCombo Defense | https://wiki.supercombo.gg/w/Street_Fighter_6/Defense | Overhead/High 须站防；Low 须蹲防；多数两边都能防。**禁止**抄训练场 Dummy「Crouch+Block All 实际按 Down」的坑（同页 Note） |
| D2 | SuperCombo Game Data | https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data | Hitstun / Blockstun / Hitstop **定义**（计数权威仍是 MMDK） |
| D3 | Capcom 官方帧表图例 | https://www.streetfighter.com/6/en-us/character/ryu/frame | **H**=可站可蹲；**M**=过顶须站；**L**=须蹲 |
| D4 | FAT SF6FrameData | 已落盘 `sourced-framedata/FAT-ryu.json` · 上游 https://github.com/D4RKONION/FAT | `atkLvl` 对照 |
| D5 | Infil · Block Stun | https://glossary.infil.net/?t=Block%20Stun | 硬直期间不能行动 |
| D6 | Capcom SFV 防御课 | https://game.capcom.com/cfn/sfv/column/131405 | 站防/蹲防能挡哪些段（SFV 字母与 SF6 官方 H/M 用词不同：**本项目以 D3/C0 为准**） |

### 1.3 开源实现（只读语义；禁止 vendoring 整仓）

| ID | 仓库 | 对照本仓模块 | 允许操作 |
|----|------|----------------|----------|
| E1 | https://github.com/maclo4/Unity-Alien-Fighting-Game | 攻击字段 `mid` / `overhead` / `low` + 独立 `blockstun` | 对照「段位是招式属性」；不抄 Unity |
| E2 | https://github.com/NoisyChain/Sakuga-Engine | 表驱动命中结算、状态块 | 读 Scripts 概念；不移植 Godot/C# |
| E3 | https://github.com/ikemen-engine/Ikemen-GO | 站/蹲防御状态、attr 高低 | 读概念；不移植 Go |
| E4 | 本仓已有 `chriscourses` 式矩形结算 | `MatchSim` hit∩hurt | 继续走现有 AABB，不换引擎 |
| E5 | three.js `AnimationAction.clampWhenFinished` | https://threejs.org/docs/#api/en/animation/AnimationAction.clampWhenFinished | **硬直 > 片长** 时定格末帧（见 §6） |
| E6 | 本仓 `FighterView.ts` | 已按 `clipId` 加载 glb | 只加 map 条目，不新写加载器 |

### 1.4 坑与社群（方案必须规避）

| ID | 问题 | 来源 | 本方案对策 |
|----|------|------|------------|
| T1 | 训练场「蹲+全防」**不是**按住下后，接近防/绿框会错 | SuperCombo Defense 页 Note（D1） | Dummy「全部格挡」在 **接触帧** 选能成功的站/蹲，**不做**接近防、不模拟错误训练假人 |
| T2 | 官方 H ≠ 玩家「上段」 | Capcom 帧表（D3）；共识 C0 §1 | 代码枚举 `high\|mid\|low` 注释写官方义；HUD 显示 `H/M/L` |
| T3 | 动画长度 ≠ 硬直 | jchensor SFV 帧数据课：block stun 动画可比硬直短/长 https://www.youtube.com/watch?v=75Kvjwad_Uk | **硬直说了算**；短则 `LoopOnce`+`clampWhenFinished`（E5）；长则硬直结束立刻切 Loop/待机 |
| T4 | 社区 blockstun 与解包 HitStun 差约 4f | 本仓 inventory C4；5LP 13 vs 9 | **禁止**用 FAT 覆盖；单测锁 5LP=13 |
| T5 | `forceP2Guard` 与「防错=挨打」互斥 | 现 `MatchSim` L687 | 删除「布尔强制全防」；改三策略 |
| T6 | 硬直结束闪回 idle | 现 `Fighter.ts` L1243 | 仍防 → `GRD_*_Loop` |
| T7 | hitstop 期间误推进 stun | 本仓已：MatchSim 跳过 advance | **保持**；单测命中后 `stunTimer` 在 hitstop 内不变 |
| T8 | 推开与 Place 混通道 | 共识 §4.6；旧 plan T4–T6 | 继续 `queueBlockPush` + `distributePushback`；不改 Place |
| T9 | 多段招 `blockstun` 字符串如 `17*19 (20)` | FAT 6MP | 运行时只用 MMDK 标量；多段 **本阶段按招式已写入的单一 `blockstun`**（现 JSON 已是标量） |
| T10 | GRD 片有 ST/LT/RT | 磁盘文件名 | 本阶段 **只用 `_ST`（正面）**；LT/RT 写入映射表但默认不选（无朝向命中侧数据则禁止猜） |

---

## 2. GRD 命名规律（磁盘实证，禁止另编）

路径：`private/assets/ryu/anims/basic/esf001v00_idle_tired/glb/`  
模式：`GRD_{HEIGHT}{STRENGTH}_{DIR}` 或 系统片 `GRD_STD_*` / `GRD_CRH_*`

| 前缀 | 文件例 | `_fN` | 本方案含义（由文件名+帧长归纳，写入映射表 `notes`） |
|------|--------|-------|------|
| `GRD_STD_START/Loop/END` | `5000`/`5010`/`5020` | 24/190/50 | 站防进入 / 循环 / 离开 |
| `GRD_CRH_START/Loop/END` | `5090`/`5100`/`5110` | 24/190/50 | 蹲防进入 / 循环 / 离开 |
| `H` + L/M/H | `5150_GRD_HL_ST` … `5190_GRD_HH_ST` | 29/39/49 | **站立·高段命中反应** 轻/中/重 |
| `M` + L/M/H | `5220_GRD_ML_ST` … `5260_GRD_MH_ST` | 29/39/49 | **站立·中段命中反应** |
| `L` + L/M/H | `5290_GRD_LL_ST` … `5330_GRD_LH_ST` | 29/39/49 | **站立·低段命中反应**（站防接下段失败走挨打，本阶段反应片仍可先不播；防住路径用不到 LL） |
| `C` + L/M/H | `5360_GRD_CL_ST` … `5400_GRD_CH_ST` | 29/39/49 | **蹲防命中反应** |
| `D` + L/M/H | `5430_GRD_DL_ST` … `5470_GRD_DH_ST` | 29/39/49 | **蹲姿低段/下段反应**（文件名 D；映射表标注 `height: crouchLow`，缺招式字段时 **不要猜**，见选择算法） |
| `_ST` / `_LT` / `_RT` | 同族 | — | 正/左/右；默认 **ST** |

轻重分档（本阶段，写入 `selectGuardReactionClip`）：

- 用招式 `hitstopOnBlock`（MMDK）：`≤9` → L（29f 片）；`10–12` → M（39f）；`≥13` → H（49f）。  
- **依据**：磁盘三档帧长固定；HIT_DT 轻普 `HitStop=9`（C5 5LP）。禁止用 FAT 字符串分档。

选择算法（必须实现为纯函数，见 §4 Step B）：

```
if 未防住 → 不走 GRD 反应（占位 hitstun_light，共识延后干挨）
if 防住:
  strength = hitstopToLMH(move.hitstopOnBlock)
  if dummyCrouch:
    clip = GRD_C{strength}_ST     # CL/CM/CH
  else:
    height = guardToStandHeight(move.guard)  # H→H, mid/midHigh→M, low→L（低段站防失败不会到这里）
    clip = GRD_{height}{strength}_ST
硬直中途改站蹲 → 下一击重选；当前硬直片可切到新姿态对应 Loop（STD/CRH Loop）若仍在硬直且策略变为另一蹲站
硬直结束仍防 → GRD_STD_Loop 或 GRD_CRH_Loop
```

映射表落盘（Step A 产物，执行者必须先写文件再写代码）：

`docs/character-control/action-tables/ryu-grd-clip-map.json`  
同步拷贝运行时：`app/public/data/clips/ryu_grd_clip_map.json`（或并入 `ryu_logic_to_glb_map.json` 的 `moves[]`，**二选一：优先并入现有 map**，避免双源）。

每条必须含：`logicId`, `assetKey`, `path`, `frameCount`, `role`(`start|loop|end|react`), `height`, `strength`, `dir`。

---

## 3. Dummy 三行为（必须实现，定义锁死）

类型（扩展 `app/src/combat/types.ts`，**不要**删旧四模式以免砸现测；面板主选项改为下列三策略）：

```ts
export type DummyGuardPolicy = 'block_all' | 'stand_block' | 'crouch_block';
```

| 面板文案 | 值 | 接触帧姿势 | 防住条件 |
|----------|-----|------------|----------|
| **全部格挡** | `block_all` | **L → 蹲防**；**M / midHigh → 站防**；**H → 保持当前站/蹲（若当前非防则站防）** | 始终姿势正确 → 防住（投技除外） |
| **仅站立格挡** | `stand_block` | 强制站防 | 仅 H、M 防住；**L 没防住** |
| **仅蹲下格挡** | `crouch_block` | 强制蹲防 | 仅 H、L 防住；**M / midHigh 没防住** |

非格挡 `stand` / `crouch`：保留给旧测试「不防挨打」；**默认训练配置改为 `block_all`**（替代 `forceP2Guard: true`）。

投技：`guard === 'throw'` 或 `clipId` 为 `throw_fwd`/`throw_back` → **不可防**（现 MatchSim 已跳过 throw 的 hit∩hurt，保持）。

`forceP2Guard`：从 `CONFIG` **删除或改为 deprecated alias** → 设置时等于 `dummyGuardPolicy='block_all'`。禁止再出现「忽略段位强制防住」。

---

## 4. 分步实现（验收顺序；每步有依据）

### Step A — 数据：`guard` 解析 + 6MP 纠段位 + GRD 映射表

**理论**：C0 §1、C3、C6、磁盘文件名 §2。  
**做**：

1. `MoveDefinition` 增加  
   `guard: 'high' | 'mid' | 'low' | 'midHigh' | 'throw'`  
   `parseMoveDefinition` 读取 JSON `guard`，缺省 `'high'`（官方多数普攻为 H）。  
2. 修正 `app/public/data/moves/ryu_6mp.json`：`guard` → `"mid"`（FAT `atkLvl: M`，共识验收句 7）。其它招对照 `FAT-ryu.json`：仅当 FAT=`M` 且本地=`high` 时改 `mid`；**不得**改 `blockstun`。  
3. 把 41 个 GRD glb 写入 `ryu_logic_to_glb_map.json`：  
   - `block_stand_start/loop/end`  
   - `block_crouch_start/loop/end`  
   - `grd_hl_st` … 全 `_ST` 反应片  
   `_LT/_RT` 可进表 `status: mapped_unused`。  
4. `logicGlbMap.ts` / `ryuMoveIds.ts` 登记上述 logicId（仿现有 `block_stand`）。

**禁止**：改 HIT_DT；改 5LP blockstun。

**验收**：

- 单测 `parseMoveDefinition` 读 `guard`。  
- `ryu_6mp.json` `guard==="mid"`。  
- map 中 `GRD_STD_Loop`、`GRD_CRH_Loop`、`GRD_HH_ST`、`GRD_CH_ST` 路径与磁盘一致。

---

### Step B — 纯函数：段位判定 + 片选择

**新文件**（仅 combat，无 three）：`app/src/combat/systems/GuardPolicy.ts`

必须导出（名称可同，语义不可改）：

```ts
export type GuardLevel = 'high' | 'mid' | 'low' | 'midHigh' | 'throw';

export function normalizeGuard(g: string | undefined): GuardLevel

/** 官方：H 双防；M/midHigh 仅站；L 仅蹲；throw 永不 */
export function canGuard(level: GuardLevel, crouching: boolean): boolean
  // 依据 C0 表 + D3

export function stanceForBlockAll(level: GuardLevel, currentlyCrouching: boolean): 'stand' | 'crouch'
  // L→crouch; mid/midHigh→stand; high→keep; throw→keep（反正不能防）

export function hitstopToStrength(hitstopOnBlock: number | undefined): 'L' | 'M' | 'H'
  // ≤9 L; 10–12 M; ≥13 H

export function selectGuardReactLogicId(args: {
  crouching: boolean;
  guard: GuardLevel;
  hitstopOnBlock?: number;
}): string
  // 返回 map 中 logicId，如 'grd_hh_st'；缺映射返回 'block_stand' 并可由调用方打占位标记
```

**开源对照**：E1 把 mid/overhead/low 当攻击字段；本函数是同一思想的 TS 版，算法只用 C0 表。

**单测** `app/tests/combat/guardPolicy.test.ts`（表驱动）：

| 策略姿势 | 段位 | 期望 canGuard |
|----------|------|----------------|
| 站 | high | true |
| 蹲 | high | true |
| 站 | mid | true |
| 蹲 | mid | false |
| 站 | low | false |
| 蹲 | low | true |
| 蹲 | midHigh | false |
| * | throw | false |

`stanceForBlockAll('low', false)==='crouch'`；`'mid'` → stand。

---

### Step C — Dummy + MatchSim 结算接线

**改**：

1. `DummyController`：增加 `guardPolicy: DummyGuardPolicy`（默认 `'block_all'`）。  
   - `applyPolicyToMode()`：`stand_block`/`crouch_block` 同步旧 `mode`；`block_all` 在接触前保持上一姿势。  
2. `MatchSim` 命中分支（现 L684–717）**替换为**：

```
level = normalizeGuard(mv.guard)
if (policy === 'block_all') {
  const want = stanceForBlockAll(level, dummy.isCrouching())
  dummy.setMode(want === 'crouch' ? 'crouch_block' : 'stand_block')
}
const crouching = dummy.isCrouching()
const trying = dummy.isBlocking() || policy === 'block_all' // block_all 已切 mode
if (trying && canGuard(level, crouching)) {
  resolveBlockOnHit(...)  // 现有函数，damageScale 必须 0（C0 §4）
  p2.applyBlockstun(br.blockstun, { crouching, reactClipId: selectGuardReactLogicId(...) })
  queueBlockPush(...)     // 现有
  lastHitResult = 'block'
  hitstopTimer = br.hitstop
} else if (hits overlap) {
  applyHitstun(mv.hitstun, floor(damage*damageScale))  // 现有占位 clip hitstun_light
  lastHitResult = 'hit'
}
```

3. **保持**：throw clip 短路；hitstop 期间不 `advance`；`distributePushback(total, blockstun)`。  
4. `MatchSim` 默认 opts：`dummyGuardPolicy: 'block_all'`；去掉对「无条件 guard」的依赖。

**单测**（扩展 `matchSim_5lp.test.ts` / 新 `matchSim_guard_policy.test.ts`）：

- 5LP `guard=high` + `stand_block` → `lastHitResult==='block'`，`p2.phase==='blockstun'`，`p2.stunTimer===13`（夹具用真实 5LP JSON 或显式 `blockstun:13`）。  
- 2MK `guard=low` + `stand_block` → `'hit'`。  
- 2MK + `crouch_block` → `'block'`。  
- 6MP `guard=mid` + `crouch_block` → `'hit'`；+ `stand_block` → `'block'`。  
- `block_all` + 2MK → Dummy 变为蹲防且 `'block'`。  
- 防住 `p2.hp` 不变（chip=0）。  
- hitstop 帧内 `stunTimer` 不减（沿用现时钟）。

**改坏旧测**：`forceP2Guard: true` 用例改为 `dummyGuardPolicy: 'block_all'` 或 `stand_block`（5LP 为 H，二者等价）。

---

### Step D — 硬直 vs 动画 vs 站蹲切换

**改 `Fighter.applyBlockstun(frames, opts)`**：

- `clipId = opts.reactClipId`（缺省 `block_stand`）。  
- **不要** `clearStanceTo` 把蹲清掉若 `opts.crouching`（现 L1161 会清蹲，导致蹲防框错）→ 蹲防时保持 crouch 姿态框（`isHurtCrouching()` 已与 dummy 或连）。

**改 stun 结束（L1239–1246）**：

```
if stunTimer<=0:
  if dummy still blocking || guardPolicy active:
    phase = idle 或保持 'blockstun' 结束后的 'idle'
    clipId = crouching ? 'block_crouch_loop' : 'block_stand_loop'
  else:
    clipId = crouching ? 'crouch' : 'idle'
```

逻辑相位：硬直结束后必须 `canAct`（与现 idle 一致），仅 **表现** 停在 Loop。若现 `phase==='idle'` 才 canAct，则结束硬直用 `idle` + 防姿 clip，**不要**把 canAct 锁在 blockstun。

**硬直中改策略**（C0 §6）：`DummyController.setMode` / `setGuardPolicy` 在 `p2.phase==='blockstun'` 时：

- 更新 `isCrouching`  
- `p2.clipId` 切到对应 `block_*_loop`（不重置 `stunTimer`）  
- **下一击** 用新姿势走 `canGuard`（当前这一击已结算，不重算）

**表现（FighterView）**：

- 反应片：`LoopOnce` + `clampWhenFinished=true`（E5，T3）。  
- Loop 片：现有 loop 角色机制（map `role: loop`）。  
- 逻辑帧 scrub 仍跟 `stateTimer`/`stunTimer`：**禁止**用 glb `frameCount` 结束硬直（map `policy.logicVsAnimFrames` 已写）。

**单测**：blockstun N 帧后 `phase` 可行动；`clipId` 在 dummy 仍为 `stand_block` 时为 `block_stand_loop`。硬直中途切 `crouch_block` 不把 `stunTimer` 归零。

---

### Step E — 调试面板（必须公开的参数）

改 `constants.ts`、`DebugGui.ts`、`ControlPanel.ts`（两套 UI **字段对齐**，与现 `forceP2Guard` 双写方式相同）。

**必须出现（名称可本地化，path 锁死）**

| path | 控件 | 说明 |
|------|------|------|
| `dummyGuardPolicy` | select：全部格挡 / 仅站立格挡 / 仅蹲下格挡 | **主测试项** |
| `dummyMode` | 可保留只读或次级：stand/crouch 无防 | 避免与 policy 打架：改 policy 时覆盖 mode |
| ~~`forceP2Guard`~~ | **移除**或改名「已废弃」隐藏 | 防误开无视段位 |
| `enableBlockPush` | toggle | 已有 |
| `blockPushbackTotal` | 0–1.5 | 已有；仅当招式无 `blockPushbackTotal` 时作 fallback（`BlockResolve` 已如此） |
| `blockstunOverride` | -1=表 | 已有；验收默认 -1 |
| `hitstopFramesOnBlock` | fallback | 已有 |
| `enablePushResolve` | toggle | 已有 |
| `applySelfMovement` | toggle | 已有 Place 通道 |

**必须 listen 的探针**（`match.debugProbe` 扩展，HUD/`DebugGui` listen）

| probe | 含义 |
|-------|------|
| `lastHitResult` | `block` / `hit` / `whiff` |
| `lastGuardLevel` | 本击 `H/M/L` |
| `lastGuardOk` | boolean |
| `p2Phase` | 已有类字段则复用 |
| `p2StunTimer` | 硬直剩余 |
| `p2ClipId` | 当前 GRD logicId |
| `p2Crouching` | 结算用姿势 |
| `dummyGuardPolicy` | 当前策略 |

ControlPanel「人偶模式」下拉 **三个主选项** 对应 `dummyGuardPolicy`（用户要求）。站立/下蹲无防可放进「高级」或次级下拉，避免测试时选错。

---

### Step F — 全招覆盖与占位

- 指令表应接招式：命中走 §C 同一函数，**禁止** 5LP 专用分支。  
- `selectGuardReactLogicId` 找不到 map → `clipId='block_stand'` 或 `'block_crouch_loop'` + `debugProbe.guardClipFallback=true`（共识「缺片可见占位」：HUD 显示 fallback）。  
- 不接 `DPA_*` Drive 防片。

---

## 5. 调试面板清单（复制用）

**对局**

- `dummyGuardPolicy` ∈ `{block_all, stand_block, crouch_block}`  
- 重置对局（已有）

**战斗 / 防住**

- `enableBlockPush`  
- `blockPushbackTotal`  
- `blockstunOverride`（验收 -1）  
- `hitstopFramesOnBlock`  
- `enablePushResolve`  
- `applySelfMovement` / `selfMovementScale`

**只读 HUD**

- `lastHitResult` `lastGuardLevel` `lastGuardOk` `p2StunTimer` `p2ClipId` `p2Crouching`

**禁止上新面板**

- chip 开关（共识不做）  
- 接近防  
- FAT blockstun 覆盖旋钮  

---

## 6. 测试与手动验收

### 自动化

| 文件 | 覆盖 |
|------|------|
| `guardPolicy.test.ts` | 段位矩阵、block_all 选姿、strength 分档 |
| `blockOnHit.test.ts` | 保持 damageScale=0、MMDK 字段优先 |
| `matchSim_guard_policy.test.ts` | 三策略 × 5LP/2MK/6MP |
| 更新 `matchSim_5lp.test.ts` | 去掉 forceP2Guard 无条件防 |

抽测锁死：5LP `blockstun===13`（C5）。

### 手动（浏览器）

1. 全部格挡：5LP / 2MK / 6MP 均 `lastHitResult=block`，2MK 时姿势变蹲。  
2. 仅站立格挡：2MK 为 hit；5LP、6MP 为 block。  
3. 仅蹲下格挡：6MP 为 hit；2MK、5LP 为 block。  
4. 防住无掉血；有 hitstop 与推开。  
5. 硬直中切仅蹲下：剩余硬直不变；下一招按蹲结算。  
6. 硬直结束仍「仅站立格挡」：播 `GRD_STD_Loop` 而非普通 idle。  
7. HUD `p2ClipId` 随高低轻重变化（5LP→HL 档，重拳 hitstop≥13→HH/MH/CH）。

---

## 7. 文件改动白名单

| 路径 | 动作 |
|------|------|
| `app/src/combat/types.ts` | +`DummyGuardPolicy` |
| `app/src/combat/systems/GuardPolicy.ts` | **新建** |
| `app/src/combat/systems/BlockResolve.ts` | 不改算法；可被 Guard 调用 |
| `app/src/combat/match/DummyController.ts` | policy |
| `app/src/combat/match/MatchSim.ts` | 命中分支 |
| `app/src/combat/fighter/Fighter.ts` | applyBlockstun / stun 结束 / 硬直中切姿 |
| `app/src/combat/move/MoveDefinition.ts` | +`guard` |
| `app/src/data/logicGlbMap.ts` · `ryuMoveIds.ts` | 登记 clip |
| `app/public/data/clips/ryu_logic_to_glb_map.json` | GRD 条目 |
| `app/public/data/moves/ryu_6mp.json`（及其它 FAT=M 误标 high 的招） | 只改 `guard` |
| `app/src/config/constants.ts` | 默认 policy；移除误导开关 |
| `app/src/debug/DebugGui.ts` · `ControlPanel.ts` | §5 |
| `app/src/render/FighterView.ts` | 仅当现有 loop/once 不够：反应片 `clampWhenFinished`；禁止新加载管线 |
| `app/tests/combat/guardPolicy.test.ts` 等 | 新建/改夹具 |
| `docs/character-control/action-tables/ryu-grd-clip-map.md` | 命名规律说明（与 JSON 一致） |

**不要改**：`PushResolve.ts` 算法、Place、Drive、MMDK 转换脚本（除非发现 `guard` 未写出——6MP 以手工对照 FAT 为准）。

---

## 8. 执行中若 BLOCKED

| 现象 | 处理 |
|------|------|
| 某 GRD glb 缺失 | map `status: missing` + 占位 clip；不要生成假动画 |
| 多段招只有一个 blockstun | 用 JSON 标量；不要解析 FAT `17*19` |
| `FighterView` 无 LoopOnce API | 读现有 `animRole`/`clips[].role`；用 three `LoopOnce`+`clampWhenFinished`（E5） |
| 旧测试依赖 forceP2Guard | 改为 `stand_block` 或 `block_all`，禁止恢复无条件防 |

---

## 9. 完成定义

- 共识 `consensus-block-guard-v0.md` §8 七条验收句全部可在训练场复现。  
- Dummy 面板三项可切换且行为与 §3 表一致。  
- 5LP 防硬直 13；6MP 为过顶；chip 为 0。  
- 无接近防、无 Drive 防、无 FAT 覆盖硬直。  
- `combat/` 无 three import。

# AI 可执行方案：框 · 推挤 · 防住 · 攻击位移管线（§4.7）

> **⚠️ 废档说明（2026-08-13）**：本文含历史「本阶段切片 / 推荐顺序分步」口吻。  
> **执行须改以现行共识为准**：`docs/consensus-v0.md` **§0** + `docs/character-control/consensus-design-v0.md` **§0 / §3.12 / §4（2026-08-13）**。  
> **写进共识 = 完整实现**；禁止 MVP/P0；待机三绿、两层装配、指令表逻辑+框全覆盖、红框不残留。  
> 下文仅作技术细节参考，**不得**再把目标缩成「先一招样板」。

> **文档类型**：实现执行规范（历史），**不是**共识正文。  
> **节点**：2026-08-12（正文未全文重写）  
> **对齐共识（现行）**：`consensus-design-v0.md` **§3.10 / §3.12 / §4 / §6.7–§6.8**（2026-08-13 修订）  
> **上级产品**：`docs/consensus-v0.md`（R2 本地表权威、2D 逻辑 / 3D 表现）  
> **ADR**：`ADR-001`（60Hz）、`ADR-002`（中心+全宽高）、`ADR-003`（0-based moveFrame / active 公式）  
> **本阶段目标**：在现有 `app/` 训练场上，打通 **MMDK JSON 双源适配 → 三类框 → 推挤 → 击中停顿 → P2 真格挡（硬直+推开）→ 攻击 Place 曲线位移 → 指令表普攻整包**；调试三类框与关键参数全开。  
> **明确后置**：干挨分部位受击动画、倒地弹墙、`.fchar` 解析主路径、接近防精做、弹幕、投技抓取深度、Drive 全家桶。

---

## 硬性规则（执行者必读）

1. **禁止自我发挥**：每步只能用本文件列出的仓库、API、字段、路径与算法。缺源数据或字段映射不明 → 写 `BLOCKED:` + 具体缺什么，**不要**发明第二套架构或单位制。  
2. **禁止**把 `private/` 下 MMDK 原始 dump、Capcom/rip 二进制提交公开 git（见根 `.gitignore` 与共识 §6.8）。  
3. **逻辑权威**永远是本地运行时 JSON（`app/public/data/`）；`AnimationMixer` / glb 长度 **不得**决定 total、框开闭或 canAct。  
4. **双源锁死**：  
   - `frames.total` / startup / active / recovery / onBlock → **公开帧表**（4rays / SuperCombo / Capcom）写入本地后只读；  
   - 框几何、框时间轴、攻击 Place 曲线、HIT 表防住相关 → **MMDK 私人 JSON 转换**后写入本地。  
5. **推荐实现顺序不可跳步验收**：① 走冲跳尺子已对齐（基线）→ ② 一招（5LP）打通全链路 → ③ 指令表普攻铺开。  
6. 每步结束必须满足 **验收标准**；附 **Vitest 单测** 和/或 **手动清单**。  
7. `combat/` **禁止 import three**；框绘制只在 `render/DebugDraw.ts`。

---

## 0. 现状基线（执行前必读，禁止推倒重写）

| 已有 | 路径 | 本阶段如何用 |
|------|------|----------------|
| 逻辑 60Hz 时钟 | `app/src/combat/frameClock.ts` | 保持；hitstop 时仍采样输入、跳过 advance（已部分实现） |
| 招式定义 / 解析 | `MoveDefinition.ts`、`parseMoveDefinition` | **扩展** schema：push 盒、selfMovement 长度≠total、timeline 元数据；**不**新建平行类型体系 |
| 出招播放 | `MovePlayer.ts` | **改造**：timeline 可长于 `frames.total`；Hit 关、Hurt/Push/位移可残留 |
| 角色状态 | `Fighter.ts` | 已有 attack residual `animTail`、selfMovement、blockstun/hitstun；**补** push 框、防御推开通道、timeline residual 打断 |
| 对局编排 | `MatchSim.ts` | 已有 hit∩hurt + hitstop + dummy 防/受；**补** 推挤、固定帧顺序、P2 方案甲强制格挡、block pushback |
| AABB | `Box2D.ts` `aabbOverlap` / `faceBox` | 唯一几何；ADR-002 |
| 调试绘制 | `DebugDraw.ts` | 已有 hit 红 / hurt 绿；**补** push 色与开关 |
| lil-gui | `DebugGui.ts` + `constants.ts` | **扩展**面板字段（§调试专章） |
| 走冲跳尺子 | `ryu_movement.json` + `WalkController` / `DashProfile` | **先验收尺子**再套攻击单位 |
| 公开帧样板 | `public/data/moves/ryu_5lp.json`、`generated/*` | 4rays 转表；框仍 placeholder |
| 指令表 | `ryu-command-list-classic.md` + `ryuCommands.ts` | 普攻覆盖清单 |
| 单测 | `app/tests/combat/*` | 延续 Vitest；新增 push/block/timeline 用例 |

**现有关键缺口（本方案必须关闭）**

| 缺口 | 证据 |
|------|------|
| 无推挤 | `MatchSim.step` 无 push 分离；`MoveDefinition.boxes` 解析未读 `push` |
| 无 push 绘制 | `DebugDraw` 无 push |
| total 截断时间轴 | `MovePlayer.advance` 在 `moveFrame >= total` 清空 move → 残留框/位移无法跟时间轴（违反 §3.12） |
| 走路不打断攻移 | residual 位移未实现；走路与 selfMovement 无互斥 |
| 防御推开 | `applyBlockstun` 无位置通道 |
| P2 真格挡方案甲 | Dummy 可选 stand_block，**非**全程强制；共识本阶段甲 |
| MMDK 适配管线 | 仓库无转换脚本；`private/` 无 MMDK 落盘约定文档外的路径规范 |
| 单位标定 | `selfMovementScale` 默认 1，无 MMDK 单位→逻辑单位说明 |

---

## 1. 权威依据总表（全文引用；禁止另找「等价」替代）

### 1.1 本仓库文档（规格）

| 编号 | 依据 | 用途 |
|------|------|------|
| C0 | `docs/character-control/consensus-design-v0.md` §3.10, §3.12, §4, §6.7–6.8 | **唯一行为规格** |
| C1 | `docs/consensus-v0.md` | 产品边界 R2、D2/H2 |
| C2 | `docs/character-control/action-tables/schema-move-table.md` | 本地表最低字段 |
| C3 | `docs/character-control/action-tables/sourced-movement/ryu-movement.md` | 走冲跳尺子 |
| C4 | `docs/character-control/action-tables/ryu-command-list-classic.md` §2–3 | 普攻/独特技清单 |
| C5 | `docs/decisions/ADR-001|002|003` | 帧率 / 盒 / 索引 |
| C6 | `docs/research/sf6-character-control-research-2026-08-10.md` | SF6 缓冲/系统数字调研 |
| C7 | `docs/research/character-control-implementation-cases-2026-08-10.md` | 开源对照索引 |
| C8 | `docs/plans/ai-execution-plan-mvp-5lp-v0.md` | 栈与目录纪律（延续） |

### 1.2 外部数据与工具（采信 / 转换）

| 编号 | 资源 | URL | 用法 |
|------|------|-----|------|
| D1 | **MMDK** | https://github.com/alphazolam/MMDK | 主路径 JSON：`PlayerData/Ryu/`（`rects`、`moves_dict`、`HIT_DT` 等）；**禁止**提交原始 dump |
| D2 | MMDK README 键语义 | 同上 README「Key Types」「JSON Data」 | `AttackCollisionKey` / `DamageCollisionKey` / `PlaceKey` / `SteerKey` / `fab.Frame` |
| D3 | MMDK methods | https://github.com/alphazolam/MMDK/blob/main/MMDK%20methods.lua | `dump_rects_json` / `dump_moves_dict_json` / `dump_hit_dt_json` |
| D4 | SF6 Hitbox Viewer | https://github.com/WistfulHopes/SF6Mods | 目视对照；非运行时依赖 |
| D5 | SuperCombo Movement | https://wiki.supercombo.gg/w/Street_Fighter_6/Movement | 走/冲/跳 |
| D6 | SuperCombo Ryu | https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu | 角色帧与距离 |
| D7 | SuperCombo Game Data | https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data | hitstun/blockstun/hitstop 定义 |
| D8 | SuperCombo Offense | https://wiki.supercombo.gg/w/Street_Fighter_6/Offense | 防串、同帧 strike>throw 等 |
| D9 | Capcom 官方帧表 Ryu | https://www.streetfighter.com/6/en-us/character/ryu/frame | total / advantage 交叉 |
| D10 | Ultimate Frame Data SF6 | https://ultimateframedata.com/sf6/ | 交叉 |
| D11 | 4rays/sf6-move-data | https://github.com/4rays/sf6-move-data | 公开帧 TOML；**可能滞后 patch**；已有 `generated/` |
| D12 | 本仓 4rays 转表 | `app/public/data/moves/generated/` | 普攻 bulk 起点 |

### 1.3 开源实现（只读语义；禁止 vendoring 整仓）

| 编号 | 资源 | URL | 对照本项目模块 | 允许操作 |
|------|------|-----|----------------|----------|
| E1 | chriscourses/fighting-game | https://github.com/chriscourses/fighting-game | 矩形 hit/hurt 最小闭环 | TS **重写**进 combat |
| E2 | Ikemen-GO | https://github.com/ikemen-engine/Ikemen-GO | 状态/硬直/暂停语义 | **读概念**；不移植 Go |
| E3 | Sakuga-Engine | https://github.com/NoisyChain/Sakuga-Engine | 表驱动 hit/hurt、2D 逻辑 3D 表现 | 读状态块；**不抄** rollback |
| E4 | Castagne | https://github.com/panthavma/castagne · docs https://castagneengine.com/docs/ | 逻辑层与工具层分离 | 结构参考 |
| E5 | three.js lil-gui | `three/addons/libs/lil-gui.module.min.js` | 调试面板 | 与现 `DebugGui` 一致 |
| E6 | three LineSegments 画框 | 现有 `DebugDraw.ts` | 推挤框同法 | 扩展颜色常量 |

### 1.4 理论 / 社群讨论（坑与算法）

| 编号 | 资源 | 用途 |
|------|------|------|
| T1 | Gaffer — Fix Your Timestep | 固定逻辑步（已实现，勿改坏） |
| T2 | Capcom SFV 专栏 Hit/Block stop vs stun | hitstop 偏系统档、stun/pushback 偏招式属性（SF6 同族思维）https://game.capcom.com/cfn/sfv/column/131545?lang=en |
| T3 | Reddit gamedev hit-stop | 实现方式：双方暂停动画/位移若干帧 https://www.reddit.com/r/gamedev/comments/8a3y87/hitstop_in_fighting_games/ |
| T4 | Unity 讨论 pushboxes | 推挤后位移「发黏/穿模」常见坑 https://discussions.unity.com/t/how-do-you-make-pushboxes-in-fighting-games/1668101 |
| T5 | Godot pushbox 讨论 | 半量分离、剩余位移 https://forum.godotengine.org/t/inconsistent-and-squishy-behavior-with-area2ds-for-fighting-game-pushboxes/80790 |
| T6 | GameMaker push box | 重叠 1px 抖动 https://forum.gamemaker.io/index.php?threads/fighting-game-push-box-code.94766/ |
| T7 | Infil Glossary · Pushbox / Pushback | 术语 https://glossary.infil.net/ |
| T8 | Andrea Jens Part 7 hitstun | 硬直与连段坑 https://andrea-jens.medium.com/i-wanna-make-a-fighting-game-a-practical-guide-for-beginners-part-7-56f32f706a46 |
| T9 | pressbuttonwin hitboxes | 推挤盒 vs hurt 说明 https://www.pressbuttonwin.com/p/why-did-that-miss |
| T10 | MMDK Discord（README 链） | 字段实装歧义时社区对照；**不得**把未写入本地审查的口述当运行时权威 |

### 1.5 明确禁止引用 / 禁止做的事

- 运行时 HTTP 拉 FAT / SuperCombo / MMDK GitHub 当权威  
- 解析 `.fchar` 作为本阶段主路径（共识 §6.8）  
- 用 glb root motion **覆盖** 已有 MMDK Place 曲线  
- 把攻击 Place 与防御推开混成同一数组字段  
- 冲刺逻辑位移进 residual（§3.7.1；与出招 residual 不同）  
- React / R3F / Rapier 作对战碰撞（本栈纯 AABB；`package.json` 无物理依赖作对战权威）

---

## 2. 锁定技术栈（延续现仓，禁止替换）

| 组件 | 选型 | 版本策略 |
|------|------|----------|
| 语言 | TypeScript strict | 现 `app/tsconfig.json` |
| 构建 | Vite | 现 `vite.config.ts` |
| 渲染 | three **WebGPU** | `three` 现依赖；`import from 'three/webgpu'` |
| 测试 | Vitest | `npm test` |
| GUI | three 内置 lil-gui | `DebugGui.ts` |
| 数据 | JSON only 运行时 | `app/public/data/**` |
| 转换工具 | Node ESM 脚本（`tools/` 或 `app/scripts/`） | 只读 private MMDK → 写出 public moves |

---

## 3. 目标目录与文件（必须按此落点）

```text
StreetFighter6/
  private/                              # gitignored
    mmdk/                               # 新建约定（勿提交）
      README.md                         # 可提交？→ 否；仅本地说明可放 docs
      Ryu/
        rects.json                      # dump_rects_json
        moves_dict.json                 # dump_moves_dict_json 或自带
        hit_dt.json                     # dump_hit_dt_json / HIT_DT_TBL
        SOURCE.txt                      # MMDK 版本/日期/游戏补丁
  docs/
    character-control/action-tables/
      mmdk-field-map.md                 # 字段映射审查（可提交，无原始 dump）
      unit-calibration.md               # MMDK 单位 → 逻辑单位
      sourced-framedata/…               # 已有
    plans/
      ai-execution-plan-boxes-push-block-displace-v0.md  # 本文件
  tools/
    mmdk_convert/                       # 新建
      README.md
      convert_ryu_normals.mjs           # 或 .ts + tsx；推荐纯 .mjs 少依赖
      schema_notes.md                   # 与 mmdk-field-map 同步
  app/
    public/data/
      moves/
        ryu_5lp.json                    # 样板：完整框+位移+block 参数
        ryu_*.json                      # 普攻整包（可由 generated 提升）
        systems/
          ryu_movement.json             # 尺子（已有）
          combat_constants.json         # 可选：默认 hitstop/push 占位
    src/combat/
      boxes/
        Box2D.ts                        # 可加 overlapX / separatePush
        Collision.ts                    # hit∩hurt + push resolve
        RectLibrary.ts                  # 新建：rectId → 几何（运行时用烘焙结果可省略）
      move/
        MoveDefinition.ts               # 扩展
        MovePlayer.ts                   # 双轨时间轴
        MoveCatalog.ts
      fighter/Fighter.ts
      match/MatchSim.ts
        DummyController.ts              # 方案甲默认
      systems/
        Hitstop.ts                      # 可选抽出；或留 MatchSim
        BlockResolve.ts                 # 新建：防住结算
        PushResolve.ts                  # 新建：推挤
        DisplacementChannels.ts         # 新建：通道枚举/应用
    src/render/DebugDraw.ts
    src/debug/DebugGui.ts
    src/config/constants.ts
    tests/combat/
      pushResolve.test.ts
      blockOnHit.test.ts
      timelineResidual.test.ts
      placeDiff.test.ts
      mmdkConvert_smoke.test.ts         # 若转换可无游戏数据则测差分纯函数
```

---

## 4. 数据模型（运行时唯一权威）

### 4.1 扩展 `MoveDefinition`（在现类型上增字段，禁止平行命名体系）

```ts
// 语义；键名必须与 parseMoveDefinition 一致
boxes: {
  hurt: TimedBox[];  // from/to inclusive on moveFrame (ADR-003)
  hit: TimedBox[];
  push: TimedBox[];  // 新增：解析现 JSON 已有 push 字段
};

/** 相对起招累积位置差分后的每帧增量（逻辑单位，面向 +X） */
selfMovement?: number[];   // dx[i] 对应 moveFrame === i
selfMovementY?: number[];  // 可选；数据有则做

/** 动作时间轴长度：框/位移取样上限；可 > frames.total（§3.12） */
timelineFrames?: number;   // 缺省 = max(total, max(box.to)+1, selfMovement.length)

/** 防住（本阶段） */
blockstun: number;         // 已有；优先 HIT/公开
hitstun: number;           // 干挨后置仍可填
/** 命中当帧起防御推开：受击者沿远离攻击者方向（逻辑 X） */
blockPushback?: number[];  // 按 stun 帧或固定表；缺则用常量表
/** 或简化：首帧冲量 + 衰减 —— 本阶段允许常量 */
blockPushbackTotal?: number; // 若数组缺省，用该总量在 blockstun 内分配

hitstopOnBlock?: number;   // 缺省 → MatchSim opts
hitstopOnHit?: number;     // 本阶段 P2 真格挡主要用 onBlock

review: { status: 'placeholder' | 'reviewed' | 'mmdk_converted'; notes: string };
sources?: ...;
mmdk?: { actionId?: number; actionName?: string; fabFrame?: number };
```

### 4.2 帧索引（锁死 ADR-003）

- `moveFrame` **0-based**  
- Hit active（公开 startup/active）：`moveFrame >= (startup-1) && moveFrame < (startup-1+active)`  
- TimedBox：`from`/`to` **inclusive**  
- **几何优先** timed boxes；公开 startup/active 用于缺盒时的 active 推断与 HUD

### 4.3 位移通道（§3.10 分通道；禁止混写）

| 通道 id | 写入谁 | 来源 | hitstop 时 |
|---------|--------|------|------------|
| `loco_walk` | 行走控制器 | `ryu_movement` | 不走（双方冻结则跳过 advance） |
| `loco_dash` | dash 表 | 公开距离 + 前重曲线 | 冻结 |
| `loco_jump` | 跳表 | 公开 | 冻结 |
| `attack_place` | 攻击 Place 差分 | MMDK→`selfMovement` | **冻结** |
| `block_push` | 防御推开 | HIT/占位 | **冻结** |
| `hit_push` | 干挨击退 | **后置** | — |

**单写者**：仅逻辑 `Fighter.x/y`；表现 `worldScale` 跟逻辑。

### 4.4 Place 曲线差分（理论依据 D2）

MMDK README：

- **`PlaceKey`**：「frame-by-frame」移动  
- **`SteerKey`**：方向性移动（本阶段 **Steer 后置**，缺省忽略）

共识 §3.10：Place 类多为 **相对起招累积位置**，不是现成 `dx[]`。

**强制算法**（转换脚本内）：

```text
placeCum[0..N-1]  // 来自 MMDK 每帧累积位置（本地/角色前向）
dx[0] = placeCum[0] - 0
dx[i] = placeCum[i] - placeCum[i-1]  for i>=1
// 单位：先乘 UNIT_SCALE（见 Step 0 标定），再写入 selfMovement
```

禁止把 `placeCum[i]` 直接当每帧速度。

---

## 5. 每逻辑帧固定顺序（锁死；单测覆盖）

对齐共识 §4.4 默认顺序 + 现有 hitstop 输入策略：

```text
MatchSim.step 一帧：
  1. 采样输入 → history（hitstop 中仍执行）
  2. 解析意图 / action buffer 消费（hitstop 中仍执行；执行出招可后置到解冻首帧——见陷阱）
  3. if hitstopTimer > 0:
       hitstopTimer--
       // 不：位移、推挤、命中检测、mover.advance、stun 倒数（可选：stun 是否倒数见陷阱表，默认与现码一致 = 不 advance）
       return
  4. 应用本帧脚本/攻击 Place / loco / block_push 位移（各通道）
  5. 推挤结算 Push∩Push → 分离 X（及边界 clamp）
  6. Hit∩Hurt 判定（未 hasHitThisMove；P2 方案甲 → 一律防住）
       成功 → 设 hasHit、applyBlockstun、block_push 注入、hitstopTimer
  7. Fighter.advance：推进 moveFrame / stun / dash / jump / residual timeline
  8. 操作打断规则（见 §6）
```

**现码偏差必须修正**：当前 `MatchSim` 在 hitstop 前做了 locomotion、在 hitstop 后才 collision，且 collision **先于** `advance` 的 selfMovement。  
**本方案锁死**：位移 → 推挤 → 判定；与共识 §4.4 一致。改后更新 `matchSim_5lp.test.ts` 等期望。

---

## 6. 时间轴双轨与打断（§3.12 + §3.7.1）

### 6.1 两套时钟

| 时钟 | 字段 | 含义 |
|------|------|------|
| 可操作时钟 | `frames.total` | `canAct` 在 moveFrame 达到 total 后为 true（逻辑锁结束） |
| 动作时间轴 | `timelineFrames` + `moveFrame` | 框/Place 取样；可继续到 timeline 结束 |

### 6.2 MovePlayer 改造要点（禁止用 glb 定 total）

- **不要**在 `moveFrame >= total` 时立刻 `move = null`。  
- 引入状态：  
  - `logicLocked`: `moveFrame < total`  
  - `timelineActive`: `move != null && moveFrame < timelineFrames`  
- `canAct`：逻辑锁结束且非 stun/dash/jump 等（与 Fighter.phase 协同）。  
- 逻辑锁结束后：`phase` 可回 idle/walk，但可保留 `timelinePlayer` 或 `animTail` **同源帧号** 继续取样 Hurt/Push/Place，直到打断。  
- **Hit 盒**：仅当 timed hit 覆盖 **或**（无 timed 时）`isHitActive()`；active 结束后不再出 Hit。  
- **Hurt/Push**：按 timed 范围，可 `to >= total`。

推荐结构（二选一，选定后全文一致）：

**方案 R（推荐，贴现 residual）**：

- `logic total` 结束 → `beginAnimTail` 已有；  
- **扩展** `animTail`：保存 `moveRef` 或烘焙后的 `residualBoxes` + `residualSelfDx[]` + `visualFrame`；  
- residual 帧继续应用 `attack_place` 与 Hurt/Push 世界盒。

**方案 T（timeline 对象）**：

- `Fighter.timeline: { move, frame, until }` 独立于 phase；  
- phase 只管 canAct 状态机。

### 6.3 打断规则（必须单测）

| 条件 | 行为 |
|------|------|
| total 到 + 新攻击/冲/跳 | 清 timeline residual；清 attack_place；清旧框 |
| total 到 + **开始走路** | **立刻**清 residual attack_place（选项 A）；**不**与 walk 速度叠加 |
| total 到 + 站桩 | residual 动画可继续；Place 可继续；Hurt/Push 可继续 |
| 新招覆盖 | 旧 hasHit 重置；新 MovePlayer.start |

冲刺 residual：逻辑位移 **不** 进 residual（已有 dash 行为；勿改坏）。

---

## 7. 推挤算法（必须实现）

### 7.1 理论

- 术语：Pushbox / collision box 重叠则水平分离（T7、T9）。  
- 社群坑：每帧半分离不稳、空中穿模、角落「挤进墙」（T4、T5、T6）。  

### 7.2 本阶段算法（固定；禁止换物理引擎）

在 `PushResolve.ts`：

```text
function resolvePush(a: Fighter, b: Fighter, stage: { minX, maxX }): void {
  const pa = a.worldPushBoxes()  // 可多个：取并或逐对
  const pb = b.worldPushBoxes()
  for each pair (boxA, boxB) overlapping on X and Y:
    overlapX = min(rightA,rightB) - max(leftA,leftB)
    if overlapX <= 0: continue
    // 均分水平分离
    dir = sign(b.x - a.x) || a.facing  // 重合中心时用面向
    a.x -= dir * (overlapX / 2)
    b.x += dir * (overlapX / 2)
  clamp both to [minX, maxX]
  // 角落二次：若仍重叠且一方顶墙，把重叠量全部推给另一方
}
```

- Y 轴本阶段：站立推挤以水平为主；空中可做 X 分离但 **不** 做完整 juggle 推挤精修。  
- 默认站立 push 占位：若无数据，用 `w=0.55,h=1.4,y=0.7`（与 `ryu_5lp.json` push 占位一致）。  

### 7.3 验收

- 两人相向走：停在推挤接触面，不穿模。  
- 贴身后 5LP 防住：仍先分离再判定（顺序 §5）。  
- 角落：防守方贴边时攻击推开不导致双方重叠残留 > epsilon。

---

## 8. 击中 → 防住（§4.6 方案甲）

### 8.1 规则

| 项 | 实现 |
|----|------|
| P2 | `DummyController` 默认 `stand_block`；`MatchSim` **强制** `isBlocking()===true`（本阶段开关 `forceP2Guard=true` 默认开） |
| 判定 | `hitOverlapsHurt`（已有） |
| 结果 | **只走** `applyBlockstun` + 防御推开；`lastHitResult='block'` |
| 伤害 | 可 0 或极少；**不得**省略 stun/hitstop/push |
| 动画 | P2 `clipId='block_stand'`（已有）；干挨分部位 **后置** |
| hitstop | 双方同一 `hitstopTimer`（现结构）；帧数：招式 `hitstopOnBlock` → 否则 opts → 默认 8 |

### 8.2 blockstun 来源优先级

1. 本地招式 `blockstun`（由 HIT_DT / 公开表写入）  
2. 由 `advantage.onBlock` 与 recovery **推导**（现 `parseMoveDefinition` 已有占位公式，**审查后**可保留为 fallback）  
3. 全局占位常数（GUI 可调）

公式关系（公开帧数据惯例，用于审查而非唯一权威）：

```text
onBlock ≈ blockstun - recovery_after_active  （不同游戏/表记法略有差；以本地审查为准）
```

### 8.3 防御推开

- 通道 `block_push`：只改 **防守方** `x`，方向 = 远离攻击者（`sign(defender.x - attacker.x)` 或 attacker.facing）。  
- 缺 MMDK 推开参数时：`blockPushbackTotal` 默认与 walk 同单位（例如 `0.15`～`0.35` 逻辑单位，**GUI 可调**，写入 `combat_constants`）。  
- hitstop 期间 **不** 应用推开剩余量（与攻击 Place 同冻）。

### 8.4 参考实现语义

- E1 最小 hit 闭环；T3 hitstop 暂停；T2 stun vs stop 分离。  
- 本仓已有 `hitstopTimer` 早退：保留「输入仍采样」。

---

## 9. 分步执行计划（AI 按序；每步可独立 PR）

### Step 0 — 环境与尺子验收（阻塞项）

**理论依据**：共识 §3.10「先对齐走/冲/跳尺子」；C3。  

**动作**：

1. `cd app && npm test` 全绿基线。  
2. 手动或测试：前走 `0.047`、后走 `0.032`、前冲 19f·1.252、后冲 23f·0.923、跳 4+38+3（见 `ryu-movement.md`）。  
3. 确认 `WORLD_SCALE` 与模型对齐可玩。  

**MMDK 私人数据准备**（人工前置，AI 检测）：

```text
private/mmdk/Ryu/rects.json
private/mmdk/Ryu/moves_dict.json
private/mmdk/Ryu/hit_dt.json
private/mmdk/Ryu/SOURCE.txt
```

若缺失 → `BLOCKED: missing private MMDK JSON`；**不得**伪造框数据冒充 reviewed。  
允许在 BLOCKED 时用 **placeholder 盒** 继续跑通管线，但 `review.status` 必须 `placeholder`。

**验收**：测试通过；尺子与文档一致；BLOCKED 状态写明。

---

### Step 1 — 字段映射文档 + 单位标定（无游戏行为变更）

**依据**：D1–D3、§6.8。  

**动作**：

1. 新建 `docs/character-control/action-tables/mmdk-field-map.md`，用 **真实** JSON 键路径（打开 private 文件记录）填写表：

| MMDK 路径 | 语义 | 本地字段 |
|-----------|------|----------|
| `rects[id].OffsetX/Y SizeX/Y`（或实际键名） | 矩形库 | 转换时几何 |
| `AttackCollisionKey` Start/End + BoxList id | 攻击框时段 | `boxes.hit[]` |
| `DamageCollisionKey` + Head/Body/Leg lists | 受伤框 | `boxes.hurt[]`（可合并多块） |
| Push 相关 key 名（以 dump 为准） | 推挤 | `boxes.push[]` |
| `PlaceKey` 帧位置 | 累积位置 | → 差分 `selfMovement` |
| `fab.Frame` / 动作总帧 | 时间轴长 | `timelineFrames`（**不是**公开 total） |
| `HIT_DT` HitStop* / MoveTime / 推开向量等 | 停顿硬直推开 | hitstop/blockstun/blockPushback |
| 动作名 `ATK_5LP` 等 | 映射 moveId | `ryu_5lp` |

2. `unit-calibration.md`：  
   - 取 MMDK 矩形宽度 vs 训练场已知站立 hurt 占位 `w=0.7`；  
   - 或：取公开前走速与角色 mesh 比例交叉；  
   - 写出 `UNIT_SCALE = logicUnits / mmdkUnits` 唯一常数（进转换脚本与 GUI `mmdkUnitScale`）。  

**禁止**：未打开真实 JSON 就臆造键名。键名以 private 文件为准；文档可提交。

**验收**：文档含至少 1 个真实键路径摘录（可打码大数组）；`UNIT_SCALE` 有推导过程。

---

### Step 2 — 转换脚本 `tools/mmdk_convert`

**依据**：D1–D3、§4.7 项 1、§6.8。  

**动作**：

1. 实现 `convert_ryu_normals.mjs`：  
   - 输入：private MMDK + 公开帧表（`generated/ryu_5lp.json` 等的 frames）  
   - 输出：`app/public/data/moves/ryu_*.json`  
   - **双源合并规则**：  
     - frames.* 与 advantage 以公开/generated 为准  
     - boxes / selfMovement / timelineFrames / hitstop / block 推开以 MMDK 转换结果为准  
     - 冲突写 `review.notes`  
2. 矩形：Offset/Size → ADR-002 中心制：  

```text
// 若 MMDK 为左下/中心需在 field-map 写死一种；下面假设 Offset=中心（以 dump 验证）
x = OffsetX * UNIT_SCALE
y = OffsetY * UNIT_SCALE
w = SizeX * UNIT_SCALE
h = SizeY * UNIT_SCALE
// 若 Offset 为角点：x = (OffsetX + SizeX/2) * UNIT_SCALE 等——以 field-map 锁定一种
```

3. Place 差分见 §4.4。  
4. CLI：`node tools/mmdk_convert/convert_ryu_normals.mjs --only 5lp`  

**验收**：对 5LP 产出 JSON：`boxes.hit` 非空或明确 placeholder；`timelineFrames` 有值；`selfMovement.length === timelineFrames` 或显式 0 填充；公开 `total` 仍为 13（5LP）。

---

### Step 3 — 运行时 schema + 矩形装配

**依据**：§4.1–4.3、ADR-002、C2。  

**动作**：

1. `parseMoveDefinition` 解析 `boxes.push`、`timelineFrames`、`selfMovementY`、`blockPushback*`、`hitstopOnBlock`。  
2. `MovePlayer`：`currentPushBoxesLocal()`；hurt/hit 在 residual 可查。  
3. `Fighter.worldPushBoxes()` / residual 世界盒。  
4. 单测：镜像 facing、center 约定。

**验收**：`npm test`；5LP JSON load 后 push 数组长度 ≥1（占位可）。

---

### Step 4 — 时间轴双轨 + 攻击位移残留 + 走路打断

**依据**：§3.12、§3.7.1。  

**动作**：

1. 按 §6 改造 `MovePlayer`/`Fighter`/`MatchSim`。  
2. `attack_place` 在 residual 继续；hitstop 冻。  
3. 走路 intent 且 canAct：`clearAttackDisplaceResidual()`。  
4. 新 dash/jump/attack：清旧 timeline。  

**单测**：

- total=13、timeline=20、selfMovement[15]=0.01 → 站桩到 frame15 仍位移；  
- frame13 后 walk → 位移停止；  
- 新 5LP 打断旧曲线。

**验收**：测试绿；调试 HUD 显示 `timelineFrame` / `total` / `canAct`。

---

### Step 5 — 推挤结算

**依据**：§4.2/4.4、§7 本文件、T4–T7。  

**动作**：

1. `PushResolve.ts` + `MatchSim` 顺序 §5。  
2. `DebugDraw` 黄色 push（色值进 constants）。  
3. 舞台边界：`constants` 或 `STAGE_MIN_X/MAX_X`（可 GUI）。  

**验收**：双人相向走不穿；角落测试用例。

---

### Step 6 — 防住全链路（5LP 样板）

**依据**：§4.6–4.7、D7、T2–T3。  

**动作**：

1. `forceP2Guard` 默认 true。  
2. Hit∩Hurt → blockstun + hitstop + block_push + 格挡动画。  
3. 伤害可 0。  
4. 更新 `matchSim_5lp.test.ts`：期望 block 路径。  

**验收手动清单**：

- [ ] 5LP 打上 P2：双方卡顿  
- [ ] P2 进 blockstun N 帧不可动  
- [ ] P2 被推开可见距离  
- [ ] 攻击方 hitstop 期间不滑步  
- [ ] 框：红 hit / 绿 hurt / 黄 push 可见  

---

### Step 7 — 调试面板（强制公开参数）

**依据**：共识 H2、§4.7 项 10、现 `DebugGui`/`MutableSimConfig`。  

**必须暴露的参数**（lil-gui 文件夹建议结构）：

#### 模拟

| 参数 | 键 | 说明 |
|------|-----|------|
| 暂停 / 单帧 | 已有 | |
| logicFps | 已有 | 默认 60 |

#### 碰撞框显示

| 参数 | 键 | 默认 |
|------|-----|------|
| 显示 Hit | `showHitboxes` | true |
| 显示 Hurt | `showHurtboxes` | true |
| 显示 Push | `showPushboxes` | **新增 true** |
| hit/hurt/push 颜色 | colors | 红/绿/黄 |
| 线宽/scale | worldScale | 已有 |

#### 命中与防住

| 参数 | 键 | 默认 |
|------|-----|------|
| 强制 P2 真格挡 | `forceP2Guard` | true |
| hitstop on block | `hitstopFramesOnBlock` | 8 |
| hitstop on hit | `hitstopFramesOnHit` | 8（后置干挨仍留） |
| 全局 blockstun 覆盖 | `blockstunOverride` | -1=用招表 |
| 防御推开总量 | `blockPushbackTotal` | 标定后默认 |
| 伤害倍率 | `damageScale` | 0 或 1 |

#### 位移通道

| 参数 | 键 | 默认 |
|------|-----|------|
| 启用攻击 Place | `applySelfMovement` | true |
| selfMovementScale | `selfMovementScale` | 1 |
| mmdkUnitScale | `mmdkUnitScale` | 标定值 |
| 启用推挤 | `enablePushResolve` | true |
| 启用防御推开 | `enableBlockPush` | true |

#### 时间轴 HUD（只读或 probe）

| 显示 | 来源 |
|------|------|
| logicFrame | MatchSim |
| p1 phase / moveId | |
| moveFrame / total / timelineFrames | |
| canAct / hasAnimTail / residualDisplace | |
| activeHit | |
| hitstopTimer | |
| lastHitResult | |
| lastSelfDx / lastBlockPushDx | |
| pushOverlapX | 推挤调试 |

#### 走冲跳尺子

| 已有 walk/dash/jump 参数 | 保持；标定攻击单位时对照 |

#### 招式表热改

| 5LP startup/active/recovery/boxes | 已有；扩展 push 盒编辑可选 |

**验收**：面板改 `hitstop`/`blockPushback`/`showPushboxes` 立即影响下一击或下一帧。

---

### Step 8 — 指令表普攻整包

**依据**：§4.7 覆盖、C4、D11–D12。  

**动作**：

1. 对 `ryu-command-list-classic.md` §2 全部 normals + §3 unique（有资源则接）：  
   - 有 MMDK：转换  
   - 无：placeholder 盒 + 公开 frames + `review.placeholder`  
2. `MoveCatalog` / `ryu_index.json` 注册全部可出。  
3. 缺 glb：仍可逻辑打通；动画占位 clip。  
4. 竖直：`selfMovementY` 有则接（如 2HP 等）；无则 0。  

**验收**：清单表逐条 ✅/placeholder；至少 5LP reviewed 或 mmdk_converted；其余可 placeholder 但 **可出招且可防住**。

---

### Step 9 — 回归与文档回写

**动作**：

1. 全量 `npm test` + `npm run build`。  
2. 更新 `schema-move-table.md` 增补 push / timeline / blockPush 字段。  
3. 在 `consensus` **不改**已确认行为；仅实现笔记可写 `docs/plans/` 附录「完成记录」。  

---

## 10. 技术陷阱清单（执行时对照）

| ID | 陷阱 | 依据 | 缓解（本方案强制） |
|----|------|------|-------------------|
| P01 | 公开 total 与 fab.Frame 不一致 | 共识 §3.12；MMDK fab | 双轨；禁止用 fab 改写 total |
| P02 | Place 当 dx 直接用 | §3.10 | 累积差分 |
| P03 | 攻击位移叠 root motion | §3.10 单写 | 禁用动画写逻辑 x |
| P04 | 走路 + residual Place 叠速 | §3.12 选项 A | walk 清 place residual |
| P05 | 冲刺 residual 误带位移 | §3.7.1 | dash 逻辑结束即停 dx |
| P06 | hitstop 中 advance 导致帧优势错 | T3；现 MatchSim | hitstop 跳过位移/帧推进 |
| P07 | hitstop 中完全拒绝输入 | 共识 §2 | 输入仍采样；buffer 可写 |
| P08 | 判定在位移前 → 距离一手感假 | §4.4 | 顺序：位移→推挤→判定 |
| P09 | 推挤均分在角落卡死 | T4 T5 | 二次：贴边方不移，推对方 |
| P10 | 推挤每帧振荡 1px | T6 | overlap 阈值或 `<= eps` 忽略 |
| P11 | 中心/角点约定混用 | ADR-002；MMDK Offset | field-map 锁一种转换 |
| P12 | facing 镜像漏 push | ADR-002 faceBox | 三类框统一 faceBox |
| P13 | active 公式 off-by-one | ADR-003 | 单测 5LP startup4 active3 → frames 3,4,5 |
| P14 | 多 hitbox 只测第一个 | MMDK 多 BoxList | 双重循环任意对 |
| P15 | hasHitThisMove 阻止多段 | 多段招 | 本阶段普攻单段为主；多段后置或按段 id |
| P16 | blockstun 用 onHit 公式 | parse 占位 | 防住路径只用 blockstun |
| P17 | Dummy 非强制防 → 干挨动画 | §4.6 甲 | forceP2Guard |
| P18 | 原始 dump 进 git | §6.8 gitignore | private/ only |
| P19 | 单位未标定导致推开「飞出」 | §3.10 | UNIT_SCALE + GUI clamp |
| P20 | 用 clip 长度当 canAct | §3.7 | total only |
| P21 | 转换脚本依赖本机绝对路径 | 工程 | CLI 参数 + private 相对根 |
| P22 | generated 文件名 `ryu_j>lp` 非法 URL | 现仓 | catalog 用 encode 或规范 id |
| P23 | 同帧 strike/throw | §1.5 | 本阶段 throw 不结算抓取 |
| P24 | hitstop 解冻当帧再判定 | 社区常见 | 当帧 hasHit 已锁；active 仍在可多段另议 |

---

## 11. 单测矩阵（最低）

| 文件 | 断言要点 |
|------|----------|
| `collision.test.ts` | 扩展 push overlap |
| `pushResolve.test.ts` | 均分、角落、eps |
| `placeDiff.test.ts` | 累积→dx 往返 |
| `timelineResidual.test.ts` | total 后 Place；walk 打断；新招打断 |
| `blockOnHit.test.ts` | hit∩hurt → blockstun+hitstop+push；force guard |
| `movePlayer_5lp.test.ts` | active 帧集；total 后 hit 关闭 |
| `matchSim_5lp.test.ts` | 更新顺序与 block 结果 |

运行：`cd app && npm test`。

---

## 12. 手动验收剧本（整包完成定义）

1. **尺子**：走冲跳距离肉眼/HUD 与 `ryu-movement` 一致。  
2. **5LP 全链路**：框显示 → 推挤贴身 → 防住卡顿 → 硬直 → 推开 → 双方恢复。  
3. **残留**：选一招 timeline>total（若有）；站桩滑步；一走路停滑。  
4. **普攻**：指令表 §2 每个 moveId 能出；缺资源 placeholder 不崩。  
5. **调试**：关 hit 只留 push 可调试贴身；改 hitstop 手感变化明显。  
6. **仓库清洁**：`git status` 无 `private/mmdk` 原始 JSON。

---

## 13. 与现有代码的具体改动清单（文件级）

| 文件 | 改动类型 |
|------|----------|
| `MoveDefinition.ts` | 解析 push / timeline / block 推开 |
| `MovePlayer.ts` | 双轨；push 盒；勿过早 null |
| `Fighter.ts` | residual 位移/框；push 世界盒；清 residual API |
| `MatchSim.ts` | 帧顺序；push；force guard；block_push 通道 |
| `DummyController.ts` | 默认 stand_block |
| `Collision.ts` / `PushResolve.ts` | 新逻辑 |
| `BlockResolve.ts` | 防住打包 |
| `Box2D.ts` | 可选 `overlapDepthX` |
| `DebugDraw.ts` | push 黄框 |
| `DebugGui.ts` / `constants.ts` | §7 参数 |
| `parse` 调用方 / catalog | 加载整包 normals |
| `tools/mmdk_convert/*` | 新建 |
| `docs/.../mmdk-field-map.md` | 新建 |
| `tests/combat/*` | 新增/更新 |

---

## 14. BLOCKED 协议

遇到下列情况 **停止发明**，输出：

```text
BLOCKED: <短标题>
missing: <路径或字段>
tried: <已打开的文件>
need_from_human: <例如：放置 MMDK dump / 确认 Offset 是中心还是角点>
```

允许用 placeholder 继续 **非数据** 步骤（推挤算法、hitstop 状态机），但不得把 placeholder 标为 `reviewed`。

---

## 15. 完成定义（DoD）

- [ ] §4.7 十项系统均有代码落点（可 placeholder 数据，不可缺系统）  
- [ ] 5LP：MMDK 或审查后的框 + 公开 total + 防住链路真有  
- [ ] 推挤可用；三类框可调显示  
- [ ] Place 差分位移 + 走路打断  
- [ ] 指令表普攻可出  
- [ ] 单测与 build 通过  
- [ ] 无 private dump 进入公开提交  
- [ ] 调试面板参数表（§7）全部存在  

---

## 16. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-08-12 | 初版：对齐 consensus §3.10/3.12/4/6.8；结合现仓 combat/render；MMDK README 键语义；推挤/hitstop 社群坑；AI 分步 + 强制调试参数 |

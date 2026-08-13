# AI 可执行方案：框两层装配 · 全招逻辑框 · 防住推挤（对齐 2026-08-13 共识）

> **文档类型**：实现执行规范（给 AI / 人类执行用），**不是**共识正文。  
> **节点**：2026-08-13  
> **对齐共识（必须全文服从）**  
> - `docs/consensus-v0.md` **§0**（写进即全做；禁止 MVP/P0）  
> - `docs/character-control/consensus-design-v0.md` **§0 / §3.12 / §4.1–4.10 / §6.6–§6.8**  
> - ADR-001 / 002 / 003  
> **废档**：`ai-execution-plan-boxes-push-block-displace-v0.md`（历史切片口吻）；`ai-execution-plan-mvp-5lp-v0.md` / `character-control-p0-v0.md` **不得**再缩水本目标。  
> **目标（一次做全）**：姿态头/身/腿三绿 + 两层框装配 + 红不残留 + 表驱动开关 + 推挤/防住 + 指令表应接招 **逻辑+框全覆盖** + 调试参数全开 + 验收句 §4.10。  
> **点名延后（§4.9，禁止借口缩水其它项）**：干挨分部位动画；完整倒地弹墙；`.fchar` 主路径；接近防精做；弹幕完整；投抓取/tech 深度；Drive 全家桶；Steer 精修；DR 冻结 buffer 相位。

---

## 硬性规则（执行者必读）

1. **禁止自我发挥**：每步只用本文件列出的路径、类型、算法、仓库。缺数据 → `BLOCKED:` + 缺什么；不得发明第二套框模型。  
2. **禁止**把「能显示红绿黄」当成完成；**§4.10 六条验收句** 必须全部满足。  
3. **禁止** MVP/P0/「先一招样板」；允许实现时 **按模块提交**，但目标与验收是 **全量**。  
4. **私人** `private/mmdk/**` 不进公开 git；运行时只读 `app/public/data/**`。  
5. `app/src/combat/**` **禁止 import three**；画框只在 `render/DebugDraw.ts`。  
6. 每步结束：`cd app && npm test` 绿 + 本步验收清单。

---

## 0. 现状与缺口（执行前必读，禁止推倒重写无关系统）

| 已有（可复用） | 路径 | 与本方案关系 |
|----------------|------|----------------|
| 逻辑 60Hz | `frameClock.ts` | 保持 |
| AABB + faceBox | `boxes/Box2D.ts` | ADR-002；扩展 part 标签可画 |
| 推挤 | `systems/PushResolve.ts` | 保持算法；接入新 worldPush |
| 防住参数 | `systems/BlockResolve.ts` | 保持 |
| 出招表解析 | `MoveDefinition.ts` | 扩展 layer/part；姿态表另文件 |
| 出招播放 | `MovePlayer.ts` | 时间轴取样；**不**在 total 清几何 |
| 角色 | `Fighter.ts` | **重写 world*Boxes 装配**；删单块 STAND_HURT 权威 |
| 对局 | `MatchSim.ts` | 保持位移→推挤→判定顺序；框走装配 API |
| 调试绘制 | `DebugDraw.ts` | 多块绿；可选 part 色差 |
| MMDK 私人数据 | `private/mmdk/Ryu/*` | 已导入 |
| 转换脚本 | `tools/mmdk_convert/convert_ryu_normals.mjs` | **扩展**：姿态表 + 全应接招 + rect 消歧 |
| 已转换普攻 JSON | `app/public/data/moves/ryu_*.json` | 结构可能仍缺 layer；须重转/补字段 |
| 指令 catalog | `ryuMoveIds.ts` `RYU_FEEDBACK_MOVE_URLS` | 覆盖全部应接 URL |
| 测试 | `app/tests/combat/*` | 新增装配/验收向用例 |

| 缺口（本方案必须关闭） | 证据 |
|------------------------|------|
| 待机单块绿 | `Fighter.STAND_HURT` 一整条 |
| 无姿态框表 | 无 `stance_boxes` 运行时数据 |
| 出招 hurt 与姿态未分层 | residual 整包读招表 0–39 全身段 |
| 红框理论可被错误路径拉长 | 须保证 **仅** 表 `hit[]` 且仅 from–to |
| 必杀逻辑+框未统一进 catalog | 仍大量 `generated/` 占位框 |
| rect 桶 id 碰撞 | 转换曾出现离谱 OffsetY |

---

## 1. 权威依据总表（禁止另找「等价」替代）

### 1.1 本仓库（规格）

| 编号 | 依据 | 用途 |
|------|------|------|
| C0 | `docs/consensus-v0.md` §0 | 写进即全做 |
| C1 | `consensus-design-v0.md` §3.12 | 表驱动开关；红不残留；绿跟表 |
| C2 | 同上 §4.1–4.10 | 两层装配、验收句 |
| C3 | 同上 §6.6–6.8 | 招式覆盖、MMDK 双源 |
| C4 | `action-tables/ryu-command-list-classic.md` | 应接招清单 |
| C5 | `action-tables/schema-move-table.md` | 字段语义 |
| C6 | ADR-001/002/003 | 60Hz、中心宽高、帧索引 |
| C7 | 现有 `app/src/combat/**` | 技术栈落点 |

### 1.2 外部数据 / 工具

| 编号 | 资源 | URL / 路径 | 用法 |
|------|------|------------|------|
| D1 | MMDK | https://github.com/alphazolam/MMDK | Key 语义、PlayerData |
| D2 | 本地 dump | `private/mmdk/Ryu/` | rects / moves_dict / hit_dt |
| D3 | 姿态动作名 | `BAS_STD_Loop`、`BAS_CRH_Loop`（moves_dict 实测） | 姿态三绿 |
| D4 | 公开帧 | SuperCombo / 4rays / `generated/` | total 等 |
| D5 | Hitbox Viewer | https://github.com/WistfulHopes/SF6Mods | 目视对照，非运行时 |
| D6 | Capcom SF 专栏 Boxes | https://game.capcom.com/cfn/sfv/column/131422?lang=en | Hurt/Hit/Collision 三分法理论 |
| D7 | 单位标定 | `action-tables/unit-calibration.md` | 默认 scale 0.01 |

### 1.3 开源实现（只读语义；禁止 vendoring 整仓）

| 编号 | 资源 | URL | 对照 | 允许操作 |
|------|------|-----|------|----------|
| E1 | chriscourses/fighting-game | https://github.com/chriscourses/fighting-game | 矩形命中闭环 | TS 重写 |
| E2 | Ikemen-GO | https://github.com/ikemen-engine/Ikemen-GO | 状态+框思维 | 读概念 |
| E3 | Sakuga-Engine | https://github.com/NoisyChain/Sakuga-Engine | 表驱动 hit/hurt | 读结构 |
| E4 | three lil-gui | `three/addons/libs/lil-gui.module.min.js` | 调试面板 | 扩展现有 DebugGui |
| E5 | Vitest | 现 `app` 依赖 | 单测 | 新增用例 |

### 1.4 社群 / 坑（检索补充）

| 编号 | 资源 | 用途 |
|------|------|------|
| T1 | Capcom「Hour 7: Boxes」 | 受伤框随动作延伸；与姿态基座+出招延伸一致 |
| T2 | Reddit/FB：红=hit 绿=hurt | 调试色语义 |
| T3 | SF6 Hitbox Viewer 评论：黄=push 永不重叠 | 推挤语义 |
| T4 | 先前方案推挤讨论（Unity/Godot） | 均分+贴边二次（已实现则保持） |
| T5 | MMDK README DamageCollision / HeadList | 头身腿列表真实字段 |
| T6 | 本仓 rect 多桶同 id | 必须 resolveRect 消歧，禁全局 last-write-wins |

### 1.5 明确禁止

- 运行时 HTTP 拉帧表/MMDK  
- 单块 `STAND_HURT` 作为完成态  
- glb 播完决定 Hit 开关  
- 用动画 root 叠第二份逻辑位移  
- 解析 `.fchar` 作主路径  
- 把 §4.9 延后项当借口推迟 §4.10

---

## 2. 目标数据模型（运行时权威）

### 2.1 姿态框表（新建）

**路径**：`app/public/data/systems/ryu_stance_boxes.json`  
**人读说明**：`docs/character-control/action-tables/sourced-stance-boxes.md`（转换时生成摘要）

```ts
// 语义；实现 parseStanceBoxTable
type StanceId = 'stand' | 'crouch' | 'air'; // air 可先用 stand 腿缩短占位并标记

type StanceBoxPart = {
  part: 'head' | 'body' | 'leg';
  x: number; y: number; w: number; h: number; // ADR-002 本地
};

type StanceBoxes = {
  characterId: 'ryu';
  unitScale: number;
  stances: {
    stand: { hurt: StanceBoxPart[]; push: { x;y;w;h }[]; sourceAction: string };
    crouch: { hurt: StanceBoxPart[]; push: { x;y;w;h }[]; sourceAction: string };
    // air 可选
  };
  review: { status: string; notes: string };
};
```

**转换源（锁死）**：

| Stance | MMDK 动作名（优先） | 字段 |
|--------|---------------------|------|
| stand | `BAS_STD_Loop` | DamageCollisionKey → Head/Body/Leg；PushCollisionKey |
| crouch | `BAS_CRH_Loop`（若无则 `BAS_CRH_*` 含 Loop 的一项，转换日志写明） | 同上 |

**算法**：与招式转换共用 `resolveRect` + `UNIT_SCALE`（默认 `0.01`，env `MMDK_UNIT_SCALE`）。  
取该动作 **时间轴中段一帧**（或 Start–End 覆盖全身的第一段）的头身腿 id → 几何。  
Push：PushCollisionKey 的 BoxNo→rect；过大则用 body 宽、`x=0` 居中（与现 convert 推挤修正一致）。

### 2.2 招式表扩展

在现有 `MoveDefinition.boxes` 上：

```ts
type TimedBox = Box & {
  from: number;
  to: number; // inclusive
  part?: 'head' | 'body' | 'leg' | 'extend' | 'unknown';
  /** base = 招式内全身基座段；extend = 临时形变；omit = 未标注 */
  layer?: 'base' | 'extend';
  rectId?: number;
};
// hit: layer 忽略；永不 residual 越权
// hurt: 合成时 extend 与 base 均可并入；from-to 严格
```

**转换标注规则（锁死）**：

- 同一 `DamageCollisionKey` 段若 **同时含 Head+Body+Leg** → `layer:'base'`，part 分头身腿  
- 仅 Body/Leg/Head 单列表临时段 → `layer:'extend'`  
- `AttackCollisionKey` 且 `_isStr===true`（或 AttackDataListIndex≥0 且非 proximity）→ `boxes.hit`  
- **禁止** 导出 `_isPrx` 接近防为 hit（延后）

**公开帧双源**：`frames.*` / advantage 仍来自 `generated/` 或公开表；**不得**用 `fab.Frame` 覆盖 `frames.total`。

### 2.3 时间轴指针（逻辑）

| 概念 | 字段 | 说明 |
|------|------|------|
| 可操作 | `frames.total` | canAct |
| 招式取样帧 | `actionTimelineFrame` | 出招中 = moveFrame；total 后若仍有表覆盖则继续 +1 直到 **所有** 本招 hurt/push/selfMovement 的 max(to)+1 与 place 长度结束 |
| 动画残留 | `animTail` | **仅表现**；不授权 hit |

**Hit**：仅 `phase===attack' && move 未逻辑结束前` 且 `hit` 表覆盖 `moveFrame`；**逻辑 total 到达后禁止 Hit**（即使表 to 写错，运行时 clamp：hit 仅当 `moveFrame < total` 或 `moveFrame <= hit.to && phase===attack && !pastLogicTotal`）。  

更严锁死（本方案采用，对齐「红不残留」）：

```text
hitActive = phase==attack && mover.move != null
         && moveFrame < frames.total
         && exists hit box with from<=moveFrame<=to
```

**Hurt 动作层**（可操作后仍可有）：

```text
actionHurt = boxes from move where layer relevant && from<=timelineFrame<=to
// timelineFrame 可 >= total，只要表还覆盖
// 若已 clearAttackTimeline（新招/走打断位移时清动作层），则无动作层
```

**清动作层时机**（共识）：新出招/冲/跳；**开始走路**清攻击位移，并 **清动作框时间轴**（回纯姿态）。  
站桩 total 后：动作时间轴可继续到框表结束（绿可跟表）。

### 2.4 本帧装配伪代码（锁死 · 实现唯一权威）

文件：`app/src/combat/boxes/BoxAssembly.ts`

```ts
function assembleWorldBoxes(f: Fighter, stanceTable, crouch: boolean): {
  hit: Box[]; hurt: Box[]; push: Box[];
} {
  const stance = crouch ? 'crouch' : (f.y > 0.01 ? 'air' : 'stand');
  const base = stanceTable.stances[stance] ?? stanceTable.stances.stand;

  let hurtLocal = base.hurt.map(...);
  let pushLocal = base.push.map(...);
  let hitLocal: Box[] = [];

  const tl = f.getActionTimeline(); // { move, frame } | null
  if (tl) {
    const { move, frame } = tl;
    // Hit: only if still in logic attack lock
    if (f.phase === 'attack' && f.mover.move && frame < move.frames.total) {
      hitLocal = filterTimed(move.boxes.hit, frame);
    }
    // Action hurt: table only
    const ah = filterTimed(move.boxes.hurt, frame);
    if (ah.length) {
      // 合成：默认「并入」——姿态 + 动作段同时存在（SF 出拳绿常延伸）
      // 若同 part 重叠过多可后置优化；本方案并入
      hurtLocal = [...hurtLocal, ...ah];
    }
    const ap = filterTimed(move.boxes.push ?? [], frame);
    if (ap.length) pushLocal = ap; // 有表则替换姿态 push
  }

  return {
    hit: hitLocal.map(b => faceBox(b, f.x, f.y, f.facing)),
    hurt: hurtLocal.map(b => faceBox(b, f.x, f.y, f.facing)),
    push: pushLocal.map(b => faceBox(b, f.x, f.y, f.facing)),
  };
}
```

**理论依据**：C2 §4.3；T1 受伤框随动作延伸；D1 DamageCollision 多列表。

---

## 3. 分步执行（AI 按序；每步可提交，验收是全量）

### Step 0 — 环境与数据在场

**依据**：D2、C0。  

**动作**：

1. 确认 `private/mmdk/Ryu/rects.json`、`moves_dict.json`、`hit_dt.json` 存在。  
2. `cd app && npm test` 基线。  
3. 读 `ryu-command-list-classic.md` §2–5 列出 **应接 moveId 清单** → 写入 `tools/mmdk_convert/coverage_list.json`（机器可读，id 列表）。

**验收**：清单含全部 normals/unique/jumps + specials（超必杀标 `deferred:true`）；test 绿。

---

### Step 1 — 转换：姿态框表

**依据**：D3、C2 §4.3、D7。  

**动作**：

1. 扩展 `tools/mmdk_convert/convert_ryu_normals.mjs`（或新建 `convert_stance_boxes.mjs`，须 `node` 可跑）：  
   - 解析 `BAS_STD_Loop` / crouch loop  
   - 输出 `app/public/data/systems/ryu_stance_boxes.json`  
2. 日志打印所用 action 名、三 part 的 rectId、几何。  
3. 写 `docs/character-control/action-tables/sourced-stance-boxes.md` 一行摘要（非原始 dump）。

**rect 消歧**（强制，T6）：

```text
candidates = all rects with numeric id == X
filter: OffsetY in (-50, 350), SizeX/Y in (0, 200)
pick max area among filtered
```

**验收**：JSON 中 `stand.hurt.length >= 3` 且 parts 含 head/body/leg；`npm` 侧可用 node 断言。

---

### Step 2 — 转换：全应接招式重导

**依据**：C3 §6.6、C2 §4.6、D1。  

**动作**：

1. `coverage_list.json` 中非 deferred 项全部转换到 `app/public/data/moves/ryu_*.json`。  
2. 双源：frames 从 `generated/` 或已有公开 JSON；boxes/selfMovement/HIT 从 MMDK。  
3. hurt 写入 `layer`/`part`。  
4. 超必杀：若在 list 标 deferred → 不强制；否则同样转。  
5. 更新 `RYU_FEEDBACK_MOVE_URLS`：**所有非 deferred** 指向 `/data/moves/ryu_*.json`（非 generated 占位框）。  
6. 缺 glb：JSON `review.notes` 或 `animPlaceholder: true`；逻辑仍注册。

**Place**：`PosList` 累积差分 → `selfMovement`（已有 `placeCumToDx`）。

**验收**：coverage 报告 `converted` / `missing_action` / `deferred` 计数；`missing_action` 必须人工标 BLOCKED 或写入延后原因文件 `action-tables/deferred-moves.md`。

---

### Step 3 — 运行时：加载姿态表 + BoxAssembly

**依据**：C2 §4.3、E1、C6。  

**动作**：

1. 新建 `app/src/data/loadStanceBoxes.ts`：`fetch` `/data/systems/ryu_stance_boxes.json` + parse。  
2. 新建 `app/src/combat/boxes/BoxAssembly.ts`：实现 §2.4。  
3. `Fighter`：  
   - 删除以 `STAND_HURT` 单块为权威的路径（可留 fallback **仅** stance 表缺失时且 `review` 警告）。  
   - `worldHitBoxes/Hurt/Push` 改为调用 `assembleWorldBoxes`。  
4. `getActionTimeline()`：  
   - attack 中：`{ move, frame: moveFrame }`  
   - total 后站桩：若 `actionTimelineActive`，frame 递增至 `maxTimeline(move)`  
   - 走路/新招/冲/跳：`clearActionTimeline()`  
5. **Hit 门闩**：§2.3 公式。  
6. `MatchSim`：碰撞改用装配结果；保持 hitstop 时不 advance。

**验收单测**（必须写）：

| 文件 | 断言 |
|------|------|
| `boxAssembly_idle.test.ts` | stand → hurt.length≥3 |
| `boxAssembly_hit_no_residual.test.ts` | total 后 hit 空 |
| `boxAssembly_hurt_table.test.ts` | 构造 to=20 的 hurt，frame=21 消失 |
| `boxAssembly_walk_clears_action.test.ts` | walk 后仅姿态框 |

---

### Step 4 — 推挤 / 防住回归（不得回退）

**依据**：C2 §4.5–4.7、现有 PushResolve/BlockResolve。  

**动作**：

1. 确认帧顺序仍为：位移 → `resolvePush` → Hit∩Hurt → advance。  
2. `forceP2Guard` 默认 true。  
3. 防住：blockstun、hitstop、block_push 通道分字段。  
4. 单测：`blockOnHit` / `pushResolve` 仍绿；必要时更新期望。

**验收**：§4.10 第 6 条。

---

### Step 5 — 指令表全覆盖接线

**依据**：C4、C3。  

**动作**：

1. `ryuCommands.ts` / catalog：每个应接 moveId 能 `execute`。  
2. 缺动画：clip 占位 + HUD/probe `animPlaceholder`。  
3. 必杀：有 JSON 则注册；无 action → `deferred-moves.md`。  

**验收**：自动化脚本遍历 coverage 列表 `catalog.has(id)`；失败即红。

---

### Step 6 — 调试面板（必须公开参数）

**依据**：总共识 H2；现有 `DebugGui.ts` + `constants.ts` + lil-gui（E4）。  

**文件夹与键（名称可中文 label，键名如下）**：

#### 框显示

| 参数 | 键 | 默认 |
|------|-----|------|
| 显示 Hit | `showHitboxes` | true |
| 显示 Hurt | `showHurtboxes` | true |
| 显示 Push | `showPushboxes` | true |
| 按 part 染色绿框 | `hurtPartColors` | true |
| hit/hurt/push 色 | colors | 红/绿/黄 |

#### 装配 / 时间轴（只读 probe + 可调）

| 参数 | 键 | 说明 |
|------|-----|------|
| 姿态 | `p1StanceId` | stand/crouch/air |
| 动作时间轴帧 | `p1ActionTimelineFrame` | |
| 逻辑 total | `p1Total` | |
| canAct | `p1CanAct` | |
| 动作层是否激活 | `p1ActionTimelineActive` | |
| 本帧 hurt 块数 | `p1HurtCount` | ≥3 待机 |
| 本帧 hit 块数 | `p1HitCount` | |
| 强制关动作层 | `debugClearActionBoxes` | 调试用按钮 |

#### 防住 / 推挤 / 位移

| 参数 | 键 | 默认 |
|------|-----|------|
| 强制 P2 格挡 | `forceP2Guard` | true |
| 推挤开关 | `enablePushResolve` | true |
| 防御推开 | `enableBlockPush` | true |
| 推开总量 | `blockPushbackTotal` | 表/0.22 |
| hitstop 防/中 | 已有 | |
| 攻击 Place | `applySelfMovement` | true |
| selfMovementScale | 已有 | |
| mmdkUnitScale | 已有 | 仅调试叠乘 |
| 舞台边界 | `stageMinX/MaxX` | 已有 |

#### 数据

| 参数 | 键 |
|------|-----|
| 重载姿态框 JSON | 按钮 |
| 重载 catalog | 已有 |
| 当前招 review 状态 | listen |

**DebugDraw**：对 hurt 若 `part==='head'|'body'|'leg'` 可用轻微色差（同为绿系）或线型区分，便于数「三块」。

---

### Step 7 — 全量验收与文档回写

**依据**：C2 §4.10。  

**动作**：

1. 手测/自动对照 §4.10 六条。  
2. `npm test` + `npm run build`。  
3. 更新 `sourced-stance-boxes.md`、`deferred-moves.md`（若有）。  
4. **不改**共识正文 unless 发现与数据冲突需对话。

---

## 4. 文件级改动清单

| 路径 | 操作 |
|------|------|
| `tools/mmdk_convert/convert_*.mjs` | 姿态+全招+layer |
| `tools/mmdk_convert/coverage_list.json` | 新建 |
| `app/public/data/systems/ryu_stance_boxes.json` | 新建 |
| `app/public/data/moves/ryu_*.json` | 重转 |
| `app/src/data/loadStanceBoxes.ts` | 新建 |
| `app/src/combat/boxes/BoxAssembly.ts` | 新建 |
| `Fighter.ts` / `MovePlayer.ts` / `MatchSim.ts` | 装配接入 |
| `MoveDefinition.ts` | layer/part |
| `ryuMoveIds.ts` | URL 全覆盖 |
| `DebugGui.ts` / `DebugDraw.ts` / `constants.ts` | §6 参数 |
| `tests/combat/boxAssembly_*.test.ts` | 新建 |
| `docs/.../sourced-stance-boxes.md` | 新建 |
| `docs/.../deferred-moves.md` | 按需 |

---

## 5. 技术陷阱（执行时对照）

| ID | 坑 | 依据 | 强制缓解 |
|----|-----|------|----------|
| P01 | rect id 多桶冲突 → 飞天框 | T6、本仓实测 | resolveRect 过滤 OffsetY |
| P02 | 把 fab.Frame 当 total | C1 | total 只来自公开帧 |
| P03 | 动画残留误开 Hit | C1 | Hit 门闩 phase+frame&lt;total |
| P04 | 单块 STAND_HURT 冒充完成 | C2 §4.10 | 单测 hurt≥3 |
| P05 | 走路不清动作层 | C1 走打断 | clearActionTimeline on walk |
| P06 | 动作 hurt 并入导致「双身」过肥 | T1 可接受延伸 | 先并入；过肥再审查表 |
| P07 | 推挤用 strike 大 rect | 旧 convert | body 优先 |
| P08 | HitOffset 当累加导致尺度炸 | 旧 bug | 打击：HitOffset 作中心、尺寸来自 rect |
| P09 | generated 与正式表双源加载错文件 | catalog | URL 只指向正式 `ryu_*.json` |
| P10 | 空中姿态无表 | 数据 | air 暂 stand 标记 placeholder |
| P11 | 同帧多 hit 只测一个 | FG 常识 | any-overlap 双重循环（已有 anyHitOverlapsHurt） |
| P12 | hitstop 中仍 advance 帧 | 现逻辑 | 保持早退 |
| P13 | 占位动画导致「招废」 | C0 | 逻辑仍可出 |
| P14 | 把 Drive 未做当成框可缓 | C §4.9 | 禁止 |
| P15 | 单位 0.01 与模型比例观感不符 | D7 | GUI mmdkUnitScale 仅调试；改正式 scale 须重转 |

---

## 6. 与现有代码的迁移注意

1. **attackResidual** 与 **animTail** 拆语义：  
   - `animTail` = 仅 clip scrub  
   - `actionTimeline` = 框/位移表指针（可与 anim 同帧号，但 Hit 规则独立）  
2. 旧 residual 把 hurt 跟到 39：重转后 **base 段** 若仍 0–fab，站桩 total 后仍会显示动作 base 绿——这是 **表如此**；若审查认为 base 应在 total 截断，应 **改转换** 把 base 的 `to` clamp 到 `total-1` 或 `MarginFrame`，**不要**在运行时静默吞表。  
   - **本方案默认**：转换时增加选项 `CLAMP_BASE_HURT_TO_TOTAL=1`（默认 **开**）：`layer==base` 的 hurt `to = min(to, total-1)`；`extend` 不 clamp（通常已在 total 内）。对齐「可操作后主要靠姿态三绿，衍生不乱挂」。  
   - 若与 MMDK 目视冲突，在 `review.notes` 记录后可关 clamp。  
3. **Push** total 后：无动作 push 表 → 姿态黄。

---

## 7. 完成定义（DoD）

- [ ] §4.10 六条全部满足（手测+单测）  
- [ ] 待机三绿来自 `ryu_stance_boxes.json`  
- [ ] 红框 total 后必无  
- [ ] 应接招 catalog 全有逻辑+框  
- [ ] 推挤+防住不回退  
- [ ] 调试面板 §6 参数齐全  
- [ ] `npm test` / `build` 绿  
- [ ] 无私有 dump 进入公开提交  
- [ ] 无 MVP/P0 话术写进新代码注释当借口  

---

## 8. BLOCKED 协议

```text
BLOCKED: <短标题>
missing: <路径或 MMDK 动作名>
tried: <已查 keys>
need_from_human: <例如确认 crouch 动作名 / 是否 clamp base hurt>
```

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-08-13 | 初版：对齐元共识与 §4 两层装配；全招覆盖；姿态表；验收与陷阱；废止旧切片方案效力 |

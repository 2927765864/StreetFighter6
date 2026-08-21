# AI 可执行方案：框图编辑器（对齐共识 box-editor-v0）

> **文档类型**：实现执行规范（给 AI / 人类执行用），**不是**共识正文。  
> **节点**：2026-08-21 **14:57 CST**（本机服务器时间）  
> **对齐共识（必须全文服从）**  
> - `docs/consensus-v0.md` **§0**（写进即全做；禁止 MVP/P0/「先做 scrub」拆目标）  
> - `docs/character-control/consensus-box-editor-v0.md`（全文）  
> - `docs/character-control/consensus-design-v0.md` §4（框装配语义）  
> - ADR-001 / ADR-002 / ADR-003  
> - `docs/character-control/action-tables/schema-move-table.md`  
> **调研依据**：`docs/research/box-editor-implementation-cases-2026-08-21.md`  
> **点名延后（共识已写；禁止借口缩水其它项）**：飞行物框编辑。  
> **目标（一次做全）**：独立编辑页 + 逻辑帧时间线（scrub/播放/逐帧/循环）+ 红绿黄拖改与数字精修 + 改起止帧 + 新建/删除/改种类 + 撤销重做 + 原始/改动双层自动保存 + 列表改动标记 + 单招/全局恢复 + 出招与站/蹲待机同工具模式切换 + 调试面板参数全开 + 测试与验收句全绿。

---

## 硬性规则（执行者必读）

1. **禁止自我发挥**：每步只用本文件列出的路径、类型、算法、仓库与 API。缺数据/缺 API → 写 `BLOCKED:` + 缺什么；不得发明第二套框模型、第二套帧索引、第二套中心约定。  
2. **禁止**把「能显示红绿黄」或「ControlPanel 数字条」当成框图编辑器完成。  
3. **禁止** MVP/P0/「先做时间线再做保存」；允许按 **本文件步骤顺序提交**，但验收必须覆盖共识 §2 / §8 全能力（飞行物除外）。  
4. `app/src/combat/**` **禁止 import three**；画框与 3D 拾取只在 `app/src/render/**` 与 `app/src/boxEditor/**`。  
5. **禁止改写** `app/public/data/moves/ryu_*.json` 与 `app/public/data/systems/ryu_stance_boxes.json` 作为编辑写回目标；写回只允许进 **override 目录**（见 §0 锁定）。  
6. `private/mmdk/**` 不进编辑写回路径；不把 REFramework Viewer Lua 链进 Web 运行时。  
7. 每步结束：`cd app && npm test` 绿 + 本步验收清单勾完。  
8. 本文件 **§0 PLAN LOCK** 若与共识 ⬜ 冲突：执行前先把 LOCK 回写进 `consensus-box-editor-v0.md`（谈拢口径：本方案锁定 A + 同页模式切换），再编码。

---

## 0. PLAN LOCK（共识 ⬜ 的执行锁定 · 禁止另选）

| ID | 锁定 | 理论/产品依据 | 参考 |
|----|------|---------------|------|
| L1 | **改动层形态 = 方案 A**：与原始 **同结构整文件** 存 override；加载 `override \|\| base` | 共识 §4「原始永不改、运行时优先改动」；调研 §6.3「override 同结构、恢复=删文件」 | `consensus-box-editor-v0.md` §4；`box-editor-implementation-cases-2026-08-21.md` §6 |
| L2 | Override 路径（磁盘） | `app/public/data/overrides/moves/<moveId>.json`；`app/public/data/overrides/systems/ryu_stance_boxes.json`；清单 `app/public/data/overrides/manifest.json` | 与现有 `public/data/moves`、`public/data/systems` 并列；Vite `publicDir` 可直接 `fetch` |
| L3 | **待机/出招 = 同一页模式切换** | 共识 §1.2 / §5 允许模式切换；禁止两套互不相通工具 | 共识 §1.2；Hitbox Studio「同一 Character Editor 换动画」工作流（调研 B 级） |
| L4 | 模式枚举 | `editorMode: 'move' \| 'stance_stand' \| 'stance_crouch'`（`air` 仅当表内存在 `stances.air` 时加 `stance_air`；无则不做） | `loadStanceBoxes.ts` `StanceBoxTable.stances` |
| L5 | 入口形态 | 新增多页入口 **`app/box-editor.html`** → `app/src/boxEditor/main.ts`（非对战 `index.html` 内嵌） | 共识 §0「独立编辑页」；现仓无 SPA 路由（`main.ts` 单 boot） |
| L6 | 自动保存写盘 | **Vite `configureServer` 中间件**写 override 文件（开发权威）；禁止只靠 `localStorage` 冒充「改动文件」 | 浏览器不能写 `public/`（Chrome File System Access / web.dev）；本仓已有中间件先例 `vite-plugins/ryuAnimAssets.ts` |
| L7 | 段语义 | 框 = `TimedBox`：`from/to` **闭区间** + 段内常数 `x,y,w,h`；改形状不插值 | ADR-003；`MovePlayer.boxesAt`；共识 §3 |
| L8 | 坐标 | ADR-002：中心+全宽高；`faceBox`；编辑存 **local** | `Box2D.faceBox`；`DebugDraw` |

执行者完成 L1–L5 后，须把 L1/L3 回写共识 §4.2 / §5（把 ⬜ 改为 ✅ + 本 LOCK 表述）。

---

## 1. 权威依据总表（禁止另找「等价」替代）

### 1.1 本仓库（规格与代码）

| 编号 | 依据 | 用途 |
|------|------|------|
| C0 | `docs/consensus-v0.md` §0 | 写进即全做 |
| C1 | `docs/character-control/consensus-box-editor-v0.md` | 产品边界与验收画像 |
| C2 | `consensus-design-v0.md` §4 | 两层装配、红不残留 |
| C3 | ADR-001 / 002 / 003 | 60Hz、中心宽高、`from/to` 闭区间 |
| C4 | `action-tables/schema-move-table.md` | 框字段语义 |
| C5 | `app/src/combat/move/MoveDefinition.ts` | `TimedBox`、`parseMoveDefinition`、`inferTimelineFrames`、`cloneMove` |
| C6 | `app/src/combat/move/MovePlayer.ts` | `boxesAt` / `boxesAtFrame` / `moveFrame` |
| C7 | `app/src/combat/boxes/Box2D.ts` | `faceBox` |
| C8 | `app/src/combat/boxes/BoxAssembly.ts` | `filterTimedBoxes`、`assembleWorldBoxes` |
| C9 | `app/src/data/loadStanceBoxes.ts` | `fetchStanceBoxTable`、`parseStanceBoxTable`、`StanceBoxTable` |
| C10 | `app/src/render/DebugDraw.ts` | 红绿黄绘制 API |
| C11 | `app/src/render/AnimScrub.ts` + `FighterView.scrubActionTo` / `syncFromLogic` | 逻辑帧→clip 时间；**禁止** paused 时 `mixer.setTime` |
| C12 | `app/src/combat/move/ryuMoveIds.ts` `RYU_FEEDBACK_MOVE_URLS` | 招列表 |
| C13 | `app/src/config/persist.ts` `downloadJson` | 仅作应急导出；**不是** override 主路径 |
| C14 | `app/vite-plugins/ryuAnimAssets.ts` | Vite 中间件写法模板（`configureServer`、`safeResolve`、`sendJson`） |
| C15 | `app/src/config/constants.ts` | `HITBOX_COLOR` / `HURTBOX_COLOR` / `PUSHBOX_COLOR` |

### 1.2 外部开源 / 文档（只读学交互；禁止 vendoring 整仓）

| 编号 | 资源 | URL | 允许用法 |
|------|------|-----|----------|
| E1 | coelhucas/hitbox-editor | https://github.com/coelhucas/hitbox-editor | 矩形拖改、类型、跨帧复制形状、JSON 存盘 UX |
| E2 | rafaelalmeidatk/hitbox | https://github.com/rafaelalmeidatk/hitbox | 预览+碰撞、缩放矩形、Undo 意图 |
| E3 | MrcSnm/HitboxEditor | https://github.com/MrcSnm/HitboxEditor | Ctrl+Z / Ctrl+Shift+Z |
| E4 | BakaBBQ/siki.lua | https://github.com/BakaBBQ/siki.lua | 红/绿/白三分语义 |
| E5 | Castagne Editor | https://github.com/panthavma/castagne · https://castagneengine.com/docs/editor/ | 逐帧检查、gizmo、`F6-8` 帧区间语义 |
| E6 | Hitbox Studio Pro 手册 | https://blackgarden.studio/hitbox-studio-pro-1-2-0-user-guide/ | 时间线、拖框、邻帧复制、「沿用上一帧」= 段常数 UX |
| E7 | UFE Custom Hitbox | https://www.ufe3d.com/doku.php/hitbox:start | 激活帧区间、黄/绿类型 |
| E8 | three.js Raycaster | https://threejs.org/docs/#api/en/core/Raycaster · https://github.com/mrdoob/three.js/blob/master/examples/jsm/controls/DragControls.js | 指针 NDC、平面拖拽 |
| E9 | Vite Plugin configureServer | https://vite.dev/guide/api-plugin | 写盘中间件 |
| E10 | Chrome File System Access（对照） | https://developer.chrome.com/docs/capabilities/web-apis/file-system-access | 说明为何不能静默写仓库；本方案用 Vite API 代替 |
| E11 | SF6 Hitbox Viewer（只读校对） | https://github.com/WistfulHopes/SF6Mods | 目视对照；不进运行时 |
| E12 | sf6frames.com | https://sf6frames.com/ryu | 人工校对参考；非数据权威 |

### 1.3 坑位检索依据（互联网 · 用于 §7）

| 编号 | 问题 | 来源 |
|------|------|------|
| P1 | 逐帧控制 AnimationAction：设 `paused` + `action.time` + `mixer.update(0)` | StackOverflow「manually control animation frame by frame」；本仓 `FighterView.scrubActionTo` 注释已禁 `mixer.setTime` |
| P2 | Raycaster NDC 必须用 **canvas `getBoundingClientRect`**，不能用 `window.innerWidth` | three.js forum「Mouse Normalization and Raycasting」；SO 48068550 评论 |
| P3 | 格斗 `from/to` / startup 易 off-by-one | ADR-003；FG 社区帧记法讨论 |
| P4 | 拖框 zoom/坐标系偏移 | rafaelalmeidatk/hitbox Known bugs（zoom 导致 collider 偏移） |
| P5 | 浏览器页无法直接写 `public/` | MDN / Chrome File System Access；需服务端或用户授权句柄 |

---

## 2. 现状与缺口（执行前必读）

| 已有（必须复用） | 路径 | 关系 |
|------------------|------|------|
| TimedBox 解析 | `MoveDefinition.ts` | 编辑器 document 模型 |
| 帧取样 | `MovePlayer.boxesAtFrame` / `BoxAssembly.filterTimedBoxes` | 当前帧可见框 |
| 世界变换 | `faceBox` | 预览叠框 |
| 姿态表 | `ryu_stance_boxes.json` + `loadStanceBoxes.ts` | 待机模式 |
| 动画 scrub | `AnimScrub.ts` / `FighterView` | 编辑预览驱动 |
| 画框 | `DebugDraw` 颜色常量 | 编辑预览须同色 |
| 招 URL 表 | `RYU_FEEDBACK_MOVE_URLS` | 招列表 |
| Vite 中间件模板 | `ryuAnimAssets.ts` | override API |
| 内存改框（残缺） | `MatchSim.applyMoveEdit` 仅 `hit[0]`/`hurt[0]` | **禁止**作为编辑器写回；仅历史调试 |

| 缺口（本方案关闭） | 证据 |
|--------------------|------|
| 无独立编辑页 | 仅 `index.html`→`main.ts` |
| 无 override 目录/加载合并 | `public/data` 无 `overrides/` |
| 无多框时间线 UI | ControlPanel 只改首框数字 |
| 无画布拖框 | 无 Raycaster 框编辑 |
| 无撤销栈 | 无 |
| 训练场加载未优先 override | `loadFeedbackCatalog` 直读 base URL |

---

## 3. 目标架构（禁止改成其它分层）

```text
box-editor.html
  └─ boxEditor/main.ts
        ├─ BoxEditorApp（DOM：列表 | 预览 | 时间线 | 属性 | 工具条）
        ├─ BoxEditorDocument（纯 TS：可进 tests；无 three）
        │     move | stance 模式；TimedBox[]；undo 栈；dirty
        ├─ BoxEditorPlayback（逻辑帧 playhead；60Hz 定时；循环）
        ├─ BoxEditorPreview（three：复用 FighterView scrub + DebugDraw 等价画框）
        ├─ BoxEditorPointer（Raycaster→逻辑平面→local 中心/边）
        └─ OverrideClient（fetch + POST /api/box-overrides/...）

训练场 main.ts（并行改加载）
  └─ resolveMoveUrl / resolveStanceUrl：override 存在则用之
```

**目录（必须按此创建，禁止散落）**

| 路径 | 职责 |
|------|------|
| `app/box-editor.html` | 编辑页壳 |
| `app/src/boxEditor/main.ts` | boot |
| `app/src/boxEditor/BoxEditorApp.ts` | UI 装配 |
| `app/src/boxEditor/document/BoxEditorDocument.ts` | 文档+命令+undo |
| `app/src/boxEditor/document/commands.ts` | 命令类型 |
| `app/src/boxEditor/playback/BoxEditorPlayback.ts` | 播放头 |
| `app/src/boxEditor/preview/BoxEditorPreview.ts` | 3D 预览 |
| `app/src/boxEditor/pointer/BoxPointerController.ts` | 拖拽 |
| `app/src/boxEditor/ui/*` | 时间线、属性、列表 CSS/DOM |
| `app/src/data/resolveOverrides.ts` | override\|\|base（combat 可依赖的纯函数） |
| `app/src/data/loadMoveWithOverride.ts` | 招加载 |
| `app/vite-plugins/boxOverrideApi.ts` | 写盘 API |
| `app/public/data/overrides/**` | 改动层（可空；manifest 初始 `{"moves":{},"stance":false}`） |
| `app/tests/boxEditor/*.test.ts` | 文档/合并/命令测试 |

`vite.config.ts`：注册 `boxOverrideApi`；`build.rollupOptions.input` 增加 `box-editor.html`（与 `index.html` 双入口）。

---

## 4. 数据合同（禁止改字段语义）

### 4.1 出招 TimedBox（已有）

```ts
// 来源：MoveDefinition.TimedBox — 禁止改名改义
{
  from: number; // inclusive, 0-based moveFrame
  to: number;   // inclusive
  x: number; y: number; w: number; h: number; // ADR-002 local
  part?: 'head'|'body'|'leg'|'extend'|'unknown';
  layer?: 'base'|'extend';
  rectId?: number;
  hitGroup?: number;
}
```

编辑器 **可编辑**：`from,to,x,y,w,h`、所属数组种类（`hit|hurt|push`）、`part`/`layer`（hurt）。  
**保留原样写回**（若存在）：`rectId`、`rectBucket`、`hitGroup` 等未知键——用「解析为 TimedBox + 保留 `extra: Record`」或「改动时 structuredClone 整段再改字段」，禁止 `JSON.stringify` 丢掉未建模键。  
**方法**：对 override 写回使用 **克隆自 base 的完整 MoveDefinition 对象**，只替换 `boxes`（及 stance 文件整体），`parseMoveDefinition` 往返后 diff 测试不得丢 `review`/`clipId`/`glbPath`/`selfMovement` 等。

### 4.2 Override 文件

**招式** `overrides/moves/ryu_5lp.json`：完整 `MoveDefinition` JSON（与 base 同 schema），`review.notes` 追加 `| box-editor override`（字符串追加，不删原文）。

**姿态** `overrides/systems/ryu_stance_boxes.json`：完整 `StanceBoxTable`。

**清单** `overrides/manifest.json`：

```json
{
  "version": 1,
  "moves": { "ryu_5lp": { "updatedAt": "ISO-8601" } },
  "stance": false
}
```

`stance: true` 表示姿态 override 存在。

### 4.3 加载算法（训练场 + 编辑器共用）

```ts
// app/src/data/resolveOverrides.ts — 必须实现并单测
export function overrideMoveUrl(moveId: string): string {
  return `/data/overrides/moves/${moveId}.json`;
}
export function baseMoveUrl(moveId: string): string {
  // 从 RYU_FEEDBACK_MOVE_URLS 反查；找不到则 `/data/moves/${moveId}.json`
}
export async function fetchJsonOptional(url: string): Promise<unknown | null> {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(...);
  // 若 content-type 像 HTML（Vite fallback）→ 当 null（对齐 persist.ts shipping 防护）
  return res.json();
}
export async function loadMoveDefinitionResolved(moveId: string): Promise<{ def; fromOverride: boolean }> {
  const o = await fetchJsonOptional(overrideMoveUrl(moveId));
  if (o) return { def: parseMoveDefinition(o), fromOverride: true };
  const b = await fetchJsonOptional(baseMoveUrl(moveId));
  if (!b) throw ...
  return { def: parseMoveDefinition(b), fromOverride: false };
}
```

姿态同理：`/data/overrides/systems/ryu_stance_boxes.json` → else `fetchStanceBoxTable()`。

**改造点**：`loadFeedbackCatalog` 内每个 URL 改为先试 override（由 `moveId` 推导）；`main.ts` 姿态加载走 resolved。

### 4.4 Vite 写盘 API（唯一自动保存权威）

插件：`app/vite-plugins/boxOverrideApi.ts`，仿 `ryuAnimAssets.ts`：

| 方法 | 路径 | 行为 |
|------|------|------|
| `GET` | `/api/box-overrides/manifest` | 读 manifest；无则返回空壳 |
| `PUT` | `/api/box-overrides/moves/:moveId` | body=完整 move JSON；`safeResolve` 限制在 `public/data/overrides/moves/`；写文件；更新 manifest |
| `DELETE` | `/api/box-overrides/moves/:moveId` | 删文件；更新 manifest |
| `PUT` | `/api/box-overrides/stance` | 写姿态 override；`manifest.stance=true` |
| `DELETE` | `/api/box-overrides/stance` | 删姿态 override |
| `DELETE` | `/api/box-overrides/all` | 清空 overrides/moves/*、stance、reset manifest |

`safeResolve`：**必须**拒绝 `..` 逃逸（复制 `ryuAnimAssets.ts` 实现）。  
生产 build：该 API 不存在；编辑器检测 `PUT` 失败时：`downloadJson` 降级 + UI 红字「仅开发服务器可自动写盘」（共识自动保存在 **dev** 满足；禁止静默丢数据）。

---

## 5. 分步实现（逐步执行；每步有依据与验收）

### 步骤 A — 回写共识 LOCK + 脚手架

| 项 | 内容 |
|----|------|
| **做什么** | 共识 §4.2 ✅=A；§5 ✅=同页模式切换；建 `box-editor.html`、空 `boxEditor/main.ts`、双入口 vite、空 overrides+manifest、注册插件骨架 |
| **依据** | C1；L1–L5；E9 |
| **禁止** | 改对战逻辑；写 base JSON |
| **验收** | 打开 `/box-editor.html` 有标题「框图编辑器」；`GET /api/box-overrides/manifest` 200；`npm test` 绿 |

### 步骤 B — `BoxEditorDocument` + 命令 + Undo（纯 TS）

| 项 | 内容 |
|----|------|
| **做什么** | 文档状态：`mode`、`moveId`、`def: MoveDefinition`、`stance: StanceBoxTable`、`playhead`、`selection: { kind, index } \| null`、`dirty`。命令：`SetBoxGeom`、`SetBoxRange`、`SetBoxKind`（在 hit/hurt/push 数组间移动）、`AddBox`、`DeleteBox`、`ReplaceBoxes`（恢复用）。Undo/Redo 栈深度默认 100。快捷键 Ctrl+Z / Ctrl+Shift+Z / Cmd 等价 |
| **算法** | 命令模式：`execute`/`undo` 成对；执行新命令截断 redo。参考 E3 |
| **几何约束** | `w,h >= 0.05`（与 ControlPanel `mv-hitBoxW` 下限一致）；`from <= to`；`from/to` clamp 到 `[0, timelineFrames-1]`（`inferTimelineFrames`） |
| **依据** | C5；E2；E3；共识 §2 |
| **测试** | `tests/boxEditor/documentCommands.test.ts`：改 geom→undo；改 range；add/delete；kind 切换保留 geom |
| **验收** | 单测绿；无 DOM |

### 步骤 C — Override 加载/保存客户端 + 训练场接线

| 项 | 内容 |
|----|------|
| **做什么** | 实现 `resolveOverrides.ts`、`loadMoveWithOverride.ts`；改 `loadFeedbackCatalog`；姿态 resolved；`OverrideClient.saveMove/saveStance/restoreMove/restoreAll`（debounce **300ms** 自动 PUT） |
| **依据** | L1–L2、L6；C12；P5；调研 §6.3 |
| **测试** | merge：无 override→base；有 override→override；HTML fallback→当缺省 |
| **验收** | 手写一个 `overrides/moves/ryu_5lp.json`（仅改 hit[0].x）→训练场重载后 hit 变化；删文件恢复 |

### 步骤 D — Playback（逻辑帧时间线驱动）

| 项 | 内容 |
|----|------|
| **做什么** | `BoxEditorPlayback`：`playhead` 整数；`playing`；`loop`；`fps=60`（ADR-001）。API：`seek(f)`、`step(±1)`、`play()`、`pause()`、`toggleLoop()`。播放用 `setInterval(1000/60)` 或累积 `performance.now()`，**只 +1 逻辑帧**，不按墙钟插值半帧 |
| **范围** | `move` 模式：`0 .. inferTimelineFrames(def)-1`（优先于 `frames.total`，因 schema 允许 timelineFrames > total） |
| **stance 模式** | playhead 对 `transitions.stand_to_crouch.totalFrames` 等：若当前只编辑静态 `stances.stand.hurt`（无 from/to），时间线长度=1，播放禁用循环有意义；若编辑 transition 段（表内 timed），长度=`totalFrames`。**本方案锁定**：待机模式默认编辑 `stances.stand|crouch` 的 **静态 hurt/push 列表**（每条视为 `from=0,to=0` 显示为单帧色条，或 UI 标「静态」）；transition 轨道作为只读参考条（可选显示）。静态框改的是姿态表几何，不是出招 from/to |
| **依据** | C3；C5 `inferTimelineFrames`；C9；共识 §1.2 |
| **验收** | 单测 playhead clamp；循环从末帧到 0 |

### 步骤 E — Preview（动画与框同步）

| 项 | 内容 |
|----|------|
| **做什么** | `BoxEditorPreview`：侧面相机（复用训练场相机初始侧视参数，从 `CONFIG` 读 `cam*` 相关已有键，**禁止**自由 Orbit 当主操控——共识不做建模式镜头）。加载 Ryu 网格+当前招 `glbPath`/`clipId`（与 `FighterView` / clip 映射同一数据源）。每帧：`scrubActionTo` 路径 **必须调用** `visualFrameToClipTime(playhead, duration)` 或 `logicFrameToClipTime` 与训练场 `scrubMode` 一致（编辑器 CONFIG 默认 `scrubFromLogic=true`，`scrubMode='uniform'`）。框：对当前 playhead 用 `MovePlayer.boxesAtFrame` + `faceBox(originX=0,originY=0,facing)` 画线；颜色 `HITBOX_COLOR`/`HURTBOX_COLOR`/`PUSHBOX_COLOR` |
| **禁止** | 调用 `mixer.setTime` 代替 `action.time`（P1 / C11） |
| **依据** | C10；C11；E5 逐帧；共识 §0 |
| **验收** | 拖 playhead，拳姿势与红框同帧出现（以 `ryu_5lp` hit `from:3,to:6` 为夹具） |

### 步骤 F — 时间线 UI（色条）

| 项 | 内容 |
|----|------|
| **做什么** | DOM 时间线：横轴=逻辑帧；每条 TimedBox 一色条（红/绿/黄）；选中高亮；拖条左右边缘改 `from`/`to`（命令 `SetBoxRange`）；点击色条选中；播放头竖线。参考 E6 时间线信息架构，**实现自写 DOM/CSS**，不引入 Studio 源码 |
| **筛选** | 开关：显示 hit / hurt / push（默认全开） |
| **依据** | 共识 §2 / §5；E6；E1 |
| **验收** | 拖 hit 条右缘 `to`+1 → 预览多一帧红框；undo 恢复 |

### 步骤 G — 画布点选 / 拖心 / 拖边 + 数字面板

| 项 | 内容 |
|----|------|
| **指针算法（必须）** | 1）`rect = renderer.domElement.getBoundingClientRect()`；NDC：`x=((clientX-left)/width)*2-1`，`y=-((clientY-top)/height)*2+1`（P2）。2）`Raycaster.setFromCamera`。3）与逻辑平面求交：本仓框在 **z≈0.12** 绘制（`DebugDraw.boxToLine`）；拖拽平面用 `THREE.Plane` 法线沿相机前向或固定 **Z=0 的 XY 战斗平面**（与 2D 逻辑一致：世界 x/y）。4）交点世界 `(wx,wy)` → local：`local.x = facing * (wx - originX)`，`local.y = wy - originY`（ADR-002 逆变换；编辑器 origin 默认 0）。5）命中测试：点是否在某框 AABB 内（中心±半宽高）；优先 top-most（数组末或面积最小）。6）拖心：改 `x,y`；拖边：改 `w`/`h` 并保持对边锚定（中心公式：右边拖 → `x'=(left+newRight)/2`，`w'=newRight-left`）。最小尺寸 0.05 |
| **参考实现** | E8 DragControls 平面拖；E1 矩形控制；**禁止**直接复制 zoom-bug 路径（P4：预览缩放变化时重新算 NDC，勿缓存屏幕像素偏移） |
| **数字面板** | 选中后绑定 `x,y,w,h,from,to`；可改 `kind`；hurt 可改 `part`/`layer`。使用现有 `dragScrub.ts` 改善拖改数字（已有文件） |
| **依据** | C7；C10；E1；E8；P2；P4 |
| **验收** | 拖红框中心 → JSON local.x 变；面向 `facing=-1` 时拖拽方向与镜像一致（单测逆变换） |

### 步骤 H — 新建 / 删除 / 改种类 / 邻帧复制

| 项 | 内容 |
|----|------|
| **AddBox** | 默认：当前 playhead 起 `from=to=playhead`，`x=0.5,y=1.2,w=0.4,h=0.3`（hit）或 hurt/push 合理默认；可随后拖改 |
| **DeleteBox** | 删 selection |
| **SetBoxKind** | 从数组 A splice 到数组 B |
| **CopyFromSelected** | 复制几何到新段（E1「import from another frame」；E6 邻帧复制） |
| **依据** | 共识 §2「完全自定义」；E1；E6 |
| **验收** | 新建红框→自动保存 override→重载仍在 |

### 步骤 I — 列表标记 + 恢复 + 自动保存

| 项 | 内容 |
|----|------|
| **列表** | 左栏：`RYU_FEEDBACK_MOVE_URLS` 全部 moveId；旁注「已改」若 manifest.moves[id]；姿态项「站/蹲」若 manifest.stance |
| **恢复单招** | `DELETE /api/box-overrides/moves/:id` + 重新 load base |
| **恢复姿态** | `DELETE .../stance` |
| **全局恢复** | `DELETE .../all` |
| **自动保存** | document 命令成功后 debounce PUT；保存中/失败状态条 |
| **依据** | 共识 §4.1；L6 |
| **验收** | 改→刷新编辑页仍在；单招恢复后标记消失；全局恢复清空 |

### 步骤 J — 调试面板（编辑页必须公开的参数）

编辑页右侧或底部「调试/配置」——**全部公开**，键名如下（写入 `BoxEditorConfig`，可 `localStorage` 键 `sf6BoxEditorConfig`，与对战 `sf6RuntimeConfig` **分开**）。

#### J.1 显示

| 参数键 | 类型 | 默认 | 作用 |
|--------|------|------|------|
| `showHitboxes` | bool | true | 显示攻击框 |
| `showHurtboxes` | bool | true | 显示受击框 |
| `showPushboxes` | bool | true | 显示推挤框 |
| `hurtPartColors` | bool | true | hurt 按 part 染色（对齐训练场） |
| `hitboxColor` | number/hex | `HITBOX_COLOR` | 红 |
| `hurtboxColor` | number/hex | `HURTBOX_COLOR` | 绿 |
| `pushboxColor` | number/hex | `PUSHBOX_COLOR` | 黄 |
| `showTimelineHit` | bool | true | 时间线红轨 |
| `showTimelineHurt` | bool | true | 时间线绿轨 |
| `showTimelinePush` | bool | true | 时间线黄轨 |
| `showDebugGrid` | bool | true | 地面/逻辑网格 |
| `showOriginMarker` | bool | true | 角色原点十字 |

#### J.2 播放 / scrub

| 参数键 | 类型 | 默认 | 作用 |
|--------|------|------|------|
| `scrubFromLogic` | bool | true | 必须 true 才与框同步（允许关来对比） |
| `scrubMode` | `'uniform'\|'truncate'` | `'uniform'` | 对齐 `AnimScrub.ts` |
| `playbackFps` | number | 60 | 锁定 60；可显示只读 |
| `loop` | bool | true | 循环 |
| `playhead` | int | 0 | 当前逻辑帧（可 scrub 数字） |

#### J.3 变换 / 预览

| 参数键 | 类型 | 默认 | 作用 |
|--------|------|------|------|
| `worldScale` | number | 同训练场 CONFIG | 与 DebugDraw 一致 |
| `modelScale` | number | 同 CONFIG | |
| `modelYOffset` | number | 同 CONFIG | |
| `editorFacing` | `1\|-1` | 1 | 面向；改后框镜像 |
| `originX` / `originY` | number | 0 | 逻辑原点（一般 0） |
| `boxDragMinSize` | number | 0.05 | 最小宽高 |
| `autoSaveDebounceMs` | number | 300 | 自动保存防抖 |
| `undoLimit` | number | 100 | 撤销深度 |

#### J.4 数据 / 安全

| 参数键 | 类型 | 默认 | 作用 |
|--------|------|------|------|
| `autoSaveEnabled` | bool | true | 总开关 |
| `preferOverride` | bool | true | 加载优先 override（只读诊断时可关） |
| `apiBase` | string | `''` | 预留；默认相对路径 |

**禁止**只做 lil-gui 隐藏默认色；色与三开关必须上面板。

### 步骤 K — 测试矩阵与验收句

**自动化（必须）**

| 测试文件 | 覆盖 |
|----------|------|
| `tests/boxEditor/documentCommands.test.ts` | undo/geom/range/add/delete/kind |
| `tests/boxEditor/overrideResolve.test.ts` | url、404、HTML fallback |
| `tests/boxEditor/faceBoxInverse.test.ts` | local↔world 往返 |
| `tests/boxEditor/playbackClamp.test.ts` | playhead/loop |
| `tests/combat/movePlayerBoxesAt.test.ts`（若已有则扩展） | `from/to` 闭区间与 playhead 一致 |

**人工验收句（全部满足才算完成；对齐共识 §8）**

1. 打开 `/box-editor.html`，选 `ryu_5lp`，拖时间线，姿势与框同逻辑帧变化。  
2. 播放/暂停/逐帧/循环均可用。  
3. 点选红框可拖心、拖边；数字面板改 `x,y,w,h` 立即反映。  
4. 拖色条改 `from/to` 后，框出现/消失帧变化。  
5. 可新建/删除/改种类；Ctrl+Z 撤销。  
6. 改后自动出现 `overrides/moves/ryu_5lp.json`；列表有「已改」；训练场重载用新框；base 文件 diff 为空。  
7. 单招恢复、全局恢复有效。  
8. 模式切到站/蹲，可改姿态 hurt/push 几何并写入 stance override。  
9. 飞行物可不做。  
10. `cd app && npm test` 全绿。

---

## 6. 与训练场调试面板的关系

| 现有 | 处置 |
|------|------|
| ControlPanel `mv-hitBox*` / `applyMoveEdit` 仅首框 | **保留**作临时手段；文档注释标明「非框图编辑器」；**不得**扩展它冒充完成 |
| `showHitboxes` 等 | 训练场保留；编辑器用 **独立** `BoxEditorConfig`（键可同名，存储分离） |
| `reloadMoveFromPublic` | 改为 resolved 加载（override 优先） |

---

## 7. 执行时坑与陷阱（检索结论 → 强制对策）

| ID | 坑 | 证据 | 强制对策 |
|----|----|------|----------|
| T1 | `from/to` 与社区 startup 记法差 1 | ADR-003；FG off-by-one 常识 | 编辑器只显示 **0-based moveFrame**；UI 旁注 ADR-003；单测夹具用 `ryu_5lp` hit 3–6 |
| T2 | `mixer.setTime` 与 paused action 打架 | P1；本仓注释 | 只走 `scrubActionTo` |
| T3 | Raycaster 用 window 尺寸，面板布局后点偏 | P2 three forum | 必须 `getBoundingClientRect` |
| T4 | 缩放后拖框偏移 | E2 known bug | 每次 pointer 事件重算 NDC；不累积屏幕 delta 当世界 delta |
| T5 | 面向 -1 时拖 x 符号反 | ADR-002 | 写入 local 前做 `facing` 逆变换；面板显示 local |
| T6 | 中心约定下拖边公式错成改 corner 当 center | ADR-002 | 边拖用 left/right/top/bottom 中间量再写回 center |
| T7 | 浏览器不能写 public | P5 | 只用 Vite API；失败降级 download + 报错 |
| T8 | Vite 对缺失 public 文件 SPA fallback 成 HTML | `persist.ts` 已踩坑 | `fetchJsonOptional` 校验 content-type |
| T9 | `applyMoveEdit` 只改 `[0]` | MatchSim 源码 | 编辑器禁用该 API |
| T10 | `frames.total` < 实际框 `to` | `inferTimelineFrames` | 时间线长度用 `inferTimelineFrames` |
| T11 | 自动保存覆盖未建模字段 | JSON roundtrip | 从 base clone 全对象再改 boxes |
| T12 | combat 误 import three | 仓规 | boxEditor/render 隔离；CI/review 检查 |
| T13 | 把 Viewer/sf6frames 当写回源 | 调研 H4 | 仅人工眼校 |
| T14 | debounce 期间切换招式写错文件 | 工程常识 | 切换前 flush；PUT 带 moveId 闭包校验 |
| T15 | stance 静态框与 move 时间线混轨 | 共识 §1.2 | 模式切换清空 selection；UI 标题显示模式 |

**社群补充（X / lab · 非规格）**：GelatinLab 指出视觉 mesh 可伸出 hurt、combo-only 等多框语义——编辑器显示多框即可；**不要**为「像官方欺骗性」自动缩小 hurt。WistfulHopes Viewer 种类开关 → 对应 J.1 分类型开关。

---

## 8. 明确不做（执行中禁止膨胀）

- 飞行物框时间线（共识延后）  
- 对手/木头人、试打  
- OrbitControls 自由建模式镜头当主交互  
- 多角色下拉（仅 Ryu 数据）  
- 改 `private/mmdk`  
- 段内逐帧插值变形  
- 用 localStorage 代替 override 文件作为训练场权威  

---

## 9. 步骤依赖图

```text
A 脚手架+LOCK
 └─ B Document/Undo
      ├─ C Override API + 训练场加载
      ├─ D Playback
      │    └─ E Preview 同步
      │         ├─ F Timeline UI
      │         └─ G Pointer + 数字
      │              └─ H Add/Delete/Kind
      └─ I 列表/恢复/自动保存（依赖 C）
           └─ J 调试面板参数绑全
                └─ K 验收全绿
```

---

## 10. 修订记录

| 日期 | 内容 |
|------|------|
| 2026-08-21 | 初版：共识+调研+本仓 API 勘察+坑位检索（Three scrub、Raycaster NDC、FS 写盘、ADR-003）；锁定 A 与同页模式；双入口+Vite override API |

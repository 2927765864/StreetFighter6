# AI 可执行方案：裤子物理双通道监测报告 v0（未完成 · 已抛弃）

> **状态**：**未完成 · 已抛弃**（2026-08-25）  
> **原因**：用户决定不再继续完成裤子物理子系统；上位共识与物理执行方案已抛弃。  
> **效力**：本方案**失效**，不得再按本文推进监测/写盘/HUD；`docs/reports/pants/` 仅作历史残留。  
> **同批抛弃**：`docs/pants-physics-consensus-v0.md`、`docs/plans/ai-execution-plan-pants-physics-v0.md`、`docs/research/pants-health-report-research-2026-08-24.md`  
> **历史说明（废止前）**：节点 2026-08-24；曾对齐检索与裤子物理实现，做双通道健康报告。

---

## 0. 执行者硬性规则（历史 · 已抛弃）

1. **双通道同源**：人看的线颜色 / HUD 数字，与 AI 读的 md **必须**来自同一 `PantsHealthSnapshot` 对象字段。  
2. **异常阈值只引用已有 cfg**：`pantsMaxSeparation`、`pantsRootSlideLimit`、`pantsRootRotateLimitDeg`；警告阈值 = `pantsMaxSeparation * pantsHealthWarnRatio`（新字段，默认 0.55）。  
3. **写盘仅 Vite dev API**；路径锁定在仓库 `docs/reports/pants/`；防 `..`（抄 `boxOverrideApi.ts`）。  
4. **事故文件边沿触发**（ok→abnormal 或 warn→abnormal 上升沿），禁止每帧写。  
5. **每步有验收**；缺骨/`pants` 未 bind 时报告 `status=disabled`，不得抛错。

---

## 1. 权威依据（每步只能引用这些）

| ID | 路径 / 链接 | 用途 |
|----|-------------|------|
| **R-HEALTH** | `docs/research/pants-health-report-research-2026-08-24.md` | 案例与陷阱 |
| **C-PANTS** | `docs/pants-physics-consensus-v0.md` | 产品范围：只做隆裤子 |
| **APP-PANTS** | `app/src/render/pants/RyuPantsPhysics.ts` + `spcr/pantsSpcrSolver.ts` | 采样源：粒子、`transformPos`、`pantsMaxSeparation`、warp |
| **APP-PANEL** | `app/src/debug/ControlPanel.ts` · `DebugGui.ts` | 面板开关/按钮 |
| **APP-BOXAPI** | `app/vite-plugins/boxOverrideApi.ts` | 写盘插件模板 |
| **APP-VITE** | `app/vite.config.ts` | 注册新 plugin |
| **REF-MAGICA-MON** | Magica Cloth Monitor / Gizmo 文档 | Base Pose vs 模拟、结构线、色含义 |
| **REF-GPUCLOTH** | https://github.com/alien-life/gpu-cloth-sim | debug 布尔开关、锚/自由色语义 |
| **REF-STATS** | three `examples/jsm/libs/stats.module.js` | fixed DOM HUD 模式 |
| **REF-FLEX** | https://github.com/cristhiandrm/FlexibleMesh | 约束线 = 结构透视 |

---

## 2. 健康快照数据结构（唯一真相）

文件：`app/src/render/pants/pantsHealthTypes.ts`

```ts
export type PantsHealthStatus = 'disabled' | 'ok' | 'warn' | 'abnormal';

export type PantsHealthSnapshot = {
  schemaVersion: 1;
  takenAtIso: string;           // ISO-8601
  status: PantsHealthStatus;
  /** max over free particles of |current - transformPos| */
  maxSeparation: number;
  meanSeparation: number;
  freeParticleCount: number;
  fixedParticleCount: number;
  /** structural H+V max |currentLen - restLength| */
  maxConstraintError: number;
  warpCountSession: number;     // root/facing warp 累计（本会话）
  clampCountSession: number;    // separation clamp 累计
  lastEvent: string;            // 短中文/英文原因，可空
  warnThreshold: number;        // pantsMaxSeparation * warnRatio
  abnormalThreshold: number;    // pantsMaxSeparation
  params: {
    pantsHardness: number;
    pantsGravityPower: number;
    pantsResistance: number;
    pantsMaxSeparation: number;
    pantsRootSlideLimit: number;
    pantsRootRotateLimitDeg: number;
  };
};
```

**判定（必须实现为纯函数 `classifyPantsHealth`）**：

| 条件 | status |
|------|--------|
| `!enabled \|\| !bound` | `disabled` |
| `maxSeparation >= pantsMaxSeparation` | `abnormal` |
| `maxSeparation >= pantsMaxSeparation * pantsHealthWarnRatio` | `warn` |
| else | `ok` |

依据：APP-PANTS 熔断字段 + REF-MAGICA-MON「Base Pose vs 模拟位」差。

---

## 3. Step 清单

### Step 1 — 采样器（纯函数 + 会话计数）

**文件**：

- `app/src/render/pants/pantsHealthSample.ts`  
- `app/tests/render/pantsHealthSample.test.ts`

**方法**：

1. 遍历 `particles`：`isFixed` 计 fixed；自由点算 `distance(positionCurrent, transformPos)` → max/mean。  
2. 遍历 structuralHorizontal + structuralVertical：`|len - restLength|` → maxConstraintError。  
3. `classifyPantsHealth(...)`。  
4. `RyuPantsPhysics` 内维护 `warpCountSession` / `clampCountSession` / `lastEvent`：在现有 `applyPantsRootMotion` 返回 `warp`、`clampPantsParticleSeparation` 返回 true 时递增，并设 `lastEvent`（如 `root-warp` / `separation-clamp` / `facing-warp`）。

**验收**：单测：人造粒子 maxSeparation 超阈值 → `abnormal`；低于 warn → `ok`。

---

### Step 2 — 约束线报警变色（给人）

**文件**：`RyuPantsPhysics.refreshConstraintHelper`

**方法**（REF-UNITY 色谱降级 + REF-MAGICA 结构线）：

| status | 线色 |
|--------|------|
| ok / disabled | `0xffaa00`（现橙） |
| warn | `0xffee55` |
| abnormal | `0xff2244` |

只改 `LineBasicMaterial.color`，禁止每帧 `new Material`。  
当 `pantsShowConstraints===false` 时不强制打开线（用户可另开）；若 `pantsHealthAutoShowConstraintsOnAbnormal===true`（默认 true）且 status===abnormal，则本帧强制 `visible=true`。

**验收**：单测或手动：把粒子拽远后线变红。

---

### Step 3 — DOM 小面板（给人）

**文件**：`app/src/debug/PantsHealthHud.ts`

**方法**（REF-STATS）：

- `document.body` 上 `position:fixed; right:8px; bottom:8px; z-index:10001` 的 `<pre>` 或小 div。  
- 显示：状态、maxSeparation（3 位小数）、warn/abnormal 阈值、warp 累计、clamp 累计、lastEvent。  
- 更新节流：`pantsHealthHudMinIntervalMs`（默认 150）。  
- `pantsHealthHudEnabled`（默认 true）控制显隐。  
- `dispose()` 移除 DOM。

挂接：`main.ts` 或 `FighterView` 在 pants update 后调用 `hud.update(snapshot)`；两名战士时显示 **max( maxSeparation ) 更差的一方**（取 status 更严重者），报告里可写 `fighterId`。

**简化（本版强制）**：若双人同屏，HUD 显示两行 `P1`/`P2`；latest 文件写两人数组或取更差者——**执行时选：latest 写 `{ p1, p2 }` 对象**。

**验收**：开游戏可见面板；关 `pantsHealthHudEnabled` 消失。

---

### Step 4 — Vite 报告 API（给 AI）

**文件**：`app/vite-plugins/pantsReportApi.ts`（抄 APP-BOXAPI）

**路由**：

| Method | Path | 行为 |
|--------|------|------|
| PUT | `/api/pants-report/health` | body=`{ markdown: string, json?: object }` → 写 `docs/reports/pants/pants-health-latest.md`（及可选 `.json`） |
| POST | `/api/pants-report/incident` | → `docs/reports/pants/incidents/pants-incident-YYYYMMDD-HHMMSS.md`；目录最多保留 `pantsHealthIncidentKeep`（默认 20）旧文件 |
| POST | `/api/pants-report/feel` | 追加 `docs/reports/pants/pants-feel-log.md` |

根目录：`path.resolve(appRoot, '..', 'docs', 'reports', 'pants')`（app 的上一级是仓库根）。  
`safeResolve` 禁止 `..`。

注册：`vite.config.ts` 加入 plugin。

**客户端**：`app/src/debug/pantsReportClient.ts` — `fetch`，失败只 `console.warn`，不抛。

**markdown 模板**（latest）必须含：

- 标题时间、status、maxSeparation、阈值、session counters、params 表、lastEvent  
- 一句「AI 阅读提示：优先看 status 与 maxSeparation」

**验收**：dev server 下 PUT 后磁盘出现文件；错误路径返回 400。

---

### Step 5 — 会话式记录（开始 / 停止，防日志膨胀）

**文件**：`app/src/debug/PantsHealthReporter.ts` · `pantsHealthSession.ts`

**逻辑**（2026-08-25 修订，取代「长期定时刷盘」）：

1. HUD 常驻；**平时不自动写盘**。  
2. 「开始记录」→ 内存缓冲；关键变化（状态/事件/熔断/夹紧/偏离创新高）+ 稀疏快照（`pantsHealthSnapshotIntervalSec`）。  
3. 「停止记录」→ POST `/api/pants-report/session` → `docs/reports/pants/sessions/pants-session-*.md`（+json）；保留 `pantsHealthSessionKeep` 个。  
4. `pantsHealthReportEnabled`：控制**停止时是否写盘**。  

**验收**：未开始记录时无新 session 文件；开始→制造状态变化→停止后 sessions 多一份。

---

### Step 6 — 「记下当前手感」按钮

**ControlPanel / DebugGui**：

- 按钮文案：`记下当前手感`  
- 可选输入：`pantsFeelNote` 字符串（面板文本框，可空）  
- 点击：POST feel，正文 = snapshot + note + params  

**验收**：点击后 `pants-feel-log.md` 追加一节。

---

### Step 7 — cfg 字段（必须上面板）

| 字段 | 类型 | 默认 | 面板名 |
|------|------|------|--------|
| `pantsHealthReportEnabled` | bool | true | 启用裤子健康报告写盘 |
| `pantsHealthHudEnabled` | bool | true | 显示裤子健康小面板 |
| `pantsHealthSnapshotIntervalSec` | number | 2.5 | 健康快照间隔（秒） |
| `pantsHealthWarnRatio` | number | 0.55 | 警告=最大离距×此比 |
| `pantsHealthHudMinIntervalMs` | number | 150 | 面板刷新最小间隔 ms |
| `pantsHealthAutoShowConstraintsOnAbnormal` | bool | true | 异常时自动显示约束线 |
| `pantsHealthIncidentKeep` | number | 20 | 事故文件保留个数 |
| `pantsFeelNote` | string | `''` | 手感备注（点按钮时写入） |

写入 `constants.ts` 类型 + `createDefaultSimConfig`；`ControlPanel` 绑定 + `DebugGui` 同步。

---

## 4. 不做（本版）

- 粒子球体 / 动画目标点 / 超距连线（用户确认以后再做）  
- 头巾/腰带  
- 引入 stats-gl / Magica 包  
- 生产环境强制写盘成功  

---

## 5. 验收总表

| 项 | 过关标准 |
|----|----------|
| 同源 | HUD 与 latest.md 同时刻 maxSeparation 一致（允许节流差一帧） |
| 蹲跳炸 | 异常时线变红 + incidents 多一文件 |
| 平时 | 约 2.5s 刷新 latest |
| 手感 | 按钮追加 feel-log |
| 关报告 | `pantsHealthReportEnabled=false` 不写盘；HUD 可独立关 |
| 测试 | `pantsHealthSample` + 边沿写盘逻辑单测通过 |

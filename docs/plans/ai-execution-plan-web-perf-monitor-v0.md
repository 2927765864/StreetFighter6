# AI 可执行方案：网页游戏性能监测系统 v0

> **节点**：2026-09-08  
> **效力**：有效 · **已执行完成**（2026-09-08）  
> **前置调研**：`docs/research/web-perf-monitor-research-2026-09-08.md`  
> **目标**：在训练场常驻图形化性能监测（FPS/低帧、帧耗时、模块分段、渲染计数、可选 GPU 计时），并接入现有 ControlPanel；描述精确到文件/方法/参数，禁止执行者自行发明指标或仓库。  
> **验收摘记**：headless 训练场可见 `#perf-overlay`（约 44 FPS · L60、分段/DC/tri）；面板「性能」开关可隐藏；无 pageerror。

---

## 0. 执行者硬性规则

1. **禁止**新增 `stats-gl` / `r3f-perf` / `three-perf` / `gamestats.js` 作为运行时依赖（见 §1 依据：three r181+ WebGPU 上 stats-gl 已不兼容；项目为 vanilla Three，非 R3F）。  
2. **允许**引用其 **API 形状与 UI 思路**（分段 `begin/end`、曲线、颜色告警），但代码必须落在本仓库 `app/src/debug/` 自研模块。  
3. **GPU 深度面板**只允许使用本机已安装的 three `0.185.1` 内置：  
   `three/addons/inspector/Inspector.js`（即 `app/node_modules/three/examples/jsm/inspector/Inspector.js`）。  
4. **系统级 CPU%/GPU 占用率、显卡温度不可做**：浏览器沙箱无公开跨浏览器 API；只允许：JS 墙钟分段、`renderer.info`、WebGPU `timestamp-query`（经 three）、Chrome `performance.memory`（可选）。  
5. **呈现帧口径**必须与现有 `FpsHud.tick` 一致：只在 `mustPresent === true` 的路径计数；`lockPresentToLogic` 跳过呈现时不得虚增 FPS。  
6. **每步有验收**；改 UI 后在本机 `npm run dev` 打开训练场目视确认；单测覆盖纯函数。  
7. **不得**在未完成 Step 2 的 `info.reset` 约定前打开 `trackTimestamp` 常驻（查询池溢出风险，见 §8）。

---

## 1. 权威依据（每步只能引用这些）

| ID | 路径 / 链接 | 用途 |
|----|-------------|------|
| **R-RES** | `docs/research/web-perf-monitor-research-2026-09-08.md` | 方案选型总览 |
| **APP-MAIN** | `app/src/main.ts` | 主循环、`mustPresent`、多层 `renderer.render`、现有 `FpsHud` |
| **APP-FPS** | `app/src/debug/FpsHud.ts` + `app/tests/debug/fpsHud.test.ts` | 呈现帧计数口径 |
| **APP-PANEL** | `app/src/debug/ControlPanel.ts` | `rowToggle` / `rowNumber` / `CONTROL_BINDINGS` |
| **APP-CFG** | `app/src/config/constants.ts` · `defaults.ts` · `types.ts` · `store.ts` | CONFIG 字段与 `ExpandedSections` |
| **APP-CLOCK** | `app/src/combat/frameClock.ts` | 逻辑步进 |
| **THREE-INFO** | `app/node_modules/three/src/renderers/common/Info.js` | `autoReset` / `reset()` / `render.drawCalls|triangles|timestamp` / `memory.*` |
| **THREE-ANIM** | `app/node_modules/three/src/renderers/common/Animation.js` | `setAnimationLoop` 内：`info.reset` → `nodeFrame.update` → `inspector.begin` → callback → `inspector.finish` |
| **THREE-INSP** | `app/node_modules/three/examples/jsm/inspector/Inspector.js` · `RendererInspector.js` | 官方性能 UI；`resolveTimestampsAsync` |
| **REF-FORUM-STATSGL** | https://discourse.threejs.org/t/webgpu-r181-fyi-stats-gl-no-longer-compatible-with-webgpu/87944 | Mugen87：用 Inspector 替代 stats-gl |
| **REF-ISSUE-RAF** | https://github.com/mrdoob/three.js/issues/32432 | 自定义 `requestAnimationFrame` + Inspector 有已知缺陷；应优先 `setAnimationLoop` |
| **REF-TS-POOL** | https://github.com/mrdoob/three.js/pull/30359#issuecomment-2610859017 | 开 `trackTimestamp` 必须每帧 `resolveTimestampsAsync`，否则 `Maximum number of queries exceeded` |
| **REF-TS-NOISE** | https://threejsroadmap.com/blog/profiling-webgpu | 单次 GPU 读数无意义，需滚动平均；`trackTimestamp: true` + `TimestampQuery.RENDER/COMPUTE` |
| **REF-TS-QUANT** | https://webgpufundamentals.org/webgpu/lessons/webgpu-timing.html | timestamp 量化、跨机不可比、不宜当唯一性能结论 |
| **REF-OOM** | https://github.com/mrdoob/three.js/pull/29857 | timestamp query 分配可能 OOM；需降级而非崩渲染 |
| **REF-GAMESTATS** | https://github.com/ErikSom/gamestats | **仅作** `begin(label)/end(label)` 与历史曲线 API 形状参考 |
| **REF-GRAPHY** | https://github.com/Tayx94/graphy | **仅作** FPS 历史 + min/avg/max UI 参考 |
| **REF-STATSJS** | https://github.com/mrdoob/stats.js | **仅作** 面板点击切换 / fixed DOM 参考 |
| **REF-EX-INSP** | three 示例 `webgpu_rtt.html` / `webgpu_animation_retargeting.html`：`renderer.inspector = new Inspector();` + `setAnimationLoop` | 官方接线样板 |

**明确不采用的仓库（执行时禁止 `npm i`）**：`RenaudRohlinger/stats-gl`、`utsuboco/r3f-perf`、`TheoTheDev/three-perf`、`ektogamat/r3f-webgpu-perf`、`ErikSom/gamestats`（可读源码，不装依赖）。

---

## 2. 产品范围与非目标

### 2.1 必须有（图形界面）

| 能力 | 显示形态 | 数据源 |
|------|----------|--------|
| 呈现 FPS + 逻辑 Hz | 数字 + 颜色（绿≥55 / 黄≥30 / 红&lt;30，阈值可配） | 同 APP-FPS 窗口计数 |
| 帧耗时 ms + 历史曲线 | Canvas 折线（最近 N 点） | `performance.now()` 包住整次 present |
| 低帧/尖刺 | 曲线上标；显示窗口内 min/avg/max FPS 与 max frameMs | 同上 |
| 模块分段条 | 水平堆叠或并排条：logic / sync / vfx / render | `PerfSpan` begin/end |
| 渲染计数 | drawCalls / triangles / geometries / textures | `renderer.info`（见 Step 2） |
| JS 堆内存（可选） | MB 数字；无 API 时显示 `n/a` | `performance.memory`（仅 Chromium） |
| GPU 渲染耗时（可选） | ms 数字 + 短曲线；不可用时 `n/a` | `trackTimestamp` + `resolveTimestampsAsync(RENDER)` |
| 调试面板开关 | ControlPanel「性能」分组 | CONFIG 字段 §4 |

### 2.2 非目标（本 v0 禁止实现）

- OS 级 CPU%/GPU%、温度、风扇、显存绝对占用（无浏览器标准 API）。  
- Spector.js / WebGPU Inspector 浏览器扩展自动化（可文档注明人工使用）。  
- 线上 RUM / Sentry。  
- 把 `FpsHud` 与战斗 HUD 合并成一个巨大面板。

---

## 3. 架构总图（锁定）

```
┌─ ControlPanel「性能」← CONFIG.perf* ─────────────────────────┐
│                                                              │
│  PerfMonitor (自研)                                          │
│   ├─ PerfSpans: logic / syncView / vfxCpu / renderGpuWall    │
│   ├─ PresentMeter: fps, logicHz, frameMs, min/avg/max        │
│   ├─ RenderInfoSampler: renderer.info after present          │
│   ├─ GpuTimestampSampler (optional): resolveTimestampsAsync │
│   └─ PerfOverlayDom: canvas graphs + text (替换 FpsHud DOM)  │
│                                                              │
│  Optional: renderer.inspector = new Inspector()              │
│            仅当 perfThreeInspectorEnabled && 主循环已迁到    │
│            setAnimationLoop（Step 6）                        │
└──────────────────────────────────────────────────────────────┘
```

**双通道同源**：Overlay 上显示的数字与 `PerfSnapshot` 字段一一对应；禁止 Overlay 自己再算一套 FPS。

---

## 4. CONFIG 必须公开到调试面板的参数

在 `MutableSimConfig`（`constants.ts`）增加下列字段；`createDefaultSimConfig()` 给默认值；`ControlPanel` 新增 `<details data-cat="性能">`；`ExpandedSections` 增加 `perf: boolean`（默认 `true`）；`CONTROL_BINDINGS` 全量登记。

| 字段 | 类型 | 默认 | 面板控件 | 含义 |
|------|------|------|----------|------|
| `perfOverlayEnabled` | boolean | `true` | toggle | 显示悬浮性能 HUD |
| `perfOverlayPosition` | `'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'` | `'top-right'` | select | HUD 角落 |
| `perfOverlayOpacity` | number | `0.85` | number 0.4–1 step 0.05 | 背景不透明度 |
| `perfRefreshMs` | number | `250` | number 100–1000 step 50 | 文字刷新节流（曲线可更高频） |
| `perfHistoryLength` | number | `120` | number 60–300 step 10 | 曲线点数 |
| `perfTargetFps` | number | `60` | number 30–120 step 1 | 目标帧率（曲线参考线 + 着色） |
| `perfWarnFps` | number | `45` | number 20–60 step 1 | 黄色阈值 |
| `perfBadFps` | number | `30` | number 10–45 step 1 | 红色阈值 |
| `perfShowGraphs` | boolean | `true` | toggle | 显示 FPS/frameMs 曲线 |
| `perfShowSegments` | boolean | `true` | toggle | 显示模块分段 |
| `perfShowRenderInfo` | boolean | `true` | toggle | 显示 drawCalls/triangles/memory |
| `perfShowJsHeap` | boolean | `true` | toggle | 尝试显示 JS heap |
| `perfGpuTimingEnabled` | boolean | `false` | toggle | 开启 WebGPU timestamp（有成本） |
| `perfGpuSampleAverage` | number | `30` | number 5–120 step 1 | GPU ms 滚动平均窗口 |
| `perfThreeInspectorEnabled` | boolean | `false` | toggle | 挂载 three 官方 Inspector（需 Step 6） |
| `perfPauseOverlayWhenHidden` | boolean | `true` | toggle | `document.hidden` 时跳过重采样（仍计墙钟可选关） |
| `perfExportRingBufferSec` | number | `8` | number 3–30 step 1 | 「导出最近 N 秒」环形缓冲时长 |

**面板文案分区（强制）**：

```
【性能】悬浮 HUD
  - perfOverlayEnabled / Position / Opacity / RefreshMs / HistoryLength
  - TargetFps / WarnFps / BadFps
  - ShowGraphs / ShowSegments / ShowRenderInfo / ShowJsHeap

【性能】GPU 与官方检查器
  - perfGpuTimingEnabled（提示：需 timestamp-query；每帧 resolve）
  - perfGpuSampleAverage
  - perfThreeInspectorEnabled（提示：依赖 setAnimationLoop；见 Step 6）

【性能】工具
  - 按钮「复制最近性能快照 JSON」→ clipboard
  - 按钮「下载最近环形缓冲 JSON」
```

实现按钮时：仿 `ControlPanel` 现有 `btn-*` 模式，通过 `panelApi` / hooks 回调调用 `PerfMonitor.exportSnapshot()` / `exportRingBuffer()`。

---

## 5. 数据结构（唯一真相）

**文件**：`app/src/debug/perf/perfTypes.ts`

```ts
export type PerfSegmentId =
  | 'logic'
  | 'syncView'
  | 'vfxCpu'
  | 'render';

export type PerfSnapshot = {
  schemaVersion: 1;
  takenAtMs: number;
  /** Present FPS over last refresh window */
  presentFps: number;
  logicHz: number;
  frameMs: number;
  frameMsMin: number;
  frameMsMax: number;
  frameMsAvg: number;
  segmentsMs: Record<PerfSegmentId, number>;
  render: {
    drawCalls: number;
    triangles: number;
    frameCalls: number;
    geometries: number;
    textures: number;
    /** bytes; 0 if unknown */
    memoryTotal: number;
  };
  /** ms; null if disabled or unavailable */
  gpuRenderMs: number | null;
  gpuComputeMs: number | null;
  jsHeapUsedMb: number | null;
  jsHeapTotalMb: number | null;
  presented: boolean;
  logicStepsThisPresent: number;
  warnings: string[]; // e.g. 'timestamp-query-unavailable'
};
```

纯函数：`classifyFpsColor(fps, warn, bad) → 'ok'|'warn'|'bad'`（单测）。

---

## 6. Step 清单

### Step 1 — 分段计时器 + 快照纯逻辑（无 DOM）

**依据**：REF-GAMESTATS 的 `begin(label)/end(label)`；APP-FPS 的窗口 FPS 算法。

**文件**：

- `app/src/debug/perf/PerfSpans.ts`
- `app/src/debug/perf/PresentMeter.ts`
- `app/tests/debug/perfSpans.test.ts`
- `app/tests/debug/presentMeter.test.ts`

**方法**：

1. `PerfSpans`：`begin(id)` / `end(id)` 用 `performance.now()`；同 id 重入取最后一次；`flush(): Record<PerfSegmentId, number>` 返回本帧各段 ms 并清零。  
2. `PresentMeter`：移植 `computeIntegerFps`（可从 `FpsHud` re-export）；维护 ring buffer `frameMs[]` 长度 = `perfHistoryLength`；提供 `min/avg/max`。  
3. **禁止**在此步碰 `renderer`。

**验收**：`npm test` 中 PresentMeter 在 500ms/30 frames → 60 FPS；分段 begin/end 差值可测。

---

### Step 2 — `renderer.info` 采样约定（多 pass 正确性）

**依据**：THREE-INFO 注释：自管动画循环须 `autoReset=false` 并 **每帧手动** `reset()` 一次；APP-MAIN 每 present 多次 `render`（主场景×2 + hitVfx + shockwave/glow/cloud 可能再 render + PIP 再一套）。

**文件**：`app/src/debug/perf/RenderInfoSampler.ts`

**方法**：

```ts
export function armRenderInfoForPresent(renderer: THREE.WebGPURenderer): void {
  renderer.info.autoReset = false;
  renderer.info.reset();
}

export function sampleRenderInfo(renderer: THREE.WebGPURenderer) {
  const { render, memory } = renderer.info;
  return {
    drawCalls: render.drawCalls,
    triangles: render.triangles,
    frameCalls: render.frameCalls,
    geometries: memory.geometries,
    textures: memory.textures,
    memoryTotal: memory.total ?? 0,
  };
}
```

**挂接位置（APP-MAIN，强制顺序）**：

1. 在 `mustPresent` 判定为真、即将开始本帧呈现工作之前调用 `armRenderInfoForPresent(renderer)`。  
2. 在 `fullRender`（含所有层与后处理）**全部完成之后**调用 `sampleRenderInfo`。  
3. 跳过呈现（`!mustPresent`）时：**不** `reset`，也不更新 Overlay 的 render 计数（保持上次或标记 `presented:false`）。

**陷阱（必须遵守）**：若保持默认 `autoReset===true`，每次 `render()` 可能只反映最后一次 pass（post/PIP），drawCalls 会严重偏低 —— 依据 THREE-INFO + 历史 PR「Improve Infos logic」。

**验收**：开灯光轨道 PIP 时 `frameCalls` ≥ 主视图层数；关 PIP 后下降。

---

### Step 3 — PerfOverlay 图形界面（替换 FpsHud DOM）

**依据**：REF-STATSJS fixed DOM；REF-GRAPHY / REF-GAMESTATS 曲线与 min/avg/max；现有 APP-FPS 右上角风格。

**文件**：

- `app/src/debug/perf/PerfOverlay.ts`
- `app/src/debug/perf/perfOverlay.css`（或内联 cssText，与 `FpsHud` 一致风格二选一；优先独立 css 并在 `main.ts`/`style.css` 引入）

**UI 强制布局**（320×最小高度，可随内容增高）：

1. **标题行**：`{presentFps} FPS · L{logicHz}` + 颜色。  
2. **Canvas A（高 40）**：frameMs 历史；水平虚线 = `1000/perfTargetFps`。  
3. **Canvas B（高 40）**：presentFps 历史（可选，由 `perfShowGraphs` 控制；两图都关则只留数字）。  
4. **分段行**：四段 ms，格式 `logic 1.2 · sync 2.1 · vfx 0.8 · render 4.5`。  
5. **渲染行**：`DC {drawCalls} · tri {triangles} · geo {geometries} · tex {textures}`。  
6. **可选行**：`GPU {gpuRenderMs|n/a} · JS {heap|n/a}`。  
7. `pointer-events: none`；`z-index: 10000`（与旧 `#fps-hud` 同级）；`id="perf-overlay"`。

**替换策略**：

- 删除 `main.ts` 中 `new FpsHud()` / `fpsHud.tick` 调用。  
- 保留 `FpsHud.ts` 中 `computeIntegerFps` / `FPS_HUD_REFRESH_MS` 供 PresentMeter 复用，或把函数迁到 `perfMath.ts` 并改测试 import。  
- **不要**同时挂两个右上角 FPS。

**验收**：目视曲线随打击特效抖动；关 `perfOverlayEnabled` DOM 移除或 `display:none`。

---

### Step 4 — 主循环埋点（分段 + Overlay 更新）

**依据**：APP-MAIN 现有阶段划分。

**在 `frame()` 内强制埋点**（名称不可改，便于日后对比）：

| 段 ID | 包住的代码范围（现有 main.ts） |
|-------|--------------------------------|
| `logic` | `clock.tick` + `match.step` 循环 |
| `syncView` | `p1View.syncFromLogic` / `p2View.syncFromLogic` + camera/shake 到 `debugDraw.update` 之前的展示同步 |
| `vfxCpu` | `hitVfxRuntime.tick`、plume、shockwave/glow/cloud `step`、flipbook `tick`（**不含** `apply` 里的 render） |
| `render` | `fullRender()` 整体（所有 `renderer.render` / FX `apply`） |

**伪代码顺序（执行者必须按此改 APP-MAIN）**：

```ts
// after mustPresent===true
armRenderInfoForPresent(renderer);
spans.begin('logic');
// ... existing logic ...
spans.end('logic');

spans.begin('syncView');
// ... sync ...
spans.end('syncView');

spans.begin('vfxCpu');
// ... vfx cpu ticks ...
spans.end('vfxCpu');

spans.begin('render');
await fullRender(); // or sync render path after Step 6
spans.end('render');

const snap = monitor.finalizePresent({
  nowMs: performance.now(),
  logicSteps: presentLogicSteps,
  renderInfo: sampleRenderInfo(renderer),
  segments: spans.flush(),
  cfg,
});
overlay.update(snap, cfg);
```

对 `!mustPresent` 早退分支：只 `requestAnimationFrame`，**不** finalize present（与旧 FpsHud 一致）。

**验收**：暂停时仍 present（APP-MAIN 规定）→ Overlay 继续更新；`lockPresentToLogic` 在高刷下 FPS≈logicFps。

---

### Step 5 — GPU 计时（可选开关，默认关）

**依据**：REF-TS-NOISE、REF-TS-POOL、REF-TS-QUANT、THREE-INSP、REF-OOM。

**方法**：

1. **构造 renderer 时**（APP-MAIN 现 `new THREE.WebGPURenderer({ antialias:true, alpha:false })`）：  
   - 若启动时 `cfg.perfGpuTimingEnabled===true`，传入 `trackTimestamp: true`。  
   - **注意**：three 的 `trackTimestamp` 在构造参数中读取（Backend.js）；运行中热开可能无法补申请 feature。因此：  
     - **v0 规定**：`perfGpuTimingEnabled` 默认 `false`；若用户在面板打开，显示提示「需刷新页面生效」，并 `sessionStorage.setItem('sf6-perf-gpu','1')`；boot 时读该标记决定构造参数。  
     - 关闭时清标记并提示刷新。  
2. 每 present 在所有 render/compute **之后**调用：

```ts
import { TimestampQuery } from 'three/webgpu';
// only if trackTimestamp active
await renderer.resolveTimestampsAsync(TimestampQuery.RENDER);
await renderer.resolveTimestampsAsync(TimestampQuery.COMPUTE);
const gpuRenderMs = renderer.info.render.timestamp; // ms per THREE-INFO
const gpuComputeMs = renderer.info.compute.timestamp;
```

3. `GpuTimestampSampler`：对 `gpuRenderMs` 做长度 `perfGpuSampleAverage` 的简单滑动平均；单帧原始值写入 ring，Overlay 显示平均值。  
4. 若 `renderer.hasFeature('timestamp-query') !== true`：`gpuRenderMs=null`，`warnings` 推入 `timestamp-query-unavailable`（Safari 等，REF-FORUM / stats-gl README 亦提及 Timer Queries 需旗标）。  
5. **禁止**在未 resolve 的情况下连续多帧开启 trackTimestamp（REF-TS-POOL）。

**验收**：Chrome + 支持的 GPU 上打开并刷新后 GPU 行非 `n/a`；故意不调用 resolve 的测试不得合入主干。

---

### Step 6 — 主循环迁移与 three Inspector（可选深挖）

**依据**：THREE-ANIM、REF-EX-INSP、REF-ISSUE-RAF、REF-FORUM-STATSGL。

#### 6.1 为什么必须迁 `setAnimationLoop`

`Animation.js` 在用户回调前后自动：

1. `info.reset()`（若 autoReset）  
2. `nodes.nodeFrame.update()`  
3. `inspector.begin()`  
4. 用户回调  
5. `inspector.finish()`  

自定义 `requestAnimationFrame` + 事后 `await fullRender().then(rAF)` **不会**触发 begin/finish，且与 Inspector 阴影场景存在已知 bug（REF-ISSUE-RAF）。

#### 6.2 异步陷阱（执行前必读）

`Animation.start` **不会 await** 用户回调返回的 Promise。若回调里 `await renderer.render(...)`，则 `inspector.finish()` 会在 GPU 提交完成前执行 → GPU 分段错乱。

**v0 强制修复**：

1. Boot 已 `await renderer.init()` 之后，将 APP-MAIN / HitGlow / HitShockwave / HitCloudShadow 中的 `await renderer.render(...)` 改为 **同步** `renderer.render(...)`（three r185 在 init 后这是官方用法；`renderAsync` 已废弃，见 REF-FORUM-STATSGL 讨论）。  
2. `HitSmokeVolume` / `WudaVertexGpuBaker` 中的 `computeAsync`：若路径在热帧调用，改为官方当前 API（`await renderer.init()` 后的 `renderer.compute(...)`）；若仅初始化/烘焙，可保留在 boot 或稀有路径，但不得放在 `setAnimationLoop` 回调的未 await 区间导致 finish 过早。  
3. 将

```ts
requestAnimationFrame(frame);
// ...
void fullRender().then(() => requestAnimationFrame(frame));
```

改为：

```ts
await renderer.setAnimationLoop((timeMs: number) => {
  frame(timeMs); // frame 内所有 render 同步；禁止返回未完成的 Promise 依赖
});
```

4. Step 2 的 `autoReset=false` + 手动 `reset`：**若**使用 `setAnimationLoop` 且希望 Animation 自动 reset，则改为：在 present 跳过路径仍要小心——Animation **每个 rAF** 都会 reset，即使你跳过绘制。  
   - **锁定策略**：`renderer.info.autoReset = false`；在 `setAnimationLoop` 回调开头：若本 tick 将 present，则 `info.reset()`；若跳过 present，则不 reset（保留上次样本）。  
   - Inspector 的 begin/finish 仍由 Animation 包裹整次回调——跳过绘制的帧会有近空 frame，可接受。

#### 6.3 挂载 Inspector

```ts
import { Inspector } from 'three/addons/inspector/Inspector.js';

if (cfg.perfThreeInspectorEnabled) {
  renderer.inspector = new Inspector();
  // dom 由 Inspector.setRenderer/init 自行挂到 canvas parent（见 Inspector.js）
}
```

面板关闭时：`renderer.inspector =` 恢复默认 `InspectorBase` 或不显示（查 Renderer setter：会 `setRenderer(null)` 再替换）。以 THREE 源码 setter 为准，禁止泄漏 DOM。

**验收**：开启 Inspector 后可见 Performance/Memory 页；与自研 Overlay 可共存（Inspector 默认布局避开右上，或 Overlay 改 `top-left`）。

---

### Step 7 — ControlPanel + CONFIG 接线

**依据**：APP-PANEL、APP-CFG。

**改动清单**：

1. `constants.ts`：类型 + 默认值（§4）。  
2. `types.ts`：`ExpandedSections.perf`。  
3. `defaults.ts`：`defaultExpandedSections().perf = true`。  
4. `ControlPanel.ts`：性能 details + bindings + 导出按钮。  
5. `mergeConfig`：依赖现有深并（新字段缺省走默认）。  
6. 预设 JSON：旧预设缺字段时用默认，不报错。

**验收**：刷新后开关状态能进 local 默认（若项目已有保存默认路径则走同一路径；无则仅运行时生效并在面板 hint 说明）。

---

### Step 8 — 导出与单测 / 文档

**文件**：

- `PerfMonitor.exportSnapshot(): string` → 当前 `PerfSnapshot` JSON  
- `exportRingBuffer(): string` → 最近 `perfExportRingBufferSec` 秒每 present 一条  
- `docs/research/web-perf-monitor-research-2026-09-08.md` 末尾补「已落地：plan v0」链接  
- 本 plan 状态改为「执行中/完成」由执行者更新

**单测**：`classifyFpsColor`、PresentMeter、PerfSpans、RenderInfoSampler（可用假 info 对象）。

**手动验收表**：

| # | 操作 | 期望 |
|---|------|------|
| 1 | 默认进入训练场 | 右上 Overlay 有 FPS 曲线 |
| 2 | 狂开 hit VFX | render/vfx 段 ms 上升 |
| 3 | `lockPresentToLogic` + 高刷 | FPS≈60 而非 120 |
| 4 | 关 Overlay | DOM 消失 |
| 5 | 开 GPU + 刷新 | GPU 行有数值或明确 n/a+warning |
| 6 | 开 Inspector | 官方面板出现且无持续 timestamp 报错 |
| 7 | 复制快照 | 剪贴板为合法 JSON schemaVersion:1 |

---

## 7. 文件落地一览（禁止散落）

| 路径 | 职责 |
|------|------|
| `app/src/debug/perf/perfTypes.ts` | 类型 |
| `app/src/debug/perf/perfMath.ts` | FPS/颜色纯函数（迁自 FpsHud） |
| `app/src/debug/perf/PerfSpans.ts` | 分段 |
| `app/src/debug/perf/PresentMeter.ts` | 呈现 FPS/历史 |
| `app/src/debug/perf/RenderInfoSampler.ts` | info 采样 |
| `app/src/debug/perf/GpuTimestampSampler.ts` | GPU 平均 |
| `app/src/debug/perf/PerfOverlay.ts` | DOM+Canvas UI |
| `app/src/debug/perf/PerfMonitor.ts` | 门面：组装 snapshot / export |
| `app/src/main.ts` | 埋点 + 循环迁移 |
| `app/src/config/constants.ts` 等 | 字段 |
| `app/src/debug/ControlPanel.ts` | 面板 |
| `app/tests/debug/*.ts` | 单测 |
| `app/src/debug/FpsHud.ts` | 瘦身为 re-export 或删除 DOM 类（保留测试兼容） |

---

## 8. 坑与技术陷阱（检索结论 → 方案对策）

| # | 陷阱 | 来源 | 本方案对策 |
|---|------|------|------------|
| 1 | stats-gl 在 three WebGPU r181+ 触发 `hasFeatureAsync` 弃用/不兼容 | REF-FORUM-STATSGL | **禁止依赖 stats-gl**；用自研 Overlay + 官方 Inspector |
| 2 | 自定义 rAF + Inspector 错误（含阴影） | REF-ISSUE-RAF | Step 6 迁 `setAnimationLoop` |
| 3 | `setAnimationLoop` **不 await** 异步回调 → finish 过早 | THREE-ANIM 源码 | init 后同步 `render`；热路径去掉 await |
| 4 | 多 pass 时 `info` 被中间 reset，drawCalls 只剩最后一 pass | THREE-INFO；Infos 改进讨论 | `autoReset=false`，每 present **一次** reset |
| 5 | `trackTimestamp` 不 `resolveTimestampsAsync` → query 池耗尽 | REF-TS-POOL；discourse Ocean 模块案例 | GPU 开时每 present 双 resolve |
| 6 | GPU 单次读数噪声大 | REF-TS-NOISE | 滚动平均 `perfGpuSampleAverage` |
| 7 | timestamp 量化/跨设备不可比 | REF-TS-QUANT | Overlay 标注「仅供相对对比」；不作绝对 SLA |
| 8 | timestamp 分配 OOM | REF-OOM | 捕获不可用 → `n/a` + warning，不抛崩 |
| 9 | Safari GPU timer 常需旗标 | stats-gl README；WebKit bug 讨论 | warning 文案提示 |
| 10 | `lockPresentToLogic` 跳帧导致「FPS」被误解 | APP-MAIN 注释 | 文案用「呈现 FPS」+ 并列逻辑 Hz |
| 11 | `performance.memory` 非标准 | REF-STATSJS 文档 | 缺则 `n/a`，不伪造 |
| 12 | 浏览器读不到整机 CPU%/GPU% | 平台限制 | 文档与面板 hint 写明；用帧时+GPU pass 代替 |
| 13 | Overlay 与 Inspector DOM 重叠 | 布局 | `perfOverlayPosition`；Inspector 开时默认改 overlay 到 `top-left` |
| 14 | 监测本身吃性能 | 常识 + Graphy 后台模式思路 | 曲线重绘节流；`document.hidden` 可暂停；GPU 默认关 |
| 15 | 仍使用已废弃 `computeAsync`/`renderAsync` | REF-FORUM-STATSGL；仓库内 HitSmoke/Wuda | Step 6 一并改到 init 后同步 API |
| 16 | WebGPU `renderer.info` 与扩展 DevTools 不一致 | three#32031 讨论 | **只信** `renderer.info`，不信第三方扩展计数 |

---

## 9. 推荐执行顺序（给 AI）

1. Step 1 纯逻辑 + 单测  
2. Step 3 Overlay UI（可先接假数据）  
3. Step 2 + Step 4 接入 main（仍可暂留自定义 rAF）  
4. Step 7 面板参数  
5. Step 5 GPU 可选  
6. Step 6 循环迁移 + Inspector（独立 PR 亦可）  
7. Step 8 导出与验收表勾选  

**完成定义**：验收表 1–7 全过；`npm test` 绿；无 stats-gl 依赖；CONFIG 含 §4 全部字段且面板可见。

---

## 10. 参考命令

```bash
cd app
npm test
npm run dev
# 浏览器：训练场 → 控制面板「性能」→ 开关 Overlay / GPU（刷新）/ Inspector
```

---

## 11. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-09-08 | v0 初稿：结合本仓库主循环与 three 0.185.1 Inspector；纳入 stats-gl 弃用、timestamp 池、异步 finish、多 pass info 等社群/源码陷阱 |
| 2026-09-08 | 落地 Step1–8：`app/src/debug/perf/*`、CONFIG/ControlPanel「性能」、`setAnimationLoop` + 同步 render、可选 Inspector/GPU；单测与 headless 冒烟通过 |

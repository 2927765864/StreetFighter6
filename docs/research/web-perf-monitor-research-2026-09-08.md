# 网页游戏性能监测方案调研

- **调研节点**：2026-09-08 20:09 CST / 12:09 UTC
- **项目现状**：`app/src/debug/FpsHud.ts` 已有简易帧率数字；目标是系统占用、低帧、热点定位、图形界面
- **检索范围**：互联网搜索 + GitHub 开源案例 + X 语义/关键词检索

---

## 1. 先分析：你要测什么

| 目标 | 白话解释 | 行业常见手段 |
|------|----------|--------------|
| 系统占用 | CPU / 内存 / GPU 大概吃了多少 | 悬浮面板 + 浏览器内存接口 + GPU 计时 |
| 低帧 | 哪几秒掉到 30/20，是否偶发卡顿 | 帧时间曲线、最小/平均/百分位 FPS |
| 热点 | 渲染、物理、特效、动画谁最吃时间 | 分段计时（begin/end）、抓帧、火焰图 |
| 图形界面 | 不只是数字，要有曲线/时间轴 | overlay HUD、DevTools、专业抓帧工具 |

**分层建议（对本项目最贴）**

1. **常驻悬浮面板**：边玩边看 FPS / 帧耗时 / CPU·GPU / 绘制次数  
2. **模块分段计时**：逻辑、碰撞、特效、渲染各自耗时  
3. **偶发深挖**：Chrome Performance / WebGPU Inspector / Spector（WebGL）抓一帧或几秒  
4. **（可选）线上埋点**：真实用户卡顿统计——当前不是第一优先级

---

## 2. 搜索计划（已执行）

| 通道 | 计划查询 | 目的 |
|------|----------|------|
| Web | Three.js / WebGPU FPS overlay、profiler、stats.js 替代品 | 找行业标准与开源面板 |
| GitHub | stats-gl、three-perf、gamestats、Spector、WebGPU Inspector | 重点案例链接 |
| X 语义 | “web game FPS profiler overlay Three.js WebGPU” | 社区真实推荐 |
| X 关键词 | stats-gl / r3f-perf / Spector / performance monitor | 补充讨论与发布时间 |

---

## 3. 行业方案分类（避免黑话）

### A. 浏览器自带（免费、最深）

- **Chrome / Edge 性能面板**：录几秒操作，看哪段脚本或渲染拖慢了整帧  
- **长任务 / 内存快照**：找偶发卡顿与内存上涨  
- **社区信号**：Three.js 官方账号建议用 Chrome DevTools（含 MCP）对游戏抓几帧再让 AI 分析优化点  

适合：已经知道“卡了”，要精确定位函数级原因。  
不适合：边打边看的常驻 HUD。

### B. 游戏内悬浮面板（最适合你现在做）

| 项目 | 链接 | 能做什么 | 备注 |
|------|------|----------|------|
| **stats.js** | https://github.com/mrdoob/stats.js | FPS / 帧毫秒 / 内存 | 行业入门标准，~9k stars；界面极简 |
| **stats-gl** | https://github.com/RenaudRohlinger/stats-gl | FPS + CPU + **真实 GPU 耗时**，支持 Three.js WebGL/WebGPU | X 上作者 @onirenaud 发布；对本仓库 WebGPU 路径最贴 |
| **three-perf** | https://github.com/TheoTheDev/three-perf | 曲线图 + 内存对象统计（几何/贴图等） | 从 r3f-perf 移植到纯 Three.js |
| **r3f-perf** | https://github.com/utsuboco/r3f-perf | React Three Fiber 场景性能面板 | 若不用 R3F 可参考 UI/指标设计 |
| **r3f-webgpu-perf** | https://github.com/ektogamat/r3f-webgpu-perf | WebGPU 版 R3F 面板 | 2026-06 X 发布（@Andersonmancini）；计划做 vanilla 版 |
| **gamestats.js** | https://github.com/ErikSom/gamestats | FPS 历史曲线 + **自定义分段**（physics/render） | 灵感来自 Unity Graphy；最接近“哪里吃性能” |
| **three-performance-panel** | https://github.com/AyyyCn/three-performance-panel | FPS、帧时、draw calls、三角形 | 轻量 RendererStats 现代改写 |
| **pixi-stats** | https://github.com/Prozi/pixi-stats | FPS + 绘制次数 + 贴图数 | 也可挂 Three |
| **DrawCallInspector** | https://github.com/Fyrestar/THREE.DrawCallInspector | 可视化哪次绘制最贵 | 偏“找贵绘制” |

### C. 专业抓帧 / GPU 调试（查“GPU 里发生了什么”）

| 项目 | 链接 | 白话用途 |
|------|------|----------|
| **Spector.js** | https://github.com/BabylonJS/Spector.js | 抓一整帧 WebGL 命令列表（扩展或嵌入） |
| **WebGPU Inspector** | https://github.com/brendan-duncan/webgpu_inspector | 查 WebGPU 对象、抓帧、看 GPU 时间、掉帧是否 CPU/GPU 瓶颈 |
| **3Lens** | https://github.com/adriandarian/3Lens | Three 场景内省 + 性能归因（重构中，偏重型） |
| **native-webgpu-profiler** | https://github.com/HarshdeepKahlon/native-webgpu-profiler | macOS 上把网页 GPU 轨迹开到 Xcode 分析 |

### D. 离线火焰图 / 采样分析

| 项目 | 链接 | 白话用途 |
|------|------|----------|
| **speedscope** | https://github.com/jlfwong/speedscope | 把性能采样结果做成可缩放火焰图 |
| **Firefox Profiler** | https://github.com/firefox-devtools/profiler | 浏览器性能轨迹可视化 |

### E. 桌面游戏叠加层（参考 UI，不宜直接嵌网页）

- MangoHud、OCAT、CapFrameX、Cleanmeter、Unity Graphy  
- 价值：帧时间曲线、最低帧、百分位、CPU/GPU 占用的**交互与视觉设计**可借鉴  
- Graphy：https://github.com/Tayx94/graphy  

### F. 网站级监测（Sentry / Lighthouse / Web Vitals）

- 更偏页面加载与真实用户体验，不是格斗游戏帧循环的第一选择。

---

## 4. X 社区检索要点（算法语义 + 关键词）

高信号帖：

1. **stats-gl 发布**（@onirenaud）：WebGL 实时 FPS/CPU/GPU 面板，附 demo 与 Three 示例  
2. **r3f-webgpu-perf 发布**（@Andersonmancini, 2026-06）：补上 WebGPU 下 r3f-perf 缺口；计划 vanilla Three 版  
3. **Godot 性能叠加层**（@HugoLocurcio）：FPS + 帧时间 + CPU/GPU 图 —— 说明“完整 HUD”在引擎界是标配组合  
4. **Three.js 官方**（@threejs, 2026-05）：用 Chrome DevTools 抓几帧再分析优化  
5. **独立开发者实时逻辑 profiler**：按组件/lambda 看最慢逻辑 —— 对应网页侧即 `begin('physics')` / `begin('render')` 分段  

结论：社区共识是 **常驻轻量面板（含 GPU）+ 分段计时 + DevTools/Inspector 深挖**。

---

## 5. 对本项目的匹配度（SF6 Web / Three WebGPU）

| 需求 | 优先推荐 | 理由 |
|------|----------|------|
| 常驻看 FPS / CPU / GPU | **stats-gl** | 官方支持 Three WebGPU，有真实 GPU 计时 |
| 看历史曲线与低帧尖刺 | **gamestats.js** 或自研基于其思路 | min/avg/max + 自定义段 |
| 看几何/贴图/绘制次数 | **three-perf** 或自读 `renderer.info` | 判断是否“画得太多” |
| 找“哪段代码慢” | 自研 `begin/end` 包住 combat / physics / VFX / render | 与现有 FpsHud、逻辑帧时钟契合 |
| WebGPU 深挖 | **WebGPU Inspector** + Three `trackTimestamp` | 项目已用 `three/webgpu` |
| WebGL 深挖（若回退） | Spector.js | 抓一帧命令 |

**不建议一上来就做**：完整 SaaS 线上 RUM、桌面级硬件温度叠加（浏览器沙箱拿不到显卡温度）。

---

## 6. 建议产品形态（后续实现可拆）

1. **轻量 HUD**：FPS、帧毫秒、逻辑帧、CPU/GPU ms、颜色告警（绿/黄/红）  
2. **曲线区**：最近 N 秒帧时间；标记掉帧  
3. **分段条**：logic / collision / cloth·VFX / render  
4. **渲染计数**：draw calls、三角形、几何体、贴图（能拿到多少算多少）  
5. **一键导出**：最近 5–10 秒 JSON，便于对比改动前后  

可在现有 `FpsHud` / `ControlPanel` 旁扩展，而不是另起一套。

---

## 7. 关键链接速查

- https://github.com/mrdoob/stats.js  
- https://github.com/RenaudRohlinger/stats-gl  
- https://github.com/TheoTheDev/three-perf  
- https://github.com/utsuboco/r3f-perf  
- https://github.com/ektogamat/r3f-webgpu-perf  
- https://github.com/ErikSom/gamestats  
- https://github.com/AyyyCn/three-performance-panel  
- https://github.com/Fyrestar/THREE.DrawCallInspector  
- https://github.com/BabylonJS/Spector.js  
- https://github.com/brendan-duncan/webgpu_inspector  
- https://github.com/jlfwong/speedscope  
- https://github.com/Tayx94/graphy  
- https://threejsroadmap.com/blog/profiling-webgpu （Three WebGPU 时间戳计时说明）

---

## 8. 下一步（若进入实现）

> **已落地执行方案（2026-09-08）**：`docs/plans/ai-execution-plan-web-perf-monitor-v0.md`  
> 关键修正：three **0.185.1** + WebGPU 路径上 **禁止依赖 stats-gl**（discourse：r181+ 不兼容，官方改推 `examples/jsm/inspector/Inspector.js`）；GPU 用 `trackTimestamp` + `resolveTimestampsAsync`；分段 UI 自研（只参考 gamestats API 形状）。

1. 按 plan v0：自研 PerfOverlay + `renderer.info` + 可选 GPU timestamp  
2. 替换现有 `FpsHud` DOM，保留呈现帧口径  
3. 可选迁移 `setAnimationLoop` 后挂官方 Inspector  
4. 导出最近 N 秒快照 JSON  

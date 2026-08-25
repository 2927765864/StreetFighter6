# 裤子物理监测 / 双通道报告 — 检索与案例分析（未完成 · 已抛弃）

> **状态**：**未完成 · 已抛弃**（2026-08-25）  
> **原因**：用户决定不再继续完成裤子物理子系统；上位共识与监测执行方案已抛弃。  
> **效力**：本调查**不再作为监测实现依据**；保留作历史记录。  
> **历史说明（废止前）**：节点 2026-08-24；目的为文字报告 + 图形/面板双通道依据；范围仅隆道服裤。

---

## 1. 搜索计划（已执行）

| 轮次 | 渠道 | 查询意图 | 状态 |
|------|------|----------|------|
| A | Web | MagicaCloth Cloth Monitor / Gizmo（布料调试可视化权威） | ✅ |
| B | Web / GitHub | 开源布料 debug：粒子色、约束线、碰撞线 | ✅ |
| C | Web | Three.js 运行时 DOM 性能/自定义 HUD（stats.js 族） | ✅ |
| D | X semantic | cloth physics debug / stretch / gizmo / monitor | ✅（噪声多，有效信号见 §3） |
| E | X keyword | MagicaCloth / BoneCloth / SPCR / spring bone + debug/gizmo | ✅（近期关键词噪声大；Magica 文档仍为权威） |
| F | 仓内 | 已有调试面板、Vite 写盘 API、裤子熔断字段 | ✅ |

---

## 2. 产品侧已确认需求（对话 2026-08-24）

| 项 | 选择 |
|----|------|
| 文字用途 | 出事复盘 + 平时健康扫一眼 + 调参对比 |
| 交付 | **磁盘文件 + 画面小摘要** |
| 图形 | **先报警变色**；专用显示以后 |
| 范围 | **只做裤子** |
| 写盘 | 每隔几秒健康快照；**异常另存带时间戳事故文件** |
| 画面 | **常驻小面板**（几项关键数字） |
| 调参 | **单独「记下当前手感」按钮** |

---

## 3. 案例与依据（必须引用）

### 3.1 MagicaCloth — Cloth Monitor / Gizmo（可视化分层）

- 文档：[Cloth Monitor](https://magicasoft.jp/en/magica-cloth-cloth-monitor-2/) · [Gizmo](https://magicasoft.jp/en/mc2_magicacloth_gizmo/)
- **采用语义**：
  - **Base Pose / Animated Position**：动画目标位 vs 模拟位 —— 对应本仓已有 `transformPos` vs `positionCurrent` 偏离。
  - **Struct Distance Line**：结构距离约束线 —— 对应本仓橙色 structural 约束线。
  - 固定点红 / 可动点白绿（BoneCloth 文档）—— 本版图形先做**整网线变色报警**，不强制画点（用户确认「专用显示以后」）。
- **陷阱**：Magica 写明 Gizmo **仅 Editor、不进 Build**。本项目是浏览器运行时调试 → 必须用 **Three `LineSegments` + DOM 面板**，不能假设「仅编辑器」。

### 3.2 Unity Cloth Constraints Tool（用颜色表达数值）

- 文档：[Unity Manual · Cloth](https://docs.unity3d.com/6000.4/Documentation/Manual/class-Cloth.html)
- **采用语义**：粒子颜色按约束强度谱着色。本版降级为：**约束线材质颜色按健康等级**（正常 / 警告 / 异常），与文字报告同一套阈值。

### 3.3 GitHub · alien-life/gpu-cloth-sim（运行时 debug 开关）

- 仓库：https://github.com/alien-life/gpu-cloth-sim  
- `debug_show_particles` / `debug_show_colliders` / `debug_show_peer_proxy`；锚点红、自由绿。
- **采用语义**：调试绘制必须 **cfg 布尔开关**；默认可关；碰撞/约束分开关（本仓已有 `pantsShowConstraints` / `pantsShowColliders`）。
- **陷阱**：其 README 写明粒子 debug **每帧 GPU readback，影响性能**。本仓粒子已在 CPU → 算偏离无额外 readback；仍禁止无开关的每帧重型文件 I/O。

### 3.4 GitHub · cristhiandrm/FlexibleMesh（约束线 Gizmo）

- 仓库：https://github.com/cristhiandrm/FlexibleMesh  
- `OnDrawGizmos` 画 stick 约束。  
- **采用语义**：约束线 = 结构约束透视，不是物理力本身（与用户已理解一致）。

### 3.5 Three.js DOM HUD 族（画面小面板）

| 项目 | 链接 | 采用点 |
|------|------|--------|
| mrdoob/stats.js（three examples） | `three/examples/jsm/libs/stats.module.js` | `position:fixed` DOM 叠层、每帧/节流更新文字 |
| AyyyCn/three-performance-panel | https://github.com/AyyyCn/three-performance-panel | 轻量自定义指标面板、色标反馈 |
| RenaudRohlinger/stats-gl | https://github.com/RenaudRohlinger/stats-gl | 可关面板、采样率；**不引入依赖**，只抄「DOM + 节流」习惯 |

**禁止**：为本功能新加 npm 依赖；面板用原生 DOM + 现有 `ControlPanel` 风格即可。

### 3.6 仓内已有写盘先例（浏览器 → 磁盘）

- `app/vite-plugins/boxOverrideApi.ts`：`fetch` → Vite 中间件 → `fs.writeFileSync`，路径防 `..`。
- **采用语义**：报告写盘必须走 **同类 Vite dev API**；生产/静态托管写盘失败时降级为「仅 HUD + console」，不得抛崩游戏。

### 3.7 仓内裤子熔断（异常判定母本）

- `pantsMaxSeparation` / `pantsRootSlideLimit` / `pantsRootRotateLimitDeg`（`constants.ts` + `pantsSpcrSolver.ts`）
- **采用语义**：健康等级阈值必须复用这些字段，禁止另起一套「神秘阈值」。

### 3.8 X 检索说明

- Semantic：布料调试讨论偏展示向；有效工程信号仍回落到 Magica Gizmo / 自研 solver 稳定性叙事。
- Keyword（MagicaCloth/BoneCloth/SPCR+debug）：2026-08 时间窗噪声高（服饰广告等）。  
- **结论**：可视化权威以 Magica 文档 + GitHub debug 开关模式为准；不以单条推文定架构。

---

## 4. 技术陷阱（检索补充）

| ID | 来源 | 陷阱 | 本方案对策 |
|----|------|------|------------|
| TRAP-GIZMO-EDITOR | Magica Gizmo 文档 | 仅编辑器可见 | 运行时 Line + DOM |
| TRAP-DEBUG-COST | gpu-cloth-sim README | 重型 debug 每帧伤性能 | 快照节流；事故才写第二文件；面板节流 100–200ms |
| TRAP-BROWSER-FS | Web 平台常识 + 本仓 box API | 浏览器不能直接写 `docs/` | Vite plugin API；失败不崩 |
| TRAP-DUAL-METRIC | 工程常识 | HUD 与文件数字不一致 | 单一 `PantsHealthSnapshot` 结构两边共用 |
| TRAP-INCIDENT-FLOOD | 日志系统常识 | 每帧异常刷盘 | 边沿触发（进入 abnormal 才写）+ 目录上限 |
| TRAP-LINE-RECREATE | three.js 实践 | 每帧 new Material/Geometry | 只改 `material.color`；几何仍按现有 refresh |
| TRAP-HELPER-PARENT | pants 方案 TRAP-HELPER-PARENT | helper 挂角色子树双重变换 | 约束线继续挂 scene helperRoot |

---

## 5. 推荐架构（摘要，细则见执行方案）

```
每帧 pants.update 末尾
  → samplePantsHealth()  → PantsHealthSnapshot
  → 更新约束线颜色（人）
  → 节流更新 DOM 小面板（人）
  → 节流 POST /api/pants-report/health（AI：latest.md）
  → 若状态升至 abnormal：POST incident（AI：带时间戳）
面板按钮「记下当前手感」→ POST feel-log（追加）
```

# 修改方案：打击特效独立编辑页（URL）

> **状态**：可执行（2026-08-26）  
> **上位**：`docs/hit-vfx-consensus-v0.md`（独立预览台）  
> **原执行方案**：`docs/plans/ai-execution-plan-hit-vfx-v0.md`  
> **本修订动机**：用户要求在**新场景**调试——保留场地与光照、**去除角色**、使用**专门编辑页面**；入口为**独立 URL**。

---

## 1. 目标形态

| 项 | 决定 |
|----|------|
| 入口 | Vite 多页：`/hit-vfx.html`（开发与构建均可直达） |
| 场景内容 | **有**：训练场场地 GLB、同一套 `CONFIG.lights` / 环境雾背景、可被照亮假人、特效运行时 |
| 场景内容 | **无**：P1/P2 角色、MatchSim 对打、框图编辑、HUD 血条等对战层 |
| UI | **专用编辑面板**（非整页塞进主训练控制面板）；主训练面板只保留「打开特效编辑页」链接 + 实战配方开关 |
| 运行时 | 与对战**同一** `HitVfxRuntime` / 配方 JSON（`CONFIG.hitVfxRecipes`）；编辑页改完可存 shipping/本地，回主场景生效 |
| 相机 | 编辑页默认自由轨道（OrbitControls），便于绕假人看特效；不改对战镜头逻辑 |

---

## 2. 不做

- 不在主场景再叠「预览台假人模式」作为正式编辑入口（`hitVfxPreviewActive` 降级/移除主路径）。  
- 不另起第二套配方格式。  
- 不在编辑页加载角色网格。

---

## 3. 文件与步骤

| 步骤 | 内容 |
|------|------|
| A | 新增 `app/hit-vfx.html` + `app/src/hitVfxEditor/main.ts` |
| B | `HitVfxEditorApp`：WebGPURenderer、StageView、LightRig、DynamicLighting、假人、Runtime、Orbit |
| C | `HitVfxEditorPanel`：从主面板迁出特效编辑控件（配方/元素/力度/种子/重放/步进/存档） |
| D | `vite.config.ts` `build.rollupOptions.input` 增加 `hit-vfx` |
| E | 主 `main.ts`：去掉主场景预览假人路径；ControlPanel 打击特效区改为链接 + 实战相关开关 |
| F | 共识小修订：预览台 = 独立 URL 页 |

---

## 4. 验收

1. 浏览器打开 `http://localhost:5173/hit-vfx.html`（或构建后同路径）可见场地+光照、无角色。  
2. 面板可重放/改参/锁种子；假人可被火花点光照亮。  
3. 主训练场 `/` 仍可在命中时播特效；编辑入口跳到独立页。  
4. `vite build` 产出含 `hit-vfx.html`。  

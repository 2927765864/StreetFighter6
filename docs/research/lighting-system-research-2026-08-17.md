# 训练场灯光编辑系统 · 调查笔记

> **日期**：2026-08-17（检索约 **16:34 CST / 08:34 UTC**；成文同日）  
> **性质**：调查。记录查过什么、社区与开源怎么做、和本仓库差距。  
> **不是共识，也不是执行方案。** 目标以 `docs/consensus-lighting-v0.md` 为准。  
> **检索通道**：网页 / GitHub、X 语义检索、X 关键词 Latest。  
> **相关历史调查**：场景/镜头/旧光混合见 `docs/research/scene-camera-lighting-research-2026-08-17.md`（仍非共识）。

---

## 1. 当时要查什么

在已定「要对原作调光」的前提下，查：

1. 浏览器 / three.js 里有没有**可增删光源、面板属性、场景 helper、可拖变换**的现成做法。  
2. GitHub 上有没有可抄交互与架构的项目。  
3. X 社区近期对 **动态灯、WebGPU、灯光工具** 说了什么。  
4. 动态增删灯在 three / WebGPU 上有哪些坑。

**查完后的总判断：**

- **完整「游戏内 light outliner」开源成品很少**；更常见是：官方 Editor 整包、框架插件（threepipe widgets）、或垂直小工具（lightmatch）。  
- 可落地的拼装路径清晰：**列表数据 + Light 同步 + Helper + TransformControls + 调试面板**。  
- 本仓库当时是**固定 5 灯扁平 config**，无 helper、无增删、无视口拖拽——与「可编辑灯光系统」差距在**数据模型与调试 UX**，不在「会不会 new DirectionalLight」。  
- WebGPU / 动态灯有历史坑；2026 有 dynamic lights 相关社区讨论，**实现前必须在本项目 renderer 上实测**。

---

## 2. 本仓库当时的样子（事实，不是目标）

| 项 | 事实 |
|----|------|
| 模块 | `app/src/render/LightRig.ts`：`createLightRig` + `applyLightConfig` |
| 结构 | 固定 `ambient` / `hemi` / `key` / `fill` / `rim` |
| 配置 | `MutableSimConfig` 扁平字段（`lightKeyX`…、`lightFill*`… 等） |
| 面板 | 参数面板「打光」分类：强度与位置数字；**无列表增删** |
| lil-gui | 另有颜色/雾/背景等 |
| 视口 | **无** LightHelper、**无** TransformControls 绑灯 |
| 阴影 | `castShadow = false`（创建时） |
| 接入 | `main.ts` 创建 rig，配置变更时 `applyLightConfig` |

训练场观感相关旧调查（房间/截图对照习惯）仍见同日 scene-camera-lighting 调查笔记；**不**把其中未证实数字当灯位权威。

---

## 3. 需求侧对照（调查用语，非正式共识条文）

对话中逐步澄清、后已写入共识的方向（此处仅作调查背景）：

- 主目标：对照原作训练场光。  
- 长期开发工具，非玩家功能。  
- 面板 + 场景可见可拖。  
- 方向/点/聚光 + 环境/半球；约 8～15 盏。  
- 本地/预设存档；单主方向光基础阴影；**替换**旧扁平五灯。  
- 摆灯时临时自由视角。

---

## 4. X 检索（算法语义 + 关键词）

### 4.1 语义检索命中（与灯光编辑/动态灯相关）

| 帖子 | 时间（帖内） | 要点 | 调查怎么用 |
|------|----------------|------|------------|
| [@onirenaud · dynamic lights](https://x.com/onirenaud/status/2024414251075719527) | 2026-02 | three WebGPU 方向：`renderer.lights.dynamic = true`，避免每次加/改灯整包 material/shader rebuild；附 with/without 对比视频 | **引擎前提**：自由增删灯前必查本项目 three 版本是否具备等价能力 |
| [@0xca0a · Environment + Lightformer](https://x.com/0xca0a/status/1500528002769301511) | 2022-03 | drei：HDRI/预设、Lightformer 模拟棚灯 | studio 预设思路；**不是** light outliner |
| [@0xca0a · RoomEnvironment + ring](https://x.com/0xca0a/status/1857444050707640651) | 2024-11 | 代码搭环境 + 环形补光，体积小可控制 | 预设/环境光参考 |
| [@chrisrogers3d · lightmatch](https://x.com/chrisrogers3d/status/2086897379354312883) | 2026-08 | 浏览器内把 three 场景光**拟合到参考图**；demo + GitHub | 对照原作的**辅助求解**相邻产品；非 CRUD 编辑器 |
| [@casey_sheep · viewport 调灯](https://x.com/casey_sheep/status/1747651085517631543) | 2024-01 | Blender 插件：视口直接调灯 | **UX 标杆**（非 three） |
| [@nomadsculpt · 视口 light size/angle](https://x.com/nomadsculpt/status/1745399500024250756) | 2024-01 | Nomad：方向光 angle、点/聚光 size 视口控件 | 显性 GUI + 视口一体参考 |
| [@andreestech · map editor + lighting](https://x.com/andreestech/status/2077766851862413385) | 2026-07 | 自定义 three 地图编辑器含 lighting | 产品形态参考；缺开源链接 |

### 4.2 关键词 Latest：`(three.js OR threejs) (light) (editor OR gizmo OR helper OR TransformControls)`

- 近期多为关卡编辑器进度贴、简单 lighting，**很少**完整开源 multi-light CRUD。  
- 判断：three 社区**缺少**「可直接依赖的单一明星 light editor 库」；工程上宜抄 **Editor / threepipe / 自研列表** 而非等现成全家桶。

### 4.3 二次语义：WebGPU 动态灯

- 再次命中 @onirenaud dynamic lights。  
- 亦见 lightmatch、shader 向动态光讨论；与「编辑器 gizmo」正交。

---

## 5. 网页 / GitHub 重点案例

### 5.1 第一梯队（对齐「列表 + 视口 + 属性」）

| 项目 | 链接 | 可借鉴 |
|------|------|--------|
| **three.js 官方 Editor** | [编辑器](https://threejs.org/editor/) · [源码 `editor/`](https://github.com/mrdoob/three.js/tree/dev/editor) | Add 灯、层级选中、属性、View → **Light Helpers**；交互默认标杆 |
| **threepipe · Object3DWidgetsPlugin** | [repo](https://github.com/repalash/threepipe) · [插件文档](https://threepipe.org/plugin/Object3DWidgetsPlugin.html) · [示例](https://threepipe.org/examples/#object3d-widgets-plugin) | 灯/相机入场景**自动 helper/gizmo**；另有 Transform / Generator 插件 |
| **polyple（nd-viewer）** | [https://github.com/srdz-af/nd-viewer](https://github.com/srdz-af/nd-viewer) | README：用户创建 point/directional；选中、transform、directional handles、shadow；**Lights Tab**（类型/色/强度/阴影/删除）——最接近轻量「灯光页」 |

### 5.2 第二梯队（相邻能力）

| 项目 | 链接 | 可借鉴 |
|------|------|--------|
| **lightmatch** | [GitHub](https://github.com/chrisrogers3d/lightmatch) · [Demo](https://chrisrogers3d.graphics/lightmatch/) | 参考图统计损失 + 求解曝光/环境/灯组等；适合「像不像」辅助，**不是**多灯 CRUD |
| **官方 Helpers** | [DirectionalLightHelper](https://threejs.org/docs/#api/en/helpers/DirectionalLightHelper) · [PointLightHelper](https://threejs.org/docs/#api/en/helpers/PointLightHelper) · [SpotLightHelper](https://threejs.org/docs/#api/en/helpers/SpotLightHelper) | 调试可视化基元 |
| **Helper + TransformControls** | [Discourse 讨论](https://discourse.threejs.org/t/how-to-control-directional-light-helper-with-transform-controls/17339) | 方向光 target 与 gizmo 联动注意点 |
| **threepp editor** | [markaren/threepp](https://github.com/markaren/threepp) | hierarchy + inspector（含 light）+ TransformControls；C++，UX 参考 |
| **WraithEngine（描述）** | [Tamely/WraithEngine](https://github.com/Tamely/WraithEngine) | 灯用彩色 billboard 可点选——远距离识别 UX |
| **drei Environment / Lightformer** | pmndrs 生态（见 X @0xca0a） | 好看棚光/环境；预设包而非编辑器 |
| **enhance-shader-lighting** | [0beqz/enhance-shader-lighting](https://github.com/0beqz/enhance-shader-lighting) | 增强光照观感，非编辑系统 |

### 5.3 引擎坑（实现前必读）

| 话题 | 链接 | 含义 |
|------|------|------|
| WebGPU 动态加删灯 | [Discourse #74708](https://discourse.threejs.org/t/webgpu-lighting-issue-unable-to-dynamically-add-or-remove-lights/74708)（2024-12） | WebGPU 路径曾出现加删灯场景树变了但画面不更新；WebGL 正常 |
| 多灯与 recompile / 帧率 | [Discourse #61876](https://discourse.threejs.org/t/light-and-framerate/61876) | 灯多、加删触发材质重建成本；灯**不**按视锥自动剔除 |
| Runtime add/remove | [SO](https://stackoverflow.com/questions/65172836/three-js-how-to-add-and-remove-lights-at-run-time) · [Discourse](https://discourse.threejs.org/t/adding-and-removing-three-js-lights-at-run-time/3303) | 经典「改了灯不更新」集合 |
| 多 point light 优化讨论 | [Discourse #36153](https://discourse.threejs.org/t/optimizing-point-lights/36153) | 数量上去后的性能思路（调查级，非本项目结论） |

---

## 6. 案例对照表（调查评价）

| 能力 | three Editor | polyple Lights Tab | threepipe Widgets | lightmatch | 本仓库当时 |
|------|--------------|--------------------|-------------------|------------|------------|
| 多灯列表增删 | 强 | 强 | 依赖生成/场景 API | 弱（调全局/组参） | 无 |
| 属性面板 | 强 | 强 | 有生态 UI 插件 | 有求解 UI | 扁平滑条 |
| 视口 Helper | 有（Light Helpers） | 有 handles | **自动** | 非重点 | 无 |
| Transform 拖拽 | 有 | 有 | 有插件 | 非重点 | 无 |
| 对照参考图 | 无 | 无 | 无 | **强** | 无 |
| 可直接当依赖嵌训练场 | 过重 | 可参考代码 | 可参考插件设计 | 可选用辅助 | — |

**调查建议（非正式排期）：**

1. **UX** 抄 three.js Editor 的加灯 / 选中 / Light Helpers。  
2. **面板信息架构** 抄 polyple Lights Tab。  
3. **运行时可视化策略** 抄 threepipe「灯进场景 → helper」生命周期。  
4. **对照原作** 可选用 lightmatch 思路作可选辅助，**不要**替代列表编辑器。  
5. **先在本项目 WebGPU 上验证** 动态增删灯与阴影（单主方向光）是否稳定。

---

## 7. 拼装草图（仅调查笔记，非方案正文）

逻辑层（概念）：

```
LightDesc[]  ──sync──►  THREE.Light + (debug) Helper + 可选 TransformControls
     ▲
     └── 打光面板列表/属性  +  本地/shipping 预设
```

与旧 `LightRig` 固定五引用模型的差异：从「命名槽位」变为「id 列表 + 类型字段」；默认预设用迁移把旧 key/fill/rim 数值写成初始 `LightDesc[]`。

---

## 8. 未深入 / 未验证

- 未在本机克隆 threepipe / polyple 跑通示例。  
- 未核对当前依赖 `three@0.185` 是否已合并 `lights.dynamic` 及确切 API 名。  
- 未测训练场 glb 上 `castShadow` / 接收阴影材质是否齐全。  
- 未做 lightmatch 与 SF6 截图的实际拟合试验。

---

## 9. 链接速查

| 用途 | URL |
|------|-----|
| 官方编辑器 | https://threejs.org/editor/ |
| three editor 源码 | https://github.com/mrdoob/three.js/tree/dev/editor |
| threepipe | https://github.com/repalash/threepipe |
| Object3DWidgetsPlugin | https://threepipe.org/plugin/Object3DWidgetsPlugin.html |
| polyple / nd-viewer | https://github.com/srdz-af/nd-viewer |
| lightmatch | https://github.com/chrisrogers3d/lightmatch |
| lightmatch demo | https://chrisrogers3d.graphics/lightmatch/ |
| DirectionalLightHelper | https://threejs.org/docs/#api/en/helpers/DirectionalLightHelper |
| WebGPU 动态灯帖 | https://discourse.threejs.org/t/webgpu-lighting-issue-unable-to-dynamically-add-or-remove-lights/74708 |
| X · dynamic lights | https://x.com/onirenaud/status/2024414251075719527 |
| X · lightmatch | https://x.com/chrisrogers3d/status/2086897379354312883 |

---

## 10. 与文档关系

| 文件 | 关系 |
|------|------|
| `docs/consensus-lighting-v0.md` | **唯一**光照共识上位 |
| `docs/consensus-scene-camera-lighting-v0.md` | **已废止** |
| `docs/research/scene-camera-lighting-research-2026-08-17.md` | 旧混合调查；场景/镜头史实可参考 |
| `docs/plans/ai-execution-plan-lighting-system-v0.md` | **现行**执行方案（可引用本笔记链接与坑；**不得**把本笔记写法写成已共识） |

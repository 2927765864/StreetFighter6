# 武打粒子系统 · 调查笔记

> **日期**：2026-09-01（检索节点约 **09:29 UTC / 17:29 CST**；成文同日）  
> **性质**：调查。记录检索计划、实体补漏、开源与社区案例、与本仓库差距、实现陷阱。  
> **不是共识，也不是执行方案。** 目标以 `docs/wuda-particle-consensus-v0.md` 为准。  
> **选定方向（对话确认）**：方案 B——全身薄涂层 + 速度/急停脱落。  
> **技术栈锚点**：本仓库 `three@^0.185.1`、`WebGPURenderer`、`FighterView` 蒙皮角色、`DebugGui`/`ControlPanel`、已有 `three-plume`（打击特效用）。

---

## 1. 需求白话（调查口径，非正式共识）

角色身上盖一层可换外观的附着物（粉尘 / 水 / 泥 / 气）。附着物跟肢体表面走；肢体突然加速或急停时，附着物因跟不上而甩出，并带着脱落瞬间的速度继续飞。动得猛的部位效果更强。外观参数可换，核心是 **附着 → 跟动 → 因运动脱落**。

---

## 2. 检索怎么做的

### 2.1 第一遍（效果词）

Web / GitHub / X：惯性粒子、骨骼附着、Niagara Mesh Reproduction、Inherit Velocity、格斗扬尘等。

### 2.2 第二遍补漏（强制实体 / 实现词）

从第一遍抽出作者 / 项目 / 术语，再按：实体反查 → 算法词替换 → 锚点辐射 → 社区追链 → 去 `site:` 重搜 GitHub → X/论坛实现词追链。

**实体样例**：Keijiro Takahashi；Simon Strand / Karlos Napa Häger；Tomohiro Kuwano。  
**项目样例**：Smrvfx；Skinner；POBBSA；ParticlePhysics。  
**实现词样例**：`SkinnedMeshBaker` / `VelocityMap`；`Overwrite Intrinsic Variable`；`CutoffSpeed` / `speedToLife`；`Sample Skinned Mesh` Velocity。

---

## 3. 重要链接与用途（执行时只当参考，定案看共识 + 执行方案）

### 3.1 附着 / 速度采样（最核心）

| 链接 | 用途 |
|------|------|
| https://github.com/keijiro/Skinner | **运动幅度驱动粒子**：顶点速度 → 发射概率 / 寿命 / 拖尾；参数名 `CutoffSpeed`、`speedToLife`、`drag`、`gravity`、`EmissionProb`。方案 B「快才甩」的手感参照。 |
| https://github.com/keijiro/Smrvfx | 蒙皮网格每帧烘焙 **PositionMap + VelocityMap** 给 VFX；说明「速度 = 前后帧位置差」管线。 |
| https://github.com/NoiseCrimeForks/Keijiro-Smrvfx | 恢复旧版 `SkinnedMeshBaker`；用上一帧位置纹理算速度，降低拷贝开销。 |
| https://docs.unity3d.com/Packages/com.unity.visualeffectgraph@17.0/manual/Operator-SampleSkinnedMesh.html | 官方 `Sample Skinned Mesh` 可直接输出 **Velocity**（Position − PreviousPosition）/ Δt。 |
| https://x.com/_kzr/status/1111201683235696640 | Keijiro 宣布 Smrvfx 加入逐顶点速度，并链仓库。 |
| https://x.com/_kzr/status/814467015045849089 | Skinner 首发帖，链 https://github.com/keijiro/Skinner |

### 3.2 「粘住」与「松手飞走」开关

| 链接 | 用途 |
|------|------|
| https://forums.unrealengine.com/t/niagara-skeletal-mesh-how-to-add-forces-or-velocity/486439 | **关键开关**：`Update Mesh Reproduction` 若勾选 **Overwrite Intrinsic Variable**，每帧覆盖 Position/Velocity → 粒子死粘；取消覆盖才能叠加速度/重力飞走。方案 B 状态机的直接类比。 |
| https://docs.unrealengine.com/5.3/en-US/particle-update-group-reference-for-niagara-effects-in-unreal-engine/ | 官方说明：Overwrite 为 False 时须自行用模块输出驱动位置等。 |

### 3.3 表面均匀涂层采样

| 链接 | 用途 |
|------|------|
| https://threejs.org/docs/pages/MeshSurfaceSampler.html | **本仓库已依赖 three**：面积加权表面采样；`build()` 一次，`sample()` 多次。涂层初始点分布主 API。 |
| https://github.com/mrdoob/three.js/blob/r185/examples/jsm/math/MeshSurfaceSampler.js | 源码：面积分布 + 三角内均匀重心坐标。 |
| https://github.com/PaulDemeulenaere/vfx-uniform-mesh-sampling | Unity：烘焙 **三角索引 + 重心坐标**，再对蒙皮表面采样——**跟踪变形皮肤**的标准做法。 |
| https://discussions.unity.com/t/uniform-distribution-with-skinned-mesh-sampling/859989 | 上项配套论坛说明（面积前缀和、重心坐标缓冲）。 |
| https://github.com/probcomp/UnityMeshSampling | Unity 蒙皮/静态/按骨采样（CPU/GPU）；对照「按骨加权涂层密度」思路。 |
| https://github.com/alters-mit/pincushion | 蒙皮表面均匀采样另一实现（Rust 加速）；对照用。 |

### 3.4 惯性 / 骨骼速度夸张（网格侧，非粒子本体）

| 链接 | 用途 |
|------|------|
| https://velocityskinning.com/ | Velocity Skinning：用骨骼线/角速度做拖拽与拉伸变形。 |
| https://github.com/drohmer/velocity_skinning_web | **JS/WebGL** 实现，便于对照；**不是**方案 B 主路径（那是网格变形）。 |
| https://github.com/drohmer/velocity_skinning_replicability | 论文可复现 C++/GPU 代码。 |
| https://arxiv.org/pdf/2104.04934 | 论文：follow-through / drag 的速度项公式。 |

### 3.5 「沙人 / 覆盖物跟骨」概念原型

| 链接 | 用途 |
|------|------|
| https://www.diva-portal.org/smash/get/diva2:1791831/FULLTEXT02.pdf | POBBSA：骨上 OBB 带动粒子；可跟骨、可叠加、可掉落——观感最接近「覆盖物飞溅」，但是论文原型，不当游戏主引擎。 |

### 3.6 重物理（明确不作为方案 B 主路径）

| 链接 | 用途 |
|------|------|
| https://github.com/qoopen0815/ParticlePhysics | Unity 砂粒（Bell et al. 论文）；只作「真沙」对照。 |
| https://github.com/JohannHotzel/unified-solver | XPBD 统一粒子；过重，排除作涂层主路径。 |

### 3.7 Three.js / Web 粒子渲染（本仓库相关）

| 链接 | 用途 |
|------|------|
| https://github.com/NewKrok/three-particles | Three 粒子库（重力/速度/WebGPU）；可选对照，**本仓打击特效已锁定 three-plume，涂层主模拟不另起第二引擎**。 |
| https://discourse.threejs.org/t/gpgpu-particles-on-animated-model/88759 | 动画蒙皮模型上挂 GPU 粒子实验。 |
| 本仓 `app/src/render/hitVfx/` + `three-plume@0.1.1` | 已有 WebGPU 粒子运行时；**脱落自由飞行段可复用 spawn 注入初速**，粘着段不走 plume 发射器模型。 |

### 3.8 商业游戏脏污（事件/贴图驱动，作对照）

| 链接 | 用途 |
|------|------|
| https://blog.playstation.com/2021/01/12/how-stunning-visual-effects-bring-ghost-of-tsushima-to-life/ | 泥血刷到网格 + 击打喷粒子；偏事件，不完全是运动惯性涂层。 |

---

## 4. 与本仓库的差距（2026-09-01）

| 已有 | 没有 |
|------|------|
| `FighterView` 活 `SkinnedMesh` + `skeleton.update()` | 表面涂层粒子系统 |
| `applyBoneTransform` 可用（three 官方 API） | 三角索引 + 重心坐标烘焙管线 |
| `MeshSurfaceSampler` 随 three 附带 | 「粘着 / 脱落」状态机 |
| `three-plume`（打击特效） | 武打涂层专用 CONFIG / Debug 文件夹 |
| 头巾/腰带/裤子物理：墙钟 dt、hitstop 豁免先例 | 与打击特效配方的职责边界文档（见共识） |

---

## 5. 实现陷阱（第三轮补搜，写入执行方案 §避坑）

| 陷阱 | 来源 | 结论 |
|------|------|------|
| 粒子相对蒙皮 **慢一帧** | [Discourse: bone/bind matrices update timing](https://discourse.threejs.org/t/skinned-mesh-related-bone-bind-matrices-update-timing/34210) | 须在动画/`skeleton` 更新之后采样；RTT 方案用 `onBeforeRender` 上传骨数据。本方案 CPU 路径：在 `FighterView.syncFromLogic` **动画与 skeleton.update 之后**再跑涂层。 |
| `localToWorld` **不含蒙皮** | [Discourse: localToWorld wrong with skeleton](https://discourse.threejs.org/t/localtoworld-gives-wrong-value-if-the-mesh-was-transformed-by-skeleton/24925) | 必须 `applyBoneTransform(index, v)` 再乘 `matrixWorld`。 |
| Niagara 粘死飞不走 | [UE 论坛 Overwrite Intrinsic](https://forums.unrealengine.com/t/niagara-skeletal-mesh-how-to-add-forces-or-velocity/486439) | 粘着态：每帧写位置；脱落态：**禁止**再覆盖位置，只积分速度。 |
| 蒙皮速度采样滞后 / 脏数据 | Unity 讨论「VFX 在蒙皮更新前跑」；Smrvfx issue #30 大采样数 overrun | 第一帧速度置 0；`dt` clamp；采样点数上限。 |
| WebGPU `Points` 仅 1px | 本仓打击特效方案 §12 | 涂层渲染用 **InstancedMesh 小四边形 / Sprite**，或脱落段交给 plume；禁止指望 `gl_PointSize`。 |
| 每帧 `applyBoneTransform` 全顶点过贵 | Discourse 蒙皮 CPU 瓶颈讨论 | 只对 **涂层样本点**（≤ 配置上限）做蒙皮插值，不对全网格。 |
| hitstop 时逻辑停、墙钟继续 | 本仓 `MatchSim` + 头巾方案 | 涂层更新用 **墙钟 dt**；身体定住时不应新脱落，已脱落粒子继续飞。 |

---

## 6. 方案对照（调查结论）

| 方案 | 匹配度 | 调查结论 |
|------|--------|----------|
| A 关节挂点甩 | 中 | 快，但不是「身上一层」。 |
| **B 薄涂层 + 速度脱落** | **高** | 对话选定；积木 = MeshSurfaceSampler/重心跟踪 + Velocity 差分 + Skinner 阈值 + Overwrite 状态机。 |
| C 只喷不粘 | 中 | 冲击感强，缺常驻覆盖。 |
| D Velocity Skinning | 辅 | 网格夸张，不作粒子主路径。 |
| E 真沙物理 | 低 | 过重。 |

---

## 7. 文档去向

| 文件 | 角色 |
|------|------|
| 本文件 | 调查（可增补链接，不单独定「做什么」） |
| `docs/wuda-particle-consensus-v0.md` | **共识锁定** |
| `docs/plans/ai-execution-plan-wuda-particle-v0.md` | AI 可执行方案（每步有仓库/API 依据） |

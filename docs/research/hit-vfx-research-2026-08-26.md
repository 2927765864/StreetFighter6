# 打击特效 · 调查笔记

> **日期**：2026-08-26（检索节点约 **12:34 CST / 04:34 UTC**；成文同日）  
> **性质**：调查。记录分析、检索计划、执行结果、社区与开源案例、和本仓库差距。  
> **不是共识，也不是执行方案。** 目标以 `docs/hit-vfx-consensus-v0.md` 为准。  
> **检索通道**：网页 / GitHub、X **语义检索**（算法）、X **关键词 Latest**。  
> **共识来源**：2026-08-26 对话确认后落盘。

---

## 1. 先分析：共识拆成可检索问题

共识要的是「打中人」的**规则驱动画面特效** + **独立预览编辑台**，不是抄正版解包、不是逐帧精灵主路径。

| 共识需求块 | 调查要回答的问题 |
|------------|------------------|
| 火花 / 附带粒子 / 短促扬尘 / 汗珠飞溅 | three / WebGPU 生态里有没有**可参数化、可 burst、可寿命消亡**的粒子引擎？有没有冲击火花 / 扬尘预设？ |
| 火花短命光照，照角色 + 同组特效 | 有没有「粒子驱动点光」或「短命 PointLight 池」的开源做法？本仓库灯槽够不够？ |
| 看起来像物理即可；只靠寿命消失 | 重力 / 初速 / 寿命 / 阻力是否常见？碰撞是否可关？（共识明确不做碰地） |
| 锁随机种子可重放 | 哪些库宣称 **seeded / deterministic replay**？ |
| 独立预览台：加删、分组、专属参数、低速/逐帧、一键重放、配方进配置 | 有没有 **JSON 配方 + 可视化编辑器** 可对照架构？ |
| 未格挡 / 格挡两套配方、轻中重力度缩放 | 「同一运行时、多份配方、强度倍率」在案例里怎么组织？ |
| 与命中顿帧时间轴分离 | 特效时钟是否可独立于游戏 hitstop？（案例多为独立 `dt`，可借鉴） |
| 禁止逐帧主路径、禁止抄解包 | 优先找**程序化轮廓 / 噪声 / 规则参数**案例，排除「只播 flipbook 当成品」 |

**总判断（检索后）：**

- three.js **WebGPU** 路线上，2025–2026 已出现一批「可编辑 + JSON + GPU 粒子」项目；与本仓库已用 `WebGPURenderer` **同赛道**。  
- **最接近「编辑台 + 配方 + 火花光照 + 种子可重放」一揽子能力的是 Plume（`travisdmathis/plume`）**；**最接近「打击火花/扬尘预设菜单」的是 webgpu-vfx**；**最成熟、可商用/JSON 编辑器路径仍是 three.quarks**。  
- 「火花照亮角色 + 同组粒子」在 Unity 社区有明确示范（粒子即光源）；Web 侧 Plume 文档写明 **particle-driven point lights**；本仓库已有 `maxPointLights: 12`，短命点光池在工程上可行，但**照亮同组粒子**往往还要自定义材质读点光或后处理，不是只 `new PointLight` 就完事。  
- **没有**找到「街霸式未格挡受击特效编辑器」的单一成品可直接依赖；合理路径是：**运行时粒子底座（库或自研薄层）+ 自研配方/分组/预览台 UX**，对照开源编辑器抄交互，不整包绑死。

---

## 2. 检索计划（先计划，后执行）

### 2.1 通道与关键词

| 通道 | 计划查询 | 目的 |
|------|----------|------|
| 网页 / GitHub | `three.js particle VFX editor`、`three.quarks`、`three-nebula`、`three-particles`、`WebGPU particles sparks`、`impact dust sparks preset`、`procedural VFX three.js no sprite sheet` | 找可运行开源库、编辑器、冲击预设 |
| 网页 / GitHub | `particle point light`、`emit lights as particles`、`seeded particle system` | 火花光照、可重放 |
| X 语义（强制） | 「three.js 粒子编辑器 / 程序化火花烟 / WebGPU VFX」类自然语言 | 算法推荐近期社区实践 |
| X 关键词 Latest | `(three.js OR threejs OR quarks OR nebula OR WebGPU) (particle OR VFX OR sparks)` 等 | 补近期帖、demo 链接 |
| 对照本仓库 | `WebGPURenderer`、`LightRig`、`maxPointLights`、现有调试面板 | 差距表 |

### 2.2 案例筛选标准（调查用）

**加分：** JSON/配置驱动；可视化或参数面板；burst/一次性命中；重力寿命；子发射器（火花→火星）；短命光；种子可重放；WebGPU/TSL；MIT 等可私人研究。  

**减分/排除作主参考：** 仅 flipbook 序列；只做艺术装置无游戏 burst；要求整包换引擎；依赖解包街霸资产。

### 2.3 执行记录

| 步骤 | 时间（约） | 做了什么 |
|------|------------|----------|
| A | 12:34 CST | 确认服务器时间节点；对照共识拆问题 |
| B | 同日 | 网页检索：three 粒子库、编辑器、程序化 skillshot VFX、impact presets |
| C | 同日 | X 语义 ×3：粒子编辑器/程序化特效；WebGPU 火花光照；粒子即光源 |
| D | 同日 | X 关键词 Latest ×2：three/粒子/VFX；quarks/nebula/plume 等专名 |
| E | 同日 | 深读 Plume、webgpu-vfx README；核对本仓库 WebGPU + 点光上限 |

---

## 3. 本仓库当时的样子（事实，不是目标）

| 项 | 事实 |
|----|------|
| 渲染器 | `app/src/main.ts`：`THREE.WebGPURenderer`；配置里可见 `maxPointLights: 12` |
| 灯光系统 | `LightRig`：可增删方向/点/聚光等（训练场光照共识已落地方向）；**无**打击短命光专用池 |
| 粒子 | **无**打击 VFX 粒子运行时；代码里 `particle` 多指裤子物理粒子（已抛弃方向）或位移熔断语义，**不是**画面特效 |
| 命中反馈 | 不格挡受击有硬直/顿帧/动画（见 character-control 共识）；**无**火花/烟/汗画面层 |
| 编辑台 | 有框编辑器、灯光工具等；**无**特效预览台 |
| 配置存档 | shipping / 本地预设习惯已有；可类比存放特效配方 |

---

## 4. X 检索（算法语义 + 关键词）

### 4.1 语义检索 · 与「可编辑粒子 / 程序化特效」相关

| 帖子 | 时间（帖内） | 要点 | 调查怎么用 |
|------|----------------|------|------------|
| [@bandinopla · FluidSimulator PR](https://x.com/bandinopla/status/1939975686795460742) | 2025-07 | three.js PR：流体也可做烟类动态纹理 | 烟的**另一条**程序化路径（纹理场），非粒子编辑器 |
| [@swapp19902 · particle-lab](https://x.com/swapp19902/status/2089973256292053465) | 2026-08-19 | WebGL2、无 compute；6.5 万颗粒 + 六向受光烟；[particle-lab](https://cars.swapp1990.org/particle-lab) | **烟可被多向光照亮**的观感参考；偏破坏物理，非格斗命中 |
| [@TheMirzaBeig · 粒子即光源](https://x.com/TheMirzaBeig/status/1863595078192713840) | 2024-12 | Unity：程序化体积粒子；**把灯当成粒子发出**；主光+多盏点/聚光 | **火花光照**最清晰的产品级示范（引擎不同，思路可搬） |
| [@TheMirzaBeig · sparking particles are lights](https://x.com/TheMirzaBeig/status/1847454305910964341) | 2024-10 | 像素水波；火花粒子是**真光源** | 同上，强化「粒子驱动光」方向 |
| [@iced_coffee_dev · three.js 粒子编辑器](https://x.com/iced_coffee_dev/status/2090103848077566295) | 2026-08-19 | 基于自己课程粒子系统快速做了编辑器，考虑开源 | **编辑台 UX**社区信号：围绕已有粒子 API 包一层即可 |
| [@pushmatrix · 烟花单 draw call](https://x.com/pushmatrix/status/1856340314757206353) | 2024-11 | three.js 实例化 shader，无传统粒子对象 | 极简程序化爆发；缺编辑器/配方体系 |
| [@techartist_ · 45k particles + bloom](https://x.com/techartist_/status/1957486247615586446) | 2025-08 | Three WebGL + EffectComposer | 光晕增强火花观感的后处理参考 |
| [@VinceWedde · 烟用少量 billboard](https://x.com/VinceWedde/status/1873352730846306460) | 2024-12 | ~24 张 billboard + noise；color over life | **短促扬尘**可用「少量卡片 + 寿命淡出」，不必海量粒子 |

### 4.2 关键词 Latest · `(three.js OR threejs …) (particle OR VFX OR sparks …)`

- 命中含：[@iced_coffee_dev 粒子编辑器意向](https://x.com/iced_coffee_dev/status/2090103848077566295)、各类 three 粒子 demo、技能沙盒讨论。  
- 专名二次检索（quarks / nebula / plume / threeparticles）**噪声大**（科学「quark」、火箭「plume」污染时间线）；**有效工程讨论仍以语义检索 + GitHub 为准**。

### 4.3 二次语义 · 「粒子发光照亮场景」

- 再次命中 Mirza Beig「emit lights as particles」。  
- Web 侧少见完整开源同款；与后文 **Plume `LightEmission`**、本仓库 **点光上限 12** 对照后，调查结论偏向：**短命点光池（少量）+ 粒子自身 additive 亮核**，而不是每颗火星一盏真灯。

---

## 5. 网页 / GitHub 重点案例

### 5.1 第一梯队（强烈对齐共识多条）

| 项目 | 链接 | 可借鉴 | 缺口 / 风险 |
|------|------|--------|-------------|
| **Plume（three-plume）** | [GitHub](https://github.com/travisdmathis/plume) · npm `three-plume` | **GPU/TSL**；模块化 emitter；**视觉节点编辑器**；JSON 进出；**seeded determinism**；sub-emitter；**particle-driven point lights**；smoke/spark shader 预设；固定步长重放友好 | pre-1.0，API 会变；**强依赖 WebGPU**（本仓库已 WebGPU，反而是加分）；完整编辑 UX 是他们的 Svelte 编辑器，未必直接嵌入本训练场 |
| **webgpu-vfx** | [GitHub](https://github.com/tigerabrodi/webgpu-vfx) | 明确 **Impact Sparks / Impact Dust / Muzzle Flash** 等战斗向预设；burst API；`pause/resume/reset/step`（利于低速与逐帧）；软粒子、排序；运行时改 emitter/renderer | 早期 0.1.x；WebGPU only；**不自带完整分组配方编辑台**（有 control surface 可自建） |
| **three.quarks** | [GitHub](https://github.com/Alchemist0823/three.quarks) · [文档](https://docs.quarks.art/docs) · [站点](https://quarks.art/runtime) · 编辑器历史仓 [three.quarks-editor](https://github.com/Alchemist0823/three.quarks-editor)（archived，新编辑走官网） | 成熟 **BatchedRenderer**；行为/曲线；**JSON 加载**；子发射器；与 Unity Shuriken 思路近；有可视化编辑与导出 | 经典路径偏 **CPU 模拟 + 实例绘制**；WebGPU/节点包在路线图/实验；编辑器商业/站点形态需自行核对许可 |
| **@newkrok/three-particles** + **Editor** | [库](https://github.com/NewKrok/three-particles) · [编辑器](https://github.com/NewKrok/three-particles-editor) · [在线编辑](https://newkrok.com/three-particles-editor/index.html) | Unity 风格编辑器；导出配置；sub-emitters；力场；宣称 WebGPU compute 可选与 CPU 回退；Mesh 粒子可带简单方向光 | 是否满足「照亮同组粒子 / 种子锁」需实测；编辑器是独立站，集成成本自研 |

### 5.2 第二梯队（程序化观感 / 架构参考）

| 项目 | 链接 | 可借鉴 |
|------|------|--------|
| **Elemental Sandbox / LinearAbility** | [achrefelouafi/LinearAbilityExtThreeJS](https://github.com/achrefelouafi/LinearAbilityExtThreeJS) | **无精灵表**：程序化 silhouette（soft/smoke/streak/chip）；GPU 粒子 ring buffer；lil-gui + **preset manager**；动态光；与「禁止逐帧主路径」高度同向 |
| **threejs-vfx（扩展沙盒）** | [SoMaCoSF/threejs-vfx](https://github.com/SoMaCoSF/threejs-vfx) | 同上路线放大；冲击尘烟、火花分系统组合 |
| **three-nebula** | [creativelifeform/three-nebula](https://github.com/creativelifeform/three-nebula) · [站点](https://three-nebula.org/) | JSON 实例化；行为/初始化器；可选 WebGPU batched renderer；桌面编辑器迁浏览器叙事 |
| **threeparticles** | [GitHub](https://github.com/threeparticles/threeparticles) · [站点](https://threeparticles.com/) · [编辑器](https://editor.threeparticles.com) | WebGPU；可视化编辑；火/烟/喷泉示例；注意**商业许可**与免费范围 |
| **Three-VFX（mustache-dev）** | [GitHub](https://github.com/mustache-dev/Three-VFX) | WebGPU GPU 粒子；曲线；发射器解耦；偏 R3F |
| **aiira three-particles** | [aiira-co/three-particles](https://github.com/aiira-co/three-particles) | TSL GPU；程序化 shape（smoke/streak/chip）；软粒子 |
| **three.js 官方 compute particles** | [webgpu_compute_particles.html](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_particles.html) | 官方重力/碰撞示范；适合学 TSL，不是配方编辑器 |
| **bobbyroe Simple-Particle-Effects** | [GitHub](https://github.com/bobbyroe/Simple-Particle-Effects) | 教学向火/烟/闪光；入门成本低，能力薄 |
| **three.proton / Proton** | [three.proton](https://github.com/a-jie/three.proton) · [Proton](https://github.com/drawcall/Proton) | 老牌易用 CPU 粒子；物理行为友好；编辑器/现代 WebGPU/批次能力弱于第一梯队 |
| **Mirza Beig（Unity 参考）** | 见上 X 链接 | **粒子发光**方法论；非 three 可依赖代码 |

### 5.3 与「打击命中」直接相关的预设线索

| 来源 | 预设 / 能力 | 映射到本共识元素 |
|------|-------------|------------------|
| webgpu-vfx | `createImpactSparksPreset`、`createImpactDustPreset`、`createSparkStreaksPreset`、`createMuzzleFlashPreset` | 火花、扬尘、附带曳光；枪口闪可作「亮核」参考 |
| Plume | spark/smoke shader 预设；`LightEmission`；sub-emitter；seeded twin demo | 火花+烟+光照+可重放 |
| LinearAbility 系 | sparks / dust / chips / mist 多系统一层能力 | 一组命中 = 多元素同开始时刻 |
| VinceWedde（X） | 少量 billboard 烟 + color over life | 短促扬尘的性能友好做法 |

汗水飞溅：开源格斗向「汗珠」专用库**几乎没有**；更接近 **重力 + 初速锥 + 寿命淡出的透明液滴粒子**（fountain / spray 预设改参），与共识「只靠寿命消失」一致，不必上碰地。

---

## 6. 案例对照表（调查评价）

| 能力（对共识） | Plume | webgpu-vfx | three.quarks | NewKrok particles+editor | LinearAbility 系 | 本仓库当时 |
|----------------|-------|------------|--------------|--------------------------|------------------|------------|
| 规则/参数驱动粒子 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 冲击火花/扬尘现成味 | △ 预设偏通用 | ✅ 明示 impact | △ 可自搭 | △ | ✅ 程序化组合 | ❌ |
| 短命点光 / 粒子发光 | ✅ 文档 LightEmission | △ 需自接灯 | △ 自接 | △ | ✅ 动态光实践 | 有点光槽，无打击光 |
| 种子可重放 | ✅ 写明 | ❓ 未强调 | ❓ | ❓ | ❓ | ❌ |
| JSON / 配方存盘 | ✅ | △ 配置对象 | ✅ | ✅ 导出配置 | △ settings 对象 | 有预设体系可挂 |
| 可视化编辑器 | ✅ 节点编辑 | playground/docs | ✅ 生态编辑器 | ✅ Unity 风 | lil-gui | ❌ 特效台 |
| `step` / 时间缩放 | ✅ tick(dt) | ✅ step/pause | 自管 dt | 自管 | 自管 | 逻辑 60fps，无 VFX 钟 |
| WebGPU 对齐本仓库 | ✅ | ✅ | 主路径偏 WebGL/CPU | 可选 | WebGL 主 | ✅ 已 WebGPU |
| 分组「同开不同寿命」 | 多 emitter 系统 | 多 effect | 多 system + 父节点 | 多 system | 多 ParticleSystem | ❌ |

图例：✅ 明显具备 · △ 可拼 / 部分 · ❓ 文档未强调 · ❌ 无。

---

## 7. 对执行方案的调查建议（非正式选型）

> 以下**不是**共识，也不是已定技术选型；仅供写执行方案时对照实测。

1. **运行时**：优先在 **WebGPU 粒子库（Plume / webgpu-vfx）** 与 **自研薄层（Points/实例 + 短命 PointLight 池）** 之间做一次同场景打点对比：命中 burst 延迟、点光 1～3 盏、同时两组配方、锁种子重放。  
2. **编辑台**：不要指望「装一个库就自带街霸打击编辑器」；应对齐共识做 **元素列表 + 分组 + 专属参数面板 + 时间 scrub + 种子 + 读写项目配置**，交互可抄 NewKrok / Quarks / Plume editor，数据模型保持自有。  
3. **火花光照**：默认 **1 盏（最多少量）短命点光** 跟击中点，加粒子 additive 亮核；「照亮同组烟/汗」需验证粒子材质是否读场景灯或自写灯列表。本仓库 `maxPointLights: 12` 要给训练场常驻灯留余量。  
4. **扬尘**：优先「短寿命、低数量、alpha 烟卡」而非流体求解；Vince / impact dust 预设方向足够。  
5. **汗水**：喷泉/液滴参数皮肤；禁止为了「真实」上碰地（与共识冲突）。  
6. **顿帧**：VFX 使用独立 `dt` 乘子（可与 hitstop 配置联动或断开），库侧普遍支持，无需改战斗结算。  
7. **法务**：只用开源许可清晰的引擎/示例思路；**不**引入 SF6 解包特效资源。

---

## 8. 检索计划完成核对

| 计划项 | 状态 |
|--------|------|
| 先分析再检索 | ✅ §1–§2 |
| 网页 / GitHub 案例（重点） | ✅ §5 |
| X 语义算法检索（强制） | ✅ §4.1、§4.3 |
| X 关键词 Latest | ✅ §4.2 |
| 时间节点写入 | ✅ 文首 2026-08-26 12:34 CST |
| 整理为调研文档 | ✅ 本文件 |
| 冒充共识/选型定案 | ❌ 未做；明确非共识 |

---

## 9. 主要链接速查

- 共识：`docs/hit-vfx-consensus-v0.md`  
- [Plume](https://github.com/travisdmathis/plume)  
- [webgpu-vfx](https://github.com/tigerabrodi/webgpu-vfx)  
- [three.quarks](https://github.com/Alchemist0823/three.quarks) · [docs](https://docs.quarks.art/docs) · [editor 旧仓](https://github.com/Alchemist0823/three.quarks-editor)  
- [NewKrok three-particles](https://github.com/NewKrok/three-particles) · [editor](https://github.com/NewKrok/three-particles-editor) · [live editor](https://newkrok.com/three-particles-editor/index.html)  
- [three-nebula](https://github.com/creativelifeform/three-nebula) · [three-nebula.org](https://three-nebula.org/)  
- [threeparticles](https://github.com/threeparticles/threeparticles) · [editor.threeparticles.com](https://editor.threeparticles.com)  
- [LinearAbilityExtThreeJS](https://github.com/achrefelouafi/LinearAbilityExtThreeJS) · [threejs-vfx](https://github.com/SoMaCoSF/threejs-vfx)  
- [three.js webgpu_compute_particles](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_particles.html)  
- X：[Mirza 粒子即光源](https://x.com/TheMirzaBeig/status/1863595078192713840) · [particle-lab](https://x.com/swapp19902/status/2089973256292053465) · [three 粒子编辑器意向](https://x.com/iced_coffee_dev/status/2090103848077566295)

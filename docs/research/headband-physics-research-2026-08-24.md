# 头巾物理 · 调查笔记

> **日期**：2026-08-24（检索约 **14:49–15:05 CST / 06:49–07:05 UTC**；成文同日）  
> **性质**：调查。记录查过什么、社区与开源怎么做、和本仓库共识怎么对照。  
> **不是共识，也不是执行方案。** 目标以 `docs/headband-physics-consensus-v0.md` 为准。  
> **检索通道**：网页 / GitHub 重点案例、X **算法语义检索**（强制）、X 关键词 Latest。  
> **时间锚点**：服务器当时本地 **2026-08-24 14:49:48 CST**（UTC 06:49:48）。

---

## 1. 需求侧分析（调查用语，非正式共识条文）

共识已钉死的制作目标（此处只当检索背景）：

| 维度 | 要支撑什么 |
|------|------------|
| 形态 | 现有长度；额头固定；**脑后飘带**动 |
| 手感 | 比较跟手；默认**偏硬偏短**；静止微呼吸感 |
| 动作 | 移动/急停/变向 → 跳跃 → 攻击 |
| 时间豁免 | **受击定住 + 受击硬直**期间飘带仍更新 |
| 碰撞 | **身体**防穿模；不管场景 |
| 工程 | 调试面板可调 + **可存配置**；只做隆 |

由此拆出的技术问题（检索要回答的）：

1. 细长飘带/围巾/发带类「二次运动」业界常用什么结构（骨链弹簧 vs 整片布料 vs 绳索 Verlet）？  
2. 浏览器 / three.js 有没有可抄的链或布料案例？  
3. 受击定住时「身体停、布料/头发继续动」别人怎么做？  
4. 防头肩穿模常用什么简化碰撞？  
5. 偏硬手感、呼吸微晃、跳跃改重力这类参数，开源里有没有现成旋钮？

---

## 2. 搜索计划（先计划后执行）

### 2.1 计划表

| 编号 | 通道 | 查询意图 | 预期产出 |
|------|------|----------|----------|
| P1 | Web/GitHub | `verlet` + rope/cloth/ribbon + character | 绳索/飘带链算法与仓库 |
| P2 | Web/GitHub | three.js cloth / WebGPU cloth / spring bone | 与本项目渲染栈接近的案例 |
| P3 | Web/GitHub | Dynamic Bone / MagicaCloth / PhysBone / KawaiiPhysics / VRM springBone | 角色饰品二次运动「工业习惯」 |
| P4 | Web | hitstop / hitfreeze + hair/cloth continues | 定住豁免的产品级说法与实现提示 |
| P5 | X 语义 | headband/scarf/ribbon secondary motion；three cloth；hitstop 时 cloth 继续；spring bone 调参 | 社区观感与近期项目 |
| P6 | X 关键词 Latest | `(three.js OR verlet OR spring bone OR PhysBone) (cloth OR ribbon OR scarf OR rope OR "secondary motion")` | 近期帖与可点链接 |

### 2.2 执行情况

| 编号 | 状态 | 备注 |
|------|------|------|
| P1–P4 | ✅ 已跑 | 多轮 `web_search`；重点打开/核验 GitHub README |
| P5 | ✅ 已跑 | `x_semantic_search` 多组语义查询（强制） |
| P6 | ✅ 已跑 | `x_keyword_search` mode=Latest |

---

## 3. 查完后的总判断

- **最贴合「脑后两条/一条细长飘带 + 偏硬 + 头肩碰撞」的工业路径**，不是整片高精度布料，而是 **骨链 / 粒子链二次运动**（行业里常叫弹簧骨、Dynamic Bone、PhysBone、BoneCloth、KawaiiPhysics 一类）。整片布料适合裙摆/披风大面积，对本版头巾过重，且默认容易「太软太飘」。  
- **浏览器侧最可抄的两层**：  
  - **算法层**：Verlet 距离约束绳/链（经典、稳、易调硬度和阻尼）。  
  - **three 栈层**：官方 cloth 示例、WebGPU compute cloth、以及 **`@pixiv/three-vrm-springbone`**（three 上可运行的弹簧骨 + 球/胶囊碰撞，与「头巾挂在头骨后」非常同构）。  
- **受击定住豁免**有明确产品级依据：格斗/动作向讨论里，成熟做法是 **只停角色主动画/主更新，附属物理或抖动组件继续跑**；街霸系也被社区点到「头巾/围巾像头发一样流」的视觉补足作用。  
- **直接「隆头巾专用」开源成品几乎没有**；可借鉴的是围巾/披风链、发带 BoneCloth、弹簧骨参数表。  
- 对本仓库：差距不在「会不会写弹簧」，而在 **(a) 头巾网格能否拆出脑后可变形链或蒙皮骨 (b) 渲染更新与 hitstop/硬直时钟解耦 (c) 头肩简化碰撞与可存参数面板**。

---

## 4. X 检索（算法语义 + 关键词）

### 4.1 语义检索命中（与共识相关）

| 帖子 | 时间（帖内） | 要点 | 调查怎么用 |
|------|----------------|------|------------|
| [@KNXCKLE · SF 头巾/围巾](https://x.com/KNXCKLE/status/1888292002153836967) | 2025-02 | 街霸一直用围巾/头巾像头发一样流动，补视觉 | **观感标杆**：头巾是格斗角色「二次运动招牌」 |
| [@jesawyer · secondary animation](https://x.com/jesawyer/status/1658080849492078592) | 2023-05 | 二次动画（如 Ninja Gaiden 隆围巾）可掩盖 1 帧 180° 转向 | **设计动机**：跟手飘带服务动作可读性 |
| [@GameAnim · cloth/muscles](https://x.com/GameAnim/status/1396585516162719745) | 2021-05 | 3D 蒙皮丢失轮廓内高频运动；应用 cloth/肌肉补 | 二次运动是「生命感」补丁，不只是装饰 |
| [@bandinopla · three-simplecloth](https://x.com/bandinopla/status/2022595248992719212) | 2026-02 | 发布 three-simplecloth：顶点涂色布料，接骨骼动画；需 WebGPU | **three 近期可点案例**（见 §5） |
| [@sabosugi · Old Cloth with Wind](https://x.com/sabosugi/status/2010431630612344847) | 2026-01 | three 布料+风 CodePen | 呼吸感/风的参考，非角色挂件 |
| [@alowpoly · CSS cloth](https://x.com/alowpoly/status/2090516215781351834) | 2026-08 | 从 three 示例移植的布料 demos | 说明官方 cloth 示例仍是社区起点 |
| [@cloudofoz · verlet web](https://x.com/cloudofoz/status/1915386813763461429) | 2025-04 | Rust→Web Verlet 布料 demo | 算法教学向 |
| [@Basefount · Ribbon Cloth Collision](https://x.com/Basefount/status/2019336254266150995) | 2026-02 | Maya/Max：骨链飘带防中段穿模（AnimCraft） | **碰撞诉求对齐**：细长骨链中段穿模是真问题 |
| [@chaorzzz · MagicaCloth2 tips](https://x.com/chaorzzz/status/2038710234978381827) | 2026-03 | 小丝带/绑带可 MeshCloth；头发/复杂褶皱偏 BoneCloth；加碰撞体 | **选型提示**：小飘带可片布，细长链更常 BoneCloth |
| [@sean_gause · DB→Magica](https://x.com/sean_gause/status/2074339979988545611) | 2026-07 | 马尾从 Dynamic Bones 换 Magica，稳定与观感差很大 | 生产向：简单弹簧骨不够时再升级求解器 |
| [@MagicaSoft · BoneSpring](https://x.com/MagicaSoft/status/1724275434559602897) | 2023-11 | MagicaCloth2 加 BoneSpring 与软/中/硬预设 | **偏硬默认**可对标 Hard 类预设思路 |
| [@Wisgarus](https://x.com/Wisgarus/status/2090737285725622436) | 2026-08 | 问 flowy physics；jiggle bone 失控后围巾只能手 K | 反面：参数失控比「没有物理」更糟——对齐本共识「宁可硬一点」 |

### 4.2 语义：受击定住 / 附属继续动

| 资料 | 要点 | 调查怎么用 |
|------|------|------------|
| Unity 讨论（网页互证，见 §6）：格斗 hitstop 时 **Kolin 头发仍在弹** | 角色暂停但头发动态骨继续 | **直接支撑共识豁免** |
| X 语义对本查询噪声大（大量 hitlag/作弊梗） | 不如网页讨论精准 | 结论以网页 + 设计文为准，X 作旁证 |

### 4.3 关键词 Latest：`(three.js OR threejs OR verlet OR "spring bone" OR PhysBone) (cloth OR ribbon OR scarf OR rope OR "secondary motion")`

近期（约 2026-08）可见：

- VRChat **PhysBone 已设好的 Ribbon** 商品帖（说明「丝带 + 弹簧骨」是饰品标配流水线）。  
- three.js 布料展示站、WebGPU 物理压测含 rope & cloth。  
- 社区仍在 PhysBone vs MagicaCloth 间选型。

**判断**：X 上「角色飘带」话语权在 **VR/虚拟形象弹簧骨生态**；「浏览器 three 布料」话语权在 **demo/包**；两者都要抄思路，不宜只盯一边。

---

## 5. 网页 / GitHub 重点案例

### 5.1 第一梯队（最贴「角色挂件飘带」）

| 项目 | 链接 | 引擎/栈 | 可借鉴 |
|------|------|---------|--------|
| **samlletas/verlet-chain-system** | [GitHub](https://github.com/samlletas/verlet-chain-system) | Unity | README 写明 ideal for **scarves and capes**；固定步长；**idle 风/波浪**；**Override 运行时改参**（例：跳跃时降重力）——与「移动/跳跃手感 + 呼吸感 + 可调可存」高度同构 |
| **pixiv/three-vrm · springbone** | [repo](https://github.com/pixiv/three-vrm/) · [springbone 模块文档](https://pixiv.github.io/three-vrm/docs/modules/three-vrm-springbone.html) · [示例目录](https://pixiv.github.io/three-vrm/packages/three-vrm-springbone/examples) · [npm `@pixiv/three-vrm-springbone`](https://www.npmjs.com/package/@pixiv/three-vrm-springbone) | **three.js** | **本仓库栈最近的弹簧骨实现**：关节链 + 拖曳/刚度 + **球/胶囊/平面碰撞**；可只学算法与更新循环，不必整头 VRM |
| **pafuhana1213/KawaiiPhysics** | [GitHub](https://github.com/pafuhana1213/KawaiiPhysics) · [Accessories 教程（含 Ribbons & Capes）](https://github.com/pafuhana1213/KawaiiPhysics/wiki/Tutorial-Accessories-en) · [Hair 参数表](https://github.com/pafuhana1213/KawaiiPhysics/wiki/Tutorial-Hair-en) | UE | **丝带/披风参考参数**（阻尼、刚度、世界阻尼、角度限制）；球形限制防穿头；「偏硬」可对照更高 Stiffness / Damping |
| **OneYoungMean/Automatic-DynamicBone** | [GitHub](https://github.com/OneYoungMean/Automatic-DynamicBone) | Unity | 开源骨布/弹簧，参考 DynamicBone / SPCR；Jobs；自动生成链——参数面板思路 |
| **VRChat PhysBones** | [文档](https://creators.vrchat.com/common-components/physbones) | VRChat | 链根可 Ignore（根不动只甩子级）——对齐「额头固定、脑后动」；碰撞比真刚体便宜 |

### 5.2 第二梯队（three / Verlet 布料与绳，算法营养）

| 项目 | 链接 | 可借鉴 |
|------|------|--------|
| **three.js 官方 WebGL cloth** | [历史示例源](https://github.com/mrdoob/three.js/blob/e48fc94dfeaecfcbfa977ba67549e6108b370cbf/examples/webgl_animation_cloth.html) | Verlet + 松弛约束；风；经典入门（整片布，非头巾） |
| **three.js WebGPU compute cloth** | [webgpu_compute_cloth.html](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_cloth.html) | GPU Verlet；本项目若未全面 WebGPU，仅作参考 |
| **bandinopla/three-simplecloth** | [GitHub](https://github.com/bandinopla/three-simplecloth) · [Demo](https://bandinopla.github.io/three-simplecloth/) · [文章](https://medium.com/@pablobandinopla/simple-cloth-simulation-with-three-js-and-compute-shaders-on-skeletal-animated-meshes-acb679a70d9f) | **蒙皮网格上涂色变布料** + 球碰撞；接动画角色；**依赖 WebGPU** |
| **holtsetio/breeze** | [GitHub](https://github.com/holtsetio/breeze) | WebGPURenderer 上实时 Verlet 布料 |
| **RobertoLovece/Cloth** / **Rope-Grid** | [Cloth](https://github.com/RobertoLovece/Cloth) · [Rope-Grid](https://github.com/RobertoLovece/Rope-Grid) | three + Verlet 教学实现 |
| **code4fukui/physics-rope** | [GitHub](https://github.com/code4fukui/physics-rope/) | 纯 JS Canvas 绳；稳定 Verlet |
| **subprotocol/verlet-js** | [GitHub](https://github.com/subprotocol/verlet-js)（约 3.8k★） | 通用 2D Verlet；cloth 示例 |
| **Toqozz rope 文 + 代码** | [文章](https://toqoz.fyi/game-rope.html) · [Rope.cs](https://github.com/Toqozz/blog-code/blob/master/rope/Assets/Rope.cs) | 游戏绳实现细节与性能 |
| **Pikuma Verlet cloth 文** | [文章](https://pikuma.com/blog/verlet-integration-2d-cloth-physics-simulation) | 算法直觉教材 |
| **aryamancodes/Rope-and-Cloth-Simulation** | [GitHub](https://github.com/aryamancodes/Rope-and-Cloth-Simulation) | 绳/布 + 障碍 + 风（p5） |

### 5.3 第三梯队（生产布料/骨布，参考勿整包搬进浏览器）

| 项目 | 链接 | 备注 |
|------|------|------|
| MagicaCloth / MagicaCloth2 | [系统概览](https://magicasoft.jp/en/system-overview-2/) · [BoneCloth](https://magicasoft.jp/en/bonecloth-start-2/) · 运行时建 **Ribbon** BoneCloth 示例见官网 Runtime Construction | Unity 商业；**细长物用 BoneCloth** 的官方分工清晰 |
| SPCRJointDynamics | 文档聚合见 [Ida Faber Physics](https://docs.idafaber3d.com/features/physics) | 开源骨布备选 |
| Extended-VRM-Specs 对比笔记 | [spring-bone-physics-systems.md](https://github.com/miramocha/Extended-VRM-Specs/blob/main/references/spring-bone-physics-systems.md) | VRM spring / Magica / PhysBones 对照表 |
| Decentraland Spring Bones | [文档](https://docs.decentraland.org/creator/wearables-and-emotes/wearables/spring-bones) | 短饰品 vs 披风参数起点表 |
| AnimCraft Ribbon Cloth Collision | 见 X @Basefount；产品页 animcraft.com | DCC 向骨链防穿，概念可迁到运行时胶囊碰撞 |

### 5.4 受击定住豁免（网页重点）

| 资料 | 链接 | 要点 |
|------|------|------|
| Unity 讨论：Hit Stop like fighting games | [discussions.unity.com](https://discussions.unity.com/t/hello-i-am-looking-to-recreate-a-hit-stop-effect-similar-to-how-you-see-in-fighting-games/910407) | 观察：命中定住时 **头发仍 bounce**；建议停 Animator，**头发/衣服用动态骨、别绑死在被冻动画上** |
| Capcom 清版 hitstop 文 | [Shane Sicienski](https://shane-sicienski.com/blog/blog-post-title-one-55pmn) | 精细实现：只暂停参与打击的角色更新，**其他对象继续**；现代引擎可停角色逻辑但让抖动组件继续 |
| Hitstop 术语/设计 | [critpoints.net](https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/) | 定住是观感与系统窗，不等于「全世界时钟归零」 |

**对共识的支撑**：把头巾模拟挂在 **不受 hitstop/硬直时钟门控**（或门控为假）的更新路径上，是业界已验证写法，不是奇葩需求。

---

## 6. 与本仓库共识的对照（调查建议，非定案）

| 共识项 | 资料侧常见做法 | 调查备注 |
|--------|----------------|----------|
| 只动脑后、额固定 | 链根 Ignore / 固定粒子；子级才积分 | PhysBones、弹簧骨通用 |
| 偏硬偏短 | 高刚度、高阻尼、较短角限制；Hard 预设 | Kawaii 丝带表、Magica HardSpring 思路 |
| 呼吸感 | 低频风/Wave 组件或极小噪声力 | verlet-chain-system 的 VerletWave |
| 跳跃反馈 | 运行时 Override 重力/阻尼 | verlet-chain-system 明确举例 |
| 身体防穿 | 头/肩球或胶囊；链点推离 | VRM springbone colliders、Kawaii Spherical Limits |
| 不管场景 | 多数角色饰品方案本就不做地碰 | 与共识一致，减范围正确 |
| 定住/硬直仍动 | 模拟更新与动画 freeze 解耦 | Unity 讨论 + Capcom 文 |
| three 项目落地 | 优先 **自研短链 Verlet/弹簧骨** 或抽 **three-vrm-springbone** 思想；整片 cloth / WebGPU 包作备选 | 本仓库是否 WebGPU 需执行阶段再验 |
| 可调可存 | 刚度/阻尼/重力/风振幅 + 碰撞半径；预设 JSON | 对齐现有调试面板习惯 |

**不建议作为第一版主路径（调查意见）**：

- 全网格高精度布料自碰撞（重、易软、难调「偏硬短」）。  
- 未确认 WebGPU 前把 three-simplecloth / breeze 当唯一依赖。  
- 为「通用布料中台」先搭大框架（共识明确只做隆）。

---

## 7. 对本仓库现状的调查缺口（事实待查，不是目标）

检索未替代资产审计。执行前仍应在工程里确认：

1. `esf_HeadBand`（或等价）网格是否已有脑后骨链，还是一整块静态蒙皮。  
2. 渲染 tick 是否与 `hitstopTimer` / 硬直共用同一「是否推进」开关。  
3. 调试面板与 shipping 预设写入路径（灯光共识同类：可存才能验收）。

这些查清后才能写执行方案；**本调查不写文件清单与排期**。

---

## 8. 检索日志摘要（可复现）

**时间锚点**：2026-08-24 14:49:48 CST。

**Web 查询（节选）**：

- `GitHub verlet integration ribbon scarf cloth secondary animation character`  
- `GitHub three.js cloth ribbon rope verlet bone chain`  
- `fighting game hitstop secondary motion cloth continues during freeze`  
- `Unity secondary motion bone chain headband hair ribbon physics`  
- `github MagicaCloth OR "spring bone" OR PhysBone OR "dynamic bone"`  
- `github three-simplecloth` / `site:github.com verlet rope cloth three.js`  
- `pixiv three-vrm springBone` / `KawaiiPhysics ribbon`

**X 语义查询（节选）**：

- `character headband scarf ribbon cloth physics secondary motion in games`  
- `three.js verlet cloth rope ribbon soft body demo`  
- `hitstop freeze frames but hair cloth cape keeps moving`  
- `spring bone MagicaCloth Dynamic Bone secondary animation hair tail scarf tuning`

**X 关键词 Latest**：

- `(three.js OR threejs OR verlet OR "spring bone" OR PhysBone) (cloth OR ribbon OR scarf OR rope OR "secondary motion")`

---

## 9. 相关文件

| 文件 | 关系 |
|------|------|
| `docs/headband-physics-consensus-v0.md` | **共识**（本调查服从它，不能反过来改写它） |
| `docs/character-art-consensus-v0.md` | 头巾材质/外观 |
| `docs/consensus-v0.md` | 上位主共识 |

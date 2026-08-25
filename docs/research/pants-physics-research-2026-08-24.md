# 裤子物理 · 调查笔记（未完成 · 已抛弃）

> **状态**：**未完成 · 已抛弃**（2026-08-25）  
> **原因**：用户决定不再继续完成裤子物理子系统；上位共识 `docs/pants-physics-consensus-v0.md` 已抛弃。  
> **效力**：本调查**不再作为选型或实现依据**；保留作历史记录。  
> **历史说明（废止前）**：日期 2026-08-24；性质为调查（非共识/非执行方案）；检索通道含网页 / GitHub / X。

---

## 1. 需求侧分析（调查用语，非正式共识条文）

共识已钉死的制作目标（此处只当检索背景）：

| 维度 | 要支撑什么 |
|------|------------|
| 形态 | 现有道服裤造型；**腰固定**；**大腿外侧到裤脚**动 |
| 手感 | **偏软、宽松下垂**；静止**呼吸微晃**；裤脚晃 + 整条布感 + 垂坠**一次做全** |
| 动作 | 走跑急停、跳跃、踢腿、蹲起、以及带动下半身的动作都要合格 |
| 时间豁免 | **受击定住 + 受击硬直**期间裤子仍更新 |
| 碰撞 | **几乎不穿腿**；尽量少穿腰带；地面碰撞本版不做硬验收 |
| 工程 | 调试面板可调 + **可存配置**；只做隆；**与头巾/腰带独立设计** |
| 场景 | 对战与展示同一套 |

由此拆出的技术问题（检索要回答的）：

1. 宽松裤管 / 裙摆类「腰固定、腿周晃」业界常用什么结构（骨链横连 vs 顶点布料 vs 纯弹簧飘带）？  
2. 浏览器 / three.js 有没有可抄的角色衣物案例（尤其蒙皮网格局部布料）？  
3. 「几乎不穿腿」常用什么简化碰撞与防穿透手段？  
4. 受击定住时「身体停、裤子继续动」别人怎么做？  
5. 偏软下垂、呼吸微晃、可调参数，开源/插件里有没有现成旋钮与预设可对标？

---

## 2. 搜索计划（先计划后执行）

### 2.1 计划表

| 编号 | 通道 | 查询意图 | 预期产出 |
|------|------|----------|----------|
| P1 | Web/GitHub | MagicaCloth BoneCloth pants/skirt；腿胶囊碰撞；腰固定 | 裤/裙生产向设定书与参数习惯 |
| P2 | Web/GitHub | three.js / WebGPU cloth on skinned mesh；character clothing | 与本项目渲染栈接近的案例 |
| P3 | Web/GitHub | SPCR / KawaiiPhysics / DynamicBone skirt·clothbone | 开源骨布引擎与裙摆同构做法 |
| P4 | Web | hitstop / hitfreeze + cloth/hair continues | 定住豁免的产品级说法与实现提示 |
| P5 | X 语义（强制） | pants/trousers cloth physics；Magica/PhysBone 软垂；three cloth 角色；格斗衣物二次运动；hitstop 时 cloth 继续 | 社区观感与近期项目 |
| P6 | X 关键词 Latest | `(cloth OR pants OR trousers OR skirt OR "secondary motion") (MagicaCloth OR PhysBone OR three.js OR Verlet OR BoneCloth OR "spring bone")` 及 hitstop 变体 | 近期帖与可点链接 |

### 2.2 执行情况

| 编号 | 状态 | 备注 |
|------|------|------|
| P1–P4 | ✅ 已跑 | 多轮 `web_search`；重点打开 Magica 裙指南、SPCR / three-simplecloth / KawaiiPhysics 等 README 与文档 |
| P5 | ✅ 已跑 | `x_semantic_search` 多组语义查询（强制）：裤管布料、Magica/PhysBone 调参、three cloth、格斗衣物、hitstop 豁免 |
| P6 | ✅ 已跑 | `x_keyword_search` mode=Latest（衣物物理关键词 + hitstop 变体） |

---

## 3. 查完后的总判断

- **最贴合「腰固定 + 大腿外侧到裤脚 + 宽松下垂 + 几乎不穿腿」的工业路径**，不是头巾那种**细长单链弹簧飘带**，而是 **带横向连接的骨布 / 骨网格布料**（行业里常叫 BoneCloth Mesh 连接、skirt bone cloth、SPCR 横向约束一类）。整片高精度顶点布料也能做裙/裤，但对战实时更重；本仓库模型已有大量 `Pants_*` / `L_Pants*` / `R_Pants*` 骨，**优先吃骨骼二次运动**更贴资产现状。  
- **与头巾/腰带「独立设计」在调查上成立**：头巾适合链状弹簧；裤子需要**纵+横约束**、**腿胶囊碰撞**、**防穿透（penetration / backstop）**——复用飘带路径容易只做出「裤脚甩一下」，很难一次满足「整条布感 + 几乎不穿腿」。  
- **浏览器侧最可抄的两层**：  
  - **算法/结构层**：骨粒子 + 结构约束（纵/横/剪切/弯曲）+ 腿部胶囊/球碰撞 + 腰部固定粒子。开源参照 **SPCRJointDynamics**、**Automatic-DynamicBone**；生产参照 **MagicaCloth2 BoneCloth 裙指南**。  
  - **three 栈层**：**`three-simplecloth`**（蒙皮网格 + 顶点涂色遮罩做局部布料 + 绑骨球体碰撞，有裙 demo）与 three.js 官方 **WebGPU compute cloth**。注意：当前主流路径偏 **WebGPU**；本仓库若仍以 WebGL 为主，可借思路自写骨布求解，不宜直接当「拷进即可」依赖。  
- **防穿腿是行业公认难点**：腿部胶囊略放大、提高迭代、**Penetration / Collider Penetration / Backstop**、BoneCloth 改 **Mesh 横向连接**（减少腿从骨缝钻过）是反复出现的处方。DOA2 访谈也点明：中国服饰/裙摆若不认真算，腿会从布里穿出来。  
- **受击定住豁免**有明确产品级依据：只停角色主动画/逻辑时钟，**附属布料/头发更新继续跑**；Unity 格斗讨论直接点到「Kolin 头发在 hitstop 里仍在弹」。  
- **直接「隆道服裤专用」开源成品几乎没有**；最可迁移的是 **裙摆 BoneCloth 工作流**（结构同构：腰固定环 + 周向骨链 + 腿碰撞）。  
- 对本仓库：差距不在「有没有裤子骨」（模型已有），而在 **(a) 选出可动骨并做横向约束 (b) 大腿/小腿/髋简化碰撞做到几乎不穿腿 (c) 腰带区约束 (d) 渲染更新与 hitstop/硬直时钟解耦 (e) 偏软下垂默认值 + 呼吸微晃 + 可存面板**。

---

## 4. X 检索（算法语义 + 关键词）

### 4.1 语义检索命中（与共识相关）

| 帖子 | 时间（帖内） | 要点 | 调查怎么用 |
|------|----------------|------|------------|
| [@chaorzzz · Magica Cloth 2 tips](https://x.com/chaorzzz/status/2038710234978381827) | 2026-03 | 单层裙偏 MeshCloth；复杂褶皱/多层偏 BoneCloth；腿穿模时把 Connection Mode 改成 Mesh 相关，横向连骨后大多立刻好转；小饰带也可 MeshCloth | **选型与防穿处方**：裤子有骨 → BoneCloth + 横向连接；穿腿先查「有没有横连」 |
| [@MagicaSoft](https://x.com/MagicaSoft/status/2032988203557494834) | 2026-03 | MeshCloth 甚至可以不给裙加骨 | 对照：本仓库**已有裤骨**，不必走「无骨纯顶点」才算布料 |
| [@_Mari_Art](https://x.com/_Mari_Art/status/1791729633752154126) | 2024-05 | 学 Magica 半小时给裙加上几乎不穿模的物理 | 说明裙/衣骨布流水线成熟，可当验收心理预期 |
| [@Bragok3D](https://x.com/Bragok3D/status/1958182235678605769) | 2025-08 | Magica 展示；丝带与链条挂在裙骨上一起动 | 腰带与裤子分区：挂件可跟父布料骨，但本共识要求裤子独立设计 |
| [@bandinopla · three-simplecloth](https://x.com/bandinopla/status/2022595248992719212) | 2026-02 | three.js 顶点涂色布料，接骨骼动画；需 WebGPU | **浏览器第一案**（见 §5） |
| [@bandinopla · skirt grab demo](https://x.com/bandinopla/status/2023907653278158937) | 2026-02 | 裙布料可抓取交互 demo | 证明蒙皮角色衣物在 three 上可做，不只是旗子布 |
| [@JaebloRocks](https://x.com/JaebloRocks/status/2079363493858320439) | 2026-07 | 「给裤子重做了 cloth physic」展示片 | 观感标杆：裤管布料在社区是可感知卖点 |
| [@_UMIN__](https://x.com/_UMIN__/status/2089361239541702974) | 2026-08 | 改裤形还要加布料物理（类比 Hwoarang 服装），工作量大 | 侧面印证：裤物理常与网格/权重一起重做；本仓库已有裤骨是优势 |
| [@oirandrive · DOA2 Cloth Physics](https://x.com/oirandrive/status/1996761632320458965) | 2025-12 | Itagaki：衣物用物理；真实衣物剧烈运动会难看所以要限制；裙尤其难，腿容易穿出来 | **格斗向权威旁证**：要物理，但要控形；穿腿是硬问题 |
| [@dieworkwear](https://x.com/dieworkwear/status/1871332687254016376) | 2024-12 | 舞蹈镜头里「裤子怎么动」决定观感 | 观感动机：宽松裤的跟随本身就是表演语言（非实现） |
| [@KNXCKLE · SF scarf/headband](https://x.com/KNXCKLE/status/1888292002153836967) | 2025-02 | 街霸用头巾/围巾像头发一样流 | 对照：头巾路径已有共识；**裤子是另一类问题** |

### 4.2 语义 / 关键词：受击定住 · 附属继续动

| 资料 | 要点 | 调查怎么用 |
|------|------|------------|
| Unity 讨论（网页互证，见 §6）：格斗 hitstop 时 **Kolin 头发仍在弹**；答复建议停 Animator，Dynamic Bone 类组件继续 | 角色暂停但附属物理继续 | **直接支撑共识豁免** |
| [@popo74a](https://x.com/popo74a/status/2082150041238610308) | 2026-07 | 「jiggle 在 hitlag **之后**开始」又合理又好笑 | 旁证：有的游戏选择硬直后再抖；**本共识要的是定住期间也继续**，实现上不能绑死在「hitlag 结束后才开物理」 |
| [@HappyEndStudio](https://x.com/HappyEndStudio/status/2076282877541765617) | 2026-07 | HitStop（TimeDilation）下物理驱动受击反应时穿模与爆炸感难搞 | 反面：用全局 TimeDilation 冻一切会伤附属物理——更支持「局部停动画、物理独立步进」 |
| X 关键词 hitstop+cloth 噪声大 | 大量手感梗、无关帖 | 结论以网页讨论 + 设计文为准，X 作旁证 |

### 4.3 关键词 Latest：衣物物理关键词组

近期（约 2026-08，锚点前数日可见）：

- **Magica Cloth 2** 仍是 VTuber / Warudo / 虚拟形象衣物物理话语中心（发型+衣装套装帖）。  
- three.js / WebGPU：**rope & cloth** 压测、CSS 移植 three cloth demo、挂布画廊类展示。  
- PhysBone vs Magica 选型讨论仍在继续。

**判断**：X 上「角色裙/裤布料」话语权在 **Unity Magica / VRChat PhysBone 生态**；「浏览器 three 布料」话语权在 **WebGPU demo/包**。裤子调研必须两边都看：前者抄**结构与防穿处方**，后者抄**蒙皮局部布料如何挂进 three 更新循环**。

---

## 5. 网页 / GitHub 重点案例

### 5.1 第一梯队（最贴「腰固定裤/裙 + 腿碰撞」）

| 项目 | 链接 | 引擎/栈 | 可借鉴 |
|------|------|---------|--------|
| **MagicaCloth2 · Skirt by BoneCloth** | [裙指南](https://magicasoft.jp/en/boneclothskirtguide2/) · [防穿透](https://magicasoft.jp/en/prevent-penetration-2/) · [碰撞设置](https://magicasoft.jp/en/mc2_collision_setup/) · [参数基线](https://magicasoft.jp/en/mc2_baseline/) | Unity（商业） | **本调查最重要的生产向菜谱**：Root 骨登记、固定/可动涂色（对齐腰固定）、**Connection Mode = Mesh Automatic（横向连骨）**、髋 Influence、Clamp/Restore Rotation、**双腿胶囊 + Penetration**；软垂可降 Struct Stiffness / Gravity、升 Drag；有 SoftSkirt 类预设可对标「偏软」 |
| **SPARK-inc/SPCRJointDynamics** | [GitHub Unity](https://github.com/SPARK-inc/SPCRJointDynamics) · [UE4](https://github.com/SPARK-inc/SPCRJointDynamicsUE4) | Unity / UE · **MIT** | README 写明开发动机就是**角色裙摆跟动作交互**；交叉约束（纵/横/剪切/弯曲）；自带球/胶囊碰撞组件——**开源骨布教科书**，算法可移植到 three，不必引入 Unity |
| **OneYoungMean/Automatic-DynamicBone** | [GitHub](https://github.com/OneYoungMean/Automatic-DynamicBone) · [Tutorial](https://github.com/OneYoungMean/Automatic-DynamicBone/wiki/Automatic-Dynamic-Bone-Tutorial) | Unity · 基于 SPCR | 自动生成发/裙物理骨；Jobs；关键词可扩到 skirt——参数面板与碰撞挂接思路 |
| **bandinopla/three-simplecloth** | [GitHub](https://github.com/bandinopla/three-simplecloth) · [Demo](https://bandinopla.github.io/three-simplecloth/) · [裙 demo](https://bandinopla.github.io/three-simplecloth/?demo=skirt) · [实现文](https://medium.com/@pablobandinopla/simple-cloth-simulation-with-three-js-and-compute-shaders-on-skeletal-animated-meshes-acb679a70d9f) · npm `three-simplecloth` | **three.js + WebGPU** | **本仓库栈最近的「蒙皮衣物」案例**：顶点涂色遮罩（白=粘住/对齐腰固定，红=布料）；独立衣物网格更佳（对齐 `DougiPants`）；`stiffness`/`dampening`/`gravity`/`wind`；球体绑骨碰撞；`cloth.update(delta)` 可与 hitstop 解耦 |
| **pafuhana1213/KawaiiPhysics** | [GitHub](https://github.com/pafuhana1213/KawaiiPhysics) · [Skirt 教程](https://github.com/pafuhana1213/KawaiiPhysics/wiki/Tutorial-Skirt-en) · [2026-06 更新报道](https://80.lv/articles/kawaii-physics-now-works-with-unreal-engine-5-8) | UE | 裙骨跟随参考骨；球形限制防穿；v1.21 强化裙/脚穿透与固定子步——二次运动「可爱物理」参数习惯 |

### 5.2 第二梯队（three / 算法营养 · 不全是裤子但可拆）

| 项目 | 链接 | 可借鉴 |
|------|------|--------|
| **three.js webgpu_compute_cloth** | [示例源码](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_cloth.html) · [PR #31123](https://github.com/mrdoob/three.js/pull/31123) | GPU Verlet 布料；官方起点；非角色裤管 |
| **jspdown/cloth** | [GitHub](https://github.com/jspdown/cloth) | WebGPU XPBD；小步长；教学向 |
| **ccincotti3/webgpu_cloth_simulator** | [GitHub](https://github.com/ccincotti3/webgpu_cloth_simulator) | XPBD + 自碰/外碰；算法清单清楚 |
| **steampower33/XPBD-Cloth** | [GitHub](https://github.com/steampower33/XPBD-Cloth) | Vulkan XPBD；**Sphere/Capsule SDF 碰撞**——腿胶囊思路可对标 |
| **pixiv/three-vrm-springbone** | [模块文档](https://pixiv.github.io/three-vrm/docs/modules/three-vrm-springbone.html) | 本仓库头巾已用路径；**调查结论：不够当裤子主方案**（缺横向布料约束），可仅作碰撞球/更新循环对照 |
| **VRChat PhysBones** | [文档](https://creators.vrchat.com/common-components/physbones) | 链根 Ignore（根不动）对齐腰固定；便宜碰撞；社区大量裙/裤饰品流水线 |

### 5.3 选型对照（调查建议，非定案）

| 路径 | 优点 | 风险 / 与共识摩擦 |
|------|------|-------------------|
| **骨布 + 横向约束**（SPCR / Magica BoneCloth Mesh） | 吃现有 `Pants_*` 骨；轻；腿碰撞成熟；腰固定清晰 | 需正确选骨与横连；权重差会不稳 |
| **蒙皮顶点布料**（three-simplecloth / MeshCloth） | 布感细；涂色控腰固定 | WebGPU 依赖或自写求解；踢腿高速易穿，要更强碰撞/迭代 |
| **纯弹簧链**（VRM SpringBone / 头巾同款） | 已有工程经验 | **难一次做全「整条布感 + 几乎不穿腿」**；与「独立设计」方向一致——不宜当主方案冒充完成 |

---

## 6. 专题对照共识条目

### 6.1 腰固定 · 大腿外侧到裤脚动

- Magica：固定粒子涂在腰；可动粒子在裙骨链；Influence Target 可挂髋。  
- three-simplecloth：非红/偏白区域粘在蒙皮上（防整件滑落）= 腰/裆粘住；红区 = 可动布。  
- PhysBone / SpringBone：根 Ignore 或不模拟 = 腰固定。  
- **对齐本仓库**：`Pants_Weist_*` 宜作固定或弱动；`L/R_PantsA/B/C_*`、大腿外侧相关 HJ 作可动——具体名单留给执行方案。

### 6.2 偏软下垂 · 呼吸微晃

- Magica 调参习惯：降结构刚度、调 Gravity、升 Drag → 更软更慢；SoftSkirt 预设可对标。  
- three-simplecloth：`stiffness` / `dampening` / `gravityPerSecond` / `windPerSecond`（风噪可当呼吸感来源）。  
- SPCR：约束强度与阻尼决定「布」还是「硬壳」。  
- DOA2 访谈提醒：**过真的乱扭在格斗镜头里难看**，要在仿真里限制——与共识「宽松但别乱飞抢戏」一致。

### 6.3 几乎不穿腿 · 尽量少穿腰带

行业高频处方（调查汇总，非唯一解）：

1. **大腿 / 小腿 / 髋胶囊**，半径略大于可见肉身。  
2. BoneCloth **横向 Mesh 连接**，减少腿从骨缝钻入。  
3. **Penetration / Collider Penetration / Backstop**（预记邻近碰撞体，防止绕到背面）。  
4. 提高求解迭代 / 碰撞厚度；极限姿势可接受「略收甩幅」换干净（对齐共识甩幅上限）。  
5. 腰带：另挂较小碰撞或把腰封附近粒子偏固定，避免裤腰钻进 `Obi`。  
6. 地面碰撞：共识本版不硬验收；Plane collider 在 Magica 有，但调查不升格为必须。

参考文：[Bugnet · Cloth clipping](https://bugnet.io/blog/how-to-fix-cloth-clipping-through-the-character-body)（2026-06）、[Ida Faber Physics](https://docs.idafaber3d.com/features/physics)（穿腿 = 缺腿部碰撞几何）。

### 6.4 受击定住 / 硬直豁免

| 来源 | 做法摘要 |
|------|----------|
| [Shane Sicienski · Capcom hitstop](https://shane-sicienski.com/blog/blog-post-title-one-55pmn) | 停攻击者/受击者更新，**不**整局冻结；其他对象可继续 |
| [Unity Discussions · hit stop + Kolin hair](https://discussions.unity.com/t/hello-i-am-looking-to-recreate-a-hit-stop-effect-similar-to-how-you-see-in-fighting-games/910407) | 停 Animator；头发/衣服若是独立动态骨组件则继续动；或角色本地 timeScale |
| Megan Fox / 常见动作游戏实践 | 优先「冻动画」而非全局 `timeScale=0`，以免误伤附属系统 |

**调查建议（非共识）**：裤子求解应挂**独立更新时钟**（或不受 hitstop 缩放的 `delta`），与头巾豁免同产品意图，但实现不必共用头巾代码路径。

### 6.5 调试面板 + 可存配置

开源/插件普遍暴露：刚度、阻尼、重力、风力、碰撞半径、最大速度、世界/局部惯性影响。  
three-simplecloth 与 Magica 都支持运行中拧参——对齐共识「面板可调 + 保存进配置」。

---

## 7. 与本仓库现状的差距（调查视角）

| 已有 | 仍缺（相对共识） |
|------|------------------|
| 独立网格 `DougiPants` | 未接裤子专用物理更新 |
| 大量裤子骨（腰围、左右裤管、大腿辅助等） | 未形成「固定集 / 可动集 / 横向约束」产品配置 |
| 头巾弹簧骨 + 受击豁免工程经验 | 裤子需**独立**求解与碰撞方案；不能把头巾链当完成态 |
| 腰带网格 `Obi` | 裤子防穿腰带的碰撞/固定策略未做 |
| 调试/预设习惯（shipping 等） | 裤子参数 schema 与面板项未立 |

---

## 8. 检索日志（便于复验）

### 8.1 Web / GitHub 主查询（摘要）

- `MagicaCloth BoneCloth pants trousers character cloth physics`  
- `three.js cloth pants skirt character secondary motion WebGPU GitHub`  
- `Unity Dynamic Bone OR MagicaCloth loose pants gi cloth collision legs`  
- `hitstop hitfreeze cloth hair continues moving fighting game`  
- `site:github.com cloth simulation pants OR trousers OR skirt bone cloth collision capsule`  
- `SPCR Joint Dynamics GitHub` / `KawaiiPhysics skirt tutorial` / `Automatic-DynamicBone`

### 8.2 X 语义查询（强制执行过）

- character pants or trousers cloth physics secondary motion loose gi pants swinging  
- MagicaCloth or PhysBone or BoneCloth for pants skirts clothing physics tuning soft droop  
- three.js cloth simulation character clothing WebGPU pants or skirt physics  
- hitstop hitfreeze fighting game hair cloth continues moving while character frozen  
- fighting game character loose pants or dougi gi cloth secondary animation physics  

### 8.3 X 关键词 Latest

- `(cloth OR pants OR trousers OR skirt OR "secondary motion") (MagicaCloth OR Magica OR PhysBone OR "three.js" OR threejs OR Verlet OR "BoneCloth" OR "spring bone")`  
- `(hitstop OR hitfreeze OR "hit stop" OR hitlag) (hair OR cloth OR physics OR jiggle)`  

---

## 9. 相关文件

| 文件 | 关系 |
|------|------|
| `docs/pants-physics-consensus-v0.md` | 目标共识（**已抛弃**；本调查曾服从它） |
| `docs/headband-physics-consensus-v0.md` | 头巾共识；路径对照用 |
| `docs/belt-physics-consensus-v0.md` | 腰带共识；防穿腰带时对照 |
| `docs/research/headband-physics-research-2026-08-24.md` | 头巾调查体例与部分 hitstop/three 案例可复用阅读 |
| `docs/character-art-consensus-v0.md` | `DougiPants` 外观/材质范围（仍有效） |
| `docs/plans/ai-execution-plan-pants-physics-v0.md` | AI 可执行制作方案（**已抛弃**） |

---

## 10. 一句话给后续执行方案（历史 · 已抛弃）

> **不再执行。** 以下为抛弃前的选型摘要，仅作历史记录。

优先调研落地形态应是：**吃现有裤子骨的「骨布 + 横向约束 + 腿/髋胶囊 + 防穿透」**，浏览器侧可对照 `three-simplecloth` 的「腰涂色固定 + 独立 `update(delta)`」，但因 WebGPU/栈差异更可能是**自研或移植 SPCR 类约束求解**；**不要**用头巾弹簧链冒充裤子完成态；hitstop/硬直期间对裤子使用**不受定住缩放的独立步进**。

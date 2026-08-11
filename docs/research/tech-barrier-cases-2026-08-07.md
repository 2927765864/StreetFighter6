# 技术障碍扫清 · 案例检索报告

> **检索节点时间**：2026-08-07 **06:44 UTC** / **14:44 CST**（服务器）  
> **关联共识**：`docs/consensus-v0.md` §1–§5（Web 训练场、Three+WebGPU、2D 逻辑、完整 SF6 隆、Drive、社区帧优先、不公开）  
> **目的**：为**正式开发前**列出必须掌握的技术能力，并用 GitHub 重点 + Web + **X 算法检索** 搜集可对标工程案例。  
> **本文件是调研快照**，不是共识、不是排期。

---

## 0. 共识 → 技术栈（先分析）

### 0.1 产品形态决定的硬技术

| 共识条目 | 技术能力 | 初步实现门槛（扫清障碍） |
|----------|----------|--------------------------|
| 桌面 Chrome + **WebGPU** | WebGPU 可用性检测、`WebGPURenderer`、无 WebGL 回退承诺 | 能在本机 Chrome 跑通空场景 + 一帧 render loop |
| **Three.js** 3D 表现 | Scene / Camera / glTF / SkinnedMesh / AnimationMixer / 调试线框 | 加载 humanoid glTF，播 idle，逻辑坐标映射到 3D |
| **逻辑与渲染分离** | 纯 TS 对战模块、固定逻辑帧、与 rAF 解耦 | 逻辑单测不依赖 Three |
| 帧数据驱动 + **R2** | 本地 JSON/表 schema、startup/active/recovery、hitstun、cancel | 5LP 样板表 → 状态机 → 碰撞 |
| **Classic 输入** | 键盘缓冲、方向/按键历史、特殊技指令（可占位） | 缓冲可读；指令匹配可后置 |
| 碰撞 / 硬直 | 2D hit/hurt 框、AABB 或分段框、攻防状态 | 一招击中 Dummy 进硬直 |
| **Drive 等共享系统** | 资源条、DI/DR/OD 等状态块（可占位） | 条可显示；系统可占位开关 |
| 训练场 **D2 + H2** | Dummy 预设防站/蹲；框、逻辑帧、简易帧条 | 调试叠加层 + Dummy 模式切换 |
| 系统 HUD | 血量、Drive 条（非 H2 突破） | DOM 或 Three  overlay |
| SPA 构建 | **TypeScript + Vite** | `npm run dev` 可玩 |
| 表现可替换 **P2** | `clipId` / 逻辑 id 映射表 | 换 glTF 不改状态机 |
| 素材 | 自解包（终局）+ CC0 占位（T0） | 已有 interim + private 路径 |
| **明确不做** | 联网回滚、WASM 定点数、Modern、全角色 | 不建 netcode 模块 |

### 0.2 技术分层（实现时的模块边界草案）

```text
┌─────────────────────────────────────────────────────────┐
│  App (Vite SPA) · 训练场场景装配 · 输入采集                │
├──────────────────────┬──────────────────────────────────┤
│  Presentation        │  Combat Core (纯 TS)              │
│  Three WebGPU        │  fixed timestep / FSM             │
│  glTF · Mixer        │  move table · boxes · cancel      │
│  debug draw · HUD    │  Drive / system blocks (stub OK)  │
│  clip map            │  Dummy D2 · 无 GPU 依赖           │
└──────────────────────┴──────────────────────────────────┘
         ▲ 本地帧表 JSON（采信自 FAT / SuperCombo 等，运行时不联网）
```

### 0.3 技术障碍优先级（正式开发前要「知道怎么做」）

| 优先级 | 障碍 | 为什么挡路 | 用什么案例消解 |
|--------|------|------------|----------------|
| P0 | 固定逻辑帧 + 攻击帧表 + 碰撞 | 无此则不是格斗原型 | Sakuga / Ikemen 概念、Canvas fighting 教程 |
| P0 | Vite + TS + Three **WebGPU** 脚手架 | 共识硬渲染 | three 官方 webgpu 例、TSL 教程仓、Vite 模板 |
| P0 | glTF 蒙皮动画与 **clip 映射** | 表现层挂逻辑 | three skinning / retarget 例、T0 Quaternius |
| P1 | 社区帧 → 本地 schema | 采信与「已复刻」流程 | FAT 数据源、sf6fd、NappuSakku 拉取方式 |
| P1 | SF6 数据结构直觉（非资产） | Drive/moveset 复杂度 | MMDK、REFramework、SF6Mods info_display |
| P1 | H2 调试叠加 | 训练场可用性 | SF6Mods 训练 overlay 思路（自写 Web 版） |
| P2 | 3D 1v1 场景与相机 | 观感 | jady-deth、Black Trigram、badfighter |
| P2 | 解包管线 | 终局外观 | 既有 `sf6-extract-pipeline.md`（本轮不重复扫） |

---

## 1. 搜索计划（先计划后执行）

### 1.1 假设（2026-08-07）

| ID | 假设 | 验证方式 |
|----|------|----------|
| H1 | **不存在**合规开源「完整 SF6 3D 隆 + 全招 + Web 可玩」工程 | GitHub topics + web + X |
| H2 | **存在** 开源格斗引擎/帧数据工具，可学架构 | GitHub 定向 |
| H3 | **存在** Three/Web 3D 近战或格斗 demo，可学表现管线 | GitHub + X |
| H4 | SF6 社区精力在 **客户端 mod / 帧站**，不是独立 Web 复刻 | X keyword Latest |
| H5 | 帧数据有可机器读来源（FAT 等），可作**采信输入**而非运行时依赖 | web + X |

### 1.2 检索矩阵

| 通道 | 意图 | 查询示例 |
|------|------|----------|
| Web/GitHub | WebGPU + Three + TS | `WebGPURenderer Vite TypeScript three` |
| Web/GitHub | 格斗引擎 / 帧表 | `Sakuga-Engine` `Ikemen-GO` `FAT` `MMDK` |
| Web/GitHub | Three 格斗 | `jady-deth` `blacktrigram` `three.js fighting` |
| Web/GitHub | SF6 帧 API | `sf6fd` `Frame-data-API` `SF6Mods` |
| **X Semantic** | 语义发现 | open source fighting engine；Three WebGPU game |
| **X Keyword Latest** | 高级算子（强制） | `(SF6) (github OR REFramework OR MMDK)`；`Ikemen OR Sakuga`；`frame data SF6 FAT` |
| 对照旧文 | 避免重复踩坑 | `community-assets-and-cases.md`、`interim-community-scaffold.md` |

### 1.3 收录分级

| 级 | 含义 | 用法 |
|----|------|------|
| **A** | 架构/管线可对照，文档或源码清晰 | **重点 clone 阅读** |
| **B** | 数据/工具/mod 研究入口 | 采信或游戏内对照，不抄进公开仓的受保护物 |
| **C** | 教学向简化 demo | 快速建立肌肉记忆 |
| **D** | 噪音（无关 remake 八卦、无仓库） | 忽略 |

### 1.4 排除

- 要求分发完整游戏本体 / 官方 3D 资产包的链接。  
- 把「AI 像素街霸 vibe demo」当成 SF6 复刻权威。

---

## 2. 执行结果摘要（节点 2026-08-07）

### 2.1 假设验证

| 假设 | 结果 |
|------|------|
| H1 | **成立**。未发现可用的完整 SF6 3D Web 开源复刻。 |
| H2 | **成立**。Ikemen GO、Sakuga、Castagne、FAT 等活跃。 |
| H3 | **成立**。jady-deth、Black Trigram、badfighter；WebGPU 场景编辑实验增多。 |
| H4 | **成立**。X 上 REFramework / SF6Mods / 帧数据贡献者活跃。 |
| H5 | **成立**。FAT 开源 + 多工具拉取其 JSON；官方也有 Ryu 帧页（不完整即运行时）。 |

### 2.2 相对 2026-08-06 旧报告的增量

| 增量 | 说明 |
|------|------|
| **Black Trigram** | Three + R3F + TS + Vite 的完整浏览器 3D 近战向工程（非 SF 规则，但表现/TS 工程可学） |
| **NappuSakku** | 训练 overlay + **从 FAT 拉帧数据** 的脚本化路径 |
| **FAT 作为社区帧权威之一** | 与共识「社区帧优先」高度对齐；写入本地表前仍要审查 |
| **Three 官方 `webgpu_animation_retargeting`** | WebGPU 路径下动画重定向官方例 |
| **Ikemen GO 1.0 社区热度** | X 上 2026-08 前后有版本发布讨论（2D 引擎，学规则不学 3D） |
| WebGPU 浏览器工具实验 | 场景编辑器 + GLB 导入等（非格斗，证 WebGPU 生态在走） |

---

## 3. A 级案例（GitHub 重点 · 学架构）

### 3.1 格斗规则 / 引擎（逻辑层）

| 项目 | 链接 | 学什么 | 不学什么 |
|------|------|--------|----------|
| **Ikemen GO** | https://github.com/ikemen-engine/Ikemen-GO | 状态、指令、框、cancel 等**格斗引擎语义**；社区最大 2D 开源引擎之一 | MUGEN 资源格式、2D 精灵管线整盘搬到 Three |
| **Sakuga Engine** | https://github.com/NoisyChain/Sakuga-Engine | Godot 4 C#：hit/hurt、stance、状态系统；可选 rollback（我们**不**做 netcode，只看结构） | 直接依赖 Godot 运行时 |
| **Castagne** | https://github.com/panthavma/castagne | Godot 上的格斗工具层：内容与逻辑分层思路 | 引擎绑定 |
| **chriscourses/fighting-game** | https://github.com/chriscourses/fighting-game | Canvas 2D：精灵攻击盒、受击、简易 UI 的**最小闭环** | 帧表严谨度、3D |
| **HAMOOPI** | https://github.com/DanielMoura79/HAMOOPI | 另一类 C++ 开源格斗引擎参考 | 技术栈不同 |

站点：https://ikemen-engine.github.io/

### 3.2 Web 3D / Three 表现层

| 项目 | 链接 | 学什么 |
|------|------|--------|
| **jady-deth** | https://github.com/georgewaraw/jady-deth · 演示 https://georgewaraw.github.io/jady-deth/ | **最接近**「浏览器 3D 1v1」的轻量概念；R3F，非帧数据格斗 |
| **Black Trigram** | https://github.com/Hack23/blacktrigram · 玩 https://blacktrigram.com/ | **TS + Vite + Three/R3F** 生产向浏览器近战；数据模型/架构文档多；**非** SF 帧规则 |
| **badfighter** | https://github.com/sambrenner/badfighter | three.js 双人格斗极简 |
| **three.js 官方** | https://threejs.org/examples/ · skinning blending；WebGPU 例 https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_animation_retargeting.html | 蒙皮、混合、WebGPU 动画 |
| **WebGPU Samples skinnedMesh** | https://webgpu.github.io/webgpu-samples/samples/skinnedMesh/ | 原生 WebGPU glTF skin（对照理解，非必须裸写） |
| **Threejs_TSL_Tutorials** | https://github.com/cmhhelgeson/Threejs_TSL_Tutorials | Vite + WebGPURenderer + TSL 脚手架经验 |
| **Sean-Bradley Three.js-Boilerplate-TS-Vite** | https://github.com/Sean-Bradley/Three.js-Boilerplate-TS-Vite | TS+Vite 起步；需改 `three/webgpu` |
| **pachoclo/vite-threejs-ts-template** | https://github.com/pachoclo/vite-threejs-ts-template | 同类模板（默认 WebGL，可改 WebGPU） |

### 3.3 SF6 研究工具（规则/数据，不是可分发 3D 皮）

| 项目 | 链接 | 学什么 |
|------|------|--------|
| **MMDK** | https://github.com/alphazolam/MMDK | SF6 moveset 字典、Lua 改招；**战斗数据结构直觉** |
| **REFramework** | https://github.com/praydog/REFramework · nightly SF6: https://github.com/praydog/REFramework-nightly/releases | 游戏内脚本平台入口 |
| **SF6Mods (info_display 等)** | https://github.com/WistfulHopes/SF6Mods | 训练信息显示；与 H2 目标**概念对齐**（我们自研 Web 版） |
| **NappuSakku** | https://github.com/redforth/NappuSakku | 训练 overlay + **FAT 帧数据更新脚本** 流程 |
| **FAT** | https://github.com/D4RKONION/FAT · Web https://fullmeter.com/fatonline | 社区主流帧 App；**采信源候选** |
| **sf6fd** | https://github.com/sagansfault/sf6fd | 抓取/表示 SF6 帧数据的小型库 |
| **Frame-data-API** | https://github.com/ysmaelrequena/Frame-data-API | 多游戏帧数据 API 向 |
| **SF6QuickReference** | https://github.com/jerpdoesgames/SF6QuickReference | 招式速查 Web；明确 defer 详细帧给 FAT/SuperCombo |
| **官方 Ryu 帧页** | https://www.streetfighter.com/6/en-us/character/ryu/frame | 官方公开子集；可与社区表对照 |
| **SuperCombo Wiki** | https://wiki.supercombo.gg/w/Street_Fighter_6 | 社区百科/帧与属性（采信审查用） |
| **GitHub topic sf6** | https://github.com/topics/sf6 | 多为 overlay/scouter，**不是** 3D 复刻 |

### 3.4 T0 表现占位（许可清晰，与 interim 脚手架一致）

| 资源 | 链接 |
|------|------|
| Quaternius Universal Animation Library | https://quaternius.com/packs/universalanimationlibrary.html （CC0） |
| 本仓 interim | `private/interim/`（已有动画库与占位角色路径） |

---

## 4. X 算法检索执行记录（强制）

### 4.1 Semantic

| 查询意图 | 主要信号 | 工程价值 |
|----------|----------|----------|
| SF6 open source remake / frame data | 引擎渊源讨论（MVCI→SF6）、modder 生态；**无**完整 Web 3D 开源复刻 | 证 H1；认知背景 |
| Three.js WebGPU / glTF games | WebGPU 场景编辑器实验；GGEZ 等 Three 游戏框架宣传；体素战斗 demo | WebGPU 可行；**非** SF 帧格斗 |

代表帖（检索命中，非背书）：

- 模组侧历史认知：@WistfulHopes 等关于 SF6 战斗引擎渊源的讨论。  
- WebGPU + Three 编辑器实验：@DreamLogical（GLB import / Play Mode）。  
- Three 游戏脚手架宣传：GGEZ 等（需自行甄别成熟度）。

### 4.2 Keyword Latest（高级算子）

| 查询 | 主要发现 |
|------|----------|
| `(SF6 OR "Street Fighter 6") (github OR REFramework OR MMDK OR remake)` | **高价值**：社区转发 **SF6Mods info_display + REFramework nightly** 安装链（指向 GitHub） |
| `(Ikemen OR "Sakuga Engine" OR Castagne OR MMDK OR REFramework)` | **Ikemen GO 1.0** 社区兴奋；圣斗士等 fangame 用 Ikemen；证明 2D 开源引擎生态活 |
| `("frame data" OR framedata) (SF6) (FAT OR supercombo OR github)` | SuperCombo 完整度讨论；**FAT 开发者 @D4RK_ONION** 与贡献者协作信号 |
| `MMDK OR REFramework OR info_display OR SF6Mods github` | REFramework 更新/安装器；与 nexus 对照时仍以 GitHub nightly 为准的声音 |
| Three fighting github | 噪声大；语义侧补充 WebGPU 工具多于真格斗 |

**X 侧工程结论：**

1. 可克隆的链接几乎总是：**REFramework / SF6Mods / FAT**，不是「SF6 Three 复刻仓」。  
2. 帧数据社区以 **FAT + SuperCombo + 贡献者** 为中心。  
3. 开源格斗热度在 **Ikemen** 一类 2D 引擎；3D Web 格斗仍是零散 demo。  
4. 因此：**正式开发应自建 Web 核心**，用 A 级仓学模式，用 B 级仓/站采信数据。

---

## 5. 按技术障碍 → 推荐阅读顺序

```text
1. Vite + three/webgpu 空场景
   → Threejs_TSL_Tutorials 或官方 WebGPU 例 + 任一 TS Vite 模板

2. 固定帧循环 + 一招 5LP 表 + AABB
   → chriscourses/fighting-game（最小）→ Sakuga / Ikemen 文档（语义扩展）

3. glTF + AnimationMixer + clipId 映射
   → three skinning examples + 本仓 private/interim 动画

4. 帧表 schema 与采信
   → FAT 数据结构浏览 + sf6fd / NappuSakku 更新脚本思路
   → 官方 Ryu 帧页 + SuperCombo 对照 → 写入本地 JSON

5. 训练场 D2/H2
   → SF6Mods info_display 功能列表作「要显示什么」清单
   → 自研 Three/DOM 叠加（不依赖 RE）

6. Drive 等系统块
   → 社区 wiki/帧站系统说明 + MMDK 字典浏览（研究向）
   → 先占位资源条与状态枚举

7. 终局表现
   → docs/guides/scheme-c-asset-pipeline.md + MMDK/RE 仅研究
```

---

## 6. 对「扫清技术障碍」的结论

| 问题 | 结论 |
|------|------|
| 缺什么技术？ | 见 §0：WebGPU Three、纯 TS 帧驱动格斗核、本地帧表、clip 映射、训练调试、Drive 占位。 |
| 有没有可直接 fork 的 SF6 Web 复刻？ | **没有**（H1）。 |
| 够不够开始正式开发？ | **够**：引擎语义（A）、表现脚手架（A）、帧采信源（B）、T0 资产（已有 interim）均齐。 |
| 最大剩余风险 | ① Drive 与全招式体量（用占位+审查标记消化）；② 原版动画仍靠自解包；③ WebGPU 仅桌面 Chrome 的兼容边界已共识接受。 |

**路径（与共识一致）：**

```text
逻辑权威  = 本地帧表（采信 FAT/SuperCombo/官方页 → 审查标记）
表现 T0   = interim CC0 / 通用 humanoid
表现 T2   = 自解包 private/
架构参考  = Ikemen/Sakuga + jady-deth/Black Trigram + three WebGPU 例
客户端研究 = REFramework/MMDK/SF6Mods（不进公开分发）
```

---

## 7. 快速链接清单（复制用）

```text
# 逻辑 / 引擎
https://github.com/ikemen-engine/Ikemen-GO
https://github.com/NoisyChain/Sakuga-Engine
https://github.com/panthavma/castagne
https://github.com/chriscourses/fighting-game

# Web 3D
https://github.com/georgewaraw/jady-deth
https://github.com/Hack23/blacktrigram
https://github.com/sambrenner/badfighter
https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_animation_retargeting.html
https://github.com/cmhhelgeson/Threejs_TSL_Tutorials
https://threejs.org/examples/

# SF6 数据 / 工具
https://github.com/D4RKONION/FAT
https://fullmeter.com/fatonline
https://github.com/alphazolam/MMDK
https://github.com/praydog/REFramework
https://github.com/WistfulHopes/SF6Mods
https://github.com/redforth/NappuSakku
https://github.com/sagansfault/sf6fd
https://wiki.supercombo.gg/w/Street_Fighter_6
https://www.streetfighter.com/6/en-us/character/ryu/frame
https://github.com/topics/sf6

# T0 动画
https://quaternius.com/packs/universalanimationlibrary.html
```

---

## 修订

| 日期 | 说明 |
|------|------|
| 2026-08-07 | 首版：共识技术映射 + 搜索计划 + Web/GitHub/X 执行；节点 06:44 UTC / 14:44 CST |

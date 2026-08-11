# 解包完成前：社区现成模型/动作 — 检索与临时脚手架共识

> **检索节点时间**：2026-08-06 11:54 UTC / 19:54 CST（服务器本地）  
> **关联**：`docs/consensus-v0.md` §3.5–3.6、`community-assets-and-cases.md`、`asset-acquisition-pathways.md`  
> **问题**：解包（PAK → mesh/mot → glTF）尚未完成前，能否用社区现成内容先搭 **基础可跑表现**？用什么、怎么用、以后怎么替换？

---

## 1. 共识分析（先对齐再搜）

### 1.1 已有共识（§3.5）摘要

| 项 | 决策 |
|----|------|
| 终局目标 | 模型与动作 **尽可能原版**（自解包） |
| 权威来源 | 本人正版安装 → 解包 → Blender → glTF；放 `private/` |
| 社区 rip 包 | **不作动作权威**；仅可外形对照 |
| 逻辑层 | 帧表/状态机 **自持**，动画只服务表现与时序对齐 |

### 1.2 新提议（本轮要达成的临时共识）

> **在解包完成之前**，允许使用 **社区现成、许可清晰（优先 CC0/明确游戏可用）** 的角色模型与通用格斗向动画，先打通：  
> `glTF 加载 → 动画状态 → 与帧逻辑挂接 → 训练场可读`。  
> **解包完成后**，用原版 mesh/mot 导出物 **替换表现层资源**；逻辑层尽量不重写。

这与 §3.5 **不冲突**，而是补一层 **时间维度**：

```text
时间轴 ─────────────────────────────────────────────►
  T0 临时脚手架          T1 混合               T2 原版优先
  社区模型+通用动作       原版 mesh + 临时动作    原版 mesh + mot
  （解包未完成）          或 临时 mesh + 原版 clip
```

| 层 | T0（现在） | T2（解包后） |
|----|------------|--------------|
| 规则/帧数据 | 自持 JSON | 不变（可再校准） |
| 碰撞盒 | 手 key / 骨点近似 | 可按原版比例重 key |
| mesh | 社区 humanoid / low-poly | 自解包角色 |
| 动画 clip | Mixamo/Quaternius 等 | 自解包 motlist |
| 仓库 | 仅许可允许的资产；**无 Capcom 二进制** | 原版仍只在 `private/` |

### 1.3 硬边界（临时期也不能破）

1. **逻辑不绑定动画文件**：状态时长以帧表为准；动画可 scrub/截断对齐。  
2. **SF6 rip 模型/动作**（Open3DLab 等）若使用 → **仅本机私人**，不进公开远程；且 **不算 T0 推荐主路径**（版权二次传播 + 无可靠招式库）。  
3. T0 主路径优先 **许可清晰** 素材，便于以后若 demo 要给别人看时不被动。  
4. 临时资源命名建议：`assets/interim/` + README 写清来源、许可、替换计划。

---

## 2. 搜索计划（先计划后执行）

### 2.1 目标分层

| 代号 | 要找什么 | 成功标准 |
|------|----------|----------|
| **S1** | 合法可进工程的 **humanoid 模型 + 近战动画** | glTF/FBX、许可明确、能走/打/受击 |
| **S2** | **GitHub 工程案例**（Three/Web 格斗或角色动画管线） | 可 clone、能看加载与状态机 |
| **S3** | SF6 相关 **社区现成**（模型 port / 工具） | 知边界：外形参考 vs 不可当分发资产 |
| **S4** | **X 算法检索** 实时社区信号 | 工具链、下载入口、活跃仓库 |

### 2.2 检索矩阵（已执行）

| 通道 | 查询意图 | 示例 / 实际查询 |
|------|----------|-----------------|
| **X Semantic** | SF6 模型动画下载、开源格斗 Three+Mixamo | `SF6 free character models animations…`；`open source fighting Three.js Mixamo…` |
| **X Keyword Latest** | SF6+Blender/model；REFramework；Mixamo glTF；Mesh2Motion/Quaternius | 见 §4 执行记录 |
| **Web/GitHub** | three fighting game、Mixamo 教程仓、CC0 动画库、Open3DLab SF6 | 多组 web_search |
| **对照旧报告** | 避免重复结论 | `community-assets-and-cases.md` |

### 2.3 收录分级（本报告）

| 级 | 含义 | 是否推荐作 T0 主依赖 |
|----|------|----------------------|
| **A** | 许可清晰 + 可进 Three 管线 + 有动画 | **是** |
| **B** | 优秀开源工程（学架构/管线，皮不是 SF6） | **参考**，可抄模式不抄皮 |
| **C** | SF6 rip / 游戏内 mod（外形或客户端内） | **私人可选**；非 T0 主路径 |
| **D** | 噪音（无关 IP、仅 UI mod、纯 AI 短视频） | 忽略 |

---

## 3. 执行结果（节点：2026-08-06）

### 3.1 核心判断（更新版）

1. **仍不存在**「GitHub 上合法开源的 SF6 完整 3D 模型 + 全招式动画」工程。  
2. **T0 完全可行**：社区有成熟的 **通用格斗向 humanoid + 近战动画库**（CC0 / Mixamo 生态 / Mesh2Motion）。  
3. **SF6 外形现成包**（Open3DLab 等）仍然 **有模型、几乎无可靠全 moveset**；且版权不适合作脚手架主路径。  
4. **Three.js 可参考的 3D 近战/格斗 demo 比上次清单更多**（含 R3F 武打模拟器级仓库）。  
5. X 上工程价值信号：**REFramework/MMDK 修 mod**、**Mixamo→Three/glB 转换器**、**Mesh2Motion 开源替代 Mixamo**；不是「一键 SF6 资产包」。

---

### 3.2 A 级：推荐作 T0 临时模型/动作来源

| 来源 | 链接 | 内容 | 许可/注意 | 与本项目用法 |
|------|------|------|-----------|--------------|
| **Quaternius Universal Animation Library** | https://quaternius.com/packs/universalanimationlibrary.html | 120+ 动画，含 locomotion + **combat**；humanoid 可 retarget；FBX/glTF | **CC0**（包页声明 personal/edu/commercial） | **首选动作库**：idle/walk/punch/hit 先对齐状态机 |
| **Universal Animation Library 2** | https://quaternius.com/packs/universalanimationlibrary2.html | 130+；melee combo、parkour 等 | CC0 同系 | 补 combo/近战 clip |
| **Quaternius 角色包** | https://quaternius.com/（Modular Men / Animated Character 等） | low-poly 角色 + 部分自带动画；glTF/FBX | 多为 **CC0** | **首选占位角色 mesh** |
| **Adobe Mixamo** | https://www.mixamo.com/ | 大量 free 角色 + 近战动画（kick/punch/block 等） | Adobe 服务条款；**勿整库再分发**；按需下载自用 | 打击感库更全；导出 FBX → Blender → glb |
| **Mesh2Motion** | https://mesh2motion.org/ · GitHub: https://github.com/scottpetrovic/mesh2motion-app | **开源 Mixamo 替代**：web 绑骨 + 动画库；CC0 动画源 | 开源 + CC0 动画 | 规避 Mixamo 条款不确定时的备份管线 |
| **Mixamo → glTF 工具链** | https://github.com/ux3d/mixamo2gltf2 ；社区转换器（如 X 上 mixamo→Three glb 工具） | 合并多 clip 为单 glTF | 工具 MIT 等，资产仍属 Mixamo 条款 | 加速进 Three |
| **Kenney 资产** | https://kenney.nl/ · X: @KenneyNL | 大量 CC0 游戏资产；角色偏简 | 多为 CC0 | 场景/道具/极简人型占位 |

**T0 推荐最小集（一条可执行路径）：**

```text
1. 下 Quaternius 一个 humanoid 角色（glTF）
2. 下 Universal Animation Library 中 idle / walk / punch×3 / hit / block（或 Mixamo 等价名）
3. Blender 合并 clip → 单 .glb（或运行时多 AnimationClip）
4. Three.js AnimationMixer + 自有帧表驱动「何时播哪段 / 播到第几帧逻辑」
5. assets/interim/README.md 记录来源与「待原版替换」
```

---

### 3.3 B 级：GitHub / 开源工程案例（重点）

#### B1 — Web / Three 近战与格斗向（直接相关）

| 项目 | 链接 | 要点 |
|------|------|------|
| **jady-deth** | https://github.com/georgewaraw/jady-deth | R3F **1v1 3D 格斗概念**；低保真原创；演示 https://georgewaraw.github.io/jady-deth/ ；论坛 https://discourse.threejs.org/t/3d-fighting-game-jady-deth/45808 |
| **Black Trigram** | https://github.com/Hack23/blacktrigram | **Three.js + R3F + TS** 武打/打击模拟；数据驱动部位与状态；可玩 https://blacktrigram.com/ — 学「逻辑层与 3D 表现拆分」极有价值（非街霸） |
| **annihilate** | https://github.com/gonnavis/annihilate | Three 动作原型；分支含 **Mixamo Mutant** 加载示例 |
| **chriscourses/fighting-game** | https://github.com/chriscourses/fighting-game | Canvas **2D** 帧与精灵教学；学 hitbox/攻击表思路 |
| **Yuka dive** | https://github.com/Mugen87/dive | Three + glTF + Mixamo 模型的 3D 对战 AI demo（射击向，管线可参考） |

#### B2 — 格斗引擎（架构，非 Web 必用）

| 项目 | 链接 | 要点 |
|------|------|------|
| **Sakuga Engine** | https://github.com/NoisyChain/Sakuga-Engine | Godot 4 开源格斗框架；状态机/回滚/示例角色；支持 3D 模型 |
| **Ikemen GO** | https://github.com/ikemen-engine/Ikemen-GO | 2D MUGEN 系；学 moveset 定义，不搬 SF6 3D |
| **SchwarzerblitzEngine** | https://github.com/AndreaJens/SchwarzerblitzEngine | 独立 **3D 格斗引擎** 源码（C++/历史项目） |

#### B3 — SF6 工具（研究与将来替换管线，不是 T0 皮肤）

| 项目 | 链接 | 要点 |
|------|------|------|
| **MMDK** | https://github.com/alphazolam/MMDK | moveset / Lua 研究 |
| **REFramework** | https://github.com/praydog/REFramework | 游戏内脚本入口 |
| **SF6Mods** | https://github.com/WistfulHopes/SF6Mods | 训练信息显示等（X 上有安装帖） |
| **RE-Mesh-Editor** | https://github.com/NSACloud/RE-Mesh-Editor | 解包后模型导入（T1/T2） |
| **Noesis RE mesh plugin** | https://github.com/alphazolam/fmt_RE_MESH-Noesis-Plugin | motlist 导出关键 |

#### B4 — Topics

- https://github.com/topics/sf6 — 多为工具/overlay，非 3D 复刻  
- https://github.com/topics/fighting-game  
- https://github.com/topics/mixamo  
- https://github.com/topics/threejs-game  

---

### 3.4 C 级：SF6 社区「现成」模型（非 T0 主路径）

| 来源 | 示例链接 | 内容 | 限制 |
|------|----------|------|------|
| **Open3DLab** | 搜索 Street Fighter 6；如 Li-Fen / Alice / Training Stage / Battle Hub | Blender port、场景；**渲染向** | 版权灰区；**几乎无玩法级招式动画库** |
| **DeviantArt / Nexus Mods** | 多为 **进游戏换皮 mod**（X 上大量） | 依赖正版客户端 | **不能**当独立 Web demo 资产 |
| **YouTube 提取教程** | 如 “Extract Animations from SF6 for Blender” | 教 **自解包** 流程 | 属于 T2 路径文档，不是现成合法包 |
| **X 渲染 credit** | #SF6 #Blender 展示图 | 模型作者 credit | 下载链常私有 |

**结论不变并强化：** 社区「现成 SF6 皮」能加速 **外形对照**，不能替代 **T0 合法脚手架**，更不能替代 **T2 自解包动作权威**。

---

## 4. X 检索执行记录（强制算法检索）

节点：2026-08-06。

| 模式 | 查询要点 | 主要发现 |
|------|----------|----------|
| **Semantic** | SF6 free models animations Blender Unity | 通用「下模型/Blender」讨论；**无**合规全套 SF6 开源仓 |
| **Semantic** | open source fighting Three.js Mixamo | **高价值**：Mixamo 驱动 Three 角色、骨骼绑错修复案例；**Mesh2Motion** 被荐为开源 Mixamo 替代；2D→3D→Mixamo→Three 管线帖 |
| **Keyword Latest** | `(SF6 OR "Street Fighter 6") (Blender\|model\|fbx\|github…)` | 需 cosplay 模型 viewer；Nexus 换皮讨论；3D 打印；**Open3DLab 上 Cammy/Chun-Li 模型 credit**（渲染向） |
| **Keyword Latest** | `REFramework OR MMDK OR Open3DLab` + SF6 | **工程信号**：求 REFramework 合作；**info_display + REFramework 安装指引**（链到 SF6Mods / REFramework-nightly） |
| **Keyword Latest** | Mixamo + gltf/glb + github | Mixamo 仍是社区默认动画库；**开源 Mixamo→Three(.glb) 转换器**宣传；FBX→Mixamo→Blender 短流程 |
| **Keyword Latest** | Mesh2Motion / Quaternius / Kenney | Kenney 活跃发 CC0/免费资产生态；Mesh2Motion 在 2025 起被广泛称作 Mixamo 开源替代 |
| **Semantic** | SF6 Open3DLab Blender port | 游戏内 wrestler 等 **mod 下载**（Nexus/DA），不是 Web 资产包 |

**X 侧对 T0 的启示：**

- 做 Web 3D 角色，社区默认路径是 **Mixamo（或 Mesh2Motion）+ glTF/glb + Three**，不是等 SF6 rip。  
- SF6 圈精力在 **客户端 mod / REFramework**，与「独立引擎脚手架」是两条线。  
- 我们应 **跟随 A 级管线做 T0**，并行推进 Windows 解包，而不是阻塞在找「现成 SF6 全招式包」。

---

## 5. 建议的临时工程约定（可写入共识）

### 5.1 目录

```text
assets/
  interim/                 # 仅 T0；许可清晰
    README.md              # 来源 URL、下载日、许可、替换计划
    characters/
    animations/
  private/                 # gitignore：未来原版 glTF（解包产物）
```

### 5.2 接口稳定，资源可换

- 逻辑只认：`characterId`、`clipId`（如 `idle`/`walk`/`5LP`）、`frame`、`durationFrames`。  
- 渲染只认：`AnimationAction` 映射表 `clipId → Three.AnimationClip`。  
- 换原版时：**改映射表与 glb 路径**，不改状态机。

### 5.3 动画与帧表对齐策略（T0）

| 策略 | 做法 | 适用 |
|------|------|------|
| **截断/变速** | 通用 punch clip 用 `timeScale` 压到 startup+active+recovery 总帧 | 最快 |
| **分段标记** | 在 clip 上标 hit 帧事件（或独立 JSON 事件表） | 训练场调试 |
| **不追求** | 与 SF6 某角色逐帧像 | 留给 T2 |

### 5.4 明确不作为 T0 依赖

- 网盘 XPS 全集、来源不明的「SF6 ripped models」包  
- 声称含全角色全招式且可公开再分发的仓库（基本不存在且违法风险高）

---

## 6. 与旧报告关系

| 文档 | 关系 |
|------|------|
| `community-assets-and-cases.md` | 偏「有没有现成 **SF6** 资产」→ 结论偏否；**仍有效** |
| **本文** | 偏「解包前用什么 **合法脚手架**」→ **T0 路径成立** |
| `scheme-c-asset-pipeline.md` | 仍是 T2 解包操作手册；T0 不替代它 |

---

## 7. 精选链接速查（可点）

### T0 素材

- https://quaternius.com/  
- https://quaternius.com/packs/universalanimationlibrary.html  
- https://quaternius.com/packs/universalanimationlibrary2.html  
- https://www.mixamo.com/  
- https://mesh2motion.org/  
- https://github.com/scottpetrovic/mesh2motion-app  
- https://kenney.nl/  
- https://github.com/ux3d/mixamo2gltf2  

### GitHub 案例（架构 / 管线）

- https://github.com/georgewaraw/jady-deth  
- https://github.com/Hack23/blacktrigram  
- https://github.com/gonnavis/annihilate  
- https://github.com/chriscourses/fighting-game  
- https://github.com/NoisyChain/Sakuga-Engine  
- https://github.com/ikemen-engine/Ikemen-GO  
- https://github.com/AndreaJens/SchwarzerblitzEngine  
- https://github.com/Mugen87/dive  

### SF6 工具（T2 / 研究）

- https://github.com/alphazolam/MMDK  
- https://github.com/praydog/REFramework  
- https://github.com/WistfulHopes/SF6Mods  
- https://github.com/NSACloud/RE-Mesh-Editor  

### 社区 SF6 模型站（C 级，私人对照）

- Open3DLab 搜索 `Street Fighter 6`（角色/训练场/Battle Hub 等 port）

---

## 8. 一句话共识草案

**解包完成前：用 CC0/Mixamo 生态搭 humanoid + 近战动画脚手架，逻辑与资源解耦；解包完成后只替换 `private` 原版 glTF 映射。社区 SF6 rip 可私人对照外形，不作 T0 主路径，也不作动作权威。GitHub 跟 jady-deth / Black Trigram / Sakuga 学架构，跟 RE/MMDK 学将来替换管线。**

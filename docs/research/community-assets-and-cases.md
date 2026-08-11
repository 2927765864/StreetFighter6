# 社区现成素材 / 复刻案例检索报告

> 日期：2026-08-06  
> 范围：GitHub 重点 + 全网 + **X（语义 / 关键词高级检索）**  
> 问题：除自己解包外，社区是否已有可直接使用的 SF6 **模型 + 动作**？有无可参考的复刻项目？

---

## 1. 两种获取方式（分析）

| 维度 | 路径 A：自己解包 | 路径 B：社区现成包 / 他人复刻产物 |
|------|------------------|-----------------------------------|
| 模型完整度 | 高（与本机游戏版本一致） | 中高（常单角色、单服装；LOD/部件不全） |
| 动作完整度 | 可按需抽 motlist（仍要自己筛） | **通常很低**（多为 T-pose/简单 IK，或少量 pose；全招式库几乎没有「即下即用」） |
| 与帧逻辑对齐 | 可控（自己选 clip） | 弱（他人 port 目的是 SFM/Blender 渲染，不是格斗帧表） |
| 版本同步 | 随游戏更新重抽 | 易过时、来源不明 |
| 质量/绑骨 | 接近原版骨骼 | 参差；部分重绑/简化 |
| 工程可控 | 高 | 低（格式 XPS/blend/7z，缺文档） |
| 分发风险 | 不传播则暴露面小 | **下载站=二次传播**，私人研究也仍是版权灰区；来源可能混 NSFW/捆绑 |
| 适合本项目 | **表现还原主路径** | 仅「快速看一眼外形」或学习 port 流程，**不适合当动作权威** |

**关键判断（检索后）：**

1. 社区里「有人尝试过复刻街霸」 overwhelmingly 指：  
   - **2D 经典街霸 clone**（Canvas/Pygame/Unity 2D）  
   - **引擎/帧数据/工具**（Ikemen、MMDK、帧数据站）  
   - **游戏内 mod**（换皮、不是独立引擎复刻）  
   - **Blender 渲染用模型 port**（不是可玩 moveset）  
2. **几乎没有**「GitHub 上开源的、带 SF6 完整 3D 模型+全招式动画、可进 Three.js 的合法/完整工程」。  
3. 因此：**现成「模型」在素材站能找到；现成「可玩级动作库」基本找不到。** 动作仍高度依赖自解包或自制。

---

## 2. 搜索计划（已定稿并执行）

### 2.1 假设

- H1：GitHub 上不存在完整 SF6 3D 资产开源仓（版权原因）。  
- H2：存在 **工具仓** 与 **泛格斗开源引擎**，可学架构不能抄 SF6 皮。  
- H3：模型 port 集中在 Open3DLab / DeviantArt / 网盘，**动画极少**。  
- H4：X 上以 mod 展示、Blender 渲染、AI fangame 为主，少有可克隆的完整资产链接。

### 2.2 检索矩阵

| 通道 | 查询意图 | 示例查询 |
|------|----------|----------|
| GitHub / web | SF6 主题仓 | `Street Fighter 6` `sf6` topics；`MMDK` `REFramework` |
| GitHub | 复刻/clone | `street fighter clone` `remake` Unity/Three |
| GitHub | Web 3D 格斗 | `three.js fighting` `jady-deth` |
| GitHub | 开源格斗引擎 | `Ikemen-GO` `Sakuga-Engine` |
| 素材站 | rip 模型 | Open3DLab `Street Fighter 6`；DeviantArt SF6 Blender |
| 视频 | 打包下载 | “SF6 ripped models” Drive |
| **X semantic** | 语义 | fan remake / open source / models animations |
| **X keyword** | 高级算子 | `(SF6 OR "Street Fighter 6") (Blender OR github OR remake)…` |
| **X keyword** | 工具生态 | `REFramework OR MMDK OR modding` |
| **X keyword** | Web 引擎 | `Three.js fighting github` |

### 2.3 收录标准

- **A 级案例**：可直接对照架构/管线（开源、文档清晰）。  
- **B 级素材**：社区模型 port（私人参考外形，非动作库）。  
- **C 级噪音**：仅 UI 换皮 mod、AI 生成短视频、与 SF6 无关的 fighter。  
- **排除**：要求分享盗版完整游戏本体的链接。

---

## 3. 执行结果摘要

### 3.1 假设验证

| 假设 | 结果 |
|------|------|
| H1 | **成立**。未发现含官方 SF6 全量 3D 模型+动画的合规开源游戏仓。 |
| H2 | **成立**。工具与引擎案例丰富。 |
| H3 | **成立**。Open3DLab/DA 有多角色 mesh port；动作库缺失。 |
| H4 | **基本成立**。X 上 Blender 渲染与 mod 多，可工程化资产包少。 |

### 3.2 A 级：GitHub / 开源工程案例（学架构，不是拿 SF6 皮）

| 项目 | 链接 | 与本项目关系 |
|------|------|----------------|
| **MMDK** | https://github.com/alphazolam/MMDK | SF6 **招式/moveset 研究与 Lua mod**；在 REFramework 内改数据，**不是**导出给 Three 的资产包。极适合理解「街霸战斗系统数据结构」方向。 |
| **REFramework** | https://github.com/praydog/REFramework | RE 引擎模组/脚本平台，SF6 支持；游戏内研究入口。 |
| **SF6Mods（例：info_display）** | https://github.com/WistfulHopes/SF6Mods | 训练向脚本（帧/信息显示等）；X 上有安装指引传播。 |
| **Ikemen GO** | https://github.com/ikemen-engine/Ikemen-GO | 开源 2D 格斗引擎（MUGEN 兼容）。HN 评论有人提到 port 现代角色（含 SF6 **风格/数据**到 2D 引擎）——是 **2D 精灵/定义**，不是 3D RE 资产。 |
| **Sakuga Engine** | https://github.com/NoisyChain/Sakuga-Engine | Godot 4 开源格斗框架；学状态机/架构。 |
| **chriscourses/fighting-game** | https://github.com/chriscourses/fighting-game | 经典 Canvas 2D 教程工程；**帧与 sprite** 教学向。 |
| **jady-deth** | https://github.com/georgewaraw/jady-deth | **react-three-fiber 3D 格斗概念 demo**；最接近「Three 系 1v1」参考，**原创低保真**，非 SF6。演示：https://georgewaraw.github.io/jady-deth/ |
| **no-canvas-street-fighter-clone** | https://github.com/christian-konrad/no-canvas-street-fighter-clone | 纯 HTML/CSS/JS 实验性 SF 向 clone。 |
| 其他 SF2 向 | 如 Pygame/Unity SF2 clone 若干 | 2D 经典，与 SF6 3D 相关度低。 |

**GitHub topics 观察：**  
https://github.com/topics/sf6 以 **overlay、combo builder、save/scouter** 等工具为主，**不是** 3D 游戏复刻。

### 3.3 B 级：社区「现成模型」渠道（非完整动作）

| 来源 | 示例 | 内容形态 |
|------|------|----------|
| **Open3DLab** | Juri / Lily / Jamie / Li-Fen / Training Stage 等搜索 `Street Fighter 6` | Blender port、常 **ingame bones**、基础 IK；**渲染向** |
| **DeviantArt** | 如 WhiteMageSunny *Luke S1 for Blender* | blend/FBX、着色器；网盘链 |
| **YouTube + Drive** | “Howto download Street Fighter 6 RIPPED Models” 等 | 整季角色 XPS 打包；再 XPS→Blender |
| **X 渲染圈** | `#SF6 #Blender` 标签下模型 credit（如 @kluvarn 等） | 展示图为主，下载链不一定公开 |

**动画：** 上述 port **普遍不包含** 可玩级全招式 mot 库。若标注 animation，多为少量 pose/测试，不能替代自解包 motlist。

### 3.4 C 级 / 易混淆

| 类型 | 例子 | 为何不计入「现成 SF6 素材」 |
|------|------|------------------------------|
| 游戏内皮肤/像素头像 mod | X 上大量 `#sf6mods` | 依赖正版客户端，不可导出为独立 demo 资产 |
| AI vibe-coded 街霸 clone | 如 X 上 VIBE FIGHTER 类教程 | 自生成像素/精灵，**不是** SF6 解包资产 |
| 通用格斗动画商店/Mixamo | — | 合法但非 SF6 |

### 3.5 X 检索执行记录（强制算法检索）

| 模式 | 查询要点 | 主要发现 |
|------|----------|----------|
| Semantic | SF6 fan remake / open source models animations | 多为 AI clone 教程、mod 宣传、官方/设计讨论；**无**可直接 clone 的完整 3D 开源仓 |
| Semantic | SF6 ripped models Blender Unity | 噪声大（其他 IP 模型包）；SF6 相关少 |
| Keyword Latest | `(SF6 OR "Street Fighter 6") … Blender/github/remake` | Blender 渲染图、角色美宣；credit 模型作者 |
| Keyword Latest | `REFramework OR MMDK OR modding` | **有价值**：补丁后修 mod、找 REFramework 合作、**SF6Mods + REFramework 安装指引**（指向 GitHub） |
| Keyword Latest | Three.js fighting github | 噪声多；语义侧可见帧数据工具设想、物理拳击等，非 SF6 |
| Semantic | open source fighting engine hitboxes | 泛格斗/独立 demo；印证「开源的是引擎与工具，不是 SF6 资产」 |

**X 侧最有工程价值的信号：**  
模组与 REFramework 生态活跃（修包、脚本、info_display），说明社区精力在 **改客户端内数据**，而不是做 **可再分发的独立 3D 复刻资产包**。

---

## 4. 对「能不能直接用社区素材」的结论

| 需求 | 社区现成是否够用 | 建议 |
|------|------------------|------|
| 单角色 mesh 快速看外形 | **部分够用**（Open3DLab/DA） | 私人可参考；仍建议自解包以匹配版本/骨骼 |
| 完整/可靠招式动画 | **基本不够** | **自解包 motlist** 为主路径 |
| 帧数据/训练逻辑 | 用公开帧表 + 自研；MMDK/游戏内脚本辅助研究 | 不要指望 GitHub 游戏仓自带 SF6 帧表+3D |
| Three/WebGPU 范例 | jady-deth、Canvas fighting-game 等 | 学管线，换皮用自有/自解包 glTF |
| 「别人已经做好的 SF6 3D Web 复刻」 | **本次检索未发现可用完整项目** | 需自建 |

**路径选择建议（结合私人学习、要动作还原）：**

```text
动作权威来源 → 自己解包（+ Noesis/Blender）
模型可选加速 → 社区 port 仅作对照，或同样自解包
架构参考     → GitHub A 级（MMDK / Ikemen / jady-deth / fighting-game）
禁止依赖     → 把网盘 XPS 包当成「全招式动画库」
```

---

## 5. 精选链接速查

### 工具 / 数据（SF6 相关）

- https://github.com/alphazolam/MMDK  
- https://github.com/praydog/REFramework  
- https://github.com/WistfulHopes/SF6Mods  
- https://github.com/NSACloud/RE-Mesh-Editor  
- https://github.com/NSACloud/RE-Asset-Library  
- https://github.com/alphazolam/fmt_RE_MESH-Noesis-Plugin  

### 开源格斗 / Web 参考（非 SF6 资产）

- https://github.com/ikemen-engine/Ikemen-GO  
- https://github.com/NoisyChain/Sakuga-Engine  
- https://github.com/chriscourses/fighting-game  
- https://github.com/georgewaraw/jady-deth  
- https://discourse.threejs.org/t/3d-fighting-game-jady-deth/45808  

### 社区模型站（B 级，仅私人外形参考）

- Open3DLab 搜索 Street Fighter 6（多角色 port 页面）  
- DeviantArt 等 SF6 Blender 模型页  

### Topics

- https://github.com/topics/sf6  
- https://github.com/topics/street-fighter  

---

## 6. 后续可加深的检索（未做或弱覆盖）

1. Discord：SF Moveset Modding、Haven’s Night（往往有不公开的资产交换，需自行加入）。  
2. Japanese 圈：`ストリートファイター6 モデル 配布` `SF6 モーション 抽出`。  
3. Sketchfab 过滤 `Street Fighter`（注意 license，多为 fan art 非 rip）。  
4. 专门找 **「带动画的 SF6 FBX」**（预期仍稀缺；若出现多半是短 clip）。  

---

## 7. 一句话

**社区能省的是「找模型参考」的时间，省不了「招式动画权威来源」；GitHub 上值得跟的是工具与格斗架构案例，不是现成 SF6 3D 素材仓。**

---

## 8. 续篇（2026-08-06）：解包前临时脚手架

若目标改为「**在解包完成前**先用合法社区模型/动作把管线跑通」，结论见：

- **`docs/research/interim-community-scaffold.md`**（检索计划 + X/GitHub 执行 + T0 推荐源）  
- 共识 **`docs/consensus-v0.md` §3.6**

该续篇 **不推翻** 本文对「SF6 现成全招式包几乎不存在」的判断，而是补上 **通用格斗脚手架（CC0/Mixamo）** 作为时间轴上的 T0。

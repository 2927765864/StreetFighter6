# 角色控制实现 · 技术分析与案例检索报告

> **检索节点**：2026-08-10 **08:29 UTC** / **16:29 CST**（本机服务器时间）  
> **范围**：P0 角色控制（按键映射、状态机、预输入三层、cancel 打断）+ 表现接线  
> **方法**：先分析实现所需技术/代码 → 制定检索计划 → **Web/GitHub + X Semantic + X Keyword（强制）** 执行  
> **性质**：调研快照与实现参考索引；**不是**共识、不是排期。  
> **关联**：  
> - 设计：`docs/character-control/consensus-design-v0.md`  
> - SF6 规则调研：`docs/research/sf6-character-control-research-2026-08-10.md`  
> - 工程障碍总表：`docs/research/tech-barrier-cases-2026-08-07.md`  
> - 本仓库现状：`app/src/combat/*`（骨架有、系统未写完）

---

## 0. 先分析：现在要实现什么技术与代码

### 0.1 产品边界（实现时不要跑偏）

| 要做 | 不做 / 后置 |
|------|-------------|
| Classic 6 键 + 8 向；键盘优先 | Modern 控制 |
| 逻辑 60 Hz 权威；本地 JSON 帧表 | 运行时联网拉帧表 |
| 2D 逻辑盒 + 3D glTF 表现 | 3D 蒙皮作对战权威 |
| 三层预输入 + cancel 按招按帧 | 完整 DR 冻结相位（§5 待定） |
| 隆训练场可玩闭环 | 联网 rollback、全角色 |

### 0.2 技术栈（与现仓对齐）

| 层 | 技术 | 本仓库落点 |
|----|------|------------|
| 构建 | Vite + TypeScript strict | `app/` |
| 渲染 | Three.js **WebGPU** + glTF + AnimationMixer / scrub | `app/src/render/` |
| 对战核心 | **纯 TS**，无 Three 依赖，可 Vitest | `app/src/combat/` |
| 数据 | 本地 JSON：moves / clips / systems | `app/public/data/` |
| 调试 | lil-gui、框线、逻辑帧 HUD | `DebugGui` / `HudDom` |

### 0.3 P0 代码模块（相对现状的缺口）

```text
[Keyboard / 未来 Gamepad]
        │ 每逻辑帧 sample
        ▼
┌───────────────────┐
│ InputSample       │  dir(1-9 面向相对) + buttons 边沿/持续
│ KeyboardSource ★  │  ★ 已有雏形；缺全键 just + facing 镜像
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ MotionHistory (B) │  方向历史 + 步间间隙（~9f）
│ ActionBuffer (A)  │  不可行动登记意图，可行动 4f/7f 消费
│ CancelConsumer(C) │  cancel 窗内合法意图打断
└─────────┬─────────┘  ★ 现仅有环形 history，无 A/B 语义 / 无 C
          ▼
┌───────────────────┐
│ IntentResolver    │  motion+button → Intent；同帧优先级表
│ CommandMatcher    │  236/623/66/44/投…  ★ 全无
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ FighterFSM        │  Neutral/Attack/Stun/Jump/Dash/…
│ MovePlayer        │  localFrame + hit active + cancel 查询
└─────────┬─────────┘  ★ 相位极简；cancel 旗未消费
          ▼
┌───────────────────┐
│ Collision         │  hit∩hurt；hitstop 占位
│ MatchSim          │  步进编排、Dummy
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ ClipBinder        │  moveId/clipId → glb/anim；逻辑帧 scrub
└───────────────────┘  ★ map v1 有，对战几乎未接
```

| 模块 | 关键算法/数据结构 | 现仓状态 |
|------|-------------------|----------|
| 输入采样 | 位掩码按钮；numpad；边沿检测 | 半完成 |
| Action buffer | 环形/队列 + TTL（4/7）+ 可行动首帧消费 | 缺 |
| Motion | 序列状态机 / 子串匹配 + 间隙 | 缺 |
| 优先级 | 固定表裁决同帧多意图 | 仅文档 |
| FSM | 状态枚举 + 转移守卫（表驱动） | 极简 |
| Cancel | `windows[{from,to,into}]` 查询 | JSON 有、未用 |
| Hitstop | 逻辑停帧计数；输入仍采样 | 缺 |
| 动画 | 逻辑 `localFrame/total` → `action.time` | MVP scrub |

### 0.4 实现时优先阅读的「理论」源（非本轮新发现，作基线）

| 主题 | 链接 | 用途 |
|------|------|------|
| 固定逻辑步 | https://gafferongames.com/post/fix_your_timestep/ | 60 Hz accumulator |
| Motion 编码 | https://critpoints.net/2025/02/05/how-to-code-fighting-game-motion-inputs/ | 方向缓冲 + InputMotion |
| 缓冲/cancel 入门 | https://andrea-jens.medium.com/i-wanna-make-a-fighting-game-a-practical-guide-for-beginners-part-6-311c51ab21c4 | buffer 容器、cancel 列表、优先级 |
| SF6 缓冲数值 | https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data | 4f / 7f（权威公开口径） |
| 固定步 + 输入采样细节 | https://jakubtomsu.github.io/posts/input_in_fixed_timestep/ | 逻辑步与输入对齐 |

---

## 1. 搜索计划（先计划后执行）

### 1.1 假设

| ID | 假设 | 验证 |
|----|------|------|
| H1 | **不存在**合规开源「完整 SF6 3D 隆 + Classic 全指令 + Web 可玩」 | GitHub + Web + X |
| H2 | **存在**可学 **输入/缓冲/状态/cancel** 的开源格斗引擎（Go/Godot/C#/C++） | GitHub 定向 |
| H3 | **存在**可学 **Three/Web 3D 近战表现** 的 demo（非帧表权威） | GitHub + X |
| H4 | SF6 侧公开讨论多在 **手感/缓冲吐槽与 lab**，少完整引擎源码 | X keyword Latest |
| H5 | 机器可读帧数据（4rays 等）可作 **采信输入**，非运行时依赖 | GitHub |

### 1.2 检索矩阵（已执行）

| 通道 | 意图 | 示例查询 |
|------|------|----------|
| Web | 缓冲 / cancel / FSM | `fighting game input buffer cancel window state machine github` |
| Web/GitHub | Motion 实现 | `critpoints motion inputs`；`evilagram Fightmans` |
| Web/GitHub | 引擎 | `Ikemen-GO` `Sakuga-Engine` `Castagne` |
| Web/GitHub | 最小 Canvas 闭环 | `chriscourses fighting-game` |
| Web/GitHub | Three 格斗 | `jady-deth` `blacktrigram` `badfighter` |
| Web/GitHub | SF6 帧数据 | `4rays sf6-move-data` |
| Web | SF6 缓冲数值 | SuperCombo Game Data |
| **X Semantic** | 开源格斗引擎 / 缓冲 cancel | open source fighting engine input buffer… |
| **X Semantic** | SF6 buffer 语义 | Street Fighter 6 input buffer cancel… |
| **X Semantic** | Three 3D fighter | Three.js open source 3D fighting… |
| **X Keyword Latest** | 引擎名 | `Ikemen OR Sakuga OR Castagne github` |
| **X Keyword Latest** | SF6 buffer 舆情 | `SF6 ("input buffer" OR 4f) …` |
| **X Keyword Latest** | Three + fighter | `("Three.js" OR threejs) fighting github` |
| **X Keyword** | Lab | `from:GelatinLab (buffer OR cancel OR input OR hitbox)` |
| **X Keyword Top** | 引擎传播 | `Ikemen OR Sakuga OR Castagne github` |

### 1.3 收录标准

| 级 | 含义 |
|----|------|
| **A** | 开源可读，架构/输入/状态可直接对照实现 |
| **B** | 教程/文章/局部源码，讲清一种机制 |
| **C** | 表现管线或周边数据；非 Classic 帧表权威 |
| **D** | 社区舆情 / lab 边角；校准手感预期，不当规格书 |

---

## 2. 执行结果摘要

| 假设 | 结论（2026-08-10） |
|------|-------------------|
| H1 | **成立**。无合规完整 SF6 Web 复刻可抄。 |
| H2 | **成立**。Ikemen-GO、Sakuga、Castagne、Fightmans、chriscourses 等可学语义。 |
| H3 | **成立**。jady-deth、blacktrigram、badfighter、部分 vibe Three demo；**帧表驱动弱**。 |
| H4 | **成立**。X 上 SF6 buffer 以吐槽/官推 bug/实战技巧为主；GelatinLab 有 lab 向。 |
| H5 | **成立**。`4rays/sf6-move-data` 等存在（本仓已转 generated）；需审查后本地权威。 |

**X 检索说明**：  
- Keyword 组合 `(input buffer OR motion) (fighting) (github)` **Latest 曾 0 条**（算法稀疏）；改用引擎名 / SF6 / threejs / `from:GelatinLab` 后有效。  
- Semantic 对「引擎源码」噪声大，对 **SF6 buffer 玩法语义** 更有用。  
- 与 Web/GitHub 交叉后，**GitHub 仍是实现主参考**。

---

## 3. GitHub / 开源案例（重点）

### 3.1 A 级 — 优先精读（对照本项目模块）

| 项目 | 链接 | 语言/栈 | 对照本项目 | 怎么用 / 不要怎么用 |
|------|------|---------|------------|---------------------|
| **Ikemen-GO** | https://github.com/ikemen-engine/Ikemen-GO | Go · MUGEN 资源 | FSM、指令、cancel、状态号思维 | **读概念与状态组织**；不移植 Go 运行时；wiki：https://github.com/ikemen-engine/Ikemen-GO/wiki · 官网 https://ikemen-engine.github.io/ |
| **Sakuga-Engine** | https://github.com/NoisyChain/Sakuga-Engine | Godot 4 · C# | 状态系统、盒碰撞、3D 模型挂 2D 逻辑、（含 rollback **只读不抄**） | 看 **state / hit 数据如何表驱动**；本项目无 netcode |
| **Castagne** | https://github.com/panthavma/castagne | Godot 层 | 模块化格斗逻辑、工具链 | 学「逻辑层与引擎层分离」；文档 https://castagneengine.com/docs/ |
| **Fightmans + InputMotion** | https://github.com/evilagram/Fightmans · https://github.com/evilagram/Fightmans/blob/master/inputmotion.cs | C# | **Motion 匹配** | CritPoints 文直接指向此实现；对照 `CommandMatcher` |
| **chriscourses/fighting-game** | https://github.com/chriscourses/fighting-game | JS Canvas | 攻击状态、矩形 hit/hurt、最小闭环 | **语义重写进 TS combat**；禁止抄美术 |

### 3.2 A/B 级 — 输入缓冲与状态

| 项目 / 文 | 链接 | 对照 |
|-----------|------|------|
| M1m1c StateAndInputSystemUE4 | https://github.com/M1m1c/StateAndInputSystemUE4 | 多帧 input buffer → state machine 解释；UE 结构可对照 `InputBuffer`+FSM |
| drkitt/godot-input-buffer | https://github.com/drkitt/godot-input-buffer | **Action buffer** 语义（过早按键下一可行动帧执行）；非 motion，但对齐层 A |
| Godot proposal #100 | https://github.com/godotengine/godot-proposals/issues/100 | 环形缓冲 + 出招检测的社区讨论 |
| Godot proposal #14808（2026） | https://github.com/godotengine/godot-proposals/issues/14808 | 引擎层 buffer API 讨论；说明 FG buffer 仍是常见需求 |
| RoundBearChoi CPP_FightingGame | https://github.com/RoundBearChoi/CPP_FightingGame | Hadouken buffer 实作（配套 devlog 视频） |
| GameDev.SE 专业 buffer | https://gamedev.stackexchange.com/questions/96576/how-to-implement-a-professional-fighting-game-input-buffer | 经典 Q&A：环形缓冲长度与消费时机 |

### 3.3 B 级 — 教程与文章（实现手册）

| 资源 | 链接 | 用途 |
|------|------|------|
| CritPoints · Motion 编码（2025-02） | https://critpoints.net/2025/02/05/how-to-code-fighting-game-motion-inputs/ | **本项目 motion 主参考文** |
| CritPoints · 如何打出指令 | https://critpoints.net/2018/03/04/how-to-perform-fighting-game-motions/ | 玩家侧 236/623 语义，测手感 |
| Andrea Jens · Part 6 缓冲 | https://andrea-jens.medium.com/i-wanna-make-a-fighting-game-a-practical-guide-for-beginners-part-6-311c51ab21c4 | buffer 容器、读缓冲、**cancel 列表**、优先级/leniency |
| Gaffer · Fix Your Timestep | https://gafferongames.com/post/fix_your_timestep/ | 逻辑步 |
| 固定步与输入 | https://jakubtomsu.github.io/posts/input_in_fixed_timestep/ | 输入落在哪一 tick |
| SuperCombo SF6 Game Data | https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data | **4f / dash·wakeup 7f** |
| MUGEN Deep Buffering（历史） | https://mugen-net.work/wiki/index.php?title=Deep_Buffering | 深度缓冲概念（Andrea 文引用）；**非 SF6 权威** |

### 3.4 C 级 — Three.js / Web 3D 表现（不是帧表）

| 项目 | 链接 | 对照本项目 |
|------|------|------------|
| **jady-deth** | https://github.com/georgewaraw/jady-deth · demo https://georgewaraw.github.io/jady-deth/ · 论坛 https://discourse.threejs.org/t/3d-fighting-game-jady-deth/45808 | R3F 3D 1v1；**场景/相机/攻击表现**；**无** SF Classic 帧表 |
| **Black Trigram** | https://github.com/Hack23/blacktrigram · 玩 https://blacktrigram.com/ | TS + Three/R3F 战斗；有 ARCHITECTURE/DATA_MODEL；**武术模拟≠街霸 cancel**；本项目 **vanilla Three 非 R3F**，只学分层 |
| **badfighter** | https://github.com/sambrenner/badfighter | 早期 three + physijs 双人；历史参考 |
| three.js 官方 | https://github.com/mrdoob/three.js · 例：glTF / skinning / **webgpu_animation_retargeting** | **WebGPU + 动画 scrub 官方路径** |
| paulnovacovici/smash（X 提及） | https://github.com/paulnovacovici/smash | three 平台格斗 vibe demo；质量参差，**可选**扫一眼输入 |
| Sketchpunk threejs_proto | 例：https://sketchpunklabs.github.io/threejs_proto/… | 混合空间/root motion 试验；**表现**向 |

### 3.5 C 级 — 帧数据 / 工具（采信输入，非引擎）

| 项目 | 链接 | 备注 |
|------|------|------|
| **4rays/sf6-move-data** | https://github.com/4rays/sf6-move-data | TOML 人读帧表；**2026-02 归档**；本仓 `generated/` 已用；**须审查** |
| Frame-data-API | https://github.com/ysmaelrequena/Frame-data-API | 多游戏帧 API 思路；不直接当权威 |
| SFV Frame Data Visualizer | https://github.com/rah-1/SFV-Frame-Data-Visualizer | 可视化参考（SFV） |

### 3.6 周边（只读概念）

| 资源 | 链接 | 注意 |
|------|------|------|
| SuperCombo · Ikemen 介绍 | https://supercombo.gg/2023/02/02/from-rollback-with-love-ikemen-go/ | 引擎生态；**rollback 本项目不做** |
| Godot Asset · combo buffer | https://github.com/Msumri/combo-tutorial | 连招序列缓冲；更偏动作游戏 combo，可参考优先级「长序列优先」 |
| olcPixelGameEngine | https://github.com/OneLoneCoder/olcPixelGameEngine | RoundBear 教程底层；不引入本栈 |

---

## 4. X（Twitter）检索结果（强制通道）

### 4.1 语义检索 · 开源引擎 / 缓冲

| 价值 | 帖子 | 链接 / ID | 摘录用途 |
|------|------|-----------|----------|
| 中 | 输入缓冲改善连段手感（UE 示例） | post `1599360986158227456` @ZahidAliJeelani | 缓冲解决「中途按防御导致硬切」——对齐 **Action buffer 消费时机** |
| 中 | Blitz Cancel 资源取消 | post `1516189842299777027` @ShatterPointGS | **cancel 是资源+状态规则**，不是动画事件 |
| 低 | 杂项 OSS 推送 | — | 噪声多，已过滤 |

### 4.2 语义 / 关键词 · SF6 buffer

| 价值 | 帖子 | 链接 / ID | 摘录用途 |
|------|------|-----------|----------|
| **高** | 官方 Known Issue：Perfect Parry 后 wakeup buffer 失效 | post `1864597261272989996` @StreetFighter | 证明 SF6 **存在系统级 buffer** 且与特殊状态耦合；实现要预留「状态改 buffer 相位」钩子（§5 后置） |
| 中 | 缓冲 cancel 技巧（按住键） | post `1195014196410421251` @ZooUnderscore | 玩家侧 buffer 用法；测手感 |
| 中 | 某游 buffer 4F + cancel 窗怪异 | post `2084485238185730550` @circuscancel | 说明 **4f 很常见**；窗要按招 |
| 舆情 | SF6 buffer 吐槽/对比 | post `2085169714095882579` @RaikaDraws 等 | 手感主观；**不当规格** |
| Lab | cancel 窗帧数、combo-only hitbox 等 | `from:GelatinLab` 多帖 如 `1808827708849467524` `1858039546719645922` | **边角与盒语义**；实现 cancel 窗、盒类型时对照 |

### 4.3 关键词 · 引擎传播

| 价值 | 帖子 | 链接 / ID |
|------|------|-----------|
| 高 | Ikemen-GO 推荐 | post `1906248169433993567` @matsuu → https://github.com/ikemen-engine/Ikemen-GO |
| 中 | Ikemen wiki 指路 | post `2084114861110501686` → wiki |
| 低 | vibe-coded 3D fighter OSS 等 | 质量未知，实现时**勿优先** |

### 4.4 关键词 · Three + fighting

| 价值 | 帖子 | 链接 / ID |
|------|------|-----------|
| 中 | threejs 类 Smash | post `2082324251672227851` → https://github.com/paulnovacovici/smash |
| 中 | root motion / 未来 freeflow fighting | post `2021389096866939328` @SketchpunkLabs |
| 低 | 大量非格斗 Three 展示 | 过滤 |

**X 结论给实现的 tip**：  
1. Buffer 在社区是**一等公民**；要分「行动预输入」与「指令历史」。  
2. SF6 会改 buffer 与特殊系统交互（官推 bug）→ 配置表 + 钩子，硬编码必死。  
3. 开源实现讨论在 X 上**少于** GitHub；X 更适合校准 SF6 **玩法语义与 lab**。

---

## 5. 案例 → 本仓库文件映射（实现时打开哪边）

| 要实现 | 先读案例 | 改/建本仓 |
|--------|----------|-----------|
| 全键边沿 + 面向相对 | Andrea 位掩码思路；现 `KeyboardSource` | `app/src/combat/input/KeyboardSource.ts` `types.ts` |
| Action buffer 4f/7f | drkitt buffer；Gamedev.SE；SuperCombo Game Data | **新建** `ActionBuffer.ts`；`constants` / systems JSON |
| Motion 236/623/66 | CritPoints + `inputmotion.cs`；Ikemen command 语义 | **新建** `MotionMatcher.ts` / `CommandTable` |
| 同帧优先级 | Andrea priority；共识 §1.5 | **新建** `IntentResolver.ts` |
| Cancel 打断 | Andrea cancel list；Sakuga/Ikemen state；Gelatin 窗概念 | `MovePlayer` + `MatchSim` 消费 `cancel.windows` |
| FSM 扩展 jump/dash | Ikemen state；Sakuga robust state | `Fighter.ts` `types.ts` |
| Hitstop | 各引擎「hitstop 时逻辑停、输入不停」惯例 | `MatchSim` / `MovePlayer` |
| clip 接线 | three skinning 例；jady-deth 仅表现 | 消费 `ryu_logic_to_glb_map.json`；`render/*` |
| 帧表加载 | 4rays 格式；本仓 schema | `loadJson` + `ryu_index` + generated 审查副本 |

### 5.1 建议精读顺序（约 1～2 天调研可落地编码）

1. SuperCombo Input Buffer 段（定 4/7 配置键）  
2. CritPoints motion 文 + Fightmans `inputmotion.cs`  
3. Andrea Jens Part 6（buffer + cancel 列表）  
4. chriscourses 攻击/碰撞闭环（重写成 TS）  
5. Ikemen wiki 或 Sakuga 状态文件夹结构（对照 FSM 命名）  
6. three glTF + 本仓 map 接线（最后接表现）

---

## 6. 明确不采用 / 慎用

| 项 | 原因 |
|----|------|
| 完整复制 Sakuga **rollback** | 共识不做联网 |
| 运行时依赖 4rays / 任何帧 API | 仅采信 → 本地表；4rays 已归档 |
| jady-deth / blacktrigram 作 cancel 权威 | 非 SF 帧表驱动 |
| MUGEN 角色当资产 | 版权与风格不符；只学引擎语义 |
| 把「显示延迟 / IDR」当逻辑 buffer | 不同问题（调研已区分） |
| 未经审查的 vibe 3D fighter 整仓合并 | 质量与栈污染 |

---

## 7. 检索日志（可复现）

| 时间 | 通道 | 查询 / 说明 |
|------|------|-------------|
| 2026-08-10 08:29+ UTC | Web | input buffer cancel state machine github；motion inputs；Sakuga/Ikemen；three fighting；4rays；Castagne；chriscourses；SuperCombo Game Data |
| 同日 | X Semantic | open source fighting engine input buffer cancel；SF6 input buffer cancel；Three.js 3D fighting github |
| 同日 | X Keyword Latest | SF6 buffer 相关；Ikemen/Sakuga/Castagne；Three.js fighting |
| 同日 | X Keyword Top | Ikemen OR Sakuga OR Castagne github |
| 同日 | X Keyword | `from:GelatinLab (buffer OR cancel OR input OR hitbox)` |
| 同日 | 失败记录 | Keyword `(input buffer OR motion) (fighting) (github)` Latest → **0 条**（改查引擎名成功） |

---

## 8. 一句话

> **实现所需技术已清晰（纯 TS 对战核心 + 三层缓冲 + 表驱动 FSM/cancel + Three 表现）；开源侧没有「SF6 整包」，但 GitHub 上有足够 A 级引擎/motion/最小闭环可对标；X 强制检索补充了 SF6 buffer 语义与 lab 边角。实现时以本文件 §3–§5 为索引，以本地共识与帧表为权威。**

---

## 9. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-10 | 初版：P0 技术分析 + 检索计划 + Web/GitHub/X 执行结果 + 映射表 |

# 格挡受击调研 · 检索计划与案例报告

> **检索节点**：2026-08-18 **13:28 UTC** / **21:28 CST**（本机服务器时间）  
> **范围**：对手受击两类中的 **格挡**（另一类「不格挡被打中」本轮只做边界对照，不做深挖）  
> **方法**：先分析 → 定检索计划 → **Web / GitHub 重点 + X Semantic + X Keyword（强制）** 执行 → 落档  
> **性质**：调研与扫盲材料；**不是**共识文档；**不改代码**。  
> **术语对齐（对话已确认）**：用户口中「补个档」= **不格挡（被打中）**。本轮主攻 **格挡**。

---

## 0. 先分析：我们现在在谈什么

### 0.1 一句话

攻击打到对方时，若对方在防：不是播「挨打晃」，而是播 **格挡姿势**，并在一段时间内 **不能乱动**（这段时间叫 **防御硬直 / blockstun**）。不同攻击「打到身体的高度段」不同，格挡姿势也会不同。

### 0.2 和「被打中」的差别（先记住这两条）

| | 格挡（本轮） | 不格挡被打中（后置） |
|--|-------------|----------------------|
| 画面 | 举起防御、被推开 | 身体被打飞/后仰/蹲挨等 |
| 逻辑 | 进防御硬直；通常少伤或无伤 | 进受击硬直；扣血 |
| 本仓库已有共识 | §4.7 P2 真格挡：停顿 + 硬直 + 推开 | §4.9 明确延后「干挨分部位受击动画」 |

### 0.3 本仓库现状（检索前摸底）

| 已有 | 缺口（相对「完整格挡表现」） |
|------|------------------------------|
| 逻辑：`BlockResolve`、P2 恒防、`blockstun` / `hitstop` / `blockPushback` | 按攻击段位选不同格挡片、站防/蹲防切换规则是否写死 |
| 招式表字段：`guard`、`blockstun`、`hitstopOnBlock`、`blockPushbackTotal` | `guard` 取值与官方/玩家口语是否一致（见 §3） |
| 动画资源：`guard` 族约 45 个 `GRD_*` glb（含站/蹲、高低轻重等命名） | 逻辑 ID → 具体 `GRD_*` 片的映射表几乎只有 `block_stand` 样例 |
| Dummy：`stand_block` / `crouch_block` | 近身预防（proximity guard）、真连段自动防等细节 |

### 0.4 官方帧表里「上中下」容易晕（必须先扫盲）

**街头霸王 6 官方帧表**（Capcom 官网）写的是：

| 官方字母 | 官方英文意思 | 玩家口语常怎么说 | 站防 | 蹲防 |
|----------|--------------|------------------|------|------|
| **H** | High：可站可蹲防 | 常被叫成「中段」 | ✅ | ✅ |
| **M** | Mid：必须站着防的 overhead | 常被叫成「上段 / 过顶」 | ✅ | ❌ |
| **L** | Low：必须蹲着防 | 「下段」 | ❌ | ✅ |

也就是说：**官方的 H ≠ 玩家嘴里的「上段」**。  
我们本地招式 JSON 里目前大约是：`high` 34、`mid` 5、`low` 3、`midHigh` 1——更像是在跟 **官方字母** 走（大量普攻标 `high`），但个别招（如 `ryu_6mp` 标 `high`）是否真是「可站可蹲」还要对照公开表再核对。

**共识前必须先统一：我们口头说的「上中下」到底用哪套命名。**

### 0.5 格挡时真正在「表」上的几件事

防住一次攻击，公开资料与引擎实践里通常要同时处理：

1. **能不能防住**（站/蹲 vs 攻击段位；投技不能防）  
2. **防御硬直帧数** `blockstun`（防住后多久能动）  
3. **双方顿帧** `hitstop`（撞击瞬间双方定格，手感）  
4. **防御推开**（防住后两人被推开的位移，与攻击自身位移分开）  
5. **播哪段格挡动画**（站/蹲 × 被打高度/轻重；本仓库已有大量 `GRD_*`）  
6.（可选后置）削血、Drive 条、接近防、完美格挡等

本轮「格挡受击」若做完整表现，至少要把 **1–5** 说清楚；**6** 可明确砍掉或延后。

---

## 1. 检索计划（先计划，后执行）

### 1.1 目标问题

1. SF6 格挡规则：站/蹲 vs H/M/L（官方命名）怎么对应？  
2. blockstun / hitstop / 推开在公开帧表与社区怎么读？  
3. 开源格斗引擎怎么建模「防住结算 + 动画选择」？  
4. 动画侧：站防/蹲防、高中低命中反应片如何分族？  
5. X 社区近期在吵什么（接近防、硬直、高低猜）——避免我们重复踩坑。

### 1.2 渠道与查询（执行勾选）

| # | 渠道 | 查询意图 | 状态 |
|---|------|----------|------|
| A | SuperCombo Wiki | Defense / Game_Data：blockstun、站蹲、overhead/low | ✅ |
| B | Capcom 官方帧表 | H/M/L 官方定义 | ✅ |
| C | GitHub | `blockstun` / fighting engine / Sakuga / UFE / 自制格斗 | ✅ 重点 |
| D | 教程/文章 | Shawnthebro 格挡教程、CritPoints hitstun 深文 | ✅ |
| E | X Semantic | SF6 blockstun / high mid low / guard animation | ✅ 强制 |
| F | X Keyword Latest | `SF6 blockstun|guard|格挡`；`from:SF6frames`；日文格ゲー+下段 | ✅ 强制 |
| G | 本仓库 | 已有 §4.7、`GRD_*`、move.`guard`/`blockstun` | ✅ |

### 1.3 不做的检索（避免跑题）

- Drive 全家桶细则、完美格挡连招、联网 rollback 专文  
- 完整「被打中」部位受击状态机（仅对照边界）  
- 商业引擎源码破解

---

## 2. 执行结果摘要

### 2.1 规则权威（Wiki / 官方）

| 来源 | 链接 | 拿走什么 |
|------|------|----------|
| SuperCombo · Game Data | https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data | **Hitstun** = 挨打卡住；**Blockstun** = 格挡姿势卡住；**Hitstop** = 双方撞击定格。连段/连防串都靠这些帧。 |
| SuperCombo · Defense | https://wiki.supercombo.gg/w/Street_Fighter_6/Defense | 站/蹲防；**Overhead/High 必须站防**；**Low 必须蹲防**；多数招式两边都能防。另有接近防、真连段自动防等。 |
| Capcom 官方帧表说明 | 例：https://www.streetfighter.com/6/en-us/character/jp/frame | **H/M/L** 官方定义（见 §0.4）。 |
| Capcom 旧作防御课（SFV 专栏，概念仍通用） | https://game.capcom.com/cfn/sfv/column/131405 | 站防/蹲防能挡哪些段；讲解比 SF6 wiki 更「入门课」口吻。 |

### 2.2 GitHub / 引擎案例（重点）

| 项目 | 链接 | 与「格挡」相关的可学点 | 局限 |
|------|------|------------------------|------|
| **Sakuga-Engine**（Godot 4 / C#） | https://github.com/NoisyChain/Sakuga-Engine | 完整格斗框架：状态机、招式、回滚；有 Wiki；适合看「状态 + 命中结算」怎么拆模块 | 2D 动漫格斗向，不是 SF6 复刻；需自读 Scripts |
| **UFE / Universal Fighting Engine**（Unity 工具包） | https://www.ufe3d.com/ · 讨论区历史帖 | 招式编辑器里直接配 **hitstun / blockstun**、命中高度（high/low）、命中反应；业界常用「数据驱动格挡」范本 | 商业/闭源为主，主要当 **设计范式** 参考 |
| **maclo4/Unity-Alien-Fighting-Game** | https://github.com/maclo4/Unity-Alien-Fighting-Game | README 明确：**攻击可标 mid / overhead / low**；自有 hitstun、blockstun；作者自述仍缺蹲防动画与防住推开 | 小项目，动画不完整——正好说明「逻辑字段先于动画」是常见顺序 |
| **StreetPhyter**（Phaser / JS） | https://github.com/mkhandotnet/StreetPhyter | 浏览器格斗雏形；To-do 里单独列出 **Blockstun** | 多年未维护；价值是「把 blockstun 当独立里程碑」 |
| Shawnthebro UE 教程（Improving Blocks & Blockstun） | https://www.youtube.com/watch?v=Px6PUg42dkE | 专门讲 **high / mid / low 的 blockstun 状态** | 视频教程，非代码仓 |

**案例共性（对我们有用的结论）**：

1. **段位是攻击数据上的字段**（mid/overhead/low 或 H/M/L），结算时和「防守者当前站/蹲」比一下，决定防住还是打中。  
2. **blockstun 是独立数字**，不是「把格挡动画播完」；动画要服从硬直帧，或循环/定格到硬直结束。  
3. **推开与攻击位移分通道**（我们 §4.6 已写死，案例也反复踩过混用的坑）。  
4. 小项目往往先有逻辑，**蹲防片 / 高低片后补**——我们资源侧反而已有大量 `GRD_*`，缺的是映射与规则共识。

### 2.3 深文 / 概念

| 来源 | 链接 | 拿走什么 |
|------|------|----------|
| CritPoints · Stunning Detail | https://critpoints.net/2016/08/14/stunning-detail/ | 受击硬直与防御硬直的设计纵深；各作差异（减硬直格挡、Faultless Defense 等）——帮我们划「本阶段不要碰」的边界 |

### 2.4 X 检索（强制 · Semantic + Keyword）

**Semantic（主题：SF6 格挡 / 硬直 / 高低）** 要点：

- 高低猜、模糊防（先蹲防再短暂站防接 overhead）是玩家侧话题，说明引擎侧必须能在 **硬直期间切换站/蹲防姿态** 或至少正确结算段位。  
- 帧优势口语：`-6 on block` = 防住后你比对方晚 6 帧能动。  
- 真连段中姿态：有帖指出「防住角色姿态要等到出硬直或再防下一击才会变」。

**Keyword Latest（`SF6` + blockstun/guard；`from:SF6frames`）** 要点：

| 账号/帖 | 链接线索 | 对我们的启发 |
|---------|----------|--------------|
| @SF6frames | https://x.com/SF6frames · 例帖 id `2036197232576438508` | **接近防框（proximity guard）** 从约第 2 帧就出现；和伤害框不是同一个灰框。训练场复现要小心。站点 https://sf6frames.com/ |
| @Z_Gako | 帖 id `2037940565686308950` | 某些系统行为窗口 **依赖攻击的 blockstun 长度** |
| @mtlWOLF 等 | 赛季愿望帖 | 社区会把「改 blockstun」当平衡旋钮——说明帧表数字是玩法核心，不是表现装饰 |
| 日文 Keyword | 多为玩家进度/下段手感，引擎实现帖稀少 | 实现案例仍应以 GitHub + Wiki 为主 |

**X 结论**：社区不讨论「要不要有 blockstun」（那是常识），而讨论 **接近防时机、硬直长度带来的系统交互、高低猜**。我们做格挡时，**帧数字与站蹲判定** 比「再多做几个花哨防片」更优先。

---

## 3. 本仓库数据与动画命名（对照检索）

### 3.1 招式 JSON（抽样）

| moveId | guard（表内） | blockstun | 备注 |
|--------|---------------|-----------|------|
| ryu_5lp | high | 13 | 轻拳，官方语义上通常是「两边都能防」 |
| ryu_2mk | low | 20 | 下段 |
| ryu_2lk | low | 13 | 下段 |
| ryu_6mp | high | 25 | **需核对**：玩家常把 6MP 当 overhead；若官方为 M，则表可能标错或命名体系不同 |
| ryu_jhk | mid | 19 | 跳攻 |
| ryu_jmp | midHigh | 17 | 跳攻变体 |

字段已具备：`guard`、`blockstun`、`hitstopOnBlock`、`blockPushbackTotal`。

### 3.2 动画族 `GRD_*`（资源已在，映射未共识）

覆盖文档摘录命名暗示（完整列表见 `ryu-anim-glb-coverage`）：

- `GRD_STD_START` / `GRD_CRH_START` / `GRD_CRH_END` — 站/蹲防进入离开  
- `GRD_HH_ST`、`GRD_HL_ST`、`GRD_ML_ST`、`GRD_MH_RT`、`GRD_CH_LT`、`GRD_DL_ST` …  
  - 很像 **高度 × 轻重 × 站/蹲/朝向** 的组合片  

逻辑映射目前几乎只有：`block_stand` → `5000_GRD_STD_START` 样例。

---

## 4. 用大白话整理：做「格挡受击」时常见流水线

```text
红框碰到绿框
    │
    ├─ 对方没在防？ →（后置）走「被打中」
    │
    └─ 对方在防？
           │
           ├─ 段位 vs 站/蹲 不匹配？（蹲防挡 overhead / 站防挡下段）
           │     → 其实算「没防住」→ 被打中
           │
           └─ 匹配 → 防住
                 ├─ 双方 hitstop（顿几帧）
                 ├─ 防守方进入 blockstun（N 帧不能乱动）
                 ├─ 按「站/蹲 + 段位/轻重」选 GRD 动画
                 └─ 应用防御推开（独立通道）
```

开源案例（Alien Fighting Game、UFE 编辑器心智、Sakuga 状态机）都大致落在这个形状上；差异在字段命名和动画分得有多细。

---

## 5. 建议的「要 / 不要」讨论菜单（供共识提问，非结论）

> 下表只是调研后的 **候选边界**，等你回答后才算共识。

| 候选「要」 | 候选「不要 / 后置」 |
|------------|-------------------|
| 防住判定：段位 × 站蹲 | 被打中分部位动画（已有延后） |
| blockstun + hitstop + 防御推开（已有骨架，补齐表现） | Drive 防、完美格挡、Burnout 真连段自动防精做 |
| 至少 **站防 / 蹲防** 两套片；能按表播完或卡在硬直内 | 一开始就接满全部 45 个 GRD 变体 |
| Dummy 站防/蹲防可切换，用于验收高低 | 接近防框完美复刻、投技 tech 深度 |
| 统一「上中下」命名（官方 H/M/L 或玩家口语二选一，写进表） | 空中格挡（SF6 本来就不能空防） |

---

## 6. 原始检索日志（便于复查）

- Web：SF6 blockstun / high mid low；GitHub fighting blockstun；Capcom H/M/L；Shawnthebro Improving Blocks  
- GitHub 深读：Sakuga-Engine README；Unity-Alien-Fighting-Game README；StreetPhyter README；UFE 站点  
- Wiki 深读：SuperCombo Game_Data、Defense（2026-08-18 抓取）  
- X Semantic：SF6 blockstun high mid low guard；implement blocking engine  
- X Keyword：`(SF6) (blockstun OR guard) …` Latest；`from:SF6frames`；日文格ゲー+下段  

---

## 7. 下一步（仅流程，非实现）

1. 用本报告向你做 **扫盲式提问**（命名、本阶段范围、动画粒度、Dummy 行为）。  
2. 你确认后，再另开 **共识文档**（本文件不升级为共识）。  
3. 共识前 **不改代码**。

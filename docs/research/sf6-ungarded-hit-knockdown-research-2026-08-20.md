# 不格挡受击 / 倒地 / 起身 · 检索计划与案例报告

> **检索节点**：2026-08-20 **06:09 UTC** / **14:09 CST**（本机 `date` / `date -u`）  
> **范围**：对手受击两类中的 **不格挡被打中**，以及 **倒地** 与 **倒地后起身**  
> **方法**：先分析 → 定检索计划 → **Web / GitHub 重点 + X Semantic + X Keyword（强制）** 执行 → 落档  
> **性质**：调研与扫盲材料；**不是**共识文档；**不改代码**。  
> **上级对照**：格挡已落盘 `docs/character-control/consensus-block-guard-v0.md`；该文把「干挨」标为延后，本轮开始准备那一块。

---

## 0. 先分析：我们现在在谈什么

### 0.1 一句话

攻击打到对方、对方**没有防住**时：对方要 **扣血**、在一段时间里 **不能乱动**，并播放 **被打晃/被踢倒** 的动作。一部分招式（例如隆的 **蹲着重脚 / 2HK**）不只是晃一下，而是把对方 **打倒在地**，对方必须 **躺一会儿再爬起来**。

### 0.2 和「格挡」的差别（先记住这张表）

| | 格挡（已做） | 不格挡被打中（本轮准备） |
|--|-------------|-------------------------|
| 画面 | 举手挡住，被推开 | 身体后仰 / 蹲着挨 / 被扫倒 / 飞出去 |
| 能不能动 | 一段时间内不能乱动（防御硬直） | 一段时间内不能乱动（受击硬直）；倒地期间也不能乱动 |
| 血 | 本阶段 0（不做削血） | 通常要扣血（是否本阶段做，待问） |
| 之后 | 硬直结束仍可保持防姿 | 硬直结束回站/蹲待机；若倒地则走「躺 → 起身」 |

格挡调研里已经对齐过：用户口头「补个档」= **不格挡被打中**。本文件主攻这一条。

### 0.3 四个容易混的词（尽量不用黑话）

下面四个东西经常被社区挤在「受击」一个词里，**其实是四段不同的事**：

| 白话 | 社区常用词 | 它管什么 |
|------|------------|----------|
| **挨打卡住多久** | hitstun / 受击硬直 | 没倒地时，被打后几帧内不能操作。这段时间里再打中，就会连成一串（连段）。 |
| **撞击定格** | hitstop / 顿帧 | 打中那一瞬间双方一起停几帧，手感用。格挡路径已经有一份，命中侧通常另有数字。 |
| **被打倒在地** | knockdown | 不是「晃完就能动」，而是进入躺地。躺地时通常打不中（或只能打躺地专用招）。 |
| **从地上爬起来** | wakeup / 起身 | 躺够了之后站起来。SF6 有两种起身姿势，**起身总时长一样**，但位置/画面不同。 |

**硬直说了算、动画听硬直的**——格挡已经用过这条。不格挡同样适用：动画片长度 ≠ 能动手的时刻。

### 0.4 本仓库现状（检索前摸底）

| 已有 | 缺口 |
|------|------|
| 格挡全套：判定、blockstun、顿帧、推开、`GRD_*` | 没防住时的 **受击硬直真正驱动状态机**（字段 `hitstun` 已在招式 JSON / 调试面板，动画几乎未接） |
| 招式字段：`hitstun`、`hitstopOnHit`、命中推开（MMDK 命中侧） | 哪些招是「晃一下」、哪些是「打倒」**没有招式级标记共识** |
| 动画：`basic/esf001v00_damage` **118** 个 glb（`DMG_*` / `BAS_DN_*` / `BAS_TECH_*` / 吹飞 / 扫腿等） | 逻辑 ID 只映射了样例 `hitstun_light` → `DMG_HL_ST` |
| Dummy：站防/蹲防；姿势错 → 没防住 | 没防住后走的是占位，不是分部位挨打；**倒地 / 起身未做** |
| 共识：干挨分部位动画延后 | 用户现在明确要开始做这块，含 2HK 击倒 |

`DMG_*` 命名和已经接上的 `GRD_*` **同一套字母习惯**（高/中/低 × 轻/中/重 × 正/左/右），扫盲见 §4。

### 0.5 官方帧表里和「打倒」有关的写法

Capcom 隆帧表（https://www.streetfighter.com/6/en-us/character/ryu/frame）对 **Crouching Heavy Kick（蹲重脚 / 2HK）**：

- 段位 **Low**（必须蹲防；站着防 = 没防住）  
- 命中结果写 **D**（down / 打倒一类）  
- 备注：作为 **惩罚反击（Punish Counter）** 打中时，躺地时间变长，并变成 **Hard Knockdown（硬倒地）**

社区 FAT / Ultimate Frame Data 把命中优势写成类似 **Knockdown +40**，而不是普通拳脚那种 `+4`。意思是：**对方从倒地爬起来的那一帧**，你比他还多大约 40 帧能先动手。这不是 hitstun 数字本身。

---

## 1. 检索计划（先计划，后执行）

### 1.1 目标问题

1. 不格挡被打中时，公开规则里实际发生哪几步（硬直、扣血、推开、动画）？  
2. 「晃一下」和「打倒在地」怎么区分？SF6 起身有几种？硬倒地限制什么？  
3. 开源格斗引擎怎么拆「受击状态 / 倒地 / 起身」？  
4. 我们已有的 `DMG_*` 118 片怎么读名？本阶段必须接哪些、哪些可砍？  
5. X 社区近期在吵什么起身/硬倒地问题——避免把「整套 SF6 起攻」误当成必做。

### 1.2 渠道与查询（执行勾选）

| # | 渠道 | 查询意图 | 状态 |
|---|------|----------|------|
| A | SuperCombo Wiki | Game Data 硬直；Defense 起身；Offense 扫腿/硬倒地 | ✅ |
| B | Capcom 官方帧表 | 2HK / D / Hard Knockdown 原文 | ✅ |
| C | FAT / Ultimate Frame Data | 隆 2HK Knockdown +40 等对照 | ✅ |
| D | GitHub | hitstun / knockdown 引擎；Ikemen-GO；MMDK HIT_DT；UFE；Sakuga | ✅ 重点 |
| E | 深文/教程 | CritPoints hitstun；Shawnthebro Hit Reactions；Capcom SFV 课 | ✅ |
| F | X Semantic | SF6 hitstun / knockdown / wakeup 实现与教学 | ✅ **强制** |
| G | X Keyword Latest | `hitstun\|knockdown\|wakeup` + SF6；`hard knockdown\|back rise` | ✅ **强制** |
| H | 本仓库 | damage 118 glb、MMDK HitStun 命中侧、格挡共识边界 | ✅ |

### 1.3 不做的检索（避免跑题）

- Drive 防 / 完美格挡 / Drive 逆转（格挡共识已砍）  
- 完整空中连段（juggle）物理与墙碎演出细则  
- 联网 rollback 专文  
- 商业引擎破解  

---

## 2. 执行结果摘要

### 2.1 规则权威（Wiki / 官方 / 公开表）

| 来源 | 链接 | 拿走什么 |
|------|------|----------|
| SuperCombo · Game Data | https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data | **Hitstun** = 挨打卡住；这段时间里再打中就是连段。**Hitstop** = 撞击双方定格。优势帧（+/-）是「谁先能动」，倒地优势是另一套数。受击/防御硬直结束后的预输入窗约 **4 帧**；**起身预输入约 10 帧**（含真正起身那一帧则 11）。 |
| SuperCombo · Defense | https://wiki.supercombo.gg/w/Street_Fighter_6/Defense | **两种起身**：Normal Rise（普通起）与 Back Rise（后跳起）。**倒地优势帧两种起身相同**（对面「压起身」的时机不因你选哪种而变）。落地时按住或按下 **两个键** → Back Rise，否则 Normal Rise。**硬倒地禁止 Back Rise**。起身时角色先被当成站立；想蹲要再花几帧（文中写蹲动画有 **4 帧强制站立**）。 |
| SuperCombo · Offense | https://wiki.supercombo.gg/w/Street_Fighter_6/Offense | 扫腿类（通常 2HK）打倒；作为惩罚反击时变硬倒地、躺更久。投技作为惩罚反击也变硬倒地。倒地中不能被投。落地起身有 **1 帧投技无敌** 一类细节。 |
| Capcom 隆官方帧表 | https://www.streetfighter.com/6/en-us/character/ryu/frame | 2HK：Low、命中 **D**、PC 时躺更久并 **Hard Knockdown**。 |
| Ultimate Frame Data · Ryu | https://ultimateframedata.com/sf6/ryu | 蹲重脚：**Knockdown +40**，防住 **-12**。 |
| FAT | https://fullmeter.com/fatonline/ | 社区帧表；有 hitstun 列可开。**硬直权威我们格挡阶段已定为 MMDK，命中侧建议沿用，不让 FAT 覆盖。** |
| Street Fighter Wiki · Knockdown | https://streetfighter.fandom.com/wiki/Knockdown | 系列通识：普通倒地 vs 硬倒地（不能快速起身）。SF6 的「快速起身」被做成 **Back Rise**，不是旧作那种缩短躺地时间。 |
| infil 词表 · Hard Knockdown | https://glossary.infil.net/?t=Hard%20Knockdown | SF6：硬倒地 = **不能后跳起（back roll / back rise）**。 |
| infil 词表 · Hit Stun | https://glossary.infil.net/?t=Hit%20Stun | 被打后不能行动的时间；在这段时间再挨打 → 连段。 |

**对 SF6 起身特别重要的一句（2022-10 社区已确认、Wiki 沿用）**：  
SF6 **没有**「故意多躺一会儿 / delay rise」。只有两种起身，**总时间一样**，Back Rise 只是往后跳开一点。

### 2.2 GitHub / 引擎案例（重点）

| 项目 | 链接 | 与「挨打 / 倒地」相关的可学点 | 局限 |
|------|------|------------------------------|------|
| **Ikemen-GO** | https://github.com/ikemen-engine/Ikemen-GO | 开源格斗引擎（MUGEN 资源）。受击/倒地是 **编号状态**：站挨、蹲挨、空气挨、躺地、起身各一组；硬直由招式数据里的数值驱动，动画播完不能提前结束状态。这是业界最完整、可直接读源的「倒地状态机」公开实现。 | 2D 精灵；状态号体系重，不要抄编号，抄 **「晃 / 倒 / 起」分状态**。 |
| **MMDK** | https://github.com/alphazolam/MMDK | SF6 招式研究套件。`HIT_DT` 里 **HitStun、MoveDest、MoveTime、DmgType、HitStop***；命中侧 vs 防住侧分表。我们本地 `mmdk-ryu-hitdt-block-fields.json` 已抽过。`DmgType` 一类字段才是「晃 vs 打倒 vs 吹飞」的引擎真相。 | 是模组工具不是游戏；要自己解读表。 |
| **Sakuga-Engine** | https://github.com/NoisyChain/Sakuga-Engine | Godot 4 格斗框架：状态 + 命中结算模块化；hitstun 是独立计时器。 | 非 SF6。 |
| **UFE** | https://www.ufe3d.com/ | 编辑器里给每招配 **hitstun、hit reaction clip、knockdown 开关**。范式：数据驱动反应，而不是在代码里写死「2HK 播倒地」。 | 商业闭源，当设计范式。 |
| **maclo4/Unity-Alien-Fighting-Game** | https://github.com/maclo4/Unity-Alien-Fighting-Game | 招式标 mid/overhead/low；自有 hitstun；作者承认动画不齐。 | 小项目。 |
| **fishfolk/punchy** | https://github.com/fishfolk/punchy | PR：hitstun 时长为 0 时 **不要切换受击状态**。提醒我们：倒地招的 hitstun 字段可能是 0 或不用，真正时长在倒地状态里。 | 横版群殴不是 1v1 格斗。 |
| **Shawnthebro · Hitstun + Hit Reactions** | https://www.youtube.com/watch?v=N_HMYSOCsJ0 | UE 教程把 **受击硬直、受击动画、防御硬直** 分成三课。顺序与我们「先格挡后干挨」一致。 | 视频非仓。 |
| 格挡调研已列 | StreetPhyter 等 | 「把 stun 当独立里程碑」仍然适用。 | — |

**案例共性（对我们有用）**：

1. **先有「这次命中是哪一种结果」的字段**（晃 / 打倒 / 吹飞），再选动画。不要用「动画片播完」判断倒没倒。  
2. **受击硬直是计时器**；倒地是 **另一个状态**（躺地循环 + 起身片），不是把 hitstun 加很长。  
3. **动画服从计时**：片短了就停在末帧或循环躺地；片长了也不许提前结束硬直/躺地。  
4. 小项目 **逻辑字段先于全套动画**；我们资源侧已经有 118 片，缺的是 **分类映射 + 哪些招触发打倒**。

### 2.3 深文 / 概念

| 来源 | 链接 | 拿走什么 |
|------|------|----------|
| CritPoints · Stunning Detail | https://critpoints.net/2016/08/14/stunning-detail/ | 受击硬直让「先出手的人能打断对方」；连段本质是硬直还没结束。推开与硬直是两件设计旋钮。 |
| Capcom SFV 专栏（概念通用） | https://game.capcom.com/cfn/sfv/column/131545 | 被打进「摇晃、不能动」= hit stun；防住不能动 = block stun；时长跟 **用了哪招** 走。 |
| G2A 词条（2026-06，入门口吻） | https://www.g2a.com/news/glossary/what-is-hit-stun/ | 五步：打中 → 挨打卡住 → 攻击方自己也要收招 → 谁先能动决定能不能再打 → 多次打中形成连段。 |

### 2.4 X 检索（强制 · Semantic + Keyword Latest）

**Semantic**（与「受击/倒地/起身/实现」相关）：

| 帖 | 拿走什么 |
|----|----------|
| [@Mir_40778 2022-10-02](https://x.com/Mir_40778/status/1576606057132326912) | **SF6 只有两种起身时机**（画面像 quickrise 的普通起 + 后跳起）；**没有 delay rise / 故意趴着**。这是后来 Wiki 的源头级社区结论。 |
| [@VGBC_GimR 2024-05](https://x.com/VGBC_GimR/status/1795224483831198191) | 起身 Drive 逆转 vs 安全跳——说明完整 SF6 起攻是深坑，**本阶段很容易做过头**。 |
| [@emezie 2026-08-16](https://x.com/emezie/status/2089106141275881816) | SF6 起身投保护偏短，是系列里的特例。提醒：起身无敌不要按 SF4 印象来编。 |
| [@SolidSpartanX 2026-08-12](https://x.com/SolidSpartanX/status/2087358925582557333) | 别的格斗有前滚/空技，SF6 倒地更「死」，醒了才选。 |
| [@jaeger_AUT 2026-08-11](https://x.com/jaeger_AUT/status/2087234673562829221) | 反击命中给「白捡打倒」会被觉得很强——打倒本身是奖励，不只是动画。 |

**Keyword Latest · hard knockdown / back rise**：

| 帖 | 拿走什么 |
|----|----------|
| [@arikashi_sf6 2026-08-03](https://x.com/arikashi_sf6/status/2084099801856295198) | 实战口语直接写 **HARD KNOCKDOWN**；惩罚反击投 = 硬倒 + 贴身起攻。 |
| [@__Exige__ 2026-06](https://x.com/__Exige__/status/2067537547543400547) | 后跳起时碰撞/推挤和普通起 **不一致**；有人拿来做「追尸体」。说明若本阶段做 Back Rise，**位移和受击盒** 不能当纯装饰。 |
| [@The_K_Yassine 2026-08-04](https://x.com/The_K_Yassine/status/2084700313613734050) | 社区仍在吵「要不要加起身投保护」——我们不必在训练场复刻整套心理战。 |

**X 检索结论**：社区把「打倒」当 **规则奖励**（你能走过去压人），把「起身」当 **猜拳**。训练场第一阶段通常只需要：**能倒下、能按统一时长爬起来、画面能分清普通起/（可选）后跳起**。安全跳、Drive 逆转、尸体推挤都是后置。

### 2.5 本仓库动画族（检索后对照）

`private/assets/ryu/anims/basic/esf001v00_damage/` **118** 片。文件名规律（与 `GRD_*` 同源）：

| 文件名片段 | 白话猜测（待共识时再锁死映射，此处仅扫盲） |
|------------|--------------------------------------------|
| `DMG_H*` / `DMG_M*` / `DMG_L*` / `DMG_C*` / `DMG_D*` | 高段晃 / 中段晃 / 低段晃 / 蹲姿挨 / 更低或躺姿相关 |
| `L` / `M` / `H` 第二字母 | 轻 / 中 / 重（片长大约 29 / 39–49 / 69 帧） |
| `_ST` / `_LT` / `_RT` | 正面 / 偏左 / 偏右 |
| `BLOW_*` `START/RISE/FALL` | 被打飞：起跳、升、落（头/身/空） |
| `ASHIBARAI_*` | **扫腿打倒**（2HK 最像用这个） |
| `BAS_DN_*_Loop` | **躺地循环**（趴/仰） |
| `BAS_DN_STD_*` | 从躺地站起来（普通起） |
| `BAS_TECH_FN_*` / `BAS_TECH_BR_*` | 技术起 / **后跳起**（FN 前、BR 后） |
| `SPIN` / `WALL` / `STUN` / `KUZURE` / `GORO` | 旋转、撞墙、气绝、崩溃、滚动——更花的后置 |

逻辑映射现状：几乎只有 `hitstun_light` → `DMG_HL_ST`。倒地链（扫腿 → 躺 → 起）**还没逻辑 ID**。

---

## 3. 建议的「分层」，供提问用（不是共识）

检索后，若要把范围说清楚，业界常见是 **三层**，而不是一次做完 118 片：

| 层 | 画面上你能看见 | 规则上必须真的生效 | 明确可以后置 |
|----|----------------|-------------------|--------------|
| **A. 站着/蹲着挨打（不倒地）** | 按高低轻重播 `DMG_*` 晃 | 受击硬直、顿帧、命中推开、扣血（若要）、硬直结束才能动 | 左右偏转片、Counter/PC 加硬直、空中挨 |
| **B. 地面打倒 + 起身（2HK 代表）** | 扫倒 → 躺一会儿 → 爬起来 | 倒地期间打不中（或按 SF6：正常打不中躺着的人）；起身总时长固定；起身结束才能操作 | 硬倒地加长、惩罚反击变体 |
| **C. 花的受击** | 吹飞、旋转、撞墙、气绝 | — | **整层后置**（除非某条必杀没有它会「看起来没打中」） |

用户举例「蹲重脚把人扫倒」落在 **B**。若只做 A、2HK 会变成「重重晃一下然后立刻能还手」，和原作手感差一截。

---

## 4. 仍未在检索里锁死、必须问你的点

1. **本阶段要不要扣血？** 格挡是 0；干挨若也不扣血，训练场仍能看硬直，但「打倒」的意义会变弱。  
2. **Dummy 没防住时**：是否允许 Dummy 设成「永远不防」（站立挨打），专门验收干挨？现在主要是站防/蹲防。  
3. **倒地要不要两种起身？** 只做普通起就能验收 2HK；Back Rise 要位移和受击盒。  
4. **数字权威**：hitstun / 倒地总时长跟 MMDK 还是跟 FAT 的 `KD +40`？格挡已选 MMDK；倒地优势是另一套公开数。  
5. **动画覆盖**：高低轻中重全接，还是先「站轻 / 站重 / 蹲挨 / 扫倒四条」？  
6. **Counter Hit / Punish Counter**：2HK 的硬倒地加长要不要本阶段？官方写在备注里。  
7. **空中被打**：落地重置 vs 吹飞，本阶段是否声明不做。

---

## 5. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-20 | 首版：节点 06:09 UTC；计划 + Web/GitHub/X 强制检索；仓库 118 `DMG_*` 对照；分层 A/B/C 仅作提问用 |

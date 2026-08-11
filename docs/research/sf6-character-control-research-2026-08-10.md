# SF6 角色操控系统调研 — 2026-08-10

> **时间节点**：2026-08-10 15:15 CST（07:15 UTC）  
> **目的**：为「角色操控系统」共识提供事实基础；**本文件是调研笔记，不是共识**。  
> **共识产物**：`docs/consensus-character-control-v0.md`  
> **与产品共识关系**：服从 `docs/consensus-v0.md`（Classic、帧表驱动 R2、2D 逻辑 3D 表现、Drive 等共享系统）。

---

## 0. 调研计划（已执行）

### 0.1 分析轴

| 轴 | 问题 | 对实现的意义 |
|----|------|----------------|
| A 输入 | 采样、指令、优先级、负边 | Input + 指令解析 |
| B 预输入 | 是否有 buffer、窗口多长、例外 | 缓冲长度与消费时机 |
| C 动画/状态 | 可打断/cancel 规则 | FSM + cancel 表 |
| D 碰撞 | 盒类型、随动画如何变 | 帧盒表 / 调试绘制 |
| E 易漏重点 | 投技、站蹲 hurt、冻结、优先级… | 风险清单 |

### 0.2 检索执行摘要

| 通道 | 已执行 | 高价值结果 |
|------|--------|------------|
| **X Keyword Latest** | input buffer / cancel / hitbox / 4f buffer | 社区抱怨缓冲手感；patch 改 hurt；@GelatinLab 实验室结论 |
| **X Semantic** | buffering / cancel state machine | Digital Foundry 输入延迟；Gelatin cancel 点非 universal |
| **X 作者向** | `from:GelatinLab` | 指令间隙 9f、投技 tech 锁定、cancel 时机、hitbox viewer |
| **Web** | SuperCombo Game Data / Offense / Defense / Movement；EventHubs；FAT/UFD；SF6Mods | **权威系统数字**主要来自 SuperCombo |
| **浏览全文** | Game_Data、Offense、Defense、Movement | 缓冲 4f/7f、prejump、landing、throw 等 |

### 0.3 权威源优先级（本调研采用）

1. **SuperCombo Wiki** 系统页（Game Data / Offense / Defense / Movement / Gauges）  
2. **角色 Data 页 + 官方帧表 cancel 图例**（Capcom frame data）  
3. **Ultimate Frame Data / 社区 hitbox 截图**（盒形与 active 对照）  
4. **X 实验室向**（@GelatinLab 等）— 补丁级边角、脚本行为  
5. **实现向博客**（critpoints motion、Ikemen 语义）— 仅作工程结构参考，不作 SF6 数值权威  

---

## 1. 输入机制（Street Fighter 6 Classic）

### 1.1 基本模型

- **60 Hz 逻辑帧**：一切帧数据、缓冲窗口以 1/60 s 计（与本项目 ADR-001 一致）。  
- **Classic**：6 键（LP/MP/HP/LK/MK/HK）+ 8 向；**非 Modern**（本项目共识已排除 Modern）。  
- **指令招**：方向序列 + 按钮；**OD** = 同强度两键（或两键同系）；**投技** = LP+LK（后投 = 4+LP+LK）。  
- **Drive 系统键位**：DI = HP+HK；Parry = MP+MK；DR = Parry 中 66 或可 cancel 招后 66 等（细节见 Gauges）。

### 1.2 指令识别（社区实测要点）

| 现象 | 来源要点 | 实现含义 |
|------|----------|----------|
| **运动指令间隙宽** | Gelatin：如 22 系定义为 `5~2~5~2~BUTTON`，**各步之间允许约 9f 间隙**，间隙内可有多余方向只要满足最小序列 | 解析器要「状态机 + 最大间隙」，不能只匹配严格连续帧 |
| **QCF 等过于宽松** | EventHubs 等：SF6 指令宽容度偏大，误输入易出错招 | 需「最新完整指令」与优先级表，避免旧缓冲污染 |
| **同帧多输入** | SuperCombo Move Input Priority 章节仍有 **TO-DO**；实战中 special/super/throw/normal 有隐式优先级 | 工程上必须自建 **同帧优先级表**（见共识文档） |
| **投技 tech 污染** | Gelatin：tech 窗内非 light 或可被读成 motion 的 LP+LK 会 **无法 tech** | 投技 / tech 窗口需独立输入语义，不可与 special 共用同一消费路径无条件 |
| **Dash 输入窗** | SuperCombo：首次方向 **≤8f**，中性 **≤8f**；最快 6-5-6（3f），最慢约 17f | Dash 识别独立于 special 缓冲 |

### 1.3 与「显示延迟」的区别（易混）

- **Input delay reduction / Digital Foundry 测延迟** = 显示/采集链路延迟，**不是**「预输入缓冲帧数」。  
- 操控系统共识应只承诺 **逻辑缓冲与指令语义**；不复刻主机显示延迟。

---

## 2. 预输入（Input Buffer）— **有，且分档**

> 结论：**SF6 明确有预输入算法**（社区与 wiki 均称 *input buffer*）。  
> 权威数字以 SuperCombo [Game Data · Input Buffer](https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data) 为准（抓取日 2026-08-10）。

### 2.1 通用攻击 / 防御行动缓冲

| 规则 | 数值 | 说明 |
|------|------|------|
| **标准预输入** | **最多提前 4f** | 「最早正确时机」合计约 **5f 窗口**（4 缓冲 + 1 正时机） |
| **典型用途** | link、硬直结束出 jab、hitstun/blockstun 结束的 reversal | +6 接 6f startup 的 1f link → 实际 ~5f 手感 |
| **Dash / 起身 Reversal** | **7f 缓冲**（合计约 **8f**） | 起身 DP/Super、mash backdash 更宽 |
| **Defense 页补充** | 起身 reversal **10f buffer** 表述（含 true reversal 帧后合计 11f）；hitstun/blockstun/air reset 后 **4f** | 与 Game Data 4f/7f 需在实现时 **统一对照表**（见共识「指标」：以表驱动配置为准） |

> **注意**：Defense 与 Game Data 对「起身窗口」表述口径略不同（10f vs 7f dash）。实现时**不得硬编码魔法数散落代码**，应进配置/帧表并标注采信来源；冲突时审查后写入本地。

### 2.2 不帮你的情况 / 例外

| 例外 | 说明 |
|------|------|
| **必须晚 cancel** | 如 Ken Jinrai loops：要 **尽量晚 cancel**，**不能**靠「尽早 buffer」 |
| **已知 bug 级例外** | 例如防 Ryu 5MP 后 dash 缓冲只有 4f 而非 7f（wiki 记为可能非预期） |
| **Drive Rush 冻结** | 冻结会 **推迟 buffer 窗口起点**；过早按会被「吃」感（EventHubs / Big Nasty Kail 分析） |
| **Screen freeze 缓冲** | Perfect Parry / 对方 Super 冻结时：**做完指令后按住键**可自动缓冲；**最近一次输入**优先；松键取消 |
| **DR 冻结特殊** | DR 冻结后要等角色 **开始绿光** 再按住键；冻结前按住无效 |

### 2.3 「预输入」在工程上的两层

| 层 | 含义 | SF6 对应 |
|----|------|----------|
| **Action buffer（行动缓冲）** | 在 recovery / stun 末尾若干帧记下「下一招意图」，自由时立刻执行 | §2.1 的 4f/7f |
| **Motion buffer（指令序列记忆）** | 方向历史保留一段时间供 special/super 匹配 | 间隙约 9f 级（Gelatin 22 例）+ 按键 |
| **Cancel 窗内消费** | 命中/取消窗内把 special 吃掉并打断当前招 | 与 hitstop 叠加，给 hitconfirm 时间 |

三者都要实现，**不能**只做一个环形 buffer 就当完成。

---

## 3. 动画 / 逻辑状态机与可打断性

### 3.1 架构事实（与本项目 R2 对齐）

- **规则权威是帧表与状态标志**，不是 3D 动画 clip 长度。  
- 动画是 **表现层** 跟随逻辑 `moveId + localFrame`；可取消时逻辑切状态，表现切 clip（可混合）。  
- SuperCombo / UFD 说明：列表中的 recovery 结束帧附近常已 **可行动（cancellable）**，视觉动画可能仍在收招。

### 3.2 通用状态族（逻辑层建议）

```
Neutral (stand / crouch / walk)
  → Attack (startup / active / recovery)
  → Hitstun / Blockstun / Knockdown / Wakeup
  → Jump (prejump → airborne → landing recovery)
  → Dash / Backdash
  → Throw (startup / active / resolve / tech)
  → Drive* (Parry / Impact / Rush / Reversal / Burnout interactions)
  → Special / Super / OD
```

### 3.3 「哪些动画可以打断」— 按 **规则类型** 而非按 clip 名

| 打断类型 | 条件（SF6 语义） | 可否打断当前动作 |
|----------|------------------|------------------|
| **Special / SA / DI / DR cancel** | 招表 `Cancel` 含 C / Sp / SA… **且** 当前帧在 cancel 窗 | 立刻进入新招 startup（多数；见下条例外） |
| **Target Combo / Chain** | 表列 TC / Chn；灯光链等 | 链到指定 follow-up |
| **Jump cancel** | 表列 Jmp（常仅 hit） | 进入 prejump |
| **Kara / 脚本边角** | 角色特殊（如空气 kara） | 非全角色通用；隆 MVP 可后置 |
| **不可 cancel 的 recovery** | 无 cancel 旗或已过窗 | **不能**被 special 打断；只能等恢复或被打 |
| **受击/防御硬直** | hitstun/blockstun | 通常 **不能**主动出招，仅 buffer 至结束；部分系统技例外（如 DR 规则、特定 invuln） |
| **Dash** | 全程易受伤；**前 dash 前 2f 可 cancel 进 Parry**（利于 DR） | 不能 cancel 进 block/tech（除上述） |
| **Prejump** | 4f（多数）；**可 special cancel**；**不可** DI/Parry | 地面受击；投无敌 |
| **Landing recovery** | 空跳 3f；空挥落地更严（PC 状态等） | 见 Movement 细则 |
| **部分招「指定 cancel 点」** | Gelatin：如 Marisa MP~MP **在 active 之后** 才有 cancel 点 | **cancel 窗按帧表 per-move**，禁止「active 一到就能全 cancel」 |

### 3.4 Cancel 字段（必须参考的动作表语义）

官方 / SuperCombo 图例（汇总）：

| 标记 | 含义 |
|------|------|
| **C** | 可 cancel 进 special、DI、DR、Super Art |
| **SA / SA2 / SA3** | 仅对应等级 Super |
| **Chn** | Light chain 等 |
| **TC** | Target Combo |
| **Sp** | Special |
| **Jmp** | Jump cancel |

**Hitconfirm window**（SuperCombo 角色页）：从 **首次接触帧** 到 **最后可 cancel 帧** 的反应窗（如多数 2MK ~13f，难 hitconfirm）。实现调试 HUD（H2）应能显示该窗。

### 3.5 Hitstop 与 cancel

- 命中时双方 **hitstop（hit freeze）**；越重越长。  
- **Special cancel 常在 hitstop 期间完成输入**（SF 系列经典；SF6 仍依赖此手感）。  
- 逻辑：hitstop 帧内 **时间停** 但 **输入与 cancel 判定仍应处理**（或按项目选择：逻辑时钟停、输入仍采样进 buffer）。

---

## 4. 碰撞体如何跟随动画

### 4.1 盒类型（SF6 实装 / 工具可见）

REFramework **Hitbox Viewer**（WistfulHopes/SF6Mods）可显示：

| 类型 | 典型用途 |
|------|----------|
| **Hitbox** | 攻击判定（红） |
| **Hurtbox** | 受击（绿）；可有 **仅空中可击** 等子类型（防 crouch jab 防空） |
| **Pushbox / Collision** | 角色互推、贴身站位 |
| **Throw box / Throw hurtbox** | 投技距离与被投体型（Ryu 等 relative range 表） |
| **Proximity guard box** | 近身防御姿态触发 |
| **Unique / Cyan** | 特殊交互（如某些 projectile clash 辅助） |
| **Combo-only hitbox** | **仅对已处于 strike 造成的 hitstun 的对手生效**（加长连段/空中，不加大中性） |

Broski 等视频 / FAT 截图：每 **逻辑帧** 盒集合不同；patch 会改单帧 hurt（如 Kim 5MK 脚 hurt 删除）。

### 4.2 跟随方式（对复刻工程的含义）

| 层级 | SF6 实际倾向 | 本项目应采用 |
|------|----------------|--------------|
| **权威判定** | 与 moveset **脚本/帧状态** 绑定的 **逐帧盒**（非纯 mesh 自动碰撞） | **本地 per-frame AABB 表**（ADR-002 中心坐标） |
| **表现蒙皮** | 3D 模型随动画；盒 **大致** 贴合肢体，但可 disjoint / 故意偏移 | 动画 **不** 驱动规则盒；最多用骨点 **辅助作者** 填表 |
| **站蹲切换** | 蹲 hurt **约第 5 帧** 才完全变矮；proximity guard 可 **跳过** 过渡 | 逻辑需 `stand↔crouch` 过渡帧与 proximity 规则 |
| **Active 多段** | 同一招不同 active 帧盒不同；可有 cancelable 仅第 1 active 等 | 盒数组 `boxes[frame]` + 标志 |

### 4.3 与「动画状态机」的边界

- **逻辑帧 `f`** → 查 `move.frames[f].hit[] / hurt[] / push`  
- **渲染** → `AnimationMixer` 播 clip，时间可对齐 `f/60`，允许视觉插值  
- **禁止**：用 Three.js 的 skinned mesh 自动生成对战 hitbox 作为权威

---

## 5. 其它必须注意的重点（易漏清单）

> 用户特别要求：不可能事先知道的重点。下列按 **对操控系统完整性** 影响排序。

### 5.1 高优先级（不做会「手感假」）

1. **Action buffer 分档**（4f 通用 / 7f dash·起身）与 **例外表**  
2. **Cancel 窗 per-move**（非 universal active cancel）  
3. **Hitstop 期间仍可录入 cancel**  
4. **同帧优先级**：strike > throw（SF6 与旧作不同）；trade 双方 CH  
5. **Facing / 左右翻转** 下方向与盒的镜像（ADR-002）  
6. **站/蹲 hurt 过渡 5f** + proximity guard  
7. **Prejump 4f**（投无敌、可 special cancel、地面受击）  
8. **Landing recovery 3f** 与空挥落地 PC / 不可 block  
9. **Throw**：5f startup / 3f active / whiff 约 30f；tech 窗约至第 9 帧；tech 输入锁定规则  
10. **CH +2f / PC +4f** 优势与伤害、Drive 削等（影响「出招是否值得」）  

### 5.2 中优先级（SF6 隆完整所需）

11. **Drive**：Parry / Perfect Parry（约 2f 窗）/ DI armor / DR cancel / OD / Burnout  
12. **DR 冻结与 buffer 相位**（训练场可先简化，但要登记为已知差异）  
13. **Projectile 优先级**：SA > OD > meterless；clash 减速规则  
14. **Juggle / knockdown / hard KD / back rise**  
15. **Guard 类型**：high / low / mid / cross-up；absolute guard 仅 true blockstring  
16. **Charge keep**（隆 Denjin 等非 charge 主体系，但系统要可扩展）  
17. **Negative edge**（设置项；影响 special 释放时机）  
18. **Pushbox 与 corner**：推挤、墙角、side switch  

### 5.3 低优先级 / 后置（不阻塞 MVP 操控骨架）

19. Modern 简化键  
20. 全角色相对投距表  
21. Kara cancel 边角、replay 末帧不显示输入等  
22. 训练模式 dummy「Crouch+Block」与真实 1+4 差异（文档注明即可）  

### 5.4 社区/X 侧「手感」信号（非规格，但影响验收）

- 大量帖认为 SF6 buffer「又松又怪」（尤其 motion 误读、DR 冻结）。  
- 复刻目标应是 **可配置贴近 wiki 数字**，并在 HUD 显示 buffer/cancel，便于作者对照原作，而不是先「主观手感调参」。

---

## 6. 必须参考的动作表 / 数据源

| 资源 | URL | 用途 |
|------|-----|------|
| SuperCombo SF6 首页导航 | https://wiki.supercombo.gg/w/Street_Fighter_6 | 系统总索引 |
| **Game Data** | https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data | 缓冲、hitstop、盒过渡、combo-only… |
| **Offense** | https://wiki.supercombo.gg/w/Street_Fighter_6/Offense | 普攻/特/投/CH/PC |
| **Defense** | https://wiki.supercombo.gg/w/Street_Fighter_6/Defense | 防、tech、起身、reversal 窗 |
| **Movement** | https://wiki.supercombo.gg/w/Street_Fighter_6/Movement | walk/dash/prejump/landing |
| **Gauges** | https://wiki.supercombo.gg/w/Street_Fighter_6/Gauges | Drive 全家桶 |
| **Ryu** / **Ryu/Data** | https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu · `/Ryu/Data` | 隆招 cancel、逐帧笔记 |
| **Ryu Combos** | https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu/Combos | cancel/link 记法 `>` `~` `,` |
| Capcom 官方 Ryu 帧表 | https://www.streetfighter.com/6/en-us/character/ryu/frame | Cancel 图例 C/SA… |
| Ultimate Frame Data | https://ultimateframedata.com/sf6/ · `/sf6/ryu` | 移动友好帧表 + 盒 GIF 生态 |
| SF6Mods Hitbox Viewer | https://github.com/WistfulHopes/SF6Mods | 盒类型事实、对照截帧 |
| MMDK | https://github.com/alphazolam/MMDK | moveset 研究（私人） |
| EventHubs DR buffer | https://www.eventhubs.com/news/2023/oct/13/discussing-sf6-most-frustrating-issue/ | 冻结与缓冲相位 |
| GelatinLab（X） | 如 cancel 点、22 间隙 9f、throw tech lockout | 边角语义 |
| 实现参考（非 SF6 数值） | critpoints motion inputs；Ikemen-GO wiki | 缓冲/状态机工程 |

### 6.1 动作表「字段」最低集（写入本地 JSON 前应对齐）

对每一招至少：

- `id`, `startup`, `active`, `recovery`（含 FAF 约定：startup **含** 第一 active）  
- `onHit`, `onBlock`, `damage`, `guard` (H/L/M)  
- `cancel`: flags + **逐帧或区间 cancel 窗**  
- `hitconfirmWindow`（可选，调试）  
- `boxes[]` per frame: hit / hurt / push / throw  
- `flags`: invuln 段、armor、airborne、throwInvuln、comboOnlyHit、forcesStand…  
- `drive`: DR cancel 延迟到第几 active 等（Ryu Data 多有笔记）

---

## 7. X 检索摘录（节点 2026-08）

| 方向 | 代表信号 |
|------|----------|
| Buffer 体感 | 多帖抱怨 SF6 buffer「垃圾/限制」；与 Tokon 对比时双方互骂 buffer |
| Cancel | 讨论 cancel window 长度（如 2MK 13f）；DR cancel 改动诉求 |
| Boxes | Patch 改单帧 hurt/hit（@MetalMusicMan_ 等）；@TsuguSpabobin 贴 patch 前后盒对比 |
| Lab | @GelatinLab：special cancel 点、DI 与 special cancel 优先级、motion 间隙、tech 锁定 |

完整帖 ID 见工具日志；**规格仍以 SuperCombo 为准**。

---

## 8. 调研结论（喂给共识）

1. **必须做预输入**：默认 4f 行动缓冲 + dash/wakeup 更宽档；motion 历史独立。  
2. **状态机是「逻辑招式状态 + cancel 表」**，不是纯动画图。  
3. **碰撞是逐帧数据表**，随 `move+frame` 变，不随 mesh。  
4. **易漏系统**（throw tech、prejump、landing、stand/crouch hurt、hitstop cancel、DR freeze）比「再做一个 walk 动画」更决定是否像 SF6。  
5. **动作表权威链**：SuperCombo Ryu/Data + 官方 cancel 图例 → 本地 JSON → 审查标记「已复刻」。

---

## 9. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-10 | 初版：计划 + 全通道检索 + 系统结论 |

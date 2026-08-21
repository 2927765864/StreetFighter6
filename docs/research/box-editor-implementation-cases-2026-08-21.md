# 框图编辑器 · 技术分析与案例检索报告

> **检索节点**：2026-08-21 **14:50 CST**（本机服务器时间）  
> **范围**：独立框图编辑页——时间线 + 动画逐帧同步 + 攻击/受击/推挤框编辑 + 原始/改动双文件层  
> **方法**：先对照共识分析实现所需能力 → 制定检索计划 → **Web/GitHub（重点）+ X Semantic + X Keyword（强制）** 执行  
> **性质**：调研快照与实现参考索引；**不是**共识、不是排期。  
> **关联共识**：`docs/character-control/consensus-box-editor-v0.md`  
> **上级**：`docs/consensus-v0.md` §0；框语义见 `consensus-design-v0.md` §4、ADR-001/002/003  

---

## 0. 先分析：共识要求什么技术与代码

### 0.1 产品边界（实现时不要跑偏）

| 要做（完整目标） | 不做 / 点名延后 |
|------------------|-----------------|
| 独立编辑页；侧面角色 + 时间线 | 嵌在对战 HUD 当主编辑区 |
| scrub / 播放 / 暂停 / 逐帧 / 循环 | 对手参照、试打验证 |
| 红绿黄框：拖位置/大小、改起止帧、新建删除改种类 | 飞行物框（延后） |
| 段内形状不变；逻辑帧权威 | 段内逐帧插值变形 |
| 原始只读 + 改动层优先；列表标记；单招/全局恢复；自动保存；撤销重做 | 交付时多角色切换 UI |
| 待机身体框 + 出招框同工具 | 自由 3D 建模式镜头 |

### 0.2 与本仓库落点

| 层 | 现状 | 编辑器要接的点 |
|----|------|----------------|
| 招表 JSON | `app/public/data/moves/ryu_*.json` 已有 `boxes.hurt/hit/push`，段字段 `from/to/x/y/w/h`（及 hurt 的 `part/layer`） | 读写几何与寿命；改动层不覆盖原始 |
| 姿态框 | 装配方案要求待机头/身/腿基座 | 编辑器「待机模式」需读/写姿态表 |
| 逻辑帧 | ADR-001 60 Hz；`MovePlayer` 取样 | scrub 必须跟逻辑 `localFrame`，不是墙钟秒 |
| 盒约定 | ADR-002 中心+全宽高；面向相对 | 拖拽换算与 DebugDraw 同一映射 |
| 画框 | `render/DebugDraw.ts`；combat **禁** Three | 编辑页 UI/预览可走 render/独立路由；运行时加载规则进 data 层 |
| 动画 | glb + clip 映射；训练场已有 scrub 雏形 | 编辑页复用/加强：播放头 ↔ mixer 时间 |
| 调试面板 | ControlPanel 数字改框 | **过渡**；不得替代独立编辑页共识目标 |

### 0.3 能力拆解（对应实现模块，非排期）

```text
[招式/待机选择器] ──► [原始 JSON 只读加载]
                           │
                           ▼
              [改动层 merge：有则覆盖 boxes 等]
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
 [预览：侧面角色]   [时间线色条]        [属性/数字面板]
  glb scrub          hit/hurt/push       x,y,w,h,from,to,type
  叠 Debug 框         拖改寿命区间        新建/删除
        │                  │                  │
        └────────► [编辑命令 + Undo 栈] ◄─────┘
                           │
                           ▼
              [自动写入改动文件] + [单招/全局恢复]
```

| 模块 | 关键点 |
|------|--------|
| 时间线 | 轨道按框实例；色条 = 存在区间；播放头驱动逻辑帧 |
| 画布交互 | 点选、拖心、拖边；面向镜像；与 ADR-002 一致 |
| 段语义 | 一段 = 常数矩形 + `[from,to]`；改形状不插值 |
| 双文件 | 原始永不写；运行时 resolve(override \|\| base)；标记已改招 |
| 撤销 | 命令模式或快照栈（框级操作） |

### 0.4 本轮要向外部案例学什么

| 问题 | 为何重要 |
|------|----------|
| 时间线 + 动画 + 框如何同屏 | 共识核心交互 |
| 框寿命是「逐帧键」还是「区间段」 | 我们定了段常数；对照谁用 hold/copy 上一帧 |
| 输出格式 | JSON 导出是否接近我们的 `boxes[]` |
| SF6 侧查看器 vs 编辑器 | 校对参照 vs 可写工具，勿混为一谈 |
| 开源编辑器可抄 UI，引擎内编辑器可抄工作流 | GitHub 重点；商业包只学交互文档 |

---

## 1. 搜索计划（先计划后执行）

### 1.1 假设

| ID | 假设 | 验证通道 |
|----|------|----------|
| H1 | **不存在**可直接 vendoring 的「Web + Three + SF6 隆表 + 剪辑式框图编辑」完整开源成品 | GitHub + Web |
| H2 | **存在**大量 **2D 精灵/逐帧** hitbox 编辑器（JSON 导出），可学拖框与帧 scrub | GitHub |
| H3 | **存在**格斗引擎内建编辑器（Castagne / UFE / Hitbox Studio 类），可学时间线与 gizmo | GitHub + Web + X |
| H4 | SF6 生态以 **只读 Hitbox Viewer + 录制站** 为主，**几乎无**合规开源「改官方框写回游戏」编辑器 | GitHub + X |
| H5 | 社区（X）会强调 **逐帧 advance**、框种类开关、视觉与 hurt 错位等 lab 议题 | X Semantic + Keyword |

### 1.2 检索矩阵（已执行）

| 通道 | 意图 | 查询 / 定向 |
|------|------|-------------|
| Web | 格斗向框编辑器 | `hitbox editor fighting game github timeline` |
| Web | 动画同步编辑 | `hurtbox hitbox editor animation scrub open source` |
| Web | 引擎编辑器 | `Sakuga-Engine` `Castagne` hitbox editor；UFE Custom Hitbox；Hitbox Studio Pro |
| Web | SF6 | `SF6 hitbox viewer WistfulHopes`；`sf6frames.com` |
| Web/GitHub | 精灵工具 | `collision box editor sprite`；`rafaelalmeidatk/hitbox`；`coelhucas/hitbox-editor` |
| **X Semantic** | 开源框编辑 + 时间线 | open source hitbox editor fighting game timeline animation scrub |
| **X Semantic** | SF6 工具链 | Street Fighter 6 hitbox viewer editor tools github |
| **X Semantic** | 引擎编辑器 | Castagne or Sakuga fighting engine hitbox editor gizmo |
| **X Semantic** | 独立角色编辑器 | indie fighting game character editor set hitboxes on animation frames |
| **X Keyword Latest** | SF6 viewer | `SF6 (hitbox OR hurtbox) (viewer OR editor OR mod) (github OR WistfulHopes OR MMDK)` |
| **X Keyword Latest** | Lab | `from:GelatinLab (hitbox OR hurtbox OR boxes)` |
| **X Keyword Latest** | Castagne | `Castagne (editor OR hitbox OR gizmo) (godot OR fighting)` |
| **X Keyword Latest** | 自制编辑器 | `("hitbox editor" OR "character editor") (fighting OR fighter) (timeline OR frames OR animation)` |
| **X Keyword Top** | 泛开源编辑器 | `("hitbox editor" OR "hurtbox editor" OR "collision editor") (github OR open-source OR godot)` |

### 1.3 收录标准

| 级 | 含义 |
|----|------|
| **A** | 开源可读；时间线/拖框/导出可直接对照实现 |
| **B** | 引擎内编辑器或高质量文档；学工作流与语义，不抄整仓 |
| **C** | SF6 只读查看 / 录制站；作校对与色/种类语义参照 |
| **D** | 社区舆情、自制片、非框编辑噪声；校准预期 |

---

## 2. 执行结果摘要

| 假设 | 结论（2026-08-21） |
|------|-------------------|
| H1 | **成立**。无现成「本仓形态」Web 框图剪辑器可整仓搬入。 |
| H2 | **成立**。`coelhucas/hitbox-editor`、`rafaelalmeidatk/hitbox`、`BakaBBQ/siki.lua`、`JSON-Fighter-Creator` 等可学。 |
| H3 | **成立**。Castagne Editor（逐帧 + gizmo）、UFE Custom Hitbox、Hitbox Studio Pro（时间线+拖框+跳帧 hold）交互价值高。 |
| H4 | **成立**。`WistfulHopes/SF6Mods` Hitbox Viewer、`sf6frames.com`、MMDK Research 窗均为 **查看/研究**；GGST 系有 **改包编辑器**（ArcSys 格式，非我们 JSON）。 |
| H5 | **成立**。X 上 GelatinLab 谈 combo-only、视觉与 hurt 错位；Castagne 作者晒 editor/gizmo；indie 晒自研角色编辑器设框。 |

**X 检索说明**：强制执行 Semantic（多条）与 Keyword（Latest/Top）。部分宽泛 Keyword（如仅 `hitbox editor github`）噪声大或空结果；定向 `WistfulHopes` / `GelatinLab` / `Castagne` / `character editor`+`hitboxes` 有效。

---

## 3. GitHub / 开源案例（重点）

### 3.1 A 级：可学编辑交互与数据形状

| 项目 | 链接 | 学什么 | 与我们的差距 |
|------|------|--------|--------------|
| **coelhucas/hitbox-editor** | https://github.com/coelhucas/hitbox-editor | Godot 向格斗/清版框编辑；矩形拖改；框类型（hit/hurt/…）；**跨帧导入形状**；JSON 存盘 | 2D 精灵/TSCN；无 3D glb；非 SF6 表 |
| **rafaelalmeidatk/hitbox** | https://github.com/rafaelalmeidatk/hitbox | 精灵表动画 + 碰撞体；实时预览；计划/部分支持缩放矩形、复制框、Undo、快捷键 | Web/Yarn；逐精灵帧，非逻辑招表 `from/to` 段 |
| **BakaBBQ/siki.lua** | https://github.com/BakaBBQ/siki.lua | Love2D；红/绿/白（撞）三分法；导出 `frames.json` | 个人向；2D |
| **JargonicOnomatopoeia/JSON-Fighter-Creator** | https://github.com/JargonicOnomatopoeia/JSON-Fighter-Creator | 浏览器：多图成动画；拖移/拖边；onion skin；导出 JSON | 轻量；无完整 NLE 色条轨 |
| **MrcSnm/HitboxEditor** | https://github.com/MrcSnm/HitboxEditor | Java；hit/hurt/锚点；**Ctrl+Z / Ctrl+Shift+Z**；JSON | 星少、偏旧，可作撤销先例 |
| **redstonedash/HitBoxEditor** | https://github.com/redstonedash/HitBoxEditor | Unity：招式 hitbox 定义 + 编辑器内动画 | 体量小；Unity 绑定 |
| **Draym/SpriteBodyEditor** | https://github.com/Draym/SpriteBodyEditor | 攻/防/挡类型；复制粘贴；矩形/圆；JSON | 精灵工具 |

### 3.2 B 级：引擎内编辑器 / 商业文档（学工作流）

| 项目 | 链接 | 学什么 |
|------|------|--------|
| **Castagne**（Godot 格斗框架） | https://github.com/panthavma/castagne · https://castagneengine.com/ · 文档编辑器：https://castagneengine.com/docs/editor/ | 角色编辑器；**逐帧检查**；函数 **gizmo**；脚本里 `F6-8: Hitbox(...)` 式帧区间（与我们的段语义接近） |
| **Sakuga-Engine** | https://github.com/NoisyChain/Sakuga-Engine | 表驱动格斗；含投射物等；**内建专用框图编辑器弱于 Castagne**，作引擎对照 |
| **UFE Custom Hitbox Editor** | https://www.ufe3d.com/doku.php/hitbox:start | 动画预览 + 加框；形状/碰撞类型；**按帧激活区间**；黄推挤/绿受击等色语义 |
| **Hitbox Studio Pro**（Unity 资产，文档） | https://blackgarden.studio/hitbox-studio-pro-1-2-0-user-guide/ | **时间线**看每帧框与事件；拖拽建框；改类型；**中键跳过更新=沿用上一帧框**（段常数的一种 UX）；复制邻帧 |
| **Fighter Factory**（MUGEN 生态） | https://virtualltek.com/fighter-factory/ | 动画单元上画 CLSN；社区教程强调复制碰撞到同图元；经典「蓝受击/红攻击」 |

### 3.3 C 级：SF6 查看 / 研究（非写回编辑器）

| 项目 | 链接 | 学什么 |
|------|------|--------|
| **WistfulHopes/SF6Mods** Hitbox Viewer | https://github.com/WistfulHopes/SF6Mods · Releases（hitboxes-1.2 等） · `disp_hitboxes.lua` | 运行时叠 hit/hurt/push/throw/…；分 P1/P2 开关；属性（combo-only、部位无敌等）——**校对色与种类**，不是我们的写盘工具 |
| **alphazolam/MMDK** | https://github.com/alphazolam/MMDK | Moveset 字典；Research 窗跳帧；与 Viewer 联用；JSON rects/HIT_DT——**我们转换源**，勿当编辑器 UI |
| **sf6frames.com** | https://sf6frames.com/ · 例：https://sf6frames.com/ryu | 逐帧录制动画站；键盘翻帧；色义说明；数据来自 Viewer 模组——**肉眼对齐参照** |
| **jaes1237712/fgcNote_GameScene** | https://github.com/jaes1237712/fgcNote_GameScene | 基于 Viewer 截帧 → 抠图/JSON——管线研究，非交互编辑器 |

### 3.4 ArcSys 碰撞编辑器（格式不同，交互可参考）

| 项目 | 链接 | 备注 |
|------|------|------|
| **ggst-collision-editor**（归档） | https://github.com/WistfulHopes/ggst-collision-editor | 早期 GUI；多只能改已有框 |
| **ggst_collision_editor_rs** | https://github.com/WistfulHopes/ggst_collision_editor_rs | Rust+egui；增删框、存 PAC；Xrd/DBFZ/GGST——**写回游戏包**，路径与我们「JSON 双层」不同 |

### 3.5 噪声 / 排除（避免误收）

| 名称 | 原因 |
|------|------|
| Hitboard / Flatbox 等 | **实体摇杆布局**硬件，不是判定框编辑器 |
| valignatev/hitboxer | SOCD/键盘映射工具 |
| hitbox.io Editor | 另一款游戏的地图编辑器 |
| tastyep/hitboxbuilder-2d | 从精灵自动生成凸包，非时间线手调格斗框 |

---

## 4. X（社区）检索摘录

### 4.1 Semantic 命中（与编辑器/查看器相关）

| 账号 / 帖 | 要点 | 级 |
|-----------|------|-----|
| @WistfulHopes（Strive 模型+框查看脚本；后有 SF6 Viewer） | 框编辑器衍生 **模型+框+帧数据查看**；生态从「改包编辑」到「游戏内查看」 | C/D |
| @Resistance204X | 自研格斗 **角色编辑器**，在冲刺动画上设 hitbox（视频演示工作流） | D→学 UX |
| @jugeeya（Smash Ultimate Training Modpack） | hitbox **终止帧**正确与否；强调 **frame advance** 查看 | D |
| @panthavma（Castagne） | v0.5 角色编辑器发布；**逐帧检查**；函数 gizmo；修 jank hitbox | B 传播 |

### 4.2 Keyword 命中

| 查询焦点 | 要点 |
|----------|------|
| SF6 + WistfulHopes | Viewer 仍为社区录制/lab 上游；@SF6frames 公开承认基于该 mod |
| from:GelatinLab | combo-only 双框、视觉 mesh 伸出 hurt、督促更新 Viewer——**框语义边角**对本仓装配有校准价值 |
| Castagne editor | 开源编辑器发布推文；逐帧 + gizmo 演示链 |
| character editor + hitboxes | indie 自研编辑器设框（同上 Resistance204X） |

### 4.3 社区对实现的启示（非规格）

1. **逐帧前进**是校对框寿命的刚需（Smash / SF6 / Castagne 一致）。  
2. SF6 **没有**流行的「开源写回官方 moveset 的框图剪辑器」；写盘工具多在 **自制引擎或其它游戏格式**。  
3. 视觉与 hurt **故意不一致**在官作存在——我们编辑器是为 **自用复刻贴合**，不是复刻官方「欺骗性」表现。  
4. 框种类开关（分类型显示）在 Viewer 1.2 被强化——编辑器时间线应按类型滤轨。

---

## 5. 对照共识的可借鉴点 / 勿照搬点

| 共识项 | 建议借鉴 | 勿照搬 |
|--------|----------|--------|
| 时间线 + 同步 | Hitbox Studio 时间线；Castagne 逐帧；sf6frames 键盘翻帧 | 把录制站当可写权威 |
| 段内形状不变 | Studio「中键沿用上一帧」；Castagne `F6-8` 区间；我们 JSON 已是 `from/to` | 精灵工具默认「每 cel 一键」除非拆段 |
| 拖框 + 数字 | coelhucas / rafael / UFE / Studio | Unity 专用序列化格式 |
| 新建删除改种类 | 多数 A/B 级编辑器 | GGST PAC 工作流 |
| 双文件恢复 | 开源少见「override 层」——需自研；可参考「Reset to default」（itch Minamotion 工具）的产品语义 | 直接改 `private/mmdk` |
| 3D 角色侧面 | 本仓 DebugDraw + glb scrub；Strive 模型查看脚本证明「3D 模型+2D 框」可行 | 自由轨道摄像机编辑 |
| 飞行物延后 | Sakuga/Castagne 有投射物模块可作日后索引 | 现在扩范围 |

---

## 6. 对本仓实现的具体建议（调研结论，非排期）

1. **数据模型保持现有段结构**（`from/to` + 常数 `x,y,w,h`），UI 时间线条直接映射段，避免先做成「每逻辑帧一个键」再压缩。  
2. **播放头只驱动逻辑帧**，再映射到 AnimationMixer；与训练场同一套索引（ADR-003）。  
3. **改动层**：优先考虑「同结构整招 override 文件 + 清单标记」（共识 §4.2 A），实现简单、恢复=删文件；补丁合并（B）可作后优化。  
4. **交互优先级对标**：Studio/ Castagne 的「选帧 → 画布拖框 → 属性改寿命」；Undo 用命令栈。  
5. **校对**：人工对齐时可开 sf6frames / 本地 Viewer 录屏作参考，**不**把模组 Lua 链进 Web 运行时。  
6. **禁止**把 ControlPanel 数字条扩成「已完成框图编辑器」。

---

## 7. 主要链接速查

### GitHub（编辑 / 引擎）

- https://github.com/coelhucas/hitbox-editor  
- https://github.com/rafaelalmeidatk/hitbox  
- https://github.com/BakaBBQ/siki.lua  
- https://github.com/JargonicOnomatopoeia/JSON-Fighter-Creator  
- https://github.com/MrcSnm/HitboxEditor  
- https://github.com/redstonedash/HitBoxEditor  
- https://github.com/panthavma/castagne  
- https://github.com/NoisyChain/Sakuga-Engine  
- https://github.com/WistfulHopes/SF6Mods  
- https://github.com/WistfulHopes/ggst_collision_editor_rs  
- https://github.com/alphazolam/MMDK  
- https://github.com/jaes1237712/fgcNote_GameScene  

### Web / 文档

- https://castagneengine.com/  
- https://castagneengine.com/docs/editor/  
- https://www.ufe3d.com/doku.php/hitbox:start  
- https://blackgarden.studio/hitbox-studio-pro-1-2-0-user-guide/  
- https://sf6frames.com/  
- https://sf6frames.com/ryu  
- https://virtualltek.com/fighter-factory/  

### X（检索锚点账号）

- @WistfulHopes · @GelatinLab · @panthavma · @SF6frames · @Resistance204X · @jugeeya  

---

## 8. 修订记录

| 日期 | 内容 |
|------|------|
| 2026-08-21 | 初版：共识落地后分析 → 计划 → Web/GitHub + X Semantic/Keyword 执行 → 案例分级与落点建议 |

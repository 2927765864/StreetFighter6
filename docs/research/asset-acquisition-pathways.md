# 原版角色模型与动作：获取途径调研

> 日期：2026-08-06  
> 共识前提：私人学习研究、不公开；**模型与动作尽可能原版，所缺通过自己解包获取**。  
> 本文回答：要拿到「能进研究管线的角色 mesh + 动画」，有哪些途径、分层、依赖与缺口。  
> 详细工具表见：`sf6-extract-pipeline.md`。社区现成包对比见：`community-assets-and-cases.md`。

---

## 1. 目标产物定义（我们到底要什么）

进入 WebGPU + Three 训练场之前，中间产物建议定为：

| 产物 | 格式建议 | 最低验收 |
|------|----------|----------|
| 角色网格 + 蒙皮骨骼 | glTF 2.0（`.glb`） | 绑骨正确，T-pose/A-pose 可站立 |
| 贴图（可选分阶段） | 已烘焙进 glTF 或独立 png/ktx2 | 主漫反射可辨认即可 |
| 动画片段 | 同 glTF 内 clips 或独立 glTF | 至少：`idle`、一条攻击、`hitstun` 或 `block` 之一 |
| 元数据（自建） | JSON | clip 名 ↔ 逻辑状态、帧长、可选 root 位移说明 |

**非目标（第一阶段）：** 完整 moveset 状态机、布料/chain 物理、RE 原材质 1:1、表情面部全部。

---

## 2. 途径总览

```text
正版 SF6 安装目录
        │
        ▼
 ┌──────────────┐
 │ 途径 0：不提取 │  仅录像/截帧学节奏（动作不进引擎）
 └──────────────┘
        │
        ▼
 ┌──────────────────────────────────┐
 │ 途径 1：按需/全量解包 PAK         │  ← 所有原版文件的总闸门
 └──────────────────────────────────┘
        │
        ├───────────────┬────────────────────┐
        ▼               ▼                    ▼
  途径 2A 模型      途径 2B 动画         途径 2C 配置/数据
  mesh/mdf/tex      mot / motlist        user/pfb 等（引用关系）
        │               │                    │
        └───────┬───────┘                    │
                ▼                            │
         途径 3：DCC 汇合                     │
         Blender / Noesis                    │
                │                            │
                ▼                            ▼
         途径 4：导出 glTF          途径 5：逻辑层仍用
         → Three/WebGPU            自研帧表 +（可选）游戏内脚本研究
```

| 途径 | 内容 | 成熟度 | 是否主路径 |
|------|------|--------|------------|
| **1 解包** | PAK → `natives/...` 文件树 | 高 | **是（总闸门）** |
| **2A 模型** | mesh + 骨骼 + 材质/贴图 → Blender | 高 | **是** |
| **2B 动画** | motlist 绑到骨骼 → 可 scrub / 导出 | 中 | **是** |
| **2C 配置** | 招式/状态与资源 ID 映射 | 中低 | 辅助（找文件用） |
| **3 DCC** | 清理轴向、缩放、合并 clip | 中 | **是** |
| **4 运行时** | glTF → Three | 高（通用） | **是** |
| **5 游戏内** | REFramework / MMDK 看数据 | 高（模组向） | 辅助研究，**不替代** 导出资产 |
| 社区下载 port | Open3DLab 等 | 模型中、动画差 | **否**（共识已排除作主来源） |

---

## 3. 途径 1 — 解包（拿到原版文件）

### 3.1 输入 / 输出

- **输入**：已安装的 SF6（Steam 等），目录中的 `re_chunk_000.pak` 及 patch/DLC pak。  
- **输出**：解压后的游戏资源树，常见根类似 `natives/STM/...`。

### 3.2 可选工具（并列，不互相排斥）

| 方案 | 工具 | 特点 |
|------|------|------|
| **1a 经典批处理** | **REtool**（FluffyQuack）+ 社区 **文件名 list** | 教程最多；需维护/更新 list；可整包或按 list 抽 |
| **1b 开源 PAK** | **REE.PAK.Tool**（Ekey）等 | 有 SF6 相关工程配置；偏工具向 |
| **1c Blender 内按需** | **RE Asset Library** | 设好 exe 路径后，资源浏览器拖拽即提取；适合 **单角色、少文件**；插件已 archive 停更但历史可用 |

### 3.3 策略建议

- **优先按需提取**（单角色 mesh + 相关 mot + 贴图），避免整盘解包占满磁盘。  
- 大版本补丁后：list/魔数可能失效 → 重下 list 或换工具版本。  
- **平台**：Windows 工具链文档最全；macOS 上常见做法是 Win 虚拟机解包，再只拷 glTF 回开发机。

### 3.4 角色文件大致落点（方向性，非保证路径）

- 模型侧常见讨论形态：`product/model/esf/esfXXX/...`（`esf` + 角色编号）。  
- 精确路径以 **本机 list / Asset Library 标签 / 解包后搜索** 为准；编号随角色与服装变化。

---

## 4. 途径 2A — 模型（mesh / 骨骼 / 贴图）

### 4.1 原版格式（RE Engine）

| 类型 | 常见形态 | 作用 |
|------|----------|------|
| Mesh | `.mesh`（扩展名常带版本数字） | 几何 + 蒙皮 |
| 材质 | `.mdf2` | 贴图绑定、材质参数 |
| 贴图 | `.tex` → 需转 DDS/PNG | 颜色/法线等 |
| 骨架辅助 | `.fbxskel` 等 | 比例/骨架数据（部分流程） |

### 4.2 导入 Blender 的主路径

| 方案 | 工具 | 能力 |
|------|------|------|
| **2A-a 推荐研究路径** | **RE-Mesh-Editor**（+ 可选 RE Asset Library） | 原生导入 mesh/mdf；SF6 在支持列表；streaming mesh 等有过修复 |
| **2A-b 传统路径** | **Noesis** + **fmt_RE_MESH** 插件 | mesh/tex；与动画预览同一工具链，利于 2B |

### 4.3 产出检查清单

- [ ] 身体/服装部件齐全（或接受研究用简化部件）  
- [ ] 顶点组/骨骼权重可动  
- [ ] 主贴图路径可解析（红材质 = 常缺 tex）  
- [ ] 单位：记下 Blender 单位与之后 glTF 缩放约定  

### 4.4 已知限制

- 插件作者停更 → 新补丁可能短暂不可用。  
- 布料/chain、部分材质在 Blender 仅为近似。  
- 多服装 = 多 mesh 集，第一角色建议 **只取默认 Cos**。

---

## 5. 途径 2B — 动作（核心难点）

### 5.1 原版格式

| 类型 | 说明 |
|------|------|
| **`.mot`** | 单段或底层动作数据 |
| **`.motlist`** | 动作列表/容器（研究与 mod 中最常提到） |
| 运行时混合 | 游戏内可能叠加多层、cancel 过渡；**导出后往往是「片段」而非完整 AI 状态机** |

### 5.2 可行获取路径

| 方案 | 工具 / 资料 | 输出能力 |
|------|-------------|----------|
| **2B-a 主路径** | **Noesis + fmt_RE_MESH**：先加载角色 mesh，再 **Select Animation** 挂 motlist | 预览绑骨动画；再导出到 DCC/通用格式（视 Noesis 版本与插件） |
| **2B-b 教程路径** | 社区视频 *How to Extract Animations from Street Fighter 6 for Blender*（REtool + Noesis 系） | 证明 SF6 动画进 Blender **已被验证** |
| **2B-c 注入向工具** | 3ds Max **Motlist** 类脚本 | 主业是 **把动画打回游戏做 mod**；导出研究为次 |
| **2B-d 非完整** | 仅 RE-Mesh-Editor | **不能**当作完整动画方案 |

### 5.3 「找到某一招对应文件」的途径

原版不会在文件名里写「Hadoken」给玩家看。映射手段：

1. **路径与命名规律** + Asset Library 的人工标签  
2. **游戏内对照**：训练模式播招 → 在资源中试播接近长度的 clip  
3. **数据侧辅助（途径 5）**：MMDK / REFramework 脚本理解 moveset 结构，辅助定位（仍不等于自动导出 glTF）  
4. **公开帧数据**：只提供 **帧数与判定**，不提供文件路径；用于验收「clip 是否等长」

### 5.4 第一批建议抽取的 clip 集合

| 优先级 | Clip 意图 | 用途 |
|--------|-----------|------|
| P0 | idle / 站立循环 | 训练场默认 |
| P0 | 一条轻攻击（站立） | 「严格对齐一招」实验 |
| P1 | walk 前/后 或 单方向 | 移动表现 |
| P1 | 受击或格挡 | 反馈 |
| P2 | 中/重、特殊技占位 | 扩展 |

### 5.5 动画进 Web 前必须处理的问题

- **帧率**：逻辑 60f 与动画采样是否一致  
- **Root motion**：导出位移 vs 逻辑脚本位移，二选一为主、另一作校验  
- **Cancel/混合**：原版丝滑过渡不会自动出现；demo 可硬切 clip  
- **与帧表对齐**：用 Blender/自研 scrubber 并排公开帧数据，允许 ±1 帧误差记录在案  

---

## 6. 途径 3–4 — DCC 到 Three.js

```text
Blender 场景（mesh + 动画 Action/NLA）
    → 导出 glTF 2.0（embed 或分 clip）
    → 私有目录 private/runtime/*.glb（gitignore）
    → Three.js GLTFLoader + AnimationMixer
    → WebGPURenderer 呈现
```

| 步骤 | 注意 |
|------|------|
| 轴向 | RE → Blender → glTF → Three 只统一一次（文档写死 scale/up） |
| 骨骼名 | 导出前后勿随意改名，否则 clip 丢轨 |
| 材质 | 研究阶段 Principled 简化即可，不追求 RE 光照 |
| 体量 | 先低 LOD 或减面可选；优先跑通再优化 |

---

## 7. 途径 5 — 游戏内研究（辅助，不替代解包）

| 工具 | 用途 | 与「原版素材进 demo」的关系 |
|------|------|------------------------------|
| **REFramework** | 脚本、调试、mod 加载 | 不直接产出 glTF |
| **MMDK** | moveset 字典与 Lua 修改研究 | 理解招式数据结构；**资产仍要解包导出** |
| **SF6Mods** 等脚本 | 如信息显示 | 训练模式研究手感 |

适合：**搞懂「游戏如何组织招式」**；不适合：当作 Three 的资源管线。

---

## 8. 推荐组合路径（共识下的默认）

**「原版模型 + 原版动作 → 私人 demo」最小闭环：**

| 阶段 | 选用途径 | 成功标准 |
|------|----------|----------|
| 1 | 正版安装 + **1c 或 1a** 解包/按需提取 | 磁盘上有目标角色 mesh/tex/motlist |
| 2 | **2A-a 或 2A-b** 进 Blender | 角色可绑骨站立 |
| 3 | **2B-a** 挂一条 idle + 一条攻击 | Blender 时间轴可播 |
| 4 | 途径 3–4 导出 glTF | 本地页 Three 能播同一条攻击 |
| 5 | 自研帧表对齐该攻击 | 逻辑 active 帧与动画 hit 观感可对上 |

**环境备选：**

- 开发在 Mac、工具在 Win VM：阶段 1–3 在 VM，只同步 `private/*.glb` + 笔记。  
- 插件失效：回退 Noesis 系或等待社区 fork；逻辑层训练场不阻塞（胶囊占位）。

---

## 9. 仓库与目录约定（工程红线）

```text
StreetFighter6/
  docs/                    # 可提交：共识与调研
  src/                     # 可提交：代码
  private/                 # 不可提交
    sf6-raw/               # 可选：解包原文件（体积大，可仅放外置盘）
    blender/               # 工作 .blend
    runtime/               # 最终 .glb 与贴图
  .gitignore               # 忽略 private/ 与所有 *.mesh *.mot *.pak *.glb 若放错位置
```

- iCloud 同步私有二进制：自行评估；**不要**推送到任何公开 Git 托管。  
- 文档中可写角色代号与 clip 名，**不要**附带资产本体。

---

## 10. 风险与缺口（调研诚实清单）

| 风险 | 影响 | 缓解 |
|------|------|------|
| 游戏更新改格式 | 导入失败 | 锁定研究用游戏版本；关注 list/插件更新 |
| 工具停更（NSACloud archive） | 2A/1c 变难 | 保留 Noesis 回退；fork 社区版 |
| 招式文件难映射 | 找不到「那一招」 | 先做 idle+任意攻击闭环；再用帧长+训练模式对照 |
| 动画 ≠ 完整 moveset | 手感缺 cancel | 逻辑层自做 cancel；动画硬切 |
| 法律/EULA | 私人仍灰 | 不传播、不公开、不商业 |
| macOS 原生工具弱 | 流程多一跳 | Win VM 或双系统 |

---

## 11. 调研结论

1. **原版模型**：途径清晰且成熟（解包 + RE-Mesh-Editor / Noesis → Blender）。  
2. **原版动作**：途径存在（motlist + Noesis 主路径），成熟度低于模型，需要「找文件 + 导出 + 对齐」人工成本。  
3. **到 Three/WebGPU**：无官方直通；**glTF 是约定运行时格式**。  
4. **与共识一致的默认方案**：途径 **1 → 2A → 2B → 3 → 4**；途径 5 仅辅助理解；社区 port **不作为**动作来源。  
5. **可交付的下一实践节点**（待你确认环境后）：跑通「单角色 idle + 一招攻击」的 private glTF，而不是一次抽全角色全招式。

---

## 12. 参考索引

- 解包与工具细节：`docs/research/sf6-extract-pipeline.md`  
- 社区现成为何不够：`docs/research/community-assets-and-cases.md`  
- 工具主页（调研时点）：  
  - https://github.com/NSACloud/RE-Mesh-Editor  
  - https://github.com/NSACloud/RE-Asset-Library  
  - https://github.com/Ekey/REE.PAK.Tool  
  - https://github.com/alphazolam/fmt_RE_MESH-Noesis-Plugin  
  - https://www.fluffyquack.com/（REtool / Mod Manager）  
  - https://github.com/alphazolam/MMDK（moveset 研究辅助）  
  - https://github.com/praydog/REFramework  

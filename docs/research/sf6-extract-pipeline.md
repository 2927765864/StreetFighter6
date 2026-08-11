# SF6 模型 / 动作提取途径调研

> 日期：2026-08-06  
> 前提：项目**仅私人学习研究、不公开**；用户倾向官方提取为最优表现路径。  
> 结论摘要：**模型提取成熟；动作提取可行但链路更绕；进 Three/WebGPU 还需中间格式转换。**

---

## 0. 边界说明（研究笔记，非法律意见）

- 下列工具均为 **RE Engine 模组社区**公开生态，设计意图主要是 **mod 制作**（改模、换皮），顺带支持把资源导入 Blender 研究。  
- 资产版权仍属 Capcom。不公开分发可降低风险暴露面，**不等于**「私人一定合法」；EULA 通常仍限制逆向/提取。  
- 本笔记只记录**是否存在途径、工具名、能力分层**，不逐步复现破解或绕过反作弊。  
- 前提条件：你必须 **合法拥有并安装** Street Fighter 6（Steam 等）。工具本身不附带游戏资产。

---

## 1. 总结论

| 目标 | 是否有公开途径 | 成熟度 | 备注 |
|------|----------------|--------|------|
| 解包游戏文件（PAK → natives） | **有** | 高 | REtool / REE.PAK / RE Asset Library 内置提取 |
| 角色 **Mesh + 骨骼 + 贴图** → Blender | **有** | 高 | RE-Mesh-Editor；RE Asset Library 可浏览拖拽 |
| 角色 **动画（mot / motlist）** → Blender / 通用格式 | **有** | 中 | 经典路径多走 **Noesis + RE Mesh 插件**；有专门教程面向 SF6 |
| 直接「一键到 Three.js glTF」 | **无官方** | — | 需 Blender/Noesis 导出 glTF/FBX |
| 运行时完整复现 RE 材质/布料/表情 | **部分** | 低–中 | 进 Web 会丢引擎特有效果 |

**对私人研究 demo：路径存在，且社区已验证「能拿到模型和动作进 Blender」。**  
难点不在「有没有工具」，而在 **动画格式转换稳定性、与帧逻辑对齐、Web 材质简化**。

---

## 2. 工具地图

### 2.1 解包层（PAK）

| 工具 | 作用 | 链接/来源 |
|------|------|-----------|
| **REtool** (FluffyQuack) | 解/打 PAK、部分格式转换 | fluffyquack.com/tools；模组教程常用 |
| **REE.PAK.Tool** (Ekey) | RE Engine PAK 解包/重打；含 SF6 项目配置 | github.com/Ekey/REE.PAK.Tool |
| **RE Asset Library**（Blender 插件） | 在 Blender 内按资源库 **按需提取**；也可 Extract Game Files | github.com/NSACloud/RE-Asset-Library |
| 文件列表 `.list` | 解包时需要「路径名列表」才能还原文件名 | 社区维护的 SF6 list（教程/MediaFire 等分发，版本会过时） |

**游戏侧常见结构**

- 安装目录下 `re_chunk_000.pak` 及 patch/DLC 相关 pak。  
- 解包后典型前缀：`natives/STM/...`（STM = Steam 等平台约定，随游戏略有差异）。  
- 角色资源路径常带角色 ID（社区讨论中出现类似 `product/model/esf/esf013/...` 一类结构；具体 ID 随版本与角色变化，需在资源库或 list 中搜）。

**空间提示**：完整解包体积很大；研究单角色应 **只提取模型相关 + 动画相关**，不要无脑全解。

### 2.2 模型层（Mesh / 材质 / 贴图）

| 工具 | 作用 | SF6 支持 |
|------|------|----------|
| **RE-Mesh-Editor** | Blender 原生导入/导出 `.mesh`、`.mdf2`、贴图转换；支持 `.fbxskel` | README 明确列出 **Street Fighter 6**；含 streaming mesh 等修复记录 |
| **RE Asset Library** | Asset Browser 按名浏览，拖入即可触发提取+导入 | 依赖 RE Mesh Editor；**不自带游戏资产**，需本机安装游戏 |
| **fmt_RE_MESH Noesis 插件** (AlphaZomega 等) | Noesis 中读 RE mesh/tex，并可挂 **motlist 动画** | 插件内有 SF6 扩展名/版本表（mesh/tex 魔数会随游戏更新变） |

**能力判断：模型途径成熟。**  
2026 年 NSACloud 系列插件在 README 中宣布 **停止继续开发** 并 archive，但 **历史版本仍可用**；大版本更新后可能需要社区 fork 或改魔数。长期私人项目需接受「补丁日工具可能坏」。

### 2.3 动画层（Motion）

RE Engine 格斗/动作多用：

- **`.mot` / `.motlist`**（动作列表/片段容器，版本后缀数字会变）  
- 与角色/状态机配置相关的 **user / pfb** 等（逻辑与资源引用，不一定等于可直接播放的 clip）

| 途径 | 说明 |
|------|------|
| **Noesis + fmt_RE_MESH** | 加载 mesh 后用 **Select Animation** 选 motlist，预览绑骨；再导出到 FBX 等（视 Noesis 版本） |
| **YouTube：How to Extract Animations from Street Fighter 6 for Blender** | 社区有面向 SF6 的动画提取教程（REtool 解包 + Noesis 流程） |
| **3ds Max Motlist 工具** | 更偏 **往游戏里注入** 自定义动画做 mod；导出研究次之 |
| **RE-Mesh-Editor** | 以 mesh/mdf 为主；issue 中有用户问 motlist 导入（其他 RE 游戏），**不能当作完整动画解决方案** |

**能力判断：动画「能拿」但比模型碎。**  
常见成功形态是：**Blender 里看到角色播某一招/待机**，而不是开箱即用的「全 moveset 状态机」。

招式与文件名映射往往需要：

- 资源路径/命名规律 + 社区标签库（Asset Library 的 name/tags）  
- 或在训练模式对照试播  

### 2.4 辅助生态

| 工具 | 作用 |
|------|------|
| **Fluffy Mod Manager** | 装 mod、管理 patch pak；提取研究时非必须，但生态中心 |
| **RE Framework** | 游戏内 hook/调试（mod 依赖）；提取静态资产不是主路径 |
| **RE Engine Modding Discord / Wiki** | Haven's Night、MH 模组 Discord 等排错与版本情报 |

---

## 3. 推荐研究管线（概念顺序，非逐步操作手册）

```text
合法安装 SF6
    ↓
解包 / 按需提取 PAK（REtool 或 RE Asset Library）
    ↓
┌───────────────────┬────────────────────────────┐
│ 模型               │ 动画                         │
│ RE-Mesh-Editor     │ Noesis + RE Mesh 插件        │
│ 或 Asset Library   │ 绑定到已导入骨骼               │
│ 导入 Blender       │  scrub 验证                   │
└─────────┬─────────┴─────────────┬──────────────┘
          ↓                       ↓
     清理材质/缩放/轴向      导出 FBX/glTF 动画片段
          └───────────┬───────────┘
                      ↓
              Blender 统一场景 → glTF 2.0
                      ↓
              Three.js + WebGPU 加载（私人本地）
                      ↓
              逻辑层仍用自有帧表；动画仅作表现与对齐
```

**与 Web demo 的衔接点**

1. **单位与轴向**：RE → Blender → glTF → Three 连续转换，应用 `scale`/`up` 一次钉死。  
2. **骨骼命名**：保持与导出 clip 一致，避免重定向丢曲线。  
3. **只抽研究用子集**：例如 1 角色 Cos1 + idle/walk + 1～3 攻击 + 1 受击。  
4. **逻辑不读动画当唯一时钟**（可选双轨：动画 duration 对齐帧表）。

---

## 4. 可行性与坑（私人研究视角）

### 4.1 会坏掉的东西

- 游戏大更新 → mesh/tex **扩展名魔数**变化（SF6 历史上已有贴图扩展变更）  
- 插件作者停更 → 需 fork 或回退游戏版本（一般不推荐为研究去锁旧版）  
- **Streaming mesh**、分块资源路径错误 → 导入缺部件  
- 表情/布料/chain 物理 → Blender 里常不完整，Web 中更要砍  

### 4.2 动画侧特有坑

- 一条「招式」可能是多 mot 混合 / 取消过渡，不是单一 clip  
- Root motion vs 脚本位移：导出后位移可能与训练模式手感不一致  
- 帧数据（社区 wiki）与动画 **采样率/整数帧** 可能差 1 帧，需手调  

### 4.3 硬件与系统

- 主流工具链文档以 **Windows + Steam 版** 最完整  
- macOS：REtool/Noesis 可能需 Wine/虚拟机；Blender 插件在 Linux/Mac 有过路径修复记录但不保证 SF6 全流程  
- 用户环境若是 Mac，需单独评估「解包是否在虚拟机、仅 glTF 回拷到本机」

---

## 5. 与本项目共识的对齐

| 共识项 | 提取路径下的建议 |
|--------|------------------|
| 不公开 | 提取物放 `private/sf6-ref/`（gitignore），永不推远程 |
| 单角色够用 | 只提取一个 `esf***` 角色目录 + 相关 motlist |
| 严格复刻一招 | 动画 clip 时长与公开帧表并排 scrub；逻辑层仍独立 JSON |
| 训练场优先 | 可先 **仅 mesh T-pose + 一招动画**，框体仍 debug 绘制 |
| WebGPU/Three | 不把 `.mesh` 当运行时格式；**只认 glTF** |

---

## 6. 入门资源索引（便于你自行深挖）

- RE-Mesh-Editor: https://github.com/NSACloud/RE-Mesh-Editor  
- RE-Asset-Library: https://github.com/NSACloud/RE-Asset-Library  
- REE.PAK.Tool: https://github.com/Ekey/REE.PAK.Tool  
- REtool / Fluffy: https://www.fluffyquack.com/  
- Noesis RE Mesh 插件: https://github.com/alphazolam/fmt_RE_MESH-Noesis-Plugin  
- SF6 动画 → Blender 教程（YouTube）: "How to Extract Animations from Street Fighter 6 for Blender"  
- 综合 mod 流程长视频: Remy2FANG "Street Fighter 6 Modding Process Tutorial"  
- 归档链集合: remy2fang Tumblr SF6 modding guide（部分 list/旧链）  

---

## 7. 调研结论（回答「有没有途径」）

**有。** 在正版安装前提下：

1. **模型**：社区工具链成熟，Blender 侧可导入 SF6 mesh/骨骼/贴图。  
2. **动作**：可通过 Noesis 等路径把 **motlist 绑到模型** 并再导出；有专门 SF6 教程，但比模型更依赖版本与手动选文件。  
3. **到 WebGPU demo**：中间必须经 **Blender（或同类）→ glTF**；没有官方「SF6 SDK → Three」通道。  
4. **风险与维护**：工具已部分 archive/停更；适合私人研究，要接受补丁后返工。  
5. **仍建议**：仓库与构建产物不碰提取物；逻辑与帧表自持，提取资产只服务「看起来像 / 对齐一招」。

---

## 8. 若进入实践阶段的下一步（待你确认后再做）

1. 确认运行环境（Win 本机 / Mac + 虚拟机 / 是否已装 SF6）。  
2. 选定单角色 ID，写 `private/` + `.gitignore` 约定。  
3. 做 **PoC 清单**：Blender 出现完整绑骨 mesh → 播一条 idle → 导出 glTF → Three 加载。  
4. 再单开「一招攻击 clip + 帧表对齐」PoC。

# 方案 C：原版素材获取操作手册

> 更新：2026-08-06  
> 分工：**Windows 原生** = 装游戏 + 解包 + 模型/动作导出；**Mac** = Three/WebGPU 开发；**CrossOver 可选** = 仅训练模式对照。  
> 性质：私人学习研究；提取物 **不进 git、不公开分发**。  
> 社区依据：Remy2FANG / FluffyQuack REtool 教程、NSACloud RE 插件、AlphaZomega Noesis 插件、Modderbase 归档与 remy2fang 链集合。

---

## 0. 先读：你会得到什么

**第一阶段验收（建议严格按此停手，不要一次抽全游戏）：**

| # | 验收项 |
|---|--------|
| 1 | Windows 上 SF6 能进 **训练模式** |
| 2 | 解包后磁盘上有目标角色 `.mesh` / 贴图 / 至少一个 `.motlist`（或相关 motion 文件） |
| 3 | Blender 里角色 **绑骨站立** |
| 4 | Blender 或 Noesis 里能播 **idle + 一条攻击** |
| 5 | 导出 **`.glb`**，拷到 Mac 的 `private/runtime/` |
| 6 |（可选）Mac Chrome 用简单 Three 页加载并播放该 glb |

---

## 1. 软件与文件总清单

### 1.1 Windows 工作站（必须）

| 类别 | 名称 | 用途 | 获取途径 |
|------|------|------|----------|
| 系统 | **Windows 10/11 64-bit** | 工具链默认环境 | 你已有 |
| 商店/启动 | **Steam（Windows）** | 安装正版 SF6 | https://store.steampowered.com/ |
| 游戏 | **Street Fighter 6** 正版 | 资源唯一权威来源 | Steam App `1364780`：https://store.steampowered.com/app/1364780/ |
| 解压 | **7-Zip** 或 WinRAR | 解 rar/zip | https://www.7-zip.org/ |
| 文本 | 记事本 / **VS Code** | 改 `.bat`、看路径 | https://code.visualstudio.com/ |
| 解包工具 | **REtool**（FluffyQuack） | 解 `re_chunk_*.pak` | https://fluffyquack.com/tools/REtool.zip 或 `.rar`（站内最新）主页：https://www.fluffyquack.com/ |
| 文件名列表 | **SF6 `.list` 文件** | 解包时还原路径名 | 见 §1.3；版本会过时，需换新 list |
| 模型（路径 A 推荐） | **Blender 4.3.2+**（避免已知 5.1 导入极慢问题，社区曾建议 ≤5.0） | 导入 mesh、整理、导出 glTF | https://www.blender.org/download/ |
| 模型插件 | **RE-Mesh-Editor** | 原生导入 RE mesh/mdf | https://github.com/NSACloud/RE-Mesh-Editor → Code → Download ZIP（仓库已 archive，仍可用历史版） |
| 模型辅助（可选强烈推荐） | **RE-Asset-Library** | 按名浏览、按需从 PAK 抽文件 | https://github.com/NSACloud/RE-Asset-Library → Download ZIP（已 archive） |
| 动画主路径 | **Noesis** | 看 mesh + 挂 motlist + 导出 | https://www.richwhitehouse.com/index.php?content=inc_projects.php&showproject=91 |
| Noesis 插件 | **fmt_RE_MESH.py** | SF6 等 RE 格式 | https://github.com/alphazolam/fmt_RE_MESH-Noesis-Plugin （若新补丁贴图读不了，社区曾推 Silver 分支：https://github.com/SilverEzredes/fmt_RE_MESH-Noesis-Plugin_SILVER ） |
| 备用解包 | **REE.PAK.Tool** | 开源 PAK，含 SF6 工程配置 | https://github.com/Ekey/REE.PAK.Tool |
| 磁盘 | 建议 **≥80–150GB 空闲**（游戏约 60GB+ 级，解包子集也要预留） | 解包目录建议 SSD 非系统盘 | — |

**暂不必须（后续研究再用）：**

| 名称 | 用途 | 获取 |
|------|------|------|
| REFramework | 游戏内脚本/调试 | https://github.com/praydog/REFramework 或 nightly |
| MMDK | moveset 数据结构研究 | https://github.com/alphazolam/MMDK |
| Fluffy Mod Manager | 装 mod（本手册解包不依赖） | https://www.fluffyquack.com/tools/modmanager.zip |

### 1.2 Mac 开发机（必须）

| 名称 | 用途 | 获取 |
|------|------|------|
| **macOS** + **Chrome（较新）** | WebGPU 开发/预览 | 系统自带更新；Chrome 官网 |
| **Node.js LTS**（日后脚手架） | Vite/Three 工程 | https://nodejs.org/ |
| **VS Code / Cursor / 本 IDE** | 写代码 | — |
| **Git**（可选） | 只提交代码与 docs | — |
| 项目目录 | 本仓库 + `private/` | 已有 `.gitignore` |

### 1.3 Mac 可选

| 名称 | 用途 | 获取 |
|------|------|------|
| **CrossOver** | Steam 瓶内跑 SF6，训练模式对照 | https://www.codeweavers.com/crossover |
| CrossOver 内 **Steam + SF6** | 不必重复解包；仅游玩 | 同 Steam |

### 1.4 文件名列表（list）从哪来

解包 **没有** 官方 list。社区维护，**大更新后必须换新 list**，否则路径错误或解不出。

| 来源类型 | 说明 | 示例入口 |
|----------|------|----------|
| 教程镜像 | Remy2FANG 长视频描述里的 list | 视频：https://www.youtube.com/watch?v=DiT44XtAopc （描述区 REtool + list 链；链可能过期） |
| 归档合集 | remy2fang Tumblr 整理的 SF6 extract list / 分角色 list | https://www.tumblr.com/remy2fang/748342653516742656/street-fighter-6-modding-guide-and-tutorial |
| 分角色 list | 如某角色 esf 编号专用小 list（省空间） | 同上页面内 MediaFire 等（Rashid/A.K.I./Ed… 曾单独提供） |
| 游戏内生成 | 部分 mod 工具可 dump「当前加载文件 list」再交给 REtool | 高级用法；见 Ultimate Mod Manager 类说明 |
| Ekey 工程 | REE.PAK.Tool 的 SF6 项目侧配置 | https://github.com/Ekey/REE.PAK.Tool/tree/main/Projects |

**操作原则：** 打开 list 用文本编辑器搜 `esf`、角色英文名、`motlist`、`mesh`，确认是否覆盖你要的角色；过旧 list 就换更新源或 Discord（Modding Haven / SF 模组服）问「current SF6 list」。

### 1.5 教程视频（建议对照看，步骤以本文 + 当前工具为准）

| 内容 | 链接 |
|------|------|
| SF6 模组全流程（含 REtool 解包） | https://www.youtube.com/watch?v=DiT44XtAopc |
| SF6 动画提取到 Blender | https://www.youtube.com/watch?v=6TXVVtFMzGM |
| RE Asset Library 提取演示 | https://www.youtube.com/watch?v=jLM3wbEFANg |
| 更通用的 RE 提取教程 | https://www.youtube.com/watch?v=64WX3OMHM0c |

---

## 2. 推荐磁盘目录布局（Windows）

先建好，避免解包散落系统盘：

```text
D:\SF6_Research\                          ← 研究根（名称随意）
  tools\
    REtool\                               ← retool.exe + bat + .list
    Noesis\                               ← Noesis 安装/解压目录
  extract\                                ← 解包输出（natives\...）
  blender_projects\
  export\                                 ← 最终 .glb / .fbx
  notes\                                  ← 你记的角色 ID、clip 对应

Steam 游戏本体（勿与 extract 混）：
  ...\Steam\steamapps\common\Street Fighter 6\
```

Mac 侧与本仓库对齐：

```text
.../StreetFighter6/
  docs/                 # 可 git
  src/                  # 可 git（日后）
  private/              # 不可 git
    runtime/            # 从 Win 拷来的 .glb
    notes.md            # 可选
```

---

## 3. 阶段 0 — Windows：安装并验证游戏

### 3.1 安装

1. 安装 **Steam（Windows）** 并登录（与购买账号一致）。  
2. 库中安装 **Street Fighter 6**。  
3. 安装位置：Steam → 游戏右键 → **管理 → 浏览本地文件**。  
4. 确认目录中可见：  
   - `StreetFighter6.exe`（或同系列启动 exe）  
   - `re_chunk_000.pak`  
   - 以及多个 `re_chunk_000.pak.patch_XXX` / DLC 相关 pak（随版本变化）

### 3.2 验证

1. 启动游戏，进 **训练模式**，选一个你打算研究的角色。  
2. 能正常站立、出轻拳即可。  
3. 关掉游戏（解包时 **不要** 占用 pak）。

### 3.3 记录

在 `D:\SF6_Research\notes\` 记下：

- Steam 游戏完整路径  
- 打算研究的角色中文/英文名  
- 外观服装编号（默认 Cos1 即可）

---

## 4. 阶段 1 — 解包（两条路线，任选其一或组合）

### 路线 1A：REtool 经典解包（社区教程最多）

#### 4.1 准备工具

1. 下载 **REtool**：https://fluffyquack.com/tools/REtool.zip （或站点提供的 `.rar`）  
2. 解压到 `D:\SF6_Research\tools\REtool\`  
3. 确认有 `REtool.exe`（大小写以压缩包为准）及若干 `.bat`  
4. 放入 **SF6 的 `.list` 文件**（见 §1.4），例如命名为：  
   `StreetFighter6.exe_files.list`  
   与 `REtool.exe` **同一目录** 最省事。

#### 4.2 修改 extract 批处理（社区通用写法）

Remy2FANG 等教程的核心命令形态：

```bat
REtool.exe -h StreetFighter6.exe_files.list -x re_chunk_000.pak -skipunknowns
```

说明：

- `-h <list>`：用 list 还原文件名  
- `-x <pak>`：解这个 pak  
- `-skipunknowns`：跳过 list 里没有的哈希（日志更干净；若你需要未知文件可去掉）

**操作：**

1. 打开 REtool 目录中的 `extract-pak.bat`（若没有则自己新建 `extract-sf6.bat`）。  
2. 用记事本改成与你的 **exe 名、list 名、pak 名** 一致。  
3. 保存为 **ANSI/UTF-8** 均可，路径尽量 **无中文、无空格** 以减少坑。

#### 4.3 让批处理找得到 pak（两种做法）

**做法 A — 工具拷进游戏目录（老教程常用）**

1. 复制 `REtool.exe`、`extract-*.bat`、`.list` 到  
   `...\Street Fighter 6\`（与 `re_chunk_000.pak` 同级）。  
2. 在该目录双击 bat，或 PowerShell：

```powershell
cd "C:\Program Files (x86)\Steam\steamapps\common\Street Fighter 6"
.\REtool.exe -h StreetFighter6.exe_files.list -x re_chunk_000.pak -skipunknowns
```

3. 解包结果通常出现在游戏目录下以 pak 名命名的文件夹，或当前目录 `natives\...`（视 REtool 版本参数而定）。  
4. **完成后** 把 `natives` 剪到 `D:\SF6_Research\extract\`，避免污染 Steam 校验。

**做法 B — 只把 pak 拷到工具目录（更干净）**

1. 复制 `re_chunk_000.pak`（及你需要的 patch pak）到 `D:\SF6_Research\tools\REtool\`  
2. 在该目录运行同样的命令  
3. 输出留在 research 盘

#### 4.4 是否要解 patch pak

角色/动作常分布在 **基础 pak + 多个 patch**。若只解 `re_chunk_000.pak` 缺文件：

1. 对每个 `re_chunk_000.pak.patch_XXX` 用同一 list 再执行一次 `-x`  
2. 或使用社区「合并/按优先级覆盖」说明（较新流程会强调 patch 顺序）  
3. 分角色小 list 可减少体积（remy2fang 合集中有 per-character list 先例）

#### 4.5 解包后如何确认成功

在 `extract` 下搜索：

```text
natives\STM\
```

并尝试搜索：

- `esf`（SF6 角色模型路径常见前缀讨论）  
- `.mesh`  
- `motlist` 或 `motion`

用 Everything（https://www.voidtools.com/）按扩展名扫会快很多。

---

### 路线 1B：RE Asset Library 按需提取（省空间，推荐「单角色」）

适合：不想整盘解包、主要拿模型。

1. 安装 **Blender 4.3.2+**  
2. 安装插件（Edit → Preferences → Add-ons → Install from Disk）：  
   - RE-Mesh-Editor ZIP  
   - RE-Asset-Library ZIP  
3. 启用两个插件  
4. 按 RE-Asset-Library README：  
   - Preferences 里 **Download RE Asset Libraries** → 选 **Street Fighter 6**  
   - `File → New → RE Assets`  
   - Asset Browser 中选 SF6 库  
   - **Set Game Extract Paths** → 指向 Windows 上 **SF6 的 .exe**  
5. 新建普通 `.blend`（不要在 library 那个 blend 里拖）  
6. 从 Asset Browser **拖角色模型** 到 3D 视图 → 自动从 PAK 抽并导入  
7. 缺贴图发红时：菜单里 **Force Extract Files** 后再拖一次  

**限制：** 动画仍弱；动作请走阶段 2 的 Noesis。插件已 **停止更新**，大版本游戏更新后可能失效 → 回退 1A + Noesis。

---

### 路线 1C：REE.PAK.Tool 备用

1. Clone 或下载：https://github.com/Ekey/REE.PAK.Tool  
2. 查看 `Projects` 下 **SF6_STM_Release** 等配置  
3. 按该仓库 README 对 Steam 版 PAK 解包  

当 REtool list 全面失效时作为备选。

---

## 5. 阶段 2 — 模型进 Blender（RE-Mesh-Editor）

若你已用 1B 拖进模型，可跳到 §5.3。

### 5.1 安装插件

1. 下载 https://github.com/NSACloud/RE-Mesh-Editor/archive/refs/heads/main.zip  
2. Blender → Edit → Preferences → Add-ons → Install from Disk → 选 zip  
3. 勾选启用 **RE Mesh Editor**  
4. 重启 Blender 一次更稳

### 5.2 导入 mesh

1. `File → Import → RE Mesh`（菜单名以插件为准，在 RE Mesh Editor 分组下）  
2. 选解包得到的角色 `.mesh`  
3. 默认勾选加载 **MDF**（材质）  
4. 成功标志：Outliner 出现 mesh collection + 骨架；Pose 模式挪骨网格跟随  

### 5.3 清理（为 glTF 做准备）

1. 删除不需要的 LOD 集合（若勾选过 Import All LODs）  
2. 应用或记录缩放：建议在笔记写「导出前 Object scale = …」  
3. 材质可先不管华丽度，能分清身体/衣服即可  
4. **另存** `D:\SF6_Research\blender_projects\char_ref.blend`

### 5.4 常见失败

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 棋盘格/粉红 | 缺 tex 或 mdf 路径 | 确认 patch 已解；Force Extract；检查 chunk path |
| 仅 Empty | 拖错 blend / 库文件本身 | 换新 blend 再拖 |
| 导入报版本错 | 游戏更新 mesh 魔数变了 | 更新插件 fork 或换 Noesis 看模型 |
| 极慢 | Blender 5.1 已知问题 | 换 4.3–5.0 |

---

## 6. 阶段 3 — 动作：Noesis + motlist（关键）

### 6.1 安装 Noesis 与插件

1. 下载 Noesis：https://www.richwhitehouse.com/index.php?content=inc_projects.php&showproject=91  
2. 解压到 `D:\SF6_Research\tools\Noesis\`  
3. 下载 `fmt_RE_MESH.py`：  
   https://github.com/alphazolam/fmt_RE_MESH-Noesis-Plugin  
4. 复制到：`[Noesis]/plugins\python\fmt_RE_MESH.py`  
5. 启动 Noesis  

### 6.2 打开角色 mesh

1. Noesis 中浏览到解包目录，打开目标 `.mesh`  
2. 若提示 Base Directory：指向你的 **extract 根**（含 `natives` 的那层之上或插件要求的 chunk 根；以插件保存的 txt 为准，不对就编辑插件旁记录文件）  
3. 模型应出现在预览窗

### 6.3 挂动画（插件官方技巧）

1. 加载 mesh 的对话框/流程中，点 **Select Animation**  
2. 浏览到对应 **motlist**（或 motion 相关文件；扩展名带版本数字）  
3. 预览窗口播放，确认骨骼跟着动  

README 原文要点：  
https://github.com/alphazolam/fmt_RE_MESH-Noesis-Plugin  
- Select Animation 用于 motlist  
- 可用 `-fbxmultitake` 等高级导出选项拆轨道（进 Blender 后可能要调帧率）

### 6.4 导出以便进 Blender

1. Noesis：`Export` / Export from preview（以你版本菜单为准）  
2. 推荐先试 **FBX** 或 **glTF**（若该组合支持动画）  
3. 若动画多轨叠在一条时间线上：在 Blender 里按帧切开成独立 Action  
4. 插件提示：导出动画时 advanced options 可加 `-fbxmultitake`；Blender FBX 导入后帧率需按插件 README 调整到 **60** 量级  

### 6.5 在 Blender 合并「好看模型 + 可播动画」

常见稳妥流程：

1. **RE-Mesh-Editor** 负责高质量 mesh/材质（或 Noesis 网格也行）  
2. **Noesis** 负责验证哪条 motlist 是 idle/攻击  
3. 将导出的动画 FBX 导入 Blender，**重定向/对齐到同一骨架**（同骨骼名时通常可直接赋 Action）  
4. 打开 **Dope Sheet → Action Editor**，把 idle / attack 存成两个 Action  
5. 时间轴设 **60 fps**，数攻击 Action 总帧数，记到 `notes`（用于以后对齐帧表）

### 6.6 找「某一招」的文件（现实做法）

没有自动「5LP → 文件」官方表。实践顺序：

1. 在 extract 里按角色 ID 文件夹缩小范围  
2. Noesis 批量试播，看动作形态与 **时长（帧数）**  
3. 训练模式看同一招的公开帧数据（startup+active+recovery）是否接近  
4. 记下：`clip 文件名 ↔ 逻辑招式名 ↔ 总帧数`

第一目标：**任意一条清晰站立轻攻击 + idle**，不要卡在「必须是某角色某编号」。

---

## 7. 阶段 4 — 导出 glTF 给 Three.js

### 7.1 Blender 导出

1. 选中角色集合（含 Armature + Mesh）  
2. `File → Export → glTF 2.0 (.glb)`  
3. 建议选项（名称随 Blender 版本略有差异）：  
   - Format: **glTF Binary (.glb)**  
   - Include: 选中物体 / 可见  
   - Transform: +Y Up（默认）  
   - Animation: **打开**，导出 Actions / NLA 按你整理方式  
   - 几何：Apply Modifiers 视需要  
4. 输出到：`D:\SF6_Research\export\fighter01.glb`

### 7.2 自检

1. 用 https://gltf-viewer.donmccurdy.com/ 拖入 glb（Win 浏览器即可）  
2. 确认：模型在、骨架在、动画列表有 idle/attack  
3. 失败则回 Blender 查：是否没勾选动画、是否导出了空 Action

### 7.3 同步到 Mac

任选：

- 网盘 / U 盘 / `scp` / 局域网共享  
- 放到 Mac 项目：  
  `.../StreetFighter6/private/runtime/fighter01.glb`  
- **确认** `private/` 在 `.gitignore` 中（仓库已配置）

---

## 8. 阶段 5 — Mac：开发侧最小验证（可选但建议）

> 完整 Vite 工程可另开任务；此处仅验证资产。

1. Mac 安装 **Chrome**，地址栏打开 `chrome://gpu`，确认 WebGPU 相关项可用。  
2. 日后脚手架可用：

```bash
# 示例：之后建工程时
npm create vite@latest sf6-demo -- --template vanilla-ts
cd sf6-demo && npm i three
```

3. 用 `GLTFLoader` 加载 `private/runtime/fighter01.glb`，`AnimationMixer` 播放 clip。  
4. Renderer 使用 Three 的 **WebGPURenderer**（按你当时 three 版本文档）。

**注意：** 不要把 glb 放进会提交的 `public/` 除非你很清楚不会 push 到公开远程。

---

## 9. CrossOver（可选）怎么配合方案 C

1. Mac 装 CrossOver → 瓶内装 Steam → 装 SF6。  
2. **不要** 在 CrossOver 里跑 REtool/Noesis 当主路径。  
3. 用途：训练模式看招、对帧。  
4. 若想从 Mac 读 Win 解包结果：只传 **glb**，不要传整棵 natives。

---

## 10. 分角色路径提示（非保证，需本机验证）

社区路径讨论中常见：

- 角色模型相关：`product/model/esf/esfXXX/...`  
- 不同角色 `esf` 编号不同（归档 list 里曾出现 A.K.I. esf013、Rashid esf014、Ed esf019 等线索）  

**以你 list + 解包结果为准**；编号随版本与 DLC 角色增加会变。

在 extract 根目录 PowerShell 示例：

```powershell
Get-ChildItem -Recurse -Filter "*esf*" -Directory | Select-Object -First 40 FullName
Get-ChildItem -Recurse -Filter "*.motlist*" | Select-Object -First 40 FullName
```

---

## 11. 故障排查速查表

| 问题 | 处理 |
|------|------|
| REtool 秒退/无输出 | 管理员？路径空格？list 文件名是否与 `-h` 一致？pak 是否被 Steam 占用？ |
| 解出大量无扩展名文件 | list 过旧或未使用 `-h`；换新 list |
| 缺角色部件 | 解 patch pak；streaming mesh 相关文件未抽全 |
| Noesis 打不开 mesh | 插件未进 `plugins/python`；或补丁后格式变 → 试 Silver 分支插件 |
| 有模型无动画 | 未 Select Animation；motlist 与角色骨架不匹配；试其他 motlist |
| Blender 动画帧率怪 | 按 Noesis 插件 README 调 FBX 导入帧率到 60 |
| glb 在网页黑屏 | 相机过近/过远、比例差 100 倍：调 `model.scale` |
| Steam 校验失败 | 勿长期把 REtool 输出留在游戏目录；用「验证游戏文件」修复 |

---

## 12. 建议执行顺序（打卡表）

打印或复制到笔记：

- [ ] Win：Steam 安装 SF6，训练模式 OK  
- [ ] Win：REtool + list 就位  
- [ ] Win：解出含 mesh 的 natives（或 Asset Library 拖入成功）  
- [ ] Win：Blender 绑骨站立  
- [ ] Win：Noesis 播 idle  
- [ ] Win：Noesis/Blender 播一条攻击  
- [ ] Win：导出 glb，浏览器 viewer OK  
- [ ] 拷到 Mac `private/runtime/`  
- [ ] Mac：记录 clip 名与帧长到 `private/notes.md`（可不提交）  
- [ ]（可选）Mac CrossOver 训练模式对照  

---

## 13. 合规与习惯（再次强调）

1. 仅私人研究；**禁止**上传 glb/natives/pak 到公开 GitHub/网盘分享站。  
2. 本仓库只提交 docs/代码；资产只在 `private/`。  
3. 工具来自社区，**无官方支持**；游戏更新后本手册步骤可能局部失效，以插件 README 与新 list 为准。  
4. 本文是 **研究向操作整理**，不是鼓励侵权传播。

---

## 14. 相关文档

- 共识：`docs/consensus-v0.md` §3.5  
- 途径调研：`docs/research/asset-acquisition-pathways.md`  
- 工具地图：`docs/research/sf6-extract-pipeline.md`  
- 社区现成为何不够：`docs/research/community-assets-and-cases.md`  

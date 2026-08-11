# 第一参考角色：隆（Ryu）— 模型与动作素材检索

> **检索节点**：2026-08-06  
> **用途边界**：私人学习 / 本机研究；**不进公开 git、不二次分发**  
> **共识**：第一参考角色 = **Ryu（隆）**；第一招优先 **5LP（站立轻拳）**  
> **关联**：`consensus-v0.md` §3.5–3.6、`scheme-c-asset-pipeline.md`、`interim-community-scaffold.md`

---

## 1. 分层结论（先读这个）

| 资产类型 | 社区现成情况 | 对本项目建议 |
|----------|--------------|--------------|
| **隆 mesh（外形）** | **有**，且相对好找 | 解包完成前可用 port 做 **私人表现**；优先 Open3DLab / DA FBX |
| **隆全招式动画库（可玩级）** | **基本没有「即下即用」** | 不要指望网盘包自带完整 moveset；动作权威仍靠 **自解包 motlist** 或临时通用动画 |
| **单段/测试 pose** | 可能随部分 port 或自导 | 仅够渲染 pose，不够训练场 cancel 链 |
| **帧数据（逻辑）** | **极丰富** | 立刻可做：5LP 等表驱动，**不依赖模型** |

**一句话：**  
社区能帮你 **很快立起「看起来像隆」的 mesh**；**招式动画**仍要走 Noesis/自解包，或暂时用通用 punch clip 对齐 5LP 帧数。

---

## 2. 模型素材（社区 port / 解包再打包）

### 2.1 首选：Open3DLab — AD-8 Renders《Street Fighter 6 Ryu》

| 项 | 内容 |
|----|------|
| **页面** | https://open3dlab.com/project/64fa50f3-937d-4337-9796-4815addeefc5/ |
| **作者** | AD-8 Renders（X/Twitter 曾用 @AD8_3D） |
| **发布** | 2023-04-04 |
| **文件** | `SF6_Ryu_Blender_Model.zip`（约 **352 MB**，下载量 1800+） |
| **附带** | `rig_tools_*.zip`（Auto Rig Pro 用） |
| **形态** | Blender 工程；**Auto Rig Pro 版 + no-rig 版** |
| **说明** | 作者写明 *Everything here belongs to Capcom*；允许再 port 到 SFM/DAZ/XNALara（站点许可栏写 BY-NC-ND，与 Capcom 版权并存，**仅私人研究语境下使用**） |
| **动画** | **不包含**完整招式 mot 库；本质是 **渲染/绑骨向 mesh** |

**管线建议（私人）：**

```text
下载 zip → Blender 打开 → 检查缩放/轴向 → 导出 glTF/glb
  → 本机 private/ryu/mesh/ → Three.js 加载
  → 禁止 commit 到远程
```

同作者系列（场景可搭训练感，仍非动画）：

- SF6 Training Stage：https://open3dlab.com/project/97050441-24ae-49de-9a04-532dc0e1d4b8/  
- Character Select Stage：https://open3dlab.com/project/86f3b4e4-240f-455d-a542-9bf7c8067218/  
- 合集入口：https://open3dlab.com/list/71605b15-3dad-4bbc-bb02-b16a261562c3/

---

### 2.2 DeviantArt — WhiteMageSunny《Street Fighter VI - Ryu (S2)》

| 项 | 内容 |
|----|------|
| **页面** | https://www.deviantart.com/whitemagesunny/art/Street-Fighter-VI-Ryu-S2-970833228 |
| **格式** | **FBX** + TGA 贴图；**游戏原始绑骨**（Original rigging from the game） |
| **服装** | S2 造型（Season 2 相关外观） |
| **下载** | 页面写 Google Drive 链（DA 站内 *DL* 外链；链接可能失效需自行点开确认） |
| **增值** | 作者提到带 shader/IK 的 Blend 在 Patreon（非必须） |
| **注意** | 预览色可能是 Blender 内自定义；raw 贴图需自配材质 |

同作者还有 **Ryu S3** 等（画廊内搜 `Street Fighter VI - Ryu`）：

- 示例：https://www.deviantart.com/whitemagesunny/art/Street-Fighter-VI-Ryu-S3-1258979652  

其他 DA 线索（多为另一套服装/转 XPS，质量与版本不一）：

- Crazy31139 — Outfit 2：https://www.deviantart.com/crazy31139/art/Street-Fighter-6-Ryu-Outfit-2-980322451  

---

### 2.3 整包 XPS 路线（多角色含 Ryu，质量参差）

| 来源 | 说明 |
|------|------|
| YouTube「Howto download Street Fighter 6 RIPPED Models」等 | 常指向 **整季角色 XPS 网盘**；流程：XPS → Blender（插件如 https://github.com/johnzero7/XNALaraMesh） |
| 风险 | 来源混杂、版本旧、**通常无动画**；病毒/捆绑需自检 |

**私人可用，但不作为「权威唯一来源」**；优先 Open3DLab 单角色 Ryu 或自解包。

---

### 2.4 Sketchfab 等「可下 3D」

| 项 | 内容 |
|----|------|
| 例 | https://sketchfab.com/3d-models/ryu-sf6-84caa5c1ddfe4fcc8aa4a5f69c823f5a （Slammiio，标注 CC-BY） |
| 判断 | 面数约 14 万 tri；**是否原版 rip 不明**；动画栏有时仅占位。适合对照外形，**不宜**当动作库 |

---

### 2.5 不是「独立资产」的 Ryu 模型

| 类型 | 例子 | 为何不适合本 demo |
|------|------|-------------------|
| 游戏内换皮 mod | Green Ranger Ryu（Nexus/DA + Fluffy） | 依赖正版 SF6 客户端，**不能**当 Three 资源 |
| 3D 打印 STL | Printables 等 | 无骨骼/无游戏动作 |

---

## 3. 动作素材（核心缺口）

### 3.1 社区「现成 Ryu 招式动画包」检索结果

| 期望 | 实际 |
|------|------|
| 带 5LP/5MP/波动/升龙 的完整 glTF/FBX 包 | **未发现**可靠、完整、可直接进引擎的公开库 |
| Blender port 自带动画 | Open3DLab Ryu **以 mesh 为主**；ARP 是控制骨骼，不是 moveset |
| YouTube「Extract Animations from SF6 for Blender」 | 教的是 **你自己用工具从游戏抽 mot**，不是分发成品动画库 |

→ **动作权威路径 = 自己解包（或等解包）+ Noesis motlist**（见方案 C 手册）。

### 3.2 自解包动作（推荐终局，与私人社区 mesh 可组合）

| 步骤 | 工具 / 文档 |
|------|-------------|
| PAK 提取 | REtool + 最新 SF6 `.list`（`scheme-c-asset-pipeline.md`） |
| 定位 Ryu | 在 list / 解包树中搜 `ryu`、`Ryu`、`esf`；路径形态 `product/model/esf/esfXXX/...`（**编号以本机 list 为准**，勿死记过期 ID） |
| 导入 mesh | Blender **RE-Mesh-Editor**：https://github.com/NSACloud/RE-Mesh-Editor |
| 导动画 | **Noesis** + RE mesh/mot 插件（如 alphazolam / SilverEzredes 系 fork）→ 选 mesh 后 **Select Animation** 挂 motlist → 导出 FBX/动画 |
| 教程入口 | Modderbase 归档：https://web.archive.org/web/20240316160336/http://modderbase.com/showthread.php?tid=2902  
| 视频 | Remy2FANG 全流程：https://www.youtube.com/watch?v=DiT44XtAopc  
| 动画专项 | 「How to Extract Animations from Street Fighter 6 for Blender」等（流程向） |

**Noesis 插件参考：**

- https://github.com/alphazolam/fmt_RE_MESH-Noesis-Plugin  
- https://github.com/SilverEzredes/fmt_RE_MESH-Noesis-Plugin_SILVER  

### 3.3 解包完成前：动作「替身」策略（仅私人）

在 motlist 未导出时，仍要训 5LP 逻辑：

| 策略 | 做法 |
|------|------|
| **A. 逻辑先行** | 帧表驱动 hitbox；mesh 只播 idle 或 T-pose 变色提示状态 |
| **B. 通用近战 clip** | Mixamo / Quaternius punch，用 `timeScale` 压到 5LP 总帧（约 4+3+7） |
| **C. 社区 mesh + 自导** | Open3DLab Ryu 外形 + 将来替换为 Noesis 导出 clip（骨骼名可能要对齐，有成本） |

**不建议：** 把 XPS 整包当成「已有 Ryu 全招式动画」。

---

## 4. 帧数据与逻辑（立刻可用，与 mesh 解耦）

第一招 **5LP** 公开数据入口（社区整理；实现时请标注来源与日期）：

| 源 | 链接 |
|----|------|
| SuperCombo Wiki | https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu/Data |
| Ultimate Frame Data | https://ultimateframedata.com/sf6/ryu |
| FAT Online | https://fullmeter.com/fatonline/ （选 SF6 / Ryu） |
| 官方帧表页 | https://www.streetfighter.com/6/en-us/character/ryu/frame |

社区表常见量级（**以你采用的 patch 页为准**，实现前再核对）：

- **5LP**：startup **4** / active **3** / recovery **7**（SuperCombo 写法）；可 chain / special cancel 等按 wiki 列。

Hitbox 参考视频（学习向）：社区有 “Hitbox Reference Ryu” 类录像（见 SuperCombo Resources）。

---

## 5. X / 社区信号（检索摘要）

| 发现 | 含义 |
|------|------|
| SF6 Ryu **mod** 帖极多（换皮、Ranger 等） | 社区精力在 **客户端内**，不是 Web 动画包 |
| Open3DLab / Blender **port 渲染** | mesh 流通；**动作库不流通** |
| REFramework / 解包教程 | 动作要自己抽 |
| 整包 ripped XPS 视频 | 存在下载路径，但质量/合法性/无动画问题依旧 |

---

## 6. 推荐落地顺序（Ryu 专用）

```text
Phase 0（本周可做）
  ├─ 帧表：写入 ryu_5lp 等 JSON（SuperCombo/FAT）
  ├─ 模型：下 Open3DLab SF6 Ryu → private/ 导出 glb 冒烟
  └─ 动作：idle 自带或 Mixamo punch 对齐 5LP 总帧

Phase 1（Windows 解包就绪）
  ├─ 按需提取 Ryu mesh + 相关 motlist（list 搜 ryu/esf）
  ├─ Noesis 导出 5LP / idle / walk / 受击 等 clip
  └─ 替换 glb 映射；逻辑 JSON 尽量不动

Phase 2（加深）
  └─ 5MP、2LP、Hadoken 等逐招对齐 + 训练场调试绘制
```

**目录建议（全部 gitignore）：**

```text
private/
  ryu/
    community/          # Open3DLab / DA 下载原包
    extract/            # 自解包 natives 子集
    export/
      ryu_mesh.glb
      ryu_clips.glb     # 或分 clip
    NOTES.md            # 来源 URL、下载日、骨骼注意
```

---

## 7. 精选链接速查

### 模型（社区现成）

- https://open3dlab.com/project/64fa50f3-937d-4337-9796-4815addeefc5/  
- https://www.deviantart.com/whitemagesunny/art/Street-Fighter-VI-Ryu-S2-970833228  
- https://www.deviantart.com/whitemagesunny/art/Street-Fighter-VI-Ryu-S3-1258979652  
- https://www.deviantart.com/crazy31139/art/Street-Fighter-6-Ryu-Outfit-2-980322451  

### 动作（工具，非成品库）

- `docs/guides/scheme-c-asset-pipeline.md`  
- https://github.com/NSACloud/RE-Mesh-Editor  
- https://github.com/alphazolam/fmt_RE_MESH-Noesis-Plugin  
- https://github.com/SilverEzredes/fmt_RE_MESH-Noesis-Plugin_SILVER  
- https://www.youtube.com/watch?v=DiT44XtAopc  

### 帧数据

- https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu/Data  
- https://ultimateframedata.com/sf6/ryu  
- https://fullmeter.com/fatonline/  

---

## 8. 一句话

**隆的 mesh 社区现成（Open3DLab AD-8、DA WhiteMageSunny FBX 等）足够私人学习先立 3D 皮；隆的招式动画没有完整即用包，必须自解包 motlist 或临时通用 clip 对齐；帧逻辑立刻用公开 5LP 表驱动。**

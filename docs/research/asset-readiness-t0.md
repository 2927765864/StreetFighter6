# 资产就绪状态 — T0（2026-08-06）

> **一句话：** 现成模型、训练场景、基础简单动作已备好；**仍未使用任何自解包内容**。  
> 共识入口：`docs/consensus-v0.md` §3.6–3.7。

---

## 1. 阶段判定

| 阶段 | 含义 | 当前 |
|------|------|------|
| **T0** | 社区/CC0 脚手架，打通显示与逻辑 | **← 现在** |
| T1 | 部分原版（mesh 或 clip）混入 | 未开始 |
| T2 | 自解包原版优先 | 未开始 |

**解包（PAK → mesh/mot → glTF）内容：未进入本项目运行时路径。**

---

## 2. 已就绪

### 2.1 角色模型（社区 port，私人）

| 项 | 内容 |
|----|------|
| 来源 | Open3DLab — Street Fighter 6 Ryu（AD-8 Renders） |
| Blender 源 | `private/interim/characters/SF6 Ryu Model/`（含 No rig / ARP、textures） |
| **运行时导出** | `private/interim/characters/SF6 Ryu Model/SF6 Ryu No rig.glb` |
| 校验（2026-08-06） | ~279MB；21 mesh；33 嵌入贴图；1 skin（~680 关节）；**0 动画**；UV+蒙皮齐全 |
| 贴图 | **已嵌入 glb**，加载无需旁挂 textures 目录 |

### 2.2 训练场景（社区 port，私人）

| 项 | 内容 |
|----|------|
| 来源 | Open3DLab — SF6 Training Stage |
| 源 | `private/interim/SF6 Training Stage/` |
| **运行时导出** | `private/interim/SF6 Training Stage/SF6 Training Stage.glb` |
| 校验 | ~9.5MB；2 mesh；6 嵌入贴图；可用 |

### 2.3 基础简单动作（CC0，非 SF6 原版）

| 项 | 内容 |
|----|------|
| 来源 | Quaternius Universal Animation Library 1 Standard |
| 路径 | `private/interim/animations/selected/` |
| 文件 | `AnimationLibrary_Godot_Standard.gltf` + `.bin`、`UAL1_Standard.fbx`、`clip_map.json` |
| 内容 | idle / walk / crouch / Punch_Jab / Punch_Cross / hit / jump 等（约 46 clip） |
| 性质 | **通用 humanoid**，不是隆招式 mot；驱动隆需 retarget（尚未完成） |

### 2.4 其它

| 项 | 路径 |
|----|------|
| 冒烟角色 | `private/interim/characters/Xbot.glb`、`Soldier.glb` |
| 临时目录说明 | `private/interim/README.md` |
| 动作整理笔记 | `docs/research/interim-animation-kit.md` |
| 隆素材检索 | `docs/research/ryu-assets-sources.md` |

### 2.5 产品决策（已写入共识）

- 第一参考角色：**Ryu（隆）**  
- 第一招：**5LP**  
- 逻辑与资源解耦；公开帧表可独立做

---

## 3. 未就绪 / 明确未使用

| 项 | 状态 |
|----|------|
| 本人正版 SF6 **自解包** mesh | **未使用** |
| 自解包 **motlist / 招式动画** | **未使用** |
| `private/` 下 natives 解包树作为权威资源 | **无** |
| 隆骨骼 ← UAL 动画 retarget 成品 | **未完成** |
| 原版 5LP 等 clip 与帧表像素级对齐 | **待 T2** |

终局路径仍见：`docs/guides/scheme-c-asset-pipeline.md`、`docs/research/asset-acquisition-pathways.md`。

---

## 4. 当前允许的工程用法

```text
✅ GLTFLoader 加载 training_stage.glb + ryu.glb（静态展示、贴图可用）
✅ 帧表 / FSM / hitbox 用 JSON 自持（参考 Ryu 5LP 公开数据）
✅ 动画状态机可先用 Xbot/Soldier 或 UAL humanoid 验证
⚠ 隆要「打拳」需 retarget 或解包动作；二者都还没落地
❌ 不要把当前 glb 当作「已解包原版管线完成」
```

---

## 5. 变更记录

| 日期 | 记要 |
|------|------|
| 2026-08-06 | 确立 T0：社区隆+训练场 glb 校验通过；UAL 动作包就位；**无解包内容使用**。写入共识 §3.7。 |

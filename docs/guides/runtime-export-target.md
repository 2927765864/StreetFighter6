# 运行时导出目标与操作路径

> 适用：私人研究；角色原版（隆 esf001）；Three.js + WebGPU 训练场。  
> 你当前原料：`/Users/yangjianlin/Documents/stm/product/...`

---

## 1. 最终导出目标（进本项目后长什么样）

### 1.1 放在哪

```text
StreetFighter6/
  private/                          # gitignore，永不提交
    runtime/
      ryu/
        ryu_c1.glb                  # ★ 主交付物（或拆成多个 glb，见下）
        clips.json                  # ★ 动画 clip 与逻辑状态映射（自建）
        README_local.md             # 可选：来源、缩放、帧率备注
    notes/
      ryu_framedata.md              # 可选：与公开帧表对齐记录
  src/                              # 代码只引用 private 路径或 dev 本地拷贝
```

**原则：** 游戏原版 `.mesh` / `.motlist` **不进** `src/`，也不进可推送的远程；运行时只认 **glTF Binary**。

### 1.2 主交付物规格：`ryu_c1.glb`

| 维度 | 目标规格 |
|------|----------|
| 格式 | **glTF 2.0 Binary（`.glb`）** 单文件优先 |
| 内容 | **蒙皮网格 + 单一骨架（Armature）+ 动画 clips** |
| 网格 | 隆 C1：合并 `00`（头）+ `01`（身）+ `02`（附件）为一个可播放角色 |
| 贴图 | 嵌入 glb 或同目录外置；研究阶段嵌入更省事 |
| 材质 | PBR 简化即可（BaseColor/Normal 有就不错），不追求 RE 1:1 |
| 轴向 | glTF 标准 **+Y up**；进 Three 后若躺/背对，用一次 `rotation`/`scale` 钉死并记在 notes |
| 单位 | 角色身高视觉约 1.6–1.9m 量级（Three 默认单位）；过大/过小在加载时 `scale` 一次写死 |
| 动画 | **命名清晰的 Animation clips**，不是一条无限长时间轴硬切（能拆则拆） |
| 帧率 | 制作时按 **60 fps** 对齐格斗逻辑 |
| 第一批 clips（最低） | 见下表 |

### 1.3 第一批必须具备的 Animation clips

| clip 名（建议） | 来源倾向 | 用途 |
|-----------------|----------|------|
| `idle` | `…/basic/esf001v00_idle.motlist.653` | 训练场默认 |
| `walk_fwd` 或 `move` | `…/basic/esf001v00_move.motlist.653` | 移动（可先共用一段） |
| `attack_light` | `…/attack/esf001v00_attack_00` 起试播选定 | 「严格对齐一招」 |
| `hitstun` 或 `damage` | `…/basic/esf001v00_damage.motlist.653` | 受击反馈 |
| `block`（可选 P1） | 若在 basic/其它 list 中找到 | 防御 |

命名用 **逻辑名**，不要直接用 `esf001v00_attack_00` 当唯一对外名（可在 `clips.json` 里保留原文件名映射）。

### 1.4 配套元数据：`clips.json`（自建，进 private）

示例结构（可按实现改字段）：

```json
{
  "characterId": "esf001",
  "costume": "001",
  "glb": "ryu_c1.glb",
  "logicFps": 60,
  "displayScale": 1.0,
  "clips": {
    "idle": {
      "gltfClip": "idle",
      "source": "basic/esf001v00_idle.motlist.653",
      "loop": true
    },
    "attack_light": {
      "gltfClip": "attack_light",
      "source": "attack/esf001v00_attack_XX.motlist.653",
      "loop": false,
      "frameLength": null,
      "notes": "对齐公开帧表后填写 startup/active/recovery"
    }
  }
}
```

逻辑层（命中框、硬直）仍用 **另一套帧数据表**；glb 只负责 **看起来对、时长可对齐**。

### 1.5 明确不算「最终目标」的东西

| 不要当作运行时主格式 | 原因 |
|----------------------|------|
| `.mesh` / `.mdf2` / `.tex` / `.motlist` | Three 不能直接吃；留在 `Documents/stm` 当原料 |
| 仅 FBX 停在半路 | 中间格式可以，**项目加载目标仍是 glb** |
| 未合并的三块 mesh 分三个 glb 且无共用骨架 | 动画会对不齐；应一骨架多 mesh |
| 全量 facial + 全 superarts 一次塞满 | 可后期加；v0 不要求 |

### 1.6 代码侧如何用（目标用法）

```text
GLTFLoader.load('private/runtime/ryu/ryu_c1.glb')
  → scene 里取 SkinnedMesh + AnimationMixer
  → clipAction('idle').play()
  → 攻击时 crossFade / stop + play('attack_light')
  → 逻辑 tick 60Hz 与 clip 时间对齐或仅作表现从属
```

Renderer：**WebGPURenderer**（共识）。

---

## 2. 从现状到目标：操作路径

### 2.1 总览（推荐主路径）

```text
【已完成】正版 PAK 解包 → Documents/stm（esf001 模型+动画）
        ↓
【路径 M】模型进 DCC（Blender 优先 或 Noesis）
        ↓
【路径 A】动作挂到同一骨架并整理成 clips
        ↓
【路径 E】导出 glb + 写 clips.json
        ↓
【路径 P】拷贝到本项目 private/runtime/ryu/
        ↓
【路径 T】Three 加载验证（idle + 一招）
```

中间格式 **FBX 可选，不是必须**；能直接 glTF 更好。

---

### 2.2 路径 M — 模型进可编辑环境

**推荐 M1：Blender + RE-Mesh-Editor**

1. 安装 Blender 4.3+、RE-Mesh-Editor。  
2. Import 三个 mesh：  
   - `…/esf001/001/00/esf001_001_00.mesh.230110883`  
   - `…/esf001/001/01/esf001_001_01.mesh.230110883`  
   - `…/esf001/001/02/esf001_001_02.mesh.230110883`  
3. 合并到 **同一 Armature**（插件/手动 Join 权重骨一致）。  
4. 检查贴图；头若粉红可暂用纯色，不阻塞动画管线。  
5. 另存 `private` 外工作区：`ryu_c1_work.blend`（可放 Win/Mac 本地，勿提交）。

**备选 M2：Noesis 打开多 mesh**  
仅预览或再 Export；最终仍建议进 Blender 统一导出 glb。

---

### 2.3 路径 A — 动作上身并拆 clip

**A1（主）：Noesis 验证 + 导出动画 → Blender**

1. Noesis：加载合并后的角色（或先 body 再补全）。  
2. Select Animation → 依次：  
   - `idle.motlist`  
   - `move.motlist`  
   - 选定的 `attack_XX.motlist`  
   - `damage.motlist`  
3. 确认骨骼在动。  
4. Export：**FBX**（常用）或 glTF（若带动画且完整）。  
5. Blender：导入动画，对齐到路径 M 的骨架；  
   - 每条动作存为独立 **Action**，改名为 `idle` / `attack_light` / …  
   - Timeline **60 fps**  
   - 数 `attack_light` 总帧，写入 notes  

**A2：** 若某工具能 motlist → Blender 直进，可跳过 FBX，但 **验收标准不变**（同骨架 + 命名 clips）。

---

### 2.4 路径 E — 导出最终 glb

在 Blender（动画 Actions 已命名）：

1. 选中 Armature + 所有相关 Mesh。  
2. `File → Export → glTF 2.0`  
3. 选项要点：  
   - **glTF Binary (.glb)**  
   - 导出动画：开启，按 Actions / NLA 导出为独立 clips  
   - Apply 变换视需要（导出前 `Ctrl+A` 应用旋转缩放时要谨慎，先备份 blend）  
4. 输出：`ryu_c1.glb`  
5. 用 [glTF Viewer](https://gltf-viewer.donmccurdy.com/) 检查：  
   - [ ] 全身可见  
   - [ ] 动画列表含 `idle`、`attack_light` 等  
   - [ ] 播放不炸骨架  

6. 手写 / 生成 `clips.json`。

---

### 2.5 路径 P — 进入本项目

```text
拷贝 → StreetFighter6/private/runtime/ryu/ryu_c1.glb
     → StreetFighter6/private/runtime/ryu/clips.json
```

确认根目录 `.gitignore` 已忽略 `private/` 与 `*.glb`。

---

### 2.6 路径 T — 项目内验收（最终「能用」）

最小代码验收（概念）：

1. Vite + three + WebGPURenderer 场景。  
2. 加载 glb，播 `idle` 循环。  
3. 按键切换 `attack_light` 播完回 idle。  
4. 记下 `displayScale` / 朝向，写进 `clips.json`。

**项目侧完成定义：**

- [ ] `private/runtime/ryu/ryu_c1.glb` 存在且可加载  
- [ ] 至少 `idle` + `attack_light`  
- [ ] `clips.json` 能对应 clip 名  
- [ ] 不依赖 Noesis/Blender 运行时  

---

## 3. 两条完整路径对照（你可二选一主做）

### 路径 α（推荐：动画质量优先）

```text
stm 原料
  → Blender 导入 3×mesh，合并骨架（RE-Mesh-Editor）
  → Noesis 试播并导出动画 FBX
  → Blender 做 Actions 命名 + 60fps
  → 导出 ryu_c1.glb
  → private/runtime + clips.json
  → Three 验收
```

### 路径 β（更快看模型：动画稍后）

```text
stm 原料
  → Blender 仅模型 → 导出 ryu_c1_mesh_only.glb
  → Three 先摆 T-pose / idle 占位
  → 再补路径 α 的动画步骤，覆盖为完整 glb
```

共识是「原版动作」，**β 只作中间里程碑，不是终点**。

---

## 4. 验收清单（打印用）

**原料（你已基本满足）**

- [x] `esf001` 模型 C1 三件套 mesh  
- [x] idle / attack / move 等 motlist  

**最终目标**

- [ ] 单一 `ryu_c1.glb`（一骨架 + 全身 mesh + 贴图可用）  
- [ ] clips：`idle`、`attack_light`（+ 建议 `move`/`damage`）  
- [ ] `clips.json` 映射与备注  
- [ ] 位于 `private/runtime/ryu/`  
- [ ] Three + WebGPU 能加载播放  
- [ ] 未把 mesh/motlist/glb 提交到 git  

---

## 5. 一句话

**最终目标：** 项目里用的是 **`private/runtime/ryu/ryu_c1.glb` + `clips.json`**，不是 pak 里的 mesh/motlist。  

**操作路径：** 解包原料（已完成）→ **Blender 合模** → **Noesis 搞动画（可经 FBX）** → **Blender 命名 clips → 导出 glb** → **拷入 private → Three 验收**。

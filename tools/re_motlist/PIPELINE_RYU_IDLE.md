# Ryu C1 特殊 Idle 管线（已验收）

> 状态：**可用 / 已验收**（2026-08）  
> 角色：相对「批量管线」的**特殊验证与小集交付管线**  
> 目标：RE Mesh 隆（C1）+ `esf001v00_idle` 选定 clip → `.blend` / `.fbx` / `.glb`  
> 动画：**自研 mot 绑定**（与 Noesis 对齐），**不依赖** Noesis 烤动画作默认路径

---

## 0. 结论（维护用）

| 项 | 约定 |
|----|------|
| 绑定 | `mot_absolute_full_chain` + **Mot 四元数共轭** + **dense lerp/slerp** |
| 公式 | `basis = MeshRestLocal⁻¹ @ MotLocal(t)`，`pos × 0.01`，**跳过 Root** |
| 时间轴 | 交付锁定 **60 fps**（glTF 存秒：`t = frame / 60`） |
| 默认 clips | **0, 1, 3**（`BAS_STD_Loop` / `BAS_TRN_STD` / `BAS_STD_IDLING_Loop`） |
| Mot 采样 | **逐逻辑帧 0..N dense + lerp/slerp**（禁止 hold 阶梯 → 抖） |
| Noesis GT | `noesis_out/noesis_idle_out.fbx`（验收）；默认 **不** bake FBX 到 mesh |
| 验收 | `scripts/compare_idle_vs_noesis.py`：mean 世界误差 &lt;2cm、jerk 比 &lt;2.5 |
| 批量管线 | 其它 motlist 走 batch（**同** dense+conjugate+disconnect）；本特殊管线默认导出 idle 三片 |

**历史坑（勿再引入）：**  
早期 clip0「看起来对」是因为默认 **整段拷贝 Noesis FBX pose basis**，未走 mot。clip1+ / 批量走未共轭的 mot → 拧臂。现已统一为 mot + conjugate。

---

## 1. 管线在做什么

```text
[1] 解包 SF6 → natives/stm/product/...
[2] Blender + RE Mesh Editor
      导入 esf001 001 的 00/01/02（rotate90 + 材质路径）
      合并单 Armature + 蒙皮
[3] 动画（默认 clips 0,1,3）
      解码 motlist.653 → mot absolute full-chain
      quat = conjugate(Mot)  → Blender
      可选 --compare-noesis（对照 GT，不替换 Action）
[4] 导出前锁定
      scene.render.fps = 60
      只保留当前 Action（避免残留 Noesis 轨进 GLB）
[5] 写出
      ryu_c1_clipXX_<base_name>.{blend,fbx,glb}
      clip0 额外别名 ryu_c1_idle.*
      + ryu_c1_mesh_only.blend + MANIFEST.txt
```

| 组件 | 职责 |
|------|------|
| **RE Mesh Editor** | 几何、骨架 rest、蒙皮（路径必须含 `natives/stm`） |
| **re_motlist** | 解码 motlist、共轭 quat、full-chain 绑到 RE Mesh |
| **Noesis idle FBX** | 可选验收 GT（`--compare-noesis`） |

---

## 2. 路径一览

### 工程与脚本

| 项 | 路径 |
|----|------|
| 工程根 | `…/GameProject/StreetFighter6` |
| 工具根 | `tools/re_motlist/` |
| 管线脚本 | `scripts/pipeline_ryu_idle.py` |
| 绑定实现 | `re_motlist/blender_import.py` → `apply_animation_mot_absolute_full_chain`、`mot_quat_to_blender` |
| 绑定史 / 失败路径 | `ANIM_BIND_FIX.md` |
| natives 准备 | `scripts/prepare_natives_layout.sh` |
| 默认产物 | `out/ryu_idle_pipeline/` |

### Blender

```text
/Users/yangjianlin/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender
```

版本：Blender 5.2（Steam）。插件：`RE-Mesh-Editor-main`、`re_motlist_import`。

### 模型（natives/stm）

```text
/Users/yangjianlin/Documents/SF6_export/natives/stm  → symlink → …/SF6_export/stm

…/product/model/esf/esf001/001/00|01|02/esf001_001_XX.mesh.*
同目录 *_v00.mdf2.31
```

首次若无 `natives/stm`：

```bash
bash tools/re_motlist/scripts/prepare_natives_layout.sh \
  /Users/yangjianlin/Documents/SF6_export
```

**禁止**对导入路径 `Path.resolve()` 消掉 `natives` 段（贴图/chunk 会挂）。

### 动画源（motlist）

```text
…/product/animation/esf/esf001/v00/motionlist/basic/esf001v00_idle.motlist.653
```

| Index | base_name | 帧数 @60 | 时长 | 说明 |
|------:|-----------|----------|------|------|
| 0 | `esf001_BAS_STD_Loop` | 396 | 6.600 s | 对战站立循环 |
| 1 | `esf001_BAS_TRN_STD` | 70 | 1.167 s | 站姿转身 |
| 3 | `esf001_BAS_STD_IDLING_Loop` | 158 | 2.633 s | 站立 idling 循环 |

常量：`DEFAULT_CLIPS = (0, 1, 3)`，`EXPORT_FPS = 60`。

### 可选 Noesis GT（对照，非默认烘焙）

| 文件 | 用途 |
|------|------|
| `…/SF6_export/noesis_out/esf001v00_idle_00_1animationtest.fbx` | clip0 对照 / 可选 bake |
| `…/noesis_out/idle_test.fbx` | 仅骨骼调试 |

---

## 3. 如何使用

```bash
BLENDER="/Users/yangjianlin/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender"
ROOT="/Users/yangjianlin/Library/Mobile Documents/com~apple~CloudDocs/GameProject/StreetFighter6/tools/re_motlist"
NAT="/Users/yangjianlin/Documents/SF6_export/natives/stm"

# 只验证模型
"$BLENDER" --background --python "$ROOT/scripts/pipeline_ryu_idle.py" -- \
  --stage mesh --natives-stm "$NAT" --out-dir "$ROOT/out/ryu_idle_pipeline"

# 完整交付：默认 clips 0,1,3 + mot full-chain @60fps
"$BLENDER" --background --python "$ROOT/scripts/pipeline_ryu_idle.py" -- \
  --stage full --natives-stm "$NAT" --out-dir "$ROOT/out/ryu_idle_pipeline"

# 与 Noesis 数值对照（写 compare_noesis.json，不替换 mot Action）
"$BLENDER" --background --python "$ROOT/scripts/pipeline_ryu_idle.py" -- \
  --stage full --clips 0,1,3 --compare-noesis \
  --natives-stm "$NAT" --out-dir "$ROOT/out/ryu_idle_pipeline" \
  --noesis-fbx "/Users/yangjianlin/Documents/SF6_export/noesis_out/esf001v00_idle_00_1animationtest.fbx"
```

### 常用参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `--stage mesh\|full` | `mesh` | mesh=只模型；full=模型+动画+导出 |
| `--natives-stm` | `…/natives/stm` | 必须含路径分量 `natives` |
| `--out-dir` | `out/ryu_idle_pipeline` | 输出目录 |
| `--clips` | `0,1,3` | 逗号分隔索引 |
| `--clip` | — | 单 clip（旧参数，优先于默认集） |
| `--fps` | `60`（强制） | 非 60 会被覆盖并 WARN |
| `--compare-noesis` | off | 对 `--noesis-clip` 写对照 JSON |
| `--noesis-fbx` | idle GT FBX 路径 | 对照 / 可选 bake |
| `--use-noesis-fbx` | off | 跳过 mot，烤 Noesis（仅 A/B） |
| `--noesis-clip` | `0` | compare / use-noesis 作用索引 |
| `--parts` | `00,01,02` | mesh 部件 |
| `--no-materials` | off | 调试用 |

### 日志应包含

```text
[pipeline] clips: [0, 1, 3] export_fps=60
[pipeline] mot absolute full-chain (quat=mot_conjugate; use_noesis=False)
[re_motlist] mot absolute full-chain: matched=123 … quat_convention=mot_conjugate
[pipeline] export timeline fps=60 frames=0..396 action='esf001_BAS_STD_Loop'
…
[pipeline] FULL STAGE DONE
```

---

## 4. 产物

目录：`tools/re_motlist/out/ryu_idle_pipeline/`

| 文件 | 说明 |
|------|------|
| `ryu_c1_clip00_esf001_BAS_STD_Loop.{blend,fbx,glb}` | clip0 |
| `ryu_c1_clip01_esf001_BAS_TRN_STD.*` | clip1 |
| `ryu_c1_clip03_esf001_BAS_STD_IDLING_Loop.*` | clip3 |
| `ryu_c1_idle.*` | clip0 兼容别名（多 clip 时由 clip0 拷贝） |
| `ryu_c1_mesh_only.blend` | 无动画对照 |
| `MANIFEST.txt` | 参数、bind、fps、路径 |
| `compare_noesis.json` | 仅 `--compare-noesis` 时 |

### 播放 / 运行时

- 时间轴：**逻辑帧 @ 60 fps**（clip0：`0..396` → GLB 时长 **6.6 s**）
- glTF **不写 fps 字段**；采样器时间为秒。运行时：`frame = floor(time * 60)`
- 第 0 帧应为 **对战待机**，不是 T-pose
- Headless Apple Silicon 常 **无贴图**（`libtexconv` 无 ARM）；几何/动画仍有效

### 验收参考（clip0 vs Noesis GT，纯 mot）

| 指标 | 量级 |
|------|------|
| mean 世界坐标误差 | ~**0.004** |
| mean basis 角误差 | ~**0.1°** |
| f0 | 约 **0** |

---

## 5. 绑定原理（维护摘要）

```text
RE Mesh rest locals  ==  Noesis mesh rest（bone 数据 /100）
Mot header rest      ≠  Mesh rest（旋转可差几十～一百多度）— 属正常
Mot 文件 quat        →  conjugate 后进入 Blender（等同 NoeQuat.transpose）
Mot 位移             →  ×0.01 进引擎单位
全链 key             →  所有 Mot bone header（缺轨用 header rest），避免 hybrid FK
跳过 Root            →  RE Mesh Root 含 rotate90；Mot Root 为 I
```

失败路径与过程记录：`ANIM_BIND_FIX.md`。

---

## 6. 扩展其它动作

**推荐（与验收路径一致）：** 仅有 `.motlist.653` 即可。

```bash
"$BLENDER" --background --python "$ROOT/scripts/pipeline_ryu_idle.py" -- \
  --stage full \
  --clips 0,2,5 \
  --natives-stm "$NAT" \
  --out-dir "$ROOT/out/ryu_xxx_pipeline"
```

（当前脚本 motlist 路径写死为 idle；换 motlist 请用 **批量管线** `pipeline_ryu_batch_motlist.py --motlist …`，绑定相同。）

可选：用 Noesis 导出 FBX 后 `--compare-noesis` 做数值回归；**不必**为每个 clip 备 FBX。

---

## 7. 已知限制

| 项 | 说明 |
|----|------|
| 贴图 headless | Apple Silicon 上 tex 常失败；GUI 或其它 tex 管线补 |
| IK/VFX 辅助骨 | Mot 有、mesh 无 → missing，可忽略（不进蒙皮） |
| 本脚本 motlist | 固定 `esf001v00_idle`；其它列表走 batch |
| `--use-noesis-fbx` | 会重映射 25→60 帧号；仅调试，非默认交付 |

---

## 8. 相关文件索引

```text
tools/re_motlist/
  PIPELINE_RYU_IDLE.md              ← 本文件
  PIPELINE_RYU_BATCH.md             ← 批量（同绑定）
  ANIM_BIND_FIX.md                  ← 绑定失败史与共轭修复
  README.md                         ← 工具总览
  scripts/pipeline_ryu_idle.py      ← 特殊管线入口
  re_motlist/blender_import.py      ← mot_quat_to_blender / full_chain
  out/ryu_idle_pipeline/            ← 默认产物
```

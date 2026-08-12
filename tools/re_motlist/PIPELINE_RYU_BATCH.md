# Ryu Motlist 批量导出管线

> 状态：与特殊 idle 管线 **同绑定 / 同 dense 采样**（2026-08 整改对齐）  
> 目标：一个 `.motlist.653` 内全部（或子集）clip → 独立 **GLB**（命名含索引 / 招式名 / motion_id / 帧数）  
> 首批示例：`basic/esf001v00_idle.motlist.653`（62 条）

**绑定与 60fps 交付以特殊管线为准：** [`PIPELINE_RYU_IDLE.md`](./PIPELINE_RYU_IDLE.md)  
**绑定原理 / 共轭 + dense 修复：** [`ANIM_BIND_FIX.md`](./ANIM_BIND_FIX.md)

---

## 1. 在做什么

```text
[1] RE Mesh 导入 esf001 001 的 00/01/02（natives/stm，rotate90）— 与 idle 管线同一套 helper
[2] 解析 motlist → base_name / motion_id / frames
[3] 每 clip：
      **默认全部**：mot absolute full-chain
        + Mot 四元数共轭
        + **dense 0..N + lerp/slerp**（禁止 sparse hold 阶梯抖）
        + 驱动前断开 use_connect（保留 C_Hip 位移）
      可选：--use-noesis-fbx 且 clip==--noesis-clip 时 Noesis **world-bake**
        → 键 0..logical_frames（勿信 Noesis 文件 25fps/13s）
[4] 导出前：EXPORT_FPS=60，只保留当前 Action，**再 disconnect 连骨**
[5] 写出 glb/ + catalog.json + MANIFEST.txt
```

| 组件 | 职责 |
|------|------|
| **RE Mesh Editor** | 几何 + 骨架 rest + 蒙皮（`natives/stm`） |
| **re_motlist** | 解析、解码、`apply_animation_mot_absolute_full_chain`（dense） |
| **pipeline_ryu_batch_motlist.py** | 循环、命名、目录；复用 `pipeline_ryu_idle` 的 mesh/export helper |

产物默认在 `private/assets/…`，**不自动接入** `app/`。

---

## 2. 命名规则

| 字段 | 来源 | 说明 |
|------|------|------|
| `index` | 0..N-1 | 三位前缀，目录排序 = 列表序 |
| `base_name` | mot 头名 | 如 `esf001_BAS_STD_Loop` |
| `motion_id` | motion IDs 表 | 四位零填充 |
| `frames` | `frame_count` 取整 | **60fps 逻辑帧数** |

```text
{index:03d}_{base_name}_id{motion_id:04d}_f{frames}.glb
```

示例：

```text
000_esf001_BAS_STD_Loop_id0000_f396.glb
001_esf001_BAS_TRN_STD_id0010_f70.glb
003_esf001_BAS_STD_IDLING_Loop_id0035_f158.glb
```

```bash
python3 tools/re_motlist/scripts/inspect_motlist.py \
  ".../basic/esf001v00_idle.motlist.653" --list-only
```

---

## 3. 输出目录

```text
private/assets/ryu/anims/{motlist父目录名}/{motlist主名}/
  glb/
  catalog.json
  MANIFEST.txt
  ryu_c1_mesh_only.blend   # 可选
  fbx/  blend/             # --export-fbx / --export-blend
```

idle 示例：`private/assets/ryu/anims/basic/esf001v00_idle/`

---

## 4. 绑定与帧率（与特殊管线对齐）

| 项 | 约定 |
|----|------|
| 默认 bind | `mot_absolute_full_chain` + **`mot_conjugate`** |
| Mot 采样 | **`dense_lerp_slerp`**：逻辑帧 0..N 逐帧 + lerp/slerp（**禁止** sparse union + hold） |
| 连骨 | 驱动前 / 导出前断开 `use_connect`，保留髋位移 |
| 公式 | `basis = MeshRestLocal⁻¹ @ MotLocal(t)`，`pos × 0.01`，跳过 Root |
| 导出 fps | **强制 60**（与特殊管线 `EXPORT_FPS` 一致） |
| glTF | 不存 fps 字段；`duration_sec ≈ frames/60` |
| Noesis FBX | **可选**覆盖单个 clip；world-bake → `0..logical_frames` |

特殊管线已用 clip0/1/3 验证 mot dense 路径与 Noesis 对齐（mean 世界误差约 3–4 mm、jerk≈1）；**批量应同质，不再默认依赖 Noesis 才「算对」**。

| 模式 | 何时 | 说明 |
|------|------|------|
| **mot full-chain + conjugate + dense** | **默认全部 clip** | 交付主路径（与特殊管线一致） |
| **Noesis world-bake** | 显式 `--use-noesis-fbx` 且 `idx == --noesis-clip` | 可选 A/B；**默认关闭**；非主路径 |

**历史坑（勿再引入）：**

| 之前 | 现在 |
|------|------|
| Mot 稀疏键 + hold | 0..N dense + lerp / slerp |
| 连骨 `use_connect` 丢髋位移 | 驱动前 / 导出前 disconnect |
| 可选 Noesis 按 25fps 重映射键帧 | world-bake 到逻辑 60；不信文件错误 fps |
| GT 路径旧 `esf001v00_idle_00_1animationtest.fbx` | 与特殊管线一致：`noesis_idle_out.fbx` |

---

## 5. 用法

```bash
BLENDER="/Users/yangjianlin/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender"
ROOT="/Users/yangjianlin/Library/Mobile Documents/com~apple~CloudDocs/GameProject/StreetFighter6/tools/re_motlist"
PROJECT="/Users/yangjianlin/Library/Mobile Documents/com~apple~CloudDocs/GameProject/StreetFighter6"
NAT="/Users/yangjianlin/Documents/SF6_export/natives/stm"
ML="$NAT/product/animation/esf/esf001/v00/motionlist/basic/esf001v00_idle.motlist.653"

# 列 clip
"$BLENDER" --background --python "$ROOT/scripts/pipeline_ryu_batch_motlist.py" -- \
  --list-only --motlist "$ML"

# 全量（默认 pure mot dense + conjugate @60fps；清理旧 glb）
"$BLENDER" --background --python "$ROOT/scripts/pipeline_ryu_batch_motlist.py" -- \
  --stage full \
  --natives-stm "$NAT" \
  --motlist "$ML" \
  --out-dir "$PROJECT/private/assets/ryu/anims/basic/esf001v00_idle" \
  --clean-glb

# 子集 / 续跑
  --clips 0,1,3
  --clip-range 0:9
  --skip-existing
```

### 常用参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `--stage list\|mesh\|full` | `full` | |
| `--motlist` | basic idle | 任意 esf001 `.motlist.653` |
| `--out-dir` | `private/assets/ryu/anims/<父>/<stem>/` | |
| `--clips` / `--clip-range` | 全部 | 子集 |
| `--use-noesis-fbx` | off | **可选**单 clip Noesis world-bake |
| `--noesis-fbx` / `--noesis-clip` | `noesis_idle_out.fbx` / 0 | 仅配合 `--use-noesis-fbx` |
| `--fps` | 60（锁定） | 与特殊管线 `EXPORT_FPS` 一致 |
| `--clean-glb` | off | 导出前删除 `glb/*.glb`（重建旧 hold/未共轭产物时开） |
| `--skip-existing` | off | |
| `--export-fbx` / `--export-blend` | off | 额外格式；FBX 对连骨/髋仍可能不如 GLB |

### 日志应包含

```text
[batch] bind contract: mot_absolute_full_chain + mot_conjugate + dense_lerp_slerp (parity=pipeline_ryu_idle)
[batch] export_fps locked to 60; sample_mode=dense_lerp_slerp
[batch] mot absolute full-chain (quat=mot_conjugate; sample=dense_lerp_slerp; …)
[re_motlist] disconnected N connected bones for Mot location
[re_motlist] mot absolute full-chain: matched=… times=… keys=…
[batch] pre-export disconnected N bones (hip loc / connect)
…
[batch] FULL STAGE DONE
```

---

## 6. 与特殊 idle 管线的关系

| | 特殊 Idle 管线 | Batch 管线 |
|--|----------------|------------|
| 脚本 | `pipeline_ryu_idle.py` | `pipeline_ryu_batch_motlist.py` |
| 模型 | RE Mesh 00/01/02 | 同（复用 helper） |
| 动画 | mot full-chain + conjugate + **dense** | **同** |
| 连骨 | disconnect | **同** |
| 默认 clip | 0,1,3（idle 列表） | motlist 全部或 `--clips` |
| 产出 | `out/ryu_idle_pipeline/ryu_c1_clipXX_*` | `private/assets/…/glb/NNN_*` |
| 用途 | 绑定验收、小集交付、对照 Noesis | 量产素材库 |
| fps | 强制 60 | 强制 60 |
| 验收 GT | `noesis_idle_out.fbx` + `compare_idle_vs_noesis.py` | 同源绑定；可对 idle 子集对照 |

**一句话：** 批量 = 任意 motlist 全量/子集 × 特殊管线同质绑定（dense + conjugate + disconnect）@60fps → 命名 GLB。

---

## 7. 扩展其它 motlist

```text
…/motionlist/basic/esf001v00_move.motlist.653
…/motionlist/basic/esf001v00_damage.motlist.653
…/motionlist/attack/…
```

换 `--motlist`，必要时显式 `--out-dir`。命名规则不变。  
重建旧产物时务必 `--clean-glb`（清除 hold 阶梯 / 未共轭时代的 GLB）。

---

## 8. 相关文件

```text
tools/re_motlist/
  PIPELINE_RYU_BATCH.md
  PIPELINE_RYU_IDLE.md
  ANIM_BIND_FIX.md
  scripts/pipeline_ryu_batch_motlist.py
  scripts/pipeline_ryu_idle.py
  scripts/compare_idle_vs_noesis.py
  scripts/inspect_motlist.py
  re_motlist/blender_import.py   # dense + disconnect 实现
private/assets/ryu/anims/
```

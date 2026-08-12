# Animation bind fix（RE Mesh + SF6 Mot）

维护状态：**交付绑定已定为 mot absolute full-chain + Mot 四元数共轭**（2026-08 特殊 idle 管线验收）。  
本文保留失败路径，避免回归。

验收管线：`PIPELINE_RYU_IDLE.md`  
实现：`re_motlist/blender_import.py` → `mot_quat_to_blender`、`apply_animation_mot_absolute_full_chain`

---

## 当前交付公式（唯一推荐）

```text
Mot quat → Blender:  conjugate  (w, -x, -y, -z)   # NoeQuat.transpose()
Mot pos  → engine:   × 0.01
basis    = MeshRestLocal⁻¹ @ MotLocal(t)         # 所有 Mot bone header
skip     = Root                                   # RE Mesh Root 含 rotate90
采样     = 逻辑帧 0..N dense + lerp/slerp         # 禁止 sparse hold（阶梯抖）
连骨     = 驱动前/导出前 disconnect use_connect  # 保留 C_Hip 位移
时间轴   = 60 fps 逻辑帧 → glTF 秒 = frame/60
```

事实（esf001）：

- RE Mesh rest locals **==** Noesis mesh rest（bone 数据 /100）
- Mot header rest **≠** Mesh rest（旋转差可很大）— 不能当「相对 idle 叠在 T-pose 上」
- 未共轭时手臂世界坐标相对 Noesis 偏 **~80–120°**；共轭后 joint world **Δ ≈ 0**
- 特殊管线 clip0 vs Noesis：`mean_world_dpos ~ 3–4e-3`，jerk 比接近 1，`ok=True`
- sparse Mot 键 + hold → 可见 Y/脚抖；dense 后消除

---

## 历史问题 1：网格爆炸

### Cause

`idle.blend` 用错单位把 Mot 绝对位移直接叠到 mesh rest：

```text
basis = MeshRest⁻¹ @ MotAnimAbsolute   # 位移仍在 ×100 空间
```

→ pose 偏移数十单位 → 炸模。

### Fix

```text
Mot 位移 ×0.01 再进 basis
```

---

## 历史问题 2：矩阵行/列与 rest/anim 不一致

Rest 用 NoeMat43 **行布局**，anim 用 Blender `Quaternion.to_matrix()` → 互为转置 → f0 假 180°。

### Fix

rest / anim **同一条** `_quat_to_blender_matrix` / `mot_quat_to_blender` 路径。

---

## 历史问题 3：T-pose 上叠微动 vs 拧身

RE Mesh bind locals ≠ Mot bind locals（转差异大，位移 ×0.01 后接近）。

| 方法 | 结果 |
|------|------|
| `MotRest⁻¹ @ MotAnim` 当 `matrix_basis` | 身体停在 mesh bind（T/A-pose）+ 微动 |
| `MeshRest⁻¹ @ MotAnim` **未共轭** | 髋/臂大角度拧斜 |
| 全链 `COPY_TRANSFORMS` 世界 bake | 肢长打架、拉伸 |
| 代理 `COPY_ROTATION` 世界 bake | 把 Mot bone roll 灌进 skin → 勿用 |

Root：RE Mesh **rotate90 在 Root**；Mot Root ≈ I。对 Root 做 `MeshRest⁻¹@Mot` 会拆掉 Z-up。

### partial keying

只 key `kf_bones` 出现的骨 → 未 key 骨停在 **mesh rest** → hybrid FK。  
full-chain：所有 Mot header 都采样（缺轨用 header rest）。

---

## 历史问题 4：「只有 Noesis idle 对」的假象（2026-08）

### Cause

特殊管线默认对 clip0 **整段 `apply_action_from_noesis_fbx`**（拷 pose basis），从未验证 mot。  
批量 / 其它 clip 走 unconjugated full-chain → 全错，唯 clip0「对」。

### Fix

1. 默认 **始终** mot full-chain + **conjugate**  
2. Noesis 仅 `--compare-noesis` / `--use-noesis-fbx`（可选）  
3. 导出锁定 **60 fps**，导出前只保留当前 Action  

---

## 历史问题 5：hold 阶梯抖 + 连骨丢髋（2026-08 dense 整改）

### Cause

- 只在 Mot **稀疏键**上 key，中间用 **hold** → 脚/髋 jerk 尖峰（阶梯）。
- RE Mesh `C_Hip.use_connect=True` → Blender 忽略 location → 髋位移丢。

### Fix

- `apply_animation_mot_absolute_full_chain`：逐逻辑帧 dense + lerp/slerp。
- 驱动前（及 idle/batch 导出前）`use_connect = False`。
- 批量管线与特殊管线共用该实现；重建旧 GLB 时 `--clean-glb`。

---

## Noesis GT 文件（对照用）

| 文件 | 说明 |
|------|------|
| `noesis_out/noesis_idle_out.fbx` | **默认 GT**（特殊 / 批量对照；按 6.6s@60 理解，不信文件 25fps） |
| `noesis_out/esf001v00_idle_00_1animationtest.fbx` | 旧对照 FBX |
| `noesis_out/idle_test.fbx` | 骨骼调试 |

对照脚本：`scripts/compare_idle_vs_noesis.py`（世界坐标误差 + jerk）。

Noesis 侧常见：object scale **0.01**、rot **X 90°**、无 Root 骨（C_Hip 为根）。  
对照时：mesh 世界坐标与 Noesis（含 object 变换）对齐；basis 对照 Noesis `location×0.01` + quat。

---

## Pipeline 标志（特殊管线）

```text
default              mot_absolute_full_chain + mot_conjugate + EXPORT_FPS=60
DEFAULT_CLIPS        0, 1, 3
--compare-noesis     写 compare_noesis.json（不替换 Action）
--use-noesis-fbx     可选 GT bake；键帧 25→60 重映射后导出
--noesis-fbx PATH    GT 路径
```

批量管线：`pipeline_ryu_batch_motlist.py` 调用同一 full-chain，导出同样强制 60 fps。

---

## 不要做

- 不要默认 Noesis bake 当「管线成功」判据  
- 不要省略 quat conjugate  
- 不要对 Root 写 Mot 绝对局部位移/旋转拆 rotate90  
- 不要只 key 部分骨  
- 不要用 25 fps 导出交付 GLB（glTF 用秒，错 fps 会拉长/压短整段动作）

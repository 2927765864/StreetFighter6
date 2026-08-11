# 临时动作包整理记录（2026-08-06）

> 实际文件在 **`private/interim/`**（gitignore，不提交）。  
> 本文件只记录来源、映射与用法，便于团队/未来自己回忆。  
> **全资产 T0 快照（模型+场景+动作+未解包）：** `docs/research/asset-readiness-t0.md` · 共识 §3.7。

## 已下载

| 内容 | 路径（相对仓库根） | 许可 |
|------|-------------------|------|
| Quaternius UAL1 Standard **FBX** | `private/interim/animations/selected/UAL1_Standard.fbx` | CC0 |
| 同包 **glTF + bin** | `private/interim/animations/selected/AnimationLibrary_Godot_Standard.*` | CC0 |
| clip 映射 | `private/interim/animations/selected/clip_map.json` | — |
| 说明 | `private/interim/README.md` | — |
| 冒烟 humanoid | `private/interim/characters/Xbot.glb`、`Soldier.glb`（three.js examples） | three.js 示例条款 |
| 隆模型 glb（社区 port） | `private/interim/characters/SF6 Ryu Model/SF6 Ryu No rig.glb` | Capcom 资产 / 私人用 |
| 训练场 glb（社区 port） | `private/interim/SF6 Training Stage/SF6 Training Stage.glb` | 同上 |

**状态（2026-08-06）：** 上表资源已在本机就位；**仍无自解包 mot/mesh 进入管线**。

## 推荐最小 clip 集

`idle` → Idle_Loop · `walk` → Walk_Loop · `attack_l`/`5lp` → Punch_Jab · `hit` → Hit_Chest · `block` → Sword_Idle（权宜）· `crouch` → Crouch_Idle_Loop

完整映射见 `clip_map.json`。

## 来源链接

- https://quaternius.com/packs/universalanimationlibrary.html  
- https://github.com/IAFahim/quaternius.universalAnimationLibrary.standard  
- https://github.com/J-Ponzo/gltf-universal-animation-library  
- https://threejs.org/examples/models/gltf/Xbot.glb  

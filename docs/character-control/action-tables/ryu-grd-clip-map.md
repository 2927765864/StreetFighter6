# Ryu GRD 片映射说明

> 磁盘实证：`private/assets/ryu/anims/basic/esf001v00_idle/glb/`（`DRD_*`；不用 `idle_tired` 的 `GRD_*`）  
> 运行时：`app/public/data/clips/ryu_logic_to_glb_map.json`  
> 选择算法：`app/src/combat/systems/GuardPolicy.ts`

| logicId | 文件 | 用途 |
|---------|------|------|
| `block_stand_start` | `DRD_STD_H_START` f11 | 站防进入；alias `block_stand` |
| `block_stand_loop` | `DRD_STD_H_Loop` f192 | 硬直结束仍站防 |
| `block_crouch_start` | `DRD_CRH_H_START` f11 | 蹲防进入 |
| `block_crouch_loop` | `DRD_CRH_H_Loop` f269 | 硬直结束仍蹲防 |
| `grd_h{s}_st` | `DRD_H*` | **上段** 站防（官方 H 站轻拳等 + 官方 M 过顶） |
| `grd_m{s}_st` | `DRD_M*` | **中段躯干** 站防（预留；不由官方 H 自动选出） |
| `grd_l{s}_st` | `DRD_L*` | 站防下段反应（站防接下段通常防不住） |
| `grd_c{s}_st` | `DRD_C*` | 蹲防中段 |
| `grd_d{s}_st` | `DRD_D*` | **下段** 蹲防 |
| `grd_*_lt/_rt` | 同族左右 | `mapped_unused`，默认不选 |

轻重：优先招式 `guardStrength`（HIT_DT `_IsStrength_L/M/H`）。缺省才用 `hitstopOnBlock` 分档（≤9 L / 10–12 M / ≥13 H）。
站防高度：招式 `guardAnim`（`h`/`m`/`l` 或按段数组）与官方 `guard` 分开。5LP=`h`；5MP/5HP=`m`；6HP=`[m,m]`；6MP=`[m,l]`；4HK=`[h,m]`。第二段命中硬切重播格挡片。
下段蹲防：2LK→`grd_dl_st`，2MK→`grd_dm_st`，2HK→`grd_dh_st`。

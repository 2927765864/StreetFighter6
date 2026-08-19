# Ryu GRD 片映射说明

> 磁盘实证：`private/assets/ryu/anims/basic/esf001v00_idle_tired/glb/`  
> 运行时：`app/public/data/clips/ryu_logic_to_glb_map.json`  
> 选择算法：`app/src/combat/systems/GuardPolicy.ts`

| logicId | 文件 | 用途 |
|---------|------|------|
| `block_stand_start` | `GRD_STD_START` f24 | 站防进入；alias `block_stand` |
| `block_stand_loop` | `GRD_STD_Loop` f190 | 硬直结束仍站防 |
| `block_crouch_start` | `GRD_CRH_START` f24 | 蹲防进入 |
| `block_crouch_loop` | `GRD_CRH_Loop` f190 | 硬直结束仍蹲防 |
| `grd_h{s}_st` | `GRD_H*` | **上段/过顶** 站防（官方 M / 跳攻） |
| `grd_m{s}_st` | `GRD_M*` | **中段** 站防（官方 H，可站可蹲） |
| `grd_l{s}_st` | `GRD_L*` | 站防下段反应（站防接下段通常防不住） |
| `grd_c{s}_st` | `GRD_C*` | 蹲防中段 |
| `grd_d{s}_st` | `GRD_D*` | **下段** 蹲防 |
| `grd_*_lt/_rt` | 同族左右 | `mapped_unused`，默认不选 |

轻重：优先招式 `guardStrength`（HIT_DT `_IsStrength_L/M/H`）。缺省才用 `hitstopOnBlock` 分档（≤9 L / 10–12 M / ≥13 H）。
下段蹲防：2LK→`grd_dl_st`，2MK→`grd_dm_st`，2HK→`grd_dh_st`。

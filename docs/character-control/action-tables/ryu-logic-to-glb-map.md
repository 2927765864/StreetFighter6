# 隆逻辑招式 → glb 映射表

> **版本**：1 · **生成**：2026-08-10  
> **资产根**：`private/assets/ryu/anims`  
> **机器可读**：`ryu-logic-to-glb-map.json`（同步 `app/public/data/clips/ryu_logic_to_glb_map.json`）  

## 策略

- Super / 6HK：**不映射**（按你的决定延后）。
- L/M/H/OD 暂共用主 clip。
- 多段招：`clips[].role` = start / loop / end。
- 逻辑帧驱动 scrub，不以 glb `frameCount` 为招式总长。

## 摘要：mapped **44** / 其它 **4**

## 总表

| 状态 | moveId | 指令 | 名称 | primary path | clips |
|------|--------|------|------|--------------|-------|
| ✅ mapped | `ryu_5lp` | 5LP | Standing LP | `attack/esf001v00_attack_00/glb/000_esf001_ATK_5LP_id0000_f39.glb` | 1 (main) |
| ✅ mapped | `ryu_5mp` | 5MP | Standing MP | `attack/esf001v00_attack_01/glb/000_esf001_ATK_5MP_id0000_f53.glb` | 1 (main) |
| ✅ mapped | `ryu_5hp` | 5HP | Standing HP | `attack/esf001v00_attack_02/glb/000_esf001_ATK_5HP_id0000_f79.glb` | 1 (main) |
| ✅ mapped | `ryu_5lk` | 5LK | Standing LK | `attack/esf001v00_attack_03/glb/000_esf001_ATK_5LK_id0000_f48.glb` | 1 (main) |
| ✅ mapped | `ryu_5mk` | 5MK | Standing MK | `attack/esf001v00_attack_04/glb/000_esf001_ATK_5MK_id0000_f89.glb` | 1 (main) |
| ✅ mapped | `ryu_5hk` | 5HK | Standing HK | `attack/esf001v00_attack_05/glb/000_esf001_ATK_5HK_id0000_f86.glb` | 1 (main) |
| ✅ mapped | `ryu_2lp` | 2LP | Crouching LP | `attack/esf001v00_attack_06/glb/000_esf001_ATK_2LP_id2000_f58.glb` | 1 (main) |
| ✅ mapped | `ryu_2mp` | 2MP | Crouching MP | `attack/esf001v00_attack_07/glb/000_esf001_ATK_2MP_id2000_f46.glb` | 1 (main) |
| ✅ mapped | `ryu_2hp` | 2HP | Crouching HP | `attack/esf001v00_attack_08/glb/000_esf001_ATK_2HP_id2000_f76.glb` | 1 (main) |
| ✅ mapped | `ryu_2lk` | 2LK | Crouching LK | `attack/esf001v00_attack_09/glb/000_esf001_ATK_2LK_id2000_f83.glb` | 1 (main) |
| ✅ mapped | `ryu_2mk` | 2MK | Crouching MK | `attack/esf001v00_attack_10/glb/000_esf001_ATK_2MK_Y2_id2000_f58.glb` | 1 (main) |
| ✅ mapped | `ryu_2hk` | 2HK | Crouching HK | `attack/esf001v00_attack_11/glb/000_esf001_ATK_2HK_id2000_f145.glb` | 1 (main) |
| ✅ mapped | `ryu_jlp` | j.LP | Jump LP | `attack/esf001v00_attack_12/glb/000_esf001_ATK_8LP_id3000_f47.glb` | 1 (main) |
| ✅ mapped | `ryu_jmp` | j.MP | Jump MP | `attack/esf001v00_attack_13/glb/000_esf001_ATK_8MP_id3000_f49.glb` | 1 (main) |
| ✅ mapped | `ryu_jhp` | j.HP | Jump HP | `attack/esf001v00_attack_14/glb/000_esf001_ATK_8HP_id3000_f48.glb` | 1 (main) |
| ✅ mapped | `ryu_jlk` | j.LK | Jump LK | `attack/esf001v00_attack_15/glb/000_esf001_ATK_8LK_id3000_f52.glb` | 1 (main) |
| ✅ mapped | `ryu_jmk` | j.MK | Jump MK | `attack/esf001v00_attack_16/glb/000_esf001_ATK_8MK_id3000_f60.glb` | 1 (main) |
| ✅ mapped | `ryu_jhk` | j.HK | Jump HK | `attack/esf001v00_attack_17/glb/000_esf001_ATK_8HK_id3000_f82.glb` | 1 (main) |
| ✅ mapped | `ryu_6mp` | 6+MP | Collarbone Breaker | `basic/esf001v00_skill_00/glb/000_esf001_ATK_6MP_id0000_f115.glb` | 1 (main) |
| ✅ mapped | `ryu_6hp` | 6+HP | Solar Plexus Strike | `basic/esf001v00_skill_01/glb/000_esf001_ATK_6HP_id0000_f90.glb` | 1 (main) |
| ✅ mapped | `ryu_4hp` | 4+HP | Short Uppercut | `basic/esf001v00_skill_05/glb/000_esf001_ATK_4HP_id0000_f82.glb` | 1 (main) |
| ✅ mapped | `ryu_4hk` | 4+HK | Axe Kick | `basic/esf001v00_skill_02/glb/000_esf001_ATK_4HK_id0000_f140.glb` | 1 (main) |
| ✅ mapped | `ryu_3hk` | 3HK | 3HK (disk) | `basic/esf001v00_skill_03/glb/000_esf001_ATK_3HK_id0000_f111.glb` | 1 (main) |
| ⏸ unmapped | `ryu_6hk` | 6+HK | Whirlwind Kick | `—` | 0 (—) |
| ✅ mapped | `ryu_hadoken` | 236+P | Hadoken | `specialskill/esf001v00_specialskill_00/glb/000_esf001_SPA_HADO_id0000_f110.glb` | 1 (main) |
| ✅ mapped | `ryu_shoryuken` | 623+P | Shoryuken | `specialskill/esf001v00_specialskill_01/glb/000_esf001_SPA_SYORYU_START_id0200_f49.glb` | 2 (start,end) |
| ✅ mapped | `ryu_tatsu` | 214+K | Tatsumaki | `specialskill/esf001v00_specialskill_02/glb/000_esf001_SPA_TATSUMAKI_START_id0200_f14.glb` | 3 (start,loop,end) |
| ✅ mapped | `ryu_air_tatsu` | j.214+K | Aerial Tatsumaki | `specialskill/esf001v00_specialskill_02/glb/003_esf001_SPA_TATSUMAKI_AIR_START_id0300_f9.glb` | 2 (start,end) |
| ✅ mapped | `ryu_blade` | 236+K | High Blade Kick | `specialskill/esf001v00_specialskill_04/glb/000_esf001_SPA_SOKUTOU_L_id0000_f98.glb` | 1 (main) |
| ✅ mapped | `ryu_hashogeki` | 214+P | Hashogeki | `specialskill/esf001v00_specialskill_03/glb/000_esf001_SPA_HADOSHO_id0200_f128.glb` | 2 (main,variant_l) |
| ✅ mapped | `ryu_denjin_charge` | 22+P | Denjin Charge | `specialskill/esf001v00_specialskill_05/glb/000_esf001_SPA_KIAITAME_id0000_f95.glb` | 3 (main,variant_2,variant_3) |
| ⏸ deferred | `ryu_sa1` | 236236+P | Shinku Hadoken | `—` | 0 (—) |
| ⏸ deferred | `ryu_sa2` | 214214+P | Shin Hashogeki | `—` | 0 (—) |
| ⏸ deferred | `ryu_sa3` | 236236+K | Shin Shoryuken | `—` | 0 (—) |
| ✅ mapped | `idle` | — | Stand idle | `basic/esf001v00_idle/glb/000_esf001_BAS_STD_Loop_id0000_f396.glb` | 2 (main,idling) |
| ✅ mapped | `walk_fwd` | 6 | Walk forward | `basic/esf001v00_move/glb/011_esf001_BAS_FORWARD_START_id5000_f19.glb` | 3 (start,loop,end) |
| ✅ mapped | `walk_back` | 4 | Walk back | `basic/esf001v00_move/glb/017_esf001_BAS_BACKWARD_START_id5200_f15.glb` | 3 (start,loop,end) |
| ✅ mapped | `crouch` | 2 | Crouch idle | `basic/esf001v00_idle/glb/004_esf001_BAS_CRH_Loop_id0100_f240.glb` | 3 (main,stand_to_crouch,crouch_to_stand) |
| ✅ mapped | `dash_fwd` | 66 | Forward dash | `basic/esf001v00_move/glb/000_esf001_BAS_DASH_F_id0100_f42.glb` | 1 (main) |
| ✅ mapped | `dash_back` | 44 | Back dash | `basic/esf001v00_move/glb/001_esf001_BAS_DASH_B_id0110_f40.glb` | 1 (main) |
| ✅ mapped | `jump_n` | 8 | Neutral jump | `basic/esf001v00_move/glb/002_esf001_BAS_JUMP_N_START_id0200_f4.glb` | 3 (prejump,air,land) |
| ✅ mapped | `jump_f` | 9 | Forward jump | `basic/esf001v00_move/glb/005_esf001_BAS_JUMP_F_START_id0300_f4.glb` | 3 (prejump,air,land) |
| ✅ mapped | `jump_b` | 7 | Back jump | `basic/esf001v00_move/glb/008_esf001_BAS_JUMP_B_START_id0400_f4.glb` | 3 (prejump,air,land) |
| ✅ mapped | `hitstun_light` | — | Damage light stand (sample) | `basic/esf001v00_damage/glb/000_esf001_0010_DMG_HL_ST_id0010_f29.glb` | 1 (main) |
| ✅ mapped | `block_stand` | 4 | Guard stand start (sample) | `basic/esf001v00_idle_tired/glb/008_esf001_5000_GRD_STD_START_id0500_f24.glb` | 1 (main) |
| ✅ mapped | `drive_parry` | MP+MK | Drive Parry | `basic/esf001v00_sabaki/glb/000_esf001_DPA_STD_START_id0400_f160.glb` | 3 (start,loop,end) |
| ✅ mapped | `throw_fwd` | LP+LK | Throw forward (sample) | `basic/esf001v00_throw/glb/001_esf001_NGA_6_id0100_f122.glb` | 1 (main) |
| ✅ mapped | `throw_back` | 4+LP+LK | Throw back (sample) | `basic/esf001v00_throw/glb/002_esf001_NGA_4_id0200_f127.glb` | 1 (main) |

## 多段招示例

### `ryu_shoryuken`

- **start**: `specialskill/esf001v00_specialskill_01/glb/000_esf001_SPA_SYORYU_START_id0200_f49.glb` (49f, id=200)
- **end**: `specialskill/esf001v00_specialskill_01/glb/001_esf001_SPA_SYORYU_END_id0210_f97.glb` (97f, id=210)

### `ryu_tatsu`

- **start**: `specialskill/esf001v00_specialskill_02/glb/000_esf001_SPA_TATSUMAKI_START_id0200_f14.glb` (14f, id=200)
- **loop**: `specialskill/esf001v00_specialskill_02/glb/001_esf001_SPA_TATSUMAKI_LOOP_id0210_f16.glb` (16f, id=210)
- **end**: `specialskill/esf001v00_specialskill_02/glb/002_esf001_SPA_TATSUMAKI_END_id0220_f93.glb` (93f, id=220)

### `ryu_air_tatsu`

- **start**: `specialskill/esf001v00_specialskill_02/glb/003_esf001_SPA_TATSUMAKI_AIR_START_id0300_f9.glb` (9f, id=300)
- **end**: `specialskill/esf001v00_specialskill_02/glb/004_esf001_SPA_TATSUMAKI_AIR_END_id0310_f48.glb` (48f, id=310)

### `walk_fwd`

- **start**: `basic/esf001v00_move/glb/011_esf001_BAS_FORWARD_START_id5000_f19.glb` (19f, id=5000)
- **loop**: `basic/esf001v00_move/glb/012_esf001_BAS_FORWARD_Loop_id5010_f114.glb` (114f, id=5010)
- **end**: `basic/esf001v00_move/glb/013_esf001_BAS_FORWARD_END_id5020_f47.glb` (47f, id=5020)

### `jump_n`

- **prejump**: `basic/esf001v00_move/glb/002_esf001_BAS_JUMP_N_START_id0200_f4.glb` (4f, id=200)
- **air**: `basic/esf001v00_move/glb/003_esf001_BAS_JUMP_N_AIR_id0205_f40.glb` (40f, id=205)
- **land**: `basic/esf001v00_move/glb/004_esf001_BAS_JUMP_N_LAND_id0210_f20.glb` (20f, id=210)

### `drive_parry`

- **start**: `basic/esf001v00_sabaki/glb/000_esf001_DPA_STD_START_id0400_f160.glb` (160f, id=400)
- **loop**: `basic/esf001v00_sabaki/glb/001_esf001_DPA_STD_Loop_id0410_f597.glb` (597f, id=410)
- **end**: `basic/esf001v00_sabaki/glb/002_esf001_DPA_STD_END_id0420_f214.glb` (214f, id=420)

## 变体（可选）

### `ryu_5lp`
- `ATK_5LP_B` → `attack/esf001v00_attack_00/glb/001_esf001_ATK_5LP_B_id0001_f38.glb`
- `ATK_5LP_C` → `attack/esf001v00_attack_00/glb/002_esf001_ATK_5LP_C_id0002_f38.glb`

### `ryu_5hk`
- `ATK_5HK_G` → `attack/esf001v00_attack_05/glb/001_esf001_ATK_5HK_G_id0005_f47.glb`
- `ATK_5HK_2` → `attack/esf001v00_attack_05/glb/002_esf001_ATK_5HK_2_id0006_f114.glb`

### `ryu_2lp`
- `ATK_2LP_B` → `attack/esf001v00_attack_06/glb/001_esf001_ATK_2LP_B_id2001_f58.glb`
- `ATK_2LP_C` → `attack/esf001v00_attack_06/glb/002_esf001_ATK_2LP_C_id2002_f58.glb`

### `ryu_2hp`
- `ATK_2HP_H` → `attack/esf001v00_attack_08/glb/001_esf001_ATK_2HP_H_id2005_f80.glb`

### `ryu_2lk`
- `ATK_2LK_B` → `attack/esf001v00_attack_09/glb/001_esf001_ATK_2LK_B_id2001_f82.glb`
- `ATK_2LK_C` → `attack/esf001v00_attack_09/glb/002_esf001_ATK_2LK_C_id2002_f82.glb`

### `ryu_2hk`
- `ATK_2HK_G` → `attack/esf001v00_attack_11/glb/001_esf001_ATK_2HK_G_id2005_f97.glb`

### `ryu_4hp`
- `ATK_4HP_H` → `basic/esf001v00_skill_05/glb/001_esf001_ATK_4HP_H_id0001_f100.glb`

## aliasIndex（节选）

逻辑/简写 → moveId，完整见 JSON `aliasIndex`。

| alias | moveId |
|-------|--------|
| `5lp` | `ryu_5lp` |
| `hadoken` | `ryu_hadoken` |
| `dp` | `ryu_shoryuken` |
| `tatsu` | `ryu_tatsu` |
| `idle` | `idle` |
| `walk` | `walk_fwd` |
| `parry` | `drive_parry` |
| `denjin` | `ryu_denjin_charge` |

## 修订

| 日期 | 说明 |
|------|------|
| 2026-08-10 | 初版：普攻/移动/必杀映射；SA/6HK deferred |
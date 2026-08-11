# 隆指令表 ↔ glb 覆盖对照

> **生成**：2026-08-10（扫描 `private/assets/ryu/anims`）  
> **glb 总数**：307  
> **对照结果**：FOUND **41** / MISSING **12**（共 53 行）  
> **说明**：按**文件名启发式**匹配，不是帧数据审查；FOUND ≠ 已接入运行时。
> **更新**：必杀已补入 `specialskill/` — 详见 [`ryu-special-glb-coverage.md`](./ryu-special-glb-coverage.md)（复扫）。 旧文 §2 中 special_super 全 MISSING **已过时**。

机器可读：`ryu-anim-glb-coverage.json`

---

## 0. 摘要

| 类别 | FOUND | MISSING |
|------|-------|---------|
| normal | 18 | 0 |
| unique | 5 | 1 |
| target_combo | 2 | 0 |
| special_super | 0 | 10 |
| movement_system | 16 | 1 |

### 一句话

- **站/蹲/跳普攻 + 多数指令普攻 + 走蹲跳 dash + 受击/防御/投相关文件名：覆盖良好。**
- **必杀/超必杀按英文关键词在文件名中：基本 MISSING（或未用可读英文命名）。**
- 当前 `skill_*` 包内容是 **6MP/6HP/4HK 等**，不是 236 波动命名。

---

## 1. 对照总表

| 状态 | 分类 | moveId | 指令 | 名称 | 命中数 | 示例 key |
|------|------|--------|------|------|--------|----------|
| ✅ FOUND | normal | `ryu_5lp` | 5LP | Standing LP | 3 | `5LP_C` |
| ✅ FOUND | normal | `ryu_5mp` | 5MP | Standing MP | 1 | `5MP` |
| ✅ FOUND | normal | `ryu_5hp` | 5HP | Standing HP | 1 | `5HP` |
| ✅ FOUND | normal | `ryu_5lk` | 5LK | Standing LK | 1 | `5LK` |
| ✅ FOUND | normal | `ryu_5mk` | 5MK | Standing MK | 1 | `5MK` |
| ✅ FOUND | normal | `ryu_5hk` | 5HK | Standing HK | 3 | `5HK_G` |
| ✅ FOUND | normal | `ryu_2lp` | 2LP | Crouching LP | 3 | `2LP` |
| ✅ FOUND | normal | `ryu_2mp` | 2MP | Crouching MP | 1 | `2MP` |
| ✅ FOUND | normal | `ryu_2hp` | 2HP | Crouching HP | 2 | `2HP` |
| ✅ FOUND | normal | `ryu_2lk` | 2LK | Crouching LK | 3 | `2LK_C` |
| ✅ FOUND | normal | `ryu_2mk` | 2MK | Crouching MK | 1 | `2MK_Y2` |
| ✅ FOUND | normal | `ryu_2hk` | 2HK | Crouching HK | 2 | `2HK` |
| ✅ FOUND | normal | `ryu_jlp` | j.LP / 8LP | Jump LP | 1 | `8LP` |
| ✅ FOUND | normal | `ryu_jmp` | j.MP / 8MP | Jump MP | 1 | `8MP` |
| ✅ FOUND | normal | `ryu_jhp` | j.HP / 8HP | Jump HP | 1 | `8HP` |
| ✅ FOUND | normal | `ryu_jlk` | j.LK / 8LK | Jump LK | 1 | `8LK` |
| ✅ FOUND | normal | `ryu_jmk` | j.MK / 8MK | Jump MK | 1 | `8MK` |
| ✅ FOUND | normal | `ryu_jhk` | j.HK / 8HK | Jump HK | 1 | `8HK` |
| ✅ FOUND | unique | `ryu_6mp` | 6+MP | Collarbone Breaker | 1 | `6MP` |
| ✅ FOUND | unique | `ryu_6hp` | 6+HP | Solar Plexus Strike | 1 | `6HP` |
| ✅ FOUND | unique | `ryu_4hp` | 4+HP | Short Uppercut | 2 | `4HP_H` |
| ✅ FOUND | unique | `ryu_4hk` | 4+HK | Axe Kick | 1 | `4HK` |
| ❌ MISSING | unique | `ryu_6hk` | 6+HK | Whirlwind Kick | 0 | `—` |
| ✅ FOUND | unique | `ryu_3hk` | 3HK? | Possible sweep/unique 3HK | 1 | `3HK` |
| ✅ FOUND | target_combo | `ryu_tc_hp_hk` | 5HP~5HK | High Double Strike | 4 | `5HP` |
| ✅ FOUND | target_combo | `ryu_tc_fuwa` | 5MP~5LK~5HK | Fuwa Triple Strike | 5 | `5LK` |
| ❌ MISSING | special_super | `ryu_hadoken` | 236+P | Hadoken | 0 | `—` |
| ❌ MISSING | special_super | `ryu_shoryuken` | 623+P | Shoryuken | 0 | `—` |
| ❌ MISSING | special_super | `ryu_tatsu` | 214+K | Tatsumaki | 0 | `—` |
| ❌ MISSING | special_super | `ryu_air_tatsu` | j.214+K | Aerial Tatsumaki | 0 | `—` |
| ❌ MISSING | special_super | `ryu_blade` | 236+K | High Blade Kick | 0 | `—` |
| ❌ MISSING | special_super | `ryu_hashogeki` | 214+P | Hashogeki | 0 | `—` |
| ❌ MISSING | special_super | `ryu_denjin_charge` | 22+P | Denjin Charge | 0 | `—` |
| ❌ MISSING | special_super | `ryu_sa1` | 236236+P | Shinku Hadoken | 0 | `—` |
| ❌ MISSING | special_super | `ryu_sa2` | 214214+P | Shin Hashogeki | 0 | `—` |
| ❌ MISSING | special_super | `ryu_sa3` | 236236+K | Shin Shoryuken | 0 | `—` |
| ✅ FOUND | movement_system | `idle` | — | Stand idle | 4 | `STD_IDLING_Loop` |
| ✅ FOUND | movement_system | `walk_fwd` | 6 hold | Walk forward | 6 | `FORWARD_START` |
| ✅ FOUND | movement_system | `walk_back` | 4 hold | Walk back | 6 | `BACKWARD_START` |
| ✅ FOUND | movement_system | `crouch` | 2 | Crouch | 5 | `CRH_STD_tired` |
| ✅ FOUND | movement_system | `dash_fwd` | 66 | Forward dash | 1 | `DASH_F` |
| ✅ FOUND | movement_system | `dash_back` | 44 | Back dash | 1 | `DASH_B` |
| ✅ FOUND | movement_system | `jump_n` | 8 | Neutral jump | 3 | `JUMP_N_AIR` |
| ✅ FOUND | movement_system | `jump_f` | 9 | Forward jump | 3 | `JUMP_F_START` |
| ✅ FOUND | movement_system | `jump_b` | 7 | Back jump | 3 | `JUMP_B_LAND` |
| ✅ FOUND | movement_system | `throw` | LP+LK | Throw | 7 | `NGF` |
| ✅ FOUND | movement_system | `damage` | — | Hitstun/damage family | 100 | `0350_DMG_CH_ST` |
| ✅ FOUND | movement_system | `guard` | 4/1 | Block/guard family | 45 | `5410_GRD_CH_LT` |
| ✅ FOUND | movement_system | `drive_parry` | MP+MK | Drive Parry family | 13 | `DPA_H_LT` |
| ✅ FOUND | movement_system | `drive_related` | DI/DR | Drive / DRD family | 53 | `ATK_CTA_DASH` |
| ✅ FOUND | movement_system | `counterattack` | — | Counterattack pack | 3 | `ATK_CTA_DASH` |
| ❌ MISSING | movement_system | `sabaki` | — | Sabaki pack | 0 | `—` |
| ✅ FOUND | movement_system | `recovery` | — | Recovery poses | 2 | `BAS_CRH_RECOVERY` |

---

## 2. MISSING 清单（优先补资产或确认命名）

### 2.1 真实缺文件名匹配（11 项招式）

| moveId | 名称 | 指令 | 备注 |
|--------|------|------|------|
| `ryu_6hk` | Whirlwind Kick | 6+HK | ATK 列表中**无** `6HK`（有 6MP/6HP/4HK/3HK） |
| `ryu_hadoken` | Hadoken | 236+P | 无 Hadoken 等可读名 |
| `ryu_shoryuken` | Shoryuken | 623+P | 无 |
| `ryu_tatsu` | Tatsumaki | 214+K | 无 |
| `ryu_air_tatsu` | Aerial Tatsumaki | j.214+K | 无 |
| `ryu_blade` | High Blade Kick | 236+K | 无 |
| `ryu_hashogeki` | Hashogeki | 214+P | 无 |
| `ryu_denjin_charge` | Denjin Charge | 22+P | 无 |
| `ryu_sa1` | Shinku Hadoken | 236236+P | 无 |
| `ryu_sa2` | Shin Hashogeki | 214214+P | 无 |
| `ryu_sa3` | Shin Shoryuken | 236236+K | 无 |

→ **必杀 / 超必杀：在本目录中按文件名视为未导入（或命名不含英文招名）。**

### 2.2 扫描假阴性（1 项）

| 扫描行 | 说明 |
|--------|------|
| `sabaki` | 目录 `esf001v00_sabaki` 内 **13 个 glb 全是 `DPA_*`（Drive Parry）**，已计入上方 `drive_parry` FOUND。属 **pack 名与内容不一致**，不是「缺 parry 动画」。 |

### 2.3 磁盘有、指令表未单列的 ATK 变体

`2HK_G`, `2HP_H`, `2LK_B/C`, `2LP_B/C`, `2MK_Y2`, `4HP_H`, `5HK_2`, `5HK_G`, `5LP_B/C`, `3HK`, `CTA`, `CTA_4`, `CTA_DASH` 等 — 需人工挂 `moveId`。

---


## 3. FOUND 明细（路径抽样）

### `ryu_5lp` — Standing LP

- 指令：`5LP` · 命中 **3** 个 glb
  - `5LP_C` → `attack/esf001v00_attack_00/glb/002_esf001_ATK_5LP_C_id0002_f38.glb`
  - `5LP_B` → `attack/esf001v00_attack_00/glb/001_esf001_ATK_5LP_B_id0001_f38.glb`
  - `5LP` → `attack/esf001v00_attack_00/glb/000_esf001_ATK_5LP_id0000_f39.glb`

### `ryu_5mp` — Standing MP

- 指令：`5MP` · 命中 **1** 个 glb
  - `5MP` → `attack/esf001v00_attack_01/glb/000_esf001_ATK_5MP_id0000_f53.glb`

### `ryu_5hp` — Standing HP

- 指令：`5HP` · 命中 **1** 个 glb
  - `5HP` → `attack/esf001v00_attack_02/glb/000_esf001_ATK_5HP_id0000_f79.glb`

### `ryu_5lk` — Standing LK

- 指令：`5LK` · 命中 **1** 个 glb
  - `5LK` → `attack/esf001v00_attack_03/glb/000_esf001_ATK_5LK_id0000_f48.glb`

### `ryu_5mk` — Standing MK

- 指令：`5MK` · 命中 **1** 个 glb
  - `5MK` → `attack/esf001v00_attack_04/glb/000_esf001_ATK_5MK_id0000_f89.glb`

### `ryu_5hk` — Standing HK

- 指令：`5HK` · 命中 **3** 个 glb
  - `5HK_G` → `attack/esf001v00_attack_05/glb/001_esf001_ATK_5HK_G_id0005_f47.glb`
  - `5HK_2` → `attack/esf001v00_attack_05/glb/002_esf001_ATK_5HK_2_id0006_f114.glb`
  - `5HK` → `attack/esf001v00_attack_05/glb/000_esf001_ATK_5HK_id0000_f86.glb`

### `ryu_2lp` — Crouching LP

- 指令：`2LP` · 命中 **3** 个 glb
  - `2LP` → `attack/esf001v00_attack_06/glb/000_esf001_ATK_2LP_id2000_f58.glb`
  - `2LP_C` → `attack/esf001v00_attack_06/glb/002_esf001_ATK_2LP_C_id2002_f58.glb`
  - `2LP_B` → `attack/esf001v00_attack_06/glb/001_esf001_ATK_2LP_B_id2001_f58.glb`

### `ryu_2mp` — Crouching MP

- 指令：`2MP` · 命中 **1** 个 glb
  - `2MP` → `attack/esf001v00_attack_07/glb/000_esf001_ATK_2MP_id2000_f46.glb`

### `ryu_2hp` — Crouching HP

- 指令：`2HP` · 命中 **2** 个 glb
  - `2HP` → `attack/esf001v00_attack_08/glb/000_esf001_ATK_2HP_id2000_f76.glb`
  - `2HP_H` → `attack/esf001v00_attack_08/glb/001_esf001_ATK_2HP_H_id2005_f80.glb`

### `ryu_2lk` — Crouching LK

- 指令：`2LK` · 命中 **3** 个 glb
  - `2LK_C` → `attack/esf001v00_attack_09/glb/002_esf001_ATK_2LK_C_id2002_f82.glb`
  - `2LK_B` → `attack/esf001v00_attack_09/glb/001_esf001_ATK_2LK_B_id2001_f82.glb`
  - `2LK` → `attack/esf001v00_attack_09/glb/000_esf001_ATK_2LK_id2000_f83.glb`

### `ryu_2mk` — Crouching MK

- 指令：`2MK` · 命中 **1** 个 glb
  - `2MK_Y2` → `attack/esf001v00_attack_10/glb/000_esf001_ATK_2MK_Y2_id2000_f58.glb`

### `ryu_2hk` — Crouching HK

- 指令：`2HK` · 命中 **2** 个 glb
  - `2HK` → `attack/esf001v00_attack_11/glb/000_esf001_ATK_2HK_id2000_f145.glb`
  - `2HK_G` → `attack/esf001v00_attack_11/glb/001_esf001_ATK_2HK_G_id2005_f97.glb`

### `ryu_jlp` — Jump LP

- 指令：`j.LP / 8LP` · 命中 **1** 个 glb
  - `8LP` → `attack/esf001v00_attack_12/glb/000_esf001_ATK_8LP_id3000_f47.glb`

### `ryu_jmp` — Jump MP

- 指令：`j.MP / 8MP` · 命中 **1** 个 glb
  - `8MP` → `attack/esf001v00_attack_13/glb/000_esf001_ATK_8MP_id3000_f49.glb`

### `ryu_jhp` — Jump HP

- 指令：`j.HP / 8HP` · 命中 **1** 个 glb
  - `8HP` → `attack/esf001v00_attack_14/glb/000_esf001_ATK_8HP_id3000_f48.glb`

### `ryu_jlk` — Jump LK

- 指令：`j.LK / 8LK` · 命中 **1** 个 glb
  - `8LK` → `attack/esf001v00_attack_15/glb/000_esf001_ATK_8LK_id3000_f52.glb`

### `ryu_jmk` — Jump MK

- 指令：`j.MK / 8MK` · 命中 **1** 个 glb
  - `8MK` → `attack/esf001v00_attack_16/glb/000_esf001_ATK_8MK_id3000_f60.glb`

### `ryu_jhk` — Jump HK

- 指令：`j.HK / 8HK` · 命中 **1** 个 glb
  - `8HK` → `attack/esf001v00_attack_17/glb/000_esf001_ATK_8HK_id3000_f82.glb`

### `ryu_6mp` — Collarbone Breaker

- 指令：`6+MP` · 命中 **1** 个 glb
  - `6MP` → `basic/esf001v00_skill_00/glb/000_esf001_ATK_6MP_id0000_f115.glb`

### `ryu_6hp` — Solar Plexus Strike

- 指令：`6+HP` · 命中 **1** 个 glb
  - `6HP` → `basic/esf001v00_skill_01/glb/000_esf001_ATK_6HP_id0000_f90.glb`

### `ryu_4hp` — Short Uppercut

- 指令：`4+HP` · 命中 **2** 个 glb
  - `4HP_H` → `basic/esf001v00_skill_05/glb/001_esf001_ATK_4HP_H_id0001_f100.glb`
  - `4HP` → `basic/esf001v00_skill_05/glb/000_esf001_ATK_4HP_id0000_f82.glb`

### `ryu_4hk` — Axe Kick

- 指令：`4+HK` · 命中 **1** 个 glb
  - `4HK` → `basic/esf001v00_skill_02/glb/000_esf001_ATK_4HK_id0000_f140.glb`

### `ryu_3hk` — Possible sweep/unique 3HK

- 指令：`3HK?` · 命中 **1** 个 glb
  - `3HK` → `basic/esf001v00_skill_03/glb/000_esf001_ATK_3HK_id0000_f111.glb`

### `ryu_tc_hp_hk` — High Double Strike

- 指令：`5HP~5HK` · 命中 **4** 个 glb
  - `5HP` → `attack/esf001v00_attack_02/glb/000_esf001_ATK_5HP_id0000_f79.glb`
  - `5HK_G` → `attack/esf001v00_attack_05/glb/001_esf001_ATK_5HK_G_id0005_f47.glb`
  - `5HK_2` → `attack/esf001v00_attack_05/glb/002_esf001_ATK_5HK_2_id0006_f114.glb`
  - `5HK` → `attack/esf001v00_attack_05/glb/000_esf001_ATK_5HK_id0000_f86.glb`

### `ryu_tc_fuwa` — Fuwa Triple Strike

- 指令：`5MP~5LK~5HK` · 命中 **5** 个 glb
  - `5LK` → `attack/esf001v00_attack_03/glb/000_esf001_ATK_5LK_id0000_f48.glb`
  - `5HK_G` → `attack/esf001v00_attack_05/glb/001_esf001_ATK_5HK_G_id0005_f47.glb`
  - `5HK_2` → `attack/esf001v00_attack_05/glb/002_esf001_ATK_5HK_2_id0006_f114.glb`
  - `5HK` → `attack/esf001v00_attack_05/glb/000_esf001_ATK_5HK_id0000_f86.glb`
  - `5MP` → `attack/esf001v00_attack_01/glb/000_esf001_ATK_5MP_id0000_f53.glb`

### `idle` — Stand idle

- 指令：`—` · 命中 **4** 个 glb
  - `STD_IDLING_Loop` → `basic/esf001v00_idle/glb/003_esf001_BAS_STD_IDLING_Loop_id0035_f158.glb`
  - `STD_Loop` → `basic/esf001v00_idle/glb/000_esf001_BAS_STD_Loop_id0000_f396.glb`
  - `5010_GRD_STD_Loop` → `basic/esf001v00_idle_tired/glb/009_esf001_5010_GRD_STD_Loop_id0510_f190.glb`
  - `DPA_STD_Loop` → `basic/esf001v00_sabaki/glb/001_esf001_DPA_STD_Loop_id0410_f597.glb`

### `walk_fwd` — Walk forward

- 指令：`6 hold` · 命中 **6** 个 glb
  - `FORWARD_START` → `basic/esf001v00_move/glb/011_esf001_BAS_FORWARD_START_id5000_f19.glb`
  - `FORWARD_Loop` → `basic/esf001v00_move/glb/012_esf001_BAS_FORWARD_Loop_id5010_f114.glb`
  - `FORWARD_END_tired` → `basic/esf001v00_move/glb/016_esf001_BAS_FORWARD_END_tired_id5120_f47.glb`
  - `FORWARD_END` → `basic/esf001v00_move/glb/013_esf001_BAS_FORWARD_END_id5020_f47.glb`
  - `FORWARD_Loop_tired` → `basic/esf001v00_move/glb/015_esf001_BAS_FORWARD_Loop_tired_id5110_f181.glb`
  - `FORWARD_START_tired` → `basic/esf001v00_move/glb/014_esf001_BAS_FORWARD_START_tired_id5100_f23.glb`

### `walk_back` — Walk back

- 指令：`4 hold` · 命中 **6** 个 glb
  - `BACKWARD_START` → `basic/esf001v00_move/glb/017_esf001_BAS_BACKWARD_START_id5200_f15.glb`
  - `BACKWARD_Loop_tired` → `basic/esf001v00_move/glb/021_esf001_BAS_BACKWARD_Loop_tired_id5310_f199.glb`
  - `BACKWARD_END` → `basic/esf001v00_move/glb/019_esf001_BAS_BACKWARD_END_id5220_f47.glb`
  - `BACKWARD_START_tired` → `basic/esf001v00_move/glb/020_esf001_BAS_BACKWARD_START_tired_id5300_f23.glb`
  - `BACKWARD_END_tired` → `basic/esf001v00_move/glb/022_esf001_BAS_BACKWARD_END_tired_id5320_f46.glb`
  - `BACKWARD_Loop` → `basic/esf001v00_move/glb/018_esf001_BAS_BACKWARD_Loop_id5210_f118.glb`

### `crouch` — Crouch

- 指令：`2` · 命中 **5** 个 glb
  - `CRH_STD_tired` → `basic/esf001v00_idle_tired/glb/005_esf001_BAS_CRH_STD_tired_id0120_f38.glb`
  - `STD_CRH_tired` → `basic/esf001v00_idle_tired/glb/002_esf001_BAS_STD_CRH_tired_id0020_f60.glb`
  - `CRH_Loop` → `basic/esf001v00_idle/glb/004_esf001_BAS_CRH_Loop_id0100_f240.glb`
  - `CRH_STD` → `basic/esf001v00_idle/glb/006_esf001_BAS_CRH_STD_id0120_f38.glb`
  - `STD_CRH` → `basic/esf001v00_idle/glb/002_esf001_BAS_STD_CRH_id0020_f60.glb`

### `dash_fwd` — Forward dash

- 指令：`66` · 命中 **1** 个 glb
  - `DASH_F` → `basic/esf001v00_move/glb/000_esf001_BAS_DASH_F_id0100_f42.glb`

### `dash_back` — Back dash

- 指令：`44` · 命中 **1** 个 glb
  - `DASH_B` → `basic/esf001v00_move/glb/001_esf001_BAS_DASH_B_id0110_f40.glb`

### `jump_n` — Neutral jump

- 指令：`8` · 命中 **3** 个 glb
  - `JUMP_N_AIR` → `basic/esf001v00_move/glb/003_esf001_BAS_JUMP_N_AIR_id0205_f40.glb`
  - `JUMP_N_LAND` → `basic/esf001v00_move/glb/004_esf001_BAS_JUMP_N_LAND_id0210_f20.glb`
  - `JUMP_N_START` → `basic/esf001v00_move/glb/002_esf001_BAS_JUMP_N_START_id0200_f4.glb`

### `jump_f` — Forward jump

- 指令：`9` · 命中 **3** 个 glb
  - `JUMP_F_START` → `basic/esf001v00_move/glb/005_esf001_BAS_JUMP_F_START_id0300_f4.glb`
  - `JUMP_F_LAND` → `basic/esf001v00_move/glb/007_esf001_BAS_JUMP_F_LAND_id0310_f21.glb`
  - `JUMP_F_AIR` → `basic/esf001v00_move/glb/006_esf001_BAS_JUMP_F_AIR_id0305_f40.glb`

### `jump_b` — Back jump

- 指令：`7` · 命中 **3** 个 glb
  - `JUMP_B_LAND` → `basic/esf001v00_move/glb/010_esf001_BAS_JUMP_B_LAND_id0410_f23.glb`
  - `JUMP_B_START` → `basic/esf001v00_move/glb/008_esf001_BAS_JUMP_B_START_id0400_f4.glb`
  - `JUMP_B_AIR` → `basic/esf001v00_move/glb/009_esf001_BAS_JUMP_B_AIR_id0405_f40.glb`

### `throw` — Throw

- 指令：`LP+LK` · 命中 **7** 个 glb
  - `NGF` → `basic/esf001v00_idle/glb/008_esf001_NGF_id0210_f43.glb`
  - `NGE` → `basic/esf001v00_idle/glb/007_esf001_NGE_id0200_f43.glb`
  - `NGD_6` → `basic/esf001v00_throw/glb/003_esf001_NGD_6_id2100_f100.glb`
  - `NGA_4` → `basic/esf001v00_throw/glb/002_esf001_NGA_4_id0200_f127.glb`
  - `NGA_6` → `basic/esf001v00_throw/glb/001_esf001_NGA_6_id0100_f122.glb`
  - `NGS` → `basic/esf001v00_throw/glb/000_esf001_NGS_id0000_f52.glb`
  - `NGD_4` → `basic/esf001v00_throw/glb/004_esf001_NGD_4_id2200_f80.glb`

### `damage` — Hitstun/damage family

- 指令：`—` · 命中 **100** 个 glb
  - `0350_DMG_CH_ST` → `basic/esf001v00_damage/glb/022_esf001_0350_DMG_CH_ST_id0280_f69.glb`
  - `0050_DMG_HH_ST` → `basic/esf001v00_damage/glb/004_esf001_0050_DMG_HH_ST_id0050_f69.glb`
  - `1060_DMG_HH_DN` → `basic/esf001v00_damage/glb/034_esf001_1060_DMG_HH_DN_id0430_f45.glb`
  - `0330_DMG_CM_LT` → `basic/esf001v00_damage/glb/020_esf001_0330_DMG_CM_LT_id0230_f49.glb`
  - `2070_DMG_BLOW_HEAD_START_0` → `basic/esf001v00_damage/glb/058_esf001_2070_DMG_BLOW_HEAD_START_0_id1220_f1.glb`
  - `2100_DMG_BLOW_BODY_START_90` → `basic/esf001v00_damage/glb/061_esf001_2100_DMG_BLOW_BODY_START_90_id2010_f2.glb`
  - `1020_DMG_HU_UP_H` → `basic/esf001v00_damage/glb/030_esf001_1020_DMG_HU_UP_H_id0380_f70.glb`
  - `1190_DMG_STUN_LAMDING` → `basic/esf001v00_damage/glb/046_esf001_1190_DMG_STUN_LAMDING_id1100_f39.glb`
  - … 另有 88 个未列出

### `guard` — Block/guard family

- 指令：`4/1` · 命中 **45** 个 glb
  - `5410_GRD_CH_LT` → `basic/esf001v00_idle_tired/glb/040_esf001_5410_GRD_CH_LT_id5310_f49.glb`
  - `5220_GRD_ML_ST` → `basic/esf001v00_idle_tired/glb/021_esf001_5220_GRD_ML_ST_id5090_f29.glb`
  - `5430_GRD_DL_ST` → `basic/esf001v00_idle_tired/glb/042_esf001_5430_GRD_DL_ST_id5330_f29.glb`
  - `5090_GRD_CRH_START` → `basic/esf001v00_idle_tired/glb/011_esf001_5090_GRD_CRH_START_id0530_f24.glb`
  - `5110_GRD_CRH_END` → `basic/esf001v00_idle_tired/glb/013_esf001_5110_GRD_CRH_END_id0550_f50.glb`
  - `5190_GRD_HH_ST` → `basic/esf001v00_idle_tired/glb/018_esf001_5190_GRD_HH_ST_id5000_f49.glb`
  - `5150_GRD_HL_ST` → `basic/esf001v00_idle_tired/glb/014_esf001_5150_GRD_HL_ST_id0560_f29.glb`
  - `5280_GRD_MH_RT` → `basic/esf001v00_idle_tired/glb/027_esf001_5280_GRD_MH_RT_id5180_f49.glb`
  - … 另有 33 个未列出

### `drive_parry` — Drive Parry family

- 指令：`MP+MK` · 命中 **13** 个 glb
  - `DPA_H_LT` → `basic/esf001v00_sabaki/glb/005_esf001_DPA_H_LT_id0502_f33.glb`
  - `DPA_STD_Loop` → `basic/esf001v00_sabaki/glb/001_esf001_DPA_STD_Loop_id0410_f597.glb`
  - `DPA_CRH_START` → `basic/esf001v00_sabaki/glb/003_esf001_DPA_CRH_START_id0500_f150.glb`
  - `DPA_STD_START` → `basic/esf001v00_sabaki/glb/000_esf001_DPA_STD_START_id0400_f160.glb`
  - `DPA_M_RT` → `basic/esf001v00_sabaki/glb/009_esf001_DPA_M_RT_id5002_f33.glb`
  - `DPA_L_ST` → `basic/esf001v00_sabaki/glb/010_esf001_DPA_L_ST_id5010_f33.glb`
  - `DPA_H_RT` → `basic/esf001v00_sabaki/glb/006_esf001_DPA_H_RT_id0503_f33.glb`
  - `DPA_STD_END` → `basic/esf001v00_sabaki/glb/002_esf001_DPA_STD_END_id0420_f214.glb`
  - … 另有 1 个未列出

### `drive_related` — Drive / DRD family

- 指令：`DI/DR` · 命中 **53** 个 glb
  - `ATK_CTA_DASH` → `basic/esf001v00_counterattack/glb/002_esf001_ATK_CTA_DASH_id0140_f93.glb`
  - `ATK_CTA_4` → `basic/esf001v00_counterattack/glb/001_esf001_ATK_CTA_4_id0010_f79.glb`
  - `ATK_CTA` → `basic/esf001v00_counterattack/glb/000_esf001_ATK_CTA_id0000_f112.glb`
  - `5180_DRD_HM_RT` → `basic/esf001v00_idle/glb/027_esf001_5180_DRD_HM_RT_id5080_f25.glb`
  - `5100_DRD_CRH_H_Loop` → `basic/esf001v00_idle/glb/019_esf001_5100_DRD_CRH_H_Loop_id5000_f269.glb`
  - `5260_DRD_MH_ST` → `basic/esf001v00_idle/glb/035_esf001_5260_DRD_MH_ST_id5160_f35.glb`
  - `5420_DRD_CH_RT` → `basic/esf001v00_idle/glb/051_esf001_5420_DRD_CH_RT_id5320_f35.glb`
  - `5400_DRD_CH_ST` → `basic/esf001v00_idle/glb/049_esf001_5400_DRD_CH_ST_id5300_f35.glb`
  - … 另有 41 个未列出

### `counterattack` — Counterattack pack

- 指令：`—` · 命中 **3** 个 glb
  - `ATK_CTA_DASH` → `basic/esf001v00_counterattack/glb/002_esf001_ATK_CTA_DASH_id0140_f93.glb`
  - `ATK_CTA_4` → `basic/esf001v00_counterattack/glb/001_esf001_ATK_CTA_4_id0010_f79.glb`
  - `ATK_CTA` → `basic/esf001v00_counterattack/glb/000_esf001_ATK_CTA_id0000_f112.glb`

### `recovery` — Recovery poses

- 指令：`—` · 命中 **2** 个 glb
  - `BAS_CRH_RECOVERY` → `basic/esf001v00_idle_tired/glb/007_esf001_BAS_CRH_RECOVERY_id0210_f176.glb`
  - `BAS_STD_RECOVERY` → `basic/esf001v00_idle_tired/glb/006_esf001_BAS_STD_RECOVERY_id0200_f167.glb`

---

## 4. 磁盘 ATK_* 全部 key（文件名解析）

```
2HK, 2HK_G, 2HP, 2HP_H, 2LK, 2LK_B, 2LK_C, 2LP, 2LP_B, 2LP_C, 2MK_Y2, 2MP, 3HK, 4HK, 4HP, 4HP_H, 5HK, 5HK_2, 5HK_G, 5HP, 5LK, 5LP, 5LP_B, 5LP_C, 5MK, 5MP, 6HP, 6MP, 8HK, 8HP, 8LK, 8LP, 8MK, 8MP, CTA, CTA_4, CTA_DASH
```

## 5. 磁盘 BAS_* 全部 key

```
BACKWARD_END, BACKWARD_END_tired, BACKWARD_Loop, BACKWARD_Loop_tired, BACKWARD_START, BACKWARD_START_tired, CRH_Loop, CRH_RECOVERY, CRH_STD, CRH_STD_tired, CRH_tired_Loop, DASH_B, DASH_F, FORWARD_END, FORWARD_END_tired, FORWARD_Loop, FORWARD_Loop_tired, FORWARD_START, FORWARD_START_tired, JUMP_B_AIR, JUMP_B_LAND, JUMP_B_START, JUMP_F_AIR, JUMP_F_LAND, JUMP_F_START, JUMP_N_AIR, JUMP_N_LAND, JUMP_N_START, STD_CRH, STD_CRH_tired, STD_IDLING_Loop, STD_Loop, STD_RECOVERY, STD_tired_Loop, TRN_CRH, TRN_CRH_tired, TRN_STD, TRN_STD_tired
```

## 6. Pack 库存

| 目录 | pack | glb 数 |
|------|------|--------|
| attack | `esf001v00_attack_00` | 3 |
| attack | `esf001v00_attack_01` | 1 |
| attack | `esf001v00_attack_02` | 1 |
| attack | `esf001v00_attack_03` | 1 |
| attack | `esf001v00_attack_04` | 1 |
| attack | `esf001v00_attack_05` | 3 |
| attack | `esf001v00_attack_06` | 3 |
| attack | `esf001v00_attack_07` | 1 |
| attack | `esf001v00_attack_08` | 2 |
| attack | `esf001v00_attack_09` | 3 |
| attack | `esf001v00_attack_10` | 1 |
| attack | `esf001v00_attack_11` | 2 |
| attack | `esf001v00_attack_12` | 1 |
| attack | `esf001v00_attack_13` | 1 |
| attack | `esf001v00_attack_14` | 1 |
| attack | `esf001v00_attack_15` | 1 |
| attack | `esf001v00_attack_16` | 1 |
| attack | `esf001v00_attack_17` | 1 |
| basic | `esf001v00_counterattack` | 3 |
| basic | `esf001v00_damage` | 118 |
| basic | `esf001v00_idle` | 62 |
| basic | `esf001v00_idle_tired` | 49 |
| basic | `esf001v00_move` | 23 |
| basic | `esf001v00_sabaki` | 13 |
| basic | `esf001v00_skill_00` | 1 |
| basic | `esf001v00_skill_01` | 1 |
| basic | `esf001v00_skill_02` | 1 |
| basic | `esf001v00_skill_03` | 1 |
| basic | `esf001v00_skill_05` | 2 |
| basic | `esf001v00_throw` | 5 |

---

## 7. 解读与建议

1. **普攻映射可以立刻建表**：`ATK_5LP` 等与指令表一一对应。
2. **Special/Super 显示 MISSING** 有两种可能：
   - 尚未从 SF6 导出对应 motlist 到本目录；或
   - 已导出但文件名不含 Hadoken/Shoryu 等英文（需对照 motion_id / 游戏内序）。
3. **`skill_00`–`skill_05` 不是必杀包**（当前为 6MP/6HP/4HK/3HK/4HP）。
4. **damage(118)+guard+parry+move** 足以支撑状态机表现，不必等 special。
5. 下一步若补资产：优先在本机 `natives/.../motionlist` 中定位 special/super motlist 再 batch 导出。

## 8. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-10 | 初版自动扫描对照 |

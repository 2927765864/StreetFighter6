# 隆 · Classic 指令对照表

> **对照源**：Capcom Command List、SuperCombo / UFD 通用记法  
> **用途**：`command` ↔ 逻辑 `moveId` 检查表；**不含**完整帧数（帧数见运行时表 + Ryu/Data）  
> **面向**：表中指令默认**面朝右**  
> **状态列**：`—` = 未在本仓库落运行时表；实现时自行维护

记法见 `notation.md`。OD = 同系两键（PP / KK）。

---

## 1. 移动与通用

| 逻辑意向 id（建议） | 指令 | 名称 |
|---------------------|------|------|
| `walk_fwd` / `walk_back` | 6 / 4 按住 | 走 |
| `crouch` | 1 / 2 / 3 | 蹲 |
| `jump_*` | 7 / 8 / 9 | 跳 |
| `dash_fwd` / `dash_back` | 66 / 44 | 前冲 / 后撤 |
| `block_stand` / `block_crouch` | 4 / 1 | 站防 / 蹲防 |
| `throw_fwd` | 近身 LP+LK（或 6+LP+LK） | 前投 Shoulder Throw |
| `throw_back` | 近身 4+LP+LK | 后投 Somersault Throw |
| `drive_impact` | HP+HK | Drive Impact（Shingeki） |
| `drive_parry` | MP+MK（可按住） | Drive Parry |
| `drive_rush_parry` | Parry 中 66 | Parry Drive Rush |
| `drive_rush_cancel` | 可 cancel 招上 66 | Cancel Drive Rush |
| `drive_reversal` | 规则态下 6+HP+HK | Drive Reversal |

---

## 2. 普通技 Normals

| 建议 moveId | 指令 | 名称 |
|-------------|------|------|
| `ryu_5lp` | 5LP | Standing LP |
| `ryu_5mp` | 5MP | Standing MP |
| `ryu_5hp` | 5HP | Standing HP |
| `ryu_5lk` | 5LK | Standing LK |
| `ryu_5mk` | 5MK | Standing MK |
| `ryu_5hk` | 5HK | Standing HK |
| `ryu_2lp` | 2LP | Crouching LP |
| `ryu_2mp` | 2MP | Crouching MP |
| `ryu_2hp` | 2HP | Crouching HP |
| `ryu_2lk` | 2LK | Crouching LK |
| `ryu_2mk` | 2MK | Crouching MK |
| `ryu_2hk` | 2HK | Crouching HK |
| `ryu_jlp` | j.LP | Jump LP |
| `ryu_jmp` | j.MP | Jump MP |
| `ryu_jhp` | j.HP | Jump HP |
| `ryu_jlk` | j.LK | Jump LK |
| `ryu_jmk` | j.MK | Jump MK |
| `ryu_jhk` | j.HK | Jump HK |

---

## 3. 独特技 Unique

| 建议 moveId | 指令 | 名称（官方/常用） |
|-------------|------|-------------------|
| `ryu_6mp` | 6+MP | Collarbone Breaker |
| `ryu_6hp` | 6+HP | Solar Plexus Strike |
| `ryu_4hp` | 4+HP | Short Uppercut |
| `ryu_4hk` | 4+HK | Axe Kick |
| `ryu_6hk` | 6+HK | Whirlwind Kick |

---

## 4. Target Combo

| 建议 moveId | 指令 | 名称 |
|-------------|------|------|
| `ryu_tc_hp_hk` | 5HP ~ 5HK | High Double Strike |
| `ryu_tc_fuwa` | 5MP ~ 5LK ~ 5HK | Fuwa Triple Strike |

Light chain（如 2LK~2LP~5LP）由 cancel/Chn 表描述，不一定单独成招。

---

## 5. 必杀 Specials

| 建议 moveId 族 | 指令 | 名称 | 强度 |
|----------------|------|------|------|
| `ryu_hadoken_*` | **236+P** | Hadoken | LP/MP/HP；**236+PP** = OD |
| `ryu_shoryuken_*` | **623+P** | Shoryuken | LP/MP/HP；**623+PP** = OD |
| `ryu_tatsu_*` | **214+K** | Tatsumaki Senpu-kyaku | LK/MK/HK；**214+KK** = OD |
| `ryu_air_tatsu_*` | 前跳中 **214+K** | Aerial Tatsumaki | 含 OD KK |
| `ryu_blade_*` | **236+K** | High Blade Kick | LK/MK/HK；**236+KK** = OD |
| `ryu_hashogeki_*` | **214+P** | Hashogeki | LP/MP/HP；**214+PP** = OD |
| `ryu_denjin_charge` | **22+P** | Denjin Charge | 下下+拳 |

**Denjin 状态**：强化 Hadoken / Hashogeki / 部分 Super 等（以帧表备注为准）。

---

## 6. Super Arts

| 建议 moveId | 指令 | 名称 |
|-------------|------|------|
| `ryu_sa1` | **236236+P** | Shinku Hadoken（SA1） |
| `ryu_sa2` | **214214+P** | Shin Hashogeki（SA2，可按住） |
| `ryu_sa3` | **236236+K** | Shin Shoryuken（SA3 / CA 规则见帧表） |

---

## 7. 按指令模式速查

| 模式 | 出招 |
|------|------|
| 236+P / PP | 波动 / OD 波动（+ Denjin 变体） |
| 236+K / KK | 高刃 / OD 高刃 |
| 214+K / KK | 龙卷 / OD 龙卷 |
| 214+P / PP | 破障 / OD 破障 |
| 623+P / PP | 升龙 / OD 升龙 |
| 22+P | 电刃蓄力 |
| 236236+P | SA1 |
| 214214+P | SA2 |
| 236236+K | SA3 |

---

## 8. 非指令动画（提醒）

idle / walk 循环 / hitstun / knockdown / parry 循环等由**状态机**切 clip，不在本指令表；映射见资源管线与 clipId 表。

---

## 9. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-10 | 初版 Classic 对照；moveId 为建议名，实现可统一前缀 |

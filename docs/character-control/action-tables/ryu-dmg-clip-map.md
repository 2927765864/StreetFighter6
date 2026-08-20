# 隆 `DMG_*` / 倒地 clip 映射（不格挡受击 v0）

磁盘：`private/assets/ryu/anims/basic/esf001v00_damage/glb/`  
命名与格挡 `DRD_{高度}{轻重}_{ST|LT|RT}` 同一套字母，**但高度字段不是 `guardAnim`**。

## 与格挡的差别（2026-08-20 纠错）

| | 格挡 `GRD/DRD` | 挨打 `DMG` |
|--|----------------|------------|
| 高度 | `guardAnim`：挡的姿势（5HP=`m` 举手护胸） | `hitAnim`：打在身上的部位（5HP=`h` 头） |
| 轻重 | `guardStrength` | 同一字段 |
| 方向 | 本阶段只用 `_st` | 有的招要用 `_lt`（5MP=`dmg_mm_lt`） |
| 缺省站立高度 | 官方 H → `h` | **禁止**再用这个缺省：站脚会全变成头晃 |

HIT_DT `DmgPart` 对照（命中侧 common[0]）：`1→h`（5HP/5HK）、`2→m`（5MP）、`3→l`（5LK）。`0` 无部位 → 必须手写 `hitAnim`（5LP=`h`，5MK=`m`）。

| 招 | 现错（旧算法） | 应选 |
|----|----------------|------|
| 5LP | `dmg_hl_st` | `dmg_hl_st`（对） |
| 5MP | `dmg_mm_st` | `dmg_mm_lt` |
| 5HP | `dmg_mh_st`（抄了 guardAnim=m） | `dmg_hh_st` |
| 5LK | `dmg_hl_st`（无 hitAnim 默认 h） | `dmg_ll_st` |
| 5MK | `dmg_hm_st` | `dmg_mm_st` |
| 5HK | `dmg_hh_st` | `dmg_hh_lt`（HH 侧转；RT 转反了） |

倒地总帧：sweep 20 + HIT_DT `DownTime`(2HK=10) + rise 42 = **72**。

| logicId | 磁盘 stem | f |
|---------|-----------|---|
| dmg_*_*_st / `_lt` | 见 `ryu_logic_to_glb_map.json` | 29–69 |
| kd_sweep | `DMG_ASHIBARAI_RT` | 20 | 扫倒（还没贴地） |
| kd_bound | `DMG_BND_L_UT` | 15 | **弹地趴下**；扫倒和躺循环之间缺的就是这段 |
| kd_down_loop | `BAS_DN_UT_Loop` | 85 | **UT=趴**；不要用 AO（仰躺） |
| kd_rise_normal | `BAS_DN_STD_UT` | 42 | 从趴站起 |
| kd_rise_back | `BAS_TECH_BR_UT` | 44 | 从趴后跳起（逻辑窗仍 42） |

`AO` = 仰向け（躺着 vis 天）；`UT` = うつ伏せ（趴着）。扫腿落地是趴，必须整条 UT。

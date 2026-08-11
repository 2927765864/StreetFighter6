# 隆必杀 / 超必杀 glb 复扫结果

> **复扫时间**：2026-08-10  
> **总 glb**：321（其中 `specialskill/` **14**）  
> **新目录**：`private/assets/ryu/anims/specialskill/`  
> **说明**：文件名 → 招式为人工对照 SPA 缩写；FOUND ≠ 已接入运行时。

相关：总覆盖表 `ryu-anim-glb-coverage.md`（其 special 全 MISSING 一节已过时，以本文为准）。

---

## 1. 与指令表对照

| 状态 | moveId | 指令 | 名称 | glb | 精确 key |
|------|--------|------|------|-----|----------|
| ✅ | `ryu_hadoken` | 236+P | Hadoken 波动 | 1 | `SPA_HADO` |
| ✅ | `ryu_shoryuken` | 623+P | Shoryuken 升龙 | 2 | `SPA_SYORYU_START` + `SPA_SYORYU_END` |
| ✅ | `ryu_tatsu` | 214+K | Tatsumaki 龙卷 | 3 | `SPA_TATSUMAKI_{START,LOOP,END}` |
| ✅ | `ryu_air_tatsu` | j.214+K | Aerial Tatsumaki | 2 | `SPA_TATSUMAKI_AIR_{START,END}` |
| ✅ | `ryu_blade` | 236+K | High Blade 高刃/足刀 | 1 | `SPA_SOKUTOU_L` |
| ✅ | `ryu_hashogeki` | 214+P | Hashogeki 破障 | 2 | `SPA_HADOSHO` + `SPA_HADOSHO_L` |
| ✅ | `ryu_denjin_charge` | 22+P | Denjin Charge 电刃 | 3 | `SPA_KIAITAME` / `_2` / `_3` |
| ❌ | `ryu_sa1` | 236236+P | Shinku Hadoken | 0 | 未见 |
| ❌ | `ryu_sa2` | 214214+P | Shin Hashogeki | 0 | 未见 |
| ❌ | `ryu_sa3` | 236236+K | Shin Shoryuken | 0 | 未见 |
| ❌ | `ryu_6hk` | 6+HK | Whirlwind Kick | 0 | 无 `ATK_6HK`（属 unique，非本包） |

**必杀 7 招：全部有素材。**  
**仍缺：3 个 Super + 指令普攻 6HK。**

---

## 2. Pack 明细（`specialskill/`）

| pack | 内容 | 文件 |
|------|------|------|
| `specialskill_00` | 波动 | `SPA_HADO` f110 |
| `specialskill_01` | 升龙 | `SYORYU_START` f49 + `END` f97 |
| `specialskill_02` | 龙卷 + 空龙卷 | START/LOOP/END + AIR_START/AIR_END |
| `specialskill_03` | 破障 | `HADOSHO` + `HADOSHO_L` 各 f128 |
| `specialskill_04` | 高刃/足刀 | `SOKUTOU_L` f98 |
| `specialskill_05` | 电刃蓄力 | `KIAITAME` / `_2` / `_3` 各 f95 |

路径示例：

- `specialskill/esf001v00_specialskill_00/glb/000_esf001_SPA_HADO_id0000_f110.glb`

---

## 3. 命名解读

| SPA 前缀 | 玩法名 | 接线注意 |
|----------|--------|----------|
| `SPA_HADO` | Hadoken | 仅 1 clip；L/M/H/OD 未分文件 |
| `SPA_SYORYU_*` | Shoryuken | **两段**，FSM 需 START→END 或混合 |
| `SPA_TATSUMAKI_*` | 地面龙卷 | **三段** START→LOOP→END |
| `SPA_TATSUMAKI_AIR_*` | 空中龙卷 | **两段** |
| `SPA_HADOSHO*` | Hashogeki | 勿与 `SPA_HADO` 前缀误绑 |
| `SPA_SOKUTOU_L` | High Blade Kick | 仅见 L |
| `SPA_KIAITAME*` | Denjin Charge | 3 变体，用途需对游戏/表再标 |

---

## 4. 评价：补得如何？

### 做得好的

1. **目录结构正确**：`specialskill/esf001v00_specialskill_0x/`，与 attack/basic 管线一致，catalog 齐全。  
2. **经典必杀全家桶齐**：波动 / 升龙 / 龙卷 / 空龙卷 / 破障 / 高刃 / 电刃 —— 之前 MISSING 的 special 主干已补上。  
3. **文件名可读**（`SPA_*`），比无标签 motion 好映射。  
4. 龙卷/升龙拆段符合引擎常见做法，后续状态机可直接用。

### 仍要注意的缺口

| 缺口 | 影响 |
|------|------|
| **无 SA1/SA2/SA3** | 超必杀表现仍缺；可能在 `superskill` / 其它 motlist |
| **强度分轨少** | 多半 1 clip 打 L/M/H/OD；逻辑表仍可分强度，动画先共用 |
| **6HK 仍无** | 指令普攻，应在 attack 包，不是 specialskill 漏导 |
| **clip 帧数 vs 帧表** | 如 HADO f110 ≫ 公开 recovery；需 **逻辑帧 scrub**，勿播满才收招 |
| **未接运行时** | 对战 `clip_map` 仍几乎只有 idle/5lp |

### 总评

**必杀素材补包：合格且可用，主干目标达成。**  
按「完整隆指令表动画」还差 **超必杀 + 6HK +（可选）强度/OD 分轨**；  
按「先做 special 状态机 + 出招表现」**已经够开工**。

---

## 5. 建议的下一步（素材侧）

1. 在本机 natives 搜 `super` / `specialart` / `ca` 类 motlist → 导出 SA。  
2. 在 attack motlist 里确认是否有 `6HK` / Whirlwind 未导出。  
3. 项目内建 `SPA_* → moveId` 映射表（可从本文抄）。  
4. 调试 GUI 已能扫新目录的话，逐条播 SPA 确认绑定是否正常。

---

## 6. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-10 | 用户补 specialskill 后复扫；修正 HADO/HADOSHO 前缀误绑说明 |

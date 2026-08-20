# 不格挡受击 / 倒地 / 起身共识 v0

> **状态**：已确认（对话 2026-08-20 问答落盘）  
> **上级**：`docs/character-control/consensus-design-v0.md`；格挡保持 `consensus-block-guard-v0.md`  
> **调研**：`docs/research/sf6-ungarded-hit-knockdown-research-2026-08-20.md`  
> **执行方案**：`docs/plans/ai-execution-plan-ungarded-hit-kd-v0.md`  
> **修订纪律**：未在对话中明确达成前不改已确认章节。

本文件只回答：**没防住被打中**要做什么、不做什么。格挡路径不改行为规格。

---

## 0. 范围

| 路径 | 本阶段 |
|------|--------|
| 格挡 | 已完成；本文件不改 |
| **站/蹲挨打（不倒）** | ✅ 高低×轻中重动画 + 受击硬直 + 顿帧 + 命中推开 |
| **地面打倒 + 起身** | ✅ 以蹲重脚（2HK）为验收代表；普通起 + 后跳起 |
| 扣血 | ❌ 本阶段 0（`damageScale` 命中侧也按 0） |
| 反击/惩罚反击加长躺地、硬倒地禁后跳 | ❌ |
| 空中挨打 / 打飞 / 撞墙 / 气绝 | ❌ |

---

## 1. Dummy

| 项 | 共识 |
|----|------|
| 永远不防 | `dummyGuardPolicy: none` + 站立或蹲姿（现有 `stand` / `crouch`） |
| 姿势防错 | 现有站防/蹲防 vs H/M/L，失败走本文件结算 |
| 起身 | 训练面板 **普通起 / 后跳起** 开关；两种 **总时长相同**（SuperCombo Defense） |

---

## 2. 数字权威

| 字段 | 权威 | 禁止 |
|------|------|------|
| `hitstun` | MMDK HIT_DT **命中侧** `common[0].HitStun`（现转换已写入） | 用 FAT 覆盖 |
| 命中顿帧 | MMDK `HitStopTarget` → 已有 `hitstopOnHit` | — |
| 命中推开 | MMDK 命中侧 `MoveDest.x` × 0.01（转换已算 `hitPushTotal`，须接到运行时） | 与 Place / 防推开混通道 |
| 倒地总时长 | **优先 MMDK 盘点后的字段**；无字段则只允许写入 `action-tables` 明示表，禁止执行者口算 | 用 glb 帧长当倒地时间 |

硬直/倒地说了算；动画短则定格末帧或躺地循环，长则时间到立刻切下一状态。

---

## 3. 结算流水线（没防住）

1. 红框∩绿框且 `canGuard` 失败或 Dummy 不防。  
2. 双方 hitstop（命中侧）。  
3. 读招式 `hitReaction`：`stun` | `knockdown`（缺省 `stun`）。  
4. `stun`：防守方 `phase=hitstun`，`stunTimer=hitstun`，播 `DMG_*` 反应片，命中推开独立通道。伤害 0。  
5. `knockdown`：进入倒地状态机（扫倒片 → 躺地循环 → 起身片），**整段不可操作**；倒地期间 **不再接受打击结算**（跳过 hit∩hurt）。伤害 0。  
6. 起身结束 → 站立待机（`idle`）。

---

## 4. 动画

- 晃：`DMG_{高度}{轻重}_ST` 正面片；高低字母与格挡 `guardToAnimHeight` **同一函数**；轻重与 `guardStrength` / 命中 hitstop 分档同一套（`resolveGuardStrength`，命中用 `hitstopOnHit`）。  
- 左右 `LT/RT` 本阶段不选。  
- 扫倒：磁盘 `DMG_ASHIBARAI_*`；躺地 `BAS_DN_*_Loop`；普通起 `BAS_DN_STD_*`；后跳起 `BAS_TECH_BR_*`。只用 **非 Light** 族（2HK 重脚）。  
- 吹飞 `BLOW_*`、撞墙、气绝、SPIN **不接**。

---

## 5. 明确不做

- 扣血、Drive、CH/PC、硬倒地、空中受击、delay rise、接近防、用 FAT 覆盖 hitstun。

---

## 6. 验收句

1. Dummy `none` 站立挨 5LP：进 hitstun，硬直=MMDK，片为站立轻/对应轻重，硬直结束回 idle。  
2. Dummy 站防 + 2MK（L）：没防住，走 stun 不是 GRD。  
3. Dummy `none` 挨 2HK：倒地 → 躺 → 起身；起身结束前不能还手；倒地中再出拳打不中。  
4. 普通起 / 后跳起总逻辑帧相同；后跳起结束位置更远。  
5. 血量不变。  
6. 调试面板能改 Dummy 防策略、起身、看见 phase / stunTimer / 反应 clip / hitReaction。

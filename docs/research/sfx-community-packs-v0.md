# 社区 SF6 / 格斗战斗音效包检索（v0）

> 日期：2026-09-10（续：跳跃衣物风 / Foley / 击倒社区检索）  
> 目标：评估能否按四层槽位填入 `private/runtime/sfx/`（私人、不公开再分发）

## 结论摘要

**没有找到「已按 punch/kick × L/M·H + block + dash/jump/land + KD 完整分好、可直接拖进 runtime」的官方级 SF6 公共包。**

最接近、且已落地试听的是：

| 来源 | 听感接近度 | 槽位覆盖 | 可用性 |
|------|------------|----------|--------|
| **GameBanana · Smash Ultimate SF6 Sound Pack**（mod 411678）`se_ryu_c00.nus3audio` | **高（自称 SF6 提取）** | 命中 6 + 破风 6 **齐**；格挡 1；移动候选齐；**击倒缺** | **已拆到** `private/sfx-eval/smash-sf6-ryu-se/` |
| **SF6 Ryu Outfit SFX** `esf001_cos_000/001_m`（Sounds Resource 同 WEM ID；本机 product 已进 sfx-lab） | **真 SF6 服装 Foley** | **`loco/jump_cloth` 主候选**（`whooshScore≥5` 约 15 条） | **已导出** `private/sfx-eval/sf6-ryu-outfit-foley/` + bank `esf001_cos_*` |
| Freesound 通用布料 whoosh（Artninja 等） | 低 | 挂过 `community_jump_cloth` | **用户判定基本不可用** |
| Sounds Resource · SF6 Ryu 整包 | 真 SF6 | 挥空 6 + Outfit Foley + 语音；**无 common 命中/移动/倒地** | **自动化 DL = Cloudflare 403**（与 USF4 相同） |
| Sounds Resource · **USF4 Common Sounds** | SF4 听感 | 文件名几乎 1:1（含 `guard0/1`、`frontstep`/`backstep`、`hit_ground`）；注释称缺 jump | **403，未入库** |
| GameBanana Sound 51107「Various FG Hit SFX」 | Smash 通用 | `falldown` / `down_*` 可作 **KD 过渡**；guard = 护盾非 SF 格挡 | 页面 **trashed**；文件仍可下。已拆 `private/sfx-eval/smash-common-kd-block/` |
| HCS64 · SF6 Wwise BNK/PCK rip | 真 SF6 容器 | 原始 bank，**仍要 streaming + 听选** | 等同补解包路线（本轮不优先） |
| 商业格斗库（Street Fighting Elements / WOW Cinematic Fight 等） | 通用 Foley | cloth / bodyfall / block 齐全 | 授权清晰，**非 SF6 还原**；Freesound 路线已证明通用 cloth 听感不过关 |

社区与 HCS 一致确认：战斗 SE 真媒体在  
`natives/stm/streaming/product/sound/wwise/`（`.spck` / 流式 `.wem`）；仅 product 侧不够——**但服装 Foley `esf001_cos_*` 在 product 侧是完整内嵌的**。

## 本轮缺口结论（相对 runtime manifest）

当前 `private/runtime/sfx/manifest.json`（2026-09-10）大致：

| 状态 | 槽 |
|------|----|
| **accepted（Smash SF6 Ryu）** | 命中 6、破风 6、dash×2、脚步 L/R、jump、land |
| **missing** | `loco/jump_cloth`、`contact/block_{l,m,h}`、`knockdown/body_fall`、`knockdown/wakeup` |

### 1. `loco/jump_cloth`（卡点 → 换源）

- Freesound 通用布料 whoosh：**否决**。
- Smash `jump03` / `escapeair`：**否决**（短促撞击 / 空中闪避，不是衣物风）。
- **推荐下一听选**：`esf001_cos_000_m`（C1）里 `whooshScore=5`、约 0.35–0.9s 的软 whoosh；与 Sounds Resource「Outfit SFX」为同一批 WEM。  
  - 试听目录：`private/sfx-eval/sf6-ryu-outfit-foley/`  
  - 验收 bank：`esf001_cos_000_m` / `esf001_cos_001_m`

这不是「再走 streaming 解包」；服装 bank 已在 product、社区站也有同 ID 成品。

### 2. `contact/block_*`

- Smash SF6：`se_ryu_guard`（+ `guard_just`）**仅 1～2 条**，无 L/M/H。
- 过渡：三档可暂复用同一 `guard`，或 pitch 变体后人工标。
- USF4 `guard0/1`：文件名合适，但 **Sounds Resource 403**，未听选。
- Smash common `guardon/off`：护盾感，**不推荐**盖 SF 格挡。

### 3. `knockdown/*`

- Smash SF6 Ryu bank：**无** body fall；`rise` 极弱（更像蹲起）。
- **过渡候选**：Smash common `se_common_falldown_01..05`、`se_common_down_*`  
  → `private/sfx-eval/smash-common-kd-block/` + bank `community_smash_common_kd_block`
- 真 SF6：仍依赖 streaming `down_human` / HCS PCK，或将来手动过 Cloudflare 下 USF4 `hit_ground` 作非 SF6 备选。
- `wakeup`：社区仍几乎无好切片；暂可空或继续弱用 `rise`。

## Smash SF6 Ryu 槽位映射（已验证）

Smash SE 命名：**S/M/L = small/medium/large ⇒ 对应我们的 L/M/H（S=轻，L=重）**。

| 我们的槽 | Smash 流名 | 状态 |
|----------|------------|------|
| `contact/hit_punch_{l,m,h}` | `se_ryu_hit_punch_{s,m,l}` | 齐 · runtime accepted |
| `contact/hit_kick_{l,m,h}` | `se_ryu_hit_kick_{s,m,l}` | 齐 · runtime accepted |
| `contact/block_{l,m,h}` | `se_ryu_guard`（+ `guard_just`） | **仅 1～2 条** · missing |
| `swing/punch_{l,m,h}` | `se_ryu_swing_punch_{s,m,l}` | 齐 · runtime accepted |
| `swing/kick_{l,m,h}` | `se_ryu_swing_kick_{s,m,l}` | 齐 · runtime accepted |
| `loco/dash_fwd` | `escape_F` / `dash_start` | accepted（可再听） |
| `loco/dash_back` | `escape_B` / `dash_turn` | accepted（可再听） |
| `loco/footstep_*` | `step_{left,right}_m` 等 | accepted（可再听） |
| `loco/jump` | `jump01–02` | accepted |
| `loco/jump_cloth` | —（勿用 jump03） | → **`esf001_cos_*`** |
| `loco/land` | `landing01–03` | accepted |
| `knockdown/body_fall` | — | → Smash common `falldown` 过渡 |
| `knockdown/wakeup` | `rise`？ | 弱 |

## 授权（私人原型）

| 包 | 页面许可 | 底层 IP | 与共识 §5.3 |
|----|----------|---------|-------------|
| Smash SF6 Sound Pack | CC BY-NC-ND 4.0 | Capcom 音频 | **私人本机可用**；**不得**公开再分发 |
| Sounds Resource / SF6 outfit Foley | 站点展示用 rip | Capcom | 同上 |
| Smash common（51107） | 页面 trashed | Nintendo Smash common | 私人过渡；勿再分发 |
| HCS64 rip | 社区 rip | Capcom | 同上 |
| 商业格斗库 | 购买许可 | 卖方 | 听感非 SF6 |

## 建议听选顺序（验收页 http://localhost:5177）

1. **`esf001_cos_000_m`** → 标 `loco/jump_cloth`（优先 ★ / whooshScore 5）。
2. **`community_smash_sf6_ryu_se`** → `se_ryu_guard` 暂填 `contact/block_*`（可三档同条或只填 M）。
3. **`community_smash_common_kd_block`** → `falldown_*` 填 `knockdown/body_fall`；wakeup 可继续 missing。
4. `npm run export` → 主项目只读 `private/runtime/sfx/`。

**不要**再优先：Freesound 通用 cloth、本机 streaming 大解包（除非用户改口）、自动化撞 Sounds Resource Cloudflare。

## 产物位置

| 路径 | 内容 |
|------|------|
| `private/sfx-eval/smash-sf6-ryu-se/` | Smash SF6 Ryu SE |
| `private/sfx-eval/community-jump-cloth/` | Freesound（已否决） |
| `private/sfx-eval/sf6-ryu-outfit-foley/` | **jump_cloth 主候选**（cos whoosh≥5） |
| `private/sfx-eval/smash-common-kd-block/` | KD / 弱 block 过渡 |
| `sfx-lab/work/banks/esf001_cos_*` | 验收 bank |
| `sfx-lab/work/banks/community_smash_sf6_ryu_se/` | 验收 bank |
| `sfx-lab/work/banks/community_smash_common_kd_block/` | 验收 bank |

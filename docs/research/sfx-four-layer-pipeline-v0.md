# 四层战斗音效管线（研究笔记）

> 状态：与共识 v0.5 对齐（2026-09-10）  
> 工具：仓库根目录 `sfx-lab/`  
> 成品：`private/runtime/sfx/` + `manifest.json`（gitignore，主项目只读）

## 1. 四层与逻辑槽

| 层 | 槽位 id |
|----|---------|
| 接触 · 命中 | `contact/hit_punch_l\|m\|h` `contact/hit_kick_l\|m\|h`（拳/脚 × 轻中重，共 6） |
| 接触 · 格挡 | `contact/block_l` `contact/block_m` `contact/block_h` |
| 出招破风 | `swing/punch_l` `swing/punch_m` `swing/punch_h` `swing/kick_l` `swing/kick_m` `swing/kick_h` |
| 移动 | `loco/dash_fwd` `loco/dash_back` · `loco/footstep_left\|right` · `loco/jump` · `loco/jump_cloth` · `loco/land` |
| 击倒 | `knockdown/body_fall` `knockdown/wakeup` |

移动补充说明（2026-09-10）：走路脚触地拆左右；跳跃拆 **起跳** 与 **衣物/破风**；落地独立。

- 脚步 / 起跳 / 落地：Smash `se_ryu_step_*` / `jump01–02` / `landing*`
- **jump_cloth**：社区 Freesound 布料 whoosh（bank `community_jump_cloth`）。Smash `jump03` 听感不对（短促撞击），已弃用。
- 本机 `foot_steps_m`（~2689 WEM）过重，不整包进验收页。

## 2. 解包 bank 对照（SF6 RE Engine / Wwise）

解包根示例：

- 元数据/部分内嵌：`…/SF6_export/stm/product/sound/wwise`
- **流式权威（请补）**：`…/SF6_export/stm/streaming/product/sound/wwise`

| 用途 | 媒体 bank（`*_m`） | 听感结论（2026-09-10） | 备注 |
|------|-------------------|------------------------|------|
| **挥空（隆）** | `esf001_sfx_cmn_m`（6） | **已确认对得上** | 完整内嵌；拳/脚×L/M/H whoosh |
| 接触候选 | `dmg_human_m` / `dmg_cmn_m` | 待 streaming + 听选 | 比 `battle_cmn` 更像命中体感 |
| 接触/系统 | `battle_cmn_m`（~30 / HIRC~117） | **现有内嵌对不上** | 事件多于媒体 → 缺流式 WEM |
| 移动候选 | `act_cmn_m`（~23 / HIRC~78） | **现有内嵌对不上**（whoosh 不在此） | dash/jump/land 待 streaming |
| 击倒 | `down_human_m`（~191 / HIRC~725） | **现有内嵌对不上** | 同上 |
| 容器索引 | `snd_cnt_btl_human_cmn` | — | 引用 act/battle/down/dmg/foot + strength switch |

说明：

- `_m` = `BKHD + DIDX + DATA`；`_es` = `HIRC`
- **HIRC 对象数 ≫ 内嵌 WEM 数** ⇒ 该 bank 在 product 侧不完整，需 streaming `.spck`/`.wem`
- 事件名多为哈希 → 听选标槽
- 命中与破风均按 **拳/脚 × L/M/H**；格挡暂 L/M/H；隆码 `esf001`

## 3. 处理步骤

```text
sbnk.1.x64 → extract_bnk_wem → .wem
         → vgmstream-cli → .wav
         → ffmpeg → .ogg（预览/导出）
         → wwiser + Street Fighter 6 (PS4).txt → Event→WEM 标签
         → sfx-lab 网页试听验收 → acceptance.json
         → export_runtime_sfx → private/runtime/sfx/
```

依赖：`brew install vgmstream`；wwiser 源码在 `sfx-lab/tools/wwiser/wwiser-src`（`npm run resolve-events`）。

### 事件名还原现状（2026-09-10）

| Bank | 可读 Event 示例 | 备注 |
|------|-----------------|------|
| `dmg_cmn` | `play_DMG_CMN_PARRY` / `GUARD_BREAK` / `ARMOR_BREAK` / `ATEMI` / 属性附加 | 命中系统向，较完整 |
| `battle_cmn` | `play_BTL_CMN_ZONE_*` | 部分；大量仍缺名 |
| `act_cmn` | `play_BTL_CMN_SLOW_MOTION_*` | 少量 |
| `down_human` | switch 值 `air_death` / `mt_em*` 材质 | Event 本体多名未还原 |
| `esf001_sfx_cmn` | `Stop_esf001_cmn`；挥空 Event 仍多为 id-only | 听感已知是 whoosh |
| `dmg_human` | 暂无 play_* 命中名 | 有 `damagestrengthintensity` 档位 |

`.wem` 原始文件名通常不可逆；优先用 Event 名导航。

## 4. 主项目读取约定

- URL（dev）：`/private-runtime/sfx/<相对路径>`（现有 `ryuAnimAssets` 插件）
- 清单：`/private-runtime/sfx/manifest.json`
- 槽位 `status`：`accepted` | `missing` |（工具内还有 candidate/rejected，导出后以 accepted/missing 为主）
- **运行时**：`CombatSfxPlayer`（`app/src/combat/sfx/`）读清单；`MatchSim.onCombatSfx` 在出招破风 / 命中·格挡 / dash·jump·**jump_cloth（prejump→airborne）**·land / **走路脚触地 L/R（loop 等分交替）** / body_fall·wakeup 触发。`missing` 槽静默跳过。

## 5. 法务

提取物与验收成品仅本机 `private/`；不得提交公开 git 或公开演示站。详见 `docs/consensus-v0.md` §5.3。

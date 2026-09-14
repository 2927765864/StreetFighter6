# SFX Lab · 四层战斗音效处理与验收

隔离于主游戏 `app/`：从 SF6 解包 Wwise bank 抽出波形 → 转成网页可播格式 → 试听标槽 → 导出到 `private/runtime/sfx/`，供主项目只读接入。

共识：`docs/consensus-v0.md` §3.2 / §5（v0.5）  
管线笔记：`docs/research/sfx-four-layer-pipeline-v0.md`

## 依赖

```bash
brew install vgmstream   # 含 ffmpeg
cd sfx-lab
npm install
```

确认：

```bash
which vgmstream-cli ffmpeg
```

转码说明：`.wem` → `vgmstream-cli` → `.wav`；再用 ffmpeg **`libopus`** 封进 `.ogg`（Homebrew ffmpeg 通常不带 `libvorbis`）。

## 配置

编辑 `scripts/config.json`：

- `wwiseDir`：`…/natives` 侧 `stm/product/sound/wwise`（当前已有）
- **`streamingWwiseDir`**：`…/stm/streaming/product/sound/wwise`（**命中/移动/倒地权威源，请补解包**；存在时 extract 优先读这里）
- `banks`：挥空权威 `esf001_sfx_cmn_m`；接触候选 `dmg_human_m` / `dmg_cmn_m`；另保留可能不完整的 `battle_cmn_m` / `act_cmn_m` / `down_human_m`
- 导出目录默认 `../private/runtime/sfx`

### 为什么其它三层对不上？

游戏战斗 SE 容器 `btl_human_cmn` 会引用 `battle_cmn` / `act_cmn` / `down_human` / `dmg_*`，但当前 **product/wwise 里这些 `_m` bank 内嵌波形远少于事件数（HIRC）**——例如 `battle_cmn` 约 30 条媒体 vs 117 个 HIRC 对象。社区做法是再解包：

`natives/stm/streaming/product/sound/wwise/`（大量 `.spck` / 流式 `.wem`）

挥空能对上，是因为隆专属 `esf001_sfx_cmn_m` 只有 6 条且**完整内嵌**。

补齐 streaming 后：

1. 把路径写进 `streamingWwiseDir`（默认已写成 `SF6_export/stm/streaming/product/sound/wwise`）
2. `npm run pipeline`
3. 在验收页重听接触 / 移动 / 击倒并重新标槽

## 流程

```bash
# 1) 抽 wem + 转码 + wwiser 事件名还原（写入 work/，已 gitignore）
npm run pipeline

# 或单独重跑事件还原：
npm run resolve-events

# 1b) 可选：导入社区 Smash SF6 Ryu SE（需先有 private/sfx-eval/smash-sf6-ryu-se）
npm run import-community-smash
# → work/banks/community_smash_sf6_ryu_se/（S/M/L≈L/M/H；格挡单条；击倒基本无）

# 2) 打开验收页
npm run dev
# → http://localhost:5177
# 左侧选 community_smash_sf6_ryu_se（或自解包 bank）→ 试听标槽

# 3) 网页里试听，把采样标到逻辑槽（accepted）
# 4) 点「导出到 runtime」或：
npm run export
```

### 事件名说明

- 使用 [wwiser](https://github.com/bnnm/wwiser) + 社区 `Street Fighter 6 (PS4).txt` 名称表。
- **能还原的**：如 `play_DMG_CMN_PARRY`、`play_BTL_CMN_ZONE_START`、倒地材质 `air_death` 等。
- **尚未还原的**：仍显示 `bank-####-event`（Event ID 已知，名字未撞出）；`.wem` 原始文件名本身通常不可逆。
- 验收页：`named` = 已还原可读事件名；`id-only` = 仅有事件序号。

导出结果：

```text
private/runtime/sfx/manifest.json
private/runtime/sfx/contact/hit_punch_l.ogg
private/runtime/sfx/contact/hit_kick_m.ogg
…
```

主项目通过现有 `/private-runtime/sfx/…` 读取（开发服务器）。**不要**把 `work/` 或导出音效提交到公开 git。

## 逻辑槽

见 `src/data/slots.ts`：接触命中 6（拳/脚×L/M/H）+ 格挡 3 + 破风 6 + 移动（dash 2 + **脚步 L/R** + **跳起 / 衣物风** + 落地）+ 击倒 2。

移动 / 缺口听选：

- **脚步 / 起跳脚 / 落地（替补）**：`community_smash_common_loco`（`step_ringmat` / `step_jump` / `landing_ringmat` 等；Sounds Resource USF4/SFIV CE 仍 403）
- 脚步 / 起跳 / 落地 / dash（原 Smash SF6）：`community_smash_sf6_ryu_se`（改选 `step_*_m`/`*_ll`，**勿用极短 `*_l`**）；Ken 对照 `community_smash_sf6_ken_loco`
- **跳跃衣物风声**：`esf001_cos_000_m`（**不要**用 Smash `jump03`；Freesound 已否决）
- 格挡：`community_smash_sf6_ryu_se` 的 `se_ryu_guard`
- 击倒 body fall（过渡）：`community_smash_common_kd_block`

本机另有 `foot_steps_m`（~2689 条，未默认全量转码进页；本轮不优先解包）。

## 脚本

| 命令 | 作用 |
|------|------|
| `npm run extract` | `*.sbnk.1.x64` → `work/banks/*/wem/*.wem` |
| `npm run convert` | wem → wav + preview ogg，更新 catalog |
| `npm run export` | `acceptance.json` → `private/runtime/sfx` |
| `npm run pipeline` | extract + convert |

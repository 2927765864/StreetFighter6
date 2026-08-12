# 网络可搜集资料 → 本地落盘说明

> **日期**：2026-08-10  
> **对应缺口**：运行时逐招帧 JSON · 逐帧 hit/hurt · 对战 glb 管线 · SuperCombo 抄录  

---

## 总览：四类缺口分别能从网上拿到什么？

| 缺口 | 网上能否搜集 | 本仓库落盘 | 说明 |
|------|----------------|------------|------|
| **1. 逐招帧数据**（startup/active/recovery/伤害/优势/cancel 旗） | **能** | ✅ 已落 | 见下文 4rays TOML → JSON |
| **2. 逐帧 hit/hurt AABB 数字** | **基本不能**（公开多为图/动图） | ⚠️ 仅占位盒 | 真盒需自测/mod/解包 |
| **3. 对战合并 glb 多 clip** | **不能**（本机导出管线） | ❌ 不走合并 | 决策：映射动态加载单 glb |
| **4. SuperCombo 全表抄录** | **能浏览/部分爬** | 📎 链接+字段对照 | 未整站镜像；用 4rays 作机器可读主抄本 |

---

## 1. 逐招帧 JSON — 已搜集并转换

### 1.1 公开机器可读源（本次采用）

| 源 | URL | 格式 | 备注 |
|----|-----|------|------|
| **4rays/sf6-move-data** | https://github.com/4rays/sf6-move-data | TOML/`moves/ryu.toml` | **已归档**但仍可用；jsDelivr 可拉 |
| 原始 TOML（本地） | `4rays-ryu.toml` | 65 条 moves | ~58KB |
| 转换全集 JSON | `ryu-moves-from-4rays.json` | 项目 schema 近似 | boxes 为占位 |
| 分招文件 | `app/public/data/moves/generated/*.json` | 每招一文件 | 运行时可读 |
| 索引 | `app/public/data/moves/ryu_index.json` | id 列表 | |
| 样板更新 | `app/public/data/moves/ryu_5lp.json` | 与 4rays 对齐 | `review: placeholder` |

CDN 抓取命令（可复现）：

```bash
curl -sL "https://cdn.jsdelivr.net/gh/4rays/sf6-move-data@main/moves/ryu.toml" \
  -o docs/character-control/action-tables/sourced-framedata/4rays-ryu.toml
```

### 1.2 其它网上源（未整包镜像，作交叉校验）

| 源 | URL | 机器可读 | 用途 |
|----|-----|----------|------|
| Capcom 官方帧表 | https://www.streetfighter.com/6/en-us/character/ryu/frame | HTML | 官方 cancel 图例、补丁后核对 |
| SuperCombo Ryu/Data | https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu/Data | HTML 表 | 最细笔记、hitconfirm、DR cancel 延迟等 |
| SuperCombo Ryu | https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu | HTML | 叙述与 cancel 符号 |
| Ultimate Frame Data | https://ultimateframedata.com/sf6/ryu | HTML + **盒 GIF** | 移动友好；盒是图不是 AABB 数组 |
| FAT Online | https://fullmeter.com/fatonline/ | WebApp | 社区常用；JSON 端点未公开稳定直链 |
| sf6fd (Java 库) | https://github.com/sagansfault/sf6fd | 爬取封装 | 依赖运行时爬 wiki |
| Frame-data-API | https://github.com/ysmaelrequena/Frame-data-API | 爬 SuperCombo | 可自建 API，非现成全量 JSON 下载 |
| NappuSakku / FAT 更新脚本 | https://github.com/redforth/NappuSakku | 游戏内 overlay 用 framedata.json | 需游戏/安装器路径，非通用 CDN |

**注意**：4rays 数据**可能落后当前补丁**。写入本地后一律 `review.status = placeholder`，升格「已复刻」前对照 SuperCombo / 官方 / UFD。

### 1.3 转换规则（本仓库）

- `active: [4,6]`（闭区间帧号）→ `active` 帧数 = 3；`boxes.hit.from/to` 按 0-based localFrame（ADR-003）。
- `cancel: "C"` → `specialCancel: true`；**cancel 窗先占位为 active 起至招末**（非精确 hitconfirm 窗）。
- **无 hitstun/blockstun 字段**时不强行编造。
- `glbPath`：若能挂上 `ryu-logic-to-glb-map` 家族路径则写入。
- **`totalFrames` 优先**：4rays 飞弹类常只给 `startup` + `totalFrames`、无 `recovery`。  
  必须写入 `frames.total = totalFrames`，再填  
  `recovery = total − startup − active`（本仓飞弹默认 `active = 1` 出弹帧）。  
  **禁止**在缺 `recovery` 时用 `startup + active` 当 total（曾误把弱/中/强波动写成 17/15/13，正确总长为 **47**）。

---

## 2. 逐帧 hit/hurt — 网上能拿什么

| 形态 | 有无 | 说明 |
|------|------|------|
| **逐帧 AABB 数字 JSON** | ❌ 公开渠道几乎没有完整集 | 竞技站不发布可导入坐标表 |
| **Hitbox 动图 / 分帧图** | ✅ | UFD、SuperCombo 角色页、YouTube Hitbox Reference |
| **游戏内 Hitbox Viewer** | ✅ 工具 | https://github.com/WistfulHopes/SF6Mods + REFramework |
| **MMDK 读 moveset** | ✅ 研究 | https://github.com/alphazolam/MMDK — 需本机 SF6 |

**本仓库策略（已写进生成 JSON）**：

- `boxes.hit` / `hurt` / `push` 带 `"placeholder": true`
- 几何为通用站/蹲 hurt + 前伸 hit，**仅保证管线可跑**
- 真盒：训练模式对照 UFD 图 / Hitbox Viewer **手工或半自动标定**后去掉 placeholder

参考链接（盒可视化，非数字表）：

- UFD Ryu：https://ultimateframedata.com/sf6/ryu  
- SuperCombo Glossary 盒色：https://wiki.supercombo.gg/w/Street_Fighter_6/Glossary  
- Ryu Hitbox 参考视频（例）：https://www.youtube.com/watch?v=4eLnDmS20R8  

---

## 3. 对战用合并 glb — 网上搜不到、本地决策

| 问题 | 结论 |
|------|------|
| 网上有没有「已合并的隆全招 glTF」可合法拉？ | **无可靠公开源**（且涉及提取物分发红线） |
| 本项目路径 | **按 `ryu-logic-to-glb-map.json` 动态加载单 glb**（`private/assets/ryu/anims/...`） |
| 合并大 glb | 可选优化，**非网络搜集项**；用 Blender/本机脚本 |

已有本地映射：

- `docs/character-control/action-tables/ryu-logic-to-glb-map.json`
- `app/public/data/clips/ryu_logic_to_glb_map.json`

---

## 4. SuperCombo → 本地全表

| 做法 | 状态 |
|------|------|
| 整站镜像 wiki | **不做**（体积/许可/维护） |
| 权威链接清单 | ✅ 已在 `sources.md` |
| 机器可读替代抄本 | ✅ **4rays TOML/JSON**（字段少于 SuperCombo Data 页笔记） |
| SuperCombo 独有细项 | hitconfirm 窗、DR cancel 延迟、逐 active 备注 → **仍需按招人工从 Data 页补** |

建议流程：

1. 运行时以 `generated/*.json` 为底稿  
2. 打样招时打开 SuperCombo Ryu/Data 同招，补 notes / cancel 窗 / 盒  
3. `review.status` → `reviewed`

---

## 5. 本目录文件列表

| 文件 | 内容 |
|------|------|
| `README.md` | 本说明 |
| `4rays-ryu.toml` | 上游原始 TOML（网络拉取） |
| `ryu-moves-from-4rays.json` | 转换后全集 |
| `../sources.md` | 权威 URL 总表 |
| `../ryu-logic-to-glb-map.json` | 动画路径映射 |
| `../../../app/public/data/moves/generated/` | 分招 JSON |
| `../../../app/public/data/moves/ryu_index.json` | 索引 |
| `../../../app/public/data/moves/ryu_5lp.json` | 样板（已用 4rays 刷新） |

---

## 6. 许可与使用边界

- 帧数据内容版权属 **Capcom**；社区整理仅供**私人研究**。  
- 4rays 仓库：**代码 MIT**；游戏数据不因开源仓库而可再分发到公开产品。  
- 本项目共识：**不公开分发**提取物与冒充正版数据的完整商业表。

---

## 7. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-10 | 拉取 4rays ryu.toml；转换 60+ 招 JSON+占位盒；四类缺口检索结论落盘 |

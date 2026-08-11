# 动作表权威源清单

> 共识：填本地表时**强制对照**下列来源；运行时只读本地自持数据。  
> 冲突：审查后写入本地 → 本地为唯一运行时权威。

---

## 1. 系统级（操控骨架）

| # | 名称 | URL | 用途 |
|---|------|-----|------|
| S1 | SuperCombo · Game Data | https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data | 缓冲、hitstop、hurt 过渡、combo-only 等 |
| S2 | SuperCombo · Offense | https://wiki.supercombo.gg/w/Street_Fighter_6/Offense | 普攻/特/投、CH/PC、优先级 |
| S3 | SuperCombo · Defense | https://wiki.supercombo.gg/w/Street_Fighter_6/Defense | 防、tech、reversal、起身 |
| S4 | SuperCombo · Movement | https://wiki.supercombo.gg/w/Street_Fighter_6/Movement | walk/dash/prejump/landing |
| S5 | SuperCombo · Gauges | https://wiki.supercombo.gg/w/Street_Fighter_6/Gauges | Drive 全家桶 |
| S6 | SuperCombo · Controls | https://wiki.supercombo.gg/w/Street_Fighter_6/Controls | Classic 语义 |
| S7 | SuperCombo · Glossary | https://wiki.supercombo.gg/w/Street_Fighter_6/Glossary | 盒色、cancel 符号、记法 |

---

## 2. 隆角色级

| # | 名称 | URL | 用途 |
|---|------|-----|------|
| R1 | SuperCombo · Ryu | https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu | 招式叙述、cancel 符号 |
| R2 | SuperCombo · Ryu/Data | https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu/Data | 逐招帧与笔记 |
| R3 | SuperCombo · Ryu/Combos | https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu/Combos | `>` `~` `,` 连段 |
| R4 | Capcom · Command List | https://www.streetfighter.com/6/en-us/character/ryu/movelist | 官方指令名 |
| R5 | Capcom · Frame Data | https://www.streetfighter.com/6/en-us/character/ryu/frame | 官方帧与 cancel 图例 |
| R6 | Ultimate Frame Data · Ryu | https://ultimateframedata.com/sf6/ryu | 交叉校验、移动友好 |

---

## 3. 盒 / 工具（对照，非运行时依赖）

| # | 名称 | URL | 用途 |
|---|------|-----|------|
| B1 | SF6Mods Hitbox Viewer | https://github.com/WistfulHopes/SF6Mods | 盒类型与截帧对照 |
| B2 | MMDK（研究） | https://github.com/alphazolam/MMDK | moveset 研究（私人） |

---

## 4. 项目内 ADR

| ADR | 路径 | 用途 |
|-----|------|------|
| ADR-001 | `docs/decisions/ADR-001-logic-fps-60.md` | 60 Hz |
| ADR-002 | `docs/decisions/ADR-002-box-center-convention.md` | 盒中心坐标 |
| ADR-003 | `docs/decisions/ADR-003-move-frame-indexing.md` | 帧索引 |

---

## 5. 采信优先级（本目录约定）

1. 写入并**已审查标记**的本地运行时表  
2. SuperCombo 系统 + Ryu/Data（内容采信主源）  
3. Capcom 官方 Command / Frame  
4. UFD 交叉  
5. 工具截帧 / 实验室帖（边角）  

调研过程摘录：`docs/research/sf6-character-control-research-2026-08-10.md`

---

## 6. 机器可读帧表（已落盘）

| 源 | 本地路径 |
|----|----------|
| 4rays/sf6-move-data `moves/ryu.toml` | `sourced-framedata/4rays-ryu.toml` |
| 转换 JSON + 说明 | `sourced-framedata/` · `app/public/data/moves/generated/` |

细节与「盒/glb 网上拿不到」的结论 → `sourced-framedata/README.md`。

---

## 7. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-10 | 初版，随角色控制设计共识 v0 |
| 2026-08-10 | 增加 4rays 帧表落盘与 sourced-framedata |

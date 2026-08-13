# MMDK 字段 → 本地运行时表映射

> **状态**：2026-08-12 已对着本机 `private/mmdk/Ryu` 实测  
> 来源：[alphazolam/MMDK](https://github.com/alphazolam/MMDK) `PlayerData/Ryu/`  
> 转换：`tools/mmdk_convert/convert_ryu_normals.mjs`

## 私人文件（勿提交 git）

| 路径 | 源文件名 | 用途 |
|------|----------|------|
| `private/mmdk/Ryu/rects.json` | `Ryu rects.json` | 框尺寸库（分桶，**同 id 可重复**） |
| `private/mmdk/Ryu/moves_dict.json` | `Ryu moves_dict.json` | 顶层即动作名 → 键表 |
| `private/mmdk/Ryu/hit_dt.json` | `Ryu HIT_DT.json` | 伤害/硬直/停顿/推开 |
| `private/mmdk/Ryu/names.json` | `Ryu Names.json` | 名称对照 |
| `private/mmdk/Ryu/SOURCE.txt` | 人工 | 来源与日期 |

## 实测键路径

### moves_dict

- 顶层键：`ATK_5LP`、`ATK_5MP`…（**无** `By_Name` 包裹）
- `ATK_5LP.fab.Frame` = **39**（动作时间轴长度，≠ 公开 total 13）
- `ATK_5LP.fab.ActionFrame` = `{ MainFrame, FollowFrame, MarginFrame }`（MarginFrame 13 接近公开 total）
- `AttackCollisionKey["2"]`：打击段  
  - `_StartFrame` / `_EndFrame`（例：3–6）  
  - `_isStr: true`  
  - `BoxList: {"0": 1}` → 矩形 id  
  - `HitOffset: {x,y}` → **作为打人框中心**（转换脚本策略）  
  - `AttackDataListIndex: 15` → HIT_DT `015`
- `AttackCollisionKey["1"]`：接近防框（`_isPrx: true`）— **本阶段不导出为 hit**
- `DamageCollisionKey`：`HeadList` / `BodyList` / `LegList` + `_StartFrame`/`_EndFrame`
- `PushCollisionKey`：`BoxNo` + 帧范围
- `PlaceKey["1"].PosList`：`"00"…"38"` 累积位置（5LP 全 0）

### rects

- 结构：`{ "00": { "001": { OffsetX, OffsetY, SizeX, SizeY, … }, … }, "01": … }`
- **同一数字 id 可在多桶出现**；转换时过滤离谱 `OffsetY`（如 640）再选
- 单位：约 0.01 → 逻辑世界（站立身体高约 1.7）

### HIT_DT

- 键：`"015"` 零填充
- `common["0"]` / `param["00"]`：站立击中  
  - `DmgValue`, `HitStun`, `HitStopOwner`/`HitStopTarget`, `MoveDest.x`
- `common["1"]`：偏格挡/另一种受击（`DmgValue` 常 0）→ 用作 blockstun / 防御推开

## 本地字段映射

| MMDK | 本地 |
|------|------|
| 公开 generated frames | `frames.*`（total 权威） |
| AttackCollision 打击 + rect + HitOffset | `boxes.hit[]` |
| DamageCollision 头身腿 | `boxes.hurt[]` |
| PushCollision | `boxes.push[]` |
| PlaceKey PosList 差分 | `selfMovement[]` |
| fab.Frame | `timelineFrames` 下限 |
| HIT_DT HitStop* | `hitstopOnHit` / `hitstopOnBlock` |
| HIT_DT HitStun (common.1) | `blockstun` |
| HIT_DT MoveDest.x × scale | `blockPushbackTotal` |

## 单位

见 `unit-calibration.md`：默认 `MMDK_UNIT_SCALE=0.01`。

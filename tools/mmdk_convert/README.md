# MMDK → 本地运行时表转换

对齐 `docs/plans/ai-execution-plan-box-assembly-full-v1.md` 与共识 §4 / §6.8。

## 输入（私人，勿提交）

```text
private/mmdk/Ryu/rects.json
private/mmdk/Ryu/moves_dict.json
private/mmdk/Ryu/hit_dt.json
private/mmdk/Ryu/SOURCE.txt
```

来源：[alphazolam/MMDK](https://github.com/alphazolam/MMDK) PlayerData 或 `dump_*_json`。

## 运行

```bash
# 仓库根
node tools/mmdk_convert/convert_ryu_normals.mjs --check
node tools/mmdk_convert/convert_ryu_normals.mjs --stance
node tools/mmdk_convert/convert_ryu_normals.mjs --coverage   # 全应接 + 姿态
node tools/mmdk_convert/convert_ryu_normals.mjs --all-normals
node tools/mmdk_convert/convert_ryu_normals.mjs --only 5lp
```

缺 private dump → exit 2 + `BLOCKED:`（不写伪造 reviewed 框）。

## 环境变量

| 变量 | 默认 | 含义 |
|------|------|------|
| `MMDK_UNIT_SCALE` | `0.01` | MMDK → 逻辑单位 |
| `CLAMP_BASE_HURT_TO_TOTAL` | 开（`0` 关） | `layer:base` hurt 的 `to` clamp 到 `total-1` |

## 双源规则

| 字段 | 来源 |
|------|------|
| `frames.*` / advantage | 公开 `generated/` 或 4rays |
| boxes（含 `layer`/`part`）/ selfMovement / HIT | MMDK |
| `review.status` | `mmdk_converted` 当 action 成功 |

Place：`PosList` 累积差分 → `selfMovement`（`placeCumToDx`）。  
Steer：`ValueType 0/1` = 水平/竖直速度；该轴保持到下一次同轴改写，再乘 `UNIT_SCALE` 写入 `selfMovement` / `selfMovementY`（旋风腿长位移、驴踢冲量等）。  
波动等：本体动作无 strike 时合并 `… PROJ` 的 AttackCollision。

## 输出

- `app/public/data/systems/ryu_stance_boxes.json`  
  - `stances.stand|crouch|air`：静态姿态绿/推挤  
  - `transitions.stand_to_crouch` / `transitions.crouch_to_stand`：MMDK `BAS_STD_CRH` / `BAS_CRH_STD` 分段时间轴（通常 2 段，非逐帧 morph）
- `app/public/data/moves/ryu_*.json`
- `tools/mmdk_convert/coverage_list.json` / `coverage_report.json`
- `docs/character-control/action-tables/sourced-stance-boxes.md`
- `docs/character-control/action-tables/deferred-moves.md`

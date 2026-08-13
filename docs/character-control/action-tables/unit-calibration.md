# MMDK 单位 → 逻辑世界单位

> 共识 §3.10：走/冲/跳与攻击位移同一逻辑单位。  
> **状态**：2026-08-12 初值 — 无私有 dump 时的**临时**标定；有 dump 后重测。

## 逻辑世界尺子（已本地）

来源：`sourced-movement/ryu-movement.md` / `ryu_movement.json`

| 量 | 逻辑单位 / 帧或总距 |
|----|---------------------|
| 前走 | 0.047 / f |
| 后走 | 0.032 / f |
| 前冲 | 1.252 / 19f |
| 站立 hurt 占位宽 | 0.7 |

## UNIT_SCALE（已实测 dump）

| 常数 | 值 | 说明 |
|------|-----|------|
| `MMDK_UNIT_SCALE` / 脚本默认 | **0.01** | MMDK 内部单位 → 逻辑世界（水平） |
| `MMDK_BODY_HEIGHT` / `LOGIC_BODY_HEIGHT` | **1.85** | 与 `normalizeModelToHeight` 一致；姿态叠顶标定到此高度 |
| 姿态/招式 **hurt** | bucket **`08` 优先**；`Size` 半轴 ×2；再 **`yFit = 1.85 / rawTop`** 缩放 y,h | 站立三绿 y∈[0, **1.85**]、x≈0 |
| 打击 **hit** | HitOffset 中心 + Size 全尺寸，**同一 yFit** 缩放 y,h | 5LP hit y 随 yFit 抬高 |
| GUI `mmdkUnitScale` | 默认 1 | 叠在已写入 JSON 的位移上再调 |
| `selfMovementScale` | 默认 1 | 手感微调 |

**坑（2026-08-13）**  
1. 同 id 多桶 → 大 `OffsetX` 侧飘：hurt 用 bucket `08`。  
2. 半轴 stack 顶 ~1.66 vs 模型 1.85 → 框整体偏下、不盖头：必须 yFit。

复查：训练场头应进绿框；改 `MMDK_BODY_HEIGHT` 后重跑 `--coverage`。

## 通道

攻击 Place 与防御推开 **分字段**；GUI：`blockPushbackTotal` 默认 **0.22** 逻辑单位（占位，可调）。

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
| 打击 **hit** | 中心：`HitOffset≠0`→HitOffset + Size 全尺寸；`HitOffset≈0`→rect Offset + **按轴**半轴（raw X≤45 / Y≤25 则×2，否则全尺寸）+ preferExtendedX。同一 **yFit** | 5LP ~0.5×0.65；j.HK ~0.80×0.49；j.MK ~0.70×0.38 + 0.64×0.33 |
| GUI `mmdkUnitScale` | 默认 1 | 叠在已写入 JSON 的位移上再调 |
| `selfMovementScale` | 默认 1 | 手感微调 |

**坑（2026-08-13）**  
1. 同 id 多桶 → 大 `OffsetX` 侧飘：hurt 用 bucket `08`。  
2. 半轴 stack 顶 ~1.66 vs 模型 1.85 → 框整体偏下、不盖头：必须 yFit。  
3. **打击**同 id 多桶 + `HitOffset≈0` 时，max-area 会误选身体居中副本（如 j.HK rect37 bucket `05` ox=0）→ 攻击框贴在躯干。应优先 **|OffsetX| 更大** 的延伸桶（bucket `00` ox=83）。`HitOffset≠0` 时仍用 max-area 取尺寸。  
4. **j.HK ≠ j.MK 的 Size 包装**：二者都是 `HitOffset≈0`，但不能共用「全局半轴」或「全局全尺寸」。  
   - j.HK 单框 rect37 **40×22** → 两轴半轴×2 → ~0.80×0.49（盖腿；用户已确认）。  
   - j.MK 双框 rect35 **70×17**、rect36 **64×30** → 宽轴已是全肢跨度保持全尺寸，仅薄的 Y（≤25）×2；全局×2 会把脚框拉到 1.28 伸出脚尖。  
   - 实现：`strikeOffsetSizePacking`（X≤45 / Y≤25 独立×2）。绿整腿是 hurt extend，不是第三段 hit。

复查：训练场头应进绿框；改 `MMDK_BODY_HEIGHT` 后重跑 `--coverage`。

## 通道

攻击 Place 与防御推开 **分字段**；GUI：`blockPushbackTotal` 默认 **0.22** 逻辑单位（占位，可调）。

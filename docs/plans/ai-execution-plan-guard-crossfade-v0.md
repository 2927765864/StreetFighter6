# 格挡溶图接线（执行稿）

> **节点**：2026-08-19  
> **规格**：`consensus-design-v0.md` §3.11（双播旧尾+溶新）+ 下表增补  
> **禁止**：新混合器、用 `GRD_*_END` 当逻辑必播、溶图延长硬直

## 分情况（必须按此实现）

| 衔接 | 溶 | 时长 |
|------|----|------|
| 任意 → 格挡**反应片** `grd_*` | 不溶 | 硬切 |
| `grd_*` → 下一击 `grd_*` | 不溶 | 硬切 |
| `grd_*` → `block_*_loop`（硬直结束） | 溶 | `residualToStanceSec` |
| `block_crouch_loop` ↔ `block_stand_loop` | 溶 | `residualToStanceSec` |
| 格挡 loop → idle/crouch/走 | 溶 | `residualToMoveSec` |
| idle/crouch → 格挡 loop（人偶待机防姿） | 溶 | `locoSec` |
| 受击 `hitstun_*` | 仍不溶 | 硬切 |

## 代码

1. `AnimCrossfade.ts`：`categorizeBinding` 把 `grd_*` / `block_*` 标成 `guard`；`resolveCrossfadeSec` 实现上表。  
2. `FighterView.ts`：`hitstun` 仍整段硬切；`blockstun` 反应片硬切且 **不** 每帧清掉「即将离开硬直」之外的策略——离开硬直走 idle 分支的 `fadePolicy`。idle 解析 action 必须用 `fighter.animRole`（loop 片不是 `main`）。  
3. 单测：`animCrossfade.test.ts` 覆盖上表。  
4. 共识 §3.11.2 补三行格挡，不另开机制。

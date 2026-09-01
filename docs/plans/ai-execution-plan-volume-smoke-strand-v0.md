# AI 执行方案：体素烟 · 缕烟模式 v0

> **状态**：可执行（2026-08-31）  
> **上位需求**：`docs/hit-vfx-volume-smoke-strand-consensus-v0.md`（写进即全做）  
> **本文件效力**：一次做完；禁止「先只做球以后再做环」；允许事后修 bug / 拧默认值。

---

## 0. 做成定义

1. `VolumeSmokeParams` 增加缕烟字段；`normalize` / `default` / 旧配方兼容。  
2. 关闭缕烟时，`seedWeight` 与今日一致（整团外形掩码）。  
3. 开启缕烟时：CPU 按种子生成最多 `MAX_STRANDS` 条二次曲线烟绳 → 上传 GPU → `seedWeight` = 外形壳 ×（绳管密度 + 绳旁淡烟），边缘软硬可调。  
4. 密度/温度/冲击仍乘同一 `seedWeight`（冲击路径已有的 `seedWeight` 调用一并受益）。  
5. 编辑器「【受击】溅射与种子」下增加「缕烟」子块 + 简单预览线。  
6. 单测覆盖：归一化、同种子可复现、生成条数/落点在外形附近、关开关无回归字段。

---

## 1. 数据模型

文件：`app/src/render/hitVfx/hitVfxTypes.ts`

```ts
// 新增字段（全部进 VolumeSmokeParams）
strandMode: boolean;          // 缕烟开关，默认 false
strandCount: number;          // 条数基准，默认 8，钳制 1..MAX_STRANDS(48)
strandLength: number;         // 相对 hitRadius，默认 0.85
strandThickness: number;      // 相对 hitRadius，默认 0.18；艺术半径不抬粗；亚体素靠锐利 cover 丝带保活
strandLength: number;         // 相对 hitRadius；禁止为铺满外形自动拉长
strandSpacing: number;        // 相对 hitRadius，默认 0.22
strandTwistDeg: number;       // 整体绕外形主轴再转，默认 0
strandAngleJitterDeg: number; // 各缕相对主方向最大偏角，默认 18
strandBend: number;           // 弯曲 0..2，默认 0.55
strandEdgeSoftness: number;   // 0=硬裁壳内 … 1=默认可轻探出，默认 0.65
strandGapFill: number;        // 绳旁淡烟 0..1，默认 0.12
strandRandomAmount: number;   // 缕相关总随机，默认 1
```

`expandedSections` 不强制新键；缕烟控件挂在现有 `hitSplat` 区块内（需求：形状/泼溅附近单独一块 UI，不必新折叠节）。

`MAX_STRANDS = 48`（`strandSeed.ts` 导出）。

---

## 2. 生成算法（CPU）

新文件：`app/src/render/hitVfx/volumeSmoke/strandSeed.ts`

### 2.1 输出

每条绳：

| 字段 | 含义 |
|------|------|
| `p0,p1,p2` | UVW 空间二次贝塞尔（绝对坐标，已含 hitCenter） |
| `r0, rMid, r1` | 两端与中点半径（UVW） |
| `profile` | `0` 均匀 / `1` 圆锥 / `2` 纺锤（生成时已烤进 r0/rMid/r1，shader 只用三半径插值） |

### 2.2 RNG

- 使用现有 `mulberry32(spawnSeed ^ 0xA5A5_STRAND)`（或等价派生），再乘 `strandRandomAmount`。  
- 与 `buildSpawnVariation` 独立流，避免互相搅乱现有抖动；同 `spawnSeed` + 同参数 → 同缕集。

### 2.3 外形坐标系

与现有一致：`seedQuat` 把局部 `+Y` 对齐受击轴+`seedRotation`；局部 `+X` = tangent（弧/箭用）。

局部点 → UVW：`centerUVW + local * hitRadiusUVW`（再按外形约束）。

### 2.4 各外形默认走向

| 外形 | 主路径 |
|------|--------|
| **sphere** | 平行束：中心线大致沿局部 +Y；横截面六角/圆环排布，间距 ≈ `strandSpacing` |
| **disk** | 束在盘平面内，主方向局部 +X，沿 +Z 排开 |
| **ring** | 沿环中线切向走弧段；周向均分起点，弧长 ≈ `strandLength` |
| **arc** | 同环，但起点限制在弧张角内 |
| **arrow** | 两臂各分配约一半缕，沿臂方向 |
| **column** | 平行束沿局部 +Y；在 XZ 截面按间距铺 |

每缕：

1. 取中心线基路径（直段或沿环切向）。  
2. `strandTwistDeg` + 角度抖动旋转。  
3. `strandBend`：控制点 `p1` 沿法向/副法向偏移，形成明显弯。  
4. 长度：`strandLength * hitRadiusUVW * (1 ± rand)`。  
5. 粗细：基准 `strandThickness`；样式随机均匀/圆锥/纺锤，写入三半径。  
6. 条数：`round(strandCount * (1 ± k * strandRandomAmount))`，钳制 `1..MAX_STRANDS`。

### 2.5 纯函数可测

导出 `buildStrandSet(args) → StrandDesc[]`；单测不碰 WebGPU。

---

## 3. GPU：改 `seedWeight`

文件：`HitSmokeVolume.ts`（`@ts-nocheck` TSL）

### 3.1 上传

- `uStrandMode`、`uStrandCount`、`uStrandGapFill`、`uStrandEdgeSoft`。  
- `strandBuf = instancedArray(MAX_STRANDS * 4, 'vec4')`：  
  - `[i*4+0] = (p0.xyz, r0)`  
  - `[i*4+1] = (p1.xyz, rMid)`  
  - `[i*4+2] = (p2.xyz, r1)`  
  - `[i*4+3]` 预留。  
- `armSplat` / `syncStrandSeed`：关模式时 `uStrandMode=0`；开则 `buildStrandSet` 写入 buffer。

### 3.2 单缕权重

对 UVW 点 `x`：

1. 在 `t = 0, 1/4, 1/2, 3/4, 1` 采样贝塞尔点，折成 4 段，取点到线段最小距离 `d`，同时得最近 `t*`。  
2. `r(t) = 按 t 在 r0/rMid/r1 间分段线性`。  
3. `tube = exp(-d² / max(r,ε)²)`。

总绳场：`sw = max_i tube_i`（仅 `i < count`）。

### 3.3 合成

```
shell = 现有外形 seedWeight(uvw)   // 不改公式
gate  = mix( smoothstep(0.08, 0.25, shell),   // 硬
             smoothstep(0.01, 0.12, shell),   // 软（更易探出）
             edgeSoft )
halo  = shell * gapFill * exp(-dMin² / (rHalo)²) * (1 - saturate(sw))
       // rHalo ≈ 2.2 * 平均粗细；用全局 u 或随最近 r
out   = strandMode ? (sw * gate + halo) : shell
```

`splatHitDyePass` 与冲量里的 `seedWeight(uvw)` 都走合成后的函数。

---

## 4. 运行时接线

| 文件 | 改动 |
|------|------|
| `HitSmokePool.ts` | `spawn` 把缕烟字段拷进 `volume.params` |
| `VolumeSmokeRuntime.ts` | `pool.spawn({...})` 传入缕烟字段 |
| `scaleWorldSize.ts` / `cloneVolumeSmokeParams` | 无需缩放比类字段；克隆已浅拷贝顶层即可 |

---

## 5. 编辑器

文件：`HitVfxEditorPanel.ts` → `volumeSmokeParamsHtml`

在「显示初始形状」一行附近插入：

- 标题「缕烟」  
- `strandMode` 复选  
- `data-strand-mode` 包裹其余数值行（关则 `display:none`，与现有 `data-seed-shapes` 同类）  
- 绑定：沿用现有 `[data-p]` 数字/复选逻辑；`strandMode` 切换时刷新显隐并 `softReplay`

预览：`seedShapeGizmo.ts`

- `strandMode && showSeedShape`：在 seed group 下加 `Line` 折线（每缕采样 6～8 点），颜色区别于外形线框。  
- `rebuildSeedShapeGizmo` 用同一 `buildStrandSet`（预览可用单位半径局部空间，再乘 hitRadius）。

---

## 6. 测试

`app/tests/render/hitVfx/volumeSmoke.test.ts`（或新 `strandSeed.test.ts`）：

1. `normalizeVolumeSmokeParams({})` → `strandMode===false`，默认值齐全。  
2. `buildStrandSet` 同种子同参 → 深度相等。  
3. `strandCount`/`strandRandomAmount` 影响条数范围。  
4. 环/弧生成点到环面距离有上限（不飞出离谱）。  
5. 关 `strandMode` 时既有 seedShape 单测仍过。

---

## 7. 验收对照

对照共识 §8；手感默认值可在实现后微调，但字段与行为不得缩水。

---

## 8. 实现顺序

1. 文档已锁定（本文件 + 共识）。  
2. `strandSeed.ts` + 单测。  
3. `hitVfxTypes` 默认/归一化。  
4. `HitSmokeVolume` seedWeight + buffer 上传。  
5. Pool / Runtime 传参。  
6. 编辑器 UI + gizmo 预览。  
7. 跑测试；必要时开预览页肉眼看一眼。  

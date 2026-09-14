# 生成契约 v0（Prompt + 硬约束）

> **上位**：`consensus-v0.md`  
> **拆解输入**：`_analysis/完整命中特效参考.decomposition.md`  
> **依据**：管线 C 社群实践（一次出网格 sheet、纯色色键底、格内安全区、身体/FX 分离）与本参考拆解。  
> **用途**：Agent 生成每个组成元素 sheet 时必须遵守的契约；后处理按同一契约读格。

---

## 1. 全局硬约束（所有元素共用）

### 1.1 Sheet 布局

| 项 | 契约 |
|----|------|
| 默认网格 | **对本命中参考作废 2×2 / 6 帧终稿**。E1/E2 约 10 帧；E3/E4/E5/E6 约 12–16 帧 @30fps。行优先横条或 5×2 / 4×4 均可 |
| 旧默认 | 契约初稿的 2×2（4 帧）只适用于极短元素的草稿，**不得**当本参考烟层/火花的最终密度 |
| 画布 | 正方形整图（建议 1024×1024）；格等大、无装饰分隔线、无黑边框 |
| 每格内容 | **仅当前元素的一个相位**；禁止同格混入其它元素（烟格里不要画闪光，反之亦然） |
| 安全区 | 特效主体落在格内 **中央约 60–70%**；不穿格边；格缘留空 |
| 锚点 | **center**（特效中心对齐格心；不做脚底锚） |
| 相机 | 正交/平面游戏特效视角；无透视畸变；无地面、无角色、无场景、无 UI |

### 1.2 色键与通道

| 项 | 契约 |
|----|------|
| raw 背景 | 纯色 **`#FF00FF`（洋红）**，无渐变、无阴影铺底、无噪声底 |
| 主体禁色 | 特效本体 **不得** 使用洋红及其近色（避免抠穿） |
| 为何洋红 | 本参考以橙黄白亮核为主；绿幕易与焦橙/皮肤邻近色冲突；社群 Agent sheet 产线常用洋红 |
| 透明 | 后处理色键后得到真 alpha；raw 阶段不要求模型直接出透明 PNG |

### 1.3 风格与法务

| 项 | 契约 |
|----|------|
| 风格锚 | 写实偏物理的格斗命中感（短命、前重后轻）；允许简化，不要求物理守恒 |
| 禁止 | 抄官方贴图/解包；水印；文字；Logo；角色身体；完整合成「一整套命中」糊在一张 sheet |
| 混合暗示 | 亮核/火舌按 **additive 可读** 设计（深底上的亮色）；烟/汗按 **半透明叠层** 可读设计 |

### 1.4 负向词（全局追加）

```text
negative / avoid:
character, person, body, fist, UI, HUD, text, watermark, logo, black borders between cells,
grid lines drawn as decoration, gradient background, drop shadow on background,
magenta on the effect itself, multiple different VFX types in one cell,
cartoon star burst sticker, lens flare dirt, photographic bokeh background
```

---

## 2. Prompt 拼装模板

每次生成一个元素时，按顺序拼接：

```text
[A. LAYOUT]
[B. CHROMA]
[C. ELEMENT BODY]   ← 见 §3 各元素
[D. FRAMES]         ← 见 §3 各元素相位
[E. GLOBAL AVOID]   ← §1.4
```

### A. LAYOUT（固定）

```text
Create a single 2x2 game VFX sprite sheet on a square canvas.
Equal-sized cells, no gaps, no decorative borders or black lines between cells.
One effect stage per cell, left-to-right then top-to-bottom (frame0 top-left, frame1 top-right, frame2 bottom-left, frame3 bottom-right).
Center-anchor: the effect's visual center is centered in each cell.
Keep the effect inside the middle 60-70% of each cell; do not cross cell edges.
Orthographic flat game-VFX view. No ground, no character, no scene, no UI.
```

### B. CHROMA（固定）

```text
Solid flat background color #FF00FF magenta in every cell. No gradient, no vignette, no shadow on the background.
The effect itself must not contain magenta or hot pink.
```

---

## 3. 分元素契约与 Prompt（E1–E6）

描述来自拆解文档；下列英文主体供 `image_gen` 使用，中文要点供审查对照。

---

### E1 · 核心闪光 / 命中爆心

**中文要点**  
白核→亮黄→橙金；沿水平打击轴拉长的扁椭圆爆心；一现即峰值，再向心缩小变暗；additive；短命。

**C. ELEMENT BODY**

```text
Subject: ONLY a hit-impact core flash / energy burst for a fighting-game punch connect.
Style: semi-realistic short physical energy core, soft edges, additive glow.
Colors: white-hot center → bright yellow → orange-gold rim. No blue magic, no green.
Shape: horizontally elongated flattened ellipse / short streak along a left-to-right impact axis (not a perfect circle, not a long sword slash, not a sticker star).
No smoke, no spark particles as a separate spray field, no character — only the core flash.
```

**D. FRAMES**

对齐参考帧 1–10，约 10 帧：出现即峰值 → 平台搅碎条 → 单向缩小变暗。不要 4 帧。

**推荐文件名**：`E1_core_flash`

---

### E2 · 近核火花粒子

**中文要点**  
闪光附近的离散亮橙/金黄火花点，与 E1 同时出现；颗粒不是火舌、不是烟、不是汗。约 8–10 帧 @30fps。

**C. ELEMENT BODY**

```text
Subject: ONLY small spark particles around a punch-hit flash. Discrete bright orange-gold specks near cell center.
Not a white core flash, not fire tongues, not smoke, not sweat, not character.
Spray from the impact point, irregular, additive, tiny.
```

**D. FRAMES**  
约 8–10 帧对齐参考 1–9：密喷 → 外散变稀 → 熄。禁止 4/6 帧终稿。

**推荐文件名**：`E2_near_sparks`

---

### E2-b · 击中处火星（双 master + 脉冲缩放）

**中文要点**  
橙金离散火星点（无爆心、无烟）。**两张 master**：`master.jpg` 为第 1–6 帧，`master_v2.jpg` 为第 7–12 帧；往复缩放 `1 → 1.02 → 0.98`；末 3 帧淡出。禁止再文生每帧。

**推荐文件名**：`E2b_hit_sparks`

---

### E3 · 圆环烟雾

**中文要点**  
以 flash 为圆心的灰白半透明烟环，径向变大变淡；圆心不飞走。约 12–16 帧。

**C. ELEMENT BODY**

```text
Subject: ONLY a radial ring of light grey-white translucent smoke centered on the impact.
The ring expands outward from a fixed center. Soft volumetric smoke, not a hard shockwave line, not a translating puff, not a long streak, not flash, not sparks.
```

**D. FRAMES**  
紧环 → 半径增大 → 壁变薄 → 残弧。覆盖到参考中后段。禁止 4/6 帧终稿。

**推荐文件名**：`E3_ring_smoke`

---

### E4 · 较宽较短冲击烟雾

**中文要点**  
宽、短的灰白烟团，**整体沿打击轴向前平移**（本片向右）。不是扩环，不是细长条。约 12–14 帧。

**C. ELEMENT BODY**

```text
Subject: ONLY a wide short impact smoke puff. Light grey-white translucent, fat and short along the punch axis.
The whole mass translates forward (left-to-right), it does not grow as a ring and is not a thin long streak.
No flash, no sparks, no character.
```

**D. FRAMES**  
近心宽团 → 质心右移仍宽短 → 变淡。禁止 4/6 帧终稿。

**推荐文件名**：`E4_wide_short_smoke`

---

### E4-c · 宽短纤维烟（单张 master = 第 1 帧，18 帧 PIL）

**中文要点**  
材质同 E8-c 族：洋红底、白色半透明撕边淡烟，轮廓更宽更短。锁定 master = **第 1 帧**。**18 帧**后处理：f1–f10 整体略放大并竖直压缩（放大幅度略大于压缩）、大幅右移；f11–f18 水平拉伸、渐隐、缓慢右移。禁止一次文生整序列。脚本：`compose_e4c_from_master.py`。

**推荐文件名**：`E4c_wide_short_fiber_smoke`

---

### E4-b · 宽短纤维烟（单张 master = 第 1 帧，14 帧 PIL）

**中文要点**  
与 **E4-c** 同一张 master 与同一套变换，但 **14 帧**，转折在 **第 7 帧**：f1–f7 略放大并竖直压缩（放大幅度略大于压缩）、大幅右移（约 2× 第 1 帧宽度）；f8–f14 水平拉伸、渐隐、缓慢右移。脚本：`compose_e4b_from_master.py`。

**推荐文件名**：`E4b_wide_short_fiber_smoke`

---

### E5 · 较窄较长冲击烟雾

**中文要点**  
窄、长的灰白烟带，**整体向前平移**，前缘比 E4 伸得更远。约 12–16 帧。

**C. ELEMENT BODY**

```text
Subject: ONLY a narrow long impact smoke streak. Light grey-white translucent, thin and elongated along the punch axis.
The whole band translates forward; leading edge travels farther than the wide puff. Not a ring, not a fat short cloud, not flash, not sparks.
```

**D. FRAMES**  
短细条 → 前缘右伸拉长 → 远端残带。禁止 4/6 帧终稿。

**推荐文件名**：`E5_narrow_long_smoke`

---

### E5-b · 窄长纤维烟（16 帧，规律同 E5-c）

**中文要点**  
与 **E5-c** 同一张 master、同一套变换：f1 整体 0.5 / 透明度 0.2；f1–f8 缩放到 1、透明度到 1 并大幅右移；f9 起水平缓慢拉伸、持续缓慢右移并渐隐。仅总帧数为 **16**（渐隐与拉伸在 f9–f16 走完）。禁止一次文生整序列。脚本：`compose_e5b_from_master.py`。

**推荐文件名**：`E5b_narrow_long_fiber_smoke`

---

### E5-c · 窄长纤维烟（单张 master + 变换）

**中文要点**  
材质对齐 E8-c 族：洋红底、白色半透明撕边淡烟，轮廓为朝右的扁长冲击条。AI 只出一张 master（`master.jpg` = **第 8 帧**）。**28 帧**后处理：f1 为该图整体 0.5、透明度 0.2；f1–f8 缩放到 1、透明度到 1，并大幅右移；f9 起水平缓慢拉伸、持续缓慢右移并渐隐至 f28。禁止一次文生整序列。脚本：`compose_e5c_from_master.py`。

**推荐文件名**：`E5c_narrow_long_fiber_smoke`

---

### E6 · 反向窄长冲击烟雾（右→左，略宽）

**中文要点**  
与 E5 同一套窄长灰白烟带，**运动方向相反（从右到左）**，烟带宽度比 E5 **略宽**。约 12–16 帧。从 E5 成品派生（水平翻转 + 垂直加厚），不要重新文生。

**C. ELEMENT BODY**

```text
Subject: ONLY a slightly-wider narrow long impact smoke streak. Light grey-white translucent, elongated along the punch axis.
The whole band translates right-to-left (opposite of E5). Not a ring, not a fat short cloud, not flash, not sparks.
```

**D. FRAMES**  
短细条（尖端朝左）→ 前缘左伸拉长 → 远端残带。禁止 4/6 帧终稿。

**推荐文件名**：`E6_narrow_long_smoke_rtl`

---

### E7 · 击中飞出汗水（单张 master + 变换）

**中文要点**  
只表现从接触点甩出的 **白色随机点状汗滴**：针尖大小的圆点为主，夹少量沿飞行方向拉长的短白划，疏密不均、无网格。不是橙金火花、不是闪光碎条、不是烟。  
**生成策略（与 E1–E6 不同）**：AI 只出 **一张** 完整 master（洋红底 + 仅汗点）；序列帧 **禁止** 再文生。用确定性后处理做透明度 / 均匀缩放 / 沿打击轴位移。

**C. ELEMENT BODY**

```text
Subject: ONLY flying sweat droplets from a punch impact.
Tiny irregular pure-white pinhead specks plus a few short thin white dashes,
random scatter, uneven sizes, no grid. Not sparks, not flash, not smoke, not character.
Solid #FF00FF background. Single still image, not a sprite sheet.
```

**D. FRAMES**  
**16 帧 @30fps**。master v1 对应约第 10 帧自然尺寸：第 1 帧缩放小，全程逐渐变大并向左下（更偏下，模拟重力）移动；第 10 帧起透明度递减至消失。禁止再生成每帧图。

**推荐文件名**：`E7_sweat_spray`

---

### E7-b · 四散飞汗（单张 master + 弹道变换）

**中文要点**  
与 E7 同族白色汗点，但 **铺开四散**、不收成一团。AI 只出一张 master（`master.jpg` = 约第 6 帧）；**14 帧**序列用弹道位移（先左上抛溅，过顶点后左下受重力）+ 全程放大 + 末 4 帧淡出。禁止再文生每帧。

**推荐文件名**：`E7b_sweat_scatter`

---

### E7-c · 块状飞汗（单张 master + 弹道变换）

**中文要点**  
与 E7 / E7-b 同族白色汗，但形态是 **不规则块状碎屑**（撕纸/碎冰多边形）夹细丝与碎点。AI 只出一张 master（`master.jpg` = **第 7 帧**）；**16 帧**用确定性后处理：f1 水平拉伸/竖直压缩 → f1–f6 右移并逐渐水平压缩/竖直拉伸 → f7 起右移+重力下落并均匀放大至 1.15 → f10 起渐隐。禁止再文生每帧。

**推荐文件名**：`E7c_sweat_chunks`

---

### E8-b1 · 弧状烟（两张 master，序列待定）

**中文要点**  
只表现裹在受击点附近的 **浅弧状淡烟**：下垂稀薄撕边（约五分之一圆感），不是半圆环、不是横向冲击条。AI 出两张 master（`master_01` / `master_02`）；**12 帧**后处理：f4=m1；f1=m1@0.7+水平压缩 → f4 放大并水平拉伸且全程下移；f8=m2@1.2；f5–f8 放大+下移；f9–f12 水平拉伸+渐隐+下移。禁止文生整序列。

**推荐文件名**：`E8b1_arc_smoke`

---

### E8-b2 · 弧状烟反向（E8-b1 上下翻转）

与 E8-b1 同一套 12 帧缩放 / 3–6 帧重叠交叉淡入 / 渐隐；master **上下翻转**（弧朝向相反），位移 **全程向上**（与 b1 下移相反）。由 `compose_e8b2_from_masters.py` 生成。

**推荐文件名**：`E8b2_arc_smoke`

---

### E8-c1 · 向右扩散纤维烟（单张完整 master，序列待定）

**中文要点**  
材质对齐 **E8-b1**：洋红底、白色半透明撕边淡烟。轮廓为向右撕开；交付用 **逆时针 90°** 的 master（`master_ccw90.jpg`）= **第 10 帧**。**28 帧**后处理：f1 为该图 0.2 并竖直压缩；f1–f10 迅速缩放到 1、竖直拉回正常并快速右移；f11 起渐隐，同时继续竖直拉伸、缓慢右移并整体放大至 f28。禁止一次文生整序列。

**推荐文件名**：`E8c1_right_spread_smoke`

---

### E8-c2 · 向右扩散纤维烟（宽短变体，单张 master + 与 c1 同套变换）

**中文要点**  
与 **E8-c1** 同族：洋红底、白色半透明撕边淡烟、向右撕开，但 master 更宽更矮（中段右瓣 + 右下碎块）。交付 `master_ccw90` = **第 10 帧**。**28 帧**后处理与 c1 相同：f1 为该图 0.2 并竖直压缩；f1–f10 迅速缩放到 1、竖直拉回正常并快速右移；f11 起渐隐，同时继续竖直拉伸、缓慢右移并整体放大至 f28。禁止一次文生整序列。脚本：`compose_e8c2_from_master.py`。

**推荐文件名**：`E8c2_right_spread_smoke`

---

## 4. 单次生成检查清单（生成后、后处理前）

- [ ] 帧数符合该元素约定（E1/E2 ~10；烟层 ~12–16），不是 4 帧或 6 帧终稿  
- [ ] 背景接近纯洋红，无明显渐变  
- [ ] 无角色、无其它元素混入（尤其三层烟不可画在同一格）  
- [ ] 特效大致居中、未严重穿格  
- [ ] 序列能读出该元素自己的运动（火花散熄 / 环扩 / 团前移 / 条前移）  

不合格：改 ELEMENT/FRAMES 后重生成该元素，或 `image_edit` 只修坏格；**不要**拿去硬切糊弄。

---

## 5. 完整 Prompt 示例（E1 可直接粘贴）

```text
Create a single 2x2 game VFX sprite sheet on a square canvas.
Equal-sized cells, no gaps, no decorative borders or black lines between cells.
One effect stage per cell, left-to-right then top-to-bottom (frame0 top-left, frame1 top-right, frame2 bottom-left, frame3 bottom-right).
Center-anchor: the effect's visual center is centered in each cell.
Keep the effect inside the middle 60-70% of each cell; do not cross cell edges.
Orthographic flat game-VFX view. No ground, no character, no scene, no UI.

Solid flat background color #FF00FF magenta in every cell. No gradient, no vignette, no shadow on the background.
The effect itself must not contain magenta or hot pink.

Subject: ONLY a hit-impact core flash / energy burst for a fighting-game punch connect.
Style: semi-realistic short physical energy core, soft edges, additive glow.
Colors: white-hot center → bright yellow → orange-gold rim. No blue magic, no green.
Shape: horizontally elongated flattened ellipse / short streak along a left-to-right impact axis (not a perfect circle, not a long sword slash, not a sticker star).
No smoke, no dark debris, no sweat droplets, no fire tongues wrapping a body — only the core flash.

Frame0 (top-left): birth — small bright white-yellow core just forming, already elongated horizontally.
Frame1 (top-right): peak — largest brightest core, white overexposed center, short orange light whiskers on both sides.
Frame2 (bottom-left): shrink — core smaller and dimmer, whiskers shorter, still horizontal.
Frame3 (bottom-right): dying — tiny dim orange-yellow remnant or nearly gone, no new burst.

Avoid: character, person, body, fist, UI, HUD, text, watermark, logo, black borders between cells, gradient background, magenta on the effect itself, multiple different VFX types in one cell, cartoon star burst sticker.
```

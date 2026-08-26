# AI 执行方案：打击特效底座 + 独立预览编辑台 v0

> **状态**：可执行（2026-08-26）  
> **上位共识**：`docs/hit-vfx-consensus-v0.md`（写进即全做；本方案不得缩水、不得分期冒充完成）  
> **元共识**：`docs/consensus-v0.md` §0  
> **调查（非权威）**：`docs/research/hit-vfx-research-2026-08-26.md`  
> **本方案补充检索**：WebGPU 动态点光、Points 尺寸、透明粒子 depthWrite、Mulberry32 种子、社群讨论（见 §12）  
> **执行者**：AI 代理  
> **技术栈（以仓库为准）**：`three@0.185.1`、`three/webgpu`、`WebGPURenderer`、已有 `DynamicLighting`、Vite、Vitest、`CONFIG` / `ControlPanel` / `shipping.json`、`MatchSim`  
> **编辑页修订（2026-08-26）**：独立 URL 编辑场景见 `docs/plans/ai-execution-plan-hit-vfx-editor-page-v0.md`（`/hit-vfx.html`；主场景不再嵌入预览假人）。

---

## 0. 执行总则（AI 必读）

### 0.1 做成定义（摘自共识，不得改写）

必须全部交付：

1. **元素**：打击火花、火花光照、火花附带小粒子、短促扬尘烟、受击甩出汗珠——均可在编辑台增删、调参、编组。  
2. **规则驱动**：重力/速度/寿命/亮度衰减等参数驱动；可锁种子重放一致；解锁后略有随机。禁止逐帧精灵/视频贴图/写死不可调/抄解包 SF6 特效作主路径。  
3. **光照**：火花短命光须照亮角色（或预览假人）+ 同组其它特效；照谁可勾选。  
4. **位置**：头/胸/腿受击高度档；**力度**：轻/中/重共用配方 × 缩放。  
5. **顿帧**：特效时钟与 hitstop **分开可调**。  
6. **独立预览台**：训练场光照 + 可被照亮假人；加删/分组/参数/低速·逐帧/一键重放/锁种子/保存加载进项目配置。  
7. **对战与预览同一运行时**；未格挡与格挡两套配方可完全不同。  
8. **粒子只靠寿命消失**（不做碰地）。

### 0.2 硬禁止

| 禁止 | 依据 |
|------|------|
| 用一段 flipbook / 视频 / 不可调写死特效冒充做成 | 共识 §3.2 / §4 |
| 引入 SF6 解包特效资源 | 共识 §0 / §4 |
| 音效、震屏、闪白、UI 爆点、衣物物理当作本任务完成项 | 共识 §4 |
| 飞行道具 / 大招全屏特效 | 共识 §3.1 |
| 粒子碰地弹开/摊开 | 共识 §3.3 / §4 |
| 在共识目标里写「先做半截」 | 共识效力 |
| 自造未列出的粒子引擎（自写 WebGPU compute 全家桶、另引 leva 替换主面板等） | 本方案 §0.3；只准用锁定依赖 + 本仓库面板 |
| 每帧 `scene.add/remove` 新建 `PointLight` 而不走预分配池 | §12.1 动态灯坑；本仓库已用 `DynamicLighting` |
| 用 `THREE.Points` + 期望 `gl_PointSize>1` 作为 WebGPU 主路径 | §12.2 官方文档：WebGPU 点原语仅 1px |

### 0.3 强制依赖（禁止用未列出的等价物替换主路径）

| 用途 | 必须使用 | 依据 |
|------|----------|------|
| WebGPU 渲染 | 现有 `THREE.WebGPURenderer`（`app/src/main.ts`） | 本仓库 |
| 动态灯光批处理 | 现有 `DynamicLighting`：`three/addons/lighting/DynamicLighting.js`；`maxPointLights` **≥ 训练场常驻点光 + 打击短命光池** | 灯光方案；[webgpu_lights_dynamic.html](https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_lights_dynamic.html)；本机已有该文件 |
| 粒子运行时 | **npm `three-plume@0.1.1`**（包名 `three-plume`，仓库 [travisdmathis/plume](https://github.com/travisdmathis/plume)） | 调研 §5.1：GPU/TSL、JSON、seeded、LightEmission、sub-emitter；peer `three@^0.184.0` 与本仓 `^0.185.1` 兼容（2026-08-26 `npm view`） |
| 打击预设数值参考表 | **只作默认数字来源**： [tigerabrodi/webgpu-vfx](https://github.com/tigerabrodi/webgpu-vfx) README 中 Impact Sparks / Impact Dust / Spark Streaks 描述；**不**把 `webgpu-vfx` 装成第二运行时 | 调研 §5.3；避免双引擎 |
| 程序化圆点（无精灵表） | `import { shapeCircle } from 'three/tsl'`；宽点用 `Sprite` + `PointsNodeMaterial` | 官方 [PointsNodeMaterial 文档](https://threejs.org/docs/pages/PointsNodeMaterial.html)；示例 [webgpu_instance_points.html](https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_instance_points.html) |
| 可重放 RNG | 本仓库嵌入 **Mulberry32**（禁止 `Math.random` 用于粒子出生） | [cprosche/mulberry32](https://github.com/cprosche/mulberry32)；[Feronato 2026-01 说明](https://emanueleferonato.com/2026/01/08/understanding-how-to-use-mulberry32-to-achieve-deterministic-randomness-in-javascript/)；Rune 工程实践文 |
| 命中挂钩 | `MatchSim` 在写入 `lastHitResult` / `hitstopTimer` 之后调用 `HitVfxDirector.trigger(...)` | 本仓库 `MatchSim.ts` ~891–982 |
| 轻重 / 高度 | `resolveGuardStrength`、`hitToAnimHeight`（`GuardPolicy.ts` / `HitPolicy.ts`） | 不格挡受击共识同一分档 |
| 面板 / 存档 | 现有 `ControlPanel.ts`、`CONFIG`、`persist.ts`、`mergeConfig`、`shipping.json` | 与灯光方案同一习惯 |

**安装（必须执行，禁止跳过）**

```bash
cd app && npm install three-plume@0.1.1
```

安装后 **先读** `node_modules/three-plume` 的 `package.json` exports 与 `.d.ts` / README，确认下列符号的真实导出路径；若符号名与下表略有出入，**以安装包类型声明为准改 import**，不得另起引擎。

| 符号（README 口径） | 用途 |
|---------------------|------|
| `Manager` | `register` / `spawn` / `tick` / `warmup` / `preload` |
| `system` 链式 builder | 编译配方 → 可注册系统 |
| `systemDefToJSON` / `systemDefFromJSON` | 配方序列化辅助（若包导出；否则用本方案自有 `HitVfxRecipe` JSON，运行时再 `register`） |
| Emitter 模块：`SpawnBurst`、重力/阻力、`SizeOverLife`、`AlphaOverLife`、`ColorOverLife` | 元素行为 |
| `LightEmission`（或包内等价「粒子驱动点光」模块） | 火花光照 |
| Render：`renderSprite` / blending additive\|alpha | 火花 vs 烟 |

**UX / 架构参考（抄行为与数据结构，不整仓依赖）**

| 行为 | 参考 |
|------|------|
| 配方列表 + 实时预览 + JSON | [Alchemist0823/three.quarks](https://github.com/Alchemist0823/three.quarks) + [three.quarks-editor](https://github.com/Alchemist0823/three.quarks-editor)（旧仓 archived，行为参考） |
| Unity 风参数台 | [NewKrok/three-particles-editor](https://github.com/NewKrok/three-particles-editor) · [在线](https://newkrok.com/three-particles-editor/index.html) |
| 多元素同开、程序化 silhouette、settings 即 API | [achrefelouafi/LinearAbilityExtThreeJS](https://github.com/achrefelouafi/LinearAbilityExtThreeJS)（`settings.js` + `particles/`） |
| 粒子即光源观感 | [Mirza Beig X](https://x.com/TheMirzaBeig/status/1863595078192713840)（Unity；思路：灯随粒子/短命点光） |
| 短促烟可用少量 billboard | [VinceWedde X](https://x.com/VinceWedde/status/1873352730846306460) |

---

## 1. 现状锚点（改前事实）

| 文件 / 点 | 事实 |
|-----------|------|
| `main.ts` | `WebGPURenderer`；`DynamicLighting({ maxPointLights: 12, ... })`；`lightUseDynamicLighting` |
| `MatchSim.ts` | 格挡成功 → `lastHitResult='block'` + `hitstopTimer`；未格挡 → `'hit'` + hitstun/KD |
| `HitPolicy` / `GuardPolicy` | `resolveGuardStrength`、`hitToAnimHeight` → 轻中重与 h/m/l |
| 粒子特效 | **无**打击 VFX 运行时 / 预览台 |
| `mergeConfig` | 已支持 `lights[]` 整表替换；**尚未**支持 `hitVfxRecipes` |
| `ControlPanel` | 无「打击特效」分类 |

---

## 2. 目标架构（固定，禁止另起炉灶）

```
CONFIG.hitVfxRecipes[recipeId]  ──compile──►  Plume Manager.register(systemId, factory)
        ▲                                            │
        │                                            ├─ spawn at height socket
ControlPanel「打击特效」                              ├─ LightEmission / PointLightPool
        │                                            └─ tick(vfxDt)  // 独立于 hitstop
HitVfxDirector.trigger({ kind, strength, height, pos, seed })
        ▲
MatchSim（hit|block 结算后）  或  预览台「重放」按钮
```

- **权威数据**：`HitVfxRecipe` JSON（进 CONFIG / shipping）。Plume 实例是投影。  
- **同一 `HitVfxRuntime`**：对战场景与预览台共用；预览台只是切换 `hitVfxPreviewActive` 与相机/假人显示。  
- **禁止**预览台另写一套假粒子。

---

## 3. 数据模型（必须按此字段实现）

### 3.1 枚举

```ts
export type HitVfxRecipeKind = 'onHit' | 'onBlock';
export type HitVfxElementType =
  | 'spark'
  | 'sparkLight'
  | 'sparkDebris'
  | 'dust'
  | 'sweat';
export type HitVfxHeight = 'h' | 'm' | 'l';
export type HitVfxStrength = 'L' | 'M' | 'H';
```

### 3.2 元素公共字段 + 专属参数

```ts
export type HitVfxElementBase = {
  id: string;
  name: string;
  type: HitVfxElementType;
  enabled: boolean;
  /** 所属组 id；同组共用开始时刻（共识 §3.5） */
  groupId: string;
  /** 相对组开始的延迟秒；默认 0。齐步=同组同时，仍允许单元素延迟（编辑需要；默认配方全 0） */
  startDelaySec: number;
  /** 该元素是否接收火花光照（勾选） */
  receiveSparkLight: boolean;
};

export type SparkParams = {
  count: number;           // burst 数量
  lifetimeSec: [number, number];
  speed: [number, number];
  size: [number, number];
  colorStart: number;      // 0xRRGGBB
  colorEnd: number;
  brightness: number;      // 乘到颜色
  coneAngleRad: number;
  drag: number;
  gravityY: number;        // 通常 ≥0 上漂或微弱下坠，火花可接近 0
  blend: 'additive';
};

export type SparkLightParams = {
  color: number;
  intensity: number;
  distance: number;
  decay: number;
  lifetimeSec: number;
  /** 强度随寿命衰减曲线：线性即可 */
  intensityEnd: number;
  castOnCharacter: boolean;
  castOnVfxElements: boolean;
};

export type SparkDebrisParams = {
  count: number;
  lifetimeSec: [number, number];
  speed: [number, number];
  size: [number, number];
  color: number;
  gravityY: number;
  drag: number;
  coneAngleRad: number;
  blend: 'additive';
};

export type DustParams = {
  count: number;
  lifetimeSec: [number, number];
  speed: [number, number];
  size: [number, number];
  color: number;
  opacity: number;
  gravityY: number;        // 短促扬尘：微弱上浮或接近 0
  drag: number;
  coneAngleRad: number;
  blend: 'alpha';
};

export type SweatParams = {
  count: number;
  lifetimeSec: [number, number];
  speed: [number, number];
  size: [number, number];
  color: number;           // 偏亮灰蓝/透明白
  gravityY: number;        // 正值表示世界 -Y 重力幅度（实现时 vec3(0,-gravityY,0)）
  drag: number;
  coneAngleRad: number;
  blend: 'alpha';
  /** 禁止启用碰撞；字段存在仅为防误加，必须恒 false */
  collideGround: false;
};

export type HitVfxElement =
  | (HitVfxElementBase & { type: 'spark'; params: SparkParams })
  | (HitVfxElementBase & { type: 'sparkLight'; params: SparkLightParams })
  | (HitVfxElementBase & { type: 'sparkDebris'; params: SparkDebrisParams })
  | (HitVfxElementBase & { type: 'dust'; params: DustParams })
  | (HitVfxElementBase & { type: 'sweat'; params: SweatParams });
```

### 3.3 配方与力度缩放

```ts
export type HitVfxStrengthScale = {
  countMul: number;
  sizeMul: number;
  brightnessMul: number;
  lifetimeMul: number;
  lightIntensityMul: number;
};

export type HitVfxRecipe = {
  id: string;
  name: string;
  kind: HitVfxRecipeKind;
  elements: HitVfxElement[];
  /** 轻/中/重倍率；元素数值 × 对应倍率 */
  strengthScale: Record<HitVfxStrength, HitVfxStrengthScale>;
};

export type HitVfxHeightOffset = Record<HitVfxHeight, { y: number; z: number }>;
```

### 3.4 CONFIG 顶层字段（必须）

| 字段 | 类型 | 默认 | 作用 |
|------|------|------|------|
| `hitVfxEnabled` | `boolean` | `true` | 总开关 |
| `hitVfxRecipes` | `HitVfxRecipe[]` | §3.6 两套默认 | 权威配方表 |
| `hitVfxActiveRecipeOnHitId` | `string` | `'ungarded_default'` | 未格挡使用 |
| `hitVfxActiveRecipeOnBlockId` | `string` | `'block_default'` | 格挡使用 |
| `hitVfxSelectedRecipeId` | `string` | 同上 onHit | 编辑台当前配方 |
| `hitVfxSelectedElementId` | `string` | `''` | 编辑台当前元素 |
| `hitVfxSelectedGroupId` | `string` | `''` | 编辑台当前组 |
| `hitVfxPreviewActive` | `boolean` | `false` | 独立预览台模式 |
| `hitVfxPreviewDummyVisible` | `boolean` | `true` | 可被照亮假人 |
| `hitVfxTimeScale` | `number` | `1` | 特效时间倍率（低速） |
| `hitVfxPaused` | `boolean` | `false` | 暂停 |
| `hitVfxStepFrames` | `number` | `0` | 面板点「步进」时置 1，runtime 消费后清 0 |
| `hitVfxSeedLocked` | `boolean` | `true`（预览默认锁） | 锁种子 |
| `hitVfxSeed` | `number` | `1` | uint32 种子 |
| `hitVfxFollowHitstop` | `boolean` | `false` | `true` 时 hitstop>0 则 vfxDt=0；默认 false=特效自走 |
| `hitVfxHeightOffsets` | `HitVfxHeightOffset` | 见下 | 头胸腿局部偏移（相对受击方躯干） |
| `hitVfxMaxConcurrent` | `number` | `6` | 同时存活实例上限；超出淘汰最老 |
| `hitVfxSparkLightPoolSize` | `number` | `4` | 预分配点光数量 |
| `hitVfxDebug` | `boolean` | `false` | 显示击中点 helper |

**默认高度偏移（世界单位，可面板改；初值按现有角色比例估算，拧参验收）**

| height | y | z |
|--------|---|---|
| `h` | `1.55` | `0` |
| `m` | `1.15` | `0` |
| `l` | `0.55` | `0` |

**默认力度缩放**

| 档 | countMul | sizeMul | brightnessMul | lifetimeMul | lightIntensityMul |
|----|----------|---------|---------------|-------------|-------------------|
| L | 0.65 | 0.85 | 0.75 | 0.9 | 0.7 |
| M | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |
| H | 1.35 | 1.15 | 1.25 | 1.1 | 1.35 |

### 3.5 `mergeConfig`（必须扩展）

与 `lights` 相同策略：incoming 含 `hitVfxRecipes` 数组则 **整表替换**（先 `normalizeHitVfxRecipe`）。  
`hitVfxHeightOffsets` 若为对象则浅合并三档。

依据：`app/src/config/store.ts` 现有 `lights` 分支。

### 3.6 默认两套配方（必须写入工厂默认；数字来自调研对照表）

**`ungarded_default`（onHit）** — 一组 `groupId: 'main'`，五元素全开，`startDelaySec: 0`：

| type | 关键参数默认（再 × strengthScale） | 数值依据 |
|------|--------------------------------|----------|
| spark | count 28；life 0.08–0.18；speed 2.5–6；size 0.03–0.08；色 `0xffe0a0`→`0xff6020`；brightness 1.4；cone 0.7rad；drag 0.15；gravityY 0；additive | webgpu-vfx Impact Sparks / Spark Streaks 方向（短、亮、锥射） |
| sparkLight | color `0xffb060`；intensity 4.5；distance 2.8；decay 2；life 0.12；intensityEnd 0；castOnCharacter true；castOnVfxElements true | three `PointLight` 文档；Mirza「粒子发光」；本仓 DynamicLighting 点光 |
| sparkDebris | count 16；life 0.12–0.28；speed 1.2–3.5；size 0.02–0.05；色 `0xffcc88`；gravityY -2；drag 0.25；cone 0.9 | LinearAbility chips/debris；附带火星 |
| dust | count 10；life 0.2–0.45；speed 0.3–1.2；size 0.18–0.4；色 `0xc8c0b0`；opacity 0.45；gravityY 0.4；drag 0.5；cone 1.0；**alpha** | webgpu-vfx Impact Dust；Vince「少量烟卡」 |
| sweat | count 8；life 0.25–0.55；speed 1.0–2.8；size 0.015–0.035；色 `0xd0e8ff`；gravityY 9.8；drag 0.08；cone 0.85；alpha；collideGround false | 共识汗珠 + Proton/fountain 重力喷溅常识；只寿命消失 |

**`block_default`（onBlock）** — 同结构可先复制后改：sweat `enabled:false`；spark count 14、brightness 0.8；dust count 6；sparkLight intensity 2.2。允许之后在面板改到完全不像（共识不要求像）。

---

## 4. 模块与文件清单（必须按此落盘）

| 路径 | 职责 |
|------|------|
| `app/src/render/hitVfx/mulberry32.ts` | Mulberry32：`createMulberry32(seed)` → `{ next(), float(), range(a,b), int(a,b) }` |
| `app/src/render/hitVfx/hitVfxTypes.ts` | §3 全部类型 + `normalize*` |
| `app/src/render/hitVfx/hitVfxDefaults.ts` | 默认配方与 height/strength |
| `app/src/render/hitVfx/HitVfxPointLightPool.ts` | 预分配 `THREE.PointLight` 池；`acquire/release`；**永不**频繁 add/remove |
| `app/src/render/hitVfx/HitVfxPlumeCompiler.ts` | `HitVfxElement` + strength + seedRng → `Manager.register` 用的 factory（调用 three-plume `system` API） |
| `app/src/render/hitVfx/HitVfxRuntime.ts` | 持有 `Manager`、光池、并发实例表；`setRecipes`；`trigger`；`tick(vfxDt, camera)`；`resetPreview` |
| `app/src/render/hitVfx/HitVfxDirector.ts` | 从 Match/预览构造 `trigger` 参数（height/strength/pos/recipeKind） |
| `app/src/render/hitVfx/HitVfxPreviewDummy.ts` | 简单可照亮假人：`MeshStandardNodeMaterial` 或 `MeshStandardMaterial` 的胶囊/盒子 |
| `app/src/render/hitVfx/HitVfxPreviewControls.ts` | 预览：重放、步进、时间倍率绑定 CONFIG |
| `app/tests/render/hitVfx/*.ts` | 种子重放、normalize、力度缩放、光池 acquire |
| `app/src/config/*` | 字段、merge、persist |
| `app/src/debug/ControlPanel.ts` | 「打击特效」整节 UI |
| `app/src/combat/match/MatchSim.ts` | 结算后 hook |
| `app/src/main.ts` | 创建 Runtime、每帧 tick、预览假人挂接 |

---

## 5. 分步执行（严格顺序，禁止跳步）

### S0 — 安装与类型探测

1. `npm install three-plume@0.1.1`  
2. 写 `app/src/render/hitVfx/plumeApi.ts`：仅 re-export 安装包中实际存在的 `Manager` / `system` / JSON helpers / 模块名。  
3. Vitest：`import { Manager } from './plumeApi'` 不抛错。  

**失败处理**：若 `three-plume` 与 `three@0.185.1` 运行时报错，允许的唯一退路见 **§11 退路 A**（仍禁止第三引擎）。

### S1 — Mulberry32 + 类型 + CONFIG

- 实现 `mulberry32.ts`（算法原文见 cprosche/mulberry32 README Version 1）。  
- `hitVfxTypes` / `hitVfxDefaults`。  
- `MutableSimConfig` 增加 §3.4 字段；`createDefaultSimConfig` 填入两套默认配方。  
- `mergeConfig` / `applyConfig` 处理 `hitVfxRecipes` 与 `hitVfxHeightOffsets`。  
- 测试：同种子连续 `float()` 序列金样；normalize 补默认；shipping 缺字段不炸。

### S2 — PointLight 池

```ts
// 伪代码口径（实现必须等价）
class HitVfxPointLightPool {
  constructor(scene, size, DynamicLighting already on renderer) {
    // 一次性 scene.add 全部 PointLight；intensity=0；visible=false
  }
  acquire(color, intensity, distance, decay, position): handle
  update(handle, { intensity, position })
  release(handle) // intensity=0；还池
}
```

- **禁止**在每次命中 `new PointLight` + `scene.add` 再 `remove`（§12.1）。  
- `distance/decay` 按 [PointLight 文档](https://threejs.org/docs/#api/en/lights/PointLight)。  
- 池大小 = `hitVfxSparkLightPoolSize`；若 `maxPointLights` 不够，**提高** `main.ts` 里 `DynamicLighting` 的 `maxPointLights` 为 `12 + hitVfxSparkLightPoolSize`（或把训练场点光与池统一计数后取上限），并在注释写明依据。

### S3 — Plume 编译器 + Runtime

**编译规则（必须写进 `HitVfxPlumeCompiler.ts` 注释）**

| 元素 | 编译为 |
|------|--------|
| spark | `SpawnBurst` + cone 速度 + additive sprite；颜色/尺寸 over life；**无**地面碰撞模块 |
| sparkDebris | 同上，count/gravity 用 debris 参数；可作为 spark 的 sub-emitter **仅当** plume API 支持且稳定；否则同组并行第二个 emitter（共识：同组同时开始） |
| dust | alpha sprite；较大 size；短 life |
| sweat | alpha；`gravity` 向下；collide 模块 **禁止注册** |
| sparkLight | 优先 Plume `LightEmission`；若当前 `0.1.1` 类型声明无该模块，则 **只**走 `HitVfxPointLightPool`（仍满足照角色）；`castOnVfxElements` 用 §5.3 |

**种子**

- `hitVfxSeedLocked===true`：用 `createMulberry32(hitVfxSeed)` 在 **compile/spawn 前** 把所有 `[min,max]` 抽成确定值写入该次实例（或写入 Plume 的 seed API——**若** `.d.ts` 暴露 `seed`/`setSeed`，必须调用，并在测试中断言同种子同结果）。  
- `false`：每次 trigger 用 `Date.now() ^ (perf&0xffffffff)` 混入种子再进 Mulberry32。  
- **禁止**粒子路径调用 `Math.random()`。

**Runtime.trigger**

输入：`{ recipeKind, strength, height, worldPos: Vector3, facing }`  
1. 选配方 id（onHit/onBlock）。  
2. 算最终世界坐标：`worldPos + heightOffset`（受击方朝向作用于 z 偏移）。  
3. 并发数 > max → dispose 最老实例。  
4. `manager.spawn(...)`；光池 acquire；记录实例 `{ deathTime, lightHandle, plumeIds }`。  

**Runtime.tick**

```
vfxDt = hitVfxPaused ? 0 : fixedOrRenderDt * hitVfxTimeScale
if (hitVfxFollowHitstop && match.hitstopTimer > 0) vfxDt = 0
if (hitVfxStepFrames > 0) { vfxDt = (1/60) * hitVfxTimeScale; CONFIG.hitVfxStepFrames-- }
manager.tick(vfxDt, camera)
更新光强度按剩余寿命插值；到期 release
```

逻辑帧率依据：`docs/decisions/ADR-001-logic-fps-60.md`（步进用 1/60）。

### S5.3 — 同组特效被照亮（强制）

若粒子材质为 unlit additive，点光不会改变其颜色。必须二选一（优先序）：

1. **Plume 支持 lit / LightEmission 读点光** → 开文档项，尘烟/汗使用可被点光影响的渲染模块。  
2. **否则**：在尘烟/汗的 `colorNode`/`opacityNode`（TSL）或等价 uniform 中，乘以 `HitVfxPointLightPool` 当前活跃光的近似贡献：  
   `atten = intensity / (1 + decay * dist^2)`（与 three 点光衰减同族；实现可用简化，但必须对 `receiveSparkLight===true` 的元素生效）。  
   依据：LinearAbility README 中 `fakeLightEffect` 思路；Mirza 粒子发光讨论。

角色被照：假人/隆使用 **Standard** 系材质（训练场角色已是可照明材质则无需改材质目标；预览假人必须 Standard）。

### S4 — Director + MatchSim 挂钩

在 `MatchSim` 格挡分支 `lastHitResult = 'block'` 之后，与未格挡 `lastHitResult = 'hit'` 之后，各调用一次：

```ts
this.opts.onHitVfx?.({
  kind: ok ? 'onBlock' : 'onHit',
  strength: resolveGuardStrength({ hitstopOnHit/Block, guardStrength: mv.guardStrength, ... }), // 与现有 select* 同一套
  height: hitToAnimHeight(...) 或 guard 路径等价高度,
  // 位置：受击方（p2）根位置 + 高度偏移；不要用框交点作唯一权威（共识）
  x: this.p2.x,
  facing: this.p2.facing,
});
```

`main.ts` 把回调接到 `HitVfxDirector`。  
**不要**改 hitstun/伤害数字。

Strength 映射：`resolveGuardStrength` 返回值归一到 `'L'|'M'|'H'`（与现有动画轻重一致；读 `HitPolicy.ts` / `GuardPolicy.ts` 现返回值）。

### S5 — 独立预览台

当 `hitVfxPreviewActive===true`：

1. 显示 `HitVfxPreviewDummy`（胶囊或盒，`MeshStandardMaterial`，放在场地中心附近）。  
2. 复用当前 `LightRig` / `CONFIG.lights`（共识：现有训练场光照）。  
3. 面板「重放」：用当前锁种/种子对 dummy 高度档 `trigger` 一次。  
4. 低速：`hitVfxTimeScale` 滑条 0.05–1。  
5. 逐帧：按钮写 `hitVfxStepFrames=1` 且可先 `hitVfxPaused=true`。  
6. 不要求播完整受击动画（共识：人物可简化，但必须有被照体）。

退出预览：隐藏假人；不对战逻辑改判定。

### S6 — ControlPanel「打击特效」必公开参数

**全局**

- `hitVfxEnabled`  
- `hitVfxPreviewActive`、`hitVfxPreviewDummyVisible`  
- `hitVfxTimeScale`（0.05–2，step 0.05）  
- `hitVfxPaused`、按钮「步进一帧」→ `hitVfxStepFrames++`  
- `hitVfxSeedLocked`、`hitVfxSeed`（整数）、按钮「重放」  
- `hitVfxFollowHitstop`  
- `hitVfxActiveRecipeOnHitId` / `OnBlockId`（下拉）  
- `hitVfxMaxConcurrent`、`hitVfxSparkLightPoolSize`（改池大小需重建 runtime，面板旁注）  
- `hitVfxDebug`  
- 高度偏移：`h/m/l` 的 y、z  
- 力度缩放表：L/M/H 的五个 mul  

**配方**

- 配方列表；新建/复制/删除；`kind`；改名  
- 保存：走现有 persist /「导出 shipping」路径，确保 `hitVfxRecipes` 进入 `shipping.json`（`persist.ts` 已有 download shipping 则扩展序列化字段）  

**组**

- 组列表（从 elements 的 `groupId` 聚合）；新建组 id；选组；整组 enabled；复制组内元素  

**元素（选中项）**

- type、name、enabled、groupId、startDelaySec、receiveSparkLight  
- **按 type 显示专属字段**（§3.2 全部 params 键必须可滑可改）  

依据：灯光方案面板列表+选中项模式；NewKrok 编辑器「选中改参」。

### S7 — 测试与验收脚本口径

Vitest（必须）：

1. Mulberry32 同种子序列稳定。  
2. `strengthScale` 后 count 为 `round(base*mul)` 且 ≥0。  
3. 光池 acquire 满后不再增长 `scene` 中 PointLight 数量。  
4. `normalize` 缺字段补齐；`collideGround` 强制 false。  
5. 配方 JSON 往返：serialize → mergeConfig → 元素数量不变。  

人工验收（共识 §5）：Dummy 不防挨打可见五类元素；格挡走 block 配方；锁种重放一致；改参可感；预览台不打开对打也能重放；shipping 重载仍在。

---

## 6. main.ts 每帧接入（必须）

在现有 render loop 中，于 `match` 步进之后：

```ts
const vfxDt = /* 按 §S3 tick 规则 */;
hitVfxRuntime.tick(vfxDt, camera);
```

预览模式下仍 tick。配置变更（配方编辑）→ `hitVfxRuntime.rebuildFromConfig(CONFIG)`（防抖 0ms 也可，但要避免每键击泄漏 GPU 资源：先 dispose 旧 register id）。

---

## 7. 资源与法务

- 粒子纹理：**优先无贴图** + `shapeCircle()` / soft 程序化（共识禁止逐帧精灵主路径）。  
- 若 alpha 烟需要软边贴图：只用 **自绘/程序生成的单通道柔边圆**（运行时 canvas 生成 `CanvasTexture`），禁止 SF6 解包。  
- License：保留 `three-plume` MIT 声明于依赖；Mulberry32 公有领域算法注释来源 URL。

---

## 8. 完成检查表（AI 声称完成前必须自勾）

- [ ] `three-plume@0.1.1` 已装且 import 通过  
- [ ] 五类元素均可加删编组调参  
- [ ] onHit / onBlock 两套配方可切换并触发  
- [ ] L/M/H 力度可感  
- [ ] h/m/l 位置可感  
- [ ] 锁种重放一致；解锁有差异  
- [ ] 假人/角色被火花点光照亮；`receiveSparkLight` 元素有可感变亮  
- [ ] `hitVfxFollowHitstop` true/false 行为可区分  
- [ ] 低速 + 步进可用  
- [ ] 配方进 shipping / 本地默认并可重载  
- [ ] 无碰地；无 Math.random；无解包特效；无第二粒子引擎  
- [ ] Vitest 新增用例通过；`npm test` 绿  

---

## 11. 退路（仅当 S0 失败）

### 退路 A — Plume 无法在本仓 WebGPU 跑通

**仍禁止**改用未列出引擎。改为：

1. **渲染**：`Sprite` + `PointsNodeMaterial` + `shapeCircle`（官方 webgpu_instance_points）。  
2. **模拟**：CPU SoA ring buffer（容量固定；参考 LinearAbility「ring buffer / CPU 只写 spawn」描述与 webgpu-vfx「fixed size particle pools」）。  
3. **光**：仍用 `HitVfxPointLightPool`。  
4. **种子**：仍 Mulberry32。  
5. 在 `HitVfxRuntime.ts` 顶部注释写明「退路 A 激活」及失败日志。  

参数字段与面板 **不得**因退路减少。

---

## 12. 坑与技术陷阱（检索补强，执行时必避）

### 12.1 WebGPU 动态增删灯卡死 / 不更新

| 来源 | 结论 | 本方案对策 |
|------|------|------------|
| [Discourse #74708](https://discourse.threejs.org/t/webgpu-lighting-issue-unable-to-dynamically-add-or-remove-lights/74708) | WebGPU 曾无法检测动态加删灯 | 使用已接入的 `DynamicLighting` |
| [GitHub #30044](https://github.com/mrdoob/three.js/issues/30044) | 加删灯场景图变了画面不变 | 同上 |
| [PR #33042 DynamicLighting](https://github.com/mrdoob/three.js/pull/33042) | 无 DynamicLighting 时改灯可导致全材质重编译卡数秒 | **预分配光池**，命中只改 intensity/position，避免频繁结构变化 |
| 本仓 `main.ts` | 已有「Second bind next frame」注释 | 新建池后可沿用双帧 bind 若 helper 需要 |

### 12.2 WebGPU 点大小

| 来源 | 结论 | 对策 |
|------|------|------|
| [PointsNodeMaterial 文档](https://threejs.org/docs/pages/PointsNodeMaterial.html) | WebGPU 点原语只有 1px；要大点用 Sprite + 该材质 | 禁止 `Points` 当火花主路径 |
| [webgpu_instance_points.html](https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_instance_points.html) | 官方宽点做法 | Plume sprite 或退路 A 跟此例 |

### 12.3 透明粒子遮挡 / 黑块

| 来源 | 结论 | 对策 |
|------|------|------|
| [Discourse 粒子互挡](https://discourse.threejs.org/t/particle-system-blocking-one-another/21773) | `depthWrite: false` + 保留 depthTest | 火花/烟/汗：`depthWrite=false`；additive 火花尤甚 |
| [Discourse 排气 glitch](https://discourse.threejs.org/t/transparency-glitching-and-depthwrite-and-depthtest-dont-seem-to-help/36384) | 世界不透明物保持 opaque | 假人/角色不要整身 transparent=true |
| quarks 文档 soft particles | 软粒子需深度纹理 | **本阶段可不做 soft particles**（共识未要求）；扬尘短促可接受硬边 |

### 12.4 种子与重放

| 来源 | 结论 | 对策 |
|------|------|------|
| Math.random 不可种子化 | 规范故意不固定 | 全路径 Mulberry32 |
| Feronato / Rune 文 | 循环内重复 `create(seed)` 会每次同值 | **一次 trigger 创建一个 rng**，连续抽参 |
| three-nebula 文档（对照） | 可重放 = 同种子 + 固定步数 | 预览步进用 1/60；realtime 用 `tick(vfxDt)` 时锁种只保证出生分布，要字节级重放需固定 dt（验收以「观感一致」+ 出生参数金样测试为准） |

### 12.5 并发与泄漏

| 风险 | 对策 |
|------|------|
| 连打 5LP 实例爆炸 | `hitVfxMaxConcurrent` 淘汰最老 |
| 改配方每键击 register 泄漏 | rebuild 前 `dispose`/`unregister` 旧系统；光池 release |
| WebGPU RenderObject 泄漏 | 不要每帧 new Material；池化；关注 [three#32409](https://github.com/mrdoob/three.js/issues/32409) 类问题 |

### 12.6 与 hitstop / 逻辑帧

| 风险 | 对策 |
|------|------|
| 误把特效挂在 `hitstopTimer` 冻结上且无法关闭 | 默认 `hitVfxFollowHitstop=false`；面板可开 |
| 预览用 RAF dt、对战用逻辑步 dt 导致两套手感 | Director/Runtime 统一用「秒」；对战可用 `1/60` × steps；预览用 RAF×timeScale |

### 12.7 maxPointLights 抢配额

训练场可编辑灯 + 打击光池共享 `DynamicLighting` 批次上限。执行时：**算清常驻点光数 + 池大小**，上调 `maxPointLights`，并在面板警告「池过大可能挤占场景灯」。

### 12.8 Plume 0.1.x API 漂移

| 风险 | 对策 |
|------|------|
| README 与 published 导出不一致 | S0 以 `.d.ts` 为准做 `plumeApi.ts` 适配层 |
| 无法跑通 | §11 退路 A，字段与验收不减 |

---

## 13. 参考链接速查

- 共识：`docs/hit-vfx-consensus-v0.md`  
- 调研：`docs/research/hit-vfx-research-2026-08-26.md`  
- [travisdmathis/plume](https://github.com/travisdmathis/plume)  
- [tigerabrodi/webgpu-vfx](https://github.com/tigerabrodi/webgpu-vfx)（仅默认数值参考）  
- [three.js DynamicLighting example](https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_lights_dynamic.html)  
- [PointsNodeMaterial](https://threejs.org/docs/pages/PointsNodeMaterial.html) · [webgpu_instance_points](https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_instance_points.html)  
- [mulberry32](https://github.com/cprosche/mulberry32)  
- [Discourse WebGPU lights](https://discourse.threejs.org/t/webgpu-lighting-issue-unable-to-dynamically-add-or-remove-lights/74708)  
- [Mirza 粒子光源](https://x.com/TheMirzaBeig/status/1863595078192713840)  
- 本仓：`MatchSim.ts`、`GuardPolicy.ts`、`HitPolicy.ts`、`ControlPanel.ts`、`store.ts`、`main.ts`

---

## 14. 修订纪律

- 本方案服从共识；若实现中需改目标，先改共识再改方案。  
- AI 不得用「临时占位火花」关闭验收项。  
- 调查文档案例不可直接当已选默认值以外的隐式需求。  

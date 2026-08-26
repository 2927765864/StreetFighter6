# AI 执行方案：打击烟尘改为涡环拟真（smokeRing）v0

> **状态**：可执行（2026-08-26）  
> **决策**：拟真优先 = **闭式无散度涡环速度场平流染料粒子**；禁止整格 Navier–Stokes；禁止 flipbook 主路径。  
> **上位**：`docs/hit-vfx-consensus-v0.md`（击中烟雾/扬尘仍必须存在，实现改为涡环）；`docs/plans/ai-execution-plan-hit-vfx-v0.md`（底座不得推翻）。  
> **本文件效力**：给 AI 一次做完；禁止「先锥形烟以后再升级」；禁止自写第二套粒子引擎。  
> **NotebookLM 审核（circle-smoke，2026-08-26）**：已吸收 MUST-FIX：禁止 Plume `.vortex`/`.curlNoise` 与 helix 势场叠力；粘度只走 `.drag`；烟默认重力 0。**未吸收**审核稿里的虚构符号（`KelvinSmokeRing`、`composePotentials`、`shape.kind:'direction'`、`texture3D`）——这些不是 helix-noise / three-plume / three TSL 的已核实导出；安装后仍以 README / `.d.ts` 为准。

---

## 0. 做成定义（不得改写）

1. 默认未格挡配方里的扬尘，观感必须是 **绕打击轴的短命烟环**（管状截面、切向滚动、外缘碎丝），寿命 **0.15–0.45s**，只靠寿命消失。  
2. 动力学必须是 **无散度场**：涡环主项 + curl 噪声次项；`gravityY` 默认 **0**。  
3. 运行时仍走现有 `HitVfxRuntime` + **`three-plume@0.1.1`** GPU 粒子；场用 **`helix-noise`**（仅速度，不另起粒子系统）。  
4. 编辑器（`/hit-vfx.html` 与主面板）必须能拧 §6 列出的全部参数，锁种子重放一致。  
5. 火花 / 火星 / 汗水 **不改语义**；火花仍可照烟（`receiveSparkLight`）。

### 0.1 硬禁止

| 禁止 | 依据 |
|------|------|
| 自写 WebGPU compute 全家桶或第二粒子引擎 | 打击特效方案 §0.2 |
| `THREE.Points` 当 WebGPU 主渲染 | [PointsNodeMaterial](https://threejs.org/docs/pages/PointsNodeMaterial.html)：WebGPU 点原语 **仅 1px**；论坛 [86188](https://discourse.threejs.org/t/no-matter-what-size-i-give-pointsmaterial-the-size-is-always-1-pixel/86188) |
| 命中时跑 Stam/Jacobi/MacCormack 格点流体 | GPU Gems 3 ch.30；短命击打来不及长涡 |
| `bake3D` 直接存速度再三线性采样当主速度 | helix-noise README：**直接烘焙速度会通过插值泄漏 O(voxel²) 散度**；必须 `bakePotential3D` + 有限差分 curl |
| EmberGen / 视频 / SF6 解包贴图作主路径 | 共识 §3.2 / §4 |
| 粒子碰地 | 共识 §3.3 |
| `Math.random` 作出生随机 | 已有 Mulberry32 |
| 每帧 `scene.add` 新点光 | DynamicLighting 池 |
| 烟 `depthWrite: true` | three.js 论坛 Don McCurdy：透明物应 `depthWrite=false` |

### 0.2 强制依赖（安装后以包内 `.d.ts` 为准改 import 名）

| 用途 | 包 / 文件 | 必须用的符号 |
|------|-----------|----------------|
| 粒子 | 已装 `three-plume@0.1.1` | `system`、`EmitterBuilder`：`.position({shape:{kind:'ring'}})`、`.drag`、`.gravity`、`.renderSprite({blending:'alpha', depthWrite:false})`、`.renderRibbon`、`.sortByDepth`。**烟禁止** `.vortex` / `.curlNoise`（力只来自 helix 势）。`CurlNoiseForce`/`VortexForce` 的 `contributeUpdateTSL` **只当自定义模块模板** |
| 涡环+无散度噪声场 | **新增** `npm i helix-noise`（[npm](https://www.npmjs.com/package/helix-noise) · [github.com/rifmj/helix-noise](https://github.com/rifmj/helix-noise)） | 安装后 **先读 README**：`create`、`compose`、涡环/Kelvin smoke ring API、`bakePotential3D`、`field.glsl` / `sampleUW`。**禁止**猜函数名。 |
| Bridson 公式对照 | [curl-noise PDF](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf)；Plume `CurlNoiseForce` 注释（`index.d.ts` L936–943）：`ψ` → `∇×ψ` |
| 切向速度 | Unity VFX Graph torus 教程：[Tangent = z × (P − C)](https://www.youtube.com/watch?v=QpLvBIFyhuE)；Plume `VortexForce`：`axis × (p − origin)`（`index.d.ts` L973–976） |
| 环形出生 | Plume `EmissionShape` `kind: "ring"`（半径 + 可选 thickness）同文件 L148–151 |
| 软圆剪影 | `import { shapeCircle } from 'three/tsl'` + sprite（已有打击方案） |
| RNG | `app/src/render/hitVfx/mulberry32.ts` |
| 渲染器 | 现有 `WebGPURenderer` |

**对照实现（抄公式/模块结构，不装第二运行时）**

| 用途 | 仓库 |
|------|------|
| curl 有限差分参考 | [kbladin/Curl_Noise](https://github.com/kbladin/Curl_Noise) `update_velocities_curl_noise.frag`；[IndieVisualLab/UnityGraphicsProgramming2](https://github.com/IndieVisualLab/UnityGraphicsProgramming2) ch.6 |
| 论文级烟 | Fedkiw [Visual Simulation of Smoke](https://graphics.stanford.edu/papers/smoke)（**只借鉴 vorticity 碎丝，不搬求解器**） |
| 插值散度泄漏 | [Curl-Flow 2104.00867](https://ar5iv.labs.arxiv.org/html/2104.00867) |

---

## 1. 物理与坐标（写死）

### 1.1 场

局部坐标：发射器原点 = 击中点；**局部 +Z = 打击轴**（世界：水平指向来拳，见 §4.3）。环在局部 XY 平面。

速度（概念，实现必须等价）：

\[
\mathbf{u} = \Gamma\,\mathbf{u}_{\text{ring}} + \varepsilon\,\nabla\times\psi_{\text{noise}}
\]

- \(\mathbf{u}_{\text{ring}}\)：helix-noise README 所列 **Kelvin 烟环**闭式结构（「Vortex rings / smoke ring flying at Kelvin's speed」）。函数名 **安装后从 README 抄入**，禁止使用未出现在该 README 的符号。  
- \(\psi_{\text{noise}}\)：同一 helix 场内 compose/叠加的无散度噪声（Bridson：速度必须是某势的 curl）。  
- \(\varepsilon\)：面板 `curlAmplitude`（或 README 里对应的噪声混合系数），只进入 **helix 合成**，**禁止**再挂 Plume `.curlNoise()`（审核：双噪声破坏无散度、粒子结团）。  
- **切向滚动只来自 helix 环势**，**禁止**再挂 Plume `.vortex()`（审核：全局公转会把空心环撕成球）。面板 `vortexStrength` **映射为 helix 环强度/环量参数**（README 中与 ring 相关的 amplitude/circulation 字段，安装后写死对应名）。  
- **粘度只走 Plume `.drag(drag)`**（README 烟示例 `drag(0.4)`）。禁止「若 helix 有 decay 则用 decay」分支。  
- **禁止** `TurbulenceForce`（`index.d.ts` L942：有散度会结团）。  
- **烟编译器里 `.gravity([0,0,0])` 写死**。面板 `gravityY` 仅当用户显式非 0 才覆盖（破坏轴对称，审核指出）；默认必须 0。

### 1.2 染料

- **主环**：burst 出生在 `kind:'ring'`，`radius = ringRadius`，`thickness = tubeRadius`（管截面）。  
- **初速**：仅 **沿局部 +Z 的轴向** `axialSpeed`（拳头带走空气）。实现：在 `HelixPotentialCurlForce.contributeUpdateTSL` 里 `velocity += localAxisZ * axialSpeed` 一次注入（与 CurlNoiseForce 同样改 `ctx` 速度）；**不要**用 Plume `kind:'cone'` 当烟初速。  
- **径向微扩**：优先由 Kelvin 环自诱导速度完成。若环不扩：`.pointAttractor({ position:[0,0,0], strength: -expandStrength, radius: ringRadius*3, falloff:'linear' })`（`PointAttractor` `index.d.ts` L1005，负 strength = 推开）。默认 `expandStrength` 保持 1.2，可在预览关掉对比。  
- **外丝**：第二 emitter，`ringRadius * 1.12`，同一 `HelixPotentialCurlForce`（可略增噪声混合），`.renderRibbon`（Plume README trail 的 `widthOverLife`）。**禁止**丝上再 `.curlNoise()`/`.vortex()`。  
- **禁止**主环 `kind:'cone'`（当前 `applyDust` 反例）。

### 1.3 寿命与混合

- 主环 life 默认 `[0.20, 0.32]`；丝 `[0.28, 0.42]`。  
- `renderSprite({ blending:'alpha', depthWrite: false })`。  
- 短命 alpha：**默认 `sortByDepth(false)`**（连击 fill-rate）；面板可开。依据：短命 VFX 可用 premultiplied/不管排序；长烟才 bitonic。  
- `alphaOverLife`: `[0,0.15],[0.12,1],[1,0]`（现 `applyDust` 已有类似，保留）。

---

## 2. 数据模型（必须按字段实现）

### 2.1 新类型 `smokeRing`

`hitVfxTypes.ts`：

```ts
export type HitVfxElementType =
  | 'spark' | 'sparkLight' | 'sparkDebris' | 'dust' | 'sweat' | 'smokeRing';

export type SmokeRingParams = {
  dyeCount: number;
  filamentCount: number;
  lifetimeSec: [number, number];
  filamentLifetimeSec: [number, number];
  ringRadius: number;
  tubeRadius: number;
  vortexStrength: number;
  expandStrength: number;
  axialSpeed: number;
  curlAmplitude: number;
  curlFrequency: number;
  curlSpeed: number;
  drag: number;
  gravityY: number;
  size: [number, number];
  filamentWidth: number;
  color: number;
  opacity: number;
  blend: 'alpha';
  sortByDepth: boolean;
  helixHelicity: number;
  helixCoherence: number;
  helixDecay: number;
  potentialGrid: 16 | 32 | 48;
};
```

`CREATABLE_ELEMENT_TYPES` 加入 `'smokeRing'`。`'dust'` **仍能加载**：`normalizeHitVfxElement` 若 `type==='dust'`，转为 `smokeRing` 并丢弃 `coneAngleRad`（见 §2.2）。

默认（未格挡主环，再 × strengthScale.countMul/sizeMul/lifetimeMul）：

| 字段 | 默认 | 依据 |
|------|------|------|
| dyeCount | 48 | Vince 24 卡偏少；拟真加染料但仍远低于 NS |
| filamentCount | 12 | 外丝可读、不打爆 fill |
| lifetimeSec | [0.20, 0.32] | 共识短促烟 |
| filamentLifetimeSec | [0.28, 0.42] | 略长于核 |
| ringRadius | 0.16 | 角色胸宽量级 |
| tubeRadius | 0.045 | 环管 |
| vortexStrength | 8 | Plume VortexForce 切向加速度 |
| expandStrength | 1.2 | 负吸引 = 微扩 |
| axialSpeed | 0.35 | 沿 +Z 初速（拳头带走空气） |
| curlAmplitude | 1.4 | 碎丝 |
| curlFrequency | 1.8 | |
| curlSpeed | 0.4 | |
| drag | 3.5 | 短命刹住 |
| gravityY | 0 | 空中环 |
| size | [0.10, 0.22] | 软粒子 |
| filamentWidth | 0.04 | ribbon |
| color | 0xc8c0b0 | 旧尘色 |
| opacity | 0.5 | |
| sortByDepth | false | |
| helixHelicity | 0.7 | helix-noise 默认量级 |
| helixCoherence | 0.45 | |
| helixDecay | 0.08 | 粘性 |
| potentialGrid | 32 | 势烘焙分辨率 |

力度：`dyeCount`/`filamentCount` 走 `countMul`；`size` 走 `sizeMul`；寿命走 `lifetimeMul`；`ringRadius` **额外** × `sizeMul`（重击环更大）。

### 2.2 dust 迁移

`normalizeHitVfxElement`：

- `type==='dust'` → 输出 `type:'smokeRing'`，id 保留。  
- `count` → `dyeCount`；`filamentCount=max(6, round(count*0.25))`。  
- `coneAngleRad` **忽略**。  
- 其余用 §2.1 默认填缺。  
- `hitVfxDefaults.ts` 默认配方 **不再含 dust**，改为一条 `smokeRing`。

### 2.3 轴向初速（唯一路径）

在 `HelixPotentialCurlForce` 内：`velocity += axisZ_local * axialSpeed`（局部 +Z，已随发射器旋转到打击轴）。**禁止**用 `.gravity` 冒充轴向运动（审核：重力在世界 Y，会扯破轴对称）。**禁止**再开 `axialAccel` 分支。

---

## 3. 模块与实现步骤（按序，禁止跳步）

### 步骤 A — 依赖

```bash
cd app && npm install helix-noise
```

打开 `node_modules/helix-noise/README.md`（或 package exports），把 **真实** API 抄进 `RingVortexField.ts` 文件头注释（create / compose / ring / bakePotential3D 的准确名字）。API 对不上禁止瞎编。

### 步骤 B — `RingVortexField.ts`

路径：`app/src/render/hitVfx/RingVortexField.ts`

职责：

1. `createPunchRingField(params, seed)`：用 helix-noise 组 **环 + 噪声**（README 的 compose(ring, noise) / 等价）。seed 来自 Mulberry32 的 `int`。  
2. **GPU 主路径（必须）**：`bakePotential3D(potentialGrid)` → `THREE.Data3DTexture`：  
   - `format = RGBAFormat`，`type = FloatType`  
   - **`minFilter = magFilter = LinearFilter`**（覆盖 Data3DTexture 默认 Nearest，文档 [Data3DTexture](https://threejs.org/docs/pages/Data3DTexture.html)）  
   - `wrapS/T/R = ClampToEdgeWrapping`  
   - `needsUpdate = true`  
3. 着色器里对势 **中心差分 curl** 得速度（helix-noise：「trilinear + FD-curl of A is discretely divergence-free」）。差分步长 = `1/potentialGrid`。对照 kbladin frag 的 `vel = nabla × potential`。  
4. 世界变换：击中点平移 + 四元数把局部 +Z 旋到打击轴；采样前把粒子世界坐标变到场的单位盒。盒边长默认 `2 * (ringRadius + 4*tubeRadius)`，超出 clamp。  
5. **禁止** `bake3D` 速度纹理作为主采样。

WebGPU Float 3D 纹理坑：若运行时报采样失败，对照 [three.js#26576](https://github.com/mrdoob/three.js/issues/26576)（WGSL `texture_2d<f32>` 与 Float DataTexture）。处理：**只通过 three TSL `texture(tex3d, uvw)`**，禁止手写错误 sampler 类型。

### 步骤 C — Plume 自定义力模块 `HelixPotentialCurlForce`

路径：`app/src/render/hitVfx/HelixPotentialCurlForce.ts`

- **照抄** `node_modules/three-plume/dist/index.js` 里 `CurlNoiseForce.contributeUpdateTSL` 的模块接口（`ParticleUpdateModule`、`kind:'particle_update'`）。  
- 在 TSL 中：粒子位置 → 场局部 uvw → sample 势纹理 → FD curl → `velocity += u * amplitude * dt`（dt 用更新上下文已有时间步，与 CurlNoiseForce 同样写法）。  
- **禁止** CPU 每粒子 `sampleUW` 作为主路径（Plume 是 GPU SoA）。  
- helix `field.glsl()` 仅当 bake 不可用时作备选，且必须与 README「与 sample() 机器精度一致」核对。

`EmitterBuilder` 无现成 hook 时：在 `HitVfxPlumeCompiler` 对 build 完的 `EmitterDef.update` 数组 **push** 该模块实例（读 `EmitterDef` 类型，禁止 any 乱塞）。

### 步骤 D — `HitVfxPlumeCompiler.ts`

- 删除烟的 `.position sphere` + `.velocity cone`。  
- 新 `applySmokeRing(...)`：  
  1. emitter `dye`：capacity `dyeCount*2`；`spawnBurst`；`position { kind:'ring', radius:ringRadius, thickness: tubeRadius }`；**禁止** `.vortex()` **禁止** `.curlNoise()`；`.drag(drag)`；`.gravity(p.gravityY === 0 ? [0,0,0] : [0,p.gravityY,0])`；**必须** push `HelixPotentialCurlForce`（环量=`vortexStrength`，噪声=`curlAmplitude`/`curlFrequency`/`helix*`，轴向=`axialSpeed`）；`renderSprite` alpha + depthWrite false；**不要** `kind:cone`。  
  2. emitter `filaments`：`filamentCount`；`radius: ringRadius*1.12`；同一 helix 力；`renderRibbon`（README trail：`faceCamera: true`，widthOverLife）。**禁止**丝上 vortex/curlNoise。  
- `sortByDepth(params.sortByDepth)`。  
- `system` duration ≥ max(life)+delay+0.05。  
- seed：`seed ^ 0x2222` 染料，`^ 0x4444` 丝（与现 dust xor 风格一致）。

### 步骤 E — 发射器朝向

`HitVfxRuntime.trigger`：`manager.spawn` **必须**同时给旋转。读 `Manager.spawn` 的 options 类型（`index.d.ts` Follow/position）。若支持 `rotation`/`quaternion`：

- 打击轴世界方向：`axis = new THREE.Vector3(-args.facing, 0, 0).normalize()`（拳从对手对面来；若预览台对环「翻了」只允许改这一行符号并写进注释）。  
- `quat.setFromUnitVectors(new THREE.Vector3(0,0,1), axis)`。  

若 spawn **只支持 position**：给 system 根设 `quaternion.copy(quat)`（spawn 返回的 System 对象，读其 Object3D）。**禁止**让环躺在世界 XY 而轴却是世界 Y。

`HitVfxTriggerArgs` 可增可选 `axis?: [number,number,number]`；默认如上。预览台重放必须传同一规则。

### 步骤 F — 编辑器 UI

`HitVfxEditorPanel.ts`：

- 下拉增加「涡环烟」`smokeRing`。  
- `smokeRingParamsHtml` 必须列出 **§6 每一项**（数字框，与现 `numRow`/`pairRow`/`colorRow` 同一套，禁止新 UI 框架）。  
- 去掉默认配方上的「锥角」。  
- `hitVfxRecipeOps.ts` 新建元素模板用 §2.1 默认。

`ControlPanel.ts` 若仍渲染 dust 字段，改为同一套或隐藏已迁移元素。

### 步骤 G — 默认配方

`hitVfxDefaults.ts`：`ungarded_default` 用 `smokeRing` 替换 dust；`block_default` 同结构，`dyeCount` 约 0.6 倍。

### 步骤 H — 测试（Vitest）

`app/tests/render/hitVfx/smokeRing.test.ts`：

1. `normalize`：旧 `{type:'dust', params:{count:10, coneAngleRad:1}}` → `type==='smokeRing'` 且 `dyeCount===10`。  
2. `compileRecipeToSystemDef`：JSON/`EmitterDef` 中 **不得出现** `kind:'cone'`（烟 emitter）；必须出现 `kind:'ring'`。  
3. 烟 emitter 的 update 模块 **不得含** `update.curl_noise_force`、`update.vortex_force`；**必须含** 自定义 helix 力的 `type` 字符串。  
4. 同种子两次 `compile` 的 emitter seed / count 一致。  
5. `RingVortexField`：对势纹理中心差分散度，随机 32 点平均 `|div|` 低于直接 bake 速度的 1/10（helix README baked-potential 声称 ≥100×；测试阈值放宽到 10× 以免 GPU 纹理量化，但必须势路径更低）。

### 步骤 I — 验收（人眼 + 预览台）

`/hit-vfx.html`：锁种子、0.25× 慢放、逐帧。

- 环面垂直打击轴，中空。  
- 外缘碎，不是实心球。  
- 0.45s 内消失。  
- 开火花点光，烟亮度有可感变化（`receiveSparkLight`）。  
- 连打 6 次不掉到明显卡顿（`hitVfxMaxConcurrent` 仍 6）。

---

## 4. 文件清单

| 路径 | 动作 |
|------|------|
| `app/package.json` | 加 `helix-noise` |
| `app/src/render/hitVfx/RingVortexField.ts` | **新建** |
| `app/src/render/hitVfx/HelixPotentialCurlForce.ts` | **新建** |
| `app/src/render/hitVfx/hitVfxTypes.ts` | 扩类型 + normalize 迁移 |
| `app/src/render/hitVfx/hitVfxDefaults.ts` | 默认配方 |
| `app/src/render/hitVfx/HitVfxPlumeCompiler.ts` | `applySmokeRing` |
| `app/src/render/hitVfx/HitVfxRuntime.ts` | spawn 朝向 |
| `app/src/hitVfxEditor/HitVfxEditorPanel.ts` | 面板 |
| `app/src/hitVfxEditor/hitVfxRecipeOps.ts` | 新建模板 |
| `app/src/debug/ControlPanel.ts` | 若仍暴露尘锥则改 |
| `app/tests/render/hitVfx/smokeRing.test.ts` | **新建** |
| `docs/hit-vfx-consensus-v0.md` | 扬尘一行改为「短命涡环烟，规则驱动」——**不改**元素种类义务 |

---

## 5. 编译器伪代码（符号以安装包为准）

```ts
e.capacity(Math.max(dyeCount * 2, 16))
 .duration(lifeMax + delay + 0.05)
 .seed(seed ^ 0x2222)
 .sortByDepth(p.sortByDepth)
 .spawnBurst({ time: delay, count: dyeCount })
 .lifetime(pairWithRng(p.lifetimeSec, rng, true))
 .position({ shape: { kind: 'ring', radius: p.ringRadius, thickness: p.tubeRadius } })
 .drag(p.drag)
 .gravity([0, p.gravityY, 0]) // 默认 gravityY===0
 .sizeOverLife([[0, 0.7], [0.35, 1.15], [1, 1.4]])
 .alphaOverLife([[0, 0.15], [0.12, 1], [1, 0]])
 .renderSprite({ blending: 'alpha', depthWrite: false, opacity: p.opacity });
// 然后把 HelixPotentialCurlForce 推进 update 列表
```

丝：`renderRibbon({ blending:'alpha', depthTest:true, faceCamera:true, ...})`，widthOverLife `[[0,filamentWidth],[1,0]]`。

---

## 6. 调试面板必须公开的参数

元素检视（`smokeRing`）**缺一不可**：

| UI 标签 | 字段 | 范围建议 |
|---------|------|----------|
| 染料数量 | dyeCount | 8–256 整数 |
| 细丝数量 | filamentCount | 0–64 整数 |
| 寿命 | lifetimeSec[2] | 0.05–1 |
| 细丝寿命 | filamentLifetimeSec[2] | 0.05–1 |
| 环半径 | ringRadius | 0.02–0.8 |
| 管半径 | tubeRadius | 0.005–0.3 |
| 切向涡强 | vortexStrength | 0–40 |
| 径向扩张 | expandStrength | 0–10 |
| 轴向速度/加速度 | axialSpeed 或 axialAccel | 0–5 |
| curl 振幅 | curlAmplitude | 0–8 |
| curl 频率 | curlFrequency | 0.1–8 |
| curl 时间速度 | curlSpeed | 0–3 |
| 阻力 | drag | 0–12 |
| 重力Y | gravityY | -4–4 |
| 尺寸 | size[2] | |
| 细丝宽度 | filamentWidth | 0–0.2 |
| 颜色 | color | hex |
| 不透明度 | opacity | 0–1 |
| 深度排序 | sortByDepth | bool |
| helix helicity | helixHelicity | 0–1 |
| helix coherence | helixCoherence | 0–1 |
| helix 粘性衰减 | helixDecay | 0–1 |
| 势网格 | potentialGrid | 16/32/48 下拉 |

只读：`blend = alpha`。  
配方级已有：种子锁、时间倍率、步进、力度档、高度档、并发上限——不重复造。

---

## 7. 坑与社区依据（执行时必须按此规避）

| 坑 | 表现 | 做法 | 依据 |
|----|------|------|------|
| WebGPU 点大小 | 烟变成 1px | 只用 Plume `renderSprite`，不用 `THREE.Points` | PointsNodeMaterial 文档；discourse 86188 |
| 透明排序 | 烟切角色/自交闪 | `depthWrite:false`；默认关 bitonic；角色不透明 | Don McCurdy [35820](https://discourse.threejs.org/t/how-are-transparent-meshes-in-a-gltf-file-treated/35820/4)；SO 79492721 |
| 锥形出生 | 不像环 | 禁止 cone；ring + 局部 Z 轴 | 本仓库现 `applyDust` 反例 |
| 世界轴没转 | 环平躺地面 | spawn 四元数 §3.E | Unity torus 教程局部轴 |
| bake 速度纹理 | 粒子结团 | 只 bake **势**再 curl | helix-noise README；Curl-Flow 论文 |
| Float DataTexture + 手写 WGSL | 采样全黑 | TSL `texture()` | three.js #26576 |
| Data3D 默认 Nearest | 块状场 | 显式 LinearFilter | three.js Data3DTexture 默认 Nearest |
| `TurbulenceForce` | 有散度结团 | 烟只用 curl / helix | Plume d.ts Curl vs Turbulence |
| 大 dt 穿固体 | GPU Gems 指出 advection 泄漏 | 本特效不碰地；limitVelocity 可选 | GPU Gems 3 ch.30 |
| 势盒太小 | 环粒子出盒速度变 0 | 盒边 ≥ 2(R+4a) | 几何 |
| helix API 名猜错 | 编译失败 | 安装后抄 README | 用户要求禁止发挥 |
| 双引擎 | 两套 tick | 禁止 webgpu-vfx 运行时 | 打击方案 §0.3 |
| 开 sort+高 count | 掉帧 | 默认 48 染料、sort 关 | 格斗 60fps |
| 自定义模块没进 JSON | 重载丢失 | 每次从配方 compile，不依赖 plume JSON 往返 | 现 Compiler |
| **双力（vortex+helix 环）** | 环被撕成球 | 烟 **禁止** `.vortex()` | NotebookLM 审核 |
| **双噪声（curlNoise+helix）** | 结团、散度 | 烟 **禁止** `.curlNoise()` | NotebookLM 审核 + Plume d.ts |
| **世界重力** | 环掉出轴 | 默认 gravityY=0 | NotebookLM 审核 |
| **势盒边缘** | 出盒粒子速度突然为 0 | 盒边 ≥ 2(R+4a)；出盒 clamp 速度衰减而非硬 0（乘边距 smoothstep） | GPU Gems 穿边界；审核 residual |
| **势网格量化** | 轻微源汇 | 默认 32；测试散度；不要指望机器精度无散度 | helix README；审核 residual |
| **连击 overdraw** | 多环 alpha 叠满屏 | `hitVfxMaxConcurrent=6` 已有；count 不擅自加到几百 | 审核 residual |
| **alpha 黑边** | 软边脏圈 | sprite 用 **直通 alpha**（非预乘）除非引擎默认预乘则按 Plume `renderSprite` 已有路径 | JangaFX Niagara 教程（笔记本内 EmberGen 片） |

---

## 8. 非目标

- 不实现 Lozar 单 mesh 假体积（可另开方案）。  
- 不实现 Vince 24 卡作为主染料（允许未来加一层噪声卡，本方案不做）。  
- 不改火花/汗水。  
- 不把 NS `webgpu_volume_fire.html` 接进命中。

---

## 9. 完成检查表（AI 打勾）

- [ ] `helix-noise` 已装，API 名来自 README 注释  
- [ ] `dust` 加载迁移到 `smokeRing`  
- [ ] 编译结果无烟 cone  
- [ ] ring 出生 + **仅** helix 势 curl 力（无 Plume vortex/curlNoise）  
- [ ] spawn 朝向打击轴  
- [ ] 面板 §6 全字段  
- [ ] sprite depthWrite false，未用 Points  
- [ ] 测试 §3.H 全绿  
- [ ] 预览台慢放可见中空环  

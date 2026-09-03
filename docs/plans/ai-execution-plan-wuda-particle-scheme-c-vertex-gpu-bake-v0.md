# AI 执行方案：武打粒子方案 C（顶点发射点 · GPU 烘焙）v0

> **状态**：可执行（2026-09-02） · **Live GPU + 全身多网格分批已落地**（显式 bone buffer TSL skin；`gpuWorldLooksDegenerate` 失败时 **C-DEGRADED** CPU fallback；默认附着仍为 B）  
> **相对旧版**：旧版 = 方案 B（三角面重心钉点 + CPU `applyBoneTransform`），见 `docs/plans/ai-execution-plan-wuda-particle-v0.md`  
> **本方案**：方案 C —— **顶点当发射点**；每帧把变形后的顶点世界坐标 **GPU 烘焙进缓冲**；粒子从缓冲采样；速度用双缓冲差分  
> **执行者**：AI 代理  
> **技术栈（仓库事实）**：`three@^0.185.1`、`WebGPURenderer`（`app/src/main.ts`）、现有 `app/src/render/wudaParticle/*`、`FighterView`、`MutableSimConfig`、`DebugGui` / `ControlPanel`、Vitest  

---

## 0. 执行者硬性规则（违反即停）

1. **禁止自我发挥架构**：不得用「只挂几根骨头」冒充 C；不得引入 Unity Niagara/VFX Graph 运行时；不得新装第二套粒子引擎替代粘着层。  
2. **C 与 B 必须可切换**：用配置字段切换；默认保持 B 行为，直到 C 验收通过再改默认（见 §7）。禁止直接删掉 B 代码路径。  
3. **定点语义固定为「顶点索引」**：每个粒子槽位存 `vertexIndex: number`（源网格 `position` 属性下标），**禁止**再存三角面 `{i0,i1,i2,u,v,w}` 作为 C 主路径。  
4. **GPU 烘焙公式必须对齐 three.js 蒙皮**：与 `SkinnedMesh.applyBoneTransform` / 官方 skinning 着色器同一套线性混合蒙皮（bindMatrix → boneMatrices 加权 → bindMatrixInverse → `matrixWorld`）。依据见 §1。  
5. **禁止全网格 GPU→CPU 回读**：只允许回读 **粒子数 N** 的紧凑缓冲（N≤`wudaParticleCount` 上限）。  
6. **主渲染仍用 `InstancedMesh`**（WebGPU 下 Points 点径限制，旧方案 TRAP-POINTS）。  
7. **`combat/` 禁止 `import 'three'`**；本系统只在 `app/src/render/` 与 `app/tests/render/`。  
8. **每步必须有验收**；缺依赖写 `BLOCKED:` 停工，不得编造 API。

---

## 1. 权威依据总表（每步只能引用这些）

### 1.1 项目内

| ID | 路径 | 用途 |
|----|------|------|
| **PLAN-B** | `docs/plans/ai-execution-plan-wuda-particle-v0.md` | 旧版 B：状态机、配置键、挂接时序、面板 |
| **APP-WUDA** | `app/src/render/wudaParticle/*` | 现有 B 实现（保留） |
| **APP-VIEW** | `app/src/render/FighterView.ts` | mixer 后、`root.updateMatrixWorld`、再 `updateWudaCoat` |
| **APP-MAIN** | `app/src/main.ts` | `WebGPURenderer`、`renderer.compute` 入口需传入 runtime |
| **APP-CONST** | `app/src/config/constants.ts` | 新字段 |
| **APP-GUI / APP-PANEL** | `app/src/debug/DebugGui.ts` · `ControlPanel.ts` | 面板 |
| **PKG-THREE** | `app/package.json` → three r185 | API 版本 |

### 1.2 开源 / 文档（C 算法与实现语义）

| ID | 来源 | 本方案采用的语义 |
|----|------|------------------|
| **REF-SKINNER** | [keijiro/Skinner](https://github.com/keijiro/Skinner) | `SkinnerSource`：replacement 烤顶点位置/法线到纹理；**双缓冲** `positionBuffer` / `previousPositionBuffer`；`SkinnerParticle`：从顶点发射，速度驱动寿命/脱落（CutoffSpeed） |
| **REF-SMRVFX** | [keijiro/Smrvfx](https://github.com/keijiro/Smrvfx) · [NoiseCrimeForks/Keijiro-Smrvfx](https://github.com/NoiseCrimeForks/Keijiro-Smrvfx) | 蒙皮网格 → 位置贴图喂特效；fork 用**前帧位置贴图**算 velocity，避免每帧上传旧位置 |
| **REF-DISCOURSE-RTT** | [Discourse #34210](https://discourse.threejs.org/t/skinned-mesh-related-bone-bind-matrices-update-timing/34210) | Three.js 上「自定义蒙皮着色器写入 RTT，粒子跟纹理」；**一帧延迟**因 boneTexture 上传时机；修复：在源 `SkinnedMesh.onBeforeRender` 同步骨骼数据，或保证 `skeleton.update()` 后再 bake |
| **REF-DON-GPU** | [Discourse #28780 donmccurdy](https://discourse.threejs.org/t/reuse-model-animation-with-samples-of-its-geometry/28780/4) | 大量点不宜 CPU `boneTransform`；GPU 路径：粒子绑定同一骨架 / 或插值 skinIndex+skinWeight |
| **API-SKIN** | [SkinnedMesh.applyBoneTransform](https://threejs.org/docs/pages/SkinnedMesh.html) · [源码 r185](https://github.com/mrdoob/three.js/blob/r185/src/objects/SkinnedMesh.js) | CPU 参考实现与单测金标准 |
| **API-SKELETON** | [Skeleton.boneTexture / boneMatrices](https://threejs.org/docs/pages/Skeleton.html) | GPU 蒙皮骨矩阵来源；`skeleton.update()` 后有效 |
| **API-WG-COMPUTE** | [three.js `examples/webgpu_compute_particles.html`](https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_compute_particles.html) · TSL `instancedArray` / `compute` / `positionNode` | WebGPU 下缓冲粒子写法 |
| **API-WG-RT** | [WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html) · `RenderTarget` · `renderer.compute` | 本仓渲染器 |
| **REF-ATB** | [sugi-cho/Animation-Texture-Baker](https://github.com/sugi-cho/Animation-Texture-Baker) | 顶点位置写入 float 贴图的精度习惯（ARGBFloat / Half） |
| **REF-VEL** | Smrvfx Sample Skinned Mesh Velocity 语义 | `v = (pos_now - pos_prev) / dt` |

### 1.3 陷阱来源（必须写入实现）

| ID | 来源 | 强制对策 |
|----|------|----------|
| **TRAP-LAG** | Discourse #34210；本仓 PLAN-B | bake 必须在 `mixer` + `root.updateMatrixWorld(true)` + `mesh.skeleton.update()` **之后**；与 `FighterView.updateWudaCoat` 现有顺序一致 |
| **TRAP-L2W** | Discourse localToWorld+skeleton | 禁止裸 `localToWorld`；世界坐标 = 蒙皮局部 × `mesh.matrixWorld` |
| **TRAP-BONE-TEX-DISPOSE** | [Discourse #19907](https://discourse.threejs.org/t/skinnedmesh-texture-leak/19907) | dispose 时 `skeleton.dispose()` 不误伤**共享**角色骨架；代理网格销毁不得 `dispose` 角色的 skeleton |
| **TRAP-READBACK-GC** | [three.js #33281](https://github.com/mrdoob/three.js/issues/33281) · [#31658](https://github.com/mrdoob/three.js/issues/31658) | 禁止每帧 `new` ArrayBuffer；复用固定 `Float32Array`；优先 `getArrayBufferAsync(attr, targetBuffer)`（r185+ 若签名可用）；避免依赖不稳定的 `readRenderTargetPixelsAsync` 作为主路径 |
| **TRAP-ASYNC-FRAME** | WebGPU 回读异步 | 若用 async readback：脱落判定允许 **晚 1 帧**；或同帧内 `await` bake+readback（增加帧耗时，需面板开关） |
| **TRAP-POINTS** | PLAN-B | 主路径 InstancedMesh |
| **TRAP-VERT-DENSITY** | Niagara/社区顶点采样不均 | C 按顶点索引取样 → 脸/手拓扑密处粒子更密；用 `wudaVertexStride` / 上限缓解，并在面板注明 |
| **TRAP-DT / TRAP-V0** | PLAN-B | `clampWudaDeltaSec`；`prevValid==false` 时速度清零不脱落 |
| **TRAP-SHARED-SKELETON** | three SkinnedMesh.bind | 代理网格若共享骨架，**禁止**对其 skeleton 调用 dispose |

---

## 2. 目标架构（相对 B 的差异 · 固定）

### 2.1 对比

| 项 | 方案 B（旧） | 方案 C（本方案） |
|----|--------------|------------------|
| 定点 | 三角面 + 重心 `{i0,i1,i2,u,v,w}` | **顶点下标** `vertexIndex` |
| 每帧位置 | CPU 对三角三点 `applyBoneTransform` 再插值 | **GPU compute** 对 N 个顶点做蒙皮，写入 StorageBuffer |
| 速度 | CPU `prevPos` | **双缓冲** curr/prev（对齐 Skinner / NoiseCrime） |
| 发射语义 | 表面积均匀采样 | **从顶点冒出**（可 stride 抽稀） |
| 渲染 | InstancedMesh | 同左（位置来自 bake 结果） |

### 2.2 数据流（固定）

```
bind:
  从源 SkinnedMesh.geometry 抽取 N 个 vertexIndex（seed + stride）
  拷贝 bind 位姿 position[i] + skinIndex[i] + skinWeight[i] → 紧凑属性
  分配 StorageBuffer：currPos[N], prevPos[N]（vec3 或 vec4）

每帧（FighterView 已 skeleton.update + updateMatrixWorld）:
  1) GPU compute BakeSkinnedVerts:
        读 boneMatrices（skeleton.boneTexture 或 boneMatrices）
        读 bindMatrix / bindMatrixInverse / matrixWorld
        对 instanceIndex in [0,N):
          p = skin(bindPos, skinIndex, skinWeight)  // 同 applyBoneTransform
          p = matrixWorld * p
          currPos[i] = p
  2) 若帧计数 < 2: prev=curr, prevValid=false（Skinner isReady 语义）
  3) CPU（或同帧 await readback N*3）:
        对 stuck: pos=curr[i]; vel=(curr-prev)/dt; 脱落判定复用 wudaCoatMath
        对 free: 既有积分
  4) swap 或 copy curr → prev（NoiseCrime：用上一帧纹理算速度）
  5) write InstancedMesh matrices
```

### 2.3 模块落点（强制路径名）

| 模块 | 路径 | 说明 |
|------|------|------|
| 顶点索引烘焙表 | `app/src/render/wudaParticle/WudaVertexIndexBake.ts` | 取代 C 路径下对 `WudaSurfaceBake` 的依赖 |
| GPU 蒙皮烤缓冲 | `app/src/render/wudaParticle/WudaVertexGpuBaker.ts` | TSL compute + StorageBuffer |
| C 运行时 | `app/src/render/wudaParticle/WudaVertexCoatRuntime.ts` | 或扩展 `WudaCoatRuntime` 内 `mode==='vertexGpuBake'` 分支；**推荐独立类**降低回归面 |
| 数学复用 | `wudaCoatMath.ts` | 脱落/积分/dt **禁止重写公式** |
| 挂接 | `FighterView.ts` | 按 cfg 选 B 或 C runtime；传入 `renderer` 引用供 `compute` |
| 测试 | `app/tests/render/wudaVertexGpuBake.test.ts` | |

---

## 3. 分步执行（AI 按序）

### Step 0 — 前置核对（只读）

**依据**：PKG-THREE、APP-MAIN。  

**做**：确认 `three` 为 r185+；`main.ts` 使用 `WebGPURenderer`；记录 `renderer.compute` / `StorageBufferAttribute` / `instancedArray` 在本版本的实际 import 路径（`three/tsl` 或 `three/webgpu`）。  

**验收**：在注释或本方案附录写明实际 import 语句；若 API 缺失 → `BLOCKED: three API`。

---

### Step 1 — 配置字段（C 增量 + 模式开关）

**依据**：PLAN-B §7；REF-SKINNER Cutoff 语义保留。  

**做**：在 `MutableSimConfig` / `createDefaultSimConfig` / `mergeConfig` / persist 增加：

| 字段 | 类型 | 默认 | 含义 |
|------|------|------|------|
| `wudaAttachMode` | `'surfaceBary' \| 'vertexGpuBake'` | `'surfaceBary'` | B / C 切换 |
| `wudaVertexStride` | number | `1` | 源顶点遍历步长；`>1` 抽稀（缓解 TRAP-VERT-DENSITY） |
| `wudaBakeAwaitReadback` | boolean | `true` | `true`=同帧 await 回读（无脱落延迟）；`false`=异步晚 1 帧（TRAP-ASYNC-FRAME） |
| `wudaShowBakeStats` | boolean | `false` | 面板/日志打印 N、tex/buffer 尺寸、bake ms |

**保留** PLAN-B 全部既有 `wuda*` 脱落/外观字段；C 路径继续读取它们。  

**验收**：Vitest 默认对象含新键；`wudaAttachMode` 非法值 merge 时回退 `'surfaceBary'`。

---

### Step 2 — `WudaVertexIndexBake.ts`（定点表）

**依据**：REF-SKINNER Skinner Model（只保留顶点与蒙皮权重）；TRAP-VERT-DENSITY。  

**做**：

```ts
// 伪接口（实现必须匹配）
export type WudaVertexSample = { vertexIndex: number };

export function bakeWudaVertexSamples(
  geometry: THREE.BufferGeometry,
  count: number,
  seed: number,
  stride: number,
): { samples: WudaVertexSample[]; sourceVertexCount: number };
```

规则（禁止改）：

1. 需要 `position`、`skinIndex`、`skinWeight`；缺一 → 返回空并 `console.warn`。  
2. 有效下标序列：`i = 0, stride, 2*stride, ...` 直到顶点耗尽；若不足 `count`，用 `mulberry32(seed)` 在 `[0, vertexCount)` 无放回或有放回补齐（实现选**有放回**并单测稳定）。  
3. **同一 seed+stride+count+geometry.uuid → 同一序列**（对齐 B 的种子稳定）。  

**验收**：单测固定 geometry 下种子稳定；`stride=2` 时索引均为偶数（在 vertexCount 允许时）。

---

### Step 3 — `WudaVertexGpuBaker.ts`（GPU 烘焙核心）

**依据**：API-SKIN 公式；API-WG-COMPUTE；REF-SKINNER 双缓冲；REF-SMRVFX velocity map；TRAP-READBACK-GC。  

**做**：

1. **输入**：源 `SkinnedMesh`、`samples: WudaVertexSample[]`、`WebGPURenderer`。  
2. **紧凑属性**（长度 N）：从源 geometry 拷贝每个 `vertexIndex` 的 `position`（vec3）、`skinIndex`（vec4）、`skinWeight`（vec4）。  
3. **StorageBuffer**：`currPos`、`prevPos`（推荐 `THREE.StorageInstancedBufferAttribute` / TSL `instancedArray(N,'vec3')` —— **以 Step 0 核实的 r185 API 为准**）。  
4. **Compute kernel `BakeSkinnedVerts`**（TSL `Fn` + `.compute(N)`）：  
   - Uniforms：`bindMatrix`、`bindMatrixInverse`、`matrixWorld`（来自源 mesh）、骨矩阵纹理或 `skeleton.boneMatrices` 等价物（与 three 内部 skinning 一致）。  
   - 对每个 `instanceIndex`：实现与 `applyBoneTransform` 相同的 4 骨加权（见 SkinnedMesh.js 源码循环）。  
   - 输出世界坐标到 `currPos`。  
5. **双缓冲**：bake 结束后，若 `frameIndex>=1`，速度用 `curr-prev`；然后 `prev ← curr`（可用第二 compute Copy 或 CPU 在回读后拷贝；**禁止**每帧 `new Float32Array`）。  
6. **`bake(renderer)`**：`await renderer.computeAsync?.(node)` 或项目内既有 sync `compute` 用法（与 main 其它 compute 一致）。  
7. **`readPositions(out: Float32Array)`**：长度 `N*3`；复用调用方缓冲；内部 `getArrayBufferAsync` + 拷贝。  

**金标准校验（强制）**：对 N≤32 的子集，同帧 CPU `applyBoneTransform` + `matrixWorld` 与 GPU 结果误差 `< 1e-3`（相对角色尺度；单测或 debug 断言）。  

**验收**：启用 C 后统计 `bake` 不抛错；金标准子集通过。

---

### Step 4 — `WudaVertexCoatRuntime.ts`（状态机 + 渲染）

**依据**：PLAN-B 状态机；REF-VEL；REF-SKINNER Cutoff；TRAP-V0 / TRAP-DT。  

**做**：

1. API 对齐 B 的 `WudaCoatRuntime`：`bind` / `update(dt,cfg,{allowDetach})` / `setDisplayPass` / `setCamera` / `setPlumeBurst` / `dispose` / `getLastStats`。  
2. `bind(mesh,{parent,camera,renderer})`：**必须**收 `renderer: WebGPURenderer`。  
3. `ensureBake`：按 `count|seed|stride|mesh.uuid` 重建顶点表 + GpuBaker + InstancedMesh。  
4. `update`：  
   - `clampWudaDeltaSec`（复用）。  
   - `baker.bake(renderer)`。  
   - 若 `wudaBakeAwaitReadback`：await `readPositions`；否则使用上一帧回读结果（文档化 1 帧延迟）。  
   - stuck：写 `pos`；算 vel/accel；`shouldDetachWithLock`（复用）；脱落继承速度等与 B **同一函数**。  
   - free：`integrateFreeParticle`（复用）。  
   - `writeInstance` 逻辑可复制 B（朝向相机四元数、调试色）。  
5. **前 2 帧**：`prevValid=false`，不脱落（Skinner `isReady` 对偶）。  

**验收**：Vitest 对 math 仍绿；C 路径集成测试可用假 baker（注入 CPU 金标准位置）测脱落。

---

### Step 5 — FighterView / main 挂接

**依据**：TRAP-LAG；APP-VIEW 现序；PLAN-B Step 7。  

**做**：

1. `FighterView` 持有 `wudaCoatB` 与 `wudaCoatC` **或**单一入口按 mode 构造。推荐：`wudaCoat: WudaCoatRuntime | WudaVertexCoatRuntime | null`。  
2. 模型绑定：`findLargestSkinnedMesh` 不变。  
3. `updateWudaCoat`：  
   - `surfaceBary` → 现有 B runtime（行为回归）。  
   - `vertexGpuBake` → C runtime；调用前仍 `root.updateMatrixWorld(true)`。  
4. `main.ts`：在创建 `FighterView` 后注入 `renderer` 到 C（例如 `view.setWudaRenderer(renderer)`）。  
5. hitstop：**不得**跳过 C update（与 B 相同）。  

**验收**：mode=B 时与改前手感一致；mode=C 时粒子钉在**顶点**（调试色下可见随拓扑疏密变化）。

---

### Step 6 — 调试面板（必须公开）

**依据**：PLAN-B Step 8；本方案 §1 陷阱需可观测。  

在 `DebugGui.ts` 与 `ControlPanel.ts` **同步**增加/扩展「武打粒子」：

#### 6.1 模式与烘焙（C 新增 · 必做）

| 面板显示名 | cfg 字段 | 范围 |
|------------|----------|------|
| 附着模式 | `wudaAttachMode` | `surfaceBary` / `vertexGpuBake` |
| 顶点步长 | `wudaVertexStride` | 1–32，步进 1 |
| 同帧等待回读 | `wudaBakeAwaitReadback` | bool |
| 显示烘焙统计 | `wudaShowBakeStats` | bool |

#### 6.2 既有脱落/外观（B/C 共用 · 必须仍暴露）

沿用 PLAN-B 表：启用、仅攻击帧脱落、粒子数、种子、脱落速度/加速度/急停、继承速度、抖动、寿命、重力、阻力、速度上限、dt 上限、尺寸、不透明度、颜色、加色、死后回粘、调试色、plume。  

#### 6.3 运行时只读统计（`wudaShowBakeStats` 或 `wudaShowDebug` 时）

在 GUI 文本或 `console.info` 节流输出：`attachMode`、`N`、`sourceVertexCount`、`stride`、`lastBakeMs`、`stuck/free/dead`。  

**验收**：切换 `wudaAttachMode` 无需重载页即可重建；改 `wudaVertexStride` 触发 rebuild。

---

### Step 7 — 测试

**自动化**：

1. `bakeWudaVertexSamples` 种子稳定 + stride。  
2. 蒙皮金标准：静态双骨夹具（手写 BufferGeometry + Skeleton）上 CPU vs（可 mock 的）bake 公式一致。  
3. 配置键存在。  
4. 脱落数学仍用现有 `wudaCoat.test.ts`（不改公式）。  

**手工（训练场）**：

1. mode=B：回归「涂层」观感。  
2. mode=C：静止姿态粒子贴顶点；出拳时高速区更易脱落。  
3. `wudaBakeAwaitReadback=false`：可见约 1 帧延迟但仍稳定。  
4. 切换角色/重载模型无骨纹理泄漏（TRAP-BONE-TEX-DISPOSE）。  

---

## 4. 禁止事项与降级政策

| 情况 | 政策 |
|------|------|
| TSL compute 无法读取 `boneTexture` | `BLOCKED`：对照 three r185 skinning node 源码补 uniforms；不得改回全 CPU 却宣称 C 完成 |
| 仅实现「顶点索引 + CPU applyBoneTransform」无 GPU buffer | 标记为 **C-DEGRADED**，不得关闭 B，不得改 `wudaAttachMode` 默认；须在 PR 说明未完成 Step 3 |
| 用 `readRenderTargetPixelsAsync` 读全屏 RT | 禁止作主路径（#31658） |
| 对代理网格 `skeleton.dispose()` | 禁止（共享骨架） |

---

## 5. 参考实现阅读清单（执行前必读对应文件）

1. `keijiro/Skinner`：`SkinnerSource` 双缓冲与 velocity；`SkinnerParticle` CutoffSpeed  
2. `NoiseCrimeForks/Keijiro-Smrvfx`：`SkinnedMeshBaker` 用前帧位置算速度  
3. three.js `SkinnedMesh.js` `applyBoneTransform`（金标准）  
4. Discourse #34210（时序）  
5. `examples/webgpu_compute_particles.html`（缓冲 + compute + 绘制）  
6. 本仓 `WudaCoatRuntime.ts` / `wudaCoatMath.ts` / `FighterView.updateWudaCoat`（挂接与状态机）  

---

## 6. 完成定义（Definition of Done）

1. `wudaAttachMode==='surfaceBary'` 行为与改前 B 一致（回归）。  
2. `wudaAttachMode==='vertexGpuBake'` 时：粒子槽位为顶点索引；每帧存在 GPU compute bake；位置与 CPU 金标准子集误差达标。  
3. 脱落/自由飞行仍走 `wudaCoatMath`；面板 §6 全部可调。  
4. 文档：本文件 + 在 `docs/plans/ai-execution-plan-wuda-particle-v0.md` 顶部加一行指向本方案（C）。  
5. 无新增粒子引擎依赖；无误 dispose 共享 skeleton。  

---

## 7. 附录：与 Unity Skinner 组件映射（防止执行跑偏）

| Skinner / Smrvfx | 本仓 C |
|------------------|--------|
| Skinner Model（顶点+权重） | `WudaVertexIndexBake` 紧凑属性 |
| SkinnerSource 烤位置纹理 | `WudaVertexGpuBaker` StorageBuffer |
| previousPositionBuffer | `prevPos` 缓冲 |
| velocity = Δpos/dt | `computeSurfaceVelocity` / 等价 |
| SkinnerParticle CutoffSpeed | `wudaDetachSpeed` 等既有阈值 |
| VFX Set Position from Map | InstancedMesh 写入（WebGPU 友好替代） |

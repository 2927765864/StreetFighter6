# AI 执行方案：武打粒子（方案 B · 薄涂层 + 速度脱落）v0

> **状态**：可执行（2026-09-01）  
> **方案 C（顶点 GPU 烘焙）**：见 `docs/plans/ai-execution-plan-wuda-particle-scheme-c-vertex-gpu-bake-v0.md`（与本 B 方案可切换，禁止未验收就删 B）  
> **上位共识**：`docs/wuda-particle-consensus-v0.md`（🔒 已锁定；本方案不得缩水）  
> **元共识**：`docs/consensus-v0.md` §0  
> **调查（非权威）**：`docs/research/wuda-particle-research-2026-09-01.md`  
> **执行者**：AI 代理  
> **技术栈（以仓库为准）**：`three@^0.185.1`、`WebGPURenderer`（`app/src/main.ts`）、`FighterView`、`MutableSimConfig` / `constants.ts` / `store.ts` / `persist.ts`、`DebugGui.ts` / `ControlPanel.ts`、Vitest  
> **本方案补充检索**：Three.js 蒙皮采样时序、Overwrite Intrinsic、MeshSurfaceSampler、Skinner CutoffSpeed、WebGPU Points 限制、hitstop 墙钟（见 §1 / §12）

---

## 0. 执行者硬性规则（违反即停）

1. **禁止自我发挥架构**：不得改用「只挂拳脚骨骼的方案 A」冒充完成；不得引入 Unity Niagara/VFX Graph 运行时；不得新装第二套粒子引擎替代粘着层（`@newkrok/three-particles` / `three-nebula` 等禁止作为粘着主路径）。  
2. **粘着层算法权威固定**：表面采样用 **three 自带 `MeshSurfaceSampler`**；跟踪变形用 **三角索引 + 重心坐标**（参照 PaulDemeulenaere / Unity 均匀蒙皮采样）；世界位置用 **`SkinnedMesh.applyBoneTransform` + `matrixWorld`**（禁止只用 `localToWorld`）。  
3. **速度权威固定**：`v = (pos_now - pos_prev) / dt`，与 Smrvfx / Unity Sample Skinned Mesh Velocity 同一定义；第一有效帧 `v=0`。  
4. **脱落状态机权威固定**：粘着态每帧覆盖位置（类比 Niagara Overwrite=true）；脱落态不再覆盖位置，只做欧拉积分（类比 Overwrite=false + Add Velocity/Gravity）。阈值语义对齐 Skinner `CutoffSpeed` / 速度驱动发射。  
5. **自由飞行渲染**：粘着与自由粒子主渲染用 **`THREE.InstancedMesh`**（小四边形或小 icosa），**禁止**以 WebGPU 下 `THREE.Points` 期望大点径作主路径（见打击特效方案已确认的 WebGPU 点原语限制）。可选：脱落瞬间向已有 `three-plume` **额外** burst 注入初速作「飞溅增强」，但 **不得**用 plume 替代粘着跟踪。  
6. **`combat/` 禁止 `import 'three'`**；本系统只允许在 `app/src/render/`（及 `tests/render/`）。  
7. **验收角色**：逻辑通用；默认绑定隆当前 `FighterView` 主 `SkinnedMesh`。  
8. **配置字段名以本方案 §7 为准**；必须进 `DebugGui` + `ControlPanel` + `mergeConfig` 可持久化。  
9. **每步必须有验收**；缺依赖写 `BLOCKED:` 停工。

---

## 1. 权威依据总表（每步只能引用这些）

### 1.1 项目内

| ID | 路径 | 用途 |
|----|------|------|
| **C-WP** | `docs/wuda-particle-consensus-v0.md` | 需求边界 |
| **R-WP** | `docs/research/wuda-particle-research-2026-09-01.md` | 链接与陷阱背景 |
| **APP-VIEW** | `app/src/render/FighterView.ts` | 蒙皮模型、`syncFromLogic(..., wallDtSec)`、动画后挂接点 |
| **APP-MAIN** | `app/src/main.ts` | rAF、`wallDt`、WebGPURenderer |
| **APP-CONST** | `app/src/config/constants.ts` | `MutableSimConfig` 新字段 |
| **APP-STORE** | `app/src/config/store.ts` | `mergeConfig` |
| **APP-PERSIST** | `app/src/config/persist.ts` | shipping / local |
| **APP-GUI** | `app/src/debug/DebugGui.ts` | lil-gui 文件夹（对齐头巾/裤子风格） |
| **APP-PANEL** | `app/src/debug/ControlPanel.ts` | 主面板同步 |
| **APP-HITVFX** | `app/src/render/hitVfx/*` | 职责隔离；可选 plume burst 仅作增强 |
| **PKG-THREE** | `app/package.json` → `three` | r185 API |

### 1.2 开源 / 文档（算法与 API）

| ID | 来源 | 本方案采用的语义 |
|----|------|------------------|
| **API-MSS** | [MeshSurfaceSampler 文档](https://threejs.org/docs/pages/MeshSurfaceSampler.html) · 源码 [`examples/jsm/math/MeshSurfaceSampler.js` @ r185](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/math/MeshSurfaceSampler.js) | `new MeshSurfaceSampler(mesh).build()`；面积加权；`sample(pos, normal)` |
| **API-SKIN** | [SkinnedMesh.applyBoneTransform](https://threejs.org/docs/pages/SkinnedMesh.html) · [源码](https://github.com/mrdoob/three.js/blob/r185/src/objects/SkinnedMesh.js) | 顶点索引 → 蒙皮后局部坐标 |
| **REF-BARY** | [PaulDemeulenaere/vfx-uniform-mesh-sampling](https://github.com/PaulDemeulenaere/vfx-uniform-mesh-sampling) · [Unity 帖](https://discussions.unity.com/t/uniform-distribution-with-skinned-mesh-sampling/859989) | 存 `triangleIndex + barycentric`，每帧用变形后三角顶点插值位置 |
| **REF-VEL** | [Smrvfx](https://github.com/keijiro/Smrvfx) · [Sample Skinned Mesh Velocity](https://docs.unity3d.com/Packages/com.unity.visualeffectgraph@17.0/manual/Operator-SampleSkinnedMesh.html) · [NoiseCrimeForks VelocityMap](https://github.com/NoiseCrimeForks/Keijiro-Smrvfx) | `velocity = (currentPos - previousPos) / deltaTime` |
| **REF-STICK** | [Niagara Overwrite Intrinsic 回复](https://forums.unrealengine.com/t/niagara-skeletal-mesh-how-to-add-forces-or-velocity/486439) | 粘着=每帧覆盖位置；自由=不覆盖 + 力积分 |
| **REF-THRESH** | [keijiro/Skinner](https://github.com/keijiro/Skinner) README + Particle：`CutoffSpeed`、`speedToLife`、`drag`、`gravity`、`speedLimit` | 阈值与自由态力参数命名/语义 |
| **REF-HITSTOP** | 本仓头巾方案 `docs/plans/ai-execution-plan-headband-physics-v0.md` §0.6 / SPEC | 墙钟 dt；hitstop 不跳过已飞粒子 |

### 1.3 陷阱来源

| ID | 来源 | 结论（必须实现） |
|----|------|------------------|
| **TRAP-LAG** | [Discourse 34210](https://discourse.threejs.org/t/skinned-mesh-related-bone-bind-matrices-update-timing/34210) | 涂层 `update` 必须在 mixer + `skeleton.update()` 之后 |
| **TRAP-L2W** | [Discourse 24925](https://discourse.threejs.org/t/localtoworld-gives-wrong-value-if-the-mesh-was-transformed-by-skeleton/24925) | 禁止裸 `localToWorld` 取蒙皮顶点 |
| **TRAP-DT** | 头巾方案 TRAP-DT | `deltaSec = min(wallDt, wudaMaxDeltaSec)` |
| **TRAP-V0** | 速度缓冲脏帧（调研 §5） | `hasPrev==false` 时速度清零且不脱落 |
| **TRAP-POINTS** | 打击特效方案 WebGPU Points | 主路径 InstancedMesh |
| **TRAP-COST** | 蒙皮 CPU 成本讨论 | 粒子数硬上限；只蒙皮样本点 |

---

## 2. 目标架构（固定）

```
MeshSurfaceSampler(build once on bind-pose geo)
        │
        ▼
Bake N samples: { triIndex, barycentric u,v,w, regionWeight }
        │
每帧（动画与 skeleton.update 之后，墙钟 dt）：
        │
        ├─ 对每个粘着粒子：
        │     skinnedTriVerts = applyBoneTransform(v0/v1/v2)
        │     pos = barycentricBlend(skinnedTriVerts)
        │     pos.applyMatrix4(mesh.matrixWorld)
        │     vel = (pos - prevPos) / dt
        │     accel ≈ (vel - prevVel) / dt
        │     if speed>=detachSpeed OR accel>=detachAccel OR speedDrop>=detachSpeedDrop:
        │           state = Free; freeVel = vel * inheritVelScale + jitter
        │     else: write instance matrix at pos (Overwrite)
        │
        └─ 对每个自由粒子：
              freeVel += gravity * dt
              freeVel *= exp(-drag * dt)   // 或 (1 - drag*dt) 钳制
              pos += freeVel * dt
              life -= dt; 死则回收到池 / 可选重新附着（默认不自动再粘，除非 cfg 开）
```

**模块落点（强制路径名）**

| 模块 | 路径 |
|------|------|
| 类型与默认参数 | `app/src/render/wudaParticle/wudaTypes.ts` · `wudaDefaults.ts` |
| 表面烘焙 | `app/src/render/wudaParticle/WudaSurfaceBake.ts` |
| 运行时 | `app/src/render/wudaParticle/WudaCoatRuntime.ts` |
| FighterView 挂接 | `FighterView.ts` 内在 `syncFromLogic` 末尾调用 `wudaCoat?.update(wallDtSec, cfg)` |
| 测试 | `app/tests/render/wudaCoat*.test.ts` |

---

## 3. 分步执行（AI 按序；每步有依据与验收）

### Step 1 — CONFIG 字段与默认值

**依据**：C-WP §3.5；APP-CONST / APP-STORE；REF-THRESH 参数语义。  

**做**：在 `MutableSimConfig` / `createDefaultSimConfig` 增加 §7 全部字段（标量 boolean/number）。  

**验收**：`mergeConfig` 能合并；`vitest` 读默认对象含全部键。

### Step 2 — 表面烘焙 `WudaSurfaceBake`

**依据**：API-MSS；REF-BARY。  

**做**：

1. `import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'`。  
2. 对目标 `SkinnedMesh` 的 **geometry（绑定姿势）** `build()`。  
3. 采样 `wudaParticleCount` 次；**不得**只存世界坐标。必须同时写入：
   - `triIndex`（或三个顶点索引 `i0,i1,i2`）
   - 重心坐标 `u,v,w`（由采样点在三角内重建；若 `MeshSurfaceSampler` 不直接给出重心，则：用 `sample` 得到位置后在对应三角上解重心，或 fork sampler 内部分布逻辑——**优先**：扩展本地辅助函数，复制 MeshSurfaceSampler 中「按面积选三角 + 三角内均匀」算法并 **同时输出** `i0,i1,i2,u,v,w`。算法来源与 three 源码一致（`MeshSurfaceSampler.js` 内 `_face` / 面积累积）。  
4. 使用固定种子 RNG（可复用 `app/src/render/hitVfx/mulberry32.ts`）保证同配置可复现。  

**验收**：单元测试：平面三角网格上烘焙 N 点，重心满足 `u+v+w≈1` 且插值位置在三角内；种子相同 → 序列相同。

### Step 3 — 蒙皮位置求值

**依据**：API-SKIN；TRAP-L2W；TRAP-LAG。  

**做**：函数 `evalSkinnedSurfacePoint(mesh, sample, outPos)`：

1. 读 `position` attribute 的 `i0,i1,i2` 绑定坐标。  
2. `mesh.applyBoneTransform(i0, a)` 等同理 `i1,i2`。  
3. `outPos = a*u + b*v + c*w`。  
4. `outPos.applyMatrix4(mesh.matrixWorld)`。  

**调用时机**：仅在 `FighterView` 已完成本帧动画驱动且对该 mesh 调用过 `skeleton.update()` 之后（对照 APP-VIEW 现有 `skeleton.update` 调用点；新代码接在其后）。  

**验收**：测试用简易两骨 SkinnedMesh 或对真实 glb 在 T-pose / 一帧动画后，样本点落在网格表面邻域（距离阈值可放宽到模型尺度的小比例）。

### Step 4 — 速度 / 加速度与脱落

**依据**：REF-VEL；REF-STICK；REF-THRESH；C-WP §3.2；TRAP-V0。  

**做**：每粒子字段：`state: Stuck|Free`，`prevPos`，`prevVel`，`pos`，`vel`，`life`。  

脱落条件（**须全部实现为可配置**，OR 组合）：

| 条件 | 公式 | 对应 cfg |
|------|------|----------|
| 高速 | `‖vel‖ ≥ wudaDetachSpeed` | 对齐 Skinner CutoffSpeed「低于某速不发射」的对偶：高于则脱 |
| 高加速 | `‖vel - prevVel‖ / dt ≥ wudaDetachAccel` | 急抖 |
| 急停 | `‖prevVel‖ - ‖vel‖ ≥ wudaDetachSpeedDrop` 且 `‖prevVel‖ ≥ wudaDetachSpeedDropMinPrev` | 出拳停顿 |

脱落时：`vel_free = vel * wudaInheritVelScale`；可加球内随机抖动 `wudaDetachJitter`；`life = wudaFreeLifetime`（可乘 `lerp(1, ‖vel‖, wudaSpeedToLife)` 对齐 Skinner `speedToLife` 方向）。  

**验收**：合成数据：给 prevVel 大、vel 小 → 触发急停脱落；静止序列 → 零脱落。

### Step 5 — 自由飞行积分

**依据**：REF-THRESH（gravity、drag、speedLimit）；C-WP §3.3。  

**做**（半隐式/显式欧拉，与 Skinner 粒子力语义一致即可）：

```
vel += gravityDir * gravityPower * dt
speed = ‖vel‖; if speed > speedLimit: vel *= speedLimit/speed
vel *= max(0, 1 - drag * dt)   // drag∈[0,15] 量级对齐 Skinner 文档区间，默认见 §7
pos += vel * dt
life -= dt
```

死亡：回收到对象池；**默认不自动重新附着**（`wudaRespawnStuck=false`）。若 `wudaRespawnStuck=true`，死亡后重新 Stuck 在原 sample 槽位。  

**验收**：无初速纯重力下落位移 ≈ `0.5*g*t^2`（允许数值误差）；drag>0 时末速低于无阻力。

### Step 6 — 渲染 InstancedMesh

**依据**：TRAP-POINTS；C-WP §3.5。  

**做**：

- 一个 `InstancedMesh`（或 Stuck/Free 各一）容量 = `wudaParticleCount`。  
- 几何：`PlaneGeometry` 面向相机（每帧对实例做 billboard：用相机四元数）或极低模 `IcosahedronGeometry(1,0)`。  
- 材质：`MeshBasicNodeMaterial` 或本仓 WebGPU 已用的等价透明材质；`depthWrite=false`；混合按 `wudaBlendAdditive` 在 Additive / Normal 间切换。  
- 颜色/大小：Stuck 用 `wudaStuckSize/Color/Opacity`；Free 用 `wudaFreeSize/Color` 并按寿命淡出。  

**验收**：开关启用后场景中可见实例；WebGPU 路径下点尺寸可见（非 1px 点原语）。

### Step 7 — 挂入 FighterView / main

**依据**：TRAP-LAG；REF-HITSTOP；APP-VIEW。  

**做**：

1. `FighterView` 在模型安装成功后 `bindWudaCoat(mesh)`（选主身体 SkinnedMesh：与现有渲染选用同一主网格；若多 mesh，用顶点数最大的 SkinnedMesh，并在日志打印 mesh 名）。  
2. `syncFromLogic(..., wallDtSec)` **末尾**：若 `cfg.wudaEnabled` 则 `wuda.update(wallDtSec, cfg)`。  
3. **不得**因 `hitstop` 跳过 `wuda.update`。  
4. 模型卸载/重装时 `dispose` 旧 InstancedMesh 与烘焙。  

**验收**：训练场启用后跟动画；顿帧时身体停、空中飞屑仍动。

### Step 8 — 调试面板（必须公开的参数）

**依据**：C-WP §3.5；APP-GUI 头巾文件夹风格。  

在 `DebugGui.ts` 与 `ControlPanel.ts` **同步**增加文件夹 **「武打粒子」**，绑定 §7 全部字段（中文 `name`）：

| 面板显示名 | cfg 字段 | 范围建议 |
|------------|----------|----------|
| 启用 | `wudaEnabled` | bool |
| 粒子数 | `wudaParticleCount` | 64–2048，步进 64 |
| 随机种子 | `wudaSeed` | int |
| 脱落速度阈值 | `wudaDetachSpeed` | 0–20 |
| 脱落加速度阈值 | `wudaDetachAccel` | 0–200 |
| 急停速度降 | `wudaDetachSpeedDrop` | 0–20 |
| 急停前速下限 | `wudaDetachSpeedDropMinPrev` | 0–20 |
| 继承速度比 | `wudaInheritVelScale` | 0–2 |
| 脱落抖动 | `wudaDetachJitter` | 0–2 |
| 速度→寿命 | `wudaSpeedToLife` | 0–1 |
| 自由寿命 | `wudaFreeLifetime` | 0.05–3 |
| 重力强度 | `wudaGravityPower` | 0–30 |
| 重力X/Y/Z | `wudaGravityDirX/Y/Z` | -1–1 |
| 阻力 | `wudaDrag` | 0–15 |
| 速度上限 | `wudaSpeedLimit` | 0.1–50 |
| dt 上限 | `wudaMaxDeltaSec` | 0.016–0.1 |
| 粘着尺寸 | `wudaStuckSize` | 0.001–0.05 |
| 自由尺寸 | `wudaFreeSize` | 0.001–0.08 |
| 粘着不透明度 | `wudaStuckOpacity` | 0–1 |
| 自由不透明度 | `wudaFreeOpacity` | 0–1 |
| 加色混合 | `wudaBlendAdditive` | bool |
| 死后回到粘着 | `wudaRespawnStuck` | bool |
| 显示调试 | `wudaShowDebug` | bool（统计：stuck/free 计数文本或颜色区分） |

颜色可用三个 float 或后续再扩；**最少**提供 `wudaStuckColorR/G/B`、`wudaFreeColorR/G/B`（0–1）。  

**验收**：拖动脱落阈值可明显改变甩出量；关闭启用后实例不可见或 count=0。

### Step 9 — 与打击特效隔离 + 可选增强

**依据**：C-WP §0。  

**做**：

- 文档与代码注释写明：命中火花仍走 `HitVfxDirector`；武打涂层不读 hit 配方。  
- **可选**（cfg `wudaAlsoPlumeBurst` 默认 false）：脱落时调用 plume `spawn` 一次短 burst，初速=freeVel。若实现，必须复用现有 `plumeApi.ts`，禁止新引擎。  

**验收**：默认 false 时无 plume 依赖也能跑通涂层。

### Step 10 — 测试与手工验收清单

**自动化（Vitest）**：

1. 烘焙重心合法 + 种子稳定。  
2. 速度差分公式。  
3. 急停条件触发。  
4. 重力积分。  
5. CONFIG 默认键齐全。  

**手工（隆训练场）**：对齐 C-WP §3.6 四条。  

---

## 4. §7 配置字段正式表（默认值——可拧手感，键名不可擅自改）

| 字段 | 类型 | 默认 | 依据 |
|------|------|------|------|
| `wudaEnabled` | bool | `false` | 安全默认关 |
| `wudaParticleCount` | number | `512` | TRAP-COST；可上调 |
| `wudaSeed` | number | `1` | mulberry32 |
| `wudaDetachSpeed` | number | `4.0` | Skinner Cutoff 对偶初值，面板拧 |
| `wudaDetachAccel` | number | `60` | 急抖 |
| `wudaDetachSpeedDrop` | number | `3.0` | 急停 |
| `wudaDetachSpeedDropMinPrev` | number | `2.0` | 避免噪声急停 |
| `wudaInheritVelScale` | number | `1.0` | REF-VEL |
| `wudaDetachJitter` | number | `0.15` | 观感 |
| `wudaSpeedToLife` | number | `0.2` | Skinner speedToLife 量级 |
| `wudaFreeLifetime` | number | `0.6` | |
| `wudaGravityPower` | number | `9.8` | |
| `wudaGravityDirX/Y/Z` | number | `0 / -1 / 0` | |
| `wudaDrag` | number | `1.5` | Skinner drag 区间内 |
| `wudaSpeedLimit` | number | `12` | Skinner speedLimit |
| `wudaMaxDeltaSec` | number | `0.05` | TRAP-DT |
| `wudaStuckSize` | number | `0.008` | |
| `wudaFreeSize` | number | `0.012` | |
| `wudaStuckOpacity` | number | `0.55` | |
| `wudaFreeOpacity` | number | `0.85` | |
| `wudaStuckColorR/G/B` | number | `0.65/0.6/0.5` | 尘默认 |
| `wudaFreeColorR/G/B` | number | `0.75/0.7/0.6` | |
| `wudaBlendAdditive` | bool | `false` | 气可开 |
| `wudaRespawnStuck` | bool | `false` | |
| `wudaShowDebug` | bool | `false` | |
| `wudaAlsoPlumeBurst` | bool | `false` | 可选增强 |

粉尘/水/气：**不**做枚举模式强制三套代码；用预设按钮可选（同一字段写入不同默认组合）——若做预设，仅写 `applyWudaPresetDust|Water|Gas(cfg)` 三个函数，仍共享同一运行时。

---

## 5. 明确禁止清单（实现期）

| 禁止 | 依据 |
|------|------|
| 只用骨骼挂点交付 | C-WP §4 |
| `localToWorld` 取蒙皮表面 | TRAP-L2W |
| 动画前采样骨矩阵 | TRAP-LAG |
| 主路径 `THREE.Points` 大点 | TRAP-POINTS |
| 新依赖 Niagara/@newkrok 粒子作粘着层 | §0 |
| 真沙 DEM / XPBD 统一求解作主路径 | C-WP §4 · R-WP |
| 抄解包 SF6 特效 | C-WP |
| hitstop 时跳过自由粒子更新 | C-WP §3.4 |
| 用 MVP/P0 缩水粒子数到「几颗挂点」声称完成 | 元共识 |

---

## 6. 避坑补强（检索结论 → 强制条款）

1. **时序**：`wuda.update` 挂在 `FighterView.syncFromLogic` 末尾；该函数内须已 `skeleton.update()`（现有代码路径确认后接入；若某分支 baked static mesh 无骨架，则该分支 **禁用** 武打粒子并 log 一次）。依据 TRAP-LAG。  
2. **第一帧**：`prevValid=false` → 只写 prevPos，不脱落。依据 TRAP-V0。  
3. **dt**：`dt = min(wallDtSec, cfg.wudaMaxDeltaSec)`；`dt<=0` 直接 return。依据 TRAP-DT。  
4. **性能**：`wudaParticleCount` 变更时重建烘焙与 InstancedMesh；禁止每帧 `new InstancedMesh`。依据 TRAP-COST。  
5. **重心重建**：若三角面积在极端变形下退化，跳过该粒子本帧脱落检测并保持 Stuck 插值（防 NaN）。依据数值稳健性。  
6. **与打击特效同开**：两者都可以 `enabled`；涂层不调用 `HitVfxDirector.trigger`。依据 C-WP §0。

---

## 7. 完成定义（对照共识，打勾用）

- [ ] 隆表面有粘着涂层并随蒙皮  
- [ ] 速度/加速度/急停三阈值可调且有效  
- [ ] 自由态重力·阻力·寿命  
- [ ] 面板 + CONFIG 持久化  
- [ ] 自动化测试通过  
- [ ] 手工四条验收通过  
- [ ] 未引入禁止依赖 / 未缩水为挂点方案  

---

## 8. 参考链接速查（执行时打开）

- Skinner: https://github.com/keijiro/Skinner  
- Smrvfx: https://github.com/keijiro/Smrvfx  
- MeshSurfaceSampler: https://threejs.org/docs/pages/MeshSurfaceSampler.html  
- applyBoneTransform: https://threejs.org/docs/pages/SkinnedMesh.html  
- 重心跟踪样例仓: https://github.com/PaulDemeulenaere/vfx-uniform-mesh-sampling  
- Overwrite 讨论: https://forums.unrealengine.com/t/niagara-skeletal-mesh-how-to-add-forces-or-velocity/486439  
- 蒙皮采样时序: https://discourse.threejs.org/t/skinned-mesh-related-bone-bind-matrices-update-timing/34210  
- 调查全文: `docs/research/wuda-particle-research-2026-09-01.md`  
- 共识全文: `docs/wuda-particle-consensus-v0.md`  

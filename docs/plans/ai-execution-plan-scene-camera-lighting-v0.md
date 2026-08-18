# AI 执行方案：训练场场景 / 平时对打镜头 / 训练场光照（失效档）

> **状态**：**失效**（2026-08-17）——上位合一共识已整份废止，本方案不得再当执行依据。  
> **原上位共识**：`docs/consensus-scene-camera-lighting-v0.md`（**已废止**）  
> **光照现共识**：`docs/consensus-lighting-v0.md`（须**另写**光照执行方案后再做）  
> **场景 / 摄影**：待新共识与新方案  
> **调查（非权威）**：  
> - 灯光系统 → `docs/research/lighting-system-research-2026-08-17.md`  
> - 旧混合 → `docs/research/scene-camera-lighting-research-2026-08-17.md`  
> **元共识**：`docs/consensus-v0.md` §0 写进即全做  
> **本文件正文**：仅历史参考；其中光照「训练场光」扁平字段路径与已废止共识绑定，**不要**继续实现来顶替新灯光工具共识。

---

## 0. 执行总则（AI 必读）

### 0.1 做成定义（来自共识 §5，不得改写）

对照街霸 6 **训练模式截图**，至少三组站位（左右对调算同一套）：场中平常距、拉开较远、贴左/右角落。每一组比：格子与中线、人在画面里的大小、镜头是否侧视并跟人、光的方向与明暗。

**已做成** = 人写下对照通过。方案里的起步数字只是从**本仓库现码**抄来的未审查值，`review.status` 保持未审查，直到对照通过。

### 0.2 硬约束

1. **场景只用已有模型**：`private/interim/SF6 Training Stage/SF6 Training Stage.glb`（运行时现有打包名见 `app` 里 `stageUrl` / `SF6 Training Stage*.glb`）。禁止新建模顶替。  
2. **镜头只做平时对打**：侧视、跟两人中点、按间距拉远（默认可关）。禁止 DI/超必杀推镜。  
3. **相机不得写** `Fighter.x` / `Fighter.y` / `MatchSim` 边界以外的规则。  
4. **覆盖序**（已有栈，禁止再发明第二套权威）：代码默认 → 内容表（若加 JSON）→ `loadShippingConfig` → `localStorage`（见 `app/src/config/persist.ts`）。调试写回只走现有「导出 shipping」，**不写** `app/public/` 源文件。  
5. **Three 栈**：`app/package.json` 的 `three`（现用 `three/webgpu` + `GLTFLoader`）。新代码放 `app/src/render/`。  
6. **未测数字一律当可调默认**，不得在注释或文档里写成「已对准原作」。

### 0.3 推荐顺序（依赖不可打乱）

```text
S0 量 glb（未缩放 AABB）并打日志
 → S1 舞台对齐：停用挡尺子的地面/Grid；中线对逻辑 x=0
 → S2 CameraRig（跟随 + 默认可关变焦 + 无偏航夹死）
 → S3 纯函数测试
 → S4 LightRig（五灯 + fog/背景入库，默认关投影）
 → S5 调试面板全参数 + persist 字段
 → S6 对照清单（人勾，AI 不得自标已复刻）
```

---

## 1. 参考资料总表（禁止脱离引用编造）

| ID | 资料 | 本方案用它做什么 |
|----|------|------------------|
| C1 | `docs/consensus-scene-camera-lighting-v0.md` | 要做什么 / 不做什么 / 怎样算做成 |
| C2 | `docs/research/scene-camera-lighting-research-2026-08-17.md` | 灰石纹+粗线尺子、侧视跟人、平光；**无数字权威** |
| R1 | 本仓库 `app/src/render/StageView.ts` | `GLTFLoader.loadAsync`、居中 XZ、贴地、按宽缩放 |
| R2 | 本仓库 `app/src/main.ts` 175–212、399–411 | 现相机 FOV 40、`lookAt(0,1,0)`、五灯坐标、fog、地面、每帧钉死相机 |
| R3 | 本仓库 `app/src/render/FighterView.ts` `syncFromLogic` | 人画在 `(x*worldScale, y*worldScale, ±0.05)`，`rotation.y = π/2` |
| R4 | 本仓库 `app/src/config/constants.ts` / `DebugGui.ts` / `ControlPanel.ts` | 已有 `cameraZ`/`cameraY`/`worldScale`/`stageMinX` |
| R5 | 本仓库 `app/src/config/persist.ts` | shipping / localStorage |
| G1 | [Ikemen-GO](https://github.com/ikemen-engine/Ikemen-GO) 及议题 [1456](https://github.com/ikemen-engine/Ikemen-GO/issues/1456) [1638](https://github.com/ikemen-engine/Ikemen-GO/issues/1638) | **概念**：镜头对准两人、按距离变焦、有边界。本项目用 Three 透视重写，不移植 Go 源码、不抄 MUGEN 舞台文件。 |
| G2 | [three.js Vector3.project](https://threejs.org/docs/#api/en/math/Vector3.project) + [论坛：NDC](https://discourse.threejs.org/t/how-to-understand-vector3-project-and-ndc-space/26535) | 角落是否出画：世界点 → NDC，`x,y ∈ [-1,1]` 才在锥里 |
| G3 | [three.js lookAt](https://threejs.org/docs/#api/en/core/Object3D.lookAt) + [SO: lookAt + up](https://stackoverflow.com/questions/14271672/moving-the-camera-lookat-and-rotations-in-three-js) | 必须设 `camera.up = (0,1,0)`；**camX 必须等于 lookX** 才不偏航 |
| G4 | [GLTF 偏暗 / PBR](https://stackoverflow.com/questions/60308462/gltf-model-is-too-dark) [discourse 灯无效](https://discourse.threejs.org/t/ambient-color-doesnt-effect-gltf-model/11152) [r152 色彩](https://discourse.threejs.org/t/material-brightness-issue-noticed-on-latest-version-when-upgrading-from-151/52633) | 保持 `outputColorSpace = SRGBColorSpace`；用方向光+环境光调观感，不靠把 albedo 乘亮 |
| G5 | [Discover three.js DirectionalLight](https://discoverthreejs.com/book/first-steps/physically-based-rendering/) | `DirectionalLight(color, intensity)` + `position` 表示方向 |
| G6 | [sambrenner/badfighter](https://github.com/sambrenner/badfighter) | 仅对照「Three 里两人 + 相机」结构，不抄物理相机 |
| G7 | [yomotsu/camera-controls](https://github.com/yomotsu/camera-controls) | **禁止**当对打主相机（轨道/阻尼会破坏侧视）。最多参考「先算目标再 lerp」的写法。 |
| G8 | 调查读图：本机 `SF6 Training Stage Preview.png` + TheGamer 训练截图 | 定性：灰格、+ 准星、粗线尺子、人约半屏高 |

---

## 2. 坐标系（必须按现码，禁止改走路轴）

| 量 | 规定 | 依据 |
|----|------|------|
| 逻辑 | `(x, y)`，y 向上，地面 0 | 角色控制共识 / `STAGE_GROUND_Y` |
| 人画到 Three | `position = (fighter.x * worldScale, modelYOffset + fighter.y * worldScale, p1? +0.05 : -0.05)` | `FighterView.syncFromLogic` |
| 人朝向 | `rotation.y = π/2`（沿 +X 走） | 同上 |
| 相机 | 站在 **+Z**，看向 **−Z**（`lookAt` 的 z 用 0） | `main.ts` |
| 中线 | 逻辑 `x=0` 应对准模型粗竖线 | 共识尺子 + 预览图 |

**禁止**：把走路改到 Z；禁止为了对镜头把两人画到 z=0 而改判定。

镜头用的世界 X：

```text
midX_w = ((p1.x + p2.x) * 0.5) * cfg.worldScale
sep_w  = Math.abs(p1.x - p2.x) * cfg.worldScale
```

依据：与 `FighterView` 同一乘数，否则人走了镜头还停在逻辑坐标上（`worldScale≠1` 时必歪）。

---

## 3. S0 — 量未缩放 glb

### 3.1 理论

`Box3.setFromObject` 在物体 `updateMatrixWorld(true)` 之后给出世界轴对齐盒。必须在 `StageView` 做 `targetWidth` 缩放**之前**量，否则日志是拟合后的假尺寸。

### 3.2 实现（新脚本，只读 glb）

路径：`app/scripts/measure-training-stage.mjs`

方法（只许用这些 API）：

1. 与 `StageView` 相同：`GLTFLoader` + `loadAsync`（Node 侧若无 WebGPU，用 `three` 标准 `GLTFLoader` + 文件 URL / `fs` 读进 `FileLoader` 已有模式；若脚本跑在浏览器外，可用 `npx tsx` 调与测试相同的 three 构建）。  
   **本仓库已有先例**：`tools/estimate_root_motion/estimate_move_dx.mjs` 的 Node 读文件方式。量包围盒更稳妥的做法：在 **Vitest 或临时 `app` 脚本**里 import `three` + `GLTFLoader`，读绝对路径 glb。  
2. `model.updateMatrixWorld(true)`  
3. `new THREE.Box3().setFromObject(model)` → `min/max/size`  
4. **不要**调用 `StageView.load` 的居中/缩放。  
5. `console.log` JSON：`preScaleMin`, `preScaleMax`, `preScaleSize`，路径。  
6. 用颜色贴图只做说明：`private/interim/SF6 Training Stage/SF6 Training Stage textures/ess0000_00_albdout.png` 是 4×4 小格+粗十字，**不要**从像素猜世界米制写进运行时。

验收：跑一次有未缩放 size；把日志贴进 `docs/research/` 一小节或脚本 stdout。数字仍 ⬜。

### 3.3 坑

| 坑 | 依据 | 方案要求 |
|----|------|----------|
| 量了缩放后的盒却当「原尺寸」 | `StageView.ts` 29–34 行先 `scale = targetWidth/width` | 脚本禁止 import `StageView.load` |
| `setFromObject` 含未更新矩阵 | Three 文档要求先 `updateMatrixWorld` | 强制调用 |
| 居中后中线不在 x=0 | `StageView` 用 AABB 中心，不是贴图粗线 | S1 加可选 `stageOriginX` 偏移，默认 0，对照图再调 |

---

## 4. S1 — 舞台对齐（不换模型）

### 4.1 要改什么

文件：`app/src/render/StageView.ts`、`app/src/main.ts`

1. **`load` 增加第三参或 options**：`{ targetWidth: number \| null, originX: number, originZ: number }`。  
   - `targetWidth === null`：不按宽拉伸，只用 1:1（仅当对照证明 glb 单位已与逻辑一致；默认仍用现有 fallback **18**，因 `main.ts` 已传 18；`StageView` 函数默认 16 不得在未改调用点时偷偷生效）。  
   - 默认调用保持：`stage.load(stageUrl, 18)`，避免一下子把人和房子比例打乱。  
2. 居中后允许 `model.position.x += originX`（调试参数 `stageOriginX`），让粗竖线对逻辑 0。  
3. **加载成功后**：  
   - `grid.visible = false`（`THREE.GridHelper` 20×40 与训练格不对齐，调查笔记已写）。  
   - 官方场子可见时，把垫底 `ground` 的 `visible` 做成开关，**默认 false**（`main.ts` 注释写 stage 可能透明才垫底；调查预览图场子不透明）。开关名 `showFallbackGround`。  
4. 禁止删除 glb 网格去「程序化重铺格子」。

### 4.2 坑

| 坑 | 依据 | 方案 |
|----|------|------|
| 垫底灰地盖住官方浅灰石纹 | `main.ts` 198–206 永远留着 | 默认关；失败加载再开 |
| 调试 Grid 盖住尺子 | GridHelper 格是 0.5 世界单位 | 默认关 |
| 改 `targetWidth` 不改相机距离 | 房子变了人相对画面变 | 改宽必须同时在面板里重调 `cameraZ`；同一提交说明 |
| 雾太近切掉后墙 | `Fog(0x1a2030, 40, 80)` 相对 `cameraZ≈8` 一般够远；若后墙发灰再调 `fogNear/Far` | 参数进面板，默认保持 40/80 |

---

## 5. S2 — CameraRig（平时对打镜头）

### 5.1 理论依据（只许这套几何）

侧视透视相机：位置 `(camX, camY, backZ)`，看向 `(lookX, lookY, 0)`，且 **`camX === lookX`**（光轴平行世界 −Z）。  
若只平移 `camX` 而 `lookAt` 仍在两人中点，`lookAt` 会绕 Y 偏航，侧视格斗画面墙缝会斜——Three `Object3D.lookAt` 行为（G3）。

变焦（G1 概念，公式必须写死如下，禁止自创指数曲线当「原作」）：

```text
backZ = clamp(zMin + zoomSepK * sep_w, zMin, zMax)
```

- **默认 `zoomEnabled = false`**：`backZ = cfg.cameraZ`（与现 GUI 一致）。共识：平时要对着截图调远近；变焦系数 ⬜。  
- `zoomEnabled = true` 时：`cameraZ` **只当 zMin**，避免拖条和公式互殴。

夹死（G2，禁止只用世界 X 加减一个常数当「不丢人」）：

1. 先设 `camX = lookX = midX_w`，`camY = cfg.cameraY`，`backZ` 如上，`lookY = cfg.cameraLookY`（新字段，起步 **1.0**，抄 `main.ts` lookAt y）。  
2. `camera.up.set(0,1,0)`；`camera.lookAt(lookX, lookY, 0)`；`camera.updateMatrixWorld(true)`；`camera.updateProjectionMatrix()`。  
3. 把两人世界点（x = `fighter.x * worldScale ± 0.35 * worldScale`，y 用 `1.85 * worldScale` 头顶与 `0` 脚；半宽 **0.35** 因仓库站立 hurt 全宽 0.7，见 `unit-calibration.md` / ADR-002）`Vector3.project(camera)`。  
4. 若任一点 `ndc.x` 超出 `[-1 + pad, 1 - pad]`（`pad` 默认 **0.08**，可调）：把 `camX` 和 `lookX` **同时**加上同一 `Δ`，使更越界的那一侧收回。计算 `Δ` 用「当前 mid 沿 X 平移」迭代最多 8 次，或闭式：  
   `Δ = (ndcOverflowX) * (可见半宽世界)`，可见半宽 ≈ `backZ * tan(fovY/2) * aspect`（透视小孔模型，[PerspectiveCamera](https://threejs.org/docs/#api/en/cameras/PerspectiveCamera)）。  
5. 平移后若仍越界：增大 `backZ`（每次 +4% 或加到 `zMax`），再重复 3–4。  
6. **禁止**只改 `camX` 不改 `lookX`。单测断言 `camX === lookX`。

FOV：继续 `PerspectiveCamera` 的 `fov` 字段起步 **40**（`main.ts`），做成 `cfg.cameraFov`。超宽不加黑边（共识 §4）。

### 5.2 落点

- 新文件 `app/src/render/CameraRig.ts`  
  导出纯函数 `computeFightCamera(input): { camX, camY, camZ, lookX, lookY, lookZ }`  
  以及 `applyFightCamera(camera, pose)`：`position.set` + `up` + `lookAt`。  
- `app/src/main.ts` **删除**每帧 `camera.position.set(0, cameraY, cameraZ)` / `lookAt(0,1,0)`（现 410–411 行），改为读 `p1/p2` 逻辑坐标后 `compute` + `apply`。  
- **禁止**引入 `OrbitControls` / `camera-controls` 作为对打相机（G7）。

### 5.3 坑

| 坑 | 依据 | 方案 |
|----|------|------|
| `project` 在相机矩阵未更新时乱跳 | Three 文档；discourse NDC 帖：锥外坐标会超出 [-1,1] | 先 pose 再 `updateMatrixWorld` 再 project |
| 人有 `z=±0.05` | `FighterView` | project 用真实 `root.position`，不要假设 z=0 |
| `modelScale` 只缩人的网格不缩逻辑 x | `syncFromLogic`：位置只用 `worldScale`，尺度用 `worldScale*modelScale` | 镜头中点只用 `worldScale`，与位置一致 |
| 启动 `cameraZ=8` 盖掉默认 6 | `main.ts` 127 | 保留 boot 覆盖；面板显示的是覆盖后的值 |
| 变焦开着时拖 cameraZ 无感 | 本方案定义 | GUI 注明：变焦开 = zMin |
| lerp 平滑 | G7 有阻尼 | **默认 lerp=0**（跟手）。若加 `cameraLerp` 必须 0–1，默认 0，避免拖影被当成「原作手感」 |

---

## 6. S3 — 测试（必须与 S2 同批）

路径：`app/tests/render/cameraRig.test.ts`（Vitest，已有 `app/tests/`）。

只测纯函数，**CI 不加载 glb**：

1. `p1.x=-1, p2.x=1, worldScale=1` → `midX_w=0`。  
2. `worldScale=2` → `midX_w` 翻倍。  
3. `zoomEnabled=false` → `camZ === cameraZ`。  
4. 任何夹死后 `camX === lookX`。  
5. 半宽回退 0.35。  
6. 相机函数**不修改**传入的 fighter 对象。

---

## 7. S4 — LightRig

### 7.1 理论

`MeshStandardMaterial` 无灯则黑；RE/GLTF albedo 常偏暗（G4）。本仓库已用五路灯（R2），调查图为**平、冷、灰屋 + 人身上有亮边**。  
**禁止**新增「电影三点光原创布局」。把 `main.ts` 现有五灯**原样搬进**可调结构。

起步值（全部标未审查，抄 R2）：

| 灯 | 类型 | color | intensity | position |
|----|------|-------|-----------|----------|
| ambient | AmbientLight | 0xffffff | 0.85 | — |
| hemi | HemisphereLight | sky 0xf2f6ff / ground 0x5a5048 | 1.55 | — |
| key | DirectionalLight | 0xfff5e6 | 2.9 | (4, 14, 9) |
| fill | DirectionalLight | 0xaaccff | 1.1 | (-9, 5, -3) |
| rim | DirectionalLight | 0xffffff | 0.65 | (0, 3, -8) |

另：`scene.background = 0x1a2030`，`fog` 同色 40–80。  
`renderer.outputColorSpace = THREE.SRGBColorSpace` **保持**（G4 r152 讨论）。  
`shadows.enabled = false`（现码方向光未 `castShadow`，只有地面 `receiveShadow`，开投影会黑一块却无影）。

### 7.2 落点

- 新文件 `app/src/render/LightRig.ts`：`createLightRig(scene)` 返回句柄；`applyLightConfig(rig, cfg)` 每帧或 onChange 写回 intensity/position/color。  
- `main.ts` 删掉内联 `new AmbientLight` 等，改调 LightRig。  
- **不要**给角色另挂一套灯（与 `artRoughness` 互殴，见角色美术共识）。

### 7.3 坑

| 坑 | 依据 | 方案 |
|----|------|------|
| 只加灯仍暗 | metalness/roughness、无 env map（G4） | 先调 intensity；禁止改角色贴图目标 |
| 调太亮场子过曝 | 共识验收：不过曝不死黑 | 面板能当场拧 |
| WebGPURenderer 与旧 WebGL 强度感觉不同 | three r15x + WebGPU | 只以本机 Chrome 截图对照，不抄网上 WebGL 强度表 |
| Hemisphere + Ambient 叠两层环境 | 现码已如此 | 保持可分别关掉（intensity 0） |

---

## 8. S5 — 必须挂到调试面板的参数

在 **lil-gui**（`DebugGui.ts`）和 **ControlPanel**（`ControlPanel.ts`）**两侧都要有**（现相机已是双入口，不得只改一边）。

新字段全部进 `MutableSimConfig` + `createDefaultSimConfig` + `cloneConfig` 能拷到的结构（跟现有 `cameraZ` 同一路径）。

### 8.1 镜头文件夹「对打镜头」

| 面板名 | cfg 字段 | 范围/步进 | 默认（未审查） | 作用 |
|--------|----------|-----------|----------------|------|
| 视野 FOV | `cameraFov` | 20–70 / 0.5 | 40 | `PerspectiveCamera.fov` |
| 相机高度 Y | `cameraY` | 0–5 / 0.05 | boot 后 1.4 | camY |
| 相机距离 Z | `cameraZ` | 1–30 / 0.1 | boot 后 8 | 变焦关=距离；开=zMin |
| 看点高度 | `cameraLookY` | 0–3 / 0.05 | 1.0 | lookAt.y |
| 开启间距变焦 | `cameraZoomEnabled` | bool | **false** | |
| 变焦系数 | `cameraZoomSepK` | 0–3 / 0.01 | 0.35（仅占位） | `backZ=zMin+k*sep_w` |
| 变焦最远 | `cameraZMax` | 1–40 / 0.1 | 16（占位） | clamp 上限 |
| 画面边距 | `cameraNdcPad` | 0–0.3 / 0.01 | 0.08 | NDC 内边距 |
| 镜头跟随平滑 | `cameraLerp` | 0–1 / 0.01 | **0** | 0=每帧到位 |
| 近裁 | `cameraNear` | 0.01–1 | 0.05 | |
| 远裁 | `cameraFar` | 50–2000 | 500 | |

### 8.2 舞台文件夹「训练场」

| 面板名 | 字段 | 默认 | 作用 |
|--------|------|------|------|
| 拟合宽度 | `stageFitWidth` | 18 | 传入 `StageView.load`；null 语义用 ≤0 表示不拟合 |
| 舞台原点 X | `stageOriginX` | 0 | 粗中线对准逻辑 0 |
| 舞台原点 Z | `stageOriginZ` | 0 | |
| 显示垫底地面 | `showFallbackGround` | false | |
| 显示调试网格 | `showDebugGrid` | false | |
| 显示坐标轴 | `showAxes` | false | 现 AxesHelper 默认关 |
| 逻辑场左 | `stageMinX` | 已有 -4.5 | **只影响逻辑边界，不改 glb** |
| 逻辑场右 | `stageMaxX` | 已有 4.5 | 同上 |

改 `stageFitWidth` / origin：调用 `stage` 重新应用变换（可 `load` 一次缓存 gltf scene，避免每次重读盘）。

### 8.3 光照文件夹「训练场光」

每个灯：`intensity`、`color`（hex）、方向灯再加 `posX/Y/Z`。  
另：`fogColor`、`fogNear`、`fogFar`、`bgColor`、`hemiSky`、`hemiGround`。  
开关：`lightAmbientOn` 等可用 intensity=0 代替，不必再加布尔，除非 GUI 更清晰。

**禁止**把 `artRoughness` 放进这个文件夹。

---

## 9. S6 — 对照清单（人做，AI 只准备空表）

新建 `docs/research/scene-camera-lighting-review-checklist.md`（调查/审查表，**不是**共识）：

三组站位 × 格子 / 人身高占比 / 跟镜 / 明暗。每格「未对照」。  
AI 填「用了哪张实机图、本机第几帧」，不得填「已通过」。

实机图来源（调查已用）：[TheGamer 训练教程](https://www.thegamer.com/street-fighter-6-sfvi-training-mode-tips-tricks-guide/) 及用户自己截的训练模式。

---

## 10. 明确不要做（执行时若做了算出错）

- 正交主相机。  
- `OrbitControls` / 自由飞。  
- 大招镜头状态机。  
- 超宽 letterbox。  
- 用 SF4 15 单位或「一格一米」改 `stageMinX`。  
- 公开提交训练场 glb。  
- 在共识文件里写入量出来的米制（先调查笔记，人同意再改共识）。

---

## 11. 文件改动清单（AI 只许动这些，另加测试）

| 文件 | 动作 |
|------|------|
| `app/scripts/measure-training-stage.mjs`（或 `app/tests` 可跑脚本） | 新建 |
| `app/src/render/StageView.ts` | 改 load options；缓存 scene |
| `app/src/render/CameraRig.ts` | 新建 |
| `app/src/render/LightRig.ts` | 新建 |
| `app/src/main.ts` | 换 Rig；关默认 grid/ground/axes |
| `app/src/config/constants.ts` | 新字段默认值 |
| `app/src/debug/DebugGui.ts` | 新文件夹 |
| `app/src/debug/ControlPanel.ts` | 同步控件 |
| `app/tests/render/cameraRig.test.ts` | 新建 |
| `docs/research/scene-camera-lighting-review-checklist.md` | 新建空表 |
| `docs/consensus-scene-camera-lighting-v0.md` | **本方案执行中不要改**，除非用户叫改共识 |

---

## 12. 给执行 AI 的验收命令

```bash
cd app && npx vitest run tests/render/cameraRig.test.ts
```

浏览器：训练场格子可见、镜头跟人横移、变焦默认关时拖「相机距离 Z」立即变远近、灯强度立即变亮暗、逻辑 x 不因镜头改变。

对照通过前，不得在任何文档写「已复刻镜头/光照」。

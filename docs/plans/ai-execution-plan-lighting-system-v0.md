# AI 执行方案：训练场可编辑灯光系统 v0

> **状态**：可执行（2026-08-17）  
> **上位共识**：`docs/consensus-lighting-v0.md`（写进即全做；本方案不得缩水）  
> **元共识**：`docs/consensus-v0.md` §0  
> **调查（非权威）**：`docs/research/lighting-system-research-2026-08-17.md`  
> **本方案补充检索**：three r185 源码、官方 example、Discourse/GitHub 坑（见 §12）  
> **执行者**：AI 代理  
> **技术栈（以仓库为准）**：`three@0.185.1`、`three/webgpu`、`WebGPURenderer`、Vite、Vitest、现有 `CONFIG`/`ControlPanel`/`shipping.json`

---

## 0. 执行总则（AI 必读）

### 0.1 做成定义（摘自共识 §5，不得改写）

**工具能力（必须全实现）**

1. 打光工具：列表增删/选中；颜色、强度等可改。  
2. 调试开：场景里灯可见，可拖位置；方向光可调朝向/目标。  
3. 可进/出摆灯自由视角；不影响对打逻辑。  
4. 默认方案观感接近替换前五灯；本地/shipping 可存可重载。  
5. **仅 1 盏主方向光**基础阴影；总灯约 8～15 盏量级。  
6. 旧扁平 `lightKey*` 等**不再是主路径**。

**观感对照**：人对着 SF6 训练模式截图写「已通过」才算观感做成。**AI 不得**在文档写「已复刻光照」。

### 0.2 硬禁止

| 禁止 | 依据 |
|------|------|
| 多盏灯同时 `castShadow=true` | 共识 §2.5 / §3 |
| 给玩家的灯光菜单 | 共识 §2.2 / §3 |
| 无上限狂加灯（超过方案硬顶） | 共识 §3；`DynamicLighting` 有 max 批次数 |
| 用占位三灯冒充做成 | 共识 §2.7 |
| 编造「原作灯位表」写入共识 | 共识 §4 |
| 改对打逻辑坐标 / 判定 | 共识 §6 |
| 从本方案「自由发挥」未列出的第三方库（如 leva、dat.gui 替换主面板） | 本方案只准用现有面板 + three 官方 addons |
| 继续实现已失效的 `ai-execution-plan-scene-camera-lighting-v0.md` 光照扁平路径 | 该方案已标失效 |

### 0.3 强制依赖的公开源码 / API（禁止自造等价物）

| 用途 | 必须使用的导入路径 | 官方依据 |
|------|-------------------|----------|
| WebGPU 渲染 | `import * as THREE from 'three/webgpu'` | 本仓库 `main.ts` 已用 |
| 动态增删灯（避免材质全量 recompile） | `import { DynamicLighting } from 'three/addons/lighting/DynamicLighting.js'` | 本机 `node_modules/three/examples/jsm/lighting/DynamicLighting.js`；官方 example [webgpu_lights_dynamic.html](https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_lights_dynamic.html)（dev 同源文件在 r185 包内已存在） |
| 阴影 | `renderer.shadowMap.enabled = true`；`DirectionalLight.castShadow`；mesh `castShadow`/`receiveShadow` | 官方 [webgpu_shadowmap.html](https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_shadowmap.html)；`Renderer.js` 中 `this.shadowMap = { enabled, type: PCFShadowMap }` |
| 方向光目标 | `light.target` **必须** `scene.add(light.target)` | [DirectionalLight.target 文档](https://threejs.org/docs/#api/en/lights/DirectionalLight.target) |
| Helper | `DirectionalLightHelper` / `PointLightHelper` / `SpotLightHelper` / `HemisphereLightHelper`（`three/webgpu` 导出） | [DirectionalLightHelper 文档](https://threejs.org/docs/#api/en/helpers/DirectionalLightHelper)：变换后必须 `helper.update()` |
| 视口拖拽 | `import { TransformControls } from 'three/addons/controls/TransformControls.js'` | [TransformControls 文档](https://threejs.org/docs/#examples/en/controls/TransformControls)；Discourse [Helper + TransformControls](https://discourse.threejs.org/t/how-to-control-directional-light-helper-with-transform-controls/17339) |
| 摆灯自由视角 | `import { OrbitControls } from 'three/addons/controls/OrbitControls.js'` | 官方 example 通用；**仅**摆灯模式启用 |
| 面板 / 存档 | 现有 `ControlPanel.ts`、`CONFIG`、`persist.ts`、`mergeConfig` | 本仓库 |

**UX 参考（抄行为，不抄整仓依赖）**

| 行为 | 参考 |
|------|------|
| 加灯 / Light Helpers 开关 | [three.js Editor](https://threejs.org/editor/) · 源码 [mrdoob/three.js/editor](https://github.com/mrdoob/three.js/tree/dev/editor) |
| Lights 列表 Tab | [srdz-af/nd-viewer (polyple) README Lights Tab](https://github.com/srdz-af/nd-viewer) |
| 灯进场景自动 helper 生命周期 | [threepipe Object3DWidgetsPlugin](https://threepipe.org/plugin/Object3DWidgetsPlugin.html) |

---

## 1. 现状锚点（改前事实，执行时对照）

| 文件 | 现状 |
|------|------|
| `app/src/render/LightRig.ts` | 固定 5 灯；`castShadow=false`；`applyLightConfig` 写扁平字段 + fog/bg |
| `app/src/config/constants.ts` | `lightAmbient*`…`lightRim*`、`fog*`、`bgColor` 扁平 |
| `app/src/main.ts` | `WebGPURenderer`；**未** `shadowMap.enabled`；每帧 `applyLightConfig`；对打相机 `CameraRig` |
| `app/src/render/materialUtils.ts` | `mesh.castShadow = false`（阴影永远投不出人影） |
| `app/src/debug/ControlPanel.ts` | 「打光」仅强度/位置数字滑条，无列表 |
| `app/src/config/store.ts` `mergeConfig` | **只** merge number/boolean/string + `expandedSections` + dash 数组；**不会** merge 对象数组 → 必须扩展 |
| 依赖 | `three@0.185.1` 已含 `examples/jsm/lighting/DynamicLighting.js` |

---

## 2. 目标架构（固定，禁止另起炉灶）

```
CONFIG.lights: LightDesc[]  ──(sync)──►  LightRuntime (THREE.Light + target + helper)
       ▲                                      │
       │                                      ├─ scene graph
       │                                      └─ TransformControls.attach(light|target)
ControlPanel「打光」
       │
CONFIG.lightDebug / lightOrbit / fog / bg / shadowMapSize …
       │
main.ts: DynamicLighting + shadowMap + (可选) OrbitControls
```

- **权威数据**：`CONFIG.lights`（数组）。Three 对象是投影，不是权威。  
- **全局环境**：`fogColor/fogNear/fogFar/bgColor` 保留为顶层字段（与现码一致）；仍由灯光系统 `applyEnvironment` 写入 `scene`。  
- **调试开关**：`lightHelpersVisible`、`lightOrbitMode` 等，见 §8。

---

## 3. 数据模型（必须按此字段实现）

### 3.1 `LightType`

```ts
export type LightType =
  | 'ambient'
  | 'hemisphere'
  | 'directional'
  | 'point'
  | 'spot';
```

依据：three 类 `AmbientLight` / `HemisphereLight` / `DirectionalLight` / `PointLight` / `SpotLight`（`three/webgpu`）。

### 3.2 `LightDesc`（可 JSON 序列化，进 localStorage / shipping）

```ts
export type LightDesc = {
  /** 稳定 id，新建时用 `crypto.randomUUID()` 或 `light_${Date.now()}_${n}` */
  id: string;
  /** 面板显示名 */
  name: string;
  type: LightType;
  /** false → light.visible = false 且 intensity 应用时视为 0 贡献（仍保留对象） */
  enabled: boolean;
  /** 0xRRGGBB number（与现 CONFIG 颜色字段一致） */
  color: number;
  intensity: number;
  /** 世界坐标；ambient 忽略 */
  position: { x: number; y: number; z: number };
  /** directional / spot / hemisphere 方向目标点；ambient/point 忽略 position 外逻辑 */
  target: { x: number; y: number; z: number };
  /** 仅 hemisphere */
  groundColor?: number;
  /** 仅 point / spot；three 默认 distance=0 表示无限 */
  distance?: number;
  /** 仅 point / spot；物理衰减，three 默认 2 */
  decay?: number;
  /** 仅 spot，弧度 */
  angle?: number;
  /** 仅 spot，0–1 */
  penumbra?: number;
  /**
   * 仅 directional 有效。全列表中 **最多一个** true。
   * 共识：单主方向光阴影。
   */
  castShadow: boolean;
};
```

### 3.3 替换掉的扁平字段（删除主路径）

从 `MutableSimConfig` **删除**（或 migrate 后不再读写）：

`lightAmbientIntensity`, `lightAmbientColor`, `lightHemiIntensity`, `lightHemiSky`, `lightHemiGround`, `lightKeyIntensity`, `lightKeyColor`, `lightKeyX/Y/Z`, `lightFill*`, `lightRim*`。

**保留**：`fogColor`, `fogNear`, `fogFar`, `bgColor`。

### 3.4 新增顶层调试 / 阴影字段

| 字段 | 类型 | 默认 | 作用 |
|------|------|------|------|
| `lights` | `LightDesc[]` | §3.5 迁移表 | 权威灯光列表 |
| `lightSelectedId` | `string` | `''` 或默认 key id | 面板选中；**可不持久化**或持久化均可，推荐持久化 |
| `lightHelpersVisible` | `boolean` | `true` | 调试 helper 总开关（出货可 false） |
| `lightOrbitMode` | `boolean` | `false` | 摆灯自由视角 |
| `lightMaxCount` | `number` | `15` | 硬顶（共识 8–15） |
| `shadowMapEnabled` | `boolean` | `true` | `renderer.shadowMap.enabled` |
| `shadowMapSize` | `number` | `2048` | 与官方 webgpu_shadowmap 示例一致量级 |
| `shadowCameraExtent` | `number` | `20` | 方向光 shadow.camera left/right/top/bottom = ±extent |
| `shadowCameraNear` | `number` | `0.5` | |
| `shadowCameraFar` | `number` | `80` | |
| `shadowBias` | `number` | `-0.0001` | 防条纹；可面板微调 |
| `shadowNormalBias` | `number` | `0.02` | |
| `shadowRadius` | `number` | `2` | PCF 软边（若类型支持） |

### 3.5 默认 `lights`（必须从**当前** `createDefaultSimConfig` 数值迁移，禁止另编灯位）

依据：现 `constants.ts` 默认值 + `LightRig.createLightRig`。

| id | name | type | enabled | color | intensity | position | target | 其它 |
|----|------|------|---------|-------|-----------|----------|--------|------|
| `ambient` | 环境光 | ambient | true | `0xffffff` | `0.3` | (0,0,0) | (0,0,0) | |
| `hemi` | 半球光 | hemisphere | true | sky `0xe8eaee` | `0.5` | (0,0,0) | (0,0,0) | `groundColor: 0x8a8680` |
| `key` | 主光 | directional | true | `0xf4f2ee` | `1.05` | (0, 16, 4) | (0, 0, 0) | **`castShadow: true`**（新系统打开阴影时） |
| `fill` | 补光 | directional | true | `0xaaccff` | `0` | (-9, 5, -3) | (0, 0, 0) | castShadow false |
| `rim` | 轮廓光 | directional | true | `0xffffff` | `0.32` | (0, 8, -10) | (0, 0, 0) | castShadow false |

说明：旧代码 `castShadow=false`；新系统按共识开启**单主光阴影**，故 key 的 `castShadow=true`，同时 `renderer.shadowMap.enabled=true`。观感「接近」指颜色/强度/位置一致；阴影是共识新增能力。

### 3.6 新建灯默认值（点「添加」时）

| type | intensity | position | 类型默认 |
|------|-----------|----------|----------|
| directional | 1.0 | (0, 12, 6) | target (0,0,0), castShadow false |
| point | 2.0 | (0, 2, 2) | distance 0, decay 2（[PointLight 文档](https://threejs.org/docs/#api/en/lights/PointLight)） |
| spot | 2.0 | (0, 8, 4) | target (0,0,0), angle `Math.PI/6`, penumbra 0.2, distance 0, decay 2 |
| ambient | 0.2 | — | 若已存在 ambient，面板 **禁止再添加** 或添加后警告（推荐：同 type ambient/hemi **最多各 1**） |
| hemisphere | 0.3 | — | groundColor `0x444444`；最多 1 |

### 3.7 数量规则（硬逻辑）

```
assert(lights.filter(l => l.enabled).length <= lightMaxCount) // 默认 15
assert(lights.filter(l => l.type==='directional' && l.castShadow && l.enabled).length <= 1)
assert(lights.filter(l => l.type==='ambient').length <= 1)
assert(lights.filter(l => l.type==='hemisphere').length <= 1)
```

`DynamicLighting` 构造参数必须 ≥ 可能用到的批次数（见 §5.1）。

---

## 4. 分步执行（严格顺序）

### S1 — 类型与工厂默认 + 迁移

**改文件**

- `app/src/config/lightTypes.ts`（**新建**）：`LightType`, `LightDesc`, `createDefaultLights()`, `migrateFlatLightsToList(parsed)`  
- `app/src/config/constants.ts`：`MutableSimConfig` 换字段；`createDefaultSimConfig` 用 `createDefaultLights()`  
- `app/src/config/persist.ts`：在 `loadSavedConfig` / shipping 应用前调用 `migrateFlatLightsToList`  
- `app/src/config/store.ts`：`mergeConfig` **增加** `lights` 数组深度合并（见下）

**`migrateFlatLightsToList` 规则（必须实现）**

1. 若 `parsed.lights` 是数组且元素含 `id`+`type` → 校验后使用（缺字段用默认补齐）。  
2. 否则若存在任一旧键 `lightKeyIntensity` 等 → 用旧键填 §3.5 表。  
3. 否则 → `createDefaultLights()`。  
4. 删除返回对象上的旧扁平灯键（避免以后误读）。

**`mergeConfig` 对 `lights`（必须）**

```ts
if (key === 'lights' && Array.isArray(value)) {
  // 整表替换（与 dashDx 数组策略一致：incoming 有则替换）
  out.lights = value.map(normalizeLightDesc);
  continue;
}
```

`normalizeLightDesc`：保证 number/boolean 有限、type 枚举合法、补默认。

**测试**

- `app/tests/config/lightsMigrate.test.ts`：扁平 → 列表；已有列表不丢；默认 key 位置 (0,16,4)。

**依据**：本仓库 `migrateSavedCameraFollow` 模式；`mergeConfig` 对数组的既有处理。

---

### S2 — 重写 `LightRig` → 列表同步运行时

**改文件**：`app/src/render/LightRig.ts`（可整文件重写；允许拆 `LightEditor.ts` 但须本方案点名）

**导出 API（固定名称，便于 main 接入）**

```ts
export type LightRuntime = {
  descId: string;
  light: THREE.Light;
  helper: THREE.Object3D | null;
};

export type LightRig = {
  group: THREE.Group;           // 所有 light 的父节点，scene.add(group)
  helperGroup: THREE.Group;     // helpers 父节点
  runtimes: Map<string, LightRuntime>;
};

export function createLightRig(THREE, scene): LightRig;
/** 以 CONFIG.lights 为权威，增删改 Three 对象 */
export function syncLightsFromConfig(THREE, scene, rig, cfg: MutableSimConfig): void;
/** fog + background */
export function applyEnvironment(THREE, scene, cfg): void;
/** 每帧：helper.update、shadow camera 跟主光 */
export function updateLightHelpers(rig): void;
export function disposeLightRig(scene, rig): void;
```

**`syncLightsFromConfig` 算法（必须按此写）**

1. 读 `cfg.lights`，规范化。  
2. 执行 §3.7 约束：若多盏 `castShadow`，只保留**列表中第一个** directional 的 true，其它强制 false（写回 `cfg.lights` 或仅运行时强制——推荐**写回**以免面板撒谎）。  
3. `desiredIds = set(lights.map(id))`。  
4. 对 `rig.runtimes` 中不在 desired 的 id：`scene`/`group` remove light+target+helper，dispose helper geometry/material，delete map。  
5. 对每个 `LightDesc`：  
   - 若无 runtime 或 `runtime.light` 的 type 与 desc 不符 → 销毁重建。  
   - 否则更新属性。  
6. **按 type 映射 three API**（禁止用错类）：

| type | 构造 | 属性写入 |
|------|------|----------|
| ambient | `new THREE.AmbientLight(color, intensity)` | color, intensity, visible=enabled |
| hemisphere | `new THREE.HemisphereLight(sky, ground, intensity)` | color=sky, groundColor, intensity |
| directional | `new THREE.DirectionalLight(color, intensity)` | position；`target.position`；**`group.add(light)` 且 `group.add(light.target)`**（[文档强制](https://threejs.org/docs/#api/en/lights/DirectionalLight.target)）；`castShadow` 仅当 desc.castShadow && enabled |
| point | `new THREE.PointLight(color, intensity, distance, decay)` | position, distance, decay |
| spot | `new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay)` | position, target 入场景, angle, penumbra |

7. Helper（当 `cfg.lightHelpersVisible`）：  

| type | Helper 类 | size 建议 |
|------|-----------|----------|
| directional | `DirectionalLightHelper(light, 2)` | 改后 `helper.update()` |
| point | `PointLightHelper(light, 0.5)` | |
| spot | `SpotLightHelper(light)` | 每帧 `update()` |
| hemisphere | `HemisphereLightHelper(light, 2)` | |
| ambient | **无 helper**（无位置） | helper=null |

8. `light.userData.lightId = desc.id` 供拾取（若做点击选中）。

**禁止**：每帧 `new Light` 无差分（会炸 WebGPU）；必须 id 差分 sync。

**依据**：three 灯光类文档；调查笔记 §5；现 `LightRig` 结构。

---

### S3 — `main.ts`：DynamicLighting + 阴影 + 同步点

**改 `app/src/main.ts`**

1. 在 `await renderer.init()` 之后立刻：

```ts
import { DynamicLighting } from 'three/addons/lighting/DynamicLighting.js';

renderer.lighting = new DynamicLighting({
  maxDirectionalLights: 12,
  maxPointLights: 12,
  maxSpotLights: 8,
  maxHemisphereLights: 2,
});
// 依据：DynamicLighting.js JSDoc 默认 maxDirectionalLights=8 等；
// 共识 15 盏混合类型，放宽 directional/point 上限避免触顶。

renderer.shadowMap.enabled = cfg.shadowMapEnabled;
// 依据：webgpu_shadowmap.html: renderer.shadowMap.enabled = true
```

2. 用 `createLightRig` + `syncLightsFromConfig` + `applyEnvironment` 替换旧 `createLightRig`/`applyLightConfig`。

3. **配置变更**：`setupControlPanel` `onChange`：  
   - 若 key 为 `lights` / `light*` / `fog*` / `bgColor` / `shadow*` / `*` → `syncLightsFromConfig` + `applyEnvironment` + 更新 shadowMap 开关。  
   - **禁止**无条件每帧全量 destroy/recreate。

4. **每帧**：  
   - 删除「每帧 `applyLightConfig` 全量写」；改为：  
     - `updateLightHelpers(rig)`  
     - 若 `lightOrbitMode`：`orbitControls.update()` 且 **跳过** `cameraRig.update` / `applyFightCamera`  
     - 否则：现有 `CameraRig` 对打镜头逻辑不变  

5. 阴影相关 mesh（见 S4）。

**WebGPU 动态灯依据**

- 包内 example 模式：`renderer.lighting = new DynamicLighting()` 后 `scene.add`/`remove` PointLight（[webgpu_lights_dynamic.html](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_lights_dynamic.html)）。  
- 历史坑：r171 时代 [Discourse #74708](https://discourse.threejs.org/t/webgpu-lighting-issue-unable-to-dynamically-add-or-remove-lights/74708) 动态加删无效；r185 应用 **DynamicLighting** 而非裸加删。  
- **回退策略（必须实现）**：若运行时检测加灯后画面光照数不变（可用手动测试；代码侧提供 `cfg.lightUseDynamicLighting` 默认 true，false 时改用 **对象池**：启动时预创建 max 个各类型 light，增删只改 `visible`/intensity，**不** remove）。对象池是 fallback，主路径是 DynamicLighting。

---

### S4 — 阴影接收 / 投射网格

**依据**：官方 shadow 三条件——renderer.shadowMap、light.castShadow、mesh cast/receive（[sbcode directional shadow](https://sbcode.net/threejs/directional-light-shadow/)、webgpu_shadowmap.html）。

| 对象 | 动作 | 文件 |
|------|------|------|
| 垫底 `ground` | 已有 `receiveShadow=true`；保持 | `main.ts` |
| 角色网格 | `sanitizeObjectMaterials` 内 **`mesh.castShadow = true`**（可见 mesh）；`receiveShadow = true` | `materialUtils.ts`（现为 false，**必须改**） |
| 训练场 glb | `StageView.load` 在 `sanitizeObjectMaterials` 后 `model.traverse`：`isMesh` → `receiveShadow=true`；大体块可 `castShadow=true`（地面大平面至少 receive） | `StageView.ts` |
| 主方向光 shadow camera | 从 `cfg.shadowCameraExtent/Near/Far/Bias` 写入 `light.shadow` | `syncLightsFromConfig` |

**方向光阴影相机**（抄 webgpu_shadowmap.html 结构，数值用 cfg）：

```ts
light.shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
light.shadow.camera.near = cfg.shadowCameraNear;
light.shadow.camera.far = cfg.shadowCameraFar;
const e = cfg.shadowCameraExtent;
light.shadow.camera.left = -e;
light.shadow.camera.right = e;
light.shadow.camera.top = e;
light.shadow.camera.bottom = -e;
light.shadow.bias = cfg.shadowBias;
light.shadow.normalBias = cfg.shadowNormalBias;
light.shadow.radius = cfg.shadowRadius;
light.shadow.camera.updateProjectionMatrix();
```

**陷阱**：shadow camera 太小会裁切（[Discourse 阴影被裁](https://discourse.threejs.org/t/directional-light-not-showing-shadows/6541)）→ extent 默认 20 覆盖训练场；不对再调面板。

---

### S5 — TransformControls + 选中

**新建** `app/src/render/LightEditControls.ts`（或并入 LightRig）

```ts
import { TransformControls } from 'three/addons/controls/TransformControls.js';
```

**必须行为**

1. `const tc = new TransformControls(camera, renderer.domElement)`；`scene.add(tc.getHelper())`（r185 API：`getHelper()`，见 TransformControls.js JSDoc）。  
2. `tc.setMode('translate')` 默认。  
3. 选中灯：  
   - ambient：detach，面板 only。  
   - point / directional / spot：`tc.attach(light)`。  
   - 额外模式或按钮「调目标」：`tc.attach(light.target)`（directional/spot）。  
4. `tc.addEventListener('objectChange', () => { 写回 CONFIG.lights 对应 position 或 target；mark dirty; helper.update() })`。  
5. `tc.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value })`——与 Orbit 冲突时的**标准**写法（OrbitControls + TransformControls 官方/社区惯用）。  
6. `lightHelpersVisible===false` 时 detach 并隐藏 helperGroup。

**禁止**自己写 gizmo 射线拖拽。

**依据**：TransformControls 源码；Discourse 方向光 helper 控制帖。

---

### S6 — 摆灯自由视角 `lightOrbitMode`

**改 `main.ts`**

```ts
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled = false;
orbit.enableDamping = true;
orbit.target.set(0, cfg.cameraLookY, 0);
```

- `cfg.lightOrbitMode === true`：`orbit.enabled=true`；**不**调用 `cameraRig.update` / `applyFightCamera`。  
- `false`：`orbit.enabled=false`；恢复 CameraRig（对打镜头）。  
- 进入摆灯模式时：把 `orbit.target` 设为当前对打 look 点，把 `camera.position` 设为当前 pose，避免跳变。  
- 退出：不强制写回 camera 配置字段（下一帧 CameraRig 覆盖即可）。

**面板**：`lightOrbitMode` 开关，中文名 **「摆灯自由视角」**。

**依据**：共识 §2.4；OrbitControls 官方 addon。

---

### S7 — ControlPanel「打光」完整 UI（必须公开参数表）

**改 `app/src/debug/ControlPanel.ts`**：替换现「打光」section 内容。

#### 7.1 全局区（始终显示）

| 面板标签 | CONFIG 路径 | 控件 | 范围/步进 |
|----------|-------------|------|-----------|
| 显示灯光辅助 | `lightHelpersVisible` | toggle | |
| 摆灯自由视角 | `lightOrbitMode` | toggle | |
| 启用阴影总开关 | `shadowMapEnabled` | toggle | |
| 阴影贴图边长 | `shadowMapSize` | number | 256–4096，step 256 |
| 阴影范围 extent | `shadowCameraExtent` | number | 5–80，0.5 |
| 阴影近裁 | `shadowCameraNear` | number | 0.01–10 |
| 阴影远裁 | `shadowCameraFar` | number | 10–200 |
| 阴影 bias | `shadowBias` | number | -0.01–0.01，0.0001 |
| 阴影 normalBias | `shadowNormalBias` | number | 0–0.2，0.001 |
| 阴影 radius | `shadowRadius` | number | 0–8，0.1 |
| 背景色 | `bgColor` | number 或 color（现面板若无 color 控件则用 hex number 输入） | |
| 雾色 | `fogColor` | 同上 | |
| 雾近 | `fogNear` | number | 1–200 |
| 雾远 | `fogFar` | number | 10–400 |
| 灯数量上限 | `lightMaxCount` | number | 5–15（硬顶 15） |

#### 7.2 列表区

- `<select id="sel-lightList">`：选项 `name (type)`，value=`id`。  
- 按钮：**添加方向光 / 添加点光 / 添加聚光**（环境/半球若已存在则 disable）。  
- 按钮：**删除选中**（禁止删到 0 盏时不留任何光——至少保留 1 ambient 或自动补 ambient）。  
- 按钮：**复制选中**。  
- 选中变化 → `lightSelectedId` + `TransformControls.attach`。

#### 7.3 选中灯属性区（随 type 显示）

| 面板标签 | 字段 | 适用 type | 范围 |
|----------|------|-----------|------|
| 名称 | `name` | all | text |
| 启用 | `enabled` | all | toggle |
| 颜色 | `color` | all | hex number |
| 强度 | `intensity` | all | 0–20，0.05 |
| 位置 X/Y/Z | `position.*` | 非 ambient | -40–40 |
| 目标 X/Y/Z | `target.*` | directional, spot, hemisphere(可选) | -40–40 |
| 地面色 | `groundColor` | hemisphere | hex |
| 距离 distance | `distance` | point, spot | 0–100（0=无限） |
| 衰减 decay | `decay` | point, spot | 0–3 |
| 锥角 angle | `angle` | spot | 0–1.5 rad |
| 半影 penumbra | `penumbra` | spot | 0–1 |
| 投射阴影 | `castShadow` | **仅 directional** | toggle；开启时清除其它灯 castShadow |

**绑定实现注意**

- 改列表项字段时直接改 `CONFIG.lights[i]` 并 `onChange('lights')`。  
- 现有 `NUMBER_BINDS` 扁平表**删除**旧 lightKey* 绑定；新增动态绑定或专用 bind 函数。  
- `PURE_VIEW_KEYS` 加入 `lights`、`lightHelpersVisible`、`lightOrbitMode`、`shadow*`、`fog*`、`bgColor`。

#### 7.4 DebugGui 同步

**改 `app/src/debug/DebugGui.ts`「打光」folder**：与上表同字段（lil-gui `addColor` 可用于 color）；列表可用 dropdown + 刷新 folder（允许简单实现：只编辑 `lightSelectedId` 对应灯 + 全局项）。

---

### S8 — shipping / 本地预设

**改**

- `app/public/presets/shipping.json`：删除旧扁平灯键；写入 `lights: [ §3.5 五灯 ]` + 新 shadow/debug 默认。  
- `saveCurrentConfig` 已 `cloneConfig(CONFIG)`，确认 `lights` 被 structuredClone。  
- 本地旧档：靠 `migrateFlatLightsToList`。

---

### S9 — 单元测试（AI 必须跑）

| 文件 | 断言 |
|------|------|
| `app/tests/config/lightsMigrate.test.ts` | 扁平迁移；双 castShadow 规范化只留一 |
| `app/tests/render/lightRigSync.test.ts` | 纯函数级：normalize、shadow exclusive、max count clamp（若 put 纯逻辑于 `lightTypes.ts`） |

```bash
cd app && npx vitest run tests/config/lightsMigrate.test.ts tests/render/lightRigSync.test.ts
```

Three/WebGPU 渲染测试不强制；浏览器验收见 §11。

---

### S10 — 对照清单（人做，AI 只准备）

更新或新建：`docs/research/lighting-review-checklist.md`

- 三站位 × 明暗方向 / 过曝死黑 / 阴影是否合理。  
- 每格默认「未对照」。AI **不得**填已通过。

---

## 5. DynamicLighting 参数选择依据

摘自本机 `DynamicLighting.js`：

```js
// options.maxDirectionalLights 默认 8
// options.maxPointLights 默认 16
// options.maxSpotLights 默认 16
// options.maxHemisphereLights 默认 4
```

本方案采用 `{ 12, 12, 8, 2 }`：满足「最多约 15 盏」且以方向/点光为主；**禁止**把 max 开到 64（训练场无必要，增 GPU 负担）。

Ambient **不在** DynamicLighting 批次数里（由标准 lighting 路径处理）——仍可 `scene.add(AmbientLight)`，与官方 dynamic 示例保留 AmbientLight 一致。

---

## 6. 文件改动清单（只许这些 + 测试 + 清单文档）

| 文件 | 动作 |
|------|------|
| `app/src/config/lightTypes.ts` | **新建** |
| `app/src/config/constants.ts` | 字段替换 + 默认 |
| `app/src/config/store.ts` | merge `lights` |
| `app/src/config/persist.ts` | migrate 接入 |
| `app/src/config/types.ts` | 若 Runtime 需声明 lights（已由 MutableSimConfig 带） |
| `app/src/render/LightRig.ts` | **重写** |
| `app/src/render/LightEditControls.ts` | **新建**（TransformControls 封装） |
| `app/src/render/materialUtils.ts` | castShadow true |
| `app/src/render/StageView.ts` | receiveShadow traverse |
| `app/src/main.ts` | DynamicLighting、shadow、orbit、sync |
| `app/src/debug/ControlPanel.ts` | 打光 UI |
| `app/src/debug/DebugGui.ts` | 打光 UI |
| `app/public/presets/shipping.json` | lights 数组 |
| `app/tests/config/lightsMigrate.test.ts` | **新建** |
| `app/tests/render/lightRigSync.test.ts` | **新建** |
| `docs/research/lighting-review-checklist.md` | **新建**空对照表 |

**不要改**：战斗逻辑、`CameraRig` 公式（仅 main 分支调用）、共识正文（除非用户要求）。

---

## 7. 执行顺序检查表（AI 打勾）

1. [ ] S1 数据模型 + migrate + merge + 测试绿  
2. [ ] S2 LightRig sync  
3. [ ] S3 main DynamicLighting + env + 去掉每帧全量 apply  
4. [ ] S4 阴影 mesh + shadow camera  
5. [ ] S5 TransformControls  
6. [ ] S6 Orbit 摆灯模式  
7. [ ] S7 面板参数全表  
8. [ ] S8 shipping  
9. [ ] S9 测试  
10. [ ] S10 空对照表  
11. [ ] §11 浏览器自检（工具能力）  

---

## 8. 浏览器自检（工具能力；AI 可做则做）

1. 开打光：列表见 ambient/hemi/key/fill/rim。  
2. 改 key 强度 → 人亮暗立刻变。  
3. 添加点光 → 场景出现 helper 球/图标；拖 TransformControls → position 与面板同步。  
4. 开「投射阴影」仅 key → 地面/人有影；给 fill 开阴影 → fill 被关掉或 key 被抢唯一（符合 exclusive）。  
5. 开摆灯自由视角 → 可绕场；关 → 回对打跟镜。  
6. 关 `lightHelpersVisible` → helper 与 gizmo 消失，光仍在。  
7. 保存本地 / 刷新 → lights 恢复。  
8. `npx vitest run` 相关测试通过。  

**观感「像原作」**：人填对照表；AI 不勾已复刻。

---

## 9. 坑与技术陷阱（检索结论 → 方案已吸收）

| 坑 | 来源 | 方案对策 |
|----|------|----------|
| WebGPU 动态加删灯画面不更新 | [Discourse #74708](https://discourse.threejs.org/t/webgpu-lighting-issue-unable-to-dynamically-add-or-remove-lights/74708)（r171） | 使用 r185 **`DynamicLighting`**（[官方 example](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_lights_dynamic.html)）；失败则对象池 fallback |
| 加灯触发全材质 recompile / 卡顿 | [Discourse 多灯帧率](https://discourse.threejs.org/t/light-and-framerate/61876)；Utsubo tips | DynamicLighting 批处理；硬顶 15 |
| DirectionalLight.target 不进场景方向不对 | [docs target](https://threejs.org/docs/#api/en/lights/DirectionalLight.target) | sync 时必须 add target |
| Helper 不更新 | [DirectionalLightHelper docs](https://threejs.org/docs/#api/en/helpers/DirectionalLightHelper) | 每帧 `helper.update()` |
| 阴影全无 | mesh `castShadow=false`（本仓库 materialUtils） | S4 改 true |
| 阴影被裁切 | [Discourse 阴影 frustum](https://discourse.threejs.org/t/directional-light-not-showing-shadows/6541) | `shadowCameraExtent` 可调 |
| 多灯光阴影极卡 | 共识 + PointLight shadow 成本高 | **禁止**非主方向光 castShadow |
| TransformControls 与 Orbit 抢指针 | 社区标准 `dragging-changed` | S5 禁用 orbit 于拖拽中 |
| Orbit 与对打相机抢 | 共识摆灯模式 | `lightOrbitMode` 互斥 CameraRig |
| `mergeConfig` 丢数组 | 本仓库 store.ts | S1 显式 merge lights |
| r185 selective example 注释 scene light change unavailable | [webgpu_lights_selective.html](https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_lights_selective.html) TODO | 不依赖 selective lightsNode；用场景灯 + DynamicLighting |
| 每帧 applyLightConfig | 现 main.ts | 改为脏更新 / 仅 helper 每帧 |

---

## 10. 明确不做（执行时做了算出错）

- lightmatch 自动拟合（共识延后）。  
- 多灯阴影、点光阴影。  
- 撤销栈 / 完整场景树编辑器。  
- 升级 three 到 dev 最新（**除非** DynamicLighting 在 0.185.1 运行失败；当前包内**已有**该文件，先不升级）。  
- 把雾/背景拆出共识外的新分类（可留在打光全局区）。  

---

## 11. 验收命令

```bash
cd app
npx vitest run tests/config/lightsMigrate.test.ts tests/render/lightRigSync.test.ts
npx tsc --noEmit
# 开发服务器人工：§8 浏览器自检
npm run dev
```

---

## 12. 参考链接汇总（执行时打开核对）

| 链接 | 用途 |
|------|------|
| `docs/consensus-lighting-v0.md` | 共识 |
| `docs/research/lighting-system-research-2026-08-17.md` | 案例调查 |
| https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_shadowmap.html | 阴影 |
| https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_lights_dynamic.html | DynamicLighting |
| `node_modules/three/examples/jsm/lighting/DynamicLighting.js` | API 默认 max* |
| `node_modules/three/examples/jsm/controls/TransformControls.js` | attach/getHelper |
| `node_modules/three/examples/jsm/controls/OrbitControls.js` | 摆灯 |
| https://threejs.org/docs/#api/en/lights/DirectionalLight.target | target 入场景 |
| https://threejs.org/docs/#api/en/helpers/DirectionalLightHelper | helper.update |
| https://discourse.threejs.org/t/webgpu-lighting-issue-unable-to-dynamically-add-or-remove-lights/74708 | WebGPU 坑 |
| https://discourse.threejs.org/t/how-to-control-directional-light-helper-with-transform-controls/17339 | gizmo+helper |
| https://threejs.org/editor/ | UX 参考 |
| https://github.com/srdz-af/nd-viewer | Lights Tab 参考 |
| https://threepipe.org/plugin/Object3DWidgetsPlugin.html | helper 生命周期参考 |

---

## 13. 给执行 AI 的最终指令（复制即可开工）

1. 只实现本文件 §4 S1–S10 与 §6 文件列表。  
2. 每步 API 必须来自 §0.3 表，禁止自造灯光引擎。  
3. 默认灯参数必须来自 §3.5（旧 constants），禁止重随机位。  
4. 面板参数必须覆盖 §7 全表。  
5. 跑通 §11 测试；浏览器完成 §8 工具自检。  
6. 不得宣称观感已复刻；只交工具能力完成说明。  

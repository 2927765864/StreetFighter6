# AI 执行方案：打击特效图形化编辑器 UI v0

> **状态**：可执行（2026-08-26）  
> **需求**：`docs/hit-vfx-editor-ui-requirements-v0.md`  
> **调研**：`docs/research/hit-vfx-editor-ui-research-2026-08-26.md`（检索节点 2026-08-26T05:48:27Z）  
> **上位共识**：`docs/hit-vfx-consensus-v0.md`（执行前须回写：编辑页三层树能力；**火花光照不再作为可新建独立元素**，亮度进火花参数）  
> **约束（写进即全做）**：禁止 AI 自行发明未列参数/未列依赖；禁止换成 React/R3F 整页；禁止用 quarks/nebula/plume-editor **替换**本仓库 `HitVfxRuntime` 主路径；预览必须接现有运行时。

---

## 0. 目标与非目标

### 0.1 目标（验收口径）

独立页 `/hit-vfx.html` 成为**中文、三栏、专业观感**的特效编辑器：

1. 左：配方 → 分组 → 元素 树；可新建/重命名/删除（确认）/复制粘贴（配方与元素）/拖元素换组/分组总开关。  
2. 中：现有 3D 预览 + 重放/步进/时间倍率/锁种子/高度/力度/路径。  
3. 右：随选中切换的检查器（配方 / 分组 / 元素专属参数）。  
4. 元素可存预设、从预设新建/插入任意组。  
5. 正式保存写入**项目配置路径**（见 PR-E）：导出/落盘 shipping 预设，不只 localStorage。  
6. 旧 `sparkLight` 元素自动并入火花参数；树上不可见、不可新建。

### 0.2 非目标

- 不换粒子引擎；不引入 React/Vue/jQuery。  
- 不分组复制粘贴；不做撤销栈。  
- 不新建独立 `sparkLight` 元素类型入口。  
- 不做音效/震屏/闪白。

### 0.3 布局理论依据（禁止改成单侧栏堆控件）

| 依据 | 链接 | 采用什么 |
|------|------|----------|
| libGDX Particle Editor 三区 | https://github.com/libgdx/gdx-particle-editor/wiki/In‐Depth-Guide | Preview / Emitter 列表 / Properties |
| Skylicht 层级 | https://deepwiki.com/skylicht-lab/skylicht-engine/5.4-physics-and-collision | System→Group→Emitter ↔ 配方→分组→元素 |
| three-particles-editor | https://github.com/NewKrok/three-particles-editor | Unity 风格实时预览 + 参数 |
| three.quarks-editor | https://github.com/Alchemist0823/three.quarks-editor | 可视化 + JSON |
| Photon2 分区哲学 | https://low-drag-mc.github.io/LowDragMC-Doc/en/photon2/ | Hierarchy + Scene + Inspector 同屏 |

**固定 DOM 骨架（实现必须遵守）：**

```
#hvfx-app
  header#hvfx-topbar          （存档、实战选用、预设库、回训练场）
  .hvfx-main
    aside#hvfx-tree-pane      （左，宽 280–320px）
    main#hvfx-viewport-pane   （中，canvas 已有，工具条叠顶）
    aside#hvfx-inspector-pane （右，宽 320–360px）
```

---

## 1. 技术栈与允许参考的源码（只许对照实现，不许整包嵌入编辑器）

| 用途 | 仓库 / 文件 | 用法 |
|------|-------------|------|
| 运行时（已有） | `app/src/render/hitVfx/HitVfxRuntime.ts` 等 | 继续驱动预览 |
| 配置存档（已有） | `app/src/config/persist.ts`：`saveCurrentConfig`、`exportShippingJson` | 扩展「正式保存」流程 |
| 类型（已有） | `app/src/render/hitVfx/hitVfxTypes.ts` | 扩展 groups / spark.light / presets |
| 树 DnD 规则 | https://github.com/sparklinlabs/dnd-tree-view | 对照 `item`/`group`、cancellable drop；**自研实现** |
| 树 API 形状 | https://github.com/finom/vanillatree `move(id,parentId)` | 对照 API，不强制 npm 依赖 |
| 可选 npm（仅当自研树超工期） | `sortable-tree` https://github.com/marcantondahmen/sortable-tree | 仅允许这一款无 React 树；默认不装 |
| 剪贴板 ID 重映射 | https://tldraw.dev/sdk-features/clipboard ；Excalidraw `clipboard.ts` | 自研 `HitVfxClipboard.ts` |
| MIME/双写 | https://alexharri.com/blog/clipboard | `text/plain` JSON 兜底 + 内存剪贴板 |
| 旧配置迁移 UX | three-particles-editor CHANGELOG「legacy configuration detection」 | 迁移静默成功；失败时面板闪提示 |
| 热更新节流 | three-particles-editor「live updateConfig / throttle recreate」 | 参数改：invalidate；结构改：rebuild |

**禁止新增依赖：** React、jQuery、Fancytree、three.quarks 作为 runtime。  
**已有依赖保持：** `three`、`three-plume`（运行时已用则继续，本方案不新接 plume 节点编辑器）。

---

## 2. 数据模型变更（必须先做，有单测）

### 2.1 分组实体

在 `HitVfxRecipe` 增加：

```ts
export type HitVfxGroup = {
  id: string;
  name: string;
  enabled: boolean; // 整组开关；false 时组内元素运行时全跳过
};

export type HitVfxRecipe = {
  id: string;
  name: string;
  kind: HitVfxRecipeKind;
  groups: HitVfxGroup[];      // NEW
  elements: HitVfxElement[];
  strengthScale: Record<HitVfxStrength, HitVfxStrengthScale>;
};
```

**规范化规则（写进 `normalizeHitVfxRecipe`）：**

1. 若缺 `groups`：从元素 `groupId` 收集唯一 id，生成 `{ id, name: id === 'main' ? '主组' : id, enabled: true }`。  
2. 每个元素的 `groupId` 必须落在某组；否则改挂到第一组。  
3. 删除组时（UI 层）同时删 `elements` 中同 `groupId` 项。

**运行时：** `HitVfxRuntime` 触发元素前：若 `groups.find(g => g.id === el.groupId)?.enabled === false` 则跳过（与 `el.enabled` 且关系）。

### 2.2 火花内嵌光照（合并 sparkLight）

扩展 `SparkParams`：

```ts
export type SparkLightEmbed = {
  enabled: boolean;
  color: number;
  intensity: number;
  distance: number;
  decay: number;
  lifetimeSec: number;
  intensityEnd: number;
  castOnCharacter: boolean;
  castOnVfxElements: boolean;
};

export type SparkParams = {
  // 保留现有全部字段…
  light: SparkLightEmbed; // NEW
};
```

**迁移函数** `migrateSparkLightIntoSparks(recipe): HitVfxRecipe`（纯函数，单测）：

1. 找出所有 `type === 'sparkLight'` 元素。  
2. 对每个光：优先并入**同 `groupId` 的第一个 spark**；若无 spark，则新建一个最小 spark 承载 light 后删除光。  
3. 映射字段 1:1：`SparkLightParams` → `spark.params.light`，并设 `light.enabled = true`。  
4. 从 `elements` 移除全部 `sparkLight`。  
5. `normalizeHitVfxRecipe` **入口必调**迁移，保证加载 shipping/本地后树上无光元素。

**运行时改法（禁止另起炉灶）：**  
改 `HitVfxRuntime.ts` 中现有 `findSparkLight(recipe.elements)`：改为  
`findEmbeddedSparkLight(elements)` = 第一个 `type==='spark' && params.light.enabled` 的 `params.light`。  
点光池 API（`HitVfxPointLightPool`）调用参数保持与现 `SparkLightParams` 字段同名，直接传入 embed。

**类型清理：** `HitVfxElementType` 可暂时保留 `'sparkLight'` 仅用于迁移识别；**新建 UI 枚举不得包含它**。序列化写出时不应再写出独立 sparkLight（迁移后）。

### 2.3 元素预设

在 `RuntimeConfig` / `constants.ts` 增加：

```ts
hitVfxElementPresets: HitVfxElementPreset[];

export type HitVfxElementPreset = {
  id: string;
  name: string;
  // 不含 recipe 级字段；是可落地的元素模板（含 type/params；groupId 插入时覆盖）
  template: Omit<HitVfxElement, 'id' | 'groupId'> & { groupId?: string };
};
```

`normalize` / `applyConfig` 必须识别该数组（仿 `hitVfxRecipes` 分支，见 `app/src/config/store.ts`）。

### 2.4 剪贴板载荷

新建 `app/src/hitVfxEditor/HitVfxClipboard.ts`：

```ts
type ClipboardPayload =
  | { v: 1; kind: 'recipe'; recipe: HitVfxRecipe }
  | { v: 1; kind: 'element'; element: HitVfxElement };
```

- `copyRecipe` / `copyElement`：`structuredClone` + 写入模块内 `memoryClipboard`；并尝试 `navigator.clipboard.writeText(JSON.stringify(payload))`（text/plain，依据 alexharri）。  
- `paste`：优先 memory；否则 `readText` 解析 JSON；校验 `v===1`。  
- **粘贴时必须** `regenIds(payload)`：新 `recipe.id`、所有 `group.id`、所有 `element.id`，并重写 element.groupId 映射表（依据 tldraw remap）。  
- 粘贴元素：落入**当前选中分组**；若选中的是元素，落入该元素所在组。

---

## 3. PR 拆分（按序；可串行；标 ★ 可与前一 PR 测完再开）

### PR-A · 数据模型 + 迁移 + 运行时读 embed light

| 项 | 内容 |
|----|------|
| 改文件 | `hitVfxTypes.ts`、`hitVfxDefaults.ts`、`HitVfxRuntime.ts`（find light）、`store.ts`/`constants.ts`/`defaults` 若需、`app/tests/render/hitVfx/*` |
| 方法 | `normalizeHitVfxRecipe`、`migrateSparkLightIntoSparks`、`defaultSparkLightEmbed()`、默认配方里 spark 带 `light`，**删除**默认里独立 sparkLight 行 |
| 测试 | ① 含 sparkLight 的旧 JSON → 无 sparkLight、spark.light 字段正确；② 组 enabled=false 不触发；③ 默认两种 recipe 仍可 `trigger` |
| 依据 | 需求 §5.2；调研 §6 旧配置迁移；现 Runtime 点光路径 |

### PR-B · 剪贴板与配方/元素 CRUD 纯函数

| 项 | 内容 |
|----|------|
| 新文件 | `app/src/hitVfxEditor/hitVfxRecipeOps.ts`、`HitVfxClipboard.ts` |
| 必须导出 | `createEmptyRecipe(kind)`、`duplicateRecipe(r)`、`renameRecipe`、`deleteRecipe(list,id)`（禁止删光最后一条时返回错误）、`createGroup`、`renameGroup`、`deleteGroup`（删元素）、`setGroupEnabled`、`moveElementToGroup`、`createElement(type, groupId)`（仅 `spark\|sparkDebris\|dust\|sweat`）、`duplicateElement`、`deleteElement`、`elementFromPreset`、`saveElementAsPreset` |
| ID | 用 `crypto.randomUUID()` 或现有项目 id 工具（若有则复用，禁止自造碰撞格式） |
| 测试 | vitest：复制后 id 全不同；move 只改 groupId；删除组清元素 |

### PR-C · 三栏壳 + 树 + 检查器接线（主 UI）

| 项 | 内容 |
|----|------|
| 重写 | `HitVfxEditorPanel.ts` + `hit-vfx-editor.css`（可拆 `HitVfxTreePane.ts`、`HitVfxInspectorPane.ts`、`HitVfxTopBar.ts`） |
| 树行为 | 点击选中；双击或「重命名」按钮内联 input；拖**元素**到**分组行**→`moveElementToGroup`；不可拖配方；不可把组拖进元素（调研 SO child-target 坑：drop 用 `closest`） |
| 确认框 | `window.confirm` 中文文案：「确定删除配方/分组/元素「名」？不可恢复。」（需求：要确认、无撤销） |
| 工具条按钮（中文） | 新建配方、复制配方、粘贴、删除；新建分组；新建元素（下拉四类型）；存为预设；从预设插入 |
| 中栏 | 保留现有 hooks：`replay` / `stepFrame` / timescale / pause / seed lock / kind/height/strength / dummy / debug / follow hitstop |
| 右栏 | 见 §4 参数表，按选中 kind 渲染 |
| 视觉 | 深色面板、清晰分区、14px 中文、选中高亮、组禁用时子节点变暗；对照 particles-editor / libGDX 密度，禁止再「单列所有 number 无分组标题」 |
| 依据 | 需求 §9；调研 §5.1 |

### PR-D · 元素预设库面板

| 项 | 内容 |
|----|------|
| UI | 顶栏「预设库」抽屉/模态：列表名、应用到当前组、删除预设（确认）、从当前元素「存为预设」需输入名称 |
| 数据 | 写入 `CONFIG.hitVfxElementPresets`，随 §PR-E 一起进 shipping |
| 依据 | 需求 §6；X @vikram_spidy 预设导出实践 |

### PR-E · 项目配置保存路径（正式完成项）

| 项 | 内容 |
|----|------|
| 行为 | 顶栏主按钮「保存到项目配置」= `exportShippingJson()`（已有），并 `setFlash` 提示：「已下载 shipping.json，请覆盖放入 `app/public/presets/shipping.json`（或本仓库既定 presets 路径）后提交」 |
| 次按钮 | 「存浏览器草稿」= 现有 `saveCurrentConfig()` |
| 启动 | 编辑页 `main.ts` 已有 `loadShippingConfig`/`loadSavedConfig`：**保持 shipping 优先于本地的既有顺序**；若项目已有约定则勿改乱 |
| 验收 | 改配方 → 导出 → 将文件放入仓库 presets → 清 localStorage → 刷新 → 配方仍在 |
| 依据 | 需求 §7；`persist.ts` 现实现 |

### PR-F · 共识回写 + 回归

| 项 | 内容 |
|----|------|
| 改 | `docs/hit-vfx-consensus-v0.md` §3.3/§3.5/§3.6/§6：编辑 UI 布局定为三栏树；火花光照改为火花内嵌参数；划掉「预览台布局未定」 |
| 测 | `npm test`；浏览器手测清单见 §6 |

---

## 4. 调试面板必须公开的参数（禁止藏字段）

> 依据：现有 `hitVfxTypes.ts` 字段 + 需求「专属参数可调到可感」+ 合并后的 light。  
> 标签必须中文；`data-*` 可用英文 key。

### 4.1 顶栏 / 预览全局（中栏或顶栏）

| 中文标签 | 绑定 | 控件 |
|----------|------|------|
| 启用特效 | `CONFIG.hitVfxEnabled` | checkbox |
| 显示假人 | `hitVfxPreviewDummyVisible` | checkbox |
| 暂停 | `hitVfxPaused` | checkbox |
| 锁随机种子 | `hitVfxSeedLocked` | checkbox |
| 种子 | `hitVfxSeed` | number |
| 时间倍率 | `hitVfxTimeScale` | number 0.05–2 |
| 顿帧冻结特效 | `hitVfxFollowHitstop` | checkbox |
| 击中点标记 | `hitVfxDebug` | checkbox |
| 预览路径 | preview kind onHit/onBlock | select |
| 预览高度 | h/m/l | select |
| 预览力度 | L/M/H | select |
| 并发上限 | `hitVfxMaxConcurrent` | number |
| 点光池大小 | `hitVfxSparkLightPoolSize` | number |
| 实战未格挡配方 | `hitVfxActiveRecipeOnHitId` | select |
| 实战格挡配方 | `hitVfxActiveRecipeOnBlockId` | select |
| 重放 / 步进一帧 / 重建运行时 | hooks | button |

### 4.2 选中「配方」时右栏

| 中文 | 字段 |
|------|------|
| 名称 | `recipe.name` |
| 种类 | `recipe.kind`（onHit/onBlock） |
| 力度缩放 L/M/H 的 | `countMul` `sizeMul` `brightnessMul` `lifetimeMul` `lightIntensityMul`（现有 strengthScale） |
| 高度挂点 | 沿用现面板 `hitVfxHeightOffsets` 头胸腿 y/z（可放配方级或全局区，但必须仍可调） |

### 4.3 选中「分组」时右栏

| 中文 | 字段 |
|------|------|
| 名称 | `group.name` |
| 启用整组 | `group.enabled` |

### 4.4 选中元素 · 公共

| 中文 | 字段 |
|------|------|
| 名称 | `element.name` |
| 启用 | `element.enabled` |
| 所属分组 | `element.groupId`（select 现有 groups） |
| 开始延迟(秒) | `element.startDelaySec` |
| 接受火花光照 | `element.receiveSparkLight`（非 spark 默认 true） |

### 4.5 火花 `spark` 专属

| 中文 | 字段 |
|------|------|
| 数量 | `params.count` |
| 寿命最小/最大 | `params.lifetimeSec[0/1]` |
| 速度最小/最大 | `params.speed[0/1]` |
| 尺寸最小/最大 | `params.size[0/1]` |
| 起始色/结束色 | `colorStart` `colorEnd`（hex number 或 color input） |
| 亮度 | `brightness` |
| 锥角(弧度) | `coneAngleRad` |
| 阻力 | `drag` |
| 重力Y | `gravityY` |
| 混合 | `blend`（仅 additive，只读显示即可） |
| **光照启用** | `params.light.enabled` |
| **光颜色** | `params.light.color` |
| **光强度** | `params.light.intensity` |
| **光强度结束** | `params.light.intensityEnd` |
| **光距离** | `params.light.distance` |
| **光衰减** | `params.light.decay` |
| **光寿命** | `params.light.lifetimeSec` |
| **照角色** | `params.light.castOnCharacter` |
| **照同组特效** | `params.light.castOnVfxElements` |

### 4.6 附带小粒子 `sparkDebris`

公开：`count`、`lifetimeSec[]`、`speed[]`、`size[]`、`color`、`gravityY`、`drag`、`coneAngleRad`、`blend`。

### 4.7 扬尘 `dust`

公开：`count`、`lifetimeSec[]`、`speed[]`、`size[]`、`color`、`opacity`、`gravityY`、`drag`、`coneAngleRad`、`blend`。

### 4.8 汗水 `sweat`

公开：`count`、`lifetimeSec[]`、`speed[]`、`size[]`、`color`、`gravityY`、`drag`、`coneAngleRad`、`blend`；`collideGround` 固定 false，**只读显示「仅寿命消失」**（共识禁止碰地）。

---

## 5. 实现细则（AI 不得省略）

### 5.1 树渲染算法

1. 读 `CONFIG.hitVfxSelectedRecipeId` → recipe。  
2. 根节点显示配方名（选中配方时右栏配方）。  
3. 遍历 `recipe.groups` 渲染组行（checkbox 绑定 enabled；拖放目标）。  
4. 过滤 `elements.filter(e => e.groupId === g.id)` 渲染子行；**跳过 type===sparkLight**（迁移后应无）。  
5. 选中写入 `hitVfxSelectedRecipeId` / `hitVfxSelectedGroupId` / `hitVfxSelectedElementId`。

### 5.2 拖拽（必须处理的坑）

依据调研 §6 与 https://stackoverflow.com/questions/29553959 ：

```ts
// drop 处理伪代码（必须落实）
const groupEl = (e.target as HTMLElement).closest('[data-node="group"]');
if (!groupEl) return;
e.preventDefault();
moveElementToGroup(recipe, elementId, groupEl.dataset.groupId);
```

- `dragover` 必须 `preventDefault`。  
- dataTransfer 同时 `setData('text/plain', elementId)`。  
- 禁止拖到自己当前组且无排序需求时可 no-op（本需求不要求组内排序，只要求换组）。

### 5.3 改参后刷新

- 数值/开关：`notify('hitVfxRecipes')` + `hooks.invalidate()`（已有模式）。  
- 增删改结构：`hooks.invalidate()` 且调用现有「重建运行时」等价路径（面板已有 `hvfx-rebuild`）。  
- 参考 particles-editor：避免每次 input 事件都全量 destroy；`change`/`pointerup` 再 commit。

### 5.4 新建元素默认值

必须调用与 `hitVfxDefaults.ts` 同结构的工厂（可导出 `createDefaultElement(type)`），禁止空 params。

---

## 6. 浏览器验收清单（执行者必须勾）

1. 打开 `/hit-vfx.html`：三栏、中文、有假人、无角色。  
2. 新建配方 → 重命名 → 复制 → 粘贴 → 删除（有确认）。  
3. 新建空组 → 重命名 → 拖元素换组 → 关整组 → 重放无该组效果 → 再开。  
4. 分别新建火花/小粒子/扬尘/汗水 → 改 §4 参数肉眼有差。  
5. 火花光照：只在火花参数里；旧 shipping 若含 sparkLight，加载后树无光、假人仍被照。  
6. 元素存预设 → 另一组从预设插入 → 改参互不影响。  
7. 「保存到项目配置」下载 shipping → 放入 presets → 清草稿 → 刷新仍在。  
8. 训练场 `/` 命中仍播同一配方。  
9. `npm test` 与 `npm run build` 通过。

---

## 7. 风险与缓解（来自调研，写入执行纪律）

| 风险 | 缓解 |
|------|------|
| DnD 丢到子节点 | `closest` 分组行；单测 move API |
| 粘贴 ID 冲突 | 强制 regenIds |
| 迁移丢光 | 单测强度/颜色；浏览器看假人受光 |
| 只存 local 当完成 | PR-E 主按钮文案与验收强制 shipping 文件 |
| UI 又做成下拉堆 | PR-C 骨架不符合 §0.3 则评审拒收 |
| 引入重型库 | 依赖审查：不得出现 react/jquery |

---

## 8. 文件清单（预期）

| 路径 | 动作 |
|------|------|
| `app/src/render/hitVfx/hitVfxTypes.ts` | 改 |
| `app/src/render/hitVfx/hitVfxDefaults.ts` | 改 |
| `app/src/render/hitVfx/HitVfxRuntime.ts` | 改 find light + group enabled |
| `app/src/config/constants.ts` `types` `store` | 改 presets 字段 |
| `app/src/hitVfxEditor/HitVfxEditorPanel.ts` | 重写/拆分 |
| `app/src/hitVfxEditor/hit-vfx-editor.css` | 重写三栏 |
| `app/src/hitVfxEditor/HitVfxClipboard.ts` | 新 |
| `app/src/hitVfxEditor/hitVfxRecipeOps.ts` | 新 |
| `app/src/hitVfxEditor/HitVfxTreePane.ts` 等 | 新（可选拆分） |
| `app/tests/render/hitVfx/*` | 加迁移与 ops 测试 |
| `docs/hit-vfx-consensus-v0.md` | 回写 |
| `app/public/presets/shipping.json` | 导出后由人/脚本更新（执行者按 PR-E） |

---

## 9. 完成定义

需求文档核对清单 §13 全部满足；调研结论中的布局/迁移/剪贴板/DnD 纪律已落地；本方案 §6 验收全过；共识已回写。**不允许**交付「仅 CSS 美化旧下拉面板」或「接了 quarks 演示页」。

# 打击特效编辑器 UI · 调研笔记

> **检索时间节点**：服务器时间 **2026-08-26T05:48:27Z**（本地 **2026-08-26 13:48:27 CST**）  
> **性质**：调查。记录分析、检索计划、执行结果、开源/社区案例、坑与本仓库差距。  
> **不是共识，也不是执行方案。** 需求以 `docs/hit-vfx-editor-ui-requirements-v0.md` 为准；运行时底座另见 `docs/research/hit-vfx-research-2026-08-26.md`。  
> **检索通道**：网页 / GitHub、X **语义检索（算法）**、X **关键词 Latest**。

---

## 1. 先分析：需求拆成可检索问题

需求要的是**完整图形化编辑界面**（配方 → 分组 → 元素），不是再堆一排下拉框。

| 需求块 | 调查要回答的问题 |
|--------|------------------|
| 左树三层 + 中预览 + 右参数 | 成熟特效/粒子编辑器的标准布局是什么？有没有开源可对照？ |
| 新建/重命名/复制粘贴/删除/确认 | 编辑器里结构化对象的复制粘贴如何避免 ID 冲突？删除确认怎么做？ |
| 分组拖拽换组、整组开关 | HTML5 树拖拽有哪些已知坑？有没有无 React 的树组件？ |
| 元素预设库 | 粒子编辑器如何做「单发射器预设 / JSON 导出再套用」？ |
| 光照并入火花参数 | 现有仓库仍是独立 `sparkLight` 元素；合并后运行时怎么读？ |
| 保存进项目配置 | 本仓库已有 shipping / localStorage；「进仓库」应走哪条路径？ |
| 界面专业好看、中文 | 对照哪些编辑器的视觉分区与交互，而不是只抄参数列表？ |
| **禁止**整包换粒子引擎 | 案例只作 **UI/交互/数据组织** 参考；运行时继续用本仓库 `HitVfxRuntime` + 已依赖的 `three` / `three-plume` 薄封装 |

**总判断（检索后）：**

1. **编辑器布局业界高度一致**：左层级树 / 中实时预览 / 右检查器 + 顶栏播放与存档。代表：libGDX Particle Editor、Unity Particle/VFX Graph 工作区、three-particles-editor（Unity 风格）、three.quarks 可视化编辑器、Skylicht Particle Editor（System→Group→Emitter）。  
2. **本仓库最大缺口在「数据模型 + UI」**：已有独立页与参数框，但**没有真正的分组实体**（只有元素上的 `groupId` 字符串）、没有树、没有复制粘贴、没有元素预设、没有专业分区布局。  
3. **不应引入 React/jQuery 重型树库**（项目是 Vite + 原生 TS DOM）。可对照 `sparklinlabs/dnd-tree-view`、`sortable-tree`、`yy-tree` 的交互规则，**自研薄树控件**。  
4. **复制粘贴必须做 ID 重映射**：tldraw / Excalidraw 社区实践明确；否则粘贴会撞 ID。  
5. **HTML5 DnD 坑很多**（子节点抢 drop、Safari `relatedTarget` 空、跨浏览器 dataTransfer）；实现时必须写「只允许元素拖到分组」的明确规则与命中测试。

---

## 2. 检索计划（先计划，后执行）

### 2.1 通道与关键词

| 通道 | 计划查询 | 目的 |
|------|----------|------|
| 网页 / GitHub | `three.js particle system editor`、`three.quarks-editor`、`three-particles-editor`、`three-nebula`、`webgpu-vfx`、`NixieFX` | 找 Web 粒子编辑器与布局 |
| 网页 / GitHub | `HTML5 tree drag drop vanilla`、`dnd-tree-view`、`sortable-tree` | 无框架层级树 |
| 网页 / GitHub | `clipboard JSON paste id remap editor`、`excalidraw clipboard`、`tldraw clipboard` | 复制粘贴与 ID |
| 网页 | `HTML5 drag drop child target pitfalls Safari` | 拖拽陷阱 |
| 对照本仓库 | `HitVfxEditorPanel`、`hitVfxTypes`、`persist.ts`、`groupId` | 差距表 |
| X 语义（强制） | 粒子/VFX 可视化编辑器；层级树检查器；打击火花扬尘编辑 | 算法推荐社区实践 |
| X 关键词 Latest | `(three.js OR quarks OR nebula OR particle editor) …`；专名检索 | 补近期链接 |

### 2.2 案例筛选标准

**加分：** 左树右参中预览；JSON 配方；发射器/层列表；预设导出；实时预览；burst；开源可读。  
**减分：** 仅艺术装置无游戏 burst；强绑 React Three Fiber 且无法抽交互；要求整包替换本仓库运行时。

### 2.3 执行记录

| 步骤 | 时间（约） | 做了什么 |
|------|------------|----------|
| A | 13:48 CST / 05:48 UTC | 确认服务器时间；读需求与本仓库 `hitVfxTypes` / 编辑面板 / persist |
| B | 同日 | 网页：three 粒子编辑器、树 DnD、剪贴板、坑 |
| C | 同日 | X 语义 ×4：VFX 编辑器；quarks/nebula；hierarchy inspector；hit sparks dust |
| D | 同日 | X 关键词 Latest ×2：three/粒子；quarks/particles/nebula/webgpu-vfx/NixieFX |
| E | 同日 | 对照本仓库：仅有 `groupId`、无分组实体；保存主路径仍是 localStorage + 导出 shipping |

---

## 3. 本仓库现状（事实）

| 项 | 事实 |
|----|------|
| 入口 | `/hit-vfx.html` → `app/src/hitVfxEditor/` |
| UI | `HitVfxEditorPanel.ts`：侧栏下拉选配方/元素 + 数字框；**无树、无新建配方/组/元素按钮流、无重命名/复制粘贴** |
| 数据 | `HitVfxRecipe.elements[]`；元素有 `groupId: string`（默认 `'main'`）；**无 `groups[]` 表（无组名、无组级 enabled）** |
| 类型 | `spark` / `sparkLight` / `sparkDebris` / `dust` / `sweat`；需求要求**取消独立 sparkLight 新建**，光并入火花 |
| 运行时 | `HitVfxRuntime` 仍 `findSparkLight(recipe.elements)` 读独立元素 |
| 保存 | `saveCurrentConfig()` → localStorage；`exportShippingJson()` 下载 `shipping.json`（注释要求放入 `public/presets/`） |
| 栈 | `three@0.185`、`three-plume@0.1.1`、Vite、原生 DOM（无 React） |

---

## 4. X 检索结果（算法语义 + 关键词）

### 4.1 语义 · 粒子 / VFX 可视化编辑与 JSON

| 帖 | 要点 | 对本需求的用处 |
|----|------|----------------|
| [@chirovisuals 2026-08-24](https://x.com/chirovisuals/status/2091854746550226995) | Three.js 开源 VFX playground；实时调能力外观；可暂停 | **中预览 + 实时改参**交互标杆；强调「看得见立刻改」 |
| [@codetaur](https://x.com/codetaur/status/2042696145521225804) | 贴 JSON → Apply → Three 预览 | **配方 JSON ↔ 预览**闭环 |
| [@StarSignalDev](https://x.com/StarSignalDev/status/2091099157616349494) | 粒子编辑器做好 FX → 碰撞时按强度触发 | **配方选用 + 力度门槛**与游戏触发分离 |
| [@YmtIsk](https://x.com/YmtIsk/status/1921218491849330888) | 攻击特效可按粒子级调整 | 印证「元素级参数面板」必要 |
| [@vikram_spidy 2026-08-23](https://x.com/vikram_spidy/status/2091352269476536795) | Flixel-Pixi Particle Editor：火花/烟/尘预设、导出 preset/TS | **元素预设库 + 导出**对照 |

### 4.2 语义 · 层级树 / 检查器

| 帖 | 要点 | 用处 |
|----|------|------|
| [@radiatoryang](https://x.com/radiatoryang/status/1032693578525552640) | Unity 内建多列 TreeView | 树是编辑器标配控件 |
| [@BinaryImpactG](https://x.com/BinaryImpactG/status/1285514861020164108) | Hierarchy 拖拽技巧 | 大树拖拽 UX 痛点真实存在 |
| [@GregorySchier](https://x.com/GregorySchier/status/1977009013670965745) | 树拖拽：禁自引用、多父拖入、键盘选择 | **拖拽规则清单**可直接写进实现验收 |

### 4.3 关键词 Latest（节选）

- Spline V2 WebGPU 编辑器（布局与 agent 工作流参考，非粒子）。  
- 社区仍在问「three.js 最好的编辑系统是不是每人自研」（[@v3code_editor](https://x.com/v3code_editor/status/2092277758470627393)）→ **本仓库自研专用编辑页合理**。  
- MOBA 浏览器技能 VFX 开源讨论（Three + GLSL）→ 强化「预览接真运行时」。

---

## 5. GitHub / 网页重点案例（编辑器向）

### 5.1 必读（UI / 数据组织）

| 项目 | 链接 | 为什么重要 |
|------|------|------------|
| **three-particles-editor** | https://github.com/NewKrok/three-particles-editor · Demo: https://newkrok.com/three-particles-editor/index.html | **Unity 风格**粒子编辑器；实时预览；导出配置；CHANGELOG 有「未保存才确认」「live updateConfig」「legacy 配置迁移弹窗」——与本需求的确认框/热更新/旧 sparkLight 迁移高度同构 |
| **three.quarks + editor** | https://github.com/Alchemist0823/three.quarks · Editor: https://github.com/Alchemist0823/three.quarks-editor · 文档站/Playground 见仓库 README | **JSON 加载特效** + 可视化编辑；生产向；**对照交互，不整包替换运行时** |
| **Plume（本仓库已依赖 three-plume）** | https://github.com/travisdmathis/plume | 节点编辑器 + JSON import/export + WebGPU 预览；证明「编辑器与 runtime 配方序列化」分离是正路 |
| **libGDX Particle Editor** | https://github.com/libgdx/gdx-particle-editor · Wiki: In-Depth Guide | 经典三角分区：**Preview / Emitter 列表 / Properties**；发射器=层；可调面板分割 |
| **Skylicht Particle Editor** | DeepWiki: https://deepwiki.com/skylicht-lab/skylicht-engine/5.4-physics-and-collision | 层级：**ParticleSystem → Group → Emitter…**；Hierarchy + Property + Preview —— 与需求「配方→分组→元素」同构 |
| **Unity ParticleEffectUI（参考源）** | https://github.com/Unity-Technologies/UnityCsReference/blob/master/Modules/ParticleSystemEditor/ParticleEffectUI.cs | 多 emitter 子层级 + 播放控制；工业级参考（只读交互，不移植 C#） |

### 5.2 树 / 拖拽（实现控件时对照）

| 项目 | 链接 | 要点 |
|------|------|------|
| **dnd-tree-view**（Superpowers） | https://github.com/sparklinlabs/dnd-tree-view | 游戏编辑器用树；`item`/`group`；cancellable DnD；**无 React** |
| **sortable-tree** | https://github.com/marcantondahmen/sortable-tree · Docs: https://marcantondahmen.github.io/sortable-tree | TS、可拖拽折叠；轻量 |
| **yy-tree** | https://github.com/davidfig/tree | 纯 vanilla 树 |
| **vanillatree** | https://github.com/finom/vanillatree | `move(id, parentId)` API 清晰 |

**本仓库选型结论（调查建议）：** 不新增 React/jQuery 依赖；**自研约 200–400 行树控件**，规则抄 dnd-tree-view + Greg Schier 帖中的约束。

### 5.3 复制粘贴 / 预设

| 项目 / 文 | 链接 | 要点 |
|-----------|------|------|
| **tldraw clipboard** | https://tldraw.dev/sdk-features/clipboard | paste 时 **remap IDs**；schema 迁移；clipboard API 优先 |
| **Excalidraw clipboard** | DeepWiki / `packages/excalidraw/clipboard.ts` | `type: excalidraw/clipboard` 标记；序列化 JSON |
| **Web clipboard 自定义类型** | https://alexharri.com/blog/clipboard | 异步 Clipboard 对 MIME 限制；可用 `web application/json` 或事件 `setData`；**建议同时写 text/plain JSON 兜底** |
| **Pixi particle-emitter-editor** | https://github.com/pixijs/pixi-particles-editor | 预设/配置驱动编辑 |
| **NixieFX** | https://nixiefx.com/ | Three 粒子编辑器 + 自有 runtime；布局参考 |

### 5.4 其他（减分但可扫一眼）

- three-nebula：JSON 实例化成熟，编辑器生态弱于 quarks/particles-editor。  
- webgpu-vfx：预设 builder，编辑器完整度不如上表。  
- cel-lab：单 HTML 程序化 VFX，布局偏工具页。  
- Photon2（MC）：Hierarchy+Scene+Inspector+Timeline —— 分区哲学可学，技术栈无关。

---

## 6. 坑与技术陷阱（检索补充）

| 坑 | 来源 | 对本方案的约束 |
|----|------|----------------|
| HTML5 DnD：`drop` 的 `target` 常是**子节点**而非分组行 | Stack Overflow「Why does HTML5 Drag n Drop target child」 | drop 时用 `closest('[data-drop-kind=group]')`；禁止把元素 drop 进另一个元素内部变成错误嵌套 |
| Safari：`dragleave`/`dragenter` 的 `relatedTarget` 常为 null | WebKit bug 66547；feross/drag-drop 讨论 | 用计数或几何命中，不要只靠 relatedTarget |
| 浏览器 dataTransfer 行为不一致 | https://github.com/leonadler/drag-and-drop-across-browsers | 自定义 MIME + `text/plain` 双写 |
| 粘贴不 remap ID → 冲突覆盖 | tldraw / Excalidraw | `cloneRecipe`/`cloneElement` 必须生成新 uuid，并重写 `groupId` 引用 |
| 异步 Clipboard 写 JSON MIME 受限 | alexharri 文 | 优先 `copy`/`paste` 事件 + 内存剪贴板兜底（同页一定可用） |
| 旧配置字段迁移 | three-particles-editor CHANGELOG「legacy configuration detection modal」 | sparkLight 并入 spark 要**确定性迁移函数 + 单测**，不要静默丢光 |
| live 改参导致整系统重建卡顿 | three-particles-editor「throttle full recreate / updateConfig」 | 参数 `input` 用 change/commit；结构变更（增删元素）才 `rebuild` |
| 「只存 localStorage」不等于进仓库 | 本仓库 `persist.ts` | 需求要求项目配置：必须以 **导出/写入 shipping 预设文件** 为正式完成路径，并在 UI 写清操作 |

---

## 7. 与需求的差距表

| 需求 | 现状 | 案例启示 |
|------|------|----------|
| 三层树 | 无 | Skylicht / Unity / libGDX |
| 新建配方/组/元素 | 无完整流程 | quarks / particles-editor |
| 重命名 | 无 | 树内联编辑（Fancytree edit 扩展思路） |
| 复制粘贴配方+元素 | 无 | tldraw ID remap |
| 分组拖拽/整组开关 | 仅有 groupId | dnd-tree-view；组实体表 |
| 元素预设 | 无 | Pixi editor；vikram 帖 |
| 光照并入火花 | 仍独立元素 | 本仓库 Runtime 需改读路径 |
| 专业布局中文 | 窄侧栏英文 key | libGDX 三栏；中文标签 |
| 保存进项目 | 本地 + 手导 shipping | UI 必须有「导出到项目预设」主按钮 |

---

## 8. 调查结论（给方案用）

1. **做自研三栏编辑壳**，预览继续挂现有 `HitVfxEditorApp` + `HitVfxRuntime`。  
2. **扩展数据模型**：`recipe.groups: {id,name,enabled}[]`；元素仍挂 `groupId`；新增 `hitVfxElementPresets[]`。  
3. **火花参数内嵌原 SparkLightParams**；`normalize` 时合并并剥离树上的 `sparkLight`。  
4. **树控件自研**；规则与坑按 §6。  
5. **开源库用作对照与验收参照，不替换本仓库粒子主路径**（与需求「预览必须接真运行时」一致）。

---

## 9. 参考链接速查

- https://github.com/NewKrok/three-particles-editor  
- https://newkrok.com/three-particles-editor/index.html  
- https://github.com/Alchemist0823/three.quarks  
- https://github.com/Alchemist0823/three.quarks-editor  
- https://github.com/travisdmathis/plume  
- https://github.com/libgdx/gdx-particle-editor  
- https://github.com/sparklinlabs/dnd-tree-view  
- https://marcantondahmen.github.io/sortable-tree  
- https://tldraw.dev/sdk-features/clipboard  
- https://alexharri.com/blog/clipboard  
- https://nixiefx.com/  
- https://github.com/Unity-Technologies/UnityCsReference/blob/master/Modules/ParticleSystemEditor/ParticleEffectUI.cs  
- 既有运行时调研：`docs/research/hit-vfx-research-2026-08-26.md`

# AI 可执行方案：SF6 隆训练场 MVP（5LP 样板闭环）

> **文档类型**：实现执行规范（给 AI / 人类执行用），**不是** `consensus-v0.md`。  
> **节点**：2026-08-07 · 对齐 `docs/consensus-v0.md` v0.3、`docs/research/tech-barrier-cases-2026-08-07.md`、`private/interim/README.md`  
> **目标切片（MVP）**：桌面 Chrome + WebGPU + Three.js 训练场内，**本地帧表驱动的 Ryu 5LP** 击中 Dummy，进入硬直；H2 调试信息与 lil-gui 参数面板可用；**无**联网、**无** Modern、**无** 官方资产再分发。  
> **硬性规则（执行者必读）**  
> 1. **禁止自我发挥**：每步只能用本文件列出的仓库、API、字段与路径。缺项先停，写 `BLOCKED:` 原因，不要发明第二套架构。  
> 2. **禁止**把 `private/` 下 Capcom/rip 资源提交 git 或复制进可公开远程路径。  
> 3. **逻辑权威**永远是本地 JSON；`AnimationMixer` 不得决定 startup/active/recovery。  
> 4. 每步结束必须满足 **验收标准**；附带 **单测或手动清单**。

---

## 0. 权威依据总表（全文引用）

| 编号 | 依据 | 用途 |
|------|------|------|
| C1 | `docs/consensus-v0.md` §1.1–1.4, §3–4 | 产品边界、R2、D2/H2、WebGPU 硬要求 |
| R1 | `docs/research/tech-barrier-cases-2026-08-07.md` | 案例链接与消障顺序 |
| R2 | `docs/research/community-assets-and-cases.md` | 引擎/工具边界 |
| R3 | `private/interim/README.md` + `clip_map.json` | T0 资源与 clipId |
| T1 | [Gaffer on Games — Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/) | 固定逻辑步 + accumulator + spiral of death |
| T2 | [Isaac Sukin — JS game loops](https://isaacsukin.com/news/2015/01/detailed-explanation-javascript-game-loops-and-timing) | rAF + 固定步 JS 实现 |
| T3 | three.js 文档 / 例：`WebGPURenderer`、`GLTFLoader`、`AnimationMixer`；[`webgpu_animation_retargeting.html`](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_animation_retargeting.html) | 渲染与动画 |
| T4 | three 论坛 / GH：Vite + top-level await + WebGPU（[issue #26626](https://github.com/mrdoob/three.js/issues/26626)、[discourse](https://discourse.threejs.org/t/top-level-await-error-with-vite-and-three-js-top-level-await-is-not-available-in-the-configured-target-environment/68189)） | 构建陷阱 |
| T5 | [chriscourses/fighting-game](https://github.com/chriscourses/fighting-game) | 最小攻击盒 / 受击闭环（语义参考，非直接拷贝资源） |
| T6 | [Ikemen-GO](https://github.com/ikemen-engine/Ikemen-GO) wiki / 源码语义 | 状态、cancel、指令（语义，不移植 Go 运行时） |
| T7 | [Sakuga-Engine](https://github.com/NoisyChain/Sakuga-Engine) | hit/hurt、状态块结构参考 |
| T8 | [FAT](https://github.com/D4RKONION/FAT) + [官方 Ryu 帧](https://www.streetfighter.com/6/en-us/character/ryu/frame) + SuperCombo | 5LP **采信输入**（写入本地前人工审查） |
| T9 | [critpoints — motion inputs](https://critpoints.net/2025/02/05/how-to-code-fighting-game-motion-inputs/) + [Andrea Jens 输入缓冲系列](https://andrea-jens.medium.com/i-wanna-make-a-fighting-game-a-practical-guide-for-beginners-part-6-311c51ab21c4) | 输入缓冲理论（MVP 仅用 normals，结构先留好） |
| T10 | three 内置 `lil-gui`：`three/addons/libs/lil-gui.module.min.js`（官方例自 r135 起） | 调试面板 |
| T11 | SO：AnimationMixer 逐帧 / `setTime`（[SO 53004301](https://stackoverflow.com/questions/53004301/how-to-manually-control-animation-frame-by-frame)） | 表现贴合逻辑帧 |
| T12 | Vitest 官方文档 | 纯逻辑单测，无浏览器 |

**本 MVP 不引用、不 fork 的东西（明确禁止）**

- 任意 SF6 官方 mesh/mot 进公开路径  
- 回滚 netcode（Sakuga 的 rollback 模块 **只读不抄进依赖**）  
- React / R3F（jady-deth、Black Trigram 仅作 **结构对照阅读**，本方案栈为 **vanilla Vite + TS + three**，避免双框架）

---

## 1. 锁定技术栈与版本策略

| 组件 | 选型 | 安装命令 | 禁止替代 |
|------|------|----------|----------|
| 语言 | TypeScript strict | 随 Vite 模板 | 不用 plain JS 新建逻辑 |
| 构建 | Vite | `npm create vite@latest` 选 vanilla-ts | 不用 Webpack/CRA |
| 渲染 | `three` 最新稳定 + **仅** `import … from 'three/webgpu'` 与 `three/tsl`（若需） | `npm i three` | **禁止** `WebGLRenderer` 作为默认路径 |
| 测试 | Vitest | `npm i -D vitest` | 逻辑测不跑 Playwright 首迭代 |
| GUI | three 自带 lil-gui 路径 | 见 Step 7 | 不用 dat.GUI |
| 断言库 | vitest 内置 expect | — | — |

**包管理**：`npm`（锁定 `package-lock.json`）。  
**Node**：≥ 20 LTS（执行前 `node -v`）。

**仓库源码「使用方式」定义**

| 仓库 | 使用方式 | AI 允许的操作 |
|------|----------|----------------|
| three.js 官方 examples | **抄 API 模式**，不 vendoring 整仓 | 对照 import 路径与 `await renderer.init()` |
| chriscourses/fighting-game | **阅读** `index.js` 中矩形碰撞与攻击状态 | 用 TypeScript **重写**等价逻辑进 `packages/combat`，禁止粘贴其美术 |
| Ikemen-GO / Sakuga | **阅读概念**（状态名、cancel 窗口） | 不复制引擎；字段名可借鉴英文 |
| FAT | **人工导出/对照** JSON 字段含义 | 不在运行时 HTTP 请求 FAT；只读本地 `data/` |
| Quaternius UAL（本机 interim） | **加载 glTF 动画名** | 路径见 Step 5；许可 CC0 |

---

## 2. 仓库目录（必须按此创建，禁止另起体系）

在项目根 `StreetFighter6/` 下创建应用根 `app/`（与 `docs/`、`private/` 并列）：

```text
StreetFighter6/
  app/                          # 可提交源码
    package.json
    vite.config.ts
    tsconfig.json
    index.html
    vitest.config.ts
    public/
      data/                     # 仅 JSON 文本（帧表、clip 映射副本）
        moves/ryu_5lp.json
        systems/drive_stub.json
        clips/clip_map.json     # 从 interim 复制的映射（无二进制）
      # 注意：全局 .gitignore 忽略 *.gltf/*.glb — 二进制只从 private 经 Vite 允许路径加载
    src/
      main.ts                   # 启动：WebGPU 检测 → 场景 → 循环
      config/
        constants.ts            # LOGIC_FPS, 世界单位等（公开到 GUI 的默认值）
      combat/                   # 纯逻辑，禁止 import three
        types.ts
        frameClock.ts
        input/
          KeyboardSource.ts
          InputBuffer.ts
        move/
          MoveDefinition.ts
          MovePlayer.ts
        boxes/
          Box2D.ts
          Collision.ts
        fighter/
          FighterState.ts
          Fighter.ts
        match/
          MatchSim.ts
          DummyController.ts    # D2
        systems/
          DriveStub.ts          # 占位
        debug/
          FrameSnapshot.ts      # 供 HUD/GUI 只读
      render/                   # 可 import three
        WebGpuApp.ts
        Stage.ts
        FighterView.ts
        DebugDraw.ts            # 框线
        ClipBinder.ts           # clipId → AnimationAction
        HudDom.ts               # 血量/Drive 条 DOM
      debug/
        DebugGui.ts             # lil-gui 全部参数登记处
      data/
        loadJson.ts
    tests/
      combat/
        frameClock.test.ts
        collision.test.ts
        movePlayer_5lp.test.ts
        matchSim_5lp.test.ts
  docs/
  private/                      # 已存在，永不提交
```

**Vite 允许读 private interim（必须写进 vite.config.ts）**

依据：Vite `server.fs.allow` 文档行为。

```ts
// app/vite.config.ts — 必须包含等价配置
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    fs: {
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, '../private/interim'),
      ],
    },
  },
  resolve: {
    alias: {
      '@interim': path.resolve(__dirname, '../private/interim'),
    },
  },
  build: {
    target: 'esnext', // 配合 WebGPU / modern syntax；见 T4
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

**关于 top-level await（T4 陷阱）**  
优先方案（执行顺序）：

1. `build.target` + `optimizeDeps.esbuildOptions.target` = `'esnext'`（Threlte WebGPU 文档推荐）。  
2. 若仍报错，再 `npm i -D vite-plugin-top-level-await` 并按 [Menci/vite-plugin-top-level-await](https://github.com/Menci/vite-plugin-top-level-await) 接入。  
3. **业务代码禁止**依赖「模块顶层 await three」；`main.ts` 用 `async function boot()`。

---

## 3. 全局常量（`src/config/constants.ts`）— 必须可 GUI 覆盖的见 §8

| 符号 | 默认值 | 理论依据 | 可否运行时改 |
|------|--------|----------|--------------|
| `LOGIC_FPS` | `60` | 格斗帧数据业界惯例（GameDev SE「frames not time」）；与 `clip_map.json` 的 `target_fps_logic` 一致 | 仅调试；改后需重置 sim |
| `LOGIC_DT` | `1/60` | 由 LOGIC_FPS 导出 | 否（派生） |
| `MAX_FRAME_TIME_MS` | `100` | Gaffer spiral of death：限制单帧追赶 | 是（GUI） |
| `MAX_LOGIC_STEPS_PER_RAF` | `4` | 同上，防止 while 爆炸 | 是 |
| `WORLD_SCALE` | `1` | 逻辑单位→Three 单位；先 1，对模型缩放另调 | 是 |
| `STAGE_GROUND_Y` | `0` | 侧视地面 | 是 |
| `FIGHTER_FACE_SIGN` | `1 \| -1` | P1 朝右为 +1 | 否（由位置推导） |
| `INPUT_BUFFER_FRAMES` | `8` | 业界常见缓冲窗口量级（T9）；MVP 5LP 可不消费 special | 是 |
| `DEFAULT_HP` | `10000` | 对齐 SF6 官方公开 Vitality 量级（官方 Ryu 帧页） | 是 |
| `DRIVE_MAX` | `6` | SF6 Drive 格数公开知识；**仅 stub 显示** | 是 |
| `HITBOX_COLOR` | `0xff3333` | 调试惯例红 hit / 绿 hurt | 是 |
| `HURTBOX_COLOR` | `0x33ff66` | 同上 | 是 |

**逻辑坐标系（强制）**

- 侧视 2D：`x` 水平，`y` 垂直向上，原点在场地中心地面。  
- 渲染映射（`FighterView`）：`three.position.set(logic.x * WORLD_SCALE, logic.y * WORLD_SCALE, p1z)`；两机 `z` 微偏或同平面 `z=0`，**禁止**用 3D 物理驱动对战。  
- 依据：共识 §4.1「逻辑在 2D，表现可 3D」。

---

## 4. 数据 schema（禁止 AI 自行增删字段名；可附加 `meta`）

### 4.1 `public/data/moves/ryu_5lp.json`

**采信流程（人 / AI 协作，不可跳过）**

1. 打开官方：https://www.streetfighter.com/6/en-us/character/ryu/frame  
2. 打开 SuperCombo Ryu 帧/属性页（wiki.supercombo.gg Street Fighter 6 Ryu）。  
3. 打开 FAT Online：https://fullmeter.com/fatonline （或本地 clone FAT 仓只读其 JSON 结构）。  
4. 将 **startup / active / recovery / onBlock / onHit / damage** 写入下表；冲突时 **审查后** 选一源，填 `sources` 与 `review.status: "placeholder" | "reviewed"`。  
5. 共识：未 `reviewed` 不得宣称「已复刻」；MVP 允许 `placeholder` 可玩。

```json
{
  "id": "ryu_5lp",
  "characterId": "ryu",
  "moveId": "5LP",
  "displayName": "Standing Light Punch",
  "input": { "buttons": ["LP"], "directions": ["5"], "motion": null },
  "sources": [
    { "name": "capcom_official_frame", "url": "https://www.streetfighter.com/6/en-us/character/ryu/frame", "retrieved": "YYYY-MM-DD" },
    { "name": "supercombo", "url": "https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu", "retrieved": "YYYY-MM-DD" },
    { "name": "fat", "url": "https://fullmeter.com/fatonline", "retrieved": "YYYY-MM-DD" }
  ],
  "review": { "status": "placeholder", "notes": "MVP values; mark reviewed after manual check" },
  "frames": {
    "startup": 4,
    "active": 2,
    "recovery": 7,
    "total": 13
  },
  "advantage": {
    "onHit": 4,
    "onBlock": 0
  },
  "damage": 300,
  "hitstun": 14,
  "blockstun": 9,
  "cancel": {
    "specialCancel": true,
    "targetCombo": [],
    "notes": "MVP: cancel flags stored only; special not implemented"
  },
  "boxes": {
    "hurt": [
      { "from": 0, "to": 12, "x": -0.35, "y": 0.0, "w": 0.7, "h": 1.7 }
    ],
    "hit": [
      { "from": 3, "to": 4, "x": 0.35, "y": 1.1, "w": 0.55, "h": 0.35 }
    ]
  },
  "clipId": "5lp",
  "facingRelative": true
}
```

**说明**：`frames.*` 数字 **必须由执行者按采信源填写真实值**，上表数字为 **schema 示例占位**，执行前用官方/FAT/SuperCombo 覆盖并写 `retrieved` 日期。`total` 必须等于 `startup+active+recovery-重叠约定`：本方案约定 **total = startup + active + recovery - 1 的常见 FG 记法若与源冲突，以源站 total 为准并在 notes 写清**。  
**框坐标**：逻辑单位；原点在角色脚底中心；`facingRelative=true` 时 hit.x 随朝向翻转（`x' = facing * x`，宽不变）。  
**理论**：T5 攻击在 active 帧开启 hitbox；T7 分帧框。

### 4.2 `public/data/systems/drive_stub.json`

```json
{
  "id": "drive_stub",
  "review": { "status": "placeholder" },
  "maxBars": 6,
  "startBars": 6,
  "enabledSystems": {
    "driveImpact": false,
    "driveRush": false,
    "overdrive": false,
    "driveParry": false
  },
  "notes": "Consensus requires Drive systems for SF6 Ryu; MVP only exposes gauge HUD + flags"
}
```

### 4.3 `public/data/clips/clip_map.json`

从 `private/interim/animations/selected/clip_map.json` **复制**（仅 JSON）。运行时 `clipId` → `animation` 名只读此文件。

---

## 5. 分步执行（严格顺序）

### Step 0 — 环境与资产存在性检查

**动作**

```bash
cd app   # 若尚未创建则下一步创建
node -v  # >= 20
# 检查 interim 文件存在：
test -f ../private/interim/characters/Xbot.glb || test -f ../private/interim/characters/Soldier.glb
test -f ../private/interim/animations/selected/AnimationLibrary_Godot_Standard.gltf
test -f ../private/interim/animations/selected/clip_map.json
```

**若失败**：`BLOCKED: interim assets missing` — 按 `private/interim/README.md` 补齐，**不要**从网上下载未列许可的 SF6 rip 进公开目录。

**验收**：上述 test 至少一个角色 glb + UAL gltf + clip_map 为真。

---

### Step 1 — 脚手架 Vite + TS + three + vitest

**动作（精确）**

```bash
cd "/Users/yangjianlin/Library/Mobile Documents/com~apple~CloudDocs/GameProject/StreetFighter6"
npm create vite@latest app -- --template vanilla-ts
cd app
npm i three
npm i -D vitest @types/node
```

写入 §2 的 `vite.config.ts`、`vitest.config.ts`（可 merge 进 vite 的 `test` 字段）、`package.json` scripts：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**参考实现（API 模式）**

- SBCode WebGPURenderer 教程：`import * as THREE from 'three/webgpu'`  
- `const renderer = new THREE.WebGPURenderer({ antialias: true }); await renderer.init();`

**`src/main.ts` 最小骨架（必须 async boot）**

```ts
import * as THREE from 'three/webgpu';

async function boot() {
  if (!navigator.gpu) {
    document.body.innerHTML = '<pre>WebGPU required (desktop Chrome). See consensus §4.2.</pre>';
    return;
  }
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  await renderer.init();
  // ...
}
boot();
```

**禁止**：`new WebGLRenderer` 作为主路径。  
**验收**：`npm run dev` 打开桌面 Chrome，纯色/网格场景无报错；控制台无 top-level await 构建错误。

**陷阱补丁（已搜索）**

| 坑 | 现象 | 处理 |
|----|------|------|
| TLA | Vite build target 过旧 | `target: 'esnext'` 或 vite-plugin-top-level-await |
| import 路径 | `three` 默认 WebGL 构建 | 必须 `three/webgpu` |
| iCloud 路径空格 | 路径含空格 | shell 始终引号包裹项目路径 |

---

### Step 2 — 固定逻辑帧时钟（纯 TS + 单测）

**文件**：`src/combat/frameClock.ts`  
**理论**：T1 Gaffer；T2 Sukin。  
**实现方法（必须）**：accumulator + 固定 `LOGIC_DT`；**不**用「每 rAF 调一次 logic」当权威。

```ts
// 算法契约 — 禁止改语义
export class FrameClock {
  accumulator = 0;
  logicFrame = 0;
  constructor(
    public readonly dt = 1 / 60,
    public maxSteps = 4,
    public maxFrameTime = 0.1, // seconds
  ) {}
  /** wallDt 秒；返回本帧应执行的逻辑步数 */
  tick(wallDt: number): number {
    const clamped = Math.min(wallDt, this.maxFrameTime);
    this.accumulator += clamped;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < this.maxSteps) {
      this.accumulator -= this.dt;
      this.logicFrame += 1;
      steps += 1;
    }
    return steps;
  }
  get alpha(): number {
    return this.accumulator / this.dt; // 渲染插值可选；MVP 可不用
  }
}
```

**单测** `tests/combat/frameClock.test.ts`：

- 注入 `wallDt = 1/60` 连续 60 次 → `logicFrame` 增加约 60（允许 maxSteps 限制下的边界测）。  
- `wallDt = 1.0` 单次 → steps ≤ `maxSteps`（防 spiral）。

**验收**：`npm test` 通过。

---

### Step 3 — 2D 框与碰撞（纯 TS）

**文件**：`Box2D.ts`, `Collision.ts`  
**参考语义**：chriscourses/fighting-game 矩形相交（AABB）；坐标为本方案脚底原点。

```ts
export type Box = { x: number; y: number; w: number; h: number }; // x,y = 左下角 或 中心？ 
// 强制约定：x,y 为中心，w/h 为全宽全高（与 JSON 一致）
export function aabbOverlap(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}
export function faceBox(local: Box, originX: number, originY: number, facing: 1 | -1): Box {
  return {
    x: originX + facing * local.x,
    y: originY + local.y,
    w: local.w,
    h: local.h,
  };
}
```

**单测**：已知重叠/不重叠样例各 2 组；facing=-1 时 hit 翻到左侧。

**陷阱**：中心 vs 左下角混用 → **只允许中心约定**；JSON 注释写清。

---

### Step 4 — MoveDefinition + MovePlayer（5LP 状态机最小）

**文件**：`MoveDefinition.ts`（解析 JSON）、`MovePlayer.ts`  
**状态枚举（禁止扩充花哨名）**

```ts
export type FighterPhase =
  | 'idle'
  | 'walk'
  | 'crouch'
  | 'attack'
  | 'hitstun'
  | 'blockstun'
  | 'knockdown'; // MVP 可不进入
```

**MovePlayer 契约**

- `start(move: MoveDefinition)`：`phase=attack`，`moveFrame=0`，记录 `moveId`。  
- 每逻辑帧 `advance()`：`moveFrame++`；当 `moveFrame >= total` → 回 `idle`。  
- `isHitActive()`：`startup-1 <= moveFrame < startup-1+active` **以写入 JSON 的帧索引约定为准**。  
  **强制帧索引约定（写入代码注释）**：  
  - `moveFrame` 从 0 开始。  
  - **startup = N** 表示第 N 帧起可有 active（与常见 FG：startup 4 ⇒ 第 4 帧出 hit 的记法对齐时：active 覆盖 `moveFrame` 满足 `moveFrame + 1` 落在 startup..startup+active-1）。  
  - 实现时在 `MovePlayer` 写死一种，并在单测用固定 JSON 锁定：  
    **采用**：`hitActive = moveFrame >= (startup - 1) && moveFrame < (startup - 1 + active)`（startup=4,active=2 → frames 3,4 为 active，0-based）。  
  - 与源站对照时在 `review.notes` 说明。  
- 从 JSON `boxes.hit` 的 `from`/`to` **优先**驱动 hit 几何；`from`/`to` 为 inclusive 0-based `moveFrame`。

**单测** `movePlayer_5lp.test.ts`：用固定 fixture JSON（不必真 5LP 数值）验证 active 帧集合。

---

### Step 5 — Fighter + MatchSim + Dummy D2

**DummyController（共识 D2）**

```ts
export type DummyMode = 'stand' | 'crouch' | 'stand_block' | 'crouch_block';
// MVP：stand | stand_block 必须实现；crouch* 可第二迭代
```

- `stand`：hurt 用站立框；不攻击。  
- `stand_block`：若攻击判定为中段/上段（MVP 5LP 当 mid）→ 进 `blockstun` 用 JSON `blockstun` 帧数；否则同受击。  
- **不做** 录制回放（共识排除）。

**MatchSim 每逻辑步顺序（强制，防顺序坑）**

1. 采样输入 → 写入 `InputBuffer`（环形，长度 `INPUT_BUFFER_FRAMES`）  
2. 若可行动：检测 5LP 触发（MVP：`LP` 刚按下且方向 5 或任意非下）  
3. `fighter.advance()` / `dummy.advance()`  
4. 若攻击方 hit active：算 world hit box vs dummy hurt；未击中过本招则检测一次（`hasHitThisMove` 防多段）  
5. 命中：dummy → hitstun（`hitstun` 帧）；攻击方保持 recovery；扣 HP  
6. DriveStub：仅只读 `currentBars`（MVP 不增减，除非 GUI 强制）

**输入（MVP）**

| 键 | 逻辑 |
|----|------|
| A / U | LP |
| S / I | MP（未实装招可忽略） |
| D / O | HP |
| Z/X/C 或 J/K/L | LK/MK/HK |
| 方向 | Arrow 或 WASD（W 上 S 下） |

**InputBuffer**：每逻辑帧 push `{ dir: 1..9 numpad, buttons: bitset }`。  
5LP：**不要求** special 指令机；`critpoints` 仅作后续扩展阅读。

**单测** `matchSim_5lp.test.ts`：无渲染；模拟「帧 0 按下 LP」→ 在 active 帧集合内 dummy `phase===hitstun'` 且 HP 减少。

---

### Step 6 — Three 场景 + glTF 表现 + clip 绑定

**资源路径（强制）**

| 用途 | 路径 |
|------|------|
| 角色冒烟 | `@interim/characters/Xbot.glb` 或 `Soldier.glb` |
| 动画库 | `@interim/animations/selected/AnimationLibrary_Godot_Standard.gltf` |
| clip 映射 | `/data/clips/clip_map.json`（public） |
| 训练场（可选） | 若存在 `private/interim/SF6 Training Stage/SF6 Training Stage.glb` — **仅本地**，加载失败则用 `GridHelper`+平面 |

**FighterView 方法（必须）**

1. `GLTFLoader` 加载角色。  
2. 若使用分离 UAL：加载动画 glTF，用 **同骨架 retarget 仅在后续**；**MVP 优先**：  
   - **路径 A（推荐先做）**：只用 `Soldier.glb` / `Xbot.glb` **自带** clips，手动写第二映射 `clip_map_soldier.json` 把 `5lp`→库内最接近 punch 的 clip 名；或  
   - **路径 B**：UAL 动画仅当骨架兼容时 `AnimationMixer.clipAction`。  
3. **禁止**让 `mixer.update(wallDt)` 决定受击结束帧；逻辑 `phase/moveFrame` 驱动：  
   - 攻击中：`action.paused = true` 或 `mixer.setTime(t)` 其中  
     `t = (moveFrame / (total-1)) * clipDuration`（T11）。  
   - idle：正常 `mixer.update(LOGIC_DT)` 按逻辑步更新 **或** wall 更新但 **时长以逻辑为准**。  
4. **R2**：改帧表不强制改模型。

**DebugDraw**

- 每帧用 `BufferGeometry` + `LineBasicMaterial` 画 AABB 四边（逻辑→世界）；或 `THREE.Box3Helper` 仅当用 3D Box3。  
- hit 红 / hurt 绿；颜色来自 constants。  
- 依据：three `BoxHelper` 文档为 debug 向。

**陷阱**

| 坑 | 处理 |
|----|------|
| 全局 gitignore `*.glb` | 不提交二进制；本地加载即可 |
| UAL 与 Xbot 骨架不匹配 | MVP 用角色自带动画；retarget 另步 |
| mixer 与逻辑不同步 | 攻击用 `setTime` 贴 `moveFrame` |
| 模型巨大/倒地 | GUI 暴露 `modelScale`、`modelYOffset` |

---

### Step 7 — H2 HUD + lil-gui 调试面板（参数清单强制）

**H2 DOM（`HudDom.ts`）必须显示**

| 字段 | 来源 |
|------|------|
| `logicFrame` | FrameClock |
| `p1.phase` / `p2.phase` | Fighter |
| `p1.moveId` / `moveFrame` / `total` | MovePlayer |
| `activeHit` bool | MovePlayer |
| `cancelWindow` 文本 | JSON cancel flags 的字符串化（MVP） |
| HP p1/p2 | Fighter |
| Drive bars | DriveStub |
| DummyMode | DummyController |
| lastHitResult | `whiff \| hit \| block` |

**lil-gui（`DebugGui.ts`）— 必须公开的参数（缺一不可）**

依据：lil-gui 为 three 官方例调试标准（T10）；共识 H2。

#### Folder `Sim`

| 参数名 | 类型 | 绑定 | 范围/选项 |
|--------|------|------|-----------|
| `paused` | bool | 停逻辑步 | — |
| `stepOnce` | button | 逻辑 +1 帧 | — |
| `logicFps` | int | 重建 clock（需确认） | 30–120 |
| `maxLogicStepsPerRaf` | int | FrameClock.maxSteps | 1–8 |
| `maxFrameTimeMs` | number | FrameClock | 16–250 |

#### Folder `Match`

| 参数名 | 类型 | 绑定 |
|--------|------|------|
| `dummyMode` | select | `stand`, `stand_block`, `crouch`, `crouch_block` |
| `resetMatch` | button | HP/相位复位 |
| `p1Hp` / `p2Hp` | number | 可写 |
| `driveBars` | number | DriveStub |

#### Folder `Move5LP`（直接改运行时 MoveDefinition 副本，**不写回磁盘**除非 Save）

| 参数名 | 类型 |
|--------|------|
| `startup` `active` `recovery` | int 0–60 |
| `damage` | int |
| `hitstun` `blockstun` | int |
| `hitBoxX/Y/W/H` | number（当前 active 主框） |
| `hurtBoxX/Y/W/H` | number |
| `reloadJson` | button 从 `/data/moves/ryu_5lp.json` 重载 |
| `logReviewStatus` | 只读字符串 `review.status` |

#### Folder `Render`

| 参数名 | 类型 |
|--------|------|
| `showHitboxes` | bool |
| `showHurtboxes` | bool |
| `worldScale` | number 0.01–10 |
| `modelScale` | number |
| `modelYOffset` | number |
| `cameraZ` / `cameraY` | number |
| `timeScaleAnim` | number 0–2（仅非攻击 scrub 模式） |

#### Folder `Input`

| 参数名 | 类型 |
|--------|------|
| `bufferFrames` | int 1–30 |
| `showBuffer` | bool（HUD 打印最近 N 帧 dir） |

**禁止**进 GUI：文件路径含 `private` 的密钥、自动下载 FAT。

---

### Step 8 — 主循环接线

```ts
// 伪代码契约
const clock = new FrameClock();
let last = performance.now();
function frame(now: number) {
  const wallDt = (now - last) / 1000;
  last = now;
  if (!gui.paused) {
    const steps = clock.tick(wallDt);
    for (let i = 0; i < steps; i++) matchSim.step();
  }
  fighterView.syncFromLogic(matchSim.p1, clock);
  dummyView.syncFromLogic(matchSim.p2, clock);
  debugDraw.update(matchSim);
  hud.update(matchSim, clock);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
renderer.setAnimationLoop?.(null); // 统一 rAF 或 setAnimationLoop 二选一，禁止双循环
requestAnimationFrame(frame);
```

**陷阱**：同时 `setAnimationLoop` 与自建 rAF → 双倍更新；**只保留一种**。

---

### Step 9 — 文档与 ADR 碎片（最小）

在 `docs/decisions/` 新增一条 ADR（短）：

- `ADR-001-logic-fps-60.md`：LOGIC_FPS=60 与帧表单位。  
- `ADR-002-box-center-convention.md`：框中心约定。  
- `ADR-003-move-frame-indexing.md`：0-based 与 startup 对齐公式。

不改 `consensus-v0.md`。

---

## 6. 验收总清单（MVP Done）

| # | 标准 | 验证方式 |
|---|------|----------|
| 1 | 桌面 Chrome WebGPU 进入训练场 | 手动 |
| 2 | 键盘 LP 出 5LP，逻辑帧走完回 idle | 手动 + HUD |
| 3 | active 帧 hitbox 与 Dummy hurt 重叠 → hitstun + 掉血 | 手动 + 单测 |
| 4 | Dummy `stand_block` → blockstun 路径 | 手动 + GUI |
| 5 | lil-gui 可改 startup 并立即影响 active 窗口 | 手动 |
| 6 | `npm test` 全绿 | CI/本地 |
| 7 | 无 WebGL 主路径；无 private 二进制进 git status 待提交 | `git status` |
| 8 | Drive 条可见（数值可不动） | 手动 |

**非目标（本方案结束时仍不做）**：全招、Drive Impact 真系统、Modern、联网、原版 mot、框编辑器、录像。

---

## 7. 技术陷阱汇总（互联网检索已并入方案）

| ID | 坑 | 来源 | 方案内对策 |
|----|----|------|------------|
| P1 | Vite + three WebGPU top-level await | three#26626, discourse, Threlte docs | esnext target；async boot；可选 plugin |
| P2 | 固定帧 spiral of death | Gaffer | maxFrameTime + maxSteps |
| P3 | 动画时长绑架规则 | 共识 R2；gamedev 讨论 frames vs time | MovePlayer 权威；mixer scrub |
| P4 | 帧索引 off-by-one | FG 社区常见 | ADR-003 + 单测钉死 |
| P5 | 中心/角落框混用 | 自研常见 | 唯一中心约定 |
| P6 | glTF 动画名不匹配 | interim README | clip_map；Soldier 回退 |
| P7 | 双 rAF 循环 | three setAnimationLoop | 单一循环 |
| P8 | gitignore 吞 glb | 根 `.gitignore` | 本地 alias；不提交 |
| P9 | 逻辑 import three | 架构污染 | eslint 边界：combat 禁 three（可后续加 eslint-plugin） |
| P10 | 运行时拉 FAT | 共识运行时本地权威 | 仅静态 JSON |
| P11 | 把 Sakuga rollback 引进来 | 共识不做联网 | 禁止依赖 |
| P12 | iCloud 路径空格 | macOS | 脚本始终引号 |
| P13 | GUI 改对象不同步视图 | lil-gui discourse | onChange 调 `matchSim.applyMoveEdit()` |
| P14 | 高 DPI 框线错位 | three 常见 | `renderer.setPixelRatio` + 相机同步 resize |

**社群/文档检索入口（执行遇阻时只查这些，不另发明）**

1. https://gafferongames.com/post/fix_your_timestep/  
2. https://discourse.threejs.org （WebGPURenderer, AnimationMixer）  
3. https://github.com/mrdoob/three.js/issues?q=WebGPURenderer+vite  
4. https://github.com/ikemen-engine/Ikemen-GO/wiki  
5. https://critpoints.net/2025/02/05/how-to-code-fighting-game-motion-inputs/  
6. FAT README：https://github.com/D4RKONION/FAT  
7. 本仓 `docs/research/tech-barrier-cases-2026-08-07.md`

---

## 8. 给 AI 的执行协议

```text
FOR step in Step0..Step9:
  READ 本文件该 Step 的「动作」「验收」「陷阱」
  IMPLEMENT 仅使用「参考仓库/API」列表中的方法
  RUN 验收命令
  IF fail AND 原因在 §7:
    APPLY 对策后重试一次
  ELSE IF fail:
    STOP 输出 BLOCKED: step=N reason=... evidence=...
  ELSE:
    COMMIT 可选：message "stepN: ..." 仅 app/ 与 public/data JSON
禁止：
  - 引入 React/R3F/Godot
  - 添加 netcode
  - 从互联网下载 SF6 模型进 public/
  - 修改 docs/consensus-v0.md
  - 跳过单测写「以后再测」
```

**建议 git 提交粒度**：每完成 Step 1、2、3–5（逻辑）、6–7（表现+GUI）、8–9 各一提交。

---

## 9. Key Decisions（方案层）

| 决策 | 选择 | 依据 |
|------|------|------|
| 应用位置 | `app/` 子目录 | 与 docs/private 隔离，便于 lockfile |
| 渲染 | 仅 WebGPURenderer | 共识 §4.2 |
| 逻辑帧 | 60 + Gaffer accumulator | T1/T2 + 帧数据惯例 |
| 首招 | 5LP only | 共识样板 |
| 表现角色 | Xbot/Soldier 优先 | interim README；避 retarget 阻塞 |
| GUI | lil-gui 全参数 §7 | three 官方习惯 + H2 |
| 帧数据 | 本地 JSON + 三源审查字段 | 共识三层权威 |
| UI 框架 | vanilla DOM + lil-gui | 减依赖，便于 AI 执行 |

---

## 10. PR / 提交切片（供分步 PR）

| 序 | 标题 | 含 Step | 依赖 |
|----|------|---------|------|
| PR1 | chore: Vite TS three WebGPU scaffold | 0–1 | — |
| PR2 | feat(combat): frame clock, boxes, 5LP move player | 2–4 | PR1 |
| PR3 | feat(combat): match sim + dummy D2 + tests | 5 | PR2 |
| PR4 | feat(render): glTF views + debug boxes + HUD/GUI | 6–8 | PR3 |
| PR5 | docs: ADR frame indexing + box convention | 9 | PR4 |

---

## 11. Open Questions（执行前需人确认的仅此；其余已锁）

| # | 问题 | 默认（若无人答则用此） |
|---|------|------------------------|
| Q1 | 5LP 具体帧数以 FAT / SuperCombo / 官方谁为第一采信？ | **FAT + SuperCombo 交叉，官方补**；`review.status=placeholder` 直到人工标 reviewed |
| Q2 | Dummy  crouch 是否进 MVP？ | **否**；GUI 可留选项但映射到 stand 等价并 log warn |
| Q3 | 是否允许 `vite-plugin-top-level-await`？ | **仅当 esnext 仍失败时** |

---

## 修订

| 版本 | 日期 | 说明 |
|------|------|------|
| v0 | 2026-08-07 | 首版：AI 可执行 MVP；含仓库方法、GUI 参数强制表、检索陷阱 P1–P14 |

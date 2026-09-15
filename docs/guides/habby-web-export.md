# Habby Game Share：Web 导出经验手册

> 最近修订：**2026-09-10**（首次完整导出 2026-08-21；音频层纳入出包 2026-09-10）  
> 适用：本仓库 Vite + Three.js（WebGPU）训练场 → 静态 ZIP 上传 Habby  
> 产出物：仓库根目录 `StreetFighter6-habby.zip`  
> 平台硬性约束：**ZIP 根目录必须有 `index.html`**；**包体 ≤ 200 MiB**

以后出包只跑 `npm run package:habby`，用本文当对照清单。不要只 zip `vite build` 的 `dist/`。

---

## 0. 一句话结论

Habby 是**纯静态托管**：没有 Vite 开发中间件，也没有你本机浏览器的 `localStorage`。

出包必须同时做到：

1. 把运行时 URL 用到的资源**物化进 dist**（`private-runtime` 网格/贴图/**SFX**、`private-assets` 动作、`public/vfx` 2D 序列帧）。  
2. 把编辑器里调好的**出厂数据**打进 JSON（`presets/shipping.json` + `vfx/hit_ref_v1/recipes.json`），不要假设线上能读到本机存档。  
3. 对动作 GLB **strip mesh**（只留骨骼轨），才能进 200 MiB。  
4. **不要**对角色 `mesh_only` 做 weld/simplify：会焊穿头/脸 UV，花脸。

一键命令（在 `app/`）：

```bash
npm run package:habby
```

脚本：[`app/scripts/package-habby.mjs`](../../app/scripts/package-habby.mjs)

实测（**2026-09-10**，含四层 SFX）：

| 指标 | 数值 |
|------|------|
| ZIP | **~56.6 MiB** |
| dist 合计 | ~121–122 MiB |
| 动作 strip 后 | ~70.2 MiB（**135** 条 mapped） |
| prepared 贴图 | ~21.4 MiB（55 张） |
| mesh_only | ~10.6 MiB（未减面） |
| SFX 整树 | ~172–220 KiB（24 个 `.ogg` + manifest；对包体可忽略） |

---

## 1. Habby 平台要求

| 要求 | 本项目做法 |
|------|------------|
| ZIP 根目录含 `index.html` | `cd dist && zip -r … .`（压的是 **内容**，不是外层 `dist/` 文件夹） |
| 前端先生产构建 | 脚本内 `npx vite build`（跳过会拦门的 `tsc`；完整 `npm run build` 若 TS 报错可先修再切） |
| 勿带源工程 | 勿把 `private/` 源树、`.blend`、`vfx-ai-pipeline` 全量、`sfx-lab`、`node_modules`、`.git` 打进 ZIP |
| 包体 ≤ **200 MiB** | strip 动作 + 贴图降采样后约 **56–57 MiB** |

站点按 **ZIP 根 = 站点根** 假设，运行时 URL 用绝对路径：`/private-runtime/…`、`/private-assets/…`、`/vfx/…`、`/presets/…`、`/data/…`。

---

## 2. 路径对照（开发磁盘 → URL → 出包）

Habby 出包最容易踩的坑是：**本机能听/能播，不等于 ZIP 里有文件**。下表是唯一权威映射。

| 用途 | 仓库磁盘路径（原料） | 运行时 URL | 出包后在 ZIP / dist 里 |
|------|----------------------|------------|------------------------|
| 蒙皮网格 | `private/runtime/ryu/ryu_c1_mesh_only.glb` | `/private-runtime/ryu/ryu_c1_mesh_only.glb` | `private-runtime/ryu/ryu_c1_mesh_only.glb` |
| 角色贴图 | `private/runtime/ryu/textures/prepared/*.png` | `/private-runtime/ryu/textures/prepared/…` | 同左（sharp 降采样后同名 `.png`） |
| 战斗动作 | `private/assets/ryu/anims/<相对路径>` | `/private-assets/ryu/anims/<相对路径>` | 同左（**strip mesh** 后） |
| 逻辑→动作表 | `app/public/data/clips/ryu_logic_to_glb_map.json` | `/data/clips/ryu_logic_to_glb_map.json` | `data/clips/…`（vite 拷 `public/`） |
| 招式 / 系统 JSON | `app/public/data/moves|systems|overrides/…` | `/data/…` | `data/…` |
| 出厂配置 | `app/public/presets/shipping.json` | `/presets/shipping.json` | `presets/shipping.json` |
| 2D 序列帧 | `app/public/vfx/hit_ref_v1/<E*>/frame-XX.png`（由 pipeline 物化） | `/vfx/hit_ref_v1/…` | `vfx/hit_ref_v1/…` |
| 2D L/M/H 配方 | `app/public/vfx/hit_ref_v1/recipes.json` | `/vfx/hit_ref_v1/recipes.json` | 同左 |
| **SFX manifest** | `private/runtime/sfx/manifest.json` | `/private-runtime/sfx/manifest.json` | `private-runtime/sfx/manifest.json` |
| **SFX 音频** | `private/runtime/sfx/<layer>/<name>.ogg` | `/private-runtime/sfx/<layer>/<name>.ogg` | 同左（整树拷贝） |

要点：

- 磁盘上的 `private/runtime/…` ↔ URL `/private-runtime/…`（**runtime 中间多一个连字符**）。  
- 磁盘上的 `private/assets/…` ↔ URL `/private-assets/…`。  
- `app/public/**` ↔ URL `/`（无 `public` 前缀）。  
- Vite 插件 [`ryuAnimAssets.ts`](../../app/vite-plugins/ryuAnimAssets.ts) 只在 **dev / preview** 映射 `private/`；**生产 build 不会自动拷**。出包脚本必须显式物化。

### 2.1 开发时 vs 出包时

```text
本地 npm run dev
  ├─ public/**                 → 直接可访问（data/、presets/、vfx/）
  ├─ /private-runtime/*        → 插件映射 private/runtime/（含 sfx/*.ogg）
  ├─ /private-assets/*         → 插件映射 private/assets/
  └─ localStorage              → 2D 特效编辑器配方、部分调试配置

vite build 默认
  └─ 只拷贝 public/ + 打包进 JS 的 import 资产
     ★ 不包含 private/runtime（网格、贴图、SFX）
     ★ 不包含 private/assets（动作）
     ★ 不包含本机 localStorage
```

因此 **`vite preview` 不能代替静态 dist 验收**——preview 仍会经插件读磁盘 `private/`，线上 Habby 没有这份映射。

### 2.2 运行时谁读这些路径

| 资源 | 代码入口 |
|------|----------|
| 蒙皮网格 | `RYU_MESH_ONLY_URL`；boot 优先这条 |
| 角色贴图 | `applyPreparedRyuArt.ts` |
| 战斗动作 | `logicGlbMap.ts`、`AnimClipLibrary`（只绑轨） |
| 2D 帧 / 配方 | `hitVfxEditor/flipbook2d/catalog.ts`、`persist.ts`、`defaults.ts` |
| SFX | `SfxCatalog.ts`（manifest）→ `SfxPlayer.ts`（解码播放）；槽位映射 `SfxSlots.ts`；脚步 `WalkFootstepSfx.ts`；战斗侧回调在 `MatchSim` |

`AnimClipLibrary` 只绑定动画轨到 boot 角色网格，所以动作 GLB 里的 mesh/材质对战斗是冗余的——strip 的依据。

音效**触发**已打进 JS bundle；**素材**必须物化 `private/runtime/sfx`。播放以 manifest 为准：仅 `status=accepted` 且 `file` 非空的槽会发声。

### 2.3 失败症状

| 症状 | 原因 |
|------|------|
| 一直 T-pose / 不动 | `/private-assets/...` 404，clip 预加载失败 |
| 灰模 / 无材质 | `/private-runtime/.../textures/prepared` 404 |
| 身体还对、头和脸花掉 | 对 `mesh_only` 做了 weld/simplify，UV 缝被焊穿 |
| 有 2D 闪光但轻/中/重一个样、不像编辑器 | 配方只在本机 `localStorage`，包内没有 `recipes.json` / shipping.`flipbook2d` |
| 2D 缺层、缺后半段帧 | 曾用仓库外 `import.meta.glob`，生产只打进部分 hashed PNG |
| 有模但粗糙或兜底 | 退到 `public/models/ryu/ryu_c1.glb`（出包脚本会删掉这份） |
| 控制台 `[sfx] manifest missing` / 全面无声 | 包内缺 `private-runtime/sfx/`（只 zip 了 vite dist） |
| 部分槽位静音（block / wakeup） | manifest 里该槽 `status=missing`；磁盘上可能仍有 `.ogg`，但运行时不播——属原料未验收，不是出包漏拷 |
| 点页面前完全无声 | 浏览器 `AudioContext` 未解锁；需一次用户手势（点击/按键） |

---

## 3. 体积（对照）

未优化完整美术：ZIP ~698 MiB；动作约占 93%；mapped 动作曾约 131 条 × ~11 MiB（每条含整模）。

当前出包（**2026-09-10**）：

| 指标 | 数值 |
|------|------|
| ZIP | **~56.6 MiB** |
| dist 合计 | ~121–122 MiB |
| 动作 strip 后 | ~70.2 MiB raw（**135** 条） |
| 角色 prepared 贴图（sharp） | ~21.4 MiB（55 张） |
| mesh_only（**不减面**） | ~10.6 MiB，约 19 万三角 |
| 舞台 hashed GLB | ~9.5 MiB（几何本身约 40 三角，体积在贴图） |
| 2D 序列帧 | 76 张 PNG + `recipes.json` |
| SFX | manifest + 24×`.ogg` ≈ **0.2 MiB** |

SFX 体积可忽略；漏拷会导致「看起来一切正常但完全无声」。

---

## 4. 出包流水线

脚本：`app/scripts/package-habby.mjs`。

```text
0) 从 vfx-ai-pipeline/runs/hit_ref_v1/<layer>/frames
     物化 → app/public/vfx/hit_ref_v1/<layer>/frame-XX.png
     写 manifest.json；拷贝 recipes.json
     帧数必须与 catalog.ts / CATALOG_FRAME_COUNTS 一致（当前 76）
1) npx vite build
2) 再拷一遍 VFX 进 dist/vfx（防止 public 漏拷）
   对 dist/assets/SF6 Training Stage-*.glb 可 weld+simplify
   （当前舞台几乎无三角，这一步基本是空操作）
3) 删除 dist 内重复 public 网格
     models/ryu/ryu_c1.glb
     models/ryu/ryu_c1_textured.glb
4) 原样拷贝 private/runtime/ryu/ryu_c1_mesh_only.glb
     → dist/private-runtime/ryu/
     ★ 禁止 weld/simplify 角色网格
5) sharp 压缩 prepared 贴图（同名 .png）
     颜色类 ≤1024；bump/rough 等 ≤512
     → dist/private-runtime/ryu/textures/prepared/
6) 原样拷贝 private/runtime/sfx/（整树：manifest.json + *.ogg）
     → dist/private-runtime/sfx/
     校验：每个 status=accepted 的 file 都存在于 dest
7) 读 public/data/clips/ryu_logic_to_glb_map.json
     收集 primaryPath + clips[].path
8) 每条 mapped 动作：strip mesh/material/skin/texture
     + resample + prune(keepLeaves) + dedup
     → dist/private-assets/ryu/anims/<相对路径>
9) zip -9：在 dist/ 内打包「.」→ 仓库根 StreetFighter6-habby.zip
   只排除 *.DS_Store（不要 -x '*_preview*'，会误伤 hashed 名）
10) 校验：index.html 根路径、mesh、prepared、anims、76 帧、
    recipes.json、shipping.json、sfx manifest + accepted ogg、ZIP ≤ 200 MiB
```

### 4.1 Strip 动作 GLB

`writeStripAnimGlb`：dispose mesh/material/texture/skin，节点 `setMesh(null)` / `setSkin(null)`，再 resample → prune(keepLeaves) → dedup。保留骨骼层级 + Animation channels。idle 样例约 11.5 MiB → 0.66 MiB。

不要对动作写入 Draco / `EXT_meshopt_compression`：运行时 `GLTFLoader` 未挂解码器，线上会直接挂。

### 4.2 只打映射动作

`private/assets/ryu/anims` 全量约 4 GiB / 330+ glb。出包只收 `ryu_logic_to_glb_map.json` 引用路径（2026-09-10 实测 **135**）。新增招式：先改逻辑表，再 `package:habby`。

### 4.3 2D 命中特效（序列帧 + 配方）

**帧：** 不要用 `import.meta.glob` 去扫仓库外的 `vfx-ai-pipeline`。生产构建只会打进一部分 hashed PNG（上次约 54/76）。运行时改为静态路径：

`/vfx/hit_ref_v1/<layer>/frame-00.png` …

层与帧数（须与 `catalog.ts` 同步）：

| 层 | 帧数 |
|----|------|
| E1_core_flash | 10 |
| E1a_core_flash | 13 |
| E2_near_sparks | 10 |
| E3_ring_smoke | 14 |
| E4_wide_short_smoke | 14 |
| E5_narrow_long_smoke | 14 |
| E6_narrow_long_smoke_rtl | 14 |
| **合计** | **76** |

**配方：** 轻/中/重是三套独立 recipe（缩放、偏移、透明度不同），存在：

- 本机编辑器：`localStorage` 键 `sf6.flipbook2d.hit_ref_v1`（仅本机）  
- 出厂：`app/public/vfx/hit_ref_v1/recipes.json`  
- 备份：`shipping.json` 根级字段 `flipbook2d`

加载顺序：有 localStorage 用本机（方便继续改）；Habby 没有存档 → `hydrateFlipbookFactory()` 拉 `recipes.json`，并读 shipping 里的 `flipbook2d`。代码默认 `defaultFlipbookBank()` 也从 `recipes.json` 来，不再把 L/H 做成中等的拷贝。

编辑器「保存工程」会把当前 L/M/H 写进下载的 `shipping.json`（`exportShippingJson`）。覆盖 `public/presets/shipping.json` 后，把同一份 recipes 同步到 `public/vfx/hit_ref_v1/recipes.json`，再出包。

### 4.4 角色网格：不要减面

曾对 `mesh_only` 做 weld + simplify（约 19 万 → 10 万三角）。身体 UV 岛大还能看，头/脸 UV 碎，立刻花脸。出包必须**原样拷贝** `ryu_c1_mesh_only.glb`。舞台 GLB 可以减面，但当前几何已经极低，体积在贴图上。

`shipping.json` 里的武打粒子数、perf overlay 等会随 `public/presets/` 进包，不依赖本机 localStorage。

### 4.5 战斗音效（四层 SFX）

原料由 [`sfx-lab`](../../sfx-lab/) 导出到 `private/runtime/sfx/`（细节见 [`sfx-four-layer-pipeline-v0.md`](../research/sfx-four-layer-pipeline-v0.md)）。出包脚本**整树拷贝**该目录，并校验 accepted 槽对应文件存在。

| 层 | 示例 slot | 战斗侧触发（已在 JS） |
|----|-----------|----------------------|
| contact · hit | `contact/hit_punch_l` … `hit_kick_h` | 命中（拳/脚 × L/M/H） |
| contact · block | `contact/block_l\|m\|h` | 格挡（当前可能仍 `missing`） |
| swing | `swing/punch_l` … `kick_h` | 出招起手 / 挥空 |
| loco | `loco/dash_*`、`footstep_*`、`jump`、`jump_cloth`、`land` | 冲刺 / 脚步 / 跳落 |
| knockdown | `knockdown/body_fall`、`wakeup` | 倒地；`wakeup` 可能仍 `missing` |

**2026-09-10 实测：**

- manifest：24 槽；**20 accepted** 可播；**4 missing**：`contact/block_l|m|h`、`knockdown/wakeup`  
- 磁盘上上述 missing 槽也可能已有 `.ogg`（会进 ZIP），但 `CombatSfxPlayer` **只播 accepted**  
- 要让格挡/起身出声：在 `sfx-lab` 验收后把槽改成 `accepted` 再出包，而不是只往目录丢文件

路径口诀：

```text
private/runtime/sfx/contact/hit_punch_l.ogg
        ↓ 出包拷贝
dist/private-runtime/sfx/contact/hit_punch_l.ogg
        ↓ Habby / 静态服
GET /private-runtime/sfx/contact/hit_punch_l.ogg
```

---

## 5. ZIP 应有的形状

```text
StreetFighter6-habby.zip          # 根目录即站点根
├── index.html                    # ★ 必须
├── assets/                       # JS/CSS + 舞台 / Soldier / Xbot
├── data/                         # moves / clips / systems JSON
├── presets/shipping.json         # 出厂配置 + 可选 flipbook2d
├── vfx/hit_ref_v1/
│   ├── manifest.json
│   ├── recipes.json              # L/M/H 编辑器配方
│   └── <E1–E6>/frame-*.png       # 76 张
├── models/ryu/                   # 可仅剩 clips.json / README
├── private-runtime/ryu/
│   ├── ryu_c1_mesh_only.glb      # 未减面
│   └── textures/prepared/*.png
├── private-runtime/sfx/
│   ├── manifest.json             # 槽位表（accepted / missing）
│   ├── contact/*.ogg
│   ├── swing/*.ogg
│   ├── loco/*.ogg
│   └── knockdown/*.ogg
└── private-assets/ryu/anims/.../glb/*.glb
```

URL 与文件夹名必须一致（注意 `private-runtime` / `private-assets` 带连字符）。

---

## 6. 代码索引

| 主题 | 路径 |
|------|------|
| 出包脚本 | `app/scripts/package-habby.mjs` |
| npm 命令 | `app/package.json` → `package:habby` |
| Vite private 中间件 | `app/vite-plugins/ryuAnimAssets.ts`（含 `.ogg` MIME + sfx manifest） |
| 网格 / 动作 URL | `app/src/data/logicGlbMap.ts` |
| 角色贴图 | `app/src/render/applyPreparedRyuArt.ts` |
| 动作只播轨 | `app/src/render/AnimClipLibrary.ts` |
| SFX 槽位 / 触发映射 | `app/src/combat/sfx/SfxSlots.ts` |
| SFX 播放器 | `app/src/combat/sfx/SfxPlayer.ts` |
| SFX manifest 读取 | `app/src/combat/sfx/SfxCatalog.ts` |
| 脚步节奏 | `app/src/combat/sfx/WalkFootstepSfx.ts` |
| 2D 帧 URL | `app/src/hitVfxEditor/flipbook2d/catalog.ts` |
| 2D 配方加载 | `app/src/hitVfxEditor/flipbook2d/persist.ts` |
| 出厂 bank | `app/src/hitVfxEditor/flipbook2d/defaults.ts` ← `recipes.json` |
| shipping 导出（含 flipbook2d） | `app/src/config/persist.ts` `exportShippingJson` |
| 逻辑映射表 | `app/public/data/clips/ryu_logic_to_glb_map.json` |
| 出厂预设 | `app/public/presets/shipping.json` |
| 2D 配方源 | `app/public/vfx/hit_ref_v1/recipes.json` |
| 序列帧源 | `vfx-ai-pipeline/runs/hit_ref_v1/*/frames/` |
| 运行时网格 | `private/runtime/ryu/ryu_c1_mesh_only.glb` |
| 战斗音效源 | `private/runtime/sfx/`（`sfx-lab` 导出） |
| 动作源 | `private/assets/ryu/anims/**` |
| 角色 runtime 导出 | [`runtime-export-target.md`](./runtime-export-target.md) |
| SFX 四层管线 | [`sfx-four-layer-pipeline-v0.md`](../research/sfx-four-layer-pipeline-v0.md) |

出包 dev 依赖：`@gltf-transform/core|functions|extensions`、`sharp`、`meshoptimizer`（用于舞台 simplify；**不**写入 meshopt 扩展）。

---

## 7. 操作步骤

出包前若刚在特效编辑器改过 2D 轻/中/重：先「保存工程」覆盖 `app/public/presets/shipping.json`，并把其中 `flipbook2d` 同步为 `app/public/vfx/hit_ref_v1/recipes.json`。

出包前若刚在 `sfx-lab` 换过音：确认 `private/runtime/sfx/manifest.json` 的 `exportedAt` 与 accepted 列表符合预期，再跑脚本（脚本会整树拷贝）。

```bash
# 1. 确认原料
ls private/runtime/ryu/ryu_c1_mesh_only.glb
ls private/runtime/ryu/textures/prepared/head_color.png
test -f private/runtime/sfx/manifest.json
ls private/runtime/sfx/contact/hit_punch_l.ogg
test -f app/public/data/clips/ryu_logic_to_glb_map.json
test -f app/public/vfx/hit_ref_v1/recipes.json
test -f app/public/presets/shipping.json

# 2. 出包
cd app
npm run package:habby

# 3. 检查（仓库根）
ls -lh StreetFighter6-habby.zip          # 应 < 200M；近期约 56–57M
unzip -l StreetFighter6-habby.zip | head  # 附近应有 index.html
unzip -l StreetFighter6-habby.zip | grep 'private-runtime/ryu/ryu_c1_mesh_only'
unzip -l StreetFighter6-habby.zip | grep -c 'private-assets/ryu/anims/.*\.glb'   # ≈135
unzip -l StreetFighter6-habby.zip | grep -c 'vfx/hit_ref_v1/.*/frame-.*\.png'    # 76
unzip -l StreetFighter6-habby.zip | grep 'vfx/hit_ref_v1/recipes.json'
unzip -l StreetFighter6-habby.zip | grep 'presets/shipping.json'
unzip -l StreetFighter6-habby.zip | grep 'private-runtime/sfx/manifest.json'
unzip -l StreetFighter6-habby.zip | grep -c 'private-runtime/sfx/.*\.ogg'        # ≥20（整树可 24）
```

本地冒烟（必须用静态服，不要 `vite preview`）：

```bash
cd app/dist && python3 -m http.server 4173
# http://127.0.0.1:4173
# 角色贴图正常（头/脸不花）、idle 循环、出招有 clip
# 轻/中/重命中 2D 特效有大小/层偏移差异，像编辑器里那套
# 先点一下页面解锁 AudioContext → 出招有 swing/hit、走路有脚步
```

---

## 8. 验收清单

- [ ] ZIP **根**有 `index.html`  
- [ ] `private-runtime/ryu/ryu_c1_mesh_only.glb`（未减面，约 10.6 MiB）  
- [ ] `private-runtime/ryu/textures/prepared/` 下主要 `*_color.png`  
- [ ] `private-runtime/sfx/manifest.json` + accepted `*.ogg`（约 20 accepted；整树可含 24 个文件）  
- [ ] `private-assets/ryu/anims/` 数量与逻辑表 mapped 路径一致（近期约 135）  
- [ ] `vfx/hit_ref_v1/` 六层共 76 张 `frame-*.png`  
- [ ] `vfx/hit_ref_v1/recipes.json` 含 L/M/H（轻/中/重不是同一套拷贝）  
- [ ] `presets/shipping.json` 在包内（`hitVfxPlayMode` 应为 `flipbook2d`）  
- [ ] ZIP ≤ **200 MiB**（近期约 56–57 MiB）  
- [ ] 静态服：贴图正确、非永久 T-pose、轻中重 2D 可区分、战斗 SFX 可听  
- [ ] 未打进 `private/` 整树、源码、`node_modules`、`.git`、`vfx-ai-pipeline` / `sfx-lab` 全量  

---

## 9. 历史坑与对策

| 坑 | 对策 |
|----|------|
| 只 zip 了 vite 的 dist → T-pose / 无贴图 | 物化 `private-runtime` + `private-assets` |
| 原样拷贝百余条带网格动作 → 698 MB | strip mesh；`AnimClipLibrary` 只播轨 |
| 打进全部 `anims/`（4 GiB） | 只打逻辑表引用路径 |
| 保留 `public/models/ryu/*.glb` 双份 | 脚本删除；shipping 以 mesh_only 为准 |
| `npm run build` 因 `tsc` 失败 | 出包用 `npx vite build` |
| 对动作写 Draco/meshopt 扩展但未改 loader | 勿写 |
| 贴图改成 `.webp` 未改代码 | sharp 仍输出同名 `.png` |
| `vite preview` 冒充出包验证 | 用纯静态服验 `dist/` |
| 2D 走仓库外 glob，生产缺帧 | 物化 `public/vfx/` 静态 URL；脚本按层数校验 |
| zip `-x '*_preview*'` 误伤 hashed 名 | 只排除 `.DS_Store` |
| 对 mesh_only weld+simplify | **禁止**；头/脸花贴图 |
| 2D 配方只在 localStorage | 打进 `recipes.json` + shipping.`flipbook2d`；Habby 无存档 |
| 代码默认把 L/H 做成中等拷贝 | `defaultFlipbookBank()` 读编辑器配方 |
| 编辑器「保存工程」以前不含 2D | `exportShippingJson` 现带 `flipbook2d` |
| 只 zip vite dist → 无战斗音效 | 物化 `private-runtime/sfx`（整树 + 校验 accepted） |
| 目录里有 `.ogg` 但仍无声 | 看 manifest：`status` 必须是 `accepted` 且 `file` 指向真实路径 |
| 混淆 `private/runtime` 与 URL | URL / ZIP 目录名是 **`private-runtime`**（带连字符） |

---

## 10. 若再次超限（按性价比）

1. 再压贴图：颜色 512，或 WebP/KTX2（需改 `applyPreparedRyuArt`）  
2. **不要**用 weld/simplify 压 `mesh_only`；若必须降面，另做保留 UV 岛/蒙皮的离线流程，并目视验收头/手套  
3. 裁剪映射集：演示包只带 boot 预加载 + 少量攻击  
4. 舞台主要压贴图，而不是三角  
5. 去掉 Soldier/Xbot 兜底（省数 MB）  
6. SFX 几乎不占体积，**不要**为了省包体删音效  

---

## 11. 和上游导出的关系

| 上游 | 产出 | 本文角色 |
|------|------|----------|
| [`runtime-export-target.md`](./runtime-export-target.md) | RE 原料 → `private/runtime` 网格/贴图 + clips | 出包消费 mesh / textures |
| `sfx-lab` + [`sfx-four-layer-pipeline-v0.md`](../research/sfx-four-layer-pipeline-v0.md) | → `private/runtime/sfx/` | 出包消费 manifest + ogg |
| `vfx-ai-pipeline/runs/hit_ref_v1` | 序列帧 → 物化进 `app/public/vfx/` | 出包再拷进 dist |

推荐顺序：

1. 本地 `npm run dev`：美术、动作、2D 轻中重、战斗 SFX 都正确（先点页面解锁音频）。  
2. 2D：配方写入 `recipes.json` / shipping。  
3. 音频：`sfx-lab` 导出并确认 accepted 列表。  
4. `cd app && npm run package:habby`。  
5. 纯静态服冒烟 `app/dist`。  
6. 上传 `StreetFighter6-habby.zip`。

---

## 12. 变更记录

| 日期 | 摘要 |
|------|------|
| 2026-08-21 | 首次完整导出：private 未进包；strip 动作 + 贴图降采样，ZIP ~54 MiB；脚本落地 |
| 2026-09-09 | 2D 帧改为 public 静态路径并校验 76 张；禁止角色 mesh simplify；shipping + `recipes.json` 带编辑器 L/M/H；ZIP ~55.8 MiB |
| 2026-09-10 | 出包物化 `private-runtime/sfx`；校验 accepted OGG；文档补「磁盘→URL→ZIP」路径对照；实测 ZIP ~56.6 MiB、mapped 动作 135、SFX 20/24 accepted |

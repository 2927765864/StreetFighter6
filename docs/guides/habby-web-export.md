# Habby Game Share：Web 导出经验手册

> 最近修订：**2026-09-09**（首次完整导出 2026-08-21）  
> 适用：本仓库 Vite + Three.js（WebGPU）训练场 → 静态 ZIP 上传 Habby  
> 产出物：仓库根目录 `StreetFighter6-habby.zip`  
> 平台硬性约束：**ZIP 根目录必须有 `index.html`**；**包体 ≤ 200 MiB**

以后出包只跑 `npm run package:habby`，用本文当对照清单。不要只 zip `vite build` 的 `dist/`。

---

## 0. 一句话结论

Habby 是**纯静态托管**：没有 Vite 开发中间件，也没有你本机浏览器的 `localStorage`。

出包必须同时做到：

1. 把运行时 URL 用到的资源**物化进 dist**（`private-runtime` 网格/贴图、`private-assets` 动作、`public/vfx` 2D 序列帧）。  
2. 把编辑器里调好的**出厂数据**打进 JSON（`presets/shipping.json` + `vfx/hit_ref_v1/recipes.json`），不要假设线上能读到本机存档。  
3. 对动作 GLB **strip mesh**（只留骨骼轨），才能进 200 MiB。  
4. **不要**对角色 `mesh_only` 做 weld/simplify：会焊穿头/脸 UV，花脸。

一键命令（在 `app/`）：

```bash
npm run package:habby
```

脚本：[`app/scripts/package-habby.mjs`](../../app/scripts/package-habby.mjs)

实测（2026-09-09）：ZIP **~55.8 MiB**，`dist` **~118 MiB**。

---

## 1. Habby 平台要求

| 要求 | 本项目做法 |
|------|------------|
| ZIP 根目录含 `index.html` | `cd dist && zip -r … .`（压的是 **内容**，不是外层 `dist/` 文件夹） |
| 前端先生产构建 | 脚本内 `npx vite build`（跳过会拦门的 `tsc`；完整 `npm run build` 若 TS 报错可先修再切） |
| 勿带源工程 | 勿把 `private/` 源树、`.blend`、`vfx-ai-pipeline` 全量、`node_modules`、`.git` 打进 ZIP |
| 包体 ≤ **200 MiB** | strip 动作 + 贴图降采样后约 **56 MiB** |

站点按 **ZIP 根 = 站点根** 假设，运行时 URL 用绝对路径 `/private-runtime/…`、`/vfx/…`、`/presets/…`。

---

## 2. 开发时 vs 出包时

```text
本地 npm run dev
  ├─ public/**                 → 直接可访问（data/、presets/、vfx/）
  ├─ /private-runtime/*        → Vite 插件映射 private/runtime/
  ├─ /private-assets/*         → Vite 插件映射 private/assets/
  └─ localStorage              → 2D 特效编辑器配方、部分调试配置

vite build 默认
  └─ 只拷贝 public/ + 打包进 JS 的 import 资产
     ★ 不包含 private/
     ★ 不包含本机 localStorage
```

插件：[`app/vite-plugins/ryuAnimAssets.ts`](../../app/vite-plugins/ryuAnimAssets.ts)  
只在 `configureServer` / `configurePreviewServer` 挂静态服务，**没有** `closeBundle` 拷贝。因此 **`vite preview` 不能代替静态 dist 验收**——它仍会读磁盘 `private/`。

### 2.1 运行时加载什么

| 资源 | URL | 代码 / 文件 |
|------|-----|-------------|
| 蒙皮网格 | `/private-runtime/ryu/ryu_c1_mesh_only.glb` | `RYU_MESH_ONLY_URL`；boot 优先这条 |
| 角色贴图 | `/private-runtime/ryu/textures/prepared/…` | `applyPreparedRyuArt.ts` |
| 战斗动作 | `/private-assets/ryu/anims/<map path>` | `logicGlbMap.ts`、`AnimClipLibrary`（只取轨） |
| 逻辑→路径表 | `/data/clips/ryu_logic_to_glb_map.json` | `public/data/clips/` |
| 出厂配置 | `/presets/shipping.json` | 粒子、灯光、`hitVfxPlayMode`、perf 等；可带 `flipbook2d` |
| 2D 序列帧 | `/vfx/hit_ref_v1/<E1–E6>/frame-XX.png` | `catalog.ts` 静态 URL，当前 76 张 |
| 2D 轻/中/重配方 | `/vfx/hit_ref_v1/recipes.json` | 编辑器 L/M/H；Habby 无 localStorage 时用这份 |

`AnimClipLibrary` 只绑定动画轨到 boot 角色网格，所以动作 GLB 里的 mesh/材质对战斗是冗余的——strip 的依据。

### 2.2 失败症状

| 症状 | 原因 |
|------|------|
| 一直 T-pose / 不动 | `/private-assets/...` 404，clip 预加载失败 |
| 灰模 / 无材质 | `/private-runtime/.../textures/prepared` 404 |
| 身体还对、头和脸花掉 | 对 `mesh_only` 做了 weld/simplify，UV 缝被焊穿 |
| 有 2D 闪光但轻/中/重一个样、不像编辑器 | 配方只在本机 `localStorage`（`sf6.flipbook2d.hit_ref_v1`），包内没有 `recipes.json` / shipping.`flipbook2d` |
| 2D 缺层、缺后半段帧 | 曾用仓库外 `import.meta.glob`，生产只打进部分 hashed PNG |
| 有模但粗糙或兜底 | 退到 `public/models/ryu/ryu_c1.glb`（出包脚本会删掉这份） |

---

## 3. 体积（对照）

未优化完整美术：ZIP ~698 MiB；动作约占 93%；mapped 动作约 131 条 × ~11 MiB（每条含整模）。

当前出包（2026-09-09）：

| 指标 | 数值 |
|------|------|
| ZIP | **~55.8 MiB** |
| dist 合计 | ~118.6 MiB |
| 动作 strip 后 | ~68 MiB raw（131 条） |
| 角色 prepared 贴图（sharp） | ~21.4 MiB（55 张） |
| mesh_only（**不减面**） | ~10.6 MiB，约 19 万三角 |
| 舞台 hashed GLB | ~9.5 MiB（几何本身约 40 三角，体积在贴图） |
| 2D 序列帧 | 76 张 PNG + `recipes.json` |

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
6) 读 public/data/clips/ryu_logic_to_glb_map.json
     收集 primaryPath + clips[].path
7) 每条 mapped 动作：strip mesh/material/skin/texture
     + resample + prune(keepLeaves) + dedup
     → dist/private-assets/ryu/anims/<相对路径>
8) zip -9：在 dist/ 内打包「.」→ 仓库根 StreetFighter6-habby.zip
   只排除 *.DS_Store（不要 -x '*_preview*'，会误伤 hashed 名）
9) 校验：index.html 根路径、mesh、prepared、anims、76 帧、
   recipes.json、shipping.json、ZIP ≤ 200 MiB
```

### 4.1 Strip 动作 GLB

`writeStripAnimGlb`：dispose mesh/material/texture/skin，节点 `setMesh(null)` / `setSkin(null)`，再 resample → prune(keepLeaves) → dedup。保留骨骼层级 + Animation channels。idle 样例约 11.5 MiB → 0.66 MiB。

不要对动作写入 Draco / `EXT_meshopt_compression`：运行时 `GLTFLoader` 未挂解码器，线上会直接挂。

### 4.2 只打映射动作

`private/assets/ryu/anims` 全量约 4 GiB / 330+ glb。出包只收 `ryu_logic_to_glb_map.json` 引用路径（约 131）。新增招式：先改逻辑表，再 `package:habby`。

### 4.3 2D 命中特效（序列帧 + 配方）

**帧：** 不要用 `import.meta.glob` 去扫仓库外的 `vfx-ai-pipeline`。生产构建只会打进一部分 hashed PNG（上次约 54/76）。运行时改为静态路径：

`/vfx/hit_ref_v1/<layer>/frame-00.png` …

层与帧数（须与 `catalog.ts` 同步）：

| 层 | 帧数 |
|----|------|
| E1_core_flash | 10 |
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
└── private-assets/ryu/anims/.../glb/*.glb
```

URL 与文件夹名必须一致。

---

## 6. 代码索引

| 主题 | 路径 |
|------|------|
| 出包脚本 | `app/scripts/package-habby.mjs` |
| npm 命令 | `app/package.json` → `package:habby` |
| Vite private 中间件 | `app/vite-plugins/ryuAnimAssets.ts` |
| 网格 / 动作 URL | `app/src/data/logicGlbMap.ts` |
| 角色贴图 | `app/src/render/applyPreparedRyuArt.ts` |
| 动作只播轨 | `app/src/render/AnimClipLibrary.ts` |
| 2D 帧 URL | `app/src/hitVfxEditor/flipbook2d/catalog.ts` |
| 2D 配方加载 | `app/src/hitVfxEditor/flipbook2d/persist.ts` |
| 出厂 bank | `app/src/hitVfxEditor/flipbook2d/defaults.ts` ← `recipes.json` |
| shipping 导出（含 flipbook2d） | `app/src/config/persist.ts` `exportShippingJson` |
| 逻辑映射表 | `app/public/data/clips/ryu_logic_to_glb_map.json` |
| 出厂预设 | `app/public/presets/shipping.json` |
| 2D 配方源 | `app/public/vfx/hit_ref_v1/recipes.json` |
| 序列帧源 | `vfx-ai-pipeline/runs/hit_ref_v1/*/frames/` |
| 运行时网格 | `private/runtime/ryu/ryu_c1_mesh_only.glb` |
| 动作源 | `private/assets/ryu/anims/**` |
| 角色 runtime 导出 | [`runtime-export-target.md`](./runtime-export-target.md) |

出包 dev 依赖：`@gltf-transform/core|functions|extensions`、`sharp`、`meshoptimizer`（用于舞台 simplify；**不**写入 meshopt 扩展）。

---

## 7. 操作步骤

出包前若刚在特效编辑器改过 2D 轻/中/重：先「保存工程」覆盖 `app/public/presets/shipping.json`，并把其中 `flipbook2d` 同步为 `app/public/vfx/hit_ref_v1/recipes.json`。

```bash
# 1. 确认原料
ls private/runtime/ryu/ryu_c1_mesh_only.glb
ls private/runtime/ryu/textures/prepared/head_color.png
test -f app/public/data/clips/ryu_logic_to_glb_map.json
test -f app/public/vfx/hit_ref_v1/recipes.json
test -f app/public/presets/shipping.json

# 2. 出包
cd app
npm run package:habby

# 3. 检查
ls -lh ../StreetFighter6-habby.zip          # 应 < 200M
unzip -l ../StreetFighter6-habby.zip | head  # 附近应有 index.html
unzip -l ../StreetFighter6-habby.zip | grep 'private-runtime/ryu/ryu_c1_mesh_only'
unzip -l ../StreetFighter6-habby.zip | grep -c 'private-assets/ryu/anims/.*\.glb'
unzip -l ../StreetFighter6-habby.zip | grep -c 'vfx/hit_ref_v1/.*/frame-.*\.png'  # 76
unzip -l ../StreetFighter6-habby.zip | grep 'vfx/hit_ref_v1/recipes.json'
unzip -l ../StreetFighter6-habby.zip | grep 'presets/shipping.json'
```

本地冒烟（必须用静态服，不要 `vite preview`）：

```bash
cd app/dist && python3 -m http.server 4173
# http://127.0.0.1:4173
# 角色贴图正常（头/脸不花）、idle 循环、出招有 clip
# 轻/中/重命中 2D 特效有大小/层偏移差异，像编辑器里那套
```

---

## 8. 验收清单

- [ ] ZIP **根**有 `index.html`  
- [ ] `private-runtime/ryu/ryu_c1_mesh_only.glb`（未减面，约 10.6 MiB）  
- [ ] `private-runtime/ryu/textures/prepared/` 下主要 `*_color.png`  
- [ ] `private-assets/ryu/anims/` 数量与逻辑表 mapped 路径一致  
- [ ] `vfx/hit_ref_v1/` 六层共 76 张 `frame-*.png`  
- [ ] `vfx/hit_ref_v1/recipes.json` 含 L/M/H（轻/中/重不是同一套拷贝）  
- [ ] `presets/shipping.json` 在包内（`hitVfxPlayMode` 应为 `flipbook2d`）  
- [ ] ZIP ≤ **200 MiB**  
- [ ] 静态服：贴图正确、非永久 T-pose、轻中重 2D 可区分  
- [ ] 未打进 `private/` 整树、源码、`node_modules`、`.git`、`vfx-ai-pipeline` 全量  

---

## 9. 历史坑与对策

| 坑 | 对策 |
|----|------|
| 只 zip 了 vite 的 dist → T-pose / 无贴图 | 物化 `private-runtime` + `private-assets` |
| 原样拷贝 131× 带网格动作 → 698 MB | strip mesh；`AnimClipLibrary` 只播轨 |
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

---

## 10. 若再次超限（按性价比）

1. 再压贴图：颜色 512，或 WebP/KTX2（需改 `applyPreparedRyuArt`）  
2. **不要**用 weld/simplify 压 `mesh_only`；若必须降面，另做保留 UV 岛/蒙皮的离线流程，并目视验收头/手套  
3. 裁剪映射集：演示包只带 boot 预加载 + 少量攻击  
4. 舞台主要压贴图，而不是三角  
5. 去掉 Soldier/Xbot 兜底（省数 MB）  

---

## 11. 和角色 runtime 导出的关系

- [`runtime-export-target.md`](./runtime-export-target.md)：RE 原料 → `private/runtime` + clips。  
- **本文**：已有 private + Vite 应用 → Habby ZIP。

顺序：本地 `npm run dev` 美术、动作、2D 轻中重都正确 → 把配方写入 `recipes.json` / shipping → `npm run package:habby` → 静态冒烟 → 上传。

---

## 12. 变更记录

| 日期 | 摘要 |
|------|------|
| 2026-08-21 | 首次完整导出：private 未进包；strip 动作 + 贴图降采样，ZIP ~54 MiB；脚本落地 |
| 2026-09-09 | 2D 帧改为 public 静态路径并校验 76 张；禁止角色 mesh simplify；shipping + `recipes.json` 带编辑器 L/M/H；ZIP ~55.8 MiB |

# Habby Game Share：Web 导出经验手册

> 记录日期：**2026-08-21**  
> 适用：本仓库 Vite + Three.js（WebGPU）训练场 → 静态 ZIP 上传 Habby  
> 产出物：仓库根目录 `StreetFighter6-habby.zip`  
> 平台硬性约束：**ZIP 根目录必须有 `index.html`**；**包体 ≤ 200 MiB**

本文总结首次完整导出中踩过的坑、正确的资源分层、压缩策略，以及对应代码入口，供以后出包直接照做。

---

## 0. 一句话结论

**不要只打 `vite build` 的 `dist/`。**  
战斗网格 / 贴图 / 动作在 `private/`，开发时由 Vite 插件挂成 `/private-runtime`、`/private-assets`；生产静态托管没有这些中间件。出包必须把这些 URL 路径**物化进 dist**，并对「每条动作 GLB 内嵌整模」做 **strip mesh**，才能在 200 MB 内既有材质又有动作。

一键命令（在 `app/`）：

```bash
npm run package:habby
```

脚本：[`app/scripts/package-habby.mjs`](../../app/scripts/package-habby.mjs)  
npm script：`package:habby`（见 [`app/package.json`](../../app/package.json)）

---

## 1. Habby 平台要求（对照清单）

| 要求 | 本项目做法 |
|------|------------|
| ZIP 根目录含 `index.html` | `cd dist && zip -r … .`（压的是 **内容**，不是外层 `dist/` 文件夹） |
| 前端项目先生产构建 | 脚本内 `npx vite build`（跳过会拦门的 `tsc` 门禁；完整 `npm run build` 若 TS 报错可先修再切） |
| 引擎导出勿带源工程 | 本仓库是 Vite Web，不适用 Unity 整仓；勿把 `private/` 源树、`.blend`、工具链打进 ZIP |
| 包体上限 **200 MiB** | 实测优化后约 **54 MiB**（2026-08-21） |

---

## 2. 架构：为什么「只打 dist」会 T-pose / 没贴图

### 2.1 开发时 vs 出包时

```text
本地 npm run dev
  ├─ public/**          → 直接可访问（data/、部分 models/）
  ├─ /private-runtime/* → Vite 插件映射 private/runtime/
  └─ /private-assets/*  → Vite 插件映射 private/assets/

vite build 默认
  └─ 只拷贝 public/ + 打包 JS/CSS/import 的资产
     ★ 不包含 private/，插件注释也写明「生产不嵌入 private」
```

插件实现：[`app/vite-plugins/ryuAnimAssets.ts`](../../app/vite-plugins/ryuAnimAssets.ts)  
（`configureServer` / `configurePreviewServer` 有静态服务；**没有** `closeBundle` 拷贝逻辑。）

### 2.2 运行时实际加载什么

| 资源 | URL / 常量 | 代码 |
|------|------------|------|
| 蒙皮网格（优先） | `/private-runtime/ryu/ryu_c1_mesh_only.glb` | [`logicGlbMap.ts`](../../app/src/data/logicGlbMap.ts) `RYU_MESH_ONLY_URL`；[`main.ts`](../../app/src/main.ts) `loadRyuMeshScene` |
| 贴图（prepared PNG） | `/private-runtime/ryu/textures/prepared/…` | [`applyPreparedRyuArt.ts`](../../app/src/render/applyPreparedRyuArt.ts) `RYU_PREPARED_TEX_BASE` |
| 战斗动作 | `/private-assets/ryu/anims/<map path>` | [`LogicGlbMap.urlForAnimsRelPath`](../../app/src/data/logicGlbMap.ts)；[`AnimClipLibrary`](../../app/src/render/AnimClipLibrary.ts) |
| 逻辑→路径表 | `/data/clips/ryu_logic_to_glb_map.json` | `public/data/clips/` → 进 dist |

`AnimClipLibrary` 明确只取动画轨，网格绑定在 boot 角色上：

```ts
// app/src/render/AnimClipLibrary.ts
// Clip-only sanitize: do not skeleton.pose() the anim-glb hierarchy
// (tracks are bound onto the boot fighter mesh, not this scene).
```

因此：**动作 GLB 里的 mesh 对战斗播放是冗余的**——这是体积优化的核心依据。

### 2.3 失败时用户看到的症状

| 症状 | 原因 |
|------|------|
| 一直 T-pose / 不动 | `/private-assets/...` 404，clip 预加载失败 |
| 灰模 / 无材质 | `/private-runtime/.../textures/prepared` 404 |
| 有模但粗糙或兜底 | 退到 `public/models/ryu/ryu_c1.glb`，且仍无 combat clips |

---

## 3. 体积真相（2026-08-21 实测）

未优化完整美术包：

| 指标 | 数值 |
|------|------|
| ZIP | **~698 MiB**（超限） |
| 未压缩合计 | ~1.57 GiB |
| 动作 GLB 占比 | **~93%** |
| 单条 mapped 动作 | 原始约 **11 MiB**，内含 **21 mesh + 701 nodes + 1 anim** |
| 映射动作数量 | 逻辑表 **131** 条路径（非全盘 4 GiB `private/assets/ryu/anims`） |

优化后：

| 指标 | 数值 |
|------|------|
| ZIP | **~54 MiB** |
| dist 合计 | ~116 MiB |
| 动作（strip 后） | **~68 MiB** raw（131 条） |
| 贴图（降采样 PNG） | **~21 MiB** |
| mesh_only | **~10.6 MiB** |

---

## 4. 出包流水线（脚本在做什么）

脚本路径：`app/scripts/package-habby.mjs`。

```text
1) npx vite build
2) 删除 dist 内重复 public 网格
     models/ryu/ryu_c1.glb
     models/ryu/ryu_c1_textured.glb
3) 拷贝 private/runtime/ryu/ryu_c1_mesh_only.glb
     → dist/private-runtime/ryu/
4) sharp 压缩 prepared 贴图（保留原文件名 .png）
     颜色类 ≤1024；bump/rough 等 ≤512
     → dist/private-runtime/ryu/textures/prepared/
5) 读取 public/data/clips/ryu_logic_to_glb_map.json
     收集 primaryPath + clips[].path
6) 对每条 mapped 动作：strip mesh/material/skin/texture
     + resample + prune(keepLeaves) + dedup
     → dist/private-assets/ryu/anims/<相对路径>
7) zip -9：在 dist/ 内打包「.」→ 仓库根 StreetFighter6-habby.zip
8) 校验：index.html 根路径、private-* 存在、ZIP ≤ 200 MiB
```

### 4.1 Strip 动作 GLB（关键步骤）

对应函数：`writeStripAnimGlb`。

1. `@gltf-transform` 读入 GLB  
2. `dispose` 全部 mesh / material / texture / skin  
3. 节点上 `setMesh(null)` / `setSkin(null)`  
4. `resample()` → `prune({ keepLeaves: true })` → `dedup()`  
5. 写出：保留 **骨骼节点层级 + Animation channels**（便于 track 名与 boot 骨架对齐）

单条效果（idle 样例）：**11.5 MiB → ~0.66 MiB**，`meshes=0`，`animations=1`，channels 仍在。

### 4.2 为何先不做 Draco / EXT_meshopt 写入

社区常用 [glTF-Transform](https://github.com/donmccurdy/glTF-Transform)、[Draco](https://github.com/google/draco)、[meshoptimizer](https://github.com/zeux/meshoptimizer)。  
本轮 **strip 已够进 200 MB**，且：

- 运行时 `GLTFLoader` **未挂** `DRACOLoader` / `MeshoptDecoder`  
- 写入 meshopt/Draco 扩展会要求改加载器，否则线上直接挂  

若未来还要再压：优先评估 **mesh 本体** 与 **贴图 KTX2/WebP**（需同步改 `applyPreparedRyuArt` 扩展名与 loader）。

### 4.3 只打「映射动作」，不要整盘 anims

`private/assets/ryu/anims` 全量约 **4 GiB / 330+ glb**。  
出包只收录 `ryu_logic_to_glb_map.json` 引用到的路径（约 131）。  
新增招式后：先更新逻辑表，再跑 `package:habby`。

---

## 5. 出包后 dist / ZIP 应有的形状

```text
StreetFighter6-habby.zip          # 根目录即站点根
├── index.html                    # ★ 必须
├── assets/                       # JS/CSS + 舞台等 import 资产
├── data/                         # moves / clips / systems JSON
├── presets/
├── models/ryu/                   # 可仅剩 clips.json / README（大 glb 已删）
├── private-runtime/ryu/
│   ├── ryu_c1_mesh_only.glb
│   └── textures/prepared/*.png
└── private-assets/ryu/anims/.../glb/*.glb   # strip 后的动作
```

URL 与文件夹名必须一致：`/private-runtime/...` ↔ `private-runtime/`。

---

## 6. 相关代码与配置索引

| 主题 | 路径 |
|------|------|
| 出包脚本 | `app/scripts/package-habby.mjs` |
| npm 命令 | `app/package.json` → `package:habby` |
| Vite private 中间件 | `app/vite-plugins/ryuAnimAssets.ts` |
| Vite 允许读 private | `app/vite.config.ts` → `server.fs.allow` |
| 网格 / 动作 URL 常量 | `app/src/data/logicGlbMap.ts` |
| Boot 加载顺序 | `app/src/main.ts` → `loadFighters` |
| 贴图应用 | `app/src/render/applyPreparedRyuArt.ts` |
| 动作缓存加载 | `app/src/render/AnimClipLibrary.ts` |
| 逻辑映射表 | `app/public/data/clips/ryu_logic_to_glb_map.json` |
| 运行时网格源 | `private/runtime/ryu/ryu_c1_mesh_only.glb` |
| 动作源 | `private/assets/ryu/anims/**` |
| 角色 runtime 目标说明 | [`runtime-export-target.md`](./runtime-export-target.md) |

依赖（dev，出包用）：`@gltf-transform/core|functions|extensions`、`sharp`（`meshoptimizer` 已装，脚本当前未强制写 meshopt 扩展）。

---

## 7. 操作步骤（复制即用）

```bash
# 1. 确认 private 资产存在
ls private/runtime/ryu/ryu_c1_mesh_only.glb
ls private/runtime/ryu/textures/prepared/head_color.png
test -f app/public/data/clips/ryu_logic_to_glb_map.json

# 2. 出包
cd app
npm run package:habby

# 3. 检查
ls -lh ../StreetFighter6-habby.zip          # 应 < 200M
unzip -l ../StreetFighter6-habby.zip | head  # 首条附近应有 index.html
unzip -l ../StreetFighter6-habby.zip | grep 'private-runtime/ryu/ryu_c1_mesh_only'
unzip -l ../StreetFighter6-habby.zip | grep -c 'private-assets/ryu/anims/.*\.glb'
```

本地冒烟（可选）：

```bash
cd app/dist && python3 -m http.server 4173
# 浏览器打开 http://127.0.0.1:4173
# 确认：有贴图、idle 循环、出招有动画（非 T-pose）
```

注意：`vite preview` 仍走插件读磁盘 `private/`，**不能**代替「静态 dist 是否自洽」的验证。

---

## 8. 验收清单

- [ ] ZIP **根**有 `index.html`（不是 `dist/index.html` 套一层）  
- [ ] 存在 `private-runtime/ryu/ryu_c1_mesh_only.glb`  
- [ ] 存在 `private-runtime/ryu/textures/prepared/` 下主要 `*_color.png`  
- [ ] 存在 `private-assets/ryu/anims/`，数量与逻辑表 mapped 路径一致（缺文件脚本会 `missing` 警告）  
- [ ] ZIP ≤ **200 MiB**  
- [ ] 静态服务器打开：角色有贴图、非永久 T-pose、基础移动/攻击有 clip  
- [ ] 未把 `private/` 整树、源码、`node_modules`、`.git` 打进包  

---

## 9. 历史坑与对策

| 坑 | 对策 |
|----|------|
| 只 zip 了 `vite` 的 dist → T-pose / 无贴图 | 必须物化 `private-runtime` + `private-assets` |
| 原样拷贝 131× 带网格动作 → 698 MB | strip mesh；依赖 `AnimClipLibrary` 只播轨 |
| 打进全部 `anims/`（4 GiB） | 只打逻辑表引用路径 |
| 保留 `public/models/ryu/*.glb` 双份 | 出包脚本删除；shipping 以 mesh_only 为准 |
| `npm run build` 因 `tsc` 失败 | 出包用 `npx vite build`；并行修 TS |
| 对动作写 Draco/meshopt 扩展但未改 loader | 当前勿写；先 strip |
| 贴图改成 `.webp` 未改代码 | 当前用 sharp 仍输出 **同名 `.png`** |
| 用 `vite preview` 冒充出包验证 | 应用纯静态服验证 `dist/` |

---

## 10. 以后若再次超限，可加的杠杆（按性价比）

1. **再压贴图**：颜色 512、或 WebP/KTX2（需改 `applyPreparedRyuArt` + 加载）  
2. **简化/压缩 mesh_only**（注意手套蒙皮；曾有 Blender 重导 textured glb 破坏权重的教训）  
3. **裁剪映射集**：Habby 演示包只带 `BOOT_PRELOAD_LOGIC_IDS` + 少量代表性攻击  
4. **舞台 GLB**（`SF6 Training Stage`）做 simplify / meshopt（需挂解码器或仅减面后不写扩展）  
5. 去掉 Soldier/Xbot 兜底模型（省数 MB，失去 boot 失败回退）  

社区参考（检索节点 2026-08-21）：  
glTF-Transform、Facepunch/RustRelay.Assets（Draco+WebP）、glb-shrink、X 上 Draco/1K 贴图把数十 MB 压到个位数 MB 的 indie 案例。

---

## 11. 与「角色 runtime 导出」文档的关系

- [`runtime-export-target.md`](./runtime-export-target.md)：讲 **如何把 RE 原料做成** `private/runtime` + clips 管线。  
- **本文**：讲 **如何把已有 private + Vite 应用打成 Habby 可上传 ZIP**。  

顺序建议：先保证本地 `npm run dev` 美术与动作正确 → 再 `npm run package:habby` → 静态冒烟 → 上传。

---

## 12. 变更记录

| 日期 | 摘要 |
|------|------|
| 2026-08-21 | 首次完整导出：发现 private 未进包；strip 动作 + 贴图降采样后 ZIP ~54 MiB；脚本 `package:habby` 落地并写本文 |

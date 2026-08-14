# AI 执行方案：角色美术贴图完整准备与接入

> **状态**：可执行（2026-08-14）  
> **上位共识**：`docs/character-art-consensus-v0.md`（必须遵守；本方案不得缩水其「本次完整准备」）  
> **元共识**：`docs/consensus-v0.md` §0 写进即全做  
> **执行者**：AI 代理（用户不进 Blender GUI）  
> **禁止**：无引用的「自我发挥」算法/路径；跳过 manifest；把延后项当完成  

---

## 0. 执行总则（AI 必读）

### 0.1 目标完成定义

| 阶段 | 完成定义 |
|------|----------|
| **阶段 A 准备完成** | `private/runtime/ryu/textures/prepared/` 齐套 + `manifest.csv` 无「应做未做」+ `ryu_c1_textured.glb` 存在 + 预览图 + **用户文字确认通过** |
| **阶段 B 接入完成** | 训练场加载带贴图角色；颜色+凹凸可见；调试面板参数生效；用户浏览器观感确认 |

### 0.2 硬约束

1. **源目录只读**：`private/interim/characters/SF6 Ryu Model/SF6 Ryu textures/` 禁止覆盖写入。  
2. **Blender 必须用真实用户配置**（勿设空的 `BLENDER_USER_RESOURCES`），否则加载不到已装插件。  
3. **Blender 二进制（本机已验证）**：  
   `/Users/yangjianlin/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender`  
   版本：**5.2.0 LTS**（2026-07-14 build）。  
4. **插件路径（已装）**：  
   `~/Library/Application Support/Blender/5.2/scripts/addons/RE-Mesh-Editor-main`（bl_info v0.66）等。  
5. **Three 栈**：`app/package.json` → `three@^0.185.1`；WebGPU 入口既有 `three/webgpu`；调试 `lil-gui` via `three/addons/libs/lil-gui.module.min.js`。  
6. 每步 **理论依据 + 参考链接 + 本仓库落点** 见各节；未列方法不得擅自替换核心公式。

### 0.3 推荐执行顺序（不可打乱阶段依赖）

```text
A0 目录与 manifest 骨架
 → A1 dds/格式
 → A2 nrrc→bump/rough + 缩放
 → A3 预染色 color_final
 → A4 atos 拆分与 AO 决策
 → A5 Blender 绑材质 + 导出 glb + 预览图
 → A6 自检 + 用户验收
 →（通过后）B1–B6 运行时接入
```

---

## 1. 参考资料总表（禁止脱离引用编造）

| ID | 资料 | 用途 |
|----|------|------|
| R1 | [Pillow Image file formats — DDS](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html) | dds 读取能力边界（DXT1/5、DX10 等） |
| R2 | [three.js MeshStandardMaterial](https://threejs.org/docs/#api/en/materials/MeshStandardMaterial) | `map` / `normalMap` / `aoMap` / `roughnessMap` 槽位 |
| R3 | [three.js Color management r152+ 讨论](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791) / [NoColorSpace](https://discourse.threejs.org/t/three-nocolorspace-error/57427) | 颜色 sRGB vs 数据图 NoColorSpace |
| R4 | [Normal maps OpenGL vs DirectX（绿通道）](https://www.strayspark.studio/blog/directx-vs-opengl-normal-maps-explained) ；[three-gltf-viewer#10](https://github.com/donmccurdy/three-gltf-viewer/issues/10) | 凹凸绿通道翻转陷阱 |
| R5 | [RE 贴图类型论坛帖](https://residentevilmodding.boards.net/thread/13115/individual-texture-maps-meaning) | ALBM/NRMR/ATOS 社区语义（辅助，非 SF6 真理） |
| R6 | [Reddit NRRC in Blender](https://www.reddit.com/r/blender/comments/19029tc/nrrc_map_in_blender/) | NRRC 为引擎打包法线的社区描述 |
| R7 | [NSACloud/RE-Mesh-Editor](https://github.com/NSACloud/RE-Mesh-Editor) README/changelog | NRRT/NRRC 显示、tex 转换、SF6 支持；Credits: PittRBM NRRT nodes、Ridog 转换参考 |
| R8 | [Nexus RE Texture Packer](https://www.nexusmods.com/monsterhunterwilds/mods/1472) | ALBD/NRRC/ATOS 类型与 normal 双向转换说明 |
| R9 | [FluffyQuack REtool](https://www.fluffyquack.com/) / [X 更新帖](https://x.com/Fluffyquack/status/2044184720318034250) | TEX↔DDS（本项目 PNG 主路径时备用） |
| R10 | [matyalatte/Texconv-Custom-DLL](https://github.com/matyalatte/Texconv-Custom-DLL) | DDS 难读时的转换备选 |
| R11 | [donmccurdy/glTF-Transform](https://github.com/donmccurdy/glTF-Transform) / [CLI resize](https://gltf-transform.dev/cli) | glb 贴图缩放/优化（可选后处理） |
| R12 | [three.js WebGPU texture issues](https://github.com/mrdoob/three.js/issues/30405) 等 | 坏贴图/设备丢失类问题警示 |
| R13 | 本仓库 `app/src/render/materialUtils.ts`、`loadFighterMesh.ts`、`FighterView.ts`、`DebugGui.ts` | **唯一允许的运行时改动锚点**（阶段 B） |
| R14 | 本机验证 2026-08-14：nrrc 蓝≈255、A 中灰；clotha cmask 分区；body atos 近常数 | 共识数据，写死进脚本常量前须与之一致 |

---

## 阶段 A — 资产准备

### A0. 目录与 manifest 骨架

**目的**：满足共识 §3 路径；保证可审计「做完/延后」。

**实现**：

1. 创建目录：  
   - `private/runtime/ryu/textures/prepared/`  
   - `private/runtime/ryu/textures/prepared/_work/`（中间层，可 gitignore）  
   - `private/runtime/ryu/textures/prepared/_preview/`（验收截图）  
2. 生成 `manifest.csv` 表头（UTF-8）：  

```text
id,source_file,part,kind,scope,action,output_files,notes
```

- `scope`：`prepare` | `deferred`  
- `action`：`convert_bump` | `dye` | `ao_or_skip` | `resize_copy` | `dds_to_png` | `skip_deferred` 等  

3. 枚举源目录全部文件（约 55），按共识 §2.2 填 `deferred` 行（受伤/出汗/脸 dds 等），**原因写入 notes**。

**依据**：共识 §2–§3；主共识 private 不公开。  
**验收**：文件数 = manifest 行数（含 deferred）。

---

### A1. 格式统一（dds → png，仅本次需要）

**目的**：共识 §6。

**实现方案（有序尝试，禁止跳过失败不记）**：

| 步骤 | 方法 | 参考 |
|------|------|------|
| 1 | 对 `esf001_000_01_body_sa_blend_msk4.dds`：`PIL.Image.open(path).convert("RGBA")` 后 `save(..., format="PNG")` | R1 Pillow DDS |
| 2 | 若 Pillow 报错/全黑：用 **Blender** `bpy.data.images.load` + `image.save_render` 或 save PNG；或 **texconv**（R10） | R7 插件也依赖 texconv 系 |
| 3 | 脸部 3 dds：**不转**，manifest `skip_deferred` | 共识 §2.2 |

**输出**：`prepared/_work/body_sa_blend_msk4.png`（若成功）。  
**禁止**：把延后 dds 强行算进「本次完成」。

**坑（检索）**：Pillow 对部分 DX10/BC7 支持不完整（R1 范围）；失败时必须走 Blender/texconv，不得伪造成功。

---

### A2. nrrc → 标准凹凸 + 粗糙 + 缩放

**目的**：共识 §4、§7、§9。

#### A2.1 理论依据

- 本机验证（R14）：nrrc 的 **B≈255**，**R/G 变化** → 打包的是 XY 方向，不是完整 RGB 法线外观。  
- 社区（R6、R7）：NRRC/NRRT 为 RE 法线类打包；RE Mesh Editor changelog 写明「NRRT/NRRC normal maps are now displayed correctly」。  
- 标准切线空间法线：向量 \((n_x,n_y,n_z)\) 存为 RGB \(\in[0,1]\)，\(n_z=\sqrt{\max(0,1-n_x^2-n_y^2)}\)（常见重建；与 Blender/引擎文档一致的「两通道重建 Z」做法）。  
- OpenGL vs DirectX：差异主要在 **绿通道符号**（R4）；Three/glTF 惯例偏 OpenGL；共识默认 **不翻 Y**，错则 **全局** 翻。

#### A2.2 必须实现的算法（Python + Pillow，禁止改公式核心除非用户改共识）

对每个源 nrrc（先 `resize` 到目标边长，再逐像素；或先转后 resize，**须在 manifest 记录**；推荐 **先 resize 再重建** 以省内存）：

```text
# 伪代码 — 实现时写成 tools/ 或 scripts/ 下可重复脚本
nx = R/255*2 - 1
ny = G/255*2 - 1
if FLIP_Y: ny = -ny          # 默认 False；全局开关
nz2 = 1 - nx*nx - ny*ny
if nz2 < 0: 归一化 nx,ny 后 nz=0
else: nz = sqrt(nz2)
outR = (nx*0.5+0.5)*255
outG = (ny*0.5+0.5)*255
outB = (nz*0.5+0.5)*255
rough = A                         # 8-bit 灰图
```

**已验证试跑路径**：`.tmp/p4-normal-test/nrrc_opengl_noflipY_bump.png`（2026-08-14）— 脚本行为须与此一致。

#### A2.3 输入输出映射（写死）

| 源文件（interim） | part | 输出（prepared，1024 除非注明） |
|------------------|------|--------------------------------|
| `esf001_000_00_head_nrrcout.png` | head | `head_bump.png`, `head_rough.png` |
| `esf001_000_01_body_nrrcout.png` | body | `body_bump.png`, `body_rough.png` |
| `esf001_000_02_hair_nrrcout.png` | hair | `hair_bump.png`, `hair_rough.png` |
| `esf001_001_01_clotha_nrrcout.png` | clotha | `clotha_bump.png`, `clotha_rough.png` |
| `esf001_001_01_clothb_nrrcout.png` | clothb | `clothb_bump.png`, `clothb_rough.png` |
| `esf001_000_00_eye_nrrcout.png` | eye | `eye_bump.png`, `eye_rough.png`（**512**） |
| 第 2 批：`bodydetail_*`、`body_blend*`、`body_sa_blend*`、`bdm_*`、`fdm_*` | body 或 head | `body_detail_bump_*.png` 等；可烘进主 bump **或** 分文件，manifest 必须写清「是否已合成进主 bump」 |

**合成规则（禁止模糊）**：

- **默认**：主 bump = 仅主 nrrc；细节 bump **另存** 并在 A5 **不强制第二套 UV**（多数细节与主 UV 同套时可在 Python 用「细节强度」叠加到主 bump 法线空间——若实现叠加，必须用标准法线混合或仅作为可选，默认强度 0，调试可开）。  
- **更稳默认（推荐 AI 采用）**：**主 nrrc 必转**；细节 nrrc **全部转出文件** 并在 manifest 标记 `prepared_detail`；A5 **先只挂主 bump**；细节叠加标为 A5 可选第二轮（仍属本次准备，不得永久不做：第二轮须在同阶段 A 内完成「叠加进主 bump 或文档化 UV 不兼容」）。

**若细节与主 UV 不一致**：manifest `notes=UV_mismatch_or_layer`，强度 0，**不删文件**。

#### A2.4 尺寸

| part | max edge |
|------|----------|
| eye | 512 |
| 其它 | 1024 |

使用 `PIL.Image.Resampling.LANCZOS`（或 BILINEAR，须在脚本常量 `RESIZE_FILTER` 写死并记入 README_local 一行）。

**依据**：共识 §9；现网 `materialUtils.ts` `MAX_TEX_SIZE=1024`。

#### A2.5 坑与社群陷阱（必须处理）

| 坑 | 来源 | 处理 |
|----|------|------|
| 直接把 nrrc 当 normalMap | 本仓库曾丢弃 nrrc；R6 | **禁止**；只挂 A2 产出的 bump |
| 绿通道 DirectX/OpenGL | R4 | 全局 `FLIP_Y`；验收凹凸「鼓变凹」时只改此开关重跑 A2+A5 |
| 4K 全像素 Python 内存 | 实践 | 先 resize 再逐像素；可分块 |
| normal 用 sRGB | R3 | 保存 bump 为数据；Three 侧 `colorSpace=NoColorSpace` |
| WebGPU 坏 image | R12、本仓库 loadFighterMesh | 仅完整解码位图 |

---

### A3. 预染色 → `*_color_final.png`

**目的**：共识 §11。

#### A3.1 理论

- RE 服装 albd 常为中性底 + **cmask 分区染色**（共识本机：clotha cmask 蓝区大面积、红区局部）。  
- 本次 **不做** 运行时 cmask shader；离线合成最终 baseColor（共识 §11）。  
- 合成模型（实现写死，参数可调）：

```text
base = albd.rgb  (linear 或 8bit 工作空间须一致；推荐 8bit 近似)
for each dye region from cmask:
  w = channel_or_mask_weight  # 见参数表
  base = lerp(base, target_rgb, w * strength)
# 花纹：当 base 局部饱和度/对比已高时降低 w（可选；默认 strength 分区表）
```

**cmask 通道解释（本机观察，作为初始参数，可调）**：

| 观察 | 初始用法 |
|------|----------|
| clotha cmask 大面积偏蓝 | **B 通道** → 道服主体染 **米白** `(240,240,235)` 量级 |
| 局部红 | **R 通道** → 绑带/手套倾向 **深红/褐** 或保留；头带红在 HeadBand mesh 用固定红乘 clotha |
| 头 cmask 极弱 | head **不染**；仅 resize 拷贝 albd → `head_color.png` |

**禁止**：AI 自创「神经风格迁移」染色；仅遮罩 lerp / 乘色。

#### A3.2 输出文件（必须）

| 输出 | 源 |
|------|-----|
| `head_color.png` | head albd resize，不染 |
| `body_color.png` | body albd resize，不染 |
| `eye_color.png` | eye albd → 512 |
| `hair_color_final.png` | hair albd × 加深（默认乘 `(0.15,0.12,0.10)` 量级可调） |
| `clotha_color_final.png` | clotha albd + cmask |
| `clothb_color_final.png` | clothb albd + cmask |

#### A3.3 依据

- 共识 §11；本仓库既有 `partColorTint` 为临时补丁，A 完成后主路径淘汰。  
- R5/R8 说明 cmask 为染色类，非 baseColor。

#### A3.4 坑

| 坑 | 处理 |
|----|------|
| 染死花纹 | 降低 strength；保留 albd 高频（可先 lerp 低 strength） |
| 头带不红 | HeadBand 材质强制 `clotha_color_final` 且可再乘红 tint 参数 |
| sRGB 双重校正 | 合成在 8bit 一致性空间；Three 加载 final 用 sRGB |

---

### A4. atos → AO 决策

**目的**：共识 §12。

#### A4.1 实现

对每个本次 atos（head/body/hair/clotha/clothb 若存在）：

1. 拆 R/G/B/A 为四张灰图到 `_work/`。  
2. 计算每通道：方差 / 非平坦度（如 `stddev`）；**阈值** `ATOS_MIN_STDDEV` 默认 `8.0`（8bit）。  
3. 若全部通道 stddev &lt; 阈值 → `action=ao_skip`，notes=`near_constant`（身体本机验证属此）。  
4. 否则选 **stddev 最大** 的通道作为 AO 候选；可选反相若均值&gt;128 且暗部应在缝（参数 `AO_INVERT` 默认按通道启发式，**须在 manifest 记录是否 invert**）。  
5. 输出 `{part}_ao.png` 仅当未 skip。

**禁止**：把 atos 整图塞进 `map`。  
**依据**：R5 ATOS 多通道；本机 R14 body 近常数。

---

### A5. Blender 绑材质 + 导出 glb + 预览

**目的**：共识 §5、§8、§10。

#### A5.1 启动方式（写死）

```bash
"/Users/yangjianlin/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender" \
  --background \
  --python path/to/bind_and_export.py
```

- **不要**设置 `BLENDER_USER_RESOURCES` 到空目录。  
- 脚本内：`addon_utils.enable("RE-Mesh-Editor-main")` 可选（绑 PNG 到 Principled 不强制 RE 插件；导入 mesh 若走 RE 格式再 enable）。

#### A5.2 模型源（优先级）

1. `private/runtime/ryu/ryu_c1_mesh_only.glb` 或 `ryu_c1.glb`（已有 esf_ 材质名）  
2. 备选：`private/interim/characters/SF6 Ryu Model/SF6 Ryu No rig.glb`  
3. 打开后 **删除/隐藏** `Icosphere`  

**依据**：2026-08-14 本机列出的材质名与共识 §8 一致。

#### A5.3 材质绑定规则（Principled BSDF，对应 glTF）

对每个 mesh 的 material 名规范化（去 `.00x` 后缀）后查表：

| 匹配 | baseColor 贴图 | Normal | Roughness | AO |
|------|----------------|--------|-----------|-----|
| Head00, Mouth00 | head_color | head_bump | head_rough | head_ao? |
| Body00 | body_color | body_bump | body_rough | body_ao? |
| Eye00 | eye_color | eye_bump | eye_rough | |
| Hair*, 眉睫胡 | hair_color_final | hair_bump | hair_rough | |
| HeadBand, Costume00, Threads, Ring, Obi, ObiSign | clotha_color_final | clotha_bump | clotha_rough | clotha_ao? |
| DougiPants, Waraji, Costume03, Costume01 | clothb_color_final | clothb_bump | clothb_rough | clothb_ao? |
| EyeShadow, EyeTear | 纯色或 eye_color 低强度 | 无 | 0.7 | |

节点设置（Blender 4.3+/5.x）：

- baseColor Image：**Color Space = sRGB**  
- Normal：`Normal Map` 节点，Image **Non-Color**；强度 1.0  
- Roughness：Image Non-Color → Principled Roughness（可乘 `ROUGH_MUL`）  
- AO：乘到 baseColor（glTF occlusion 用 ORM 时：可选打包；**第一实现允许 AO 乘色** 以降低扩展复杂度，manifest 注明 `ao_multiply_basecolor`）

#### A5.4 导出

```python
bpy.ops.export_scene.gltf(
  filepath=".../private/runtime/ryu/ryu_c1_textured.glb",
  export_format='GLB',
  # 导出选中/可见物体；保留蒙皮与材质
)
```

使用官方 **io_scene_gltf2**（Blender 内置，本机已测 glb 导出 OK）。

可选后处理（非必须）：`npx @gltf-transform/cli resize` / optimize（R11）— 仅当体积过大；**不得**在未验收前有损压没细节。

#### A5.5 预览图

- Workbench 或 EEVEE：相机对准角色，输出  
  `prepared/_preview/front.png`、`side.png`  
- 本机已验证：无相机则 render 失败 → **脚本必须创建相机+灯**。

---

### A6. 验收清单（AI 自检 + 用户）

AI 提交给用户时必须附：

1. `manifest.csv`  
2. 文件列表与尺寸抽查（`identify` 或 PIL）  
3. `_preview/front.png`、`side.png`  
4. 已知问题（若有 FLIP_Y 未决等）  

用户回复通过 → 阶段 A 关闭。  
用户说凹凸反了 → **仅**设 `FLIP_Y=true` 重跑 A2+A5，禁止改个别 mesh。

---

## 阶段 B — 运行时接入（A 通过后）

### B1. 加载路径

**改动锚点**：

- `app/src/render/FighterView.ts` / `loadFighterMesh.ts` / 角色加载入口（`main.ts` 或等价）  
- Vite 对 `private` 的既有中间件模式（现 `/private-interim`）— **新增** 对 `private/runtime/ryu/` 的只读映射（如 `/private-runtime/ryu/...`），或把验收后的 `ryu_c1_textured.glb` **复制** 到 `app/public/models/ryu/`（复制须说明来源；**禁止**把 4K interim 整包拷 public）。

**默认策略（写死）**：

1. 优先加载 `ryu_c1_textured.glb`（public 或 private-runtime URL）。  
2. 调试开关 `usePreparedExternalMaps` 为 true 时，才用 TextureLoader 覆盖 map/normal（路径 `/private-runtime/ryu/textures/prepared/`）。

**依据**：共识 §10；现有 interim 静态服务模式。

---

### B2. 材质 sanitize 修正

**文件**：`app/src/render/materialUtils.ts`

| 现行为 | 必须改为 |
|--------|----------|
| 名字含 `nrrc` 的 normal 直接丢弃 | **仅丢弃未转换的 raw nrrc**；对 `*_bump` / glb 内标准 normal **保留** |
| 只保证 albedo catalog | 增加 normal/rough/ao 的可用性检查 `isUsableTexture` |
| `partColorTint` 强染色 | **默认关闭**或 strength=0；面板可临时开 |

**颜色空间（R2/R3）**：

```text
map.colorSpace = SRGBColorSpace
normalMap.colorSpace = NoColorSpace
roughnessMap.colorSpace = NoColorSpace
aoMap.colorSpace = NoColorSpace
```

**normalScale**：`Vector2(s, s)`，s 来自调试面板。

**依据**：Three 文档 R2；本仓库 WebGPU 安全加载 R13。

---

### B3. 对应表代码化

将共识 §8 表写成 **常量映射**（`Record` 或 JSON 在 `app/src/render/`），按 `material.name` / `mesh.name` 匹配 `esf_` 关键词；**禁止**仅靠松散 includes 无表。

可保留 includes 作 fallback，但 **主路径查表**。

---

### B4. 淘汰 FBX 外置 albd 为唯一外观

若仍走 FBX + `ensureRyuFallbackAlbedoCatalog`：  

- textured glb 路径下 **跳过** 强制外置 6 张 albd 覆盖已嵌入贴图。  
- 或仅当 `mat.map` 缺失时 fallback。

**依据**：共识「最终色已预染」；避免灰底覆盖 final。

---

### B5. 尺寸与内存

- 信任 prepared 1024；`MAX_TEX_SIZE` 可保留 1024 作防护，**勿二次糊化**已是 1024 的图（若 `image.width<=1024` 跳过 downscale）。  
- 参考：本仓库注释 SF6 4K 体积问题。

---

### B6. 浏览器验收

- `npm run dev`，训练场双人位。  
- 检查：无粉黑花屏；头带非皮肤；控制台无 texture 报错。  
- 用户确认。

**测试**：为纯函数（通道重建、染色 lerp、part 解析）加 `app/tests/` vitest；**不**把原版贴图提交到 git。

---

## 2. 调试面板必须公开的参数

**文件**：`app/src/debug/DebugGui.ts`（既有 `gui.addFolder('渲染')` 模式，lil-gui）。  
**配置对象**：建议 `app/src/config/constants.ts` 或专用 `renderArtConfig` 可序列化对象。

### 2.1 文件夹建议名：`角色外观` 或扩展现有 `渲染`

| 参数 key | 类型/范围 | 默认 | 作用 |
|----------|-----------|------|------|
| `art.useTexturedGlb` | boolean | `true` | 是否加载带贴图 glb |
| `art.usePreparedExternalMaps` | boolean | `false` | 是否用 prepared PNG 覆盖 |
| `art.enableNormalMap` | boolean | `true` | 总开关 normalMap |
| `art.normalScale` | float 0–2 step 0.05 | `1.0` | `normalScale` 统一 XY |
| `art.flipNormalY` | boolean | `false` | 运行时反转 normal 绿通道或 normalScale.y 符号（与 A2 FLIP_Y 对齐；改后需文档说明是否要重导资产） |
| `art.enableAo` | boolean | `true` | AO 乘色/aoMap |
| `art.aoIntensity` | float 0–1 | `1.0` | AO 强度 |
| `art.enableRoughnessMap` | boolean | `true` | 是否使用 roughnessMap |
| `art.roughness` | float 0–1 | `0.65` | 无图或乘算后的基础粗糙 |
| `art.roughnessMapInfluence` | float 0–1 | `1.0` | 混合 |
| `art.enablePartColorTint` | boolean | `false` | 旧猜部位乘色 |
| `art.partTintStrength` | float 0–1 | `0` | |
| `art.hairDarken` | float 0–1 | （仅调试预览） | 若仍动态调发色 |
| `art.maxTexSize` | int 256–2048 | `1024` | downscale 上限 |
| `art.reloadArt` | button | — | 热重载材质/贴图（实现：dispose 旧 Texture 再 load） |

**准备脚本侧常量**（写在 `tools/` 脚本顶部，**不是** lil-gui，但必须可改并打印到 log）：

| 常量 | 默认 | 说明 |
|------|------|------|
| `FLIP_Y` | `False` | A2 |
| `RESIZE_FILTER` | LANCZOS | |
| `DYE_CLOTH_BODY_RGB` | `(240,240,235)` | |
| `DYE_STRENGTH_B` | `0.85` | cmask B |
| `DYE_STRENGTH_R` | `0.5` | cmask R |
| `HAIR_MULTIPLY_RGB` | `(0.15,0.12,0.10)` | |
| `ATOS_MIN_STDDEV` | `8.0` | |
| `MAIN_TEX_SIZE` | `1024` | |
| `EYE_TEX_SIZE` | `512` | |

---

## 3. 建议仓库内新增文件（执行时创建，名称可微调但须更新本方案）

| 路径 | 职责 |
|------|------|
| `tools/character_art/prepare_ryu_textures.py` | A1–A4 批处理入口 |
| `tools/character_art/bind_export_ryu_glb.py` | A5 Blender `--python` |
| `tools/character_art/README.md` | 一行命令复现（可极简） |
| `app/src/render/artMaterialMap.ts` | P7 表 + 解析函数 |
| `app/tests/render/artMaterialMap.test.ts` | 纯函数测试 |
| `app/tests/render/nrrcConvert.test.ts` | 若把转换逻辑抽成可测 TS/或 Python 侧固定向量用例 |

**禁止**：把 `private/interim` 贴图拷进 `app/public` 整包。

---

## 4. 技术陷阱汇总（检索补充）

| # | 陷阱 | 依据 | 方案内对策 |
|---|------|------|------------|
| 1 | NRRC 当标准 normal | R6、本仓库 | A2 强制转换 |
| 2 | 法线绿通道左右手 | R4 | 全局 FLIP_Y + 面板 flipNormalY |
| 3 | 数据贴图当 sRGB | R3 | NoColorSpace / Non-Color |
| 4 | WebGPU null image | 本仓库 loadFighterMesh、R12 | isUsableTexture；glb 嵌入优先 |
| 5 | 4K VRAM | 本仓库 MAX_TEX_SIZE | 1024/512 prepared |
| 6 | Blender 空用户目录丢插件 | 本机实测 | 禁用空 USER_RESOURCES |
| 7 | 无相机 render 失败 | 本机实测 | A5 建相机灯光 |
| 8 | Pillow DDS 不全 | R1 | 失败走 Blender/texconv |
| 9 | glb 压贴图踩坑 | R11 discussions | 验收前慎用有损 |
| 10 | 染色毁掉花纹 | 实践 | strength 可调；验收看纹样 |
| 11 | 骨架/动画被导出弄坏 | glTF 蒙皮常识 | 只换材质贴图；对比导出前后 bone 数 |
| 12 | iCloud 路径慢/锁 | macOS 实践 | 超时重试；产出写 private/runtime |

---

## 5. 明确不在本方案内（防 AI 扩散）

- 实现受伤/出汗/Drive 特效着色器  
- 回写 `.mesh`/`.tex` 进游戏  
- 公开 demo 站点上线原版贴图  
- 改战斗逻辑/帧数据  
- 升级 Three 主版本（除非现版本无法挂 normal）  

---

## 6. 执行检查表（AI 逐步勾选）

- [ ] A0 manifest 行数 = 源文件数  
- [ ] A1 本次 dds 已处理或失败有 notes  
- [ ] A2 六主包 bump+rough 存在且尺寸正确  
- [ ] A2 第 2 批细节 nrrc 均有产出或 UV 原因  
- [ ] A3 全部 `*_color*.png` / `*_final.png`  
- [ ] A4 每个 atos 有 ao 或 skip+原因  
- [ ] A5 glb + preview  
- [ ] A6 用户通过  
- [ ] B1 加载路径  
- [ ] B2 sanitize 不再误杀 bump  
- [ ] B3 查表  
- [ ] B4 不覆盖 final  
- [ ] B5 不重复糊化  
- [ ] B6 面板参数齐全 + 用户通过  

---

## 7. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1 | 2026-08-14 | 初版：对齐角色美术完整共识；含检索陷阱与强制调试参数 |

# re_motlist — Mac-native RE Engine motlist → Blender / glTF

Pure-Python port of the **animation** path from  
[alphazolam/fmt_RE_MESH-Noesis-Plugin](https://github.com/alphazolam/fmt_RE_MESH-Noesis-Plugin),  
plus Blender import and headless glTF/FBX export. No Noesis / Wine required.

## Model + animation responsibility

| Tool | Role |
|------|------|
| **RE Mesh Editor** | Import `.mesh` / `.mdf2` / `.tex` from unpack (real Ryu model) |
| **RE Chain Editor** | Optional `.chain` physics (not body mesh) |
| **re_motlist** | Animation only — hang Actions on RE Mesh armature |

**Do not** treat skeleton-only glb as the character.  
**Do not** import mesh without materials for “final” deliverables.

### Path requirement (critical)

RE Mesh needs a `natives/stm` layout:

```bash
# one-time
bash scripts/prepare_natives_layout.sh /Users/yangjianlin/Documents/SF6_export
# uses: SF6_export/natives/stm -> SF6_export/stm
```

Always import via paths under `…/natives/stm/product/...`.

### Ryu 特殊 idle 管线（已验收）

**完整说明：[`PIPELINE_RYU_IDLE.md`](./PIPELINE_RYU_IDLE.md)**  
绑定史：[`ANIM_BIND_FIX.md`](./ANIM_BIND_FIX.md)

摘要：RE Mesh 导模型 + **自研 mot absolute full-chain**（Mot 四元数 **共轭** + **dense lerp/slerp** + disconnect 连骨）→ 默认 clips **0,1,3** → `out/ryu_idle_pipeline/ryu_c1_clipXX_*.{blend,fbx,glb}`，**强制 60 fps**。  
Noesis FBX 仅可选对照（`--compare-noesis`），**不是**默认烘焙路径。

```bash
BLENDER="…/Blender.app/Contents/MacOS/Blender"
ROOT="…/tools/re_motlist"

"$BLENDER" --background --python "$ROOT/scripts/pipeline_ryu_idle.py" -- \
  --stage full \
  --natives-stm "/Users/yangjianlin/Documents/SF6_export/natives/stm" \
  --out-dir "$ROOT/out/ryu_idle_pipeline"
```

### Ryu motlist **批量**导出（按 clip 拆 GLB）

**完整说明：[`PIPELINE_RYU_BATCH.md`](./PIPELINE_RYU_BATCH.md)**

与特殊管线 **同一绑定**（conjugate + dense + disconnect）；单个 motlist 全量/子集 → 独立 GLB。  
命名 = 索引 + 招式名 + motion_id + 帧数。产物示例：`private/assets/ryu/anims/basic/esf001v00_idle/`（**未接入** `app/`）。  
重建旧 hold/未共轭产物时加 `--clean-glb`。

```bash
"$BLENDER" --background --python "$ROOT/scripts/pipeline_ryu_batch_motlist.py" -- \
  --stage full \
  --motlist "…/basic/esf001v00_idle.motlist.653" \
  --out-dir "$PROJECT/private/assets/ryu/anims/basic/esf001v00_idle" \
  --clean-glb
```

## What works now

| Step | Capability |
|------|------------|
| 1 | Parse SF6 `.motlist.653` (list clips, bones, frames) |
| 2 | Decode compressed pos / rot / scl keyframes |
| 3 | Build skeleton from mot bone headers (debug only) |
| 4 | Write Blender **Actions** on RE Mesh armature (`mot_conjugate` full-chain) |
| 5 | GUI: File → Import → **RE Motlist** |
| 6 | **特殊 idle 管线**（clips 0/1/3，dense@60 fps，已对齐 Noesis） |
| 7 | **批量管线**（同 dense 绑定，量产 GLB） |

交付绑定细节与勿用路径见 `ANIM_BIND_FIX.md`。

## Requirements

- Python 3.10+ (stdlib only for parsing)
- Blender 4.x / **5.2** (for apply + export)

## CLI inspect (no Blender)

```bash
cd tools/re_motlist

python3 scripts/inspect_motlist.py \
  "/Users/yangjianlin/Documents/SF6_export/stm/product/animation/esf/esf001/v00/motionlist/basic/esf001v00_idle.motlist.653" \
  --list-only
```

## Headless: motlist → glb

```bash
BLENDER="/Users/yangjianlin/Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender"

"$BLENDER" --background --python scripts/blender_apply_motlist.py -- \
  --motlist "/path/to/file.motlist.653" \
  --clip 0 \
  --out out/clip.glb
```

Also supports `--out out/clip.fbx` or `--out out/clip.blend`.

## Blender GUI workflow (with RE Mesh model)

1. Enable addon **RE Motlist Import**  
   - Preferences → Add-ons → install folder  
     `tools/re_motlist/blender_addon/re_motlist_import`  
   - Or symlink into `~/Library/Application Support/Blender/5.2/scripts/addons/`
2. **RE Mesh Editor**: import Ryu `.mesh`
3. Select the **Armature**
4. **File → Import → RE Motlist (.motlist)**  
   - set **Clip Index** (0 = first)  
   - or **Import All Clips**
5. Timeline: FPS 60, scrub / play
6. Optional: File → Export → glTF / FBX

Sidebar tab: **RE Motlist**.

## Layout

```
tools/re_motlist/
  PIPELINE_RYU_IDLE.md      # special idle pipeline (accepted)
  PIPELINE_RYU_BATCH.md     # batch export
  ANIM_BIND_FIX.md          # bind history + conjugate fix
  re_motlist/
    mot.py                  # parser
    blender_import.py       # full-chain + mot_quat_to_blender
  blender_addon/re_motlist_import/
  scripts/
    pipeline_ryu_idle.py
    pipeline_ryu_batch_motlist.py
    inspect_motlist.py
    blender_apply_motlist.py
  out/ryu_idle_pipeline/    # special pipeline outputs
```

## Notes / limits

- Mot header `frameRate` is often **0** on SF6; **export timeline is locked to 60 FPS** (`t_sec = frame / 60` in glTF).
- Mot translations are Noesis-style **×100**; pipeline uses **pos_scale=0.01**.
- Mot rotations need **conjugate** into Blender (`mot_quat_to_blender`); skipping this twists limbs.
- Mot keys are baked **dense** (every logical frame + lerp/slerp); sparse hold causes staircase jitter.
- Disconnect `use_connect` on driven bones (esp. `C_Hip`) or hip translation is discarded.
- Facial / multi-motlist sync merge is **not** ported yet.
- RE Mesh apply needs **matching bone names** (`C_Hip`, `L_Hand`, …). Skip Mot `Root` (mesh Root holds rotate90).
- Headless Apple Silicon: textures often missing (`libtexconv`); animation/geometry still valid.

## Credits

- **alphaZomega, Gh0stblade** — original Noesis plugin & format research  
- Not affiliated with Capcom or Noesis.

## Next

- Re-run batch packs with dense+conjugate bind (`--clean-glb`) for attack / move / damage  

- Optional: wire accepted glbs into `app/` / `clips.json`  
- Facial motlist merge

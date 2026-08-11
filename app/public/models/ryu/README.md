# Ryu runtime assets (app-local)

| File | Role |
|------|------|
| `ryu_c1.glb` | **Legacy** merged mesh + test clips (`idle`, `attack_light`). **Not used for combat anims anymore.** |
| `clips.json` | Old metadata |

## Current combat pipeline (2026-08-10+)

| Piece | Path |
|-------|------|
| Skinned mesh | **`private/runtime/ryu/ryu_c1_mesh_only.glb`** → URL **`/private-runtime/ryu/ryu_c1_mesh_only.glb`** |
| Mesh fallback | `app/public/models/ryu/ryu_c1.glb` (mesh only; embedded clips **ignored**) |
| Animation clips | `private/assets/ryu/anims/**/glb/*.glb` → `/private-assets/ryu/anims/...` |
| Logic → glb map | `app/public/data/clips/ryu_logic_to_glb_map.json` |
| Runtime | `FighterView` + `AnimClipLibrary` + `LogicGlbMap` |

**Note:** `mesh_only` is under `private/runtime/`, not `private/assets/` (assets tree is anim packs only). Vite plugin serves both prefixes.

Do **not** use `ryu_c1.glb` animation tracks for combat.

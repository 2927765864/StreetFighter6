# Ryu runtime assets (app-local)

| File | Role |
|------|------|
| `ryu_c1.glb` | **Legacy** merged mesh + test clips (`idle`, `attack_light`). **Not used for combat anims anymore.** |
| `clips.json` | Old metadata |

## Current combat pipeline (2026-08-12+)

| Piece | Path |
|-------|------|
| Skinned mesh (**target**) | **`private/runtime/ryu/esf001_TPose.fbx`** → `/private-runtime/ryu/esf001_TPose.fbx` |
| Mesh fallback 1 | `private/runtime/ryu/ryu_c1_mesh_only.glb` |
| Mesh fallback 2 | `app/public/models/ryu/ryu_c1.glb` (mesh only; embedded clips **ignored**) |
| Animation clips | `private/assets/ryu/anims/**/glb/*.glb` → `/private-assets/ryu/anims/...` |
| Logic → glb map | `app/public/data/clips/ryu_logic_to_glb_map.json` |
| Runtime | `loadFighterMeshFromUrl` + `bakeRyuMeshTemplate` + `FighterView` + `AnimClipLibrary` |

**FBX runtime prep** (`bakeRyuMeshTemplate` / `prepareReExtractedFighter`):

1. **cm→m bake** — FBX verts/bone locals are ~cm (`C_Hip.y≈105`); anim GLBs are meters (`≈0.95`). Bake ×0.01 into geometry + positions and rebind.
2. **Unify skeletons** — FBXLoader makes one Skeleton per mesh (duplicate `C_Hip` nodes). Rebind all skins onto the primary armature so mixer tracks drive every mesh.

**Note:** Runtime mesh lives under `private/runtime/` (not `private/assets/`). Vite plugin serves `/private-runtime/*` and `/private-assets/*`.

Do **not** use mesh-file embedded animation tracks for combat; anims backend supplies clips.

"""
Ryu pipeline: RE Mesh Editor (model) + re_motlist (animation only).

CRITICAL:
  - Mesh paths MUST go through natives/stm (RE Mesh texture/MDF resolution).
  - Always load materials by default (do not skip unless debugging).
  - re_motlist must NOT replace the mesh armature as the "character".

Stages:
  mesh  — import 00/01/02 with materials, save mesh-only blend (validate look)
  full  — mesh + idle motlist clips (default 0,1,3) + blend/fbx/glb per clip

Usage examples (do not run full until mesh stage is approved):

  Blender --background --python pipeline_ryu_idle.py -- --stage mesh
  Blender --background --python pipeline_ryu_idle.py -- --stage full
  Blender --background --python pipeline_ryu_idle.py -- --stage full --clips 0
  Blender --background --python pipeline_ryu_idle.py -- --stage full --compare-noesis
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import traceback
from pathlib import Path
from typing import List, Sequence


DEFAULT_EXPORT_ROOT = Path("/Users/yangjianlin/Documents/SF6_export")
# MUST use natives/stm so RE Mesh Editor can resolve chunkPath + textures
DEFAULT_NATIVES_STM = DEFAULT_EXPORT_ROOT / "natives" / "stm"

# Delivery timeline: glTF stores seconds as frame/fps. Always export at 60.
EXPORT_FPS = 60
# Noesis FBX scene clock when imported raw (only used to remap → EXPORT_FPS)
NOESIS_SOURCE_FPS = 25
# Special idle pipeline default clips (motlist esf001v00_idle):
#   0 BAS_STD_Loop, 1 BAS_TRN_STD, 3 BAS_STD_IDLING_Loop
DEFAULT_CLIPS = (0, 1, 3)
DEFAULT_NOESIS_FBX = Path(
    "/Users/yangjianlin/Documents/SF6_export/noesis_out/noesis_idle_out.fbx"
)


def _parse_args(argv):
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    ap = argparse.ArgumentParser(description="Ryu RE Mesh + motlist pipeline")
    ap.add_argument(
        "--stage",
        choices=("mesh", "full"),
        default="mesh",
        help="mesh=import model only (default); full=mesh+clip(s)+export",
    )
    ap.add_argument("--natives-stm", type=Path, default=DEFAULT_NATIVES_STM)
    ap.add_argument("--out-dir", type=Path, default=None)
    ap.add_argument(
        "--clip",
        type=int,
        default=None,
        help="Single clip index (default 0 = BAS_STD_Loop).",
    )
    ap.add_argument(
        "--clips",
        type=str,
        default=None,
        help="Comma-separated clip indices, e.g. 0,1,3 "
        f"(default: {','.join(str(i) for i in DEFAULT_CLIPS)}).",
    )
    ap.add_argument(
        "--parts",
        default="00,01,02",
        help="Mesh part folders under esf001/001",
    )
    ap.add_argument(
        "--no-materials",
        action="store_true",
        help="DEBUG ONLY. Produces non-representative grey models.",
    )
    ap.add_argument(
        "--noesis-fbx",
        type=Path,
        default=DEFAULT_NOESIS_FBX,
        help="Noesis ground-truth FBX (default: noesis_idle_out.fbx).",
    )
    ap.add_argument(
        "--noesis-clip",
        type=int,
        default=0,
        help="Clip index that may use Noesis FBX bake when --use-noesis-fbx.",
    )
    ap.add_argument(
        "--use-noesis-fbx",
        action="store_true",
        help="Bake from Noesis FBX via swing-align (experimental; default OFF).",
    )
    ap.add_argument(
        "--mot-bind",
        action="store_true",
        default=True,
        help="Mot absolute full-chain dense lerp (default ON for RE Mesh skin).",
    )
    ap.add_argument(
        "--no-noesis-fbx",
        action="store_true",
        help="Force mot-only (same as default).",
    )
    ap.add_argument(
        "--compare-noesis",
        action="store_true",
        help="After mot bake on --noesis-clip, sample pose vs Noesis FBX and "
        "write compare_noesis.json (does not replace mot animation).",
    )
    ap.add_argument(
        "--fps",
        type=float,
        default=float(EXPORT_FPS),
        help=f"Bake/export timeline FPS (forced to {EXPORT_FPS} for delivery).",
    )
    return ap.parse_args(argv)


def _parse_clip_indices(args) -> List[int]:
    """Resolve --clips / --clip into a unique ordered list of indices."""
    if args.clips is not None and str(args.clips).strip():
        parts = [p.strip() for p in str(args.clips).split(",") if p.strip()]
        indices = [int(p) for p in parts]
    elif args.clip is not None:
        indices = [int(args.clip)]
    else:
        indices = list(DEFAULT_CLIPS)
    # preserve order, drop duplicates
    seen = set()
    out: List[int] = []
    for i in indices:
        if i < 0:
            raise ValueError(f"clip index must be >= 0, got {i}")
        if i not in seen:
            seen.add(i)
            out.append(i)
    if not out:
        raise ValueError("no clip indices selected")
    return out


def _safe_stem(name: str) -> str:
    s = re.sub(r"[^\w\-.]+", "_", name.strip())
    return s[:80] if s else "clip"


def _clear_actions(arm) -> None:
    import bpy

    if arm.animation_data:
        arm.animation_data.action = None
    # Drop leftover actions so multi-clip exports don't pile up stale curves
    for act in list(bpy.data.actions):
        if act.users == 0:
            bpy.data.actions.remove(act)


def _iter_action_fcurves(action):
    """Yield FCurves from legacy or Blender 4.4+/5.x layered actions."""
    fcurves = getattr(action, "fcurves", None)
    if fcurves is not None:
        for fc in fcurves:
            yield fc
        return
    for layer in getattr(action, "layers", []) or []:
        for strip in getattr(layer, "strips", []) or []:
            bags = getattr(strip, "channelbags", None)
            if bags is None:
                continue
            for bag in bags:
                for fc in bag.fcurves:
                    yield fc


def _remap_action_keys_to_logical_60(
    action,
    *,
    logical_frames: int,
    export_fps: int = EXPORT_FPS,
) -> tuple:
    """
    Noesis FBX often stores ~N dense keys on a wrong scene clock (e.g. 25fps,
    frame_range ~1..330 for a 396-frame @60 idle → looks like 13.2s).

    Re-time by **key index** so key i → frame i, duration = logical_frames/export_fps.
    """
    n = max(1, int(logical_frames))
    # Collect per-fcurve sorted points; reassign frames 0..n-1 (or 0..n if n+1 keys)
    for fc in _iter_action_fcurves(action):
        pts = list(fc.keyframe_points)
        if not pts:
            continue
        pts.sort(key=lambda k: k.co[0])
        m = len(pts)
        for i, kp in enumerate(pts):
            # Map first..last key onto 0..n (inclusive end like mot frame_count)
            if m == 1:
                fr = 0.0
            else:
                fr = (i / (m - 1)) * float(n)
            kp.co[0] = fr
            kp.handle_left[0] = fr
            kp.handle_right[0] = fr
            kp.interpolation = "LINEAR"
        try:
            fc.update()
        except Exception:
            pass
    return 0, n


def _rescale_action_frames(action, scale: float, *, origin: float = 0.0) -> None:
    """Map keyframe frame indices: f' = origin + (f - origin) * scale."""
    if abs(scale - 1.0) < 1e-9:
        return
    for fc in _iter_action_fcurves(action):
        for kp in fc.keyframe_points:
            f = float(kp.co[0])
            f2 = origin + (f - origin) * scale
            kp.co[0] = f2
            if hasattr(kp, "handle_left"):
                kp.handle_left[0] = origin + (float(kp.handle_left[0]) - origin) * scale
            if hasattr(kp, "handle_right"):
                kp.handle_right[0] = origin + (float(kp.handle_right[0]) - origin) * scale
        try:
            fc.update()
        except Exception:
            pass


def _prepare_export_timeline(
    arm,
    action,
    *,
    fps: int = EXPORT_FPS,
    frame_start: int,
    frame_end: int,
) -> None:
    """
    Force delivery clock before FBX/GLB export.

    glTF does not store fps; Blender writes sampler times as frame/scene.render.fps.
    Keep only `action` so leftover Noesis/compare actions are not exported.
    """
    import bpy

    scene = bpy.context.scene
    scene.render.fps = int(fps)
    scene.render.fps_base = 1.0
    scene.frame_start = int(frame_start)
    scene.frame_end = max(int(frame_start) + 1, int(frame_end))
    scene.frame_current = scene.frame_start

    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = action

    # Drop every other action (users may still hold refs; force-clear first)
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE" and obj.animation_data and obj is not arm:
            obj.animation_data.action = None
        if obj.animation_data and obj.animation_data.action is not None:
            if obj.animation_data.action != action:
                obj.animation_data.action = None
    for act in list(bpy.data.actions):
        if act != action:
            try:
                bpy.data.actions.remove(act, do_unlink=True)
            except Exception:
                pass

    print(
        f"[pipeline] export timeline fps={scene.render.fps} "
        f"frames={scene.frame_start}..{scene.frame_end} action={action.name!r}"
    )


def _compare_armature_to_noesis(
    mesh_arm,
    noesis_fbx_path: str,
    *,
    frames: Sequence[int] = (0, 1, 30, 60, 120),
    mot_frame_count: float = 396.0,
) -> dict:
    """
    Compare mesh_arm pose (already mot-baked) to Noesis FBX at sample frames.

    Mot times are mapped from Noesis frame range proportionally.
    Returns mean/max world position delta and basis rotation angle error.
    """
    import bpy
    from math import degrees
    from mathutils import Vector

    # Import path helpers from blender_import without circular pipeline deps
    tools = Path(__file__).resolve().parents[1]
    if str(tools) not in sys.path:
        sys.path.insert(0, str(tools))
    from re_motlist import blender_import as bi

    before_obj = set(bpy.data.objects)
    before_act = set(bpy.data.actions)
    res = bpy.ops.import_scene.fbx(
        filepath=noesis_fbx_path,
        automatic_bone_orientation=False,
        ignore_leaf_bones=False,
        use_anim=True,
    )
    if "FINISHED" not in res:
        return {"error": f"fbx import failed: {res}"}

    imported = [o for o in bpy.data.objects if o not in before_obj]
    noe_arms = [o for o in imported if o.type == "ARMATURE"]
    if not noe_arms:
        return {"error": "no armature in noesis fbx"}
    noe_arm = sorted(noe_arms, key=lambda a: len(a.data.bones), reverse=True)[0]
    for o in imported:
        if o.type == "MESH":
            o.hide_viewport = True
            o.hide_render = True

    noe_action = (
        noe_arm.animation_data.action
        if noe_arm.animation_data and noe_arm.animation_data.action
        else None
    )
    if noe_action is not None and hasattr(noe_action, "frame_range"):
        f0, f1 = int(noe_action.frame_range[0]), int(noe_action.frame_range[1])
    else:
        f0, f1 = 1, 330
    noe_span = max(1, f1 - f0)

    lookup = bi.bone_lookup(mesh_arm)
    pairs = []
    for pb in noe_arm.pose.bones:
        dst = lookup.get(bi.clean_bone_name(pb.name).lower())
        if dst:
            pairs.append((pb.name, dst))

    major = {
        "c_hip",
        "c_spine1",
        "c_chest",
        "c_head",
        "l_upperarm",
        "l_forearm",
        "l_hand",
        "r_upperarm",
        "r_forearm",
        "r_hand",
        "l_thigh",
        "l_foot",
        "r_thigh",
        "r_foot",
    }

    def qang(a, b):
        return degrees(a.rotation_difference(b).angle)

    frame_rows = []
    all_dpos = []
    all_dang = []
    for f_mot in frames:
        # Map mot frame -> noesis frame proportionally
        t_norm = float(f_mot) / max(1.0, float(mot_frame_count))
        f_noe = int(round(f0 + t_norm * noe_span))
        f_noe = max(f0, min(f1, f_noe))

        bpy.context.scene.frame_set(int(f_mot))
        bpy.context.view_layer.update()
        # Set noesis to corresponding frame (its own action)
        bpy.context.scene.frame_set(f_noe)
        bpy.context.view_layer.update()
        # Re-apply mesh frame (scene has one current frame — sample both at f_noe
        # using proportional mot time by temporarily evaluating mesh at f_mot)
        # Blender only has one scene frame; evaluate mesh action at f_mot via pose.
        if mesh_arm.animation_data and mesh_arm.animation_data.action:
            # Evaluate mesh at f_mot, noesis at f_noe by swapping frame twice
            pass
        bpy.context.scene.frame_set(int(f_mot))
        bpy.context.view_layer.update()
        mesh_worlds = {}
        mesh_basis = {}
        for _, dst in pairs:
            pb = mesh_arm.pose.bones[dst]
            mesh_worlds[dst] = (mesh_arm.matrix_world @ pb.matrix).translation.copy()
            mesh_basis[dst] = (
                pb.location.copy(),
                pb.rotation_quaternion.copy(),
            )

        bpy.context.scene.frame_set(f_noe)
        bpy.context.view_layer.update()
        bones = []
        for src, dst in pairs:
            cn = bi.clean_bone_name(dst).lower()
            if cn not in major:
                continue
            spb = noe_arm.pose.bones[src]
            noe_w = (noe_arm.matrix_world @ spb.matrix).translation
            dpos = (mesh_worlds[dst] - noe_w).length
            # basis: noesis loc is ×100; compare mesh loc to noe.loc*0.01
            noe_loc = spb.location * 0.01
            noe_q = spb.rotation_quaternion
            m_loc, m_q = mesh_basis[dst]
            dang = qang(m_q, noe_q)
            dloc = (m_loc - noe_loc).length
            bones.append(
                {
                    "bone": bi.clean_bone_name(dst),
                    "dpos_world": float(dpos),
                    "dloc_basis": float(dloc),
                    "dang_basis": float(dang),
                }
            )
            all_dpos.append(dpos)
            all_dang.append(dang)
        frame_rows.append(
            {
                "mot_frame": int(f_mot),
                "noesis_frame": f_noe,
                "mean_dpos": sum(b["dpos_world"] for b in bones) / max(1, len(bones)),
                "mean_dang": sum(b["dang_basis"] for b in bones) / max(1, len(bones)),
                "bones": bones,
            }
        )

    # cleanup imported
    for o in imported:
        try:
            bpy.data.objects.remove(o, do_unlink=True)
        except Exception:
            pass
    for act in list(bpy.data.actions):
        if act not in before_act and act.users == 0:
            try:
                bpy.data.actions.remove(act)
            except Exception:
                pass

    return {
        "n_pairs": len(pairs),
        "frames": frame_rows,
        "mean_world_dpos": float(sum(all_dpos) / len(all_dpos)) if all_dpos else None,
        "max_world_dpos": float(max(all_dpos)) if all_dpos else None,
        "mean_basis_dang": float(sum(all_dang) / len(all_dang)) if all_dang else None,
        "max_basis_dang": float(max(all_dang)) if all_dang else None,
        "source_fbx": noesis_fbx_path,
    }


def _enable_addons():
    import addon_utils

    for mod in ("RE-Mesh-Editor-main", "re_motlist_import"):
        try:
            addon_utils.enable(mod, default_set=True, persistent=True)
            print(f"[pipeline] enabled addon: {mod}")
        except Exception as e:
            print(f"[pipeline] warn enable {mod}: {e}")


def _configure_sf6_chunk_path(natives_stm: Path):
    """Register SF6 chunk path so textures resolve even if splitNativesPath fails."""
    import bpy

    addon_name = "RE-Mesh-Editor-main"
    if addon_name not in bpy.context.preferences.addons:
        print(f"[pipeline] WARN: addon {addon_name} not in preferences")
        return
    prefs = bpy.context.preferences.addons[addon_name].preferences
    # Prefer logical path that still contains 'natives' for plugin heuristics
    path_str = str(Path(os.path.normpath(str(natives_stm))))
    existing = [
        (item.gameName, bpy.path.abspath(item.path))
        for item in prefs.chunkPathList_items
    ]
    for game, p in existing:
        if game == "SF6" and os.path.normpath(p) == os.path.normpath(path_str):
            print(f"[pipeline] SF6 chunk path already set: {p}")
            return
        # also match if both resolve to same real directory
        try:
            if game == "SF6" and Path(p).resolve() == Path(path_str).resolve():
                print(f"[pipeline] SF6 chunk path already set (same realpath): {p}")
                return
        except OSError:
            pass
    item = prefs.chunkPathList_items.add()
    item.gameName = "SF6"
    item.path = path_str
    print(f"[pipeline] registered SF6 chunk path: {path_str}")


def _resolve_mdf_for_mesh(mesh_path: Path) -> str:
    """SF6 uses *_v00.mdf2.31 next to mesh."""
    root = mesh_path.name.split(".mesh")[0]
    parent = mesh_path.parent
    candidates = [
        parent / f"{root}_v00.mdf2.31",
        parent / f"{root}.mdf2.31",
        parent / f"{root}_Mat.mdf2.31",
        parent / f"{root}_v00.mdf2.31",
    ]
    # also glob
    for c in candidates:
        if c.is_file():
            return str(c)
    globs = list(parent.glob(f"{root}*.mdf2*"))
    if globs:
        return str(globs[0])
    return ""


def _import_options(
    *,
    clear_scene: bool,
    merge_armature: str,
    load_materials: bool,
    mdf_path: str,
):
    return {
        "clearScene": clear_scene,
        "createCollections": True,
        "loadMaterials": load_materials,
        "loadMDFData": load_materials,
        "loadShellFur": False,
        "loadUnusedTextures": False,
        "loadUnusedProps": False,
        "useBackfaceCulling": False,
        "reloadCachedTextures": False,
        "mdfPath": mdf_path,
        "importAllLODs": False,
        "importBlendShapes": True,
        "rotate90": True,
        "mergeArmature": merge_armature or "",
        "importArmatureOnly": False,
        "mergeGroups": False,
        "importShadowMeshes": False,
        "importOcclusionMeshes": False,
        "importBoundingBoxes": False,
    }


def _get_import_fn():
    import importlib

    try:
        mod = importlib.import_module(
            "RE-Mesh-Editor-main.modules.mesh.blender_re_mesh"
        )
        return mod.importREMeshFile
    except Exception as e:
        print(f"[pipeline] importREMeshFile load failed: {e}")
        return None


def _call_import(import_fn, mesh_path: Path, options: dict) -> None:
    """importREMeshFile returns (warningList, errorList) or sometimes bool."""
    if import_fn is None:
        import bpy

        res = bpy.ops.re_mesh.importfile(
            filepath=str(mesh_path),
            directory=str(mesh_path.parent),
            files=[{"name": mesh_path.name}],
            clearScene=options["clearScene"],
            loadMaterials=options["loadMaterials"],
            loadMDFData=options["loadMDFData"],
            loadShellFur=options["loadShellFur"],
            rotate90=options["rotate90"],
            mergeArmature=options["mergeArmature"],
            mdfPath=options["mdfPath"],
            importShadowMeshes=False,
            createCollections=True,
        )
        print(f"  operator result: {res}")
        if "CANCELLED" in res:
            raise RuntimeError(f"re_mesh.importfile cancelled for {mesh_path}")
        return

    result = import_fn(str(mesh_path), options)
    if isinstance(result, tuple) and len(result) == 2:
        warnings, errors = result
        for w in warnings or []:
            print(f"  [warn] {w}")
        for e in errors or []:
            print(f"  [error] {e}")
        if errors:
            raise RuntimeError(f"import errors for {mesh_path}: {errors}")
    elif result is False:
        raise RuntimeError(f"importREMeshFile returned False for {mesh_path}")


def _find_armatures():
    import bpy

    return [o for o in bpy.data.objects if o.type == "ARMATURE"]


def _find_meshes():
    import bpy

    return [o for o in bpy.data.objects if o.type == "MESH"]


def _material_stats():
    import bpy

    mats = list(bpy.data.materials)
    images = list(bpy.data.images)
    mats_with_nodes = sum(1 for m in mats if m.use_nodes)
    return {
        "materials": len(mats),
        "materials_with_nodes": mats_with_nodes,
        "images": len(images),
        "image_names": [i.name for i in images[:12]],
    }


def _validate_scene_for_model():
    """
    Validate imported character scene.

    Hard failures: no mesh / no armature (cannot test animation).
    Soft warnings: no textures (common on Apple Silicon — libtexconv has no ARM build).
    """
    meshes = _find_meshes()
    arms = _find_armatures()
    stats = _material_stats()
    hard = []
    soft = []
    if not meshes:
        hard.append("no MESH objects")
    if not arms:
        hard.append("no ARMATURE")
    if stats["materials"] == 0:
        soft.append("zero materials (mdf may have failed)")
    if stats["images"] == 0:
        soft.append(
            "zero images — tex conversion likely failed "
            "(on Apple Silicon RE Mesh uses libtexconv which often lacks ARM support; "
            "geometry/skin still OK for animation test)"
        )
    print(f"[pipeline] validate: meshes={len(meshes)} arms={len(arms)} {stats}")
    if hard:
        print("[pipeline] VALIDATE HARD:")
        for i in hard:
            print("  -", i)
    if soft:
        print("[pipeline] VALIDATE SOFT (non-blocking):")
        for i in soft:
            print("  -", i)
    return (len(hard) == 0), hard, soft, stats


def _path_has_natives_component(path: Path) -> bool:
    """True if any path component is 'natives' (do not fully resolve symlinks away)."""
    # Prefer the user-facing path string so natives/stm -> stm symlink still counts.
    parts = Path(os.path.normpath(str(path))).parts
    return any(p.lower() == "natives" for p in parts)


def _import_mesh_parts(natives_stm: Path, parts: list[str], load_materials: bool):
    # Keep logical path with 'natives' for RE Mesh splitNativesPath / textures.
    # Do NOT .resolve() the roots — that collapses natives/stm symlink to .../stm.
    natives_stm = Path(os.path.normpath(str(natives_stm.expanduser())))
    model_base = natives_stm / "product/model/esf/esf001/001"
    if not _path_has_natives_component(natives_stm):
        raise RuntimeError(
            f"natives-stm path must contain 'natives' for RE Mesh: {natives_stm}\n"
            "Use …/SF6_export/natives/stm (symlink to stm is OK)."
        )
    if not model_base.is_dir():
        raise FileNotFoundError(model_base)

    mesh_files = []
    for part in parts:
        folder = model_base / part
        found = sorted(folder.glob(f"esf001_001_{part}.mesh.*"))
        if not found:
            found = sorted(folder.glob("*.mesh.*"))
        if not found:
            raise FileNotFoundError(f"No mesh in {folder}")
        # Keep path under natives_stm (not resolved realpath)
        mesh_files.append(folder / found[0].name)

    import_fn = _get_import_fn()
    primary_arm_data = ""

    for i, mesh_path in enumerate(mesh_files):
        mesh_path_for_import = Path(os.path.normpath(str(mesh_path)))
        if not mesh_path_for_import.is_file():
            raise FileNotFoundError(mesh_path_for_import)

        mdf = _resolve_mdf_for_mesh(mesh_path_for_import) if load_materials else ""
        # Keep mdf on natives path too
        if mdf and "natives" not in mdf.lower():
            mdf_name = Path(mdf).name
            alt = mesh_path_for_import.parent / mdf_name
            if alt.is_file():
                mdf = str(alt)

        print(
            f"[pipeline] mesh {i+1}/{len(mesh_files)}: {mesh_path_for_import}\n"
            f"  mdfPath={mdf or '(none)'}"
        )
        if load_materials and not mdf:
            print("  WARN: no mdf found next to mesh")

        options = _import_options(
            clear_scene=(i == 0),
            merge_armature=primary_arm_data if i > 0 else "",
            load_materials=load_materials,
            mdf_path=mdf,
        )
        _call_import(import_fn, mesh_path_for_import, options)

        arms = _find_armatures()
        print(f"  armatures: {[a.name for a in arms]}")
        if i == 0:
            if not arms:
                raise RuntimeError("No armature after first mesh import")
            primary = sorted(arms, key=lambda a: len(a.data.bones), reverse=True)[0]
            primary_arm_data = primary.data.name
            print(f"  primary: obj={primary.name} data={primary_arm_data}")

    return mesh_files


def main():
    import bpy

    args = _parse_args(sys.argv)
    tools_root = Path(__file__).resolve().parents[1]
    if str(tools_root) not in sys.path:
        sys.path.insert(0, str(tools_root))

    # Keep 'natives' in the path string (do not resolve symlink to bare .../stm)
    natives_stm = Path(os.path.normpath(str(args.natives_stm.expanduser())))
    if not natives_stm.is_dir():
        raise FileNotFoundError(
            f"natives/stm missing: {natives_stm}\n"
            "Create: mkdir -p SF6_export/natives && ln -s ../stm SF6_export/natives/stm"
        )
    if not _path_has_natives_component(natives_stm):
        # Auto-correct common mistake: user passed .../stm instead of .../natives/stm
        candidate = natives_stm.parent / "natives" / "stm"
        if candidate.is_dir() and _path_has_natives_component(candidate):
            print(f"[pipeline] rewriting natives-stm {natives_stm} -> {candidate}")
            natives_stm = Path(os.path.normpath(str(candidate)))
        else:
            raise RuntimeError(
                f"natives-stm must include a 'natives' folder component: {natives_stm}"
            )

    out_dir = args.out_dir
    if out_dir is None:
        if args.stage == "mesh":
            out_dir = tools_root / "out" / "ryu_mesh_validate"
        else:
            out_dir = tools_root / "out" / "ryu_idle_pipeline"
    out_dir = out_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    parts = [p.strip() for p in args.parts.split(",") if p.strip()]
    load_mats = not args.no_materials

    print("[pipeline] stage:", args.stage)
    print("[pipeline] natives_stm:", natives_stm)
    print("[pipeline] materials:", load_mats)
    print("[pipeline] out_dir:", out_dir)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    _enable_addons()
    _configure_sf6_chunk_path(natives_stm)

    mesh_files = _import_mesh_parts(natives_stm, parts, load_mats)
    ok, hard, soft, mat_stats = _validate_scene_for_model()

    arms = _find_armatures()
    meshes = _find_meshes()
    arm = sorted(arms, key=lambda a: len(a.data.bones), reverse=True)[0]

    # Always save mesh-only snapshot for visual QA
    mesh_blend = out_dir / "ryu_c1_mesh_only.blend"
    print(f"[pipeline] saving mesh-only blend → {mesh_blend}")
    bpy.ops.wm.save_as_mainfile(filepath=str(mesh_blend))

    manifest_lines = [
        f"stage={args.stage}",
        f"natives_stm={natives_stm}",
        f"materials={load_mats}",
        f"meshes_imported={mesh_files}",
        f"armature={arm.name} bones={len(arm.data.bones)}",
        f"mesh_objects={len(meshes)}",
        f"material_stats={mat_stats}",
        f"validate_ok={ok}",
        f"validate_hard={hard}",
        f"validate_soft={soft}",
        f"mesh_only_blend={mesh_blend}",
    ]

    if args.stage == "mesh":
        (out_dir / "MANIFEST.txt").write_text(
            "\n".join(map(str, manifest_lines)) + "\n", encoding="utf-8"
        )
        if not ok:
            print("[pipeline] MESH STAGE hard-failed")
            sys.exit(2)
        print("[pipeline] MESH STAGE OK (soft warnings may remain)")
        return

    # ---- full stage: animation + exports (one or more clips) ----
    if not ok:
        raise RuntimeError(
            "Refusing full export: mesh hard validation failed: " + "; ".join(hard)
        )
    if soft:
        print("[pipeline] continuing full despite soft texture warnings (anim focus)")

    clip_indices = _parse_clip_indices(args)
    # Lock delivery FPS (ignore accidental --fps 25 etc.)
    if abs(float(args.fps) - float(EXPORT_FPS)) > 1e-6:
        print(
            f"[pipeline] WARN: --fps {args.fps} overridden → {EXPORT_FPS} (delivery lock)"
        )
    args.fps = float(EXPORT_FPS)
    print(f"[pipeline] clips: {clip_indices} export_fps={EXPORT_FPS}")

    motlist = (
        natives_stm
        / "product/animation/esf/esf001/v00/motionlist/basic/esf001v00_idle.motlist.653"
    )
    if not motlist.is_file():
        raise FileNotFoundError(motlist)

    from re_motlist.mot import load_motlist
    from re_motlist import blender_import as bi

    mlist = load_motlist(motlist)
    n_mots = len(mlist.mots)
    for idx in clip_indices:
        if idx < 0 or idx >= n_mots:
            raise IndexError(
                f"clip index {idx} out of range 0..{n_mots - 1} for {motlist.name}"
            )

    # Special idle default: bake from Noesis GT (noesis_idle_out.fbx) so delivery
    # matches the known-good export. --mot-bind / --no-noesis-fbx uses mot path.
    noesis_fbx = Path(os.path.normpath(str(args.noesis_fbx.expanduser())))
    if not noesis_fbx.is_file():
        print(f"[pipeline] Noesis FBX not found: {noesis_fbx}")
        noesis_fbx = None

    # Default: mot dense lerp. Noesis bake only if explicitly --use-noesis-fbx
    # and not forced mot.
    want_noesis = bool(args.use_noesis_fbx) and not bool(args.no_noesis_fbx)
    # argparse store_true default True on mot_bind is awkward if both flags;
    # explicit --use-noesis-fbx wins only when set.
    if getattr(args, "use_noesis_fbx", False) and "--use-noesis-fbx" in (
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv
    ):
        want_noesis = True
    else:
        want_noesis = False
    if want_noesis and noesis_fbx is None:
        print("[pipeline] WARN: Noesis bake requested but FBX missing → fall back to mot")
        want_noesis = False

    multi = len(clip_indices) > 1
    clip_summaries: List[str] = []
    # Only pure single-clip runs use the short ryu_c1_idle.* stem for every file.
    # Multi (default 0,1,3): per-clip stems + alias clip0 → ryu_c1_idle.*.
    legacy_single = clip_indices == [0]
    compare_reports: List[dict] = []

    for n_done, idx in enumerate(clip_indices):
        mot = mlist.mots[idx]
        base = mot.base_name or f"clip{idx}"
        logical_frames = max(1, int(round(float(mot.frame_count or 1))))
        print(
            f"\n[pipeline] === clip {idx} ({n_done + 1}/{len(clip_indices)}) "
            f"{base} frames={mot.frame_count} ==="
        )
        mlist.read([mot.name])
        mlist.make_anims([mot.name])
        anim = mlist.anims[-1] if mlist.anims else None
        if anim is None:
            raise RuntimeError(f"make_anims produced no animation for clip {idx}")

        _clear_actions(arm)
        bpy.context.view_layer.objects.active = arm
        arm.select_set(True)

        use_noesis = want_noesis and noesis_fbx is not None and idx == args.noesis_clip
        if use_noesis:
            print(f"[pipeline] baking animation from Noesis FBX: {noesis_fbx}")
            # Disconnect driven bones so hip location from Noesis evaluates
            try:
                bpy.ops.object.mode_set(mode="EDIT")
                n_disc = 0
                for eb in arm.data.edit_bones:
                    if eb.use_connect and eb.name != "Root":
                        eb.use_connect = False
                        n_disc += 1
                bpy.ops.object.mode_set(mode="OBJECT")
                if n_disc:
                    print(f"[pipeline] disconnected {n_disc} bones before Noesis bake")
            except Exception as e:
                print(f"[pipeline] WARN disconnect: {e}")
                try:
                    bpy.ops.object.mode_set(mode="OBJECT")
                except Exception:
                    pass
            action, stats = bi.apply_action_from_noesis_fbx(
                arm,
                str(noesis_fbx),
                action_name=(base or "Noesis_Idle")[:63],
                logical_frames=logical_frames,
            )
            bind_mode = "noesis_fbx"
        else:
            print(
                "[pipeline] mot absolute full-chain "
                "(quat=mot_conjugate; dense_lerp_slerp)"
            )
            action, stats = bi.apply_animation_mot_absolute_full_chain(
                arm,
                mot,
                anim,
                fps=float(args.fps),
                action_name=(base or f"clip{idx}")[:63],
                pos_scale=0.01,
                skip_bones=("Root",),
            )
            bind_mode = "mot_absolute_full_chain"

        print(
            f"[pipeline] action={action.name} bind={bind_mode} stats={stats}"
        )

        # Delivery clock is always EXPORT_FPS (60).
        export_fps = int(EXPORT_FPS)
        if bind_mode == "noesis_fbx":
            # World-bake already keys 0..logical_frames
            frame_start = int(stats.get("frame_start", 0))
            frame_end = int(stats.get("frame_end", logical_frames))
            print(
                f"[pipeline] Noesis world-bake timeline "
                f"frames {frame_start}..{frame_end} @{export_fps}fps "
                f"(duration {frame_end / export_fps:.3f}s)"
            )
        else:
            frame_start = 0
            frame_end = logical_frames

        # Optional quantitative compare (mot path only; noesis bake is GT copy)
        if (
            args.compare_noesis
            and noesis_fbx is not None
            and idx == args.noesis_clip
            and bind_mode == "mot_absolute_full_chain"
        ):
            scene = bpy.context.scene
            scene.render.fps = export_fps
            scene.frame_start = frame_start
            scene.frame_end = frame_end
            cmp = _compare_armature_to_noesis(
                arm,
                str(noesis_fbx),
                frames=(0, 1, 30, 60, 120),
                mot_frame_count=float(mot.frame_count or 1),
            )
            if arm.animation_data:
                arm.animation_data.action = action
            cmp["clip"] = idx
            cmp["base_name"] = base
            cmp["bind_mode"] = bind_mode
            compare_reports.append(cmp)
            print(
                f"[pipeline] compare_noesis mean_world_dpos={cmp.get('mean_world_dpos')} "
                f"mean_basis_dang={cmp.get('mean_basis_dang')} "
                f"max_world_dpos={cmp.get('max_world_dpos')}"
            )

        _prepare_export_timeline(
            arm,
            action,
            fps=export_fps,
            frame_start=frame_start,
            frame_end=frame_end,
        )
        scene = bpy.context.scene

        # FBX exporters often re-encode connected bones and drop hip location.
        # Keep C_Hip (and any driven bone) disconnected so location keys survive.
        try:
            bpy.context.view_layer.objects.active = arm
            bpy.ops.object.mode_set(mode="EDIT")
            n_disc = 0
            for eb in arm.data.edit_bones:
                if eb.name == "Root":
                    continue
                if eb.use_connect:
                    eb.use_connect = False
                    n_disc += 1
            bpy.ops.object.mode_set(mode="OBJECT")
            if n_disc:
                print(f"[pipeline] pre-export disconnected {n_disc} bones (FBX hip loc)")
        except Exception as e:
            print(f"[pipeline] WARN pre-export disconnect: {e}")
            try:
                bpy.ops.object.mode_set(mode="OBJECT")
            except Exception:
                pass

        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        for m in meshes:
            m.select_set(True)
        bpy.context.view_layer.objects.active = arm

        stem = (
            "ryu_c1_idle"
            if legacy_single
            else f"ryu_c1_clip{idx:02d}_{_safe_stem(base)}"
        )
        blend_path = out_dir / f"{stem}.blend"
        fbx_path = out_dir / f"{stem}.fbx"
        glb_path = out_dir / f"{stem}.glb"

        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        bpy.ops.export_scene.fbx(
            filepath=str(fbx_path),
            use_selection=True,
            object_types={"ARMATURE", "MESH"},
            bake_anim=True,
            bake_anim_use_all_bones=True,
            bake_anim_use_nla_strips=False,
            bake_anim_use_all_actions=False,
            bake_anim_force_startend_keying=True,
            add_leaf_bones=False,
            path_mode="COPY",
            embed_textures=True,
            mesh_smooth_type="FACE",
        )
        try:
            bpy.ops.export_scene.gltf(
                filepath=str(glb_path),
                export_format="GLB",
                use_selection=True,
                export_animations=True,
                export_nla_strips=False,
                export_force_sampling=True,
                export_frame_range=True,
                export_anim_single_armature=True,
                export_skins=True,
                export_apply=False,
            )
        except Exception as e:
            print(f"[pipeline] glb warning clip {idx}: {e}")

        glb_bytes = glb_path.stat().st_size if glb_path.is_file() else 0
        print(f"[pipeline] wrote {glb_path.name} ({glb_bytes:,} bytes)")

        summary = (
            f"clip[{idx}] name={base} bind={bind_mode} "
            f"action={action.name} frames={scene.frame_start}..{scene.frame_end} "
            f"fps={scene.render.fps} blend={blend_path.name} "
            f"fbx={fbx_path.name} glb={glb_path.name} glb_bytes={glb_bytes} "
            f"anim_stats={stats}"
        )
        clip_summaries.append(summary)
        manifest_lines.append(summary)

        # Compat alias for clip 0 exports
        if multi and idx == 0:
            for src, alias in (
                (blend_path, "ryu_c1_idle.blend"),
                (fbx_path, "ryu_c1_idle.fbx"),
                (glb_path, "ryu_c1_idle.glb"),
            ):
                if src.is_file():
                    dst = out_dir / alias
                    if src.resolve() != dst.resolve():
                        import shutil

                        shutil.copy2(src, dst)
                        print(f"[pipeline] legacy alias → {dst.name}")

    if compare_reports:
        import json

        cmp_path = out_dir / "compare_noesis.json"
        cmp_path.write_text(
            json.dumps(compare_reports, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"[pipeline] wrote {cmp_path}")
        manifest_lines.append(f"compare_noesis={cmp_path}")

    manifest_lines.extend(
        [
            f"motlist={motlist}",
            f"clips={clip_indices}",
            f"noesis_fbx={noesis_fbx}",
            f"noesis_clip={args.noesis_clip}",
            f"use_noesis_fbx={bool(args.use_noesis_fbx)}",
            f"export_fps={EXPORT_FPS}",
            f"n_clips_exported={len(clip_summaries)}",
        ]
    )
    (out_dir / "MANIFEST.txt").write_text(
        "\n".join(map(str, manifest_lines)) + "\n", encoding="utf-8"
    )
    print("\n[pipeline] FULL STAGE DONE")
    for s in clip_summaries:
        print("  ", s)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)

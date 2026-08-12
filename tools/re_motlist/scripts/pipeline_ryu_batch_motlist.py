"""
Batch Ryu pipeline: RE Mesh (once) + every clip in a motlist → named GLBs.

Parity with the validated special idle pipeline (pipeline_ryu_idle.py):
  • bind: mot absolute full-chain + Mot quaternion conjugate
  • sample: dense 0..N logical frames + lerp/slerp (no sparse hold)
  • connect: disconnect driven/connected bones so hip location survives
  • export: locked 60 fps, single Action per GLB; pre-export disconnect
  • Noesis FBX: OPT-IN only (--use-noesis-fbx), not the default

Usage (Blender headless):

  Blender --background --python pipeline_ryu_batch_motlist.py -- \\
    --motlist ".../basic/esf001v00_idle.motlist.653" \\
    --out-dir ".../private/assets/ryu/anims/basic/esf001v00_idle" \\
    --stage full

  # subset / dry list
  --list-only
  --clips 0,1,3
  --clip-range 0:10
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence


DEFAULT_EXPORT_ROOT = Path("/Users/yangjianlin/Documents/SF6_export")
DEFAULT_NATIVES_STM = DEFAULT_EXPORT_ROOT / "natives" / "stm"
DEFAULT_IDLE_MOTLIST = (
    DEFAULT_NATIVES_STM
    / "product/animation/esf/esf001/v00/motionlist/basic/esf001v00_idle.motlist.653"
)
# Same GT as special idle pipeline (compare / optional bake only)
DEFAULT_NOESIS_IDLE = (
    DEFAULT_EXPORT_ROOT / "noesis_out" / "noesis_idle_out.fbx"
)

# Delivery contract (must match pipeline_ryu_idle.EXPORT_FPS / bind)
BIND_MODE_DEFAULT = "mot_absolute_full_chain"
QUAT_CONVENTION = "mot_conjugate"
SAMPLE_MODE = "dense_lerp_slerp"
PIPELINE_PARITY = "pipeline_ryu_idle"


def _load_idle_pipeline():
    """Reuse mesh import / export helpers from the validated idle pipeline."""
    path = Path(__file__).resolve().parent / "pipeline_ryu_idle.py"
    spec = importlib.util.spec_from_file_location("pipeline_ryu_idle", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _parse_args(argv: List[str]):
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    ap = argparse.ArgumentParser(
        description=(
            "Batch export motlist clips to GLB "
            f"(bind={BIND_MODE_DEFAULT}+{QUAT_CONVENTION}, same as special idle pipeline)"
        )
    )
    ap.add_argument("--stage", choices=("list", "mesh", "full"), default="full")
    ap.add_argument("--natives-stm", type=Path, default=DEFAULT_NATIVES_STM)
    ap.add_argument("--motlist", type=Path, default=DEFAULT_IDLE_MOTLIST)
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output root (default: private/assets/ryu/anims/<parent>/<motlist_stem>)",
    )
    ap.add_argument("--parts", default="00,01,02")
    ap.add_argument(
        "--no-materials",
        action="store_true",
        help="DEBUG ONLY — grey model, faster texture path",
    )
    ap.add_argument(
        "--clips",
        default="",
        help="Comma-separated clip indices (default: all)",
    )
    ap.add_argument(
        "--clip-range",
        default="",
        help="Inclusive range START:END (e.g. 0:5). Combined with --clips as union.",
    )
    ap.add_argument(
        "--list-only",
        action="store_true",
        help="Print clip table and exit (no Blender mesh work)",
    )
    ap.add_argument(
        "--fps",
        type=float,
        default=60.0,
        help="Timeline FPS (locked to special pipeline EXPORT_FPS=60)",
    )
    ap.add_argument(
        "--export-fbx",
        action="store_true",
        help="Also write per-clip .fbx (slow / large)",
    )
    ap.add_argument(
        "--export-blend",
        action="store_true",
        help="Also write per-clip .blend",
    )
    ap.add_argument(
        "--keep-mesh-blend",
        action="store_true",
        default=True,
        help="Save ryu_c1_mesh_only.blend once (default on)",
    )
    ap.add_argument(
        "--noesis-fbx",
        type=Path,
        default=DEFAULT_NOESIS_IDLE,
        help=(
            "Noesis GT FBX (default: noesis_idle_out.fbx). "
            "Used only with --use-noesis-fbx (optional A/B bake)."
        ),
    )
    ap.add_argument(
        "--noesis-clip",
        type=int,
        default=0,
        help="Clip index for optional Noesis bake when --use-noesis-fbx",
    )
    ap.add_argument(
        "--use-noesis-fbx",
        action="store_true",
        help=(
            "OPT-IN: world-bake --noesis-clip from Noesis FBX onto RE Mesh "
            "(skips mot bind for that clip). Default is pure mot dense full-chain "
            "for ALL clips (parity with special pipeline)."
        ),
    )
    ap.add_argument(
        "--no-noesis-fbx",
        action="store_true",
        help="Deprecated alias: mot-only is already the default. Kept for old scripts.",
    )
    ap.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip clips whose GLB already exists",
    )
    ap.add_argument(
        "--clean-glb",
        action="store_true",
        help="Delete out-dir/glb/*.glb before export (ignored with --skip-existing)",
    )
    ap.add_argument(
        "--fail-fast",
        action="store_true",
        help="Abort on first clip failure (default: continue and record errors)",
    )
    return ap.parse_args(argv)


def _sanitize_filename(name: str) -> str:
    """Safe single-path component; keep alnum, underscore, hyphen, dots."""
    name = name.strip().replace(" ", "_")
    name = re.sub(r"[^\w.\-]+", "_", name, flags=re.UNICODE)
    name = re.sub(r"_+", "_", name).strip("._")
    return name or "unnamed"


def clip_asset_stem(
    *,
    index: int,
    base_name: str,
    motion_id: Any,
    frame_count: float,
) -> str:
    """
    Filename stem from motlist identity fields.

    Example: 000_esf001_BAS_STD_Loop_id0000_f396
    Leading index keeps filesystem sort = motlist order.
    """
    mid = int(motion_id) if motion_id is not None and str(motion_id).isdigit() else motion_id
    try:
        mid_s = f"{int(mid):04d}"
    except (TypeError, ValueError):
        mid_s = _sanitize_filename(str(mid))
    frames = int(round(float(frame_count)))
    base = _sanitize_filename(base_name)
    return f"{index:03d}_{base}_id{mid_s}_f{frames}"


def parse_clip_selection(
    n_clips: int, clips_csv: str, clip_range: str
) -> List[int]:
    selected: set[int] = set()
    if clips_csv.strip():
        for part in clips_csv.split(","):
            part = part.strip()
            if not part:
                continue
            idx = int(part)
            if idx < 0 or idx >= n_clips:
                raise IndexError(f"clip index {idx} out of range 0..{n_clips-1}")
            selected.add(idx)
    if clip_range.strip():
        a, b = clip_range.split(":", 1)
        start = int(a.strip()) if a.strip() else 0
        end = int(b.strip()) if b.strip() else n_clips - 1
        if start > end:
            start, end = end, start
        for i in range(start, end + 1):
            if i < 0 or i >= n_clips:
                raise IndexError(f"clip-range hits {i} out of range 0..{n_clips-1}")
            selected.add(i)
    if not selected:
        return list(range(n_clips))
    return sorted(selected)


def default_out_dir(project_root: Path, motlist: Path) -> Path:
    # …/motionlist/basic/esf001v00_idle.motlist.653 → basic / esf001v00_idle
    stem = motlist.name
    for suf in (".motlist.653", ".motlist", ".653"):
        if stem.endswith(suf):
            stem = stem[: -len(suf)]
            break
    parent_cat = motlist.parent.name  # e.g. basic
    return project_root / "private" / "assets" / "ryu" / "anims" / parent_cat / stem


def _clear_actions(arm) -> None:
    import bpy

    if arm.animation_data and arm.animation_data.action:
        arm.animation_data.action = None
    for act in list(bpy.data.actions):
        if act.users == 0:
            try:
                bpy.data.actions.remove(act)
            except Exception:
                pass


def _disconnect_connected_bones(arm, *, skip_names: Sequence[str] = ("Root",)) -> int:
    """
    Clear use_connect on driven bones so location keys (esp. C_Hip) evaluate.

    RE Mesh often has C_Hip.use_connect=True under Root; Blender then discards
    hip translation. Matches special idle pre-export disconnect.
    """
    import bpy

    skip = {n.lower() for n in skip_names}
    n_disc = 0
    try:
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="EDIT")
        for eb in arm.data.edit_bones:
            if eb.name.lower() in skip:
                continue
            if eb.use_connect:
                eb.use_connect = False
                n_disc += 1
        bpy.ops.object.mode_set(mode="OBJECT")
    except Exception as e:
        print(f"[batch] WARN disconnect: {e}")
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
    return n_disc


def _export_selection(
    arm,
    meshes,
    glb_path: Path,
    fbx_path: Optional[Path],
    blend_path: Optional[Path],
    *,
    idle_pl,
    action,
    fps: int,
    frame_start: int,
    frame_end: int,
):
    import bpy

    # Force 60fps delivery clock + single action (glTF times = frame/fps)
    idle_pl._prepare_export_timeline(
        arm,
        action,
        fps=int(fps),
        frame_start=int(frame_start),
        frame_end=int(frame_end),
    )

    # FBX (and some glTF paths) re-encode connected bones and drop hip location.
    n_disc = _disconnect_connected_bones(arm, skip_names=("Root",))
    if n_disc:
        print(f"[batch] pre-export disconnected {n_disc} bones (hip loc / connect)")

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = arm

    if blend_path is not None:
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    if fbx_path is not None:
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


def build_clip_records(mlist) -> List[Dict[str, Any]]:
    rows = []
    for i, mot in enumerate(mlist.mots):
        mid = mlist.motion_ids.get(i)
        rows.append(
            {
                "index": i,
                "base_name": mot.base_name,
                "display_name": mot.name,
                "motion_id": mid,
                "frame_count": float(mot.frame_count),
                "bone_count": int(mot.bone_count),
                "stem": clip_asset_stem(
                    index=i,
                    base_name=mot.base_name,
                    motion_id=mid if mid is not None else i,
                    frame_count=mot.frame_count,
                ),
            }
        )
    return rows


def main():
    args = _parse_args(sys.argv)
    tools_root = Path(__file__).resolve().parents[1]
    project_root = tools_root.parents[1]
    if str(tools_root) not in sys.path:
        sys.path.insert(0, str(tools_root))

    from re_motlist.mot import load_motlist
    from re_motlist import blender_import as bi

    motlist_path = Path(os.path.normpath(str(args.motlist.expanduser())))
    if not motlist_path.is_file():
        alt = Path(str(motlist_path).replace("/natives/stm/", "/stm/"))
        if alt.is_file():
            motlist_path = alt
        else:
            raise FileNotFoundError(motlist_path)

    print(f"[batch] motlist: {motlist_path}")
    print(
        f"[batch] bind contract: {BIND_MODE_DEFAULT} + {QUAT_CONVENTION} "
        f"+ {SAMPLE_MODE} (parity={PIPELINE_PARITY})"
    )
    mlist = load_motlist(motlist_path)
    records = build_clip_records(mlist)
    indices = parse_clip_selection(len(records), args.clips, args.clip_range)

    print(
        f"[batch] motlist name={mlist.name} clips={len(records)} selected={len(indices)}"
    )
    for r in records:
        mark = "*" if r["index"] in indices else " "
        print(
            f"  {mark}[{r['index']:3d}] mid={r['motion_id']!s:>6}  "
            f"f={r['frame_count']:7.1f}  {r['base_name']}  → {r['stem']}.glb"
        )

    if args.list_only or args.stage == "list":
        out_preview = args.out_dir or default_out_dir(project_root, motlist_path)
        print(f"[batch] list-only; default out would be: {out_preview}")
        return

    idle_pl = _load_idle_pipeline()
    export_fps_lock = int(getattr(idle_pl, "EXPORT_FPS", 60))
    if abs(float(args.fps) - float(export_fps_lock)) > 1e-6:
        print(
            f"[batch] WARN: --fps {args.fps} overridden → {export_fps_lock} (delivery lock)"
        )
    args.fps = float(export_fps_lock)
    print(
        f"[batch] export_fps locked to {export_fps_lock}; "
        f"sample_mode={SAMPLE_MODE}"
    )

    natives_stm = Path(os.path.normpath(str(args.natives_stm.expanduser())))
    if not natives_stm.is_dir():
        raise FileNotFoundError(natives_stm)
    if not idle_pl._path_has_natives_component(natives_stm):
        candidate = natives_stm.parent / "natives" / "stm"
        if candidate.is_dir() and idle_pl._path_has_natives_component(candidate):
            print(f"[batch] rewriting natives-stm {natives_stm} -> {candidate}")
            natives_stm = Path(os.path.normpath(str(candidate)))
        else:
            raise RuntimeError(
                f"natives-stm must include a 'natives' folder component: {natives_stm}"
            )

    out_dir = args.out_dir
    if out_dir is None:
        out_dir = default_out_dir(project_root, motlist_path)
    out_dir = out_dir.expanduser().resolve()
    glb_dir = out_dir / "glb"
    glb_dir.mkdir(parents=True, exist_ok=True)
    if args.export_fbx:
        (out_dir / "fbx").mkdir(exist_ok=True)
    if args.export_blend:
        (out_dir / "blend").mkdir(exist_ok=True)

    parts = [p.strip() for p in args.parts.split(",") if p.strip()]
    load_mats = not args.no_materials

    import bpy

    print("[batch] stage:", args.stage)
    print("[batch] natives_stm:", natives_stm)
    print("[batch] out_dir:", out_dir)
    print("[batch] materials:", load_mats)
    print(
        f"[batch] use_noesis_fbx={bool(args.use_noesis_fbx)} "
        f"(default is pure mot for all clips)"
    )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    idle_pl._enable_addons()
    idle_pl._configure_sf6_chunk_path(natives_stm)

    mesh_files = idle_pl._import_mesh_parts(natives_stm, parts, load_mats)
    ok, hard, soft, mat_stats = idle_pl._validate_scene_for_model()
    arms = idle_pl._find_armatures()
    meshes = idle_pl._find_meshes()
    if not ok:
        raise RuntimeError("Mesh hard validation failed: " + "; ".join(hard))
    arm = sorted(arms, key=lambda a: len(a.data.bones), reverse=True)[0]
    print(f"[batch] armature={arm.name} bones={len(arm.data.bones)} meshes={len(meshes)}")

    mesh_blend = out_dir / "ryu_c1_mesh_only.blend"
    if args.keep_mesh_blend:
        print(f"[batch] saving mesh-only blend → {mesh_blend}")
        bpy.ops.wm.save_as_mainfile(filepath=str(mesh_blend))

    if args.stage == "mesh":
        catalog = {
            "pipeline": "pipeline_ryu_batch_motlist",
            "pipeline_parity": PIPELINE_PARITY,
            "motlist": str(motlist_path),
            "motlist_name": mlist.name,
            "stage": "mesh",
            "clips": records,
            "selected": indices,
            "mesh_only_blend": str(mesh_blend),
            "material_stats": mat_stats,
            "validate_soft": soft,
            "bind_default": BIND_MODE_DEFAULT,
            "quat_convention": QUAT_CONVENTION,
            "sample_mode": SAMPLE_MODE,
            "export_fps": export_fps_lock,
        }
        (out_dir / "catalog.json").write_text(
            json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print("[batch] MESH STAGE OK")
        return

    # Wipe stale GLBs from the broken pre-conjugate / hold-sample era when re-exporting
    if args.clean_glb and not args.skip_existing:
        removed = 0
        for p in glb_dir.glob("*.glb"):
            p.unlink()
            removed += 1
        print(f"[batch] --clean-glb removed {removed} old glb file(s)")

    # ---- full: per-clip bake + export ----
    # Default = pure mot dense (special-pipeline parity). Noesis only if opted in.
    noesis_fbx = None
    if args.use_noesis_fbx and not args.no_noesis_fbx:
        noesis_fbx = Path(os.path.normpath(str(args.noesis_fbx.expanduser())))
        if not noesis_fbx.is_file():
            print(f"[batch] --use-noesis-fbx but FBX missing, ignoring: {noesis_fbx}")
            noesis_fbx = None
    elif args.noesis_fbx and not args.use_noesis_fbx and not args.no_noesis_fbx:
        # Old scripts passed --noesis-fbx without knowing it was auto-applied.
        print(
            "[batch] NOTE: Noesis FBX is no longer applied by default. "
            "Pass --use-noesis-fbx to opt in for --noesis-clip only. "
            f"Default GT path: {DEFAULT_NOESIS_IDLE.name}"
        )

    results: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    for n_done, idx in enumerate(indices):
        rec = records[idx]
        stem = rec["stem"]
        glb_path = glb_dir / f"{stem}.glb"
        print(
            f"\n[batch] === clip {idx} ({n_done + 1}/{len(indices)}) "
            f"{rec['base_name']} → {glb_path.name} ==="
        )

        if args.skip_existing and glb_path.is_file():
            print(f"[batch] skip existing {glb_path}")
            results.append({**rec, "glb": str(glb_path), "status": "skipped_existing"})
            continue

        try:
            mot = mlist.mots[idx]
            mlist.read([mot.name])
            mlist.make_anims([mot.name])
            anim = mlist.anims[-1] if mlist.anims else None
            if anim is None:
                raise RuntimeError("make_anims produced no animation")

            _clear_actions(arm)

            use_noesis = (
                noesis_fbx is not None
                and idx == args.noesis_clip
            )
            bpy.context.view_layer.objects.active = arm
            arm.select_set(True)

            export_fps = export_fps_lock
            logical_frames = max(1, int(round(float(anim.frame_count or 1))))

            if use_noesis:
                # Optional A/B only. World-bake remaps onto 0..logical_frames @60
                # (do NOT apply legacy 25→60 key rescale — Noesis clock is wrong).
                print(
                    f"[batch] Noesis FBX world-bake (opt-in): {noesis_fbx} "
                    f"logical_frames={logical_frames}"
                )
                n_disc = _disconnect_connected_bones(arm, skip_names=("Root",))
                if n_disc:
                    print(f"[batch] disconnected {n_disc} bones before Noesis bake")
                action, stats = bi.apply_action_from_noesis_fbx(
                    arm,
                    str(noesis_fbx),
                    action_name=mot.base_name[:63],
                    logical_frames=logical_frames,
                )
                frame_start = int(stats.get("frame_start", 0))
                frame_end = int(stats.get("frame_end", logical_frames))
                bind_mode = "noesis_fbx"
            else:
                print(
                    f"[batch] mot absolute full-chain "
                    f"(quat={QUAT_CONVENTION}; sample={SAMPLE_MODE}; "
                    f"parity={PIPELINE_PARITY})"
                )
                action, stats = bi.apply_animation_mot_absolute_full_chain(
                    arm,
                    mot,
                    anim,
                    fps=float(export_fps),
                    action_name=mot.base_name[:63],
                    pos_scale=0.01,
                    skip_bones=("Root",),
                )
                frame_start = 0
                frame_end = logical_frames
                bind_mode = BIND_MODE_DEFAULT
                # Sanity: shared implementation must report conjugate + dense sample
                if stats.get("quat_convention") not in (None, QUAT_CONVENTION):
                    print(
                        f"[batch] WARN unexpected quat_convention="
                        f"{stats.get('quat_convention')}"
                    )
                if stats.get("sample_mode") not in (None, SAMPLE_MODE):
                    print(
                        f"[batch] WARN unexpected sample_mode="
                        f"{stats.get('sample_mode')}"
                    )

            print(
                f"[batch] action={action.name} bind={bind_mode} "
                f"export_fps={export_fps} frames={frame_start}..{frame_end} stats={stats}"
            )

            fbx_path = (out_dir / "fbx" / f"{stem}.fbx") if args.export_fbx else None
            blend_path = (
                (out_dir / "blend" / f"{stem}.blend") if args.export_blend else None
            )
            _export_selection(
                arm,
                meshes,
                glb_path,
                fbx_path,
                blend_path,
                idle_pl=idle_pl,
                action=action,
                fps=export_fps,
                frame_start=frame_start,
                frame_end=frame_end,
            )

            size = glb_path.stat().st_size if glb_path.is_file() else 0
            print(f"[batch] wrote {glb_path} ({size:,} bytes)")
            results.append(
                {
                    **rec,
                    "glb": str(glb_path),
                    "fbx": str(fbx_path) if fbx_path else None,
                    "blend": str(blend_path) if blend_path else None,
                    "bind_mode": bind_mode,
                    "quat_convention": (
                        stats.get("quat_convention")
                        if bind_mode == BIND_MODE_DEFAULT
                        else None
                    ),
                    "sample_mode": (
                        stats.get("sample_mode", SAMPLE_MODE)
                        if bind_mode == BIND_MODE_DEFAULT
                        else stats.get("bake_mode")
                    ),
                    "anim_stats": stats,
                    "frame_start": frame_start,
                    "frame_end": frame_end,
                    "fps": export_fps,
                    "glb_bytes": size,
                    "status": "ok",
                }
            )
        except Exception as e:
            traceback.print_exc()
            err = {**rec, "status": "error", "error": str(e)}
            errors.append(err)
            results.append(err)
            if args.fail_fast:
                raise
        finally:
            _clear_actions(arm)

    catalog = {
        "pipeline": "pipeline_ryu_batch_motlist",
        "pipeline_parity": PIPELINE_PARITY,
        "motlist": str(motlist_path),
        "motlist_name": mlist.name,
        "motlist_version": getattr(mlist, "version", None),
        "character": "esf001",
        "costume": "001",
        "natives_stm": str(natives_stm),
        "mesh_files": [str(p) for p in mesh_files],
        "mesh_only_blend": str(mesh_blend) if mesh_blend.is_file() else None,
        "material_stats": mat_stats,
        "validate_soft": soft,
        "naming": {
            "pattern": "{index:03d}_{base_name}_id{motion_id:04d}_f{frames}.glb",
            "fields": [
                "motlist clip index",
                "base_name (招式/动作名)",
                "motion_id (id)",
                "frame_count (帧数 @60fps)",
            ],
            "example": "000_esf001_BAS_STD_Loop_id0000_f396.glb",
        },
        "bind_default": BIND_MODE_DEFAULT,
        "quat_convention": QUAT_CONVENTION,
        "sample_mode": SAMPLE_MODE,
        "export_fps": export_fps_lock,
        "use_noesis_fbx": bool(args.use_noesis_fbx) and noesis_fbx is not None,
        "noesis_clip": args.noesis_clip if (args.use_noesis_fbx and noesis_fbx) else None,
        "noesis_fbx_default": str(DEFAULT_NOESIS_IDLE),
        "bind_note": (
            f"Default for ALL clips: {BIND_MODE_DEFAULT} with {QUAT_CONVENTION} "
            f"+ {SAMPLE_MODE} (same as {PIPELINE_PARITY} / PIPELINE_RYU_IDLE.md). "
            "Disconnect use_connect before drive/export (C_Hip location). "
            "Noesis FBX only if --use-noesis-fbx and clip == --noesis-clip "
            "(world-bake → 0..logical_frames @60; do not trust Noesis file fps). "
            "glTF duration_sec ≈ frames/60."
        ),
        "selected_indices": indices,
        "ok_count": sum(1 for r in results if r.get("status") == "ok"),
        "error_count": len(errors),
        "skip_count": sum(1 for r in results if r.get("status") == "skipped_existing"),
        "clips": results,
        "errors": errors,
    }
    catalog_path = out_dir / "catalog.json"
    catalog_path.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    manifest_lines = [
        "pipeline=pipeline_ryu_batch_motlist",
        f"pipeline_parity={PIPELINE_PARITY}",
        f"bind_default={BIND_MODE_DEFAULT}",
        f"quat_convention={QUAT_CONVENTION}",
        f"sample_mode={SAMPLE_MODE}",
        f"export_fps={export_fps_lock}",
        f"use_noesis_fbx={catalog['use_noesis_fbx']}",
        f"motlist={motlist_path}",
        f"out_dir={out_dir}",
        f"selected={len(indices)}",
        f"ok={catalog['ok_count']} errors={catalog['error_count']} skip={catalog['skip_count']}",
        f"catalog={catalog_path}",
        f"glb_dir={glb_dir}",
    ]
    for r in results:
        st = r.get("status")
        if st == "ok":
            sm = (r.get("anim_stats") or {}).get("sample_mode", SAMPLE_MODE)
            manifest_lines.append(
                f"OK  {r['stem']}.glb  {r.get('glb_bytes', 0)}  "
                f"bind={r.get('bind_mode')} sample={sm} fps={r.get('fps')} "
                f"frames={r.get('frame_start')}..{r.get('frame_end')}"
            )
        elif st == "skipped_existing":
            manifest_lines.append(f"SKIP {r['stem']}.glb")
        else:
            manifest_lines.append(f"ERR {r.get('stem')}  {r.get('error')}")

    (out_dir / "MANIFEST.txt").write_text(
        "\n".join(manifest_lines) + "\n", encoding="utf-8"
    )
    print("\n[batch] FULL STAGE DONE")
    print(f"[batch] catalog → {catalog_path}")
    print(
        f"[batch] ok={catalog['ok_count']} err={catalog['error_count']} "
        f"skip={catalog['skip_count']}"
    )
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)

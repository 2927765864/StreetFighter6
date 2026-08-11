"""
Headless Blender: build armature from motlist + apply clip + export glTF.

Example:
  Blender --background --python scripts/blender_apply_motlist.py -- \\
    --motlist /path/to/esf001v00_idle.motlist.653 \\
    --clip 0 \\
    --out out/idle_clip0.glb
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def _parse_args(argv):
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    ap = argparse.ArgumentParser()
    ap.add_argument("--motlist", required=True, type=Path)
    ap.add_argument("--clip", type=int, default=0)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--fps", type=float, default=60.0)
    ap.add_argument("--pos-scale", type=float, default=1.0)
    return ap.parse_args(argv)


def main():
    import bpy

    args = _parse_args(sys.argv)
    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    # Reset scene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    from re_motlist import blender_import as bi
    from re_motlist.mot import load_motlist

    path = args.motlist.expanduser().resolve()
    print(f"[re_motlist] Loading {path}")
    mlist = load_motlist(path)
    mot = mlist.mots[args.clip]
    print(f"[re_motlist] Clip[{args.clip}] {mot.base_name} frames={mot.frame_count}")

    mlist.read([mot.name])
    mlist.make_anims([mot.name])
    anim = mlist.anims[0]

    arm = bi.build_armature_from_mot(mot, f"{mot.base_name}_Armature")
    rest_locals = bi.rest_local_matrices_from_headers(mot.bone_headers)
    action, stats = bi.apply_animation_to_armature(
        arm,
        anim,
        fps=args.fps,
        pos_scale=args.pos_scale,
        rest_locals=rest_locals,
        rest_space="mot",
        action_name=mot.base_name,
    )
    print(f"[re_motlist] Action={action.name} stats={stats}")

    args.out = args.out.expanduser().resolve()
    args.out.parent.mkdir(parents=True, exist_ok=True)

    # Select armature for export
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm

    ext = args.out.suffix.lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.export_scene.gltf(
            filepath=str(args.out),
            export_format="GLB" if ext == ".glb" else "GLTF_SEPARATE",
            use_selection=True,
            export_animations=True,
            export_nla_strips=False,
            export_force_sampling=True,
            export_frame_range=True,
            export_anim_single_armature=True,
        )
    elif ext == ".fbx":
        bpy.ops.export_scene.fbx(
            filepath=str(args.out),
            use_selection=True,
            bake_anim=True,
            add_leaf_bones=False,
        )
    else:
        # default blend
        if not ext:
            args.out = args.out.with_suffix(".blend")
        bpy.ops.wm.save_as_mainfile(filepath=str(args.out))

    print(f"[re_motlist] Wrote {args.out}")
    # print bone count
    print(f"[re_motlist] Bones={len(arm.data.bones)} frame_end={bpy.context.scene.frame_end}")


if __name__ == "__main__":
    main()

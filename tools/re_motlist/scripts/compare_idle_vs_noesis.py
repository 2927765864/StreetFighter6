"""
Compare pipeline ryu_c1_idle export vs Noesis noesis_idle_out.fbx.

Samples shared bones in real time (seconds), reports world-position error
and high-frequency jerk. Run inside Blender:

  Blender --background --python compare_idle_vs_noesis.py -- \\
    --pipeline-fbx .../ryu_c1_idle.fbx \\
    --noesis-fbx .../noesis_idle_out.fbx \\
    --out-json .../compare_idle_vs_noesis.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def _parse():
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--pipeline-fbx", type=Path, required=True)
    ap.add_argument("--pipeline-glb", type=Path, default=None)
    ap.add_argument("--noesis-fbx", type=Path, required=True)
    ap.add_argument("--out-json", type=Path, required=True)
    ap.add_argument("--samples", type=int, default=80)
    ap.add_argument("--duration-sec", type=float, default=None)
    return ap.parse_args(argv)


def main():
    args = _parse()
    import bpy
    from mathutils import Vector

    BONES = [
        "C_Hip",
        "C_Spine1",
        "C_Chest",
        "C_Head",
        "L_Thigh",
        "L_Foot",
        "R_Thigh",
        "R_Foot",
        "L_UpperArm",
        "L_Hand",
        "R_UpperArm",
        "R_Hand",
    ]

    def load_arm(path: Path, *, gltf: bool = False):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if gltf:
            bpy.ops.import_scene.gltf(filepath=str(path))
        else:
            bpy.ops.import_scene.fbx(
                filepath=str(path),
                automatic_bone_orientation=False,
                use_anim=True,
            )
        arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
        if not arms:
            raise RuntimeError(f"no armature in {path}")
        return sorted(arms, key=lambda a: len(a.data.bones), reverse=True)[0]

    def _fcurves(act):
        fcs = list(act.fcurves) if hasattr(act, "fcurves") and act.fcurves else []
        if not fcs:
            for layer in getattr(act, "layers", []) or []:
                for strip in getattr(layer, "strips", []) or []:
                    for bag in getattr(strip, "channelbags", None) or []:
                        fcs.extend(list(bag.fcurves))
        return fcs

    def action_key_count(arm) -> int:
        act = arm.animation_data.action if arm.animation_data else None
        if not act:
            return 0
        best = 0
        for fc in _fcurves(act):
            best = max(best, len(fc.keyframe_points))
        return best

    def action_duration_sec(arm, *, assume_60_if_noesis_like: bool = False) -> float:
        """
        Prefer logical duration from key count @ 60fps when Noesis mislabels
        scene as 25fps (396 keys → 6.6s, not 13.2s).
        """
        act = arm.animation_data.action if arm.animation_data else None
        if not act:
            return 0.0
        nkeys = action_key_count(arm)
        fps_scene = float(bpy.context.scene.render.fps) / float(
            bpy.context.scene.render.fps_base or 1.0
        )
        f0, f1 = float(act.frame_range[0]), float(act.frame_range[1])
        scene_dur = max(0.0, (f1 - f0) / max(fps_scene, 1e-6))
        # 396-key idle @ 60fps = 6.6s; Noesis often reports ~13.2s at 25fps
        if nkeys >= 100:
            logical = (nkeys - 1) / 60.0
            if assume_60_if_noesis_like or abs(scene_dur - logical * 2) < 0.5:
                return logical
            # if scene duration already ~ logical, keep scene
            if abs(scene_dur - logical) < 0.35:
                return scene_dur
            return logical
        return scene_dur

    def sample_heads(arm, times_sec, bone_names, *, duration_sec: float):
        act = arm.animation_data.action if arm.animation_data else None
        f0 = float(act.frame_range[0]) if act else 0.0
        f1 = float(act.frame_range[1]) if act else 1.0
        nkeys = action_key_count(arm)
        out = {b: [] for b in bone_names}
        dur = max(1e-6, float(duration_sec))
        for t in times_sec:
            u = min(1.0, max(0.0, t / dur))
            # Prefer key-index mapping when dense keys exist (Noesis 396 keys)
            if nkeys >= 2:
                # Map u → key index → approximate frame on curve range
                # Evaluate at frame linearly spanning f0..f1 by key index fraction
                frame = f0 + u * (f1 - f0)
            else:
                frame = f0 + u * (f1 - f0)
            try:
                bpy.context.scene.frame_set(frame)
            except TypeError:
                bpy.context.scene.frame_set(int(round(frame)))
            bpy.context.view_layer.update()
            for bname in bone_names:
                pb = arm.pose.bones.get(bname)
                if not pb:
                    out[bname].append(None)
                    continue
                head = arm.matrix_world @ pb.head
                out[bname].append(head.copy())
        return out, dur

    def series_metrics(pts):
        valid = [p for p in pts if p is not None]
        if len(valid) < 3:
            return {}
        d1 = [(valid[i] - valid[i - 1]).length for i in range(1, len(valid))]
        d2 = [abs(d1[i] - d1[i - 1]) for i in range(1, len(d1))]
        return {
            "mean_step": sum(d1) / len(d1),
            "max_step": max(d1),
            "mean_jerk": sum(d2) / len(d2) if d2 else 0.0,
            "max_jerk": max(d2) if d2 else 0.0,
            "z_range": [min(p.z for p in valid), max(p.z for p in valid)],
        }

    # --- Noesis ---
    noe = load_arm(args.noesis_fbx)
    noe_dur = action_duration_sec(noe, assume_60_if_noesis_like=True)
    print(
        f"[compare] noesis arm={noe.name} bones={len(noe.data.bones)} "
        f"dur={noe_dur:.4f}s keys={action_key_count(noe)}"
    )

    # --- Pipeline (prefer GLB if given) ---
    if args.pipeline_glb and args.pipeline_glb.is_file():
        pipe = load_arm(args.pipeline_glb, gltf=True)
        pipe_src = str(args.pipeline_glb)
    else:
        pipe = load_arm(args.pipeline_fbx)
        pipe_src = str(args.pipeline_fbx)
    pipe_dur = action_duration_sec(pipe)
    print(
        f"[compare] pipeline arm={pipe.name} bones={len(pipe.data.bones)} "
        f"dur={pipe_dur:.4f}s keys={action_key_count(pipe)} src={pipe_src}"
    )

    dur = args.duration_sec
    if dur is None:
        # Both should be ~6.6s for idle loop
        cands = [d for d in (noe_dur, pipe_dur) if d > 0.05]
        dur = min(cands) if cands else 6.6
    n = max(8, int(args.samples))
    times = [dur * i / (n - 1) for i in range(n)]

    # reload both fresh for sampling (load_arm resets scene)
    noe = load_arm(args.noesis_fbx)
    noe_series, _ = sample_heads(noe, times, BONES, duration_sec=dur)

    if args.pipeline_glb and args.pipeline_glb.is_file():
        pipe = load_arm(args.pipeline_glb, gltf=True)
    else:
        pipe = load_arm(args.pipeline_fbx)
    pipe_series, _ = sample_heads(pipe, times, BONES, duration_sec=dur)

    # Align by subtracting hip at t0 (horizontal) so root placement differs less
    def aligned(series):
        hip0 = series.get("C_Hip", [None])[0]
        if hip0 is None:
            return series
        out = {}
        for k, pts in series.items():
            out[k] = [
                (p - Vector((hip0.x, hip0.y, 0.0))) if p is not None else None
                for p in pts
            ]
        return out

    noe_a = aligned(noe_series)
    pipe_a = aligned(pipe_series)

    per_bone = {}
    all_err = []
    for b in BONES:
        errs = []
        for a, c in zip(noe_a[b], pipe_a[b]):
            if a is None or c is None:
                continue
            errs.append((a - c).length)
        if not errs:
            continue
        per_bone[b] = {
            "mean_err": sum(errs) / len(errs),
            "max_err": max(errs),
            "noesis": series_metrics(noe_series[b]),
            "pipeline": series_metrics(pipe_series[b]),
        }
        all_err.extend(errs)

    report = {
        "noesis_fbx": str(args.noesis_fbx),
        "pipeline_src": pipe_src,
        "duration_sec_used": dur,
        "noesis_duration_sec": noe_dur,
        "pipeline_duration_sec": pipe_dur,
        "n_samples": n,
        "mean_world_err": (sum(all_err) / len(all_err)) if all_err else None,
        "max_world_err": max(all_err) if all_err else None,
        "bones": per_bone,
        "pass_thresholds": {
            "mean_world_err_lt": 0.02,
            "max_world_err_lt": 0.06,
            "jerk_ratio_lt": 2.5,
        },
    }
    # jerk ratio hip/feet
    ratios = {}
    for b in ("C_Hip", "L_Foot", "R_Foot"):
        if b not in per_bone:
            continue
        nj = per_bone[b]["noesis"].get("mean_jerk") or 1e-9
        pj = per_bone[b]["pipeline"].get("mean_jerk") or 0.0
        ratios[b] = pj / max(nj, 1e-9)
    report["jerk_ratio"] = ratios
    report["ok"] = bool(
        all_err
        and report["mean_world_err"] < 0.02
        and report["max_world_err"] < 0.06
        and all(r < 2.5 for r in ratios.values())
    )

    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        f"[compare] mean_err={report['mean_world_err']} max_err={report['max_world_err']} "
        f"jerk_ratio={ratios} ok={report['ok']}"
    )
    print(f"[compare] wrote {args.out_json}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback

        traceback.print_exc()
        sys.exit(1)

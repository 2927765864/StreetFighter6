"""Compare Noesis FBX pose basis / worlds vs Mot-derived candidates on RE Mesh."""
from __future__ import annotations
import json, os, sys, traceback
from pathlib import Path
from math import degrees

def main():
    argv = sys.argv
    argv = argv[argv.index("--")+1:] if "--" in argv else []
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--natives-stm", type=Path, required=True)
    ap.add_argument("--noesis-fbx", type=Path, required=True)
    ap.add_argument("--motlist", type=Path, default=None)
    ap.add_argument("--clip", type=int, default=0)
    ap.add_argument("--out-json", type=Path, required=True)
    ap.add_argument("--frames", default="1,30,60,120")
    args = ap.parse_args(argv)

    tools = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(tools))
    scripts = Path(__file__).resolve().parent
    # load pipeline helpers by path
    import importlib.util
    spec = importlib.util.spec_from_file_location("pipeline_ryu_idle", scripts / "pipeline_ryu_idle.py")
    pl = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pl)

    import bpy
    from mathutils import Matrix, Quaternion, Vector

    natives = Path(os.path.normpath(str(args.natives_stm)))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pl._enable_addons()
    pl._configure_sf6_chunk_path(natives)
    pl._import_mesh_parts(natives, ["00","01","02"], load_materials=False)
    arms = pl._find_armatures()
    mesh_arm = sorted(arms, key=lambda a: len(a.data.bones), reverse=True)[0]
    print("[diag] mesh arm", mesh_arm.name, "bones", len(mesh_arm.data.bones))

    from re_motlist.mot import load_motlist
    from re_motlist import blender_import as bi

    motlist = args.motlist or (natives / "product/animation/esf/esf001/v00/motionlist/basic/esf001v00_idle.motlist.653")
    mlist = load_motlist(motlist)
    mot = mlist.mots[args.clip]
    mlist.read([mot.name])
    mlist.make_anims([mot.name])
    anim = mlist.anims[-1]
    if not mot.bone_headers:
        mot.read_bone_headers()

    # --- import Noesis FBX (keep for sampling) ---
    before = set(bpy.data.objects)
    res = bpy.ops.import_scene.fbx(filepath=str(args.noesis_fbx), use_anim=True, automatic_bone_orientation=False, ignore_leaf_bones=False)
    print("[diag] fbx import", res)
    imported = [o for o in bpy.data.objects if o not in before]
    noe_arms = [o for o in imported if o.type=="ARMATURE"]
    noe_arm = sorted(noe_arms, key=lambda a: len(a.data.bones), reverse=True)[0]
    print("[diag] noe arm", noe_arm.name, "bones", len(noe_arm.data.bones), "scale", tuple(noe_arm.scale), "rot", tuple(noe_arm.rotation_euler))

    # hide noe meshes
    for o in imported:
        if o.type=="MESH":
            o.hide_viewport=True

    # frame range from noe
    noe_action = noe_arm.animation_data.action if noe_arm.animation_data else None
    f0,f1 = (int(noe_action.frame_range[0]), int(noe_action.frame_range[1])) if noe_action else (1,330)
    frames = [int(x) for x in args.frames.split(",") if x.strip()]
    frames = [f for f in frames if f0 <= f <= f1] or [f0]

    # bone pairs
    lookup = bi.bone_lookup(mesh_arm)
    pairs = []
    for pb in noe_arm.pose.bones:
        key = bi.clean_bone_name(pb.name).lower()
        dst = lookup.get(key)
        if dst:
            pairs.append((pb.name, dst))

    major = ["C_Hip","C_Spine1","C_Spine2","C_Chest","C_Neck","C_Head",
             "L_Shoulder","L_UpperArm","L_ForeArm","L_Forearm","L_Hand",
             "R_Shoulder","R_UpperArm","R_ForeArm","R_Forearm","R_Hand",
             "L_Thigh","L_Knee","L_Foot","R_Thigh","R_Knee","R_Foot"]
    major_l = {m.lower() for m in major}

    def rest_local(arm, bname):
        b = arm.data.bones[bname]
        if b.parent:
            return b.parent.matrix_local.inverted() @ b.matrix_local
        return b.matrix_local.copy()

    # Precompute mesh rest locals
    mesh_rest = {dst: rest_local(mesh_arm, dst) for _, dst in pairs}

    # Mot rest / sample helpers
    pos_scale = 0.01
    header_by = {h.name: h for h in mot.bone_headers}
    kf_by = {}
    for kf in anim.kf_bones:
        if 0 <= kf.bone_index < len(anim.bones):
            kf_by[anim.bones[kf.bone_index].name] = kf

    def sample_vec(keys, t, default):
        if not keys:
            return default.copy()
        last = Vector(keys[0].value.as_tuple())
        for kv in keys:
            if kv.time > t: break
            last = Vector(kv.value.as_tuple())
        return last

    def sample_quat(keys, t, default):
        if not keys:
            return default.copy()
        q0 = keys[0].value
        last = Quaternion((q0.w,q0.x,q0.y,q0.z))
        for kv in keys:
            if kv.time > t: break
            q = kv.value
            last = Quaternion((q.w,q.x,q.y,q.z))
        return last

    def mot_local_at(name, t):
        h = header_by.get(name)
        if not h:
            # try clean match
            for hn,hh in header_by.items():
                if bi.clean_bone_name(hn).lower()==bi.clean_bone_name(name).lower():
                    h=hh; name=hn; break
        if not h:
            return None
        pos_x100 = Vector(h.mat[3].as_tuple())
        brot = Quaternion((h.rot.w,h.rot.x,h.rot.y,h.rot.z))
        kf = kf_by.get(h.name)
        # Mot times are frame indices at 60fps typically; Noesis FBX is 25fps with 1..330
        # Map: Noesis frame f -> mot time. Idle Noesis 330 frames @25fps ≈ 13.2s; mot 396 @60 ≈ 6.6s
        # Actually re engine often: key times are in frames of the mot (0..frame_count)
        # Noesis may resample. For f0 comparison use t=0; for others map proportionally.
        if kf and kf.translations:
            pos100 = sample_vec(kf.translations, t, pos_x100)
        else:
            pos100 = pos_x100
        if kf and kf.rotations:
            rot = sample_quat(kf.rotations, t, brot)
        else:
            rot = brot
        pos = Vector((pos100.x*pos_scale, pos100.y*pos_scale, pos100.z*pos_scale))
        m = rot.to_matrix().to_4x4()
        m.translation = pos
        return m, brot, pos_x100

    def mot_rest_local(name):
        h = header_by.get(name)
        if not h:
            for hn,hh in header_by.items():
                if bi.clean_bone_name(hn).lower()==bi.clean_bone_name(name).lower():
                    h=hh; break
        if not h:
            return None
        pos = Vector(h.mat[3].as_tuple()) * pos_scale
        rot = Quaternion((h.rot.w,h.rot.x,h.rot.y,h.rot.z))
        m = rot.to_matrix().to_4x4()
        m.translation = pos
        return m

    # Compare rest: mesh vs noe vs mot for major bones
    rest_cmp = []
    for src, dst in pairs:
        cn = bi.clean_bone_name(dst)
        if cn.lower() not in major_l:
            continue
        mr = mesh_rest[dst]
        nr = rest_local(noe_arm, src)
        # noe rest is in ×100 bone data; local translation is large
        nr_s = nr.copy()
        nr_s.translation = nr.translation * 0.01
        mot_r = mot_rest_local(cn)
        def ang(a,b):
            qa, qb = a.to_quaternion(), b.to_quaternion()
            return degrees(qa.rotation_difference(qb).angle)
        row = {
            "bone": cn,
            "mesh_pos": list(mr.translation),
            "noe_pos_scaled": list(nr_s.translation),
            "mot_pos": list(mot_r.translation) if mot_r else None,
            "ang_mesh_vs_noe": ang(mr, nr),  # raw
            "ang_mesh_vs_noe_scaled_pos_only": ang(mr, nr_s),
            "ang_mesh_vs_mot": ang(mr, mot_r) if mot_r else None,
            "ang_noe_vs_mot": ang(nr_s, mot_r) if mot_r else None,
            "dpos_mesh_noe": (mr.translation - nr_s.translation).length,
            "dpos_mesh_mot": (mr.translation - mot_r.translation).length if mot_r else None,
        }
        rest_cmp.append(row)

    # At selected frames: Noesis basis vs candidates
    # Mot time mapping: use linear map frame_count
    mot_fc = float(mot.frame_count or 396)
    noe_span = max(1, f1-f0)

    frame_rows = []
    for f in frames:
        bpy.context.scene.frame_set(f)
        bpy.context.view_layer.update()
        # mot time: proportional
        t_mot = (f - f0) / noe_span * mot_fc
        # also try t = f-1 (if same frame base) and t = f * 396/330
        for t_mode, t in [("prop", t_mot), ("f0", 0.0 if f==f0 else t_mot)]:
            if t_mode=="f0" and f!=f0:
                continue
            bones_out = []
            for src, dst in pairs:
                cn = bi.clean_bone_name(dst)
                if cn.lower() not in major_l:
                    continue
                spb = noe_arm.pose.bones[src]
                # Noesis GT basis (as baked to mesh would be loc*0.01)
                gt_loc = spb.location * 0.01
                gt_quat = spb.rotation_quaternion.copy()

                ml = mot_local_at(cn, t)
                if not ml:
                    continue
                anim_local, _, _ = ml
                mesh_rl = mesh_rest[dst]
                mot_rl = mot_rest_local(cn)

                # candidates
                # A: MeshRest^{-1} @ MotLocal  (current full_chain)
                basis_A = mesh_rl.inverted() @ anim_local
                # B: MotRest^{-1} @ MotLocal (relative mot) — then need apply as mesh-relative?
                basis_B = mot_rl.inverted() @ anim_local if mot_rl else None
                # C: Noesis style if Mot rest used incorrectly: just decompose MotLocal as if it were basis (wrong units)
                # D: basis_B applied as rotation only on mesh (mot relative)

                locA, quatA, _ = basis_A.decompose()
                # compare to GT
                def qang(q1,q2):
                    return degrees(q1.rotation_difference(q2).angle)
                rowb = {
                    "bone": cn,
                    "gt_loc": list(gt_loc),
                    "gt_quat": list(gt_quat),
                    "A_loc": list(locA),
                    "A_quat": list(quatA),
                    "dloc_A": (locA - gt_loc).length,
                    "dang_A": qang(quatA, gt_quat),
                }
                if basis_B is not None:
                    locB, quatB, _ = basis_B.decompose()
                    rowb["B_loc"] = list(locB)
                    rowb["B_quat"] = list(quatB)
                    rowb["dloc_B"] = (locB - gt_loc).length
                    rowb["dang_B"] = qang(quatB, gt_quat)
                    # Also: location from A or scaled Mot delta, rot from B
                    # Mot delta loc in engine units:
                    if mot_rl is not None:
                        dloc = anim_local.translation - mot_rl.translation
                        rowb["dloc_B_as_delta_vs_gt"] = (dloc - gt_loc).length
                bones_out.append(rowb)
            # summary
            def avg(key, rows):
                vals = [r[key] for r in rows if key in r and r[key] is not None]
                return sum(vals)/len(vals) if vals else None
            frame_rows.append({
                "frame": f,
                "t_mot": t,
                "t_mode": t_mode,
                "mean_dloc_A": avg("dloc_A", bones_out),
                "mean_dang_A": avg("dang_A", bones_out),
                "mean_dloc_B": avg("dloc_B", bones_out),
                "mean_dang_B": avg("dang_B", bones_out),
                "worst_A": max(bones_out, key=lambda r: r["dang_A"])["bone"] if bones_out else None,
                "worst_A_ang": max((r["dang_A"] for r in bones_out), default=None),
                "worst_B_ang": max((r.get("dang_B") or 0 for r in bones_out), default=None),
                "bones": bones_out,
            })

    # Also compare world positions: apply both methods briefly on mesh arm at f0
    # Clear mesh action; apply A then sample; apply noesis bake sample
    results = {
        "clip": args.clip,
        "mot_name": mot.base_name,
        "noe_frames": [f0,f1],
        "mot_frame_count": mot_fc,
        "n_pairs": len(pairs),
        "rest_cmp": rest_cmp,
        "frames": frame_rows,
    }
    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("[diag] wrote", args.out_json)
    # print summary
    print("\n=== REST mesh vs mot (angle deg) ===")
    for r in rest_cmp:
        print(f"  {r['bone']:12} mesh-mot={r['ang_mesh_vs_mot']:.2f} mesh-noe={r['ang_mesh_vs_noe_scaled_pos_only']:.2f} noe-mot={r['ang_noe_vs_mot']:.2f} dpos_mm={r['dpos_mesh_mot']:.4f}")
    print("\n=== FRAME summary ===")
    for fr in frame_rows:
        print(f"  f={fr['frame']} t={fr['t_mot']:.2f} mean_dang_A={fr['mean_dang_A']:.2f} mean_dang_B={fr['mean_dang_B']:.2f} worstA={fr['worst_A']}@{fr['worst_A_ang']:.1f}")

if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)

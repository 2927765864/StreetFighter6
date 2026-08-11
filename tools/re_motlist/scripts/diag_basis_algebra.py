"""Find which matrix formula maps Mot -> Noesis pose basis on RE Mesh rest."""
from __future__ import annotations
import json, os, sys, traceback
from pathlib import Path
from math import degrees

def main():
    argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--natives-stm", type=Path, required=True)
    ap.add_argument("--noesis-fbx", type=Path, required=True)
    ap.add_argument("--out-json", type=Path, required=True)
    args = ap.parse_args(argv)

    tools = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(tools))
    import importlib.util
    spec = importlib.util.spec_from_file_location("pl", Path(__file__).parent/"pipeline_ryu_idle.py")
    pl = importlib.util.module_from_spec(spec); spec.loader.exec_module(pl)

    import bpy
    from mathutils import Matrix, Quaternion, Vector
    from re_motlist.mot import load_motlist
    from re_motlist import blender_import as bi

    natives = Path(os.path.normpath(str(args.natives_stm)))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pl._enable_addons(); pl._configure_sf6_chunk_path(natives)
    pl._import_mesh_parts(natives, ["00","01","02"], False)
    mesh_arm = sorted(pl._find_armatures(), key=lambda a: len(a.data.bones), reverse=True)[0]

    motlist = natives/"product/animation/esf/esf001/v00/motionlist/basic/esf001v00_idle.motlist.653"
    mlist = load_motlist(motlist)
    mot = mlist.mots[0]
    mlist.read([mot.name]); mlist.make_anims([mot.name])
    anim = mlist.anims[-1]
    if not mot.bone_headers: mot.read_bone_headers()

    before=set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(args.noesis_fbx), use_anim=True, automatic_bone_orientation=False)
    imported=[o for o in bpy.data.objects if o not in before]
    noe_arm=sorted([o for o in imported if o.type=="ARMATURE"], key=lambda a: len(a.data.bones), reverse=True)[0]
    for o in imported:
        if o.type=="MESH": o.hide_viewport=True

    lookup=bi.bone_lookup(mesh_arm)
    pairs=[]
    for pb in noe_arm.pose.bones:
        dst=lookup.get(bi.clean_bone_name(pb.name).lower())
        if dst: pairs.append((pb.name,dst))

    def rest_local(arm, name):
        b=arm.data.bones[name]
        return (b.parent.matrix_local.inverted()@b.matrix_local) if b.parent else b.matrix_local.copy()

    pos_scale=0.01
    header_by={h.name:h for h in mot.bone_headers}
    kf_by={}
    for kf in anim.kf_bones:
        if 0<=kf.bone_index<len(anim.bones):
            kf_by[anim.bones[kf.bone_index].name]=kf

    def sample_quat(keys,t,default):
        if not keys: return default.copy()
        q0=keys[0].value; last=Quaternion((q0.w,q0.x,q0.y,q0.z))
        for kv in keys:
            if kv.time>t: break
            q=kv.value; last=Quaternion((q.w,q.x,q.y,q.z))
        return last
    def sample_vec(keys,t,default):
        if not keys: return default.copy()
        last=Vector(keys[0].value.as_tuple())
        for kv in keys:
            if kv.time>t: break
            last=Vector(kv.value.as_tuple())
        return last

    def qang(a,b):
        return degrees(a.rotation_difference(b).angle)

    def decomp(M):
        l,q,s=M.decompose(); return l,q

    # formulas at t=0 (mot f0) vs noesis frame 1
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()

    bones_major=["C_Hip","L_UpperArm","L_ForeArm","L_Hand","R_UpperArm","R_ForeArm","C_Chest","L_Thigh"]
    results=[]
    formulas_names=[]

    for src,dst in pairs:
        cn=bi.clean_bone_name(dst)
        if cn not in bones_major: continue
        h=header_by.get(cn)
        if not h: continue
        Mr = rest_local(mesh_arm, dst)  # mesh rest local
        Nr = rest_local(noe_arm, src)
        Nr.translation = Nr.translation * pos_scale  # shouldn't change rot

        pos0 = Vector(h.mat[3].as_tuple())*pos_scale
        rot0 = Quaternion((h.rot.w,h.rot.x,h.rot.y,h.rot.z))
        MotR = rot0.to_matrix().to_4x4(); MotR.translation=pos0

        kf=kf_by.get(h.name)
        # t=0 keys
        if kf and kf.translations:
            posA=sample_vec(kf.translations,0.0,Vector(h.mat[3].as_tuple()))*pos_scale
        else:
            posA=pos0
        if kf and kf.rotations:
            rotA=sample_quat(kf.rotations,0.0,rot0)
        else:
            rotA=rot0
        MotA = rotA.to_matrix().to_4x4(); MotA.translation=posA

        spb=noe_arm.pose.bones[src]
        gt_loc = spb.location * pos_scale
        gt_quat = spb.rotation_quaternion.copy()
        # also build GT matrix
        Gt = gt_quat.to_matrix().to_4x4(); Gt.translation=gt_loc

        # candidates for basis matrix
        cands = {
            "A_MeshInv_MotA": Mr.inverted() @ MotA,
            "B_MotRInv_MotA": MotR.inverted() @ MotA,
            "C_MotA_MeshInv": MotA @ Mr.inverted(),
            "D_sim_MeshInv_MotA_MotR_Mesh": Mr.inverted() @ MotA @ MotR.inverted() @ Mr, # nonsense?
            "E_delta_on_mesh": Mr.inverted() @ (MotR.inverted() @ MotA) @ Mr,  # wrong
            "F_MeshInv_delta_MotR": Mr.inverted() @ (MotA @ MotR.inverted() @ MotR), # =A
            "G_delta_L": MotR.inverted() @ MotA,  # same B
            "H_MeshInv_MotR_delta": Mr.inverted() @ MotR @ (MotR.inverted() @ MotA), # = MeshInv@MotA = A
            "I_deltaR_only_loc0": None,
            "J_NoeRestInv_MotA": Nr.inverted() @ MotA,
            "K_copy_MotA_as_basis_locscaled": MotA,  # treat anim local as basis (rot full)
            "L_MeshInv_NoeRest_delta": Mr.inverted() @ Nr @ (MotR.inverted() @ MotA),
            # transfer: newLocal = MeshRest * MotRest^{-1} * MotAnim  (pre-multiply delta)
            "M_pre_delta": Mr.inverted() @ ( (MotR.inverted() @ MotA) @ Mr ),
            # newLocal = MotAnim * MotRest^{-1} * MeshRest
            "N_post_delta": Mr.inverted() @ ( MotA @ MotR.inverted() @ Mr ),
            # newLocal = MeshRest * MotAnim * MotRest^{-1}  
            "O_mid": Mr.inverted() @ ( Mr @ MotA @ MotR.inverted() ),
            # rotation-only absolute with loc from delta
            "P_rotA_loc_delta": None,
        }
        # I: rotation from B, location from GT-like (MotA.pos - Mr.pos) or (MotA.pos - MotR.pos)
        delta = MotR.inverted() @ MotA
        dloc, dquat, _ = delta.decompose()
        # P
        basisP = dquat.to_matrix().to_4x4()
        basisP.translation = MotA.translation - Mr.translation
        cands["P_rotDelta_locMotMinusMesh"] = basisP
        basisP2 = dquat.to_matrix().to_4x4()
        basisP2.translation = MotA.translation - MotR.translation
        cands["P2_rotDelta_locMotMinusMotR"] = basisP2

        # Q: absolute rot MeshInv@MotA but only rot, loc = MotA-MotR scaled
        locQ, quatQ, _ = (Mr.inverted()@MotA).decompose()
        basisQ = quatQ.to_matrix().to_4x4()
        basisQ.translation = MotA.translation - MotR.translation
        cands["Q_rotA_locDelta"] = basisQ

        # R: Noesis might store pose relative to mesh rest where animated local = MotA but
        # expressed in mesh parent space via parent FK... skip for now

        # S: basis = MotA_rot * Mr_rot^{-1} for rotation (change of rest)
        quatS = rotA @ Mr.to_quaternion().inverted()
        basisS = quatS.to_matrix().to_4x4()
        basisS.translation = MotA.translation - Mr.translation
        cands["S_MotA_x_MeshRinv_loc"] = basisS

        # T: basis_rot = Mr_rot^{-1} * MotA_rot
        quatT = Mr.to_quaternion().inverted() @ rotA
        basisT = quatT.to_matrix().to_4x4()
        basisT.translation = MotA.translation - Mr.translation
        cands["T_MeshRinv_x_MotA_loc"] = basisT

        # U: basis_rot = MotR_rot^{-1} * MotA_rot (delta) — same as B rot
        # V: world match - compute later

        scores={}
        for name,M in cands.items():
            if M is None: continue
            loc,quat=decomp(M)
            scores[name]={
                "dang": qang(quat, gt_quat),
                "dloc": (loc-gt_loc).length,
            }

        # best
        best=min(scores.items(), key=lambda kv: kv[1]["dang"]+kv[1]["dloc"]*10)
        results.append({
            "bone": cn,
            "gt_loc": list(gt_loc),
            "gt_quat": list(gt_quat),
            "best": best[0],
            "best_dang": best[1]["dang"],
            "best_dloc": best[1]["dloc"],
            "scores": scores,
            "Mr_pos": list(Mr.translation),
            "MotR_pos": list(MotR.translation),
            "MotA_pos": list(MotA.translation),
            "ang_Mr_MotR": qang(Mr.to_quaternion(), MotR.to_quaternion()),
            "ang_gt_from_I": qang(Quaternion((1,0,0,0)), gt_quat),
        })

    # summary: which formula wins most
    from collections import Counter
    winners=Counter(r["best"] for r in results)
    print("WINNERS", winners)
    for r in results:
        print(f"\n{r['bone']} best={r['best']} dang={r['best_dang']:.3f} dloc={r['best_dloc']:.5f} ang_Mr_MotR={r['ang_Mr_MotR']:.2f} ang_gt={r['ang_gt_from_I']:.2f}")
        # top 5 scores by dang
        top=sorted(r["scores"].items(), key=lambda kv: kv[1]["dang"])[:6]
        for n,s in top:
            print(f"  {n:40} dang={s['dang']:8.3f} dloc={s['dloc']:.5f}")

    args.out_json.write_text(json.dumps({"winners":dict(winners),"bones":results}, indent=2), encoding="utf-8")
    print("wrote", args.out_json)

if __name__=="__main__":
    try: main()
    except Exception:
        traceback.print_exc(); sys.exit(1)

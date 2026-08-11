from __future__ import annotations
import json, os, sys, traceback
from pathlib import Path
from math import degrees

def main():
    argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    import argparse
    ap=argparse.ArgumentParser()
    ap.add_argument("--natives-stm", type=Path, required=True)
    ap.add_argument("--noesis-fbx", type=Path, required=True)
    ap.add_argument("--out-json", type=Path, required=True)
    args=ap.parse_args(argv)

    tools=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(tools))
    import importlib.util
    spec=importlib.util.spec_from_file_location("pl", Path(__file__).parent/"pipeline_ryu_idle.py")
    pl=importlib.util.module_from_spec(spec); spec.loader.exec_module(pl)
    import bpy, math
    from mathutils import Matrix, Quaternion, Vector
    from re_motlist.mot import load_motlist
    from re_motlist import blender_import as bi

    natives=Path(os.path.normpath(str(args.natives_stm)))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pl._enable_addons(); pl._configure_sf6_chunk_path(natives)
    pl._import_mesh_parts(natives,["00","01","02"],False)
    mesh_arm=sorted(pl._find_armatures(), key=lambda a:len(a.data.bones), reverse=True)[0]

    mlist=load_motlist(natives/"product/animation/esf/esf001/v00/motionlist/basic/esf001v00_idle.motlist.653")
    mot=mlist.mots[0]; mlist.read([mot.name]); mlist.make_anims([mot.name]); anim=mlist.anims[-1]
    if not mot.bone_headers: mot.read_bone_headers()

    before=set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(args.noesis_fbx), use_anim=True, automatic_bone_orientation=False)
    imported=[o for o in bpy.data.objects if o not in before]
    noe_arm=sorted([o for o in imported if o.type=="ARMATURE"], key=lambda a:len(a.data.bones), reverse=True)[0]
    for o in imported:
        if o.type=="MESH": o.hide_viewport=True

    lookup=bi.bone_lookup(mesh_arm)
    pairs=[]
    for pb in noe_arm.pose.bones:
        dst=lookup.get(bi.clean_bone_name(pb.name).lower())
        if dst: pairs.append((pb.name,dst))

    def rest_local(arm,name):
        b=arm.data.bones[name]
        return (b.parent.matrix_local.inverted()@b.matrix_local) if b.parent else b.matrix_local.copy()

    pos_scale=0.01
    headers=list(mot.bone_headers)
    parent={h.name: (headers[h.parent_index].name if h.parent_index is not None and h.parent_index>=0 else None) for h in headers}
    header_by={h.name:h for h in headers}
    kf_by={}
    for kf in anim.kf_bones:
        if 0<=kf.bone_index<len(anim.bones): kf_by[anim.bones[kf.bone_index].name]=kf

    def sample_quat_variants(keys,t,hrot):
        # return dict of candidate quats from key/header
        qh = Quaternion((hrot.w,hrot.x,hrot.y,hrot.z))
        variants={"header_wxyz": qh, "header_conj": qh.conjugated()}
        if keys:
            q0=keys[0].value
            # stored as xyzw in file?
            variants["key_wxyz"]=Quaternion((q0.w,q0.x,q0.y,q0.z))
            variants["key_xyzw_as_wxyz"]=Quaternion((q0.x,q0.y,q0.z,q0.w))  # mis-interpret
            variants["key_conj"]=variants["key_wxyz"].conjugated()
            variants["key_neg"]=Quaternion((-q0.w,-q0.x,-q0.y,-q0.z))
        return variants

    def sample_vec(keys,t,default):
        if not keys: return default.copy()
        last=Vector(keys[0].value.as_tuple())
        for kv in keys:
            if kv.time>t: break
            last=Vector(kv.value.as_tuple())
        return last

    def qang(a,b): return degrees(a.rotation_difference(b).angle)

    # Build Mot worlds with default quat at t=0
    def mot_worlds(quat_mode="key_wxyz"):
        locals={}
        for h in headers:
            kf=kf_by.get(h.name)
            pos=Vector(h.mat[3].as_tuple())*pos_scale
            if kf and kf.translations:
                pos=sample_vec(kf.translations,0.0,Vector(h.mat[3].as_tuple()))*pos_scale
            rots=sample_quat_variants(kf.rotations if kf else None,0.0,h.rot)
            # pick
            if quat_mode in rots:
                rot=rots[quat_mode]
            elif quat_mode=="header_wxyz":
                rot=rots["header_wxyz"]
            else:
                rot=rots.get("key_wxyz", rots["header_wxyz"])
            M=rot.to_matrix().to_4x4(); M.translation=pos
            locals[h.name]=M
        yup={}; R90=Matrix.Rotation(math.radians(90),4,'X')
        worlds={}
        for h in headers:
            p=parent[h.name]
            yup[h.name]=locals[h.name] if p is None else yup[p]@locals[h.name]
            worlds[h.name]=R90@yup[h.name]
        worlds_norot={n:yup[n] for n in yup}
        return worlds, worlds_norot, locals

    bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
    # Noesis world (armature space): pose bone matrix
    # account for object transform
    noe_mw = noe_arm.matrix_world

    bones=["C_Hip","C_Chest","L_UpperArm","L_ForeArm","L_Hand","R_UpperArm","R_Hand","L_Thigh","L_Foot"]
    modes=["key_wxyz","key_conj","header_wxyz","header_conj","key_xyzw_as_wxyz"]

    report={}
    for mode in modes:
        worlds, worlds_y, locals = mot_worlds(mode)
        rows=[]
        for src,dst in pairs:
            cn=bi.clean_bone_name(dst)
            if cn not in bones: continue
            if cn not in worlds: continue
            # Noesis bone world in scene
            spb=noe_arm.pose.bones[src]
            noe_world = noe_mw @ spb.matrix
            # Mot world with R90 and without, also scale compare positions only
            mw = worlds[cn]
            my = worlds_y[cn]
            # Mesh rest world
            mesh_rest_world = mesh_arm.matrix_world @ mesh_arm.data.bones[dst].matrix_local
            dpos_r90=(mw.translation - noe_world.translation).length
            dpos_y=(my.translation - noe_world.translation).length
            # also noe local matrix basis vs MeshInv@MotLocal
            Mr=rest_local(mesh_arm,dst)
            basisA=Mr.inverted()@locals[cn]
            gt_loc=spb.location*pos_scale; gt_q=spb.rotation_quaternion.copy()
            locA,qA,_=basisA.decompose()
            rows.append({
                "bone":cn,
                "dpos_motR90_vs_noe": dpos_r90,
                "dpos_motY_vs_noe": dpos_y,
                "noe_pos": list(noe_world.translation),
                "motR90_pos": list(mw.translation),
                "motY_pos": list(my.translation),
                "mesh_rest_pos": list(mesh_rest_world.translation),
                "dang_A": qang(qA, gt_q),
                "dloc_A": (locA-gt_loc).length,
            })
        mean_r90=sum(r["dpos_motR90_vs_noe"] for r in rows)/len(rows)
        mean_y=sum(r["dpos_motY_vs_noe"] for r in rows)/len(rows)
        mean_dang=sum(r["dang_A"] for r in rows)/len(rows)
        report[mode]={"mean_dpos_R90":mean_r90,"mean_dpos_Y":mean_y,"mean_dang_A":mean_dang,"bones":rows}
        print(f"mode={mode:20} mean_dpos_R90={mean_r90:.4f} mean_dpos_Y={mean_y:.4f} mean_dang_A={mean_dang:.2f}")
        for r in rows:
            print(f"  {r['bone']:12} dR90={r['dpos_motR90_vs_noe']:.4f} dY={r['dpos_motY_vs_noe']:.4f} noe={tuple(round(x,3) for x in r['noe_pos'])} motR90={tuple(round(x,3) for x in r['motR90_pos'])}")

    # Also: apply noesis bake style and full_chain on mesh, compare worlds
    # Compare noe bone head positions in object space (matrix.translation)
    print("\nNoesis object scale/rot", tuple(noe_arm.scale), tuple(noe_arm.rotation_euler))
    print("Mesh object scale/rot", tuple(mesh_arm.scale), tuple(mesh_arm.rotation_euler))

    # Check: Noesis pose.matrix_basis vs raw
    print("\nSample Noesis C_Hip matrix_basis loc/rot at f1:")
    for src,dst in pairs:
        if bi.clean_bone_name(dst)=="C_Hip":
            pb=noe_arm.pose.bones[src]
            print(" location", pb.location, "quat", pb.rotation_quaternion)
            print(" matrix_basis.translation", pb.matrix_basis.translation)
            print(" matrix.translation (arm space)", pb.matrix.translation)
            print(" bone.matrix_local.translation", noe_arm.data.bones[src].matrix_local.translation)
            break

    args.out_json.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("wrote", args.out_json)

if __name__=="__main__":
    try: main()
    except Exception:
        traceback.print_exc(); sys.exit(1)

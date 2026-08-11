"""
Blender-side application of decoded RE motlist animations.

Designed to work with armatures from RE Mesh Editor (same bone names:
Root, C_Hip, L_Shoulder, ...). Also can build a rest skeleton from the
motlist bone headers when no mesh armature is present.

CRITICAL — SF6 Ryu (esf001), acceptance **A** (no twist, mesh bind OK):
  • Mot keys = absolute parent-local in Noesis ×100 units.
  • Mot f0 ≈ Mot bone-header rest (combat bind). Relative motion is small.
  • Mesh bind (RE Mesh rest) ≠ Mot bind (rotations differ a lot).
  • Absolute MeshRest^{-1}@MotAnim snaps locals to Mot rest → **twisted skin**.
  • Correct for acceptance A (preserve mesh_only look + playable idle):
        basis = MotRest^{-1} @ MotAnim          # same ×100 space
        basis.translation *= 0.01              # → RE Mesh / engine units
    i.e. rest_space=\"mot\", pos_scale=1.0, basis_pos_scale=0.01,
    rest_locals from headers (unscaled / ×100 as stored).
  • f0 ≈ identity on mesh → same as mesh_only; later frames = idle micro-motion.

  Use one quaternion→matrix path for rest/anim sampling (Blender Quaternion).
"""

from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from .math3d import Quat, Vec3
from .mot import Animation, BoneHeader, KeyFramedBone, MotFile, MotlistFile, load_motlist

# Bone name cleaners for RE Mesh / Noesis style names
_BONE_NUM_PREFIX = re.compile(r"^b\d+:", re.IGNORECASE)


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


def clean_bone_name(name: str) -> str:
    name = name.strip()
    name = _BONE_NUM_PREFIX.sub("", name)
    if ":" in name:
        name = name.split(":")[-1]
    return name


def bone_lookup(armature_obj) -> Dict[str, str]:
    """Map lowercased cleaned name -> actual pose bone name on armature."""
    out: Dict[str, str] = {}
    for pb in armature_obj.pose.bones:
        key = clean_bone_name(pb.name).lower()
        out[key] = pb.name
        out[pb.name.lower()] = pb.name
    return out


def mot_quat_to_blender(q) -> "object":
    """
    Convert a Mot/RE-Engine quaternion to a Blender mathutils.Quaternion.

    SF6 Mot quats (headers + keyframes) match Noesis after **conjugate**
    (same as NoeQuat.transpose): Blender/wxyz with negated xyz.

    Measured (esf001 idle clip0 vs noesis_out FBX): Mot FK with conjugated
    locals + Root rotate90 → joint world delta = 0; MeshRest^{-1}@MotLocal
    pose basis matches Noesis bake (dang=0). Without conjugate, arms diverge
    ~80–120° and full-chain looks twisted.
    """
    from mathutils import Quaternion

    # Accept re_motlist.math3d.Quat or any .w/.x/.y/.z
    return Quaternion((float(q.w), -float(q.x), -float(q.y), -float(q.z)))


def _quat_to_blender_matrix(q: Quat, t: Vec3, s: Optional[Vec3] = None):
    """
    Build a Blender Matrix from Mot local pos/rot/(scl).

    Rest and anim MUST share this path. Mot quats are conjugated for Blender
    (see mot_quat_to_blender).
    """
    from mathutils import Matrix, Vector

    quat = mot_quat_to_blender(q)
    mat = quat.to_matrix().to_4x4()
    mat.translation = Vector((t.x, t.y, t.z))
    if s is not None:
        sm = Matrix.Diagonal((s.x, s.y, s.z, 1.0))
        mat = mat @ sm
    return mat


def _mat43_to_blender(mat43):
    """Noe-style Mat43 rows -> Blender column-vector Matrix (transpose 3x3)."""
    from mathutils import Matrix, Vector

    m = Matrix.Identity(4)
    for r in range(3):
        for c in range(3):
            m[c][r] = mat43.rows[r][c]
    m.translation = Vector(mat43.rows[3].as_tuple())
    return m


def rest_local_matrices_from_headers(
    headers: Sequence[BoneHeader],
    pos_scale: float = 1.0,
) -> Dict[str, object]:
    """Name -> Blender Matrix of parent-relative rest from mot headers."""
    out = {}
    for h in headers:
        t = Vec3(h.mat[3].as_tuple())
        if pos_scale != 1.0:
            t = Vec3((t.x * pos_scale, t.y * pos_scale, t.z * pos_scale))
        out[h.name] = _quat_to_blender_matrix(h.rot, t)
        out[clean_bone_name(h.name).lower()] = out[h.name]
    return out


def build_armature_from_mot(
    mot: MotFile,
    armature_name: str = "RE_Mot_Armature",
    collection=None,
    pos_scale: float = 1.0,
):
    """Create a new armature using bone headers from a decoded MotFile."""
    import bpy
    from mathutils import Vector

    if not mot.bone_headers:
        mot.read_bone_headers()
    headers = mot.bone_headers
    if not headers:
        raise RuntimeError("No bone headers in mot clip")

    arm_data = bpy.data.armatures.new(armature_name)
    arm_obj = bpy.data.objects.new(armature_name, arm_data)
    if collection is None:
        collection = bpy.context.scene.collection
    collection.objects.link(arm_obj)

    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    edit = arm_data.edit_bones

    from mathutils import Matrix

    local_mats = []
    for h in headers:
        t = Vec3(h.mat[3].as_tuple())
        if pos_scale != 1.0:
            t = Vec3((t.x * pos_scale, t.y * pos_scale, t.z * pos_scale))
        local_mats.append(_quat_to_blender_matrix(h.rot, t))
    world_mats = [Matrix.Identity(4) for _ in headers]
    for i, h in enumerate(headers):
        local = local_mats[i]
        pi = h.parent_index
        if pi is None or pi < 0:
            world_mats[i] = local.copy()
        else:
            world_mats[i] = world_mats[pi] @ local

    created = {}
    bone_len = 0.05 if pos_scale >= 1.0 else 0.05 * max(pos_scale * 100, 0.5)
    for i, h in enumerate(headers):
        eb = edit.new(h.name)
        eb.head = Vector((0, 0, 0))
        eb.tail = Vector((0, bone_len, 0))
        eb.matrix = world_mats[i]
        if eb.length < 0.001:
            eb.length = 0.01
        created[i] = eb

    for i, h in enumerate(headers):
        if h.parent_index is not None and h.parent_index >= 0:
            created[i].parent = created[h.parent_index]

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def _swing_align_world(mesh_rest_world, mot_world):
    """
    Skin-safe target world matrix for one bone.

    - Translation: Mot (combat / animated joint placement)
    - Rotation: swing mesh rest +Y onto Mot +Y, preserve mesh rest twist/roll

    Full Mot world rotation is *not* copied — that was the twist root cause
    (mesh bind roll ≠ mot bind roll even when joint positions match).
    """
    from mathutils import Vector

    mesh_q = mesh_rest_world.to_quaternion()
    mesh_y = mesh_rest_world.to_3x3() @ Vector((0.0, 1.0, 0.0))
    mot_y = mot_world.to_3x3() @ Vector((0.0, 1.0, 0.0))
    if mesh_y.length_squared > 1e-12 and mot_y.length_squared > 1e-12:
        mesh_y = mesh_y.normalized()
        mot_y = mot_y.normalized()
        # Avoid 180° flip ambiguity when nearly opposite
        if mesh_y.dot(mot_y) < -0.999:
            q = mesh_q
        else:
            q = mesh_y.rotation_difference(mot_y) @ mesh_q
    else:
        q = mesh_q
    mat = q.to_matrix().to_4x4()
    mat.translation = mot_world.to_translation()
    return mat


def apply_animation_swing_retarget(
    armature_obj,
    mot: MotFile,
    anim: Animation,
    *,
    fps: float = 60.0,
    action_name: Optional[str] = None,
    pos_scale: float = 0.01,
    apply_rotate90: bool = True,
    clear_existing: bool = True,
) -> Tuple[object, Dict[str, int]]:
    """
    Retarget Mot absolute animation onto RE Mesh armature without roll twist.

    Mot rest/frame0 = combat stance; Mesh rest = T/A-pose. Translations match
    after ×0.01; rotations/rolls do not. Swing-align keeps mesh skin rolls and
    aims each bone's +Y at the Mot bone direction, using Mot world positions.
    """
    import math
    import bpy
    from mathutils import Matrix, Quaternion, Vector

    if not mot.bone_headers:
        raise RuntimeError("mot.bone_headers required for swing retarget")

    name = (action_name or anim.name.split("(")[0].strip() or "RE_Mot")[:63]
    if armature_obj.animation_data is None:
        armature_obj.animation_data_create()
    if clear_existing:
        armature_obj.animation_data.action = None
    action = bpy.data.actions.new(name)
    armature_obj.animation_data.action = action

    lookup = bone_lookup(armature_obj)
    headers = list(mot.bone_headers)
    parent_name = {
        h.name: (
            headers[h.parent_index].name
            if h.parent_index is not None and h.parent_index >= 0
            else None
        )
        for h in headers
    }
    kf_by_name: Dict[str, KeyFramedBone] = {}
    for kf in anim.kf_bones:
        if 0 <= kf.bone_index < len(anim.bones):
            kf_by_name[anim.bones[kf.bone_index].name] = kf

    def sample_vec(keys, t, default: Vector) -> Vector:
        if not keys:
            return default.copy()
        last = Vector(keys[0].value.as_tuple())
        for kv in keys:
            if kv.time > t:
                break
            last = Vector(kv.value.as_tuple())
        return last

    def sample_quat(keys, t, default: Quaternion) -> Quaternion:
        if not keys:
            return default.copy()
        last = mot_quat_to_blender(keys[0].value)
        for kv in keys:
            if kv.time > t:
                break
            last = mot_quat_to_blender(kv.value)
        return last

    bind_local: Dict[str, Matrix] = {}
    for h in headers:
        t = Vector(h.mat[3].as_tuple()) * pos_scale
        bind_local[h.name] = _quat_to_blender_matrix(h.rot, Vec3(t))

    # Mesh rest worlds (armature space) for matched bones
    mesh_rest_world: Dict[str, Matrix] = {}
    mesh_dst: Dict[str, str] = {}
    for h in headers:
        key = clean_bone_name(h.name).lower()
        dst = lookup.get(key) or lookup.get(h.name.lower())
        if not dst:
            continue
        mesh_dst[h.name] = dst
        mesh_rest_world[h.name] = armature_obj.data.bones[dst].matrix_local.copy()

    times: Set[float] = set()
    for kf in anim.kf_bones:
        for ch in (kf.translations, kf.rotations, kf.scales):
            for kv in ch:
                times.add(kv.time)
    if not times:
        times = {0.0}
    sorted_times = sorted(times)

    R90 = (
        Matrix.Rotation(math.radians(90.0), 4, "X")
        if apply_rotate90
        else Matrix.Identity(4)
    )

    def fk_worlds(locals_map: Dict[str, Matrix]) -> Dict[str, Matrix]:
        """Parent-local FK in Mot Y-up, then apply rotate90 once (not per hop)."""
        yup: Dict[str, Matrix] = {}
        out: Dict[str, Matrix] = {}
        for h in headers:
            n = h.name
            L = locals_map[n]
            p = parent_name[n]
            yup[n] = L.copy() if p is None else yup[p] @ L
            out[n] = R90 @ yup[n]
        return out

    # Mot rest worlds + skin-safe combat bases (swing mesh rest → mot rest)
    mot_rest_world = fk_worlds(bind_local)
    combat_safe: Dict[str, Matrix] = {}
    for n, mrest in mesh_rest_world.items():
        combat_safe[n] = _swing_align_world(mrest, mot_rest_world[n])

    for pb in armature_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"

    stats = {
        "matched_tracks": len(mesh_dst),
        "missing_bones": len(headers) - len(mesh_dst),
        "keys_written": 0,
        "missing_names": [h.name for h in headers if h.name not in mesh_dst][:40],
        "rest_space": "swing_retarget",
        "max_basis_loc": 0.0,
        "warn_large_basis": False,
        "pos_scale": pos_scale,
        "apply_rotate90": apply_rotate90,
    }

    for t in sorted_times:
        frame = t
        locals_t: Dict[str, Matrix] = {}
        for h in headers:
            kf = kf_by_name.get(h.name)
            bind = bind_local[h.name]
            bpos = bind.to_translation()
            brot = bind.to_quaternion()
            if kf and kf.translations:
                pos = sample_vec(kf.translations, t, bpos) * pos_scale
            else:
                pos = bpos
            if kf and kf.rotations:
                rot = sample_quat(kf.rotations, t, brot)
            else:
                rot = brot
            mat = rot.to_matrix().to_4x4()
            mat.translation = Vector(pos)
            if kf and kf.scales:
                scl = sample_vec(kf.scales, t, Vector((1, 1, 1)))
                mat = mat @ Matrix.Diagonal((scl.x, scl.y, scl.z, 1.0))
            locals_t[h.name] = mat

        worlds_t = fk_worlds(locals_t)

        for h in headers:
            if h.name not in mesh_dst:
                continue
            dst = mesh_dst[h.name]
            pb = armature_obj.pose.bones[dst]
            # pose = MotAnim * MotRest^{-1} * combat_safe
            # At f0 (MotAnim≈MotRest) → combat_safe (stance without Mot roll twist)
            # Idle deltas apply as Mot world-space motion on that base.
            mw = worlds_t[h.name]
            mr = mot_rest_world[h.name]
            target = mw @ mr.inverted() @ combat_safe[h.name]
            pb.matrix = target

            loc_len = pb.location.length
            if loc_len > stats["max_basis_loc"]:
                stats["max_basis_loc"] = float(loc_len)

            pb.keyframe_insert(data_path="location", frame=frame)
            pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            pb.keyframe_insert(data_path="scale", frame=frame)
            stats["keys_written"] += 1

        bpy.context.view_layer.update()

    for fc in _iter_action_fcurves(action):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"

    if stats["max_basis_loc"] > 2.0:
        stats["warn_large_basis"] = True
        print(
            f"[re_motlist] WARNING: max pose basis location length "
            f"= {stats['max_basis_loc']:.4f} (swing_retarget)"
        )
    print(
        f"[re_motlist] swing retarget: matched={stats['matched_tracks']} "
        f"keys={stats['keys_written']} max_basis_loc={stats['max_basis_loc']:.4f}"
    )

    scene = bpy.context.scene
    scene.render.fps = int(round(fps))
    max_frame = int(anim.frame_count) if anim.frame_count else 1
    scene.frame_start = 0
    scene.frame_end = max(1, max_frame)
    scene.frame_current = 0
    return action, stats


def apply_animation_via_proxy_armature(
    mesh_armature_obj,
    mot: MotFile,
    anim: Animation,
    *,
    fps: float = 60.0,
    action_name: Optional[str] = None,
    pos_scale_to_mesh: float = 0.01,
    apply_rotate90: bool = True,
    clear_existing: bool = True,
) -> Tuple[object, Dict[str, int]]:
    """
    DEPRECATED for RE Mesh delivery: COPY_ROTATION bake imports Mot bone rolls
    into mesh skin → twist. Prefer apply_animation_swing_retarget.

    Kept for experiments: mot proxy + COPY_ROTATION (+ hip location) + nla.bake.
    """
    import math
    import bpy

    name = (action_name or anim.name.split("(")[0].strip() or "RE_Mot")[:63]
    scene = bpy.context.scene
    scene.render.fps = int(round(fps))
    max_frame = int(anim.frame_count) if anim.frame_count else 1
    scene.frame_start = 0
    scene.frame_end = max(1, max_frame)

    # Proxy in engine units + rotate90 into data
    proxy = build_armature_from_mot(
        mot,
        armature_name=f"_mot_proxy_{name}"[:63],
        pos_scale=pos_scale_to_mesh,
    )
    rest_locals = rest_local_matrices_from_headers(
        mot.bone_headers, pos_scale=pos_scale_to_mesh
    )
    apply_animation_to_armature(
        proxy,
        anim,
        fps=fps,
        action_name=f"_proxy_{name}"[:63],
        pos_scale=pos_scale_to_mesh,
        basis_pos_scale=1.0,
        rest_locals=rest_locals,
        rest_space="mot",
        clear_existing=True,
    )
    if apply_rotate90:
        proxy.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        bpy.ops.object.select_all(action="DESELECT")
        proxy.select_set(True)
        bpy.context.view_layer.objects.active = proxy
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        proxy.select_set(False)
    bpy.context.view_layer.update()

    if mesh_armature_obj.animation_data is None:
        mesh_armature_obj.animation_data_create()
    if clear_existing and mesh_armature_obj.animation_data.action:
        mesh_armature_obj.animation_data.action = None

    lookup = bone_lookup(mesh_armature_obj)
    proxy_lookup = {}
    for b in proxy.pose.bones:
        proxy_lookup[clean_bone_name(b.name).lower()] = b.name
        proxy_lookup[b.name.lower()] = b.name

    pairs = []
    missing = []
    for h in mot.bone_headers:
        key = clean_bone_name(h.name).lower()
        dst = lookup.get(key)
        src = proxy_lookup.get(key)
        if not (dst and src):
            missing.append(h.name)
            continue
        pairs.append((src, dst))
        pb = mesh_armature_obj.pose.bones[dst]
        pb.rotation_mode = "QUATERNION"
        # Rotation only: preserves mesh bind limb lengths / skin; drives combat angles
        c = pb.constraints.new("COPY_ROTATION")
        c.target = proxy
        c.subtarget = src
        c.owner_space = "WORLD"
        c.target_space = "WORLD"
        c.mix_mode = "REPLACE"
        # Root / hip also need translation for stance height / sway
        if h.name in ("Root", "C_Hip") or clean_bone_name(h.name) in ("Root", "C_Hip"):
            ct = pb.constraints.new("COPY_LOCATION")
            ct.target = proxy
            ct.subtarget = src
            ct.owner_space = "WORLD"
            ct.target_space = "WORLD"

    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    mesh_armature_obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_armature_obj
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.nla.bake(
        frame_start=0,
        frame_end=max(1, max_frame),
        only_selected=True,
        visual_keying=True,
        clear_constraints=True,
        clear_parents=False,
        use_current_action=False,
        bake_types={"POSE"},
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    action = (
        mesh_armature_obj.animation_data.action
        if mesh_armature_obj.animation_data
        else None
    )
    if action:
        action.name = name
        for fc in _iter_action_fcurves(action):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"

    try:
        bpy.data.objects.remove(proxy, do_unlink=True)
    except Exception:
        proxy.hide_viewport = True

    scene.frame_set(0)
    bpy.context.view_layer.update()
    max_loc = 0.0
    for _s, dst in pairs:
        max_loc = max(max_loc, mesh_armature_obj.pose.bones[dst].location.length)

    stats = {
        "matched_tracks": len(pairs),
        "missing_bones": len(missing),
        "keys_written": -1,
        "missing_names": missing[:40],
        "rest_space": "proxy_copy_rotation_bake",
        "max_basis_loc": float(max_loc),
        "warn_large_basis": max_loc > 2.0,
        "frame_end": max_frame,
    }
    print(
        f"[re_motlist] proxy COPY_ROTATION bake: matched={stats['matched_tracks']} "
        f"max_basis_loc@f0={stats['max_basis_loc']:.4f}"
    )
    scene.frame_current = 0
    return action, stats


def apply_animation_world_retarget(
    armature_obj,
    mot: MotFile,
    anim: Animation,
    *,
    fps: float = 60.0,
    action_name: Optional[str] = None,
    pos_scale: float = 0.01,
    apply_rotate90: bool = True,
    clear_existing: bool = True,
) -> Tuple[object, Dict[str, int]]:
    """
    Retarget mot animation onto an RE Mesh armature in **armature/world space**.

    Why not local MotRest^{-1}@Anim / MeshRest^{-1}@Anim alone?
      RE Mesh bind locals ≠ mot bind locals (esp. rotations). Relative mot deltas
      leave the body in mesh T-pose; naive absolute locals tilt the character.

    Method:
      1) Build mot local TR at each frame (pos * pos_scale, Blender quat matrix).
      2) Forward-kin to mot armature-space worlds (parent @ local).
      3) Optionally multiply by rotate90_X (same as RE Mesh import).
      4) For each matching pose bone (parents first): pb.matrix = target_world
         then keyframe location / rotation_quaternion / scale.

    This matches Noesis-style \"drive skeleton by animated globals\" on the mesh rig.
    """
    import math
    import bpy
    from mathutils import Matrix, Quaternion, Vector

    if not mot.bone_headers:
        raise RuntimeError("mot.bone_headers required for world retarget")

    name = (action_name or anim.name.split("(")[0].strip() or "RE_Mot")[:63]
    if armature_obj.animation_data is None:
        armature_obj.animation_data_create()
    if clear_existing:
        armature_obj.animation_data.action = None
    action = bpy.data.actions.new(name)
    armature_obj.animation_data.action = action

    lookup = bone_lookup(armature_obj)
    headers = list(mot.bone_headers)
    parent_name = {
        h.name: (
            headers[h.parent_index].name
            if h.parent_index is not None and h.parent_index >= 0
            else None
        )
        for h in headers
    }
    # Map bone name -> KeyFramedBone
    kf_by_name: Dict[str, KeyFramedBone] = {}
    for kf in anim.kf_bones:
        if 0 <= kf.bone_index < len(anim.bones):
            kf_by_name[anim.bones[kf.bone_index].name] = kf

    def sample_vec(keys, t, default: Vector) -> Vector:
        if not keys:
            return default.copy()
        last = Vector(keys[0].value.as_tuple())
        for kv in keys:
            if kv.time > t:
                break
            last = Vector(kv.value.as_tuple())
        return last

    def sample_quat(keys, t, default: Quaternion) -> Quaternion:
        if not keys:
            return default.copy()
        last = mot_quat_to_blender(keys[0].value)
        for kv in keys:
            if kv.time > t:
                break
            last = mot_quat_to_blender(kv.value)
        return last

    # Bind locals (scaled) for defaults — Mot quat conjugated inside helper
    bind_local: Dict[str, Matrix] = {}
    for h in headers:
        t = Vector(h.mat[3].as_tuple()) * pos_scale
        bind_local[h.name] = _quat_to_blender_matrix(h.rot, Vec3(t))

    # Union of all key times
    times: Set[float] = set()
    for kf in anim.kf_bones:
        for ch in (kf.translations, kf.rotations, kf.scales):
            for kv in ch:
                times.add(kv.time)
    if not times:
        times = {0.0}
    sorted_times = sorted(times)

    R90 = Matrix.Rotation(math.radians(90.0), 4, "X") if apply_rotate90 else Matrix.Identity(4)

    for pb in armature_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"

    stats = {
        "matched_tracks": 0,
        "missing_bones": 0,
        "keys_written": 0,
        "missing_names": [],
        "rest_space": "world_retarget",
        "max_basis_loc": 0.0,
        "warn_large_basis": False,
        "pos_scale": pos_scale,
        "apply_rotate90": apply_rotate90,
    }
    missing: Set[str] = set()
    matched_names = []
    for h in headers:
        if clean_bone_name(h.name).lower() in lookup or h.name.lower() in lookup:
            matched_names.append(h.name)
            stats["matched_tracks"] += 1
        else:
            stats["missing_bones"] += 1
            missing.add(h.name)

    # Evaluate frames
    for t in sorted_times:
        frame = t
        # 1) locals at t
        locals_t: Dict[str, Matrix] = {}
        for h in headers:
            kf = kf_by_name.get(h.name)
            bind = bind_local[h.name]
            bpos = bind.to_translation()
            brot = bind.to_quaternion()
            if kf and kf.translations:
                pos = sample_vec(kf.translations, t, bpos) * pos_scale
            else:
                pos = bpos
            if kf and kf.rotations:
                rot = sample_quat(kf.rotations, t, brot)
            else:
                rot = brot
            mat = rot.to_matrix().to_4x4()
            mat.translation = Vector(pos)
            if kf and kf.scales:
                scl = sample_vec(kf.scales, t, Vector((1, 1, 1)))
                mat = mat @ Matrix.Diagonal((scl.x, scl.y, scl.z, 1.0))
            locals_t[h.name] = mat

        # 2) worlds: FK in Mot Y-up first, apply rotate90 once (never per parent hop)
        yup: Dict[str, Matrix] = {}
        worlds_t: Dict[str, Matrix] = {}
        for h in headers:
            n = h.name
            L = locals_t[n]
            p = parent_name[n]
            yup[n] = L.copy() if p is None else yup[p] @ L
            worlds_t[n] = R90 @ yup[n]

        # 3) assign pose matrices parent-first (header order)
        for h in headers:
            key = clean_bone_name(h.name).lower()
            dst = lookup.get(key) or lookup.get(h.name.lower())
            if not dst:
                continue
            pb = armature_obj.pose.bones[dst]
            # Parent-first order: matrix setter derives matrix_basis from parent pose
            pb.matrix = worlds_t[h.name]

            loc_len = pb.location.length
            if loc_len > stats["max_basis_loc"]:
                stats["max_basis_loc"] = float(loc_len)

            pb.keyframe_insert(data_path="location", frame=frame)
            pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            pb.keyframe_insert(data_path="scale", frame=frame)
            stats["keys_written"] += 1

        # One depsgraph update per frame after hierarchy assign
        bpy.context.view_layer.update()

    # Linear interpolation
    for fc in _iter_action_fcurves(action):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"

    stats["missing_names"] = sorted(missing)[:40]
    print(
        f"[re_motlist] world retarget: matched={stats['matched_tracks']} "
        f"keys={stats['keys_written']} max_basis_loc={stats['max_basis_loc']:.4f}"
    )

    scene = bpy.context.scene
    scene.render.fps = int(round(fps))
    max_frame = int(anim.frame_count) if anim.frame_count else 1
    scene.frame_start = 0
    scene.frame_end = max(1, max_frame)
    scene.frame_current = 0
    return action, stats


def apply_action_from_noesis_fbx(
    mesh_armature_obj,
    noesis_fbx_path: str,
    *,
    action_name: Optional[str] = None,
    clear_existing: bool = True,
    frame_step: int = 1,
) -> Tuple[object, Dict[str, int]]:
    """
    Bake animation from a Noesis-exported FBX onto an RE Mesh armature.

    Hard facts (SF6 Ryu esf001):
      • RE Mesh rest locals == Noesis mesh rest locals (Noesis bone data /100).
      • Homemade Mot absolute FK does **not** match Noesis arm worlds; the FBX
        Action is ground truth for combat idle.
      • Noesis has no Root bone (object is Root, scale 0.01, rot X 90); leave
        RE Mesh Root at rest.

    Method: import FBX, per-frame copy pose basis (loc/rot/scale) for matching
    bone names onto the mesh armature, keyframe, delete imported objects.
    """
    import bpy
    from mathutils import Vector

    path = str(noesis_fbx_path)
    before_obj = set(bpy.data.objects)
    before_act = set(bpy.data.actions)

    res = bpy.ops.import_scene.fbx(
        filepath=path,
        automatic_bone_orientation=False,
        ignore_leaf_bones=False,
        use_anim=True,
    )
    if "FINISHED" not in res:
        raise RuntimeError(f"FBX import failed: {path} -> {res}")

    imported = [o for o in bpy.data.objects if o not in before_obj]
    noe_arms = [o for o in imported if o.type == "ARMATURE"]
    if not noe_arms:
        raise RuntimeError(f"No armature in Noesis FBX: {path}")
    noe_arm = sorted(noe_arms, key=lambda a: len(a.data.bones), reverse=True)[0]

    # Hide imported meshes so they don't pollute export selection
    for o in imported:
        if o.type == "MESH":
            o.hide_viewport = True
            o.hide_render = True

    lookup = bone_lookup(mesh_armature_obj)
    pairs: List[Tuple[str, str]] = []
    for pb in noe_arm.pose.bones:
        key = clean_bone_name(pb.name).lower()
        dst = lookup.get(key)
        if dst:
            pairs.append((pb.name, dst))

    if mesh_armature_obj.animation_data is None:
        mesh_armature_obj.animation_data_create()
    if clear_existing:
        mesh_armature_obj.animation_data.action = None

    name = (action_name or "esf001_Noesis_Idle")[:63]
    action = bpy.data.actions.new(name)
    mesh_armature_obj.animation_data.action = action

    for _, dst in pairs:
        mesh_armature_obj.pose.bones[dst].rotation_mode = "QUATERNION"

    scene = bpy.context.scene
    # Frame range: prefer Noesis action, else scene after import
    noe_action = (
        noe_arm.animation_data.action
        if noe_arm.animation_data and noe_arm.animation_data.action
        else None
    )
    if noe_action is not None and hasattr(noe_action, "frame_range"):
        f0, f1 = int(noe_action.frame_range[0]), int(noe_action.frame_range[1])
    else:
        f0, f1 = int(scene.frame_start), int(scene.frame_end)
    if f1 <= f0:
        f1 = f0 + 1

    scene.frame_start = f0
    scene.frame_end = f1
    keys = 0
    max_loc = 0.0
    # Noesis FBX stores bone data in Noesis ×100 space; object scale is 0.01.
    # RE Mesh is engine units. Rest locals match after /100 → scale basis *location*.
    loc_scale = 0.01
    try:
        # Prefer actual object uniform scale if present
        sx = abs(float(noe_arm.scale[0]))
        if 1e-6 < sx < 0.5:
            loc_scale = sx
    except Exception:
        pass

    for frame in range(f0, f1 + 1, max(1, frame_step)):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for src_name, dst_name in pairs:
            src = noe_arm.pose.bones[src_name]
            dst = mesh_armature_obj.pose.bones[dst_name]
            # Rests match (mesh == noe/100) → copy rot/scale; scale location ×0.01
            dst.location = src.location * loc_scale
            dst.rotation_quaternion = src.rotation_quaternion.copy()
            dst.scale = src.scale.copy()
            max_loc = max(max_loc, dst.location.length)
            dst.keyframe_insert(data_path="location", frame=frame)
            dst.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            dst.keyframe_insert(data_path="scale", frame=frame)
            keys += 1

    for fc in _iter_action_fcurves(action):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"

    # Remove imported objects and orphaned noesis actions
    for o in imported:
        try:
            bpy.data.objects.remove(o, do_unlink=True)
        except Exception:
            pass
    for act in list(bpy.data.actions):
        if act not in before_act and act != action and act.users == 0:
            try:
                bpy.data.actions.remove(act)
            except Exception:
                pass

    scene.frame_set(f0)
    bpy.context.view_layer.update()
    stats = {
        "matched_tracks": len(pairs),
        "missing_bones": 0,
        "keys_written": keys,
        "rest_space": "noesis_fbx_bake",
        "max_basis_loc": float(max_loc),
        "warn_large_basis": max_loc > 50.0,  # Noesis uses ×100 space on hip loc
        "source_fbx": path,
        "frame_start": f0,
        "frame_end": f1,
    }
    print(
        f"[re_motlist] Noesis FBX bake: bones={stats['matched_tracks']} "
        f"frames={f0}..{f1} keys={keys} max_basis_loc={max_loc:.4f}"
    )
    return action, stats


def apply_animation_mot_absolute_full_chain(
    armature_obj,
    mot: MotFile,
    anim: Animation,
    *,
    fps: float = 60.0,
    action_name: Optional[str] = None,
    pos_scale: float = 0.01,
    clear_existing: bool = True,
    skip_bones: Optional[Sequence[str]] = None,
) -> Tuple[object, Dict[str, int]]:
    """
    Noesis-compatible absolute Mot drive on an RE Mesh armature.

    Ground truth: Noesis FBX (esf001 idle) — combat stance, scale 0.01 + rot90 on
    the armature object, **no Root bone** (C_Hip is a root). Keys are absolute
    parent-local Mot TRS.

    Critical bug this fixes:
      Keying *only* bones that appear in kf_bones leaves unkeyed Mot bones at
      **mesh rest** locals. Hybrid FK (Mot on some bones, mesh rest on others)
      breaks the arm/leg chain → T-pose-looking body or twisted limbs even when
      hip height matches. Noesis applies Mot rest/anim to the whole mot set.

    Method:
      For every Mot bone header (except skip_bones, default Root):
        MotLocal(t) from keys, or Mot header rest if channel missing
        basis = MeshRestLocal^{-1} @ MotLocal(t)   # pos already * pos_scale
      Key all those bones at the **union** of all key times (and 0 / end).

    Skip Root: RE Mesh Root holds baked rotate90; Mot Root is I (Noesis folds
    Root into the armature object transform).
    """
    import bpy
    from mathutils import Matrix, Quaternion, Vector

    if not mot.bone_headers:
        mot.read_bone_headers()
    if not mot.bone_headers:
        raise RuntimeError("mot.bone_headers required for absolute full-chain bind")

    name = (action_name or anim.name.split("(")[0].strip() or "RE_Mot")[:63]
    if armature_obj.animation_data is None:
        armature_obj.animation_data_create()
    if clear_existing and armature_obj.animation_data.action:
        armature_obj.animation_data.action = None
    action = bpy.data.actions.new(name)
    armature_obj.animation_data.action = action

    lookup = bone_lookup(armature_obj)
    bones_data = armature_obj.data.bones
    skip_set = {clean_bone_name(n).lower() for n in (skip_bones or ("Root",))}

    def blender_rest_local(bone_name: str) -> Matrix:
        bone = bones_data[bone_name]
        if bone.parent:
            return bone.parent.matrix_local.inverted() @ bone.matrix_local
        return bone.matrix_local.copy()

    # Mot rest locals in engine units (header pos is Noesis ×100 in h.mat[3])
    mot_rest = rest_local_matrices_from_headers(mot.bone_headers, pos_scale=pos_scale)
    header_by_name = {h.name: h for h in mot.bone_headers}

    # Map name -> KeyFramedBone
    kf_by_name: Dict[str, KeyFramedBone] = {}
    for kf in anim.kf_bones:
        if 0 <= kf.bone_index < len(anim.bones):
            kf_by_name[anim.bones[kf.bone_index].name] = kf

    def sample_vec(keys, t, default: Vector) -> Vector:
        if not keys:
            return default.copy()
        last = Vector(keys[0].value.as_tuple())
        for kv in keys:
            if kv.time > t:
                break
            last = Vector(kv.value.as_tuple())
        return last

    def sample_quat(keys, t, default: Quaternion) -> Quaternion:
        if not keys:
            return default.copy()
        last = mot_quat_to_blender(keys[0].value)
        for kv in keys:
            if kv.time > t:
                break
            last = mot_quat_to_blender(kv.value)
        return last

    # Union of times so every bone is keyed on the same frames
    times: Set[float] = {0.0}
    if anim.frame_count:
        times.add(float(int(anim.frame_count)))
    for kf in anim.kf_bones:
        for ch in (kf.translations, kf.rotations, kf.scales):
            for kv in ch:
                times.add(float(kv.time))
    sorted_times = sorted(times)

    for pb in armature_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"

    stats = {
        "matched_tracks": 0,
        "missing_bones": 0,
        "keys_written": 0,
        "missing_names": [],
        "skipped_bones": sorted(skip_set),
        "rest_space": "mot_absolute_full_chain",
        "quat_convention": "mot_conjugate",
        "max_basis_loc": 0.0,
        "warn_large_basis": False,
        "pos_scale": pos_scale,
        "n_times": len(sorted_times),
    }
    missing: List[str] = []
    # (src_name, dst_name, mesh_rest_local, kf|None, default_pos_x100, default_rot)
    driven: List[Tuple[str, str, Matrix, Optional[KeyFramedBone], Vector, Quaternion]] = []

    for h in mot.bone_headers:
        key = clean_bone_name(h.name).lower()
        if key in skip_set or h.name.lower() in skip_set:
            continue
        dst = lookup.get(key) or lookup.get(h.name.lower())
        if not dst:
            stats["missing_bones"] += 1
            missing.append(h.name)
            continue
        stats["matched_tracks"] += 1
        rest_local = blender_rest_local(dst)
        # header mat[3] already Noesis ×100
        pos_x100 = Vector(h.mat[3].as_tuple())
        brot = mot_quat_to_blender(h.rot)
        driven.append((h.name, dst, rest_local, kf_by_name.get(h.name), pos_x100, brot))

    for t in sorted_times:
        frame = t
        for src_name, dst_name, rest_local, kf, pos_x100, brot in driven:
            # Keys and headers share Noesis ×100 translation space
            if kf and kf.translations:
                pos100 = sample_vec(kf.translations, t, pos_x100)
            else:
                pos100 = pos_x100
            pos = Vector((pos100.x * pos_scale, pos100.y * pos_scale, pos100.z * pos_scale))

            if kf and kf.rotations:
                rot = sample_quat(kf.rotations, t, brot)
            else:
                rot = brot

            has_scl = bool(kf and kf.scales)
            if has_scl:
                scl = sample_vec(kf.scales, t, Vector((1.0, 1.0, 1.0)))
            else:
                scl = Vector((1.0, 1.0, 1.0))

            anim_local = rot.to_matrix().to_4x4()
            anim_local.translation = pos
            if has_scl:
                anim_local = anim_local @ Matrix.Diagonal((scl.x, scl.y, scl.z, 1.0))

            basis = rest_local.inverted() @ anim_local
            pb = armature_obj.pose.bones[dst_name]
            loc, quat, scale = basis.decompose()
            pb.location = loc
            pb.rotation_quaternion = quat
            pb.scale = scale if has_scl else Vector((1.0, 1.0, 1.0))

            if loc.length > stats["max_basis_loc"]:
                stats["max_basis_loc"] = float(loc.length)

            pb.keyframe_insert(data_path="location", frame=frame)
            pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            if has_scl:
                pb.keyframe_insert(data_path="scale", frame=frame)
            stats["keys_written"] += 1

    for fc in _iter_action_fcurves(action):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"

    stats["missing_names"] = missing[:40]
    if stats["max_basis_loc"] > 2.0:
        stats["warn_large_basis"] = True
        print(
            f"[re_motlist] WARNING: max basis loc={stats['max_basis_loc']:.4f} "
            f"(mot_absolute_full_chain)"
        )
    print(
        f"[re_motlist] mot absolute full-chain: matched={stats['matched_tracks']} "
        f"times={stats['n_times']} keys={stats['keys_written']} "
        f"max_basis_loc={stats['max_basis_loc']:.4f}"
    )

    scene = bpy.context.scene
    scene.render.fps = int(round(fps))
    max_frame = int(anim.frame_count) if anim.frame_count else 1
    scene.frame_start = 0
    scene.frame_end = max(1, max_frame)
    scene.frame_current = 0
    return action, stats


def apply_animation_to_armature(
    armature_obj,
    anim: Animation,
    *,
    fps: float = 60.0,
    action_name: Optional[str] = None,
    pos_scale: float = 1.0,
    basis_pos_scale: float = 1.0,
    clear_existing: bool = True,
    use_absolute_local: bool = True,
    rest_locals: Optional[Dict[str, object]] = None,
    rest_space: str = "mesh",
    skip_bones: Optional[Sequence[str]] = None,
) -> Tuple[object, Dict[str, int]]:
    """
    Write keyframes onto armature_obj.

    rest_space:
      \"mesh\" / \"blender\" (default for RE Mesh) —
            basis = MeshRest^{-1} @ MotAnim'
            MotAnim' translations scaled by pos_scale (use 0.01 for ×100→engine).
      \"mot\" — basis = MotRest^{-1} @ MotAnim (only for armatures built from mot
            headers; wrong for RE Mesh T-pose skeletons).

    pos_scale: multiply MotAnim translations (0.01 for RE Mesh engine units).
    basis_pos_scale: extra scale on basis.translation after invert@anim (usually 1.0
            when pos_scale already applied to samples).

    skip_bones:
      Names (case-insensitive) to leave at mesh rest. For RE Mesh + rotate90,
      always skip **Root**: Mot Root is identity (Y-up) while mesh Root holds the
      baked 90° X (Z-up). Applying Mot Root undoes that and lays the character
      into Y-up. Measured fix: mesh absolute + skip Root → combat idle, diag≈2.0.
    """
    import bpy
    from mathutils import Matrix, Quaternion, Vector

    name = action_name or anim.name.split("(")[0].strip() or "RE_Mot"
    name = name[:63]

    if armature_obj.animation_data is None:
        armature_obj.animation_data_create()
    # Drop previous action on this object for a clean slot
    if clear_existing and armature_obj.animation_data.action:
        armature_obj.animation_data.action = None
    action = bpy.data.actions.new(name)
    armature_obj.animation_data.action = action

    lookup = bone_lookup(armature_obj)
    bones_data = armature_obj.data.bones

    def blender_rest_local(bone_name: str) -> Matrix:
        bone = bones_data[bone_name]
        if bone.parent:
            return bone.parent.matrix_local.inverted() @ bone.matrix_local
        return bone.matrix_local.copy()

    def mot_rest_local(src_name: str) -> Optional[Matrix]:
        if not rest_locals:
            return None
        if src_name in rest_locals:
            return rest_locals[src_name].copy()
        key = clean_bone_name(src_name).lower()
        if key in rest_locals:
            return rest_locals[key].copy()
        return None

    skip_set = {clean_bone_name(n).lower() for n in (skip_bones or ())}
    # Absolute mesh mode only: RE Mesh rotate90 lives on Root — Mot Root is I.
    # Relative mot mode leaves Root ≈ identity naturally; do not force-skip.
    if rest_space in ("mesh", "blender") and "root" not in skip_set:
        skip_set.add("root")

    stats = {
        "matched_tracks": 0,
        "missing_bones": 0,
        "keys_written": 0,
        "missing_names": [],
        "skipped_bones": sorted(skip_set),
        "rest_space": rest_space,
        "max_basis_loc": 0.0,
        "warn_large_basis": False,
    }
    missing: Set[str] = set()

    for pb in armature_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"

    scene = bpy.context.scene
    scene.render.fps = int(round(fps))

    if rest_space == "mot" and not rest_locals:
        raise RuntimeError(
            "rest_space='mot' requires rest_locals from mot bone headers"
        )

    for kf in anim.kf_bones:
        if kf.bone_index < 0 or kf.bone_index >= len(anim.bones):
            continue
        src_name = anim.bones[kf.bone_index].name
        key = clean_bone_name(src_name).lower()
        if key in skip_set or src_name.lower() in skip_set:
            continue
        dst_name = lookup.get(key)
        if not dst_name:
            stats["missing_bones"] += 1
            missing.add(src_name)
            continue
        stats["matched_tracks"] += 1
        pb = armature_obj.pose.bones[dst_name]

        if rest_space == "mot":
            rest_local = mot_rest_local(src_name) or Matrix.Identity(4)
        else:
            # mesh / blender: absolute mot pose retargeted onto mesh bind
            rest_local = blender_rest_local(dst_name)

        rest_inv = rest_local.inverted()

        times: Set[float] = set()
        for channel in (kf.translations, kf.rotations, kf.scales):
            for kv in channel:
                times.add(kv.time)
        if not times:
            continue

        def sample_vec(keys, t, default):
            if not keys:
                return default
            last = keys[0].value
            for kv in keys:
                if kv.time > t:
                    break
                last = kv.value
            return last

        def sample_quat(keys, t, default):
            if not keys:
                return default
            last = keys[0].value
            for kv in keys:
                if kv.time > t:
                    break
                last = kv.value
            return last

        # Defaults for missing tracks:
        # - mesh mode: keep mesh rest channel if mot didn't key it
        # - mot mode: use mot rest
        if rest_space == "mot" and rest_locals:
            mr = mot_rest_local(src_name) or rest_local
            default_pos = Vec3(mr.to_translation())
            rq = mr.to_quaternion()
            default_rot = Quat((rq.x, rq.y, rq.z, rq.w))
            default_scl = Vec3(mr.to_scale())
        else:
            rest_loc = rest_local.to_translation()
            rest_rot = rest_local.to_quaternion()
            rest_scl = rest_local.to_scale()
            default_pos = Vec3((rest_loc.x, rest_loc.y, rest_loc.z))
            # For mesh absolute retarget, missing rot should still prefer mot bind
            # if we have header via rest_locals scaled — optional upgrade later.
            default_rot = Quat((rest_rot.x, rest_rot.y, rest_rot.z, rest_rot.w))
            default_scl = Vec3((rest_scl.x, rest_scl.y, rest_scl.z))

        # Prefer mot header as absolute default for missing channels in mesh mode
        # so a rot-only track still gets mot bind translation (matches engine).
        if rest_space != "mot" and rest_locals:
            mr = mot_rest_local(src_name)
            if mr is not None:
                mt = mr.to_translation()
                if pos_scale != 1.0:
                    default_pos = Vec3((mt.x * pos_scale, mt.y * pos_scale, mt.z * pos_scale))
                else:
                    default_pos = Vec3((mt.x, mt.y, mt.z))
                mq = mr.to_quaternion()
                default_rot = Quat((mq.x, mq.y, mq.z, mq.w))

        for t in sorted(times):
            frame = t
            pos = sample_vec(kf.translations, t, default_pos)
            rot = sample_quat(kf.rotations, t, default_rot)
            scl = sample_vec(kf.scales, t, default_scl)

            # Scale mot absolute translation into mesh/engine units
            if pos_scale != 1.0 and kf.translations:
                pos = Vec3((pos.x * pos_scale, pos.y * pos_scale, pos.z * pos_scale))
            elif pos_scale != 1.0 and not kf.translations:
                # default_pos already scaled above for mesh mode
                pass

            if use_absolute_local:
                anim_local = _quat_to_blender_matrix(
                    rot, pos, scl if kf.scales else None
                )
                if rest_space == "mot" and pos_scale != 1.0:
                    rest_scaled = rest_local.copy()
                    rest_scaled.translation = rest_scaled.translation * pos_scale
                    basis = rest_scaled.inverted() @ anim_local
                else:
                    basis = rest_inv @ anim_local

                if basis_pos_scale != 1.0:
                    basis.translation = basis.translation * basis_pos_scale

                loc, quat, scale = basis.decompose()
                pb.location = loc
                pb.rotation_quaternion = quat
                if kf.scales:
                    pb.scale = scale
                else:
                    pb.scale = Vector((1.0, 1.0, 1.0))

                loc_len = loc.length
                if loc_len > stats["max_basis_loc"]:
                    stats["max_basis_loc"] = float(loc_len)
            else:
                pb.location = Vector((pos.x, pos.y, pos.z))
                pb.rotation_quaternion = Quaternion((rot.w, rot.x, rot.y, rot.z))
                if kf.scales:
                    pb.scale = Vector((scl.x, scl.y, scl.z))

            pb.keyframe_insert(data_path="location", frame=frame)
            pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            if kf.scales:
                pb.keyframe_insert(data_path="scale", frame=frame)
            stats["keys_written"] += 1

        for fc in _iter_action_fcurves(action):
            if fc.data_path.startswith(f'pose.bones["{dst_name}"]'):
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"

    stats["missing_names"] = sorted(missing)[:40]
    # Mesh absolute retarget can have larger location bases than pure relative idle
    warn_threshold = 2.0 if rest_space in ("mesh", "blender") else (
        0.5 if basis_pos_scale != 1.0 else 5.0
    )
    if stats["max_basis_loc"] > warn_threshold:
        stats["warn_large_basis"] = True
        print(
            f"[re_motlist] WARNING: max pose basis location length "
            f"= {stats['max_basis_loc']:.4f} (rest_space={rest_space}, "
            f"pos_scale={pos_scale}, basis_pos_scale={basis_pos_scale})"
        )
    else:
        print(
            f"[re_motlist] max pose basis location length "
            f"= {stats['max_basis_loc']:.4f} "
            f"(rest_space={rest_space}, pos_scale={pos_scale}) OK"
        )

    max_frame = int(anim.frame_count) if anim.frame_count else 1
    scene.frame_start = 0
    scene.frame_end = max(1, max_frame)
    scene.frame_current = 0

    return action, stats


def import_motlist_file(
    path: str,
    armature_obj=None,
    *,
    clip_index: int = 0,
    fps: float = 60.0,
    pos_scale: float = 1.0,
    create_armature_if_missing: bool = True,
    action_name: Optional[str] = None,
):
    """
    High-level: load motlist, decode one clip, apply to armature.
    Uses mot bone-header rest for correct RE Mesh binding.
    """
    mlist = load_motlist(path)
    if not mlist.mots:
        raise RuntimeError("motlist contains no mot clips")
    if clip_index < 0 or clip_index >= len(mlist.mots):
        raise IndexError(f"clip_index {clip_index} out of range 0..{len(mlist.mots)-1}")

    target = mlist.mots[clip_index]
    mlist.read([target.name])
    mlist.make_anims([target.name])
    if not mlist.anims:
        raise RuntimeError("failed to build animation from clip")

    anim = mlist.anims[0]
    mot = target

    if armature_obj is None and create_armature_if_missing:
        armature_obj = build_armature_from_mot(mot)

    if armature_obj is None:
        raise RuntimeError("No armature provided and create_armature_if_missing=False")

    # Default for RE Mesh: Noesis-style absolute full-chain Mot bind
    use_ps = 0.01 if pos_scale == 1.0 else pos_scale
    action, stats = apply_animation_mot_absolute_full_chain(
        armature_obj,
        mot,
        anim,
        fps=fps,
        action_name=action_name,
        pos_scale=use_ps,
        skip_bones=("Root",),
    )
    return {
        "motlist": mlist,
        "mot": mot,
        "anim": anim,
        "action": action,
        "stats": stats,
        "armature": armature_obj,
    }

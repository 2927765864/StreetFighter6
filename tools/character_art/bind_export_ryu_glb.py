#!/usr/bin/env python3
"""
Blender --background script: bind prepared maps to Ryu glb materials and export.
Usage:
  Blender --background --python bind_export_ryu_glb.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import bpy

# Resolve project root: script is tools/character_art/
SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[2]
PREPARED = ROOT / "private/runtime/ryu/textures/prepared"
OUT_GLB = ROOT / "private/runtime/ryu/ryu_c1_textured.glb"
PREVIEW_DIR = PREPARED / "_preview"

# Candidate mesh sources (priority)
MESH_CANDIDATES = [
    ROOT / "private/runtime/ryu/ryu_c1_mesh_only.glb",
    ROOT / "private/runtime/ryu/ryu_c1.glb",
    ROOT / "app/public/models/ryu/ryu_c1.glb",
    ROOT / "private/interim/characters/SF6 Ryu Model/SF6 Ryu No rig.glb",
]


def norm_mat_name(name: str) -> str:
    n = name.split(".")[0]
    return n


def pick_pack(mat_name: str) -> str | None:
    n = norm_mat_name(mat_name).lower()
    if "headband" in n or "head_band" in n:
        return "headband"
    if "eyeshadow" in n or "eyetear" in n or "eye_tear" in n:
        return "eye_fx"
    if "mouth" in n:
        return "head"
    if "head00" in n or ( "head" in n and "band" not in n and "hair" not in n):
        return "head"
    if "body00" in n or ("body" in n and "costume" not in n):
        return "body"
    if "eye00" in n or n.endswith("eye00"):
        return "eye"
    if "hair" in n or "beard" in n or "brow" in n or "lash" in n:
        return "hair"
    # Black belt (obi) — not white gi cloth
    if "obisign" in n or "obi_sign" in n:
        return "belt_sign"
    if "obi" in n:
        return "belt"
    if any(k in n for k in ("dougipants", "waraji", "costume03", "costume01")):
        return "clothb"
    # costume00 / threads removed from mesh; keep mapping for safety
    if "costume00" in n or "threads" in n:
        return "clotha"
    if "esf_headband" in n:
        return "headband"
    if "esf_mouth" in n:
        return "head"
    if "esf_head" in n and "band" not in n:
        return "head"
    if "esf_body" in n:
        return "body"
    if "esf_eye" in n and "shadow" not in n and "tear" not in n:
        return "eye"
    if "esf_hair" in n:
        return "hair"
    if "esf_obi" in n and "sign" in n:
        return "belt_sign"
    if "esf_obi" in n:
        return "belt"
    if "esf_costume" in n or "esf_dougi" in n or "esf_waraji" in n:
        return "clothb"
    return None


def color_path(pack: str) -> Path | None:
    if pack == "eye_fx":
        return None  # solid color only
    if pack == "belt":
        p = PREPARED / "belt_color_final.png"
        return p if p.exists() else None
    if pack == "belt_sign":
        # kanji plate can use clotha pattern or solid ivory
        p = PREPARED / "belt_sign_color_final.png"
        if p.exists():
            return p
        p = PREPARED / "clotha_color_final.png"
        return p if p.exists() else None
    if pack == "headband":
        p = PREPARED / "headband_color_final.png"
        if p.exists():
            return p
        p = PREPARED / "clotha_color_final.png"
        return p if p.exists() else None
    if pack in ("hair", "clotha", "clothb"):
        p = PREPARED / f"{pack}_color_final.png"
        if p.exists():
            return p
    p = PREPARED / f"{pack}_color.png"
    return p if p.exists() else None


def load_image(path: Path, *, non_color: bool) -> bpy.types.Image:
    img = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    else:
        img.colorspace_settings.name = "sRGB"
    return img


def setup_principled(mat: bpy.types.Material, pack: str) -> None:
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (400, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    # Eye tear / shadow: solid dark, no eyeball atlas (was causing red/pink blobs).
    if pack == "eye_fx":
        bsdf.inputs["Base Color"].default_value = (0.05, 0.03, 0.03, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.85
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Alpha"].default_value = 0.35
        try:
            mat.blend_method = "BLEND"
        except Exception:
            pass
        return

    # base color + optional UVMap pin
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    uv.location = (-650, 100)

    cp = color_path(pack)
    needs_alpha = pack in ("clotha", "clothb", "hair", "headband")
    if cp is not None and cp.exists():
        tex = nodes.new("ShaderNodeTexImage")
        tex.location = (-400, 200)
        tex.image = load_image(cp, non_color=False)
        links.new(uv.outputs["UV"], tex.inputs["Vector"])
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if needs_alpha or (tex.image and tex.image.channels == 4):
            links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            try:
                # MASK cuts black atlas fringes cleanly for gi/cape cards
                mat.blend_method = "CLIP"
                mat.alpha_threshold = 0.12
            except Exception:
                pass
            try:
                mat.shadow_method = "CLIP"
            except Exception:
                pass
    else:
        bsdf.inputs["Base Color"].default_value = (0.7, 0.7, 0.7, 1)

    # Normals: head/body medium; cloth soft (detail without mud); skip eye/hair
    bump_pack = "clotha" if pack == "headband" else pack
    bp = PREPARED / f"{bump_pack}_bump.png"
    normal_strength = {
        "head": 0.45,
        "body": 0.5,
        "clotha": 0.28,
        "clothb": 0.28,
        "headband": 0.22,
        "belt": 0.2,
        "belt_sign": 0.15,
    }.get(pack, 0.0)
    if pack in ("belt", "belt_sign"):
        bump_pack = "clothb"  # reuse fabric normal if no belt bump
    if bp.exists() and normal_strength > 0:
        ntex = nodes.new("ShaderNodeTexImage")
        ntex.location = (-400, -250)
        ntex.image = load_image(bp, non_color=True)
        links.new(uv.outputs["UV"], ntex.inputs["Vector"])
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.location = (-100, -250)
        nmap.inputs["Strength"].default_value = normal_strength
        links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    # Roughness map for skin/cloth (inverted in prepare) — fabric micro-variation
    rp = PREPARED / f"{bump_pack}_rough.png"
    if rp.exists() and pack in ("head", "body", "clotha", "clothb"):
        rtex = nodes.new("ShaderNodeTexImage")
        rtex.location = (-400, -500)
        rtex.image = load_image(rp, non_color=True)
        links.new(uv.outputs["UV"], rtex.inputs["Vector"])
        links.new(rtex.outputs["Color"], bsdf.inputs["Roughness"])
    elif pack == "eye":
        bsdf.inputs["Roughness"].default_value = 0.2
        try:
            bsdf.inputs["Emission Color"].default_value = (0.18, 0.14, 0.12, 1)
            bsdf.inputs["Emission Strength"].default_value = 0.18
        except Exception:
            pass
    elif pack == "hair":
        bsdf.inputs["Roughness"].default_value = 0.58
    elif pack == "headband":
        bsdf.inputs["Roughness"].default_value = 0.8
    else:
        bsdf.inputs["Roughness"].default_value = 0.72

    bsdf.inputs["Metallic"].default_value = 0.0


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_mesh(path: Path) -> None:
    ext = path.suffix.lower()
    if ext == ".glb" or ext == ".gltf":
        bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        raise RuntimeError(f"unsupported mesh {path}")


# No clothing system: strip open-gi / cape / hanging cloth (Costume00 + threads/ring).
REMOVE_MESH_KEYS = (
    "icosphere",
    "eyetear",
    "eye_tear",
    "eyeshadow",
    "mouth00",
    # cape / open jacket / hanging cloth
    "costume00",
    "threads",
    "esf_ring",  # jacket ring ornament
    "ring",
)


def remove_junk() -> None:
    for o in list(bpy.data.objects):
        nl = o.name.lower()
        if o.type == "EMPTY" and "icosphere" in nl:
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        if o.type != "MESH":
            continue
        if any(k in nl for k in REMOVE_MESH_KEYS):
            print(f"[remove] {o.name}")
            bpy.data.objects.remove(o, do_unlink=True)


def force_primary_uv() -> None:
    for o in bpy.data.objects:
        if o.type != "MESH" or not o.data.uv_layers:
            continue
        # Prefer UVMap over UVMap.001 (detail); wrong active UV scrapes wrong atlas region
        if "UVMap" in o.data.uv_layers:
            o.data.uv_layers.active = o.data.uv_layers["UVMap"]
            try:
                o.data.uv_layers["UVMap"].active_render = True
            except Exception:
                pass


def bind_all() -> int:
    bound = 0
    for mat in bpy.data.materials:
        pack = pick_pack(mat.name)
        if not pack:
            print(f"[skip mat] {mat.name}")
            continue
        setup_principled(mat, pack)
        print(f"[bind] {mat.name} -> {pack}")
        bound += 1
    return bound


def export_glb(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # MUST export Armature + Mesh together. Mesh-only selection drops skeleton →
    # skinned meshes invisible + Mantle/Pants bone tracks spam PropertyBinding.
    bpy.ops.object.select_all(action="DESELECT")
    count_mesh = 0
    count_arm = 0
    for o in bpy.data.objects:
        if o.type in ("MESH", "ARMATURE"):
            o.select_set(True)
            if o.type == "MESH":
                count_mesh += 1
            else:
                count_arm += 1
            try:
                bpy.context.view_layer.objects.active = o
            except Exception:
                pass
    if count_arm < 1:
        print("[export] WARN: no Armature selected — skin will break")
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
    )
    print(
        f"[export] {path} bytes={path.stat().st_size if path.exists() else 0} "
        f"mesh={count_mesh} arm={count_arm}"
    )


def render_previews() -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    # frame meshes
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        print("[preview] no meshes")
        return
    # camera
    bpy.ops.object.camera_add(location=(0.0, -3.2, 1.1), rotation=(1.35, 0.0, 0.0))
    cam = bpy.context.active_object
    bpy.context.scene.camera = cam
    bpy.ops.object.light_add(type="SUN", location=(2.0, -1.0, 4.0))
    sun = bpy.context.active_object
    sun.data.energy = 3.0
    bpy.ops.object.light_add(type="AREA", location=(-2.0, -2.0, 2.5))
    area = bpy.context.active_object
    area.data.energy = 50.0

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 1024
    scene.render.film_transparent = False

    # front
    cam.location = (0.0, -3.2, 1.1)
    cam.rotation_euler = (1.35, 0.0, 0.0)
    scene.render.filepath = str(PREVIEW_DIR / "front.png")
    bpy.ops.render.render(write_still=True)
    print("[preview] front.png")

    # side
    cam.location = (3.0, 0.0, 1.1)
    cam.rotation_euler = (1.35, 0.0, 1.5708)
    scene.render.filepath = str(PREVIEW_DIR / "side.png")
    bpy.ops.render.render(write_still=True)
    print("[preview] side.png")


def main() -> None:
    mesh_path = next((p for p in MESH_CANDIDATES if p.exists()), None)
    if mesh_path is None:
        print("FAIL: no mesh glb found", file=sys.stderr)
        sys.exit(1)
    if not PREPARED.is_dir():
        print("FAIL: prepared missing", PREPARED, file=sys.stderr)
        sys.exit(1)

    print("[mesh]", mesh_path)
    clear_scene()
    import_mesh(mesh_path)
    remove_junk()
    force_primary_uv()
    n = bind_all()
    print(f"[bind] materials bound={n}")
    # Second pass: any leftover junk (importer may keep empties/helpers)
    remove_junk()
    for o in list(bpy.data.objects):
        if o.type == "MESH" and "icosphere" in o.name.lower():
            print(f"[remove-force] {o.name}")
            bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    print(
        "[scene meshes]",
        [o.name for o in bpy.data.objects if o.type == "MESH"],
    )
    export_glb(OUT_GLB)
    try:
        render_previews()
    except Exception as e:
        print("[preview] WARN", e)
    print("[done]")


if __name__ == "__main__":
    main()

bl_info = {
    "name": "RE Motlist Import",
    "author": "StreetFighter6 tools (ported from alphaZomega fmt_RE_MESH)",
    "version": (0, 2, 0),
    "blender": (4, 0, 0),
    "location": "File > Import > RE Motlist (.motlist)",
    "description": "Import RE Engine .motlist animations onto the active armature (SF6 etc.)",
    "category": "Import-Export",
}

import importlib
import sys
from pathlib import Path

import bpy
from bpy.props import (
    BoolProperty,
    EnumProperty,
    FloatProperty,
    IntProperty,
    StringProperty,
)
from bpy_extras.io_utils import ImportHelper


def _ensure_re_motlist_on_path():
    """Locate tools/re_motlist package (sibling of blender_addon/)."""
    here = Path(__file__).resolve()
    # .../tools/re_motlist/blender_addon/re_motlist_import/__init__.py
    package_root = here.parents[2]  # tools/re_motlist
    root_str = str(package_root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)
    return package_root


class IMPORT_OT_re_motlist(bpy.types.Operator, ImportHelper):
    bl_idname = "import_scene.re_motlist"
    bl_label = "Import RE Motlist"
    bl_options = {"PRESET", "UNDO"}

    filename_ext = ".653"
    filter_glob: StringProperty(default="*.motlist*;*.653;*.663;*.751;*.854", options={"HIDDEN"})

    clip_index: IntProperty(
        name="Clip Index",
        description="Which mot clip inside the motlist to import (0 = first)",
        default=0,
        min=0,
    )
    import_all_clips: BoolProperty(
        name="Import All Clips",
        description="Import every mot in the file as separate Actions (can be slow)",
        default=False,
    )
    fps: FloatProperty(name="FPS", default=60.0, min=1.0, max=240.0)
    pos_scale: FloatProperty(
        name="Position Scale",
        description="Extra scale on translation keys (decoded keys already include Noesis ×100)",
        default=1.0,
    )
    create_armature: BoolProperty(
        name="Create Armature If None",
        description="If nothing is selected, build a skeleton from the mot bone headers",
        default=True,
    )
    use_active_armature: BoolProperty(
        name="Use Active Armature",
        description="Apply animation to the active armature (RE Mesh Editor import)",
        default=True,
    )

    def draw(self, context):
        layout = self.layout
        layout.prop(self, "clip_index")
        layout.prop(self, "import_all_clips")
        layout.prop(self, "fps")
        layout.prop(self, "pos_scale")
        layout.prop(self, "use_active_armature")
        layout.prop(self, "create_armature")

    def execute(self, context):
        _ensure_re_motlist_on_path()
        from re_motlist.mot import load_motlist
        from re_motlist import blender_import as bi

        path = self.filepath
        arm = None
        if self.use_active_armature:
            obj = context.view_layer.objects.active
            if obj and obj.type == "ARMATURE":
                arm = obj
            else:
                for o in context.selected_objects:
                    if o.type == "ARMATURE":
                        arm = o
                        break

        try:
            mlist = load_motlist(path)
        except Exception as e:
            self.report({"ERROR"}, f"Failed to load motlist: {e}")
            return {"CANCELLED"}

        if not mlist.mots:
            self.report({"ERROR"}, "No mot clips in file")
            return {"CANCELLED"}

        indices = list(range(len(mlist.mots))) if self.import_all_clips else [self.clip_index]
        for idx in indices:
            if idx < 0 or idx >= len(mlist.mots):
                self.report({"ERROR"}, f"Clip index {idx} out of range")
                return {"CANCELLED"}

        # Decode all requested
        names = [mlist.mots[i].name for i in indices]
        mlist.read(names)
        mlist.make_anims(names)

        if arm is None and self.create_armature:
            arm = bi.build_armature_from_mot(mlist.mots[indices[0]], "RE_Mot_Armature")
            context.view_layer.objects.active = arm
            arm.select_set(True)

        if arm is None:
            self.report(
                {"ERROR"},
                "No armature. Select a RE Mesh armature, or enable Create Armature.",
            )
            return {"CANCELLED"}

        total_matched = 0
        for i, anim in enumerate(mlist.anims):
            mot = mlist.mots[i] if i < len(mlist.mots) else mlist.mots[0]
            if not mot.bone_headers:
                mot.read_bone_headers()
            # Noesis-style: absolute Mot on full header set (skip Root)
            ps = 0.01 if self.pos_scale == 1.0 else self.pos_scale
            action, stats = bi.apply_animation_mot_absolute_full_chain(
                arm,
                mot,
                anim,
                fps=self.fps,
                pos_scale=ps,
                skip_bones=("Root",),
            )
            total_matched += stats["matched_tracks"]
            miss = stats["missing_bones"]
            self.report(
                {"INFO"},
                f"{action.name}: tracks={stats['matched_tracks']} missing={miss} keys={stats['keys_written']}",
            )
            if stats["missing_names"]:
                print("[re_motlist] missing bones (sample):", stats["missing_names"][:15])

        self.report(
            {"INFO"},
            f"Imported {len(mlist.anims)} action(s) onto '{arm.name}' (matched tracks last batch ok)",
        )
        return {"FINISHED"}


class VIEW3D_PT_re_motlist(bpy.types.Panel):
    bl_label = "RE Motlist"
    bl_idname = "VIEW3D_PT_re_motlist"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "RE Motlist"

    def draw(self, context):
        layout = self.layout
        layout.operator("import_scene.re_motlist", icon="ARMATURE_DATA")
        layout.label(text="1. Import mesh (RE Mesh Editor)")
        layout.label(text="2. Select armature")
        layout.label(text="3. Import motlist")


def menu_func_import(self, context):
    self.layout.operator(IMPORT_OT_re_motlist.bl_idname, text="RE Motlist (.motlist)")


classes = (
    IMPORT_OT_re_motlist,
    VIEW3D_PT_re_motlist,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.TOPBAR_MT_file_import.append(menu_func_import)


def unregister():
    bpy.types.TOPBAR_MT_file_import.remove(menu_func_import)
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()

"""
RE Engine .motlist / .mot reader.

Logic ported from alphazolam/fmt_RE_MESH-Noesis-Plugin (fmt_RE_MESH.py),
stripped of Noesis GUI / FBX dependencies for native macOS use.
Authors of original research: alphaZomega, Gh0stblade, et al.
"""

from __future__ import annotations

from collections import namedtuple
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

from .bitstream import (
    BitStream,
    read_uint_at,
    read_unicode_string_at,
    skip_to_next_line,
)
from .formats import (
    DEFAULT_MESH_SCALE,
    FORMATS,
    MLST_MAGIC,
    MOT_MAGIC,
    find_game_name,
    game_from_path,
)
from .hashutil import hash_wide
from .math3d import Mat43, Quat, Quat3, Vec3, Vec4

BoneHeader = namedtuple(
    "BoneHeader", "name pos rot index parent_index hash mat"
)
BoneClipHeader = namedtuple(
    "BoneClipHeader", "bone_index track_flags bone_hash track_header_offset"
)
BoneTrack = namedtuple(
    "BoneTrack",
    "flags key_count frame_rate max_frame frame_ind_offs frame_data_offs unpack_data_offs",
)
Unpacks = namedtuple("Unpacks", "max min")
UnpackVec = namedtuple("UnpackVec", "x y z w")


@dataclass
class Bone:
    index: int
    name: str
    mat: Mat43
    parent_name: Optional[str] = None
    parent_index: int = -1

    def set_matrix(self, mat: Mat43) -> None:
        self.mat = mat

    def get_matrix(self) -> Mat43:
        return self.mat


@dataclass
class KeyFramedValue:
    time: float
    value: Any


@dataclass
class KeyFramedBone:
    bone_index: int
    translations: List[KeyFramedValue] = field(default_factory=list)
    rotations: List[KeyFramedValue] = field(default_factory=list)
    scales: List[KeyFramedValue] = field(default_factory=list)

    def has_any_keys(self) -> bool:
        return bool(self.translations or self.rotations or self.scales)


@dataclass
class Animation:
    name: str
    bones: List[Bone]
    kf_bones: List[KeyFramedBone]
    frame_count: float
    frame_rate: int


def _read_packed_bits_vec3(packed_int: int, num_bits: int) -> Vec3:
    limit = (2**num_bits) - 1
    x = ((packed_int >> 0) & limit) / limit
    y = ((packed_int >> (num_bits * 1)) & limit) / limit
    z = ((packed_int >> (num_bits * 2)) & limit) / limit
    return Vec3((x, y, z))


def _convert_bits(packed_int: int, num_bits: int) -> float:
    return packed_int / ((2**num_bits) - 1)


class MotFile:
    def __init__(
        self,
        data: bytes,
        motlist: Optional["MotlistFile"] = None,
        start: int = 0,
        motion_id: str = "",
    ):
        self.bs = BitStream(data)
        bs = self.bs
        self.start = start
        self.motlist = motlist
        self.bones: List[Bone] = []
        self.version = bs.readUInt()
        bs.seek(12)
        self.mot_size = bs.readUInt()
        self.offs_to_bone_hdr_offs = bs.readUInt64()
        self.bone_hdr_offset = 0
        self.bone_clip_hdr_offset = bs.readUInt64()
        bs.seek(8, 1)
        if self.version >= 456:
            bs.seek(8, 1)
            self.clip_file_offset = bs.readUInt64()
            self.jmap_offset = bs.readUInt64()
            self.ex_data_offset = bs.readUInt64()
            bs.seek(16, 1)
        else:
            self.jmap_offset = bs.readUInt64()
            self.clip_file_offset = bs.readUInt64()
            bs.seek(16, 1)
            self.ex_data_offset = bs.readUInt64()
        name_offs = bs.readUInt64()
        base_name = read_unicode_string_at(bs, name_offs)
        self.frame_count = bs.readFloat()
        self.name = f"{base_name} ({int(self.frame_count)} frames){motion_id}"
        self.base_name = base_name
        self.blending = bs.readFloat()
        self.ukn_float0 = bs.readFloat()
        self.ukn_float1 = bs.readFloat()
        self.bone_count = bs.readShort()
        self.bone_clip_count = bs.readShort()
        self.clip_count = bs.readByte()
        self.ukn_count = bs.readByte()
        self.frame_rate = bs.readShort()
        self.ukn_count2 = bs.readShort()
        self.ukn3 = bs.readShort()
        self.bone_headers: List[BoneHeader] = []
        self.bone_clip_headers: List[BoneClipHeader] = []
        self.bone_clips: List[Dict[str, Optional[BoneTrack]]] = []
        self.kf_bones: List[KeyFramedBone] = []
        self.do_skip = False
        self.anim: Optional[Animation] = None

    def read_frame(self, ftype: str, flags: int, unpacks: Unpacks):
        bs = self.bs
        compression = flags & 0xFF000
        scale = DEFAULT_MESH_SCALE
        def_scale = Vec3((scale, scale, scale))

        if ftype in ("pos", "scl"):
            if compression == 0x00000:
                output = Vec3((bs.readFloat(), bs.readFloat(), bs.readFloat())) * def_scale
            elif compression == 0x20000:
                raw = _read_packed_bits_vec3(bs.readUShort(), 5)
                if self.version <= 65:
                    output = (
                        Vec3(
                            (
                                unpacks.max.x * raw[0] + unpacks.min.x,
                                unpacks.max.y * raw[1] + unpacks.min.z,
                                unpacks.max.y * raw[2] + unpacks.min.z,
                            )
                        )
                        * def_scale
                    )
                else:
                    output = (
                        Vec3(
                            (
                                unpacks.max.x * raw[0] + unpacks.max.w,
                                unpacks.max.y * raw[1] + unpacks.min.x,
                                unpacks.max.z * raw[2] + unpacks.min.y,
                            )
                        )
                        * def_scale
                    )
            elif compression == 0x24000:
                v = unpacks.max.x * _convert_bits(bs.readUShort(), 16) + unpacks.min.x
                output = Vec3((v, v, v)) * def_scale
            elif compression == 0x44000:
                v = unpacks.max.x * bs.readFloat() + unpacks.min.x
                output = Vec3((v, v, v)) * def_scale
            elif compression == 0x40000 or (compression == 0x30000 and self.version <= 65):
                raw = _read_packed_bits_vec3(bs.readUInt(), 10)
                if self.version <= 65:
                    output = (
                        Vec3(
                            (
                                unpacks.max.x * raw[0] + unpacks.min.x,
                                unpacks.max.y * raw[1] + unpacks.min.y,
                                unpacks.max.z * raw[2] + unpacks.min.z,
                            )
                        )
                        * def_scale
                    )
                else:
                    output = (
                        Vec3(
                            (
                                unpacks.max.x * raw[0] + unpacks.max.w,
                                unpacks.max.y * raw[1] + unpacks.min.x,
                                unpacks.max.z * raw[2] + unpacks.min.y,
                            )
                        )
                        * def_scale
                    )
            elif compression == 0x70000:
                raw = _read_packed_bits_vec3(bs.readUInt64(), 21)
                output = (
                    Vec3(
                        (
                            unpacks.max.x * raw[0] + unpacks.min.x,
                            unpacks.max.y * raw[1] + unpacks.min.y,
                            unpacks.max.z * raw[2] + unpacks.min.z,
                        )
                    )
                    * def_scale
                )
            elif compression == 0x80000:
                raw = _read_packed_bits_vec3(bs.readUInt64(), 21)
                output = (
                    Vec3(
                        (
                            unpacks.max.x * raw[0] + unpacks.max.w,
                            unpacks.max.y * raw[1] + unpacks.min.x,
                            unpacks.max.z * raw[2] + unpacks.min.y,
                        )
                    )
                    * def_scale
                )
            elif (compression == 0x31000 and self.version <= 65) or (
                compression == 0x41000 and self.version >= 78
            ):
                output = Vec3((bs.readFloat(), unpacks.max.y, unpacks.max.z)) * def_scale
            elif (compression == 0x32000 and self.version <= 65) or (
                compression == 0x42000 and self.version >= 78
            ):
                output = Vec3((unpacks.max.x, bs.readFloat(), unpacks.max.z)) * def_scale
            elif (compression == 0x33000 and self.version <= 65) or (
                compression == 0x43000 and self.version >= 78
            ):
                output = Vec3((unpacks.max.x, unpacks.max.y, bs.readFloat())) * def_scale
            elif compression == 0x21000:
                output = (
                    Vec3(
                        (
                            unpacks.max.x * _convert_bits(bs.readUShort(), 16)
                            + unpacks.max.y,
                            unpacks.max.z,
                            unpacks.max.w,
                        )
                    )
                    * def_scale
                )
            elif compression == 0x22000:
                output = (
                    Vec3(
                        (
                            unpacks.max.y,
                            unpacks.max.x * _convert_bits(bs.readUShort(), 16)
                            + unpacks.max.z,
                            unpacks.max.w,
                        )
                    )
                    * def_scale
                )
            elif compression == 0x23000:
                output = (
                    Vec3(
                        (
                            unpacks.max.y,
                            unpacks.max.z,
                            unpacks.max.x * _convert_bits(bs.readUShort(), 16)
                            + unpacks.max.w,
                        )
                    )
                    * def_scale
                )
            else:
                output = Vec3((0, 0, 0)) if ftype == "pos" else Vec3((100, 100, 100))
            return output

        # rotation
        if compression == 0x00000:
            return Quat(
                (bs.readFloat(), bs.readFloat(), bs.readFloat(), bs.readFloat())
            ).transpose()
        if compression in (0xB0000, 0xC0000):
            return Quat3((bs.readFloat(), bs.readFloat(), bs.readFloat())).to_quat().transpose()
        if compression == 0x20000:
            raw = _read_packed_bits_vec3(bs.readUShort(), 5)
            return (
                Quat3(
                    (
                        unpacks.max.x * raw[0] + unpacks.min.x,
                        unpacks.max.y * raw[1] + unpacks.min.y,
                        unpacks.max.z * raw[2] + unpacks.min.z,
                    )
                )
                .to_quat()
                .transpose()
            )
        if compression == 0x21000:
            return (
                Quat3(
                    (
                        unpacks.max.x * _convert_bits(bs.readUShort(), 16) + unpacks.max.y,
                        0,
                        0,
                    )
                )
                .to_quat()
                .transpose()
            )
        if compression == 0x22000:
            return (
                Quat3(
                    (
                        0,
                        unpacks.max.x * _convert_bits(bs.readUShort(), 16) + unpacks.max.y,
                        0,
                    )
                )
                .to_quat()
                .transpose()
            )
        if compression == 0x23000:
            return (
                Quat3(
                    (
                        0,
                        0,
                        unpacks.max.x * _convert_bits(bs.readUShort(), 16) + unpacks.max.y,
                    )
                )
                .to_quat()
                .transpose()
            )
        if compression == 0x30000 and self.version >= 78:
            raw = [
                _convert_bits(bs.readUByte(), 8),
                _convert_bits(bs.readUByte(), 8),
                _convert_bits(bs.readUByte(), 8),
            ]
            return (
                Quat3(
                    (
                        unpacks.max.x * raw[0] + unpacks.min.x,
                        unpacks.max.y * raw[1] + unpacks.min.y,
                        unpacks.max.z * raw[2] + unpacks.min.z,
                    )
                )
                .to_quat()
                .transpose()
            )
        if compression == 0x30000:
            raw = _read_packed_bits_vec3(bs.readUInt(), 10)
            return (
                Quat3(
                    (
                        unpacks.max.x * raw[0] + unpacks.min.x,
                        unpacks.max.y * raw[1] + unpacks.min.y,
                        unpacks.max.z * raw[2] + unpacks.min.z,
                    )
                )
                .to_quat()
                .transpose()
            )
        if compression in (0x31000, 0x41000):
            return Quat3((bs.readFloat(), 0, 0)).to_quat().transpose()
        if compression in (0x32000, 0x42000):
            return Quat3((0, bs.readFloat(), 0)).to_quat().transpose()
        if compression in (0x33000, 0x43000):
            return Quat3((0, 0, bs.readFloat())).to_quat().transpose()
        if compression == 0x40000:
            raw = _read_packed_bits_vec3(bs.readUInt(), 10)
            return (
                Quat3(
                    (
                        unpacks.max.x * raw[0] + unpacks.min.x,
                        unpacks.max.y * raw[1] + unpacks.min.y,
                        unpacks.max.z * raw[2] + unpacks.min.z,
                    )
                )
                .to_quat()
                .transpose()
            )
        if compression == 0x50000 and self.version <= 65:
            raw = [
                _convert_bits(bs.readUShort(), 16),
                _convert_bits(bs.readUShort(), 16),
                _convert_bits(bs.readUShort(), 16),
            ]
            return (
                Quat3(
                    (
                        unpacks.max.x * raw[0] + unpacks.min.x,
                        unpacks.max.y * raw[1] + unpacks.min.y,
                        unpacks.max.z * raw[2] + unpacks.min.z,
                    )
                )
                .to_quat()
                .transpose()
            )
        if compression == 0x50000:
            raw_bytes = [bs.readUByte() for _ in range(5)]
            retrieved = (
                (raw_bytes[0] << 32)
                | (raw_bytes[1] << 24)
                | (raw_bytes[2] << 16)
                | (raw_bytes[3] << 8)
                | raw_bytes[4]
            )
            raw = _read_packed_bits_vec3(retrieved, 13)
            return (
                Quat3(
                    (
                        unpacks.max.x * raw[0] + unpacks.min.x,
                        unpacks.max.y * raw[1] + unpacks.min.y,
                        unpacks.max.z * raw[2] + unpacks.min.z,
                    )
                )
                .to_quat()
                .transpose()
            )
        if compression == 0x60000:
            raw = [
                _convert_bits(bs.readUShort(), 16),
                _convert_bits(bs.readUShort(), 16),
                _convert_bits(bs.readUShort(), 16),
            ]
            return (
                Quat3(
                    (
                        unpacks.max.x * raw[0] + unpacks.min.x,
                        unpacks.max.y * raw[1] + unpacks.min.y,
                        unpacks.max.z * raw[2] + unpacks.min.z,
                    )
                )
                .to_quat()
                .transpose()
            )
        if (compression == 0x70000 and self.version <= 65) or (
            compression == 0x80000 and self.version >= 78
        ):
            raw = _read_packed_bits_vec3(bs.readUInt64(), 21)
            return (
                Quat3(
                    (
                        unpacks.max.x * raw[0] + unpacks.min.x,
                        unpacks.max.y * raw[1] + unpacks.min.y,
                        unpacks.max.z * raw[2] + unpacks.min.z,
                    )
                )
                .to_quat()
                .transpose()
            )
        if compression == 0x70000 and self.version >= 78:
            raw_bytes = [bs.readUByte() for _ in range(7)]
            retrieved = (
                (raw_bytes[0] << 48)
                | (raw_bytes[1] << 40)
                | (raw_bytes[2] << 32)
                | (raw_bytes[3] << 24)
                | (raw_bytes[4] << 16)
                | (raw_bytes[5] << 8)
                | raw_bytes[6]
            )
            raw = _read_packed_bits_vec3(retrieved, 18)
            return (
                Quat3(
                    (
                        unpacks.max.x * raw[0] + unpacks.min.x,
                        unpacks.max.y * raw[1] + unpacks.min.y,
                        unpacks.max.z * raw[2] + unpacks.min.z,
                    )
                )
                .to_quat()
                .transpose()
            )
        return Quat((0, 0, 0, 1))

    def read_bone_headers(self) -> None:
        assert self.motlist is not None
        bs = self.bs
        bone_hdr_offs = 0
        if self.offs_to_bone_hdr_offs:
            bs.seek(self.offs_to_bone_hdr_offs)
            self.bone_hdr_offset = bs.readUInt64()
            count = bs.readUInt64()
            if self.bone_hdr_offset and count == self.bone_count:
                bone_hdr_offs = self.bone_hdr_offset
        if bone_hdr_offs:
            for i in range(count):
                bs.seek(self.bone_hdr_offset + 80 * i)
                bone_name = read_unicode_string_at(bs, bs.readUInt64())
                parent_offset = bs.readUInt64()
                parent_index = (
                    int((parent_offset - self.bone_hdr_offset) / 80)
                    if parent_offset
                    else -1
                )
                bs.seek(16, 1)
                translation = Vec4(
                    (bs.readFloat(), bs.readFloat(), bs.readFloat(), bs.readFloat())
                )
                quat = Quat(
                    (bs.readFloat(), bs.readFloat(), bs.readFloat(), bs.readFloat())
                ).transpose()
                index = bs.readUInt()
                bone_hash = bs.readUInt()
                mat = quat.to_mat43()
                mat[3] = translation.to_vec3() * DEFAULT_MESH_SCALE
                self.bone_headers.append(
                    BoneHeader(
                        name=bone_name,
                        pos=translation,
                        rot=quat,
                        index=index,
                        parent_index=parent_index,
                        hash=bone_hash,
                        mat=mat,
                    )
                )
            if not self.motlist.bone_headers:
                self.motlist.bone_headers = list(self.bone_headers)
        elif self.motlist.bone_headers:
            self.bone_headers = list(self.motlist.bone_headers)
        elif not self.motlist.searched_for_bone_headers:
            self.motlist.find_bone_headers()
            if self.motlist.bone_headers:
                self.bone_headers = list(self.motlist.bone_headers)
        else:
            return

        self.bones = []
        mesh_bone_names = [b.name.lower() for b in self.motlist.mesh_bones]
        motlist_bone_names = [b.name.lower() for b in self.motlist.bones]

        for bone_header in self.bone_headers:
            if (not mesh_bone_names) or (
                bone_header.name.lower() in mesh_bone_names
            ):
                parent_name = (
                    self.bone_headers[bone_header.parent_index].name
                    if bone_header.parent_index != -1
                    else None
                )
                bone = Bone(
                    index=len(self.bones),
                    name=bone_header.name,
                    mat=bone_header.mat,
                    parent_name=parent_name,
                    parent_index=bone_header.parent_index,
                )
                self.bones.append(bone)

        for bone in self.bones:
            if bone.parent_name and bone.parent_name.lower() in motlist_bone_names:
                bone.parent_index = motlist_bone_names.index(bone.parent_name.lower())
            if bone.name.lower() not in motlist_bone_names:
                bone.index = len(self.motlist.bones)
                self.motlist.bones.append(bone)
                motlist_bone_names.append(bone.name.lower())

        for b, bone in enumerate(self.bones):
            if bone.parent_index != -1 and bone.parent_name:
                if bone.parent_name.lower() in motlist_bone_names:
                    mat = self.bone_headers[b].mat
                    parent = self.motlist.bones[
                        motlist_bone_names.index(bone.parent_name.lower())
                    ]
                    bone.set_matrix(mat * parent.get_matrix())

    def read(self) -> None:
        assert self.motlist is not None
        bs = self.bs
        if not self.bone_headers:
            self.read_bone_headers()

        bn_clip_sz = (
            24 if self.version == 65 else 16 if self.version == 43 else 12
        )
        self.bone_clip_headers = []
        for i in range(self.bone_clip_count):
            bs.seek(self.bone_clip_hdr_offset + bn_clip_sz * i)
            if self.version == 65:
                index = bs.readUShort()
                track_flags = bs.readUShort()
                bone_hash = bs.readUInt()
                bs.seek(8, 1)
                track_header_offset = bs.readUInt64()
            else:
                index = bs.readUShort()
                track_flags = bs.readUShort()
                bone_hash = bs.readUInt()
                if self.version == 43:
                    track_header_offset = bs.readUInt64()
                else:
                    track_header_offset = bs.readUInt()
            self.bone_clip_headers.append(
                BoneClipHeader(
                    bone_index=index,
                    track_flags=track_flags,
                    bone_hash=bone_hash,
                    track_header_offset=track_header_offset,
                )
            )

        skip_to_next_line(bs)
        self.bone_clips = []
        for i in range(self.bone_clip_count):
            bone_clip_hdr = self.bone_clip_headers[i]
            tracks: Dict[str, Optional[BoneTrack]] = {
                "pos": None,
                "rot": None,
                "scl": None,
            }
            bs.seek(bone_clip_hdr.track_header_offset)
            for t in range(3):
                if bone_clip_hdr.track_flags & (1 << t):
                    flags = bs.readUInt()
                    key_count = bs.readUInt()
                    frame_rate = 0.0
                    max_frame = 0.0
                    if self.version >= 78:
                        frame_ind_offs = bs.readUInt()
                        frame_data_offs = bs.readUInt()
                        unpack_data_offs = bs.readUInt()
                    else:
                        frame_rate = float(bs.readUInt())
                        max_frame = bs.readFloat()
                        frame_ind_offs = bs.readUInt64()
                        frame_data_offs = bs.readUInt64()
                        unpack_data_offs = bs.readUInt64()
                    new_track = BoneTrack(
                        flags=flags,
                        key_count=key_count,
                        frame_rate=frame_rate,
                        max_frame=max_frame,
                        frame_ind_offs=frame_ind_offs,
                        frame_data_offs=frame_data_offs,
                        unpack_data_offs=unpack_data_offs,
                    )
                    if (bone_clip_hdr.track_flags & 1) and not tracks.get("pos"):
                        tracks["pos"] = new_track
                    elif (bone_clip_hdr.track_flags & (1 << 1)) and not tracks.get(
                        "rot"
                    ):
                        tracks["rot"] = new_track
                    elif (bone_clip_hdr.track_flags & (1 << 2)) and not tracks.get(
                        "scl"
                    ):
                        tracks["scl"] = new_track
            self.bone_clips.append(tracks)

        self.kf_bones = []
        for i, bone_clip in enumerate(self.bone_clips):
            motlist_bone_index = self.motlist.bone_hashes.get(
                self.bone_clip_headers[i].bone_hash
            )
            if motlist_bone_index is None:
                continue
            kf_bone = KeyFramedBone(bone_index=motlist_bone_index)
            for ftype in ("pos", "rot", "scl"):
                f_header = bone_clip.get(ftype)
                if not f_header:
                    continue
                key_compression = f_header.flags >> 20
                if key_compression == 5:
                    key_read = bs.readUInt
                elif key_compression == 2:
                    key_read = bs.readUByte
                else:
                    key_read = bs.readUShort
                bs.seek(f_header.frame_ind_offs)
                key_times = []
                for _ in range(f_header.key_count):
                    key_times.append(key_read() if f_header.frame_ind_offs else 0)
                if f_header.unpack_data_offs:
                    bs.seek(f_header.unpack_data_offs)
                    unpack_max = UnpackVec(
                        x=bs.readFloat(),
                        y=bs.readFloat(),
                        z=bs.readFloat(),
                        w=bs.readFloat(),
                    )
                    unpack_min = UnpackVec(
                        x=bs.readFloat(),
                        y=bs.readFloat(),
                        z=bs.readFloat(),
                        w=bs.readFloat(),
                    )
                else:
                    unpack_max = unpack_min = UnpackVec(0, 0, 0, 0)
                unpack_values = Unpacks(max=unpack_max, min=unpack_min)
                frames: List[KeyFramedValue] = []
                bs.seek(f_header.frame_data_offs)
                for f in range(f_header.key_count):
                    frame = self.read_frame(ftype, f_header.flags, unpack_values)
                    if ftype == "scl":
                        frame = frame / 100.0
                    frames.append(KeyFramedValue(time=float(key_times[f]), value=frame))
                if ftype == "pos":
                    kf_bone.translations = frames
                elif ftype == "rot":
                    kf_bone.rotations = frames
                else:
                    kf_bone.scales = frames
            self.kf_bones.append(kf_bone)


class MotlistFile:
    def __init__(self, data: bytes, path: str = ""):
        self.bs = BitStream(data)
        bs = self.bs
        self.path = path
        self.bones: List[Bone] = []
        self.bone_hashes: Dict[int, int] = {}
        self.bone_headers: List[BoneHeader] = []
        self.anims: List[Animation] = []
        self.mots: List[MotFile] = []
        self.mesh_bones: List[Bone] = []
        self.searched_for_bone_headers = False
        self.total_frames = 0.0
        self.version = bs.readInt()
        magic = read_uint_at(bs, 4)
        if magic != MLST_MAGIC:
            raise ValueError(
                f"Not a motlist (magic={magic:#x}, expected mlst={MLST_MAGIC:#x})"
            )
        bs.seek(16)
        pointers_offset = bs.readUInt64()
        motion_ids_offset = bs.readUInt64()
        self.name = read_unicode_string_at(bs, bs.readUInt64())
        bs.seek(8, 1)
        num_offsets = bs.readUInt()
        self.motion_ids: Dict[int, int] = {}
        self.pointers: List[int] = []

        game = find_game_name("." + str(self.version), "mlistExt")
        if not game:
            game = game_from_path(path) or "SF6"
        self.game_name = game
        fmt = FORMATS.get(game, FORMATS["SF6"])

        for i in range(num_offsets):
            if "motionIDsData" in fmt:
                bs.seek(
                    motion_ids_offset
                    + i * fmt["motionIDsData"][0]
                    + fmt["motionIDsData"][1]
                )
                self.motion_ids[i] = bs.readUShort()
            bs.seek(pointers_offset + i * 8)
            mot_address = bs.readUInt64()
            if (
                mot_address
                and mot_address not in self.pointers
                and read_uint_at(bs, mot_address + 4) == MOT_MAGIC
            ):
                self.pointers.append(mot_address)
                bs.seek(mot_address)
                remaining = bs.readBytes(bs.getSize() - bs.tell())
                mid = f" ID: {self.motion_ids[i]}" if i in self.motion_ids else ""
                self.mots.append(MotFile(remaining, self, mot_address, mid))

    def find_bone_headers(self) -> None:
        self.searched_for_bone_headers = True
        for mot in self.mots:
            mot.read_bone_headers()
            if self.bone_headers:
                break

    def read_bone_headers(self, mot_names_to_load: Optional[Sequence[str]] = None) -> None:
        self.bone_hashes = {}
        names = set(mot_names_to_load) if mot_names_to_load else None
        for mot in self.mots:
            if names is None or mot.name in names:
                mot.read_bone_headers()
        for i, bone in enumerate(self.bones):
            self.bone_hashes[hash_wide(bone.name, True)] = i

    def read(self, mot_names_to_load: Optional[Sequence[str]] = None) -> None:
        names = set(mot_names_to_load) if mot_names_to_load else None
        self.read_bone_headers(mot_names_to_load)
        for mot in self.mots:
            # Match plugin precedence: not names or (name in names and not skip)
            if names is None or (mot.name in names and not mot.do_skip):
                mot.read()

    def make_anims(self, mot_names_to_load: Optional[Sequence[str]] = None) -> None:
        names = set(mot_names_to_load) if mot_names_to_load else None
        self.anims = []
        for mot in self.mots:
            if mot.do_skip:
                continue
            if names is not None and mot.name not in names:
                continue
            mot.anim = Animation(
                name=mot.name,
                bones=self.bones,
                kf_bones=mot.kf_bones,
                frame_count=mot.frame_count,
                frame_rate=mot.frame_rate,
            )
            self.anims.append(mot.anim)
            self.total_frames += mot.frame_count


def load_motlist(path: Union[str, Path]) -> MotlistFile:
    path = Path(path)
    data = path.read_bytes()
    return MotlistFile(data, str(path))


def kf_bone_to_dict(
    kf: KeyFramedBone, bones: List[Bone], max_keys: Optional[int] = None
) -> Dict[str, Any]:
    name = bones[kf.bone_index].name if 0 <= kf.bone_index < len(bones) else "?"

    def pack(values: List[KeyFramedValue], kind: str):
        out = []
        for i, kv in enumerate(values):
            if max_keys is not None and i >= max_keys:
                break
            v = kv.value
            if kind == "rot":
                out.append({"t": kv.time, "v": list(v.as_tuple())})
            else:
                out.append({"t": kv.time, "v": list(v.as_tuple())})
        return out

    return {
        "bone": name,
        "bone_index": kf.bone_index,
        "pos_keys": len(kf.translations),
        "rot_keys": len(kf.rotations),
        "scl_keys": len(kf.scales),
        "pos": pack(kf.translations, "pos"),
        "rot": pack(kf.rotations, "rot"),
        "scl": pack(kf.scales, "scl"),
    }

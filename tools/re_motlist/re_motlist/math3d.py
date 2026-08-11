"""Lightweight 3D types used by mot decoding (NoeVec/NoeQuat stand-ins)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, List, Sequence, Tuple, Union

Number = Union[int, float]
VecLike = Sequence[float]


@dataclass
class Vec3:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def __init__(self, v: Union[VecLike, "Vec3", None] = None):
        if v is None:
            self.x = self.y = self.z = 0.0
        elif isinstance(v, Vec3):
            self.x, self.y, self.z = v.x, v.y, v.z
        else:
            self.x, self.y, self.z = float(v[0]), float(v[1]), float(v[2])

    def __getitem__(self, i: int) -> float:
        return (self.x, self.y, self.z)[i]

    def __iter__(self):
        yield self.x
        yield self.y
        yield self.z

    def __mul__(self, other: Union[Number, "Vec3"]) -> "Vec3":
        if isinstance(other, Vec3):
            return Vec3((self.x * other.x, self.y * other.y, self.z * other.z))
        return Vec3((self.x * other, self.y * other, self.z * other))

    def __rmul__(self, other: Number) -> "Vec3":
        return self.__mul__(other)

    def __truediv__(self, other: Number) -> "Vec3":
        return Vec3((self.x / other, self.y / other, self.z / other))

    def __add__(self, other: "Vec3") -> "Vec3":
        return Vec3((self.x + other.x, self.y + other.y, self.z + other.z))

    def __sub__(self, other: "Vec3") -> "Vec3":
        return Vec3((self.x - other.x, self.y - other.y, self.z - other.z))

    def as_tuple(self) -> Tuple[float, float, float]:
        return (self.x, self.y, self.z)

    def as_list(self) -> List[float]:
        return [self.x, self.y, self.z]


@dataclass
class Vec4:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    w: float = 0.0

    def __init__(self, v: Union[VecLike, "Vec4", None] = None):
        if v is None:
            self.x = self.y = self.z = self.w = 0.0
        elif isinstance(v, Vec4):
            self.x, self.y, self.z, self.w = v.x, v.y, v.z, v.w
        else:
            self.x, self.y, self.z, self.w = (
                float(v[0]),
                float(v[1]),
                float(v[2]),
                float(v[3]),
            )

    def to_vec3(self) -> Vec3:
        return Vec3((self.x, self.y, self.z))

    def as_tuple(self) -> Tuple[float, float, float, float]:
        return (self.x, self.y, self.z, self.w)


def _w_from_xyz(x: float, y: float, z: float) -> float:
    t = 1.0 - (x * x + y * y + z * z)
    return math.sqrt(t) if t > 0.0 else 0.0


class Quat3:
    """3-component rotation (xyz); w reconstructed like NoeQuat3."""

    def __init__(self, v: Union[VecLike, "Quat3", None] = None):
        if v is None:
            self.x = self.y = self.z = 0.0
        elif isinstance(v, Quat3):
            self.x, self.y, self.z = v.x, v.y, v.z
        else:
            self.x, self.y, self.z = float(v[0]), float(v[1]), float(v[2])

    def __getitem__(self, i: int) -> float:
        return (self.x, self.y, self.z)[i]

    def to_quat(self) -> "Quat":
        return Quat((self.x, self.y, self.z, _w_from_xyz(self.x, self.y, self.z)))


class Quat:
    def __init__(self, v: Union[VecLike, "Quat", None] = None):
        if v is None:
            self.x = self.y = self.z = 0.0
            self.w = 1.0
        elif isinstance(v, Quat):
            self.x, self.y, self.z, self.w = v.x, v.y, v.z, v.w
        else:
            self.x, self.y, self.z, self.w = (
                float(v[0]),
                float(v[1]),
                float(v[2]),
                float(v[3]),
            )

    def __getitem__(self, i: int) -> float:
        return (self.x, self.y, self.z, self.w)[i]

    def transpose(self) -> "Quat":
        # Noesis Quat.transpose() behaves as conjugate for handedness conversion.
        return Quat((-self.x, -self.y, -self.z, self.w))

    def as_tuple(self) -> Tuple[float, float, float, float]:
        return (self.x, self.y, self.z, self.w)

    def as_list(self) -> List[float]:
        return [self.x, self.y, self.z, self.w]

    def to_mat43(self) -> "Mat43":
        x, y, z, w = self.x, self.y, self.z, self.w
        xx, yy, zz = x * x, y * y, z * z
        xy, xz, yz = x * y, x * z, y * z
        wx, wy, wz = w * x, w * y, w * z
        # row-major 3x3 basis (NoeMat43 style rows)
        r0 = Vec3((1.0 - 2.0 * (yy + zz), 2.0 * (xy + wz), 2.0 * (xz - wy)))
        r1 = Vec3((2.0 * (xy - wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz + wx)))
        r2 = Vec3((2.0 * (xz + wy), 2.0 * (yz - wx), 1.0 - 2.0 * (xx + yy)))
        return Mat43([r0, r1, r2, Vec3((0.0, 0.0, 0.0))])


class Mat43:
    """4 rows of Vec3: three axes + translation (NoeMat43-like)."""

    def __init__(self, rows: Iterable[Vec3] | None = None):
        if rows is None:
            self.rows = [
                Vec3((1, 0, 0)),
                Vec3((0, 1, 0)),
                Vec3((0, 0, 1)),
                Vec3((0, 0, 0)),
            ]
        else:
            self.rows = [Vec3(r) for r in rows]

    def __getitem__(self, i: int) -> Vec3:
        return self.rows[i]

    def __setitem__(self, i: int, value: Vec3) -> None:
        self.rows[i] = Vec3(value)

    def __mul__(self, other: "Mat43") -> "Mat43":
        # Multiply as 4x4 affine with last column [0,0,0,1]
        a = self
        b = other

        def bas(m: "Mat43", r: int, c: int) -> float:
            return m.rows[r][c]

        out_basis = []
        for r in range(3):
            out_basis.append(
                Vec3(
                    (
                        bas(a, r, 0) * bas(b, 0, 0)
                        + bas(a, r, 1) * bas(b, 1, 0)
                        + bas(a, r, 2) * bas(b, 2, 0),
                        bas(a, r, 0) * bas(b, 0, 1)
                        + bas(a, r, 1) * bas(b, 1, 1)
                        + bas(a, r, 2) * bas(b, 2, 1),
                        bas(a, r, 0) * bas(b, 0, 2)
                        + bas(a, r, 1) * bas(b, 1, 2)
                        + bas(a, r, 2) * bas(b, 2, 2),
                    )
                )
            )
        # translation = a.rot * b.trans + a.trans
        bt = b.rows[3]
        at = a.rows[3]
        trans = Vec3(
            (
                bas(a, 0, 0) * bt.x + bas(a, 0, 1) * bt.y + bas(a, 0, 2) * bt.z + at.x,
                bas(a, 1, 0) * bt.x + bas(a, 1, 1) * bt.y + bas(a, 1, 2) * bt.z + at.y,
                bas(a, 2, 0) * bt.x + bas(a, 2, 1) * bt.y + bas(a, 2, 2) * bt.z + at.z,
            )
        )
        return Mat43(out_basis + [trans])

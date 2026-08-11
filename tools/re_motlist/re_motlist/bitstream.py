"""Minimal NoeBitStream-compatible reader (little-endian)."""

from __future__ import annotations

import struct
from typing import BinaryIO, Union


class BitStream:
    def __init__(self, data: Union[bytes, bytearray, memoryview]):
        if isinstance(data, memoryview):
            self._data = data.tobytes()
        else:
            self._data = bytes(data)
        self._pos = 0
        self._size = len(self._data)

    def getSize(self) -> int:
        return self._size

    def tell(self) -> int:
        return self._pos

    def seek(self, addr: int, whence: int = 0) -> int:
        if whence == 0:
            self._pos = addr
        elif whence == 1:
            self._pos += addr
        elif whence == 2:
            self._pos = self._size + addr
        else:
            raise ValueError(f"invalid whence: {whence}")
        return self._pos

    def _read(self, fmt: str):
        size = struct.calcsize(fmt)
        if self._pos + size > self._size:
            raise EOFError(
                f"read past end: need {size} at {self._pos}, size={self._size}"
            )
        value = struct.unpack_from(fmt, self._data, self._pos)
        self._pos += size
        return value[0] if len(value) == 1 else value

    def readBytes(self, n: int) -> bytes:
        if self._pos + n > self._size:
            raise EOFError(
                f"readBytes past end: need {n} at {self._pos}, size={self._size}"
            )
        out = self._data[self._pos : self._pos + n]
        self._pos += n
        return out

    def readByte(self) -> int:
        return self._read("<b")

    def readUByte(self) -> int:
        return self._read("<B")

    def readShort(self) -> int:
        return self._read("<h")

    def readUShort(self) -> int:
        return self._read("<H")

    def readInt(self) -> int:
        return self._read("<i")

    def readUInt(self) -> int:
        return self._read("<I")

    def readInt64(self) -> int:
        return self._read("<q")

    def readUInt64(self) -> int:
        return self._read("<Q")

    def readFloat(self) -> float:
        return self._read("<f")

    def readDouble(self) -> float:
        return self._read("<d")


def read_uint_at(bs: BitStream, at: int) -> int:
    pos = bs.tell()
    bs.seek(at)
    value = bs.readUInt()
    bs.seek(pos)
    return value


def read_ushort_at(bs: BitStream, at: int) -> int:
    pos = bs.tell()
    bs.seek(at)
    value = bs.readUShort()
    bs.seek(pos)
    return value


def read_unicode_string_at(bs: BitStream, at: int) -> str:
    """UTF-16LE null-terminated string (matches fmt_RE_MESH.readUnicodeStringAt)."""
    if not at:
        return ""
    chars = []
    pos = bs.tell()
    bs.seek(at)
    while read_ushort_at(bs, bs.tell()) != 0:
        chars.append(bs.readByte())
        bs.seek(1, 1)
    bs.seek(pos)
    if not chars:
        return ""
    return struct.pack("<" + "b" * len(chars), *chars).decode("utf-8", errors="replace")


def skip_to_next_line(bs: BitStream) -> None:
    rem = bs.tell() % 16
    if rem:
        bs.seek(bs.tell() + (16 - rem))

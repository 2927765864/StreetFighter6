"""MurmurHash3 32-bit (alphaZomega / Darkness adaptation) for bone name hashes."""

from __future__ import annotations


def murmur3_32(key: str, get_unsigned: bool = False) -> int:
    seed = 0xFFFFFFFF
    data = bytearray(key, "utf8")

    def fmix(h: int) -> int:
        h ^= h >> 16
        h = (h * 0x85EBCA6B) & 0xFFFFFFFF
        h ^= h >> 13
        h = (h * 0xC2B2AE35) & 0xFFFFFFFF
        h ^= h >> 16
        return h

    length = len(data)
    nblocks = length // 4
    h1 = seed
    c1 = 0xCC9E2D51
    c2 = 0x1B873593

    for block_start in range(0, nblocks * 4, 4):
        k1 = (
            data[block_start + 3] << 24
            | data[block_start + 2] << 16
            | data[block_start + 1] << 8
            | data[block_start + 0]
        )
        k1 = (c1 * k1) & 0xFFFFFFFF
        k1 = (k1 << 15 | k1 >> 17) & 0xFFFFFFFF
        k1 = (c2 * k1) & 0xFFFFFFFF
        h1 ^= k1
        h1 = (h1 << 13 | h1 >> 19) & 0xFFFFFFFF
        h1 = (h1 * 5 + 0xE6546B64) & 0xFFFFFFFF

    tail_index = nblocks * 4
    k1 = 0
    tail_size = length & 3
    if tail_size >= 3:
        k1 ^= data[tail_index + 2] << 16
    if tail_size >= 2:
        k1 ^= data[tail_index + 1] << 8
    if tail_size >= 1:
        k1 ^= data[tail_index + 0]
    if tail_size > 0:
        k1 = (k1 * c1) & 0xFFFFFFFF
        k1 = (k1 << 15 | k1 >> 17) & 0xFFFFFFFF
        k1 = (k1 * c2) & 0xFFFFFFFF
        h1 ^= k1

    unsigned_val = fmix(h1 ^ length)
    if get_unsigned or (unsigned_val & 0x80000000) == 0:
        return unsigned_val
    return -((unsigned_val ^ 0xFFFFFFFF) + 1)


def hash_wide(key: str, get_unsigned: bool = False) -> int:
    """UTF-16LE-style wide char hashing used by RE Engine bone hashes."""
    key_temp = "".join(ch + "\x00" for ch in key)
    return murmur3_32(key_temp, get_unsigned)

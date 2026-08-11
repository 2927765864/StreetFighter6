"""Pure-Python RE Engine motlist reader (Mac-native Noesis alternative PoC)."""

from .mot import Animation, KeyFramedBone, MotFile, MotlistFile, load_motlist

__all__ = [
    "Animation",
    "KeyFramedBone",
    "MotFile",
    "MotlistFile",
    "load_motlist",
]
__version__ = "0.2.0"

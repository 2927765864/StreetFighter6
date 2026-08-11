"""RE Engine format extension map (subset needed for motlist)."""

from __future__ import annotations

from typing import Any, Dict, Optional

# Ported from alphazolam/fmt_RE_MESH-Noesis-Plugin formats table.
FORMATS: Dict[str, Dict[str, Any]] = {
    "RE7": {"mlistExt": ".60"},
    "RE2": {"mlistExt": ".85", "motionIDsData": [24, 8]},
    "DMC5": {"mlistExt": ".85", "motionIDsData": [24, 8]},
    "RE3": {"mlistExt": ".99", "motionIDsData": [24, 8]},
    "RE8": {"mlistExt": ".486", "motionIDsData": [24, 8]},
    "MHRise": {"mlistExt": ".484", "motionIDsData": [72, 8]},
    "MHRSunbreak": {"mlistExt": ".528", "motionIDsData": [72, 8]},
    "ReVerse": {"mlistExt": ".500", "motionIDsData": [24, 8]},
    "RERT": {"mlistExt": ".524", "motionIDsData": [72, 8]},
    "RE7RT": {"mlistExt": ".524", "motionIDsData": [72, 8]},
    "SF6": {"mlistExt": ".653", "motionIDsData": [72, 8]},
    "ExoPrimal": {"mlistExt": ".643", "motionIDsData": [72, 8]},
    "RE4": {"mlistExt": ".663", "motionIDsData": [72, 8]},
    "AJ_AAT": {"mlistExt": ".750", "motionIDsData": [72, 8]},
    "DD2": {"mlistExt": ".751", "motionIDsData": [72, 8]},
    "DRDR": {"mlistExt": ".854", "motionIDsData": [72, 8]},
}

# Matches fmt_RE_MESH fDefaultMeshScale (positions scaled by this).
DEFAULT_MESH_SCALE = 100.0

MOT_MAGIC = 544501613  # b'mot\x00' as little-endian uint
MLST_MAGIC = 1953721453  # b'mlst'


def find_game_name(number: str, formats_key: str = "mlistExt") -> Optional[str]:
    for game_name, dictionary in FORMATS.items():
        if dictionary.get(formats_key) == number:
            return game_name
    return None


def game_from_path(path: str) -> Optional[str]:
    lower = path.lower()
    for game, info in FORMATS.items():
        ext = info["mlistExt"]
        if lower.endswith(ext) or f".motlist{ext}" in lower:
            return game
    # versioned names like .motlist.653
    if ".motlist." in lower:
        ver = lower.rsplit(".", 1)[-1]
        return find_game_name("." + ver, "mlistExt")
    return None

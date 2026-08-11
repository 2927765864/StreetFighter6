#!/usr/bin/env python3
"""Inspect a RE Engine .motlist file and optionally dump JSON sample keys.

Usage:
  python scripts/inspect_motlist.py /path/to/file.motlist.653
  python scripts/inspect_motlist.py idle.motlist.653 --dump-json out/idle.json --max-keys 3
  python scripts/inspect_motlist.py idle.motlist.653 --clip-index 0 --limit-clips 1
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow running without install: tools/re_motlist on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from re_motlist.mot import kf_bone_to_dict, load_motlist  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Inspect RE Engine motlist (SF6 etc.)")
    ap.add_argument("path", type=Path, help="Path to .motlist.* file")
    ap.add_argument(
        "--clip-index",
        type=int,
        default=None,
        help="Only fully decode this clip index (0-based)",
    )
    ap.add_argument(
        "--limit-clips",
        type=int,
        default=None,
        help="Only fully decode the first N clips",
    )
    ap.add_argument(
        "--dump-json",
        type=Path,
        default=None,
        help="Write decoded animation summary JSON here",
    )
    ap.add_argument(
        "--max-keys",
        type=int,
        default=5,
        help="Max keyframes per channel to include in JSON (default 5)",
    )
    ap.add_argument(
        "--list-only",
        action="store_true",
        help="Only list clip headers, do not decode tracks",
    )
    args = ap.parse_args()

    path = args.path.expanduser().resolve()
    if not path.is_file():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        return 1

    print(f"Loading: {path}")
    print(f"Size:    {path.stat().st_size:,} bytes")
    mlist = load_motlist(path)

    print(f"Game:    {mlist.game_name} (motlist version {mlist.version})")
    print(f"Name:    {mlist.name}")
    print(f"Clips:   {len(mlist.mots)} mot entries (pointers={len(mlist.pointers)})")
    print()

    for i, mot in enumerate(mlist.mots):
        mid = mlist.motion_ids.get(i, "?")
        print(
            f"  [{i:3d}] mid={mid!s:>6}  ver={mot.version}  "
            f"frames={mot.frame_count:7.1f}  fps={mot.frame_rate}  "
            f"bones={mot.bone_count}  boneClips={mot.bone_clip_count}  "
            f"{mot.base_name}"
        )

    if args.list_only:
        return 0

    # Select which clips to fully decode
    indices = list(range(len(mlist.mots)))
    if args.clip_index is not None:
        indices = [args.clip_index]
    elif args.limit_clips is not None:
        indices = indices[: args.limit_clips]

    names_to_load = [mlist.mots[i].name for i in indices]
    print()
    print(f"Decoding {len(names_to_load)} clip(s)...")
    mlist.read(names_to_load)
    mlist.make_anims(names_to_load)

    print(f"Skeleton bones collected: {len(mlist.bones)}")
    for b in mlist.bones[:20]:
        print(f"  bone[{b.index:3d}] parent={b.parent_index:3d}  {b.name}")
    if len(mlist.bones) > 20:
        print(f"  ... +{len(mlist.bones) - 20} more")

    print()
    for anim in mlist.anims:
        n_pos = sum(1 for k in anim.kf_bones if k.translations)
        n_rot = sum(1 for k in anim.kf_bones if k.rotations)
        n_scl = sum(1 for k in anim.kf_bones if k.scales)
        total_keys = sum(
            len(k.translations) + len(k.rotations) + len(k.scales)
            for k in anim.kf_bones
        )
        print(
            f"Anim: {anim.name}\n"
            f"  kfBones={len(anim.kf_bones)}  "
            f"(posTracks={n_pos} rotTracks={n_rot} sclTracks={n_scl})  "
            f"totalKeys={total_keys}"
        )

    if args.dump_json:
        payload = {
            "source": str(path),
            "game": mlist.game_name,
            "motlist_name": mlist.name,
            "version": mlist.version,
            "bones": [
                {
                    "index": b.index,
                    "name": b.name,
                    "parent_index": b.parent_index,
                    "parent_name": b.parent_name,
                }
                for b in mlist.bones
            ],
            "animations": [],
        }
        for anim in mlist.anims:
            payload["animations"].append(
                {
                    "name": anim.name,
                    "frame_count": anim.frame_count,
                    "frame_rate": anim.frame_rate,
                    "tracks": [
                        kf_bone_to_dict(kf, mlist.bones, max_keys=args.max_keys)
                        for kf in anim.kf_bones
                    ],
                }
            )
        args.dump_json.parent.mkdir(parents=True, exist_ok=True)
        args.dump_json.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(f"\nWrote JSON: {args.dump_json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

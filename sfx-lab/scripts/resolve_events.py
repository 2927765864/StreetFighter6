#!/usr/bin/env python3
"""Run wwiser on configured banks and merge Event→WEM labels into catalogs.

Usage (from sfx-lab/):
  python3 scripts/resolve_events.py
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

LAB = Path(__file__).resolve().parents[1]
TOOLS = LAB / "tools" / "wwiser"
WWISER_PY = TOOLS / "wwiser-src" / "wwiser.py"
SF6_NAMES = TOOLS / "wwiser-utils" / "wwnames" / "Street Fighter 6 (PS4).txt"
WORK = LAB / "work" / "wwiser"
BANKS_DIR = WORK / "banks"
TXTP_DIR = BANKS_DIR / "txtp"
CFG = json.loads((LAB / "scripts" / "config.json").read_text())


def fnv(s: str) -> int:
    h = 2166136261
    for c in s.lower().encode("ascii"):
        h = (h * 16777619) & 0xFFFFFFFF
        h ^= c
    return h


def ensure_tools() -> None:
    if not WWISER_PY.exists():
        print("Missing wwiser. Clone into sfx-lab/tools/wwiser/wwiser-src", file=sys.stderr)
        sys.exit(1)
    if not SF6_NAMES.exists():
        print("Missing SF6 wwnames list", file=sys.stderr)
        sys.exit(1)


def prepare_banks() -> None:
    if BANKS_DIR.exists():
        shutil.rmtree(BANKS_DIR)
    BANKS_DIR.mkdir(parents=True)
    wwise = Path(CFG["wwiseDir"])
    seeds = [SF6_NAMES]
    for extra in ("Resident Evil 4 (PC).txt", "Devil May Cry 5 (PC).txt"):
        p = TOOLS / "wwiser-utils" / "wwnames" / extra
        if p.exists():
            seeds.append(p)
    wwnames = BANKS_DIR / "wwnames.txt"
    with wwnames.open("w") as out:
        for p in seeds:
            out.write(p.read_text())
            out.write("\n")
    # harvest local strings if present
    local = BANKS_DIR / "sf6_strings.txt"
    # keep previous harvest if exists under work
    prev = WORK / "banks_prev_sf6_strings.txt"
    harvested = LAB / "work" / "wwiser" / "sf6_strings_cache.txt"
    # Prefer cache written by earlier harvest next to scripts output
    for cand in (
        LAB / "work" / "wwiser" / "banks" / "sf6_strings.txt",
        LAB / "work" / "wwiser" / "sf6_strings_cache.txt",
    ):
        if cand.exists():
            with wwnames.open("a") as out:
                out.write(cand.read_text())
            break

    files = ["init.sbnk.1.x64"]
    for b in CFG.get("banks", []):
        stem = b["file"].replace("_m.sbnk.1.x64", "")
        files.append(f"{stem}_es.sbnk.1.x64")
        files.append(b["file"])
    for f in files:
        src = wwise / f
        if not src.exists():
            print("skip missing", src)
            continue
        (BANKS_DIR / f.replace(".sbnk.1.x64", ".bnk")).symlink_to(src)


def run_wwiser() -> Path:
    cmd = [
        sys.executable,
        str(WWISER_PY),
        "*.bnk",
        "-g",
        "-go",
        "txtp",
        "-sl",
        "-d",
        "none",
    ]
    print("running:", " ".join(cmd))
    subprocess.run(cmd, cwd=BANKS_DIR, check=True)
    names = sorted(BANKS_DIR.glob("wwnames-banks-*.txt"))
    if not names:
        raise SystemExit("wwiser did not write wwnames-banks-*.txt")
    return names[-1]


def build_index(names_file: Path) -> dict:
    text = names_file.read_text()
    name_to_id: dict[str, int] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("###"):
            continue
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", line):
            name_to_id[line] = fnv(line)
    if SF6_NAMES.exists():
        for line in SF6_NAMES.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", line):
                name_to_id.setdefault(line, fnv(line))

    id_to_name: dict[int, str] = {}
    for n, i in name_to_id.items():
        old = id_to_name.get(i)
        if old is None:
            id_to_name[i] = n
        else:
            def score(x: str) -> tuple:
                return (x.lower().startswith("play_") or x.lower().startswith("stop_"), len(x))

            if score(n) > score(old):
                id_to_name[i] = n

    events = []
    by_wem: dict[str, list] = defaultdict(list)
    for f in sorted(TXTP_DIR.glob("*.txtp")):
        body = f.read_text(errors="ignore")
        m = re.search(r"CAkEvent\[\d+\]\s+(\d+)", body)
        event_id = int(m.group(1)) if m else None
        wems = sorted(
            set(int(x) for x in re.findall(r"(\d+)\.wem", body))
            | set(int(x) for x in re.findall(r"Source\s+(\d+)", body))
        )
        label = f.stem
        bank = label.split("-")[0] if "-" in label else ""
        switches = re.findall(r"\[([^\]]+)\]", label)
        resolved = id_to_name.get(event_id) if event_id is not None else None
        resolved_switches = []
        for sw in switches:
            if "=" in sw:
                k, v = sw.split("=", 1)
                if k.isdigit():
                    resolved_switches.append(f"{id_to_name.get(int(k), k)}={v}")
                elif v.isdigit():
                    resolved_switches.append(f"{k}={id_to_name.get(int(v), v)}")
                else:
                    resolved_switches.append(sw)
            else:
                resolved_switches.append(sw)
        resolved_switches = list(dict.fromkeys(resolved_switches))
        display = resolved or label
        if resolved_switches:
            display += " [" + ", ".join(resolved_switches) + "]"
        rec = {
            "eventId": event_id,
            "label": label,
            "bank": bank,
            "switches": resolved_switches,
            "wems": wems,
            "txtp": f.name,
            "resolvedName": resolved,
            "display": display,
        }
        events.append(rec)
        for wid in wems:
            by_wem[str(wid)].append(
                {
                    "eventId": event_id,
                    "display": display,
                    "resolvedName": resolved,
                    "bank": bank,
                    "txtp": f.name,
                    "switches": resolved_switches,
                }
            )

    idx = {
        "events": events,
        "byWem": by_wem,
        "idToName": {str(k): v for k, v in id_to_name.items()},
        "namesFile": str(names_file),
    }
    (WORK / "events_index.json").write_text(json.dumps(idx, indent=2))
    named = sum(1 for e in events if e.get("resolvedName"))
    print(f"events={len(events)} named={named} wems={len(by_wem)}")
    return idx


def merge_catalogs(idx: dict) -> None:
    bank_map = {
        "esf001_sfx_cmn_es": "esf001_sfx_cmn_m",
        "battle_cmn_es": "battle_cmn_m",
        "act_cmn_es": "act_cmn_m",
        "dmg_human_es": "dmg_human_m",
        "dmg_cmn_es": "dmg_cmn_m",
        "down_human_es": "down_human_m",
    }
    by_wem = idx["byWem"]
    for catp in (LAB / "work" / "banks").glob("*/catalog.json"):
        c = json.loads(catp.read_text())
        bank_id = c.get("bankId") or catp.parent.name
        for e in c["entries"]:
            infos = by_wem.get(str(e["wemId"]), [])
            preferred = [
                x
                for x in infos
                if bank_map.get(x.get("bank") or "", "") == bank_id
                or (x.get("bank") or "").startswith(bank_id.replace("_m", ""))
            ]
            use = preferred or infos
            e["events"] = [
                {
                    "eventId": x.get("eventId"),
                    "name": x.get("resolvedName"),
                    "display": x.get("display"),
                    "switches": x.get("switches") or [],
                }
                for x in use
            ]
            if use:
                named = [x for x in use if x.get("resolvedName")]
                e["eventLabel"] = (named or use)[0].get("display")
            else:
                e["eventLabel"] = None
        catp.write_text(json.dumps(c, indent=2))
        labeled = sum(1 for e in c["entries"] if e.get("eventLabel"))
        named_n = sum(1 for e in c["entries"] if any(ev.get("name") for ev in e.get("events") or []))
        print(f"{bank_id}: labeled {labeled}/{c['count']} resolvedName {named_n}")


def main() -> None:
    ensure_tools()
    WORK.mkdir(parents=True, exist_ok=True)
    prepare_banks()
    names_file = run_wwiser()
    idx = build_index(names_file)
    merge_catalogs(idx)
    print("done → work/wwiser/events_index.json + catalogs eventLabel")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Ryu texture prepare pipeline (consensus character-art + execution plan A0–A4).
Source interim textures are READ-ONLY.
"""
from __future__ import annotations

import csv
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# --- constants (execution plan §2 script constants) ---
FLIP_Y = False
RESIZE_FILTER = Image.Resampling.LANCZOS
# Offline dye: preserve albd luminance (wrinkles), lift toward costume colors.
DYE_CLOTH_WHITE = (1.0, 1.0, 0.98)  # multipliers on luminance
DYE_CLOTH_ACCENT = (0.55, 0.12, 0.10)
DYE_HEADBAND = (0.95, 0.08, 0.06)
DYE_STRENGTH_B = 0.92
DYE_STRENGTH_R = 0.65
DYE_LIFT = 1.35  # brighten dyed cloth toward classic white gi
HAIR_MULTIPLY_RGB = (0.18, 0.14, 0.12)
# NRRC alpha is often smoothness-like; store inverted roughness for glTF.
INVERT_ROUGHNESS = True
ATOS_MIN_STDDEV = 8.0
MAIN_TEX_SIZE = 1024
EYE_TEX_SIZE = 512

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "private/interim/characters/SF6 Ryu Model/SF6 Ryu textures"
OUT = ROOT / "private/runtime/ryu/textures/prepared"
WORK = OUT / "_work"
PREVIEW = OUT / "_preview"

DEFERRED_SUBSTR = (
    "dmgmask",
    "sweat",
    "smaskout",
    "eyeshadow",
    "facialblend",
    "facialwrinkle",
)


def part_of(name: str) -> str:
    n = name.lower()
    if "clotha" in n:
        return "clotha"
    if "clothb" in n:
        return "clothb"
    if "hair" in n:
        return "hair"
    if "eye" in n and "shadow" not in n:
        return "eye"
    if "head" in n or "face" in n or "mouth" in n:
        return "head"
    if "body" in n or n.startswith("bdm_"):
        return "body"
    if n.startswith("fdm_"):
        return "head"
    if n.startswith("cdm_") or n.startswith("ldm_") or n.startswith("cmn"):
        return "shared"
    if "esf003" in n:
        return "eye"
    return "unknown"


def kind_of(name: str) -> str:
    n = name.lower()
    if "albd" in n or "alba" in n:
        return "color"
    if "nrrc" in n:
        return "packed_bump"
    if "atos" in n:
        return "packed_atos"
    if "cmask" in n:
        return "dye_mask"
    if "dmg" in n:
        return "damage"
    if "sweat" in n or "smask" in n:
        return "sweat"
    if "dmask" in n or "msk4" in n or "msk" in n:
        return "other_mask"
    if n.endswith(".dds"):
        return "dds_special"
    return "other"


def is_deferred(name: str) -> bool:
    n = name.lower()
    if any(s in n for s in DEFERRED_SUBSTR):
        return True
    if n.startswith("cdm_") or n.startswith("ldm_"):
        return True
    if "esf003" in n:
        return True  # wrong character id — deferred with reason
    return False


def ensure_dirs() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)


def load_rgba(path: Path) -> Image.Image:
    im = Image.open(path)
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    return im


def resize_max(im: Image.Image, max_edge: int) -> Image.Image:
    w, h = im.size
    m = max(w, h)
    if m <= max_edge:
        return im
    scale = max_edge / m
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    return im.resize((nw, nh), RESIZE_FILTER)


def nrrc_is_flat(im: Image.Image, min_std: float = 3.0) -> bool:
    """True if R/G carry no variation (e.g. eye nrrc is constant → broken normals)."""
    arr = np.asarray(im.convert("RGBA"), dtype=np.float32)
    return float(arr[..., 0].std()) < min_std and float(arr[..., 1].std()) < min_std


def nrrc_to_bump_rough(im: Image.Image, flip_y: bool = FLIP_Y) -> tuple[Image.Image, Image.Image]:
    arr = np.asarray(im.convert("RGBA"), dtype=np.float32)
    r, g, a = arr[..., 0], arr[..., 1], arr[..., 3]
    nx = r / 255.0 * 2.0 - 1.0
    ny = g / 255.0 * 2.0 - 1.0
    if flip_y:
        ny = -ny
    nz2 = 1.0 - nx * nx - ny * ny
    bad = nz2 < 0.0
    length = np.sqrt(nx * nx + ny * ny) + 1e-8
    nx = np.where(bad, nx / length, nx)
    ny = np.where(bad, ny / length, ny)
    nz = np.where(bad, 0.0, np.sqrt(np.maximum(nz2, 0.0)))
    out = np.empty((*arr.shape[:2], 3), dtype=np.uint8)
    out[..., 0] = np.clip((nx * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    out[..., 1] = np.clip((ny * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    out[..., 2] = np.clip((nz * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    # Invert alpha → roughness when pack stores gloss/smoothness (common RE).
    rough_f = (255.0 - a) if INVERT_ROUGHNESS else a
    # Bias toward fabric roughness (avoid chrome look)
    rough_f = np.clip(rough_f * 0.85 + 40.0, 0, 255)
    rough = rough_f.astype(np.uint8)
    return Image.fromarray(out, "RGB"), Image.fromarray(rough, "L")


def channel_stddev(im: Image.Image, ch: int) -> float:
    arr = np.asarray(im.convert("RGBA"), dtype=np.float32)[..., ch]
    # subsample for speed
    sample = arr[::4, ::4].ravel()
    if sample.size == 0:
        return 0.0
    return float(sample.std())


def _luma(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    return 0.299 * r + 0.587 * g + 0.114 * b


def dye_cloth(albd: Image.Image, cmask: Image.Image | None) -> Image.Image:
    """Luminance-preserving dye toward white gi + accent (cmask B/R)."""
    base = np.asarray(albd.convert("RGBA"), dtype=np.float32)
    r, g, b, a = base[..., 0], base[..., 1], base[..., 2], base[..., 3]
    lum = np.clip(_luma(r, g, b) * DYE_LIFT, 0, 255)
    wb = np.zeros_like(r)
    wr = np.zeros_like(r)
    if cmask is not None:
        cm = np.asarray(
            cmask.convert("RGBA").resize(albd.size, RESIZE_FILTER), dtype=np.float32
        )
        wb = np.clip(cm[..., 2] / 255.0, 0, 1) * DYE_STRENGTH_B
        wr = np.clip(cm[..., 0] / 255.0, 0, 1) * DYE_STRENGTH_R
    # Soft lift only where fabric is neutral-gray (avoid washing printed patterns).
    soft = 0.28
    neutral = (
        (np.abs(r - g) < 18)
        & (np.abs(g - b) < 18)
        & (np.abs(r - b) < 18)
        & (a > 20)
    ).astype(np.float32)
    tw, tg, tb = DYE_CLOTH_WHITE
    white_t = np.stack([lum * tw, lum * tg, lum * tb], axis=-1)
    ar, ag, ab = DYE_CLOTH_ACCENT
    accent_t = np.stack([lum * ar, lum * ag, lum * ab], axis=-1)
    src = np.stack([r, g, b], axis=-1)
    w_body = np.clip(wb + soft * neutral * (1.0 - wr), 0, 1)[..., None]
    out_rgb = src * (1.0 - w_body) + white_t * w_body
    w_acc = wr[..., None]
    out_rgb = out_rgb * (1.0 - w_acc) + accent_t * w_acc
    out = np.concatenate([out_rgb, a[..., None]], axis=-1)
    out[a < 8] = base[a < 8]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def make_headband_color(clotha_final: Image.Image) -> Image.Image:
    """Classic Ryu red hachimaki from clotha UV (HeadBand shares clotha set)."""
    arr = np.asarray(clotha_final.convert("RGBA"), dtype=np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    lum = np.clip(_luma(r, g, b) * 1.15, 0, 255)
    hr, hg, hb = DYE_HEADBAND
    out = np.stack([lum * hr, lum * hg, lum * hb, a], axis=-1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def darken_hair(albd: Image.Image) -> Image.Image:
    arr = np.asarray(albd.convert("RGBA"), dtype=np.float32)
    mr, mg, mb = HAIR_MULTIPLY_RGB
    arr[..., 0] *= mr
    arr[..., 1] *= mg
    arr[..., 2] *= mb
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def punch_atlas_black_alpha(im: Image.Image, thr: float = 14.0) -> Image.Image:
    """Empty atlas texels (near-black) → transparent so cape/gi edges don't show black cards."""
    arr = np.asarray(im.convert("RGBA"), dtype=np.float32)
    lum = arr[..., :3].max(axis=2)
    empty = lum <= thr
    arr[empty, 3] = 0.0
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def brighten_rgb(im: Image.Image, gain: float) -> Image.Image:
    arr = np.asarray(im.convert("RGBA"), dtype=np.float32)
    arr[..., :3] = np.clip(arr[..., :3] * gain, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def multiply_ao_into_color(
    color: Image.Image, ao: Image.Image, strength: float = 0.35
) -> Image.Image:
    """Soft cavity shading: color *= lerp(1, ao, strength). strength 0.3–0.4 is safe."""
    c = np.asarray(color.convert("RGBA"), dtype=np.float32)
    a = np.asarray(ao.convert("L").resize(color.size, RESIZE_FILTER), dtype=np.float32) / 255.0
    # ao may be inverted already; treat mid-gray as neutral
    factor = (1.0 - strength) + strength * a
    c[..., 0] *= factor
    c[..., 1] *= factor
    c[..., 2] *= factor
    return Image.fromarray(np.clip(c, 0, 255).astype(np.uint8), "RGBA")


def blend_bump_detail(
    base: Image.Image, detail: Image.Image, amount: float = 0.35
) -> Image.Image:
    """Blend detail normals in RGB space (approx). amount 0.3–0.4."""
    b = np.asarray(base.convert("RGB"), dtype=np.float32) / 255.0 * 2.0 - 1.0
    d = np.asarray(
        detail.convert("RGB").resize(base.size, RESIZE_FILTER), dtype=np.float32
    ) / 255.0 * 2.0 - 1.0
    # reoriented normal blend (UDN-ish)
    n = b + np.array([0, 0, 1.0], dtype=np.float32) * 0 + d * amount
    n[..., 0] = b[..., 0] + d[..., 0] * amount
    n[..., 1] = b[..., 1] + d[..., 1] * amount
    n[..., 2] = b[..., 2]
    length = np.linalg.norm(n, axis=2, keepdims=True) + 1e-8
    n = n / length
    out = np.clip((n * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGB")


def try_dds_to_png(src: Path, dst: Path) -> tuple[bool, str]:
    try:
        im = load_rgba(src)
        im.save(dst, format="PNG")
        return True, f"pillow ok size={im.size}"
    except Exception as e:
        return False, f"pillow fail: {e}"


def main() -> int:
    if not SRC.is_dir():
        print("FAIL: source missing", SRC, file=sys.stderr)
        return 1
    ensure_dirs()
    sources = sorted(SRC.iterdir(), key=lambda p: p.name.lower())
    sources = [p for p in sources if p.is_file()]

    rows: list[dict[str, str]] = []
    rid = 0

    # index useful sources by part+kind
    by_key: dict[tuple[str, str], Path] = {}

    for src in sources:
        rid += 1
        name = src.name
        part = part_of(name)
        kind = kind_of(name)
        deferred = is_deferred(name)
        row = {
            "id": str(rid),
            "source_file": name,
            "part": part,
            "kind": kind,
            "scope": "deferred" if deferred else "prepare",
            "action": "",
            "output_files": "",
            "notes": "",
        }
        if deferred:
            reason = "deferred_by_consensus"
            if "dmg" in name.lower() or "sweat" in name.lower() or "smask" in name.lower():
                reason = "damage_or_sweat_fx_system_missing"
            elif "eyeshadow" in name.lower() or "facial" in name.lower():
                reason = "face_fx_deferred"
            elif name.lower().startswith("cdm_") or name.lower().startswith("ldm_"):
                reason = "shared_mask_no_mesh_binding"
            elif "esf003" in name.lower():
                reason = "possible_wrong_character_id_esf003"
            row["action"] = "skip_deferred"
            row["notes"] = reason
            rows.append(row)
            continue

        by_key[(part, kind, name)] = src  # type: ignore
        rows.append(row)

    # Rebuild simple index for primary maps
    albd: dict[str, Path] = {}
    nrrc_main: dict[str, Path] = {}
    nrrc_detail: list[tuple[str, Path]] = []
    atos: dict[str, Path] = {}
    cmask: dict[str, Path] = {}

    for src in sources:
        name = src.name
        if is_deferred(name):
            continue
        part = part_of(name)
        kind = kind_of(name)
        n = name.lower()
        if kind == "color" and part in ("head", "body", "hair", "clotha", "clothb", "eye"):
            # prefer primary albd over alba
            if part not in albd or "albdout" in n:
                albd[part] = src
        elif kind == "packed_bump":
            is_main = any(
                x in n
                for x in (
                    "head_nrrc",
                    "body_nrrcout",
                    "hair_nrrc",
                    "clotha_nrrc",
                    "clothb_nrrc",
                    "eye_nrrc",
                )
            ) and "blend" not in n and "detail" not in n and not n.startswith("bdm_") and not n.startswith(
                "fdm_"
            )
            # main body is body_nrrcout not blend
            if part == "body" and "body_nrrcout" in n and "blend" not in n and "detail" not in n:
                is_main = True
            if part == "head" and "head_nrrcout" in n:
                is_main = True
            if is_main and part in ("head", "body", "hair", "clotha", "clothb", "eye"):
                nrrc_main[part] = src
            else:
                nrrc_detail.append((part if part != "unknown" else "body", src))
        elif kind == "packed_atos" and part in ("head", "body", "hair", "clotha", "clothb"):
            atos[part] = src
        elif kind == "dye_mask" and part in ("head", "clotha", "clothb", "eye"):
            cmask[part] = src
        elif name.lower().endswith(".dds") and "sa_blend_msk4" in n:
            # A1 required dds
            dst = WORK / "body_sa_blend_msk4.png"
            ok, note = try_dds_to_png(src, dst)
            for row in rows:
                if row["source_file"] == name:
                    row["action"] = "dds_to_png" if ok else "dds_fail"
                    row["output_files"] = str(dst.relative_to(OUT)) if ok else ""
                    row["notes"] = note
                    break

    # --- A2 main nrrc ---
    for part, src in nrrc_main.items():
        size = EYE_TEX_SIZE if part == "eye" else MAIN_TEX_SIZE
        im = resize_max(load_rgba(src), size)
        if nrrc_is_flat(im):
            # Flat packed normal (eye): do NOT write bump — would force nx=-1 (green/black eyes).
            for row in rows:
                if row["source_file"] == src.name:
                    row["action"] = "skip_flat_nrrc"
                    row["notes"] = "constant_nrrc_no_bump"
                    break
            # remove stale bump if any
            for stale in (OUT / f"{part}_bump.png", OUT / f"{part}_rough.png"):
                if stale.exists():
                    stale.unlink()
            print(f"[A2] SKIP flat nrrc {part} <- {src.name}")
            continue
        bump, rough = nrrc_to_bump_rough(im, FLIP_Y)
        bpath = OUT / f"{part}_bump.png"
        rpath = OUT / f"{part}_rough.png"
        bump.save(bpath, format="PNG")
        rough.save(rpath, format="PNG")
        for row in rows:
            if row["source_file"] == src.name:
                row["action"] = "convert_bump"
                row["output_files"] = f"{bpath.name};{rpath.name}"
                row["notes"] = f"FLIP_Y={FLIP_Y} size={bump.size}"
                break
        print(f"[A2] main {part} <- {src.name} -> {bpath.name}")

    # --- A2 detail nrrc ---
    for part, src in nrrc_detail:
        size = MAIN_TEX_SIZE
        im = resize_max(load_rgba(src), size)
        bump, rough = nrrc_to_bump_rough(im, FLIP_Y)
        stem = re.sub(r"[^a-zA-Z0-9_]+", "_", src.stem)
        bpath = OUT / f"detail_{part}_{stem}_bump.png"
        rpath = OUT / f"detail_{part}_{stem}_rough.png"
        bump.save(bpath, format="PNG")
        rough.save(rpath, format="PNG")
        for row in rows:
            if row["source_file"] == src.name:
                row["action"] = "convert_bump_detail"
                row["output_files"] = f"{bpath.name};{rpath.name}"
                row["notes"] = "detail_not_merged_into_main_uv_safe"
                break
        print(f"[A2] detail {part} <- {src.name}")

    # --- A3 colors ---
    # head/body/eye copy resize
    for part, out_name, dye in (
        ("head", "head_color.png", False),
        ("body", "body_color.png", False),
        ("eye", "eye_color.png", False),
        ("hair", "hair_color_final.png", "hair"),
        ("clotha", "clotha_color_final.png", "cloth"),
        ("clothb", "clothb_color_final.png", "cloth"),
    ):
        if part not in albd:
            print(f"[A3] WARN missing albd for {part}")
            continue
        src = albd[part]
        size = EYE_TEX_SIZE if part == "eye" else MAIN_TEX_SIZE
        im = resize_max(load_rgba(src), size)
        if dye == "hair":
            im = darken_hair(im)
        elif dye == "cloth":
            cm = None
            if part in cmask:
                cm = load_rgba(cmask[part])
            im = dye_cloth(im, cm)
            im = punch_atlas_black_alpha(im, thr=16.0)
        elif part in ("head", "body"):
            # Source albd is quite dark for WebGPU lights — mild lift
            im = brighten_rgb(im, 1.22 if part == "head" else 1.12)
        elif part == "eye":
            im = brighten_rgb(im, 1.08)
        op = OUT / out_name
        im.save(op, format="PNG")
        for row in rows:
            if row["source_file"] == src.name:
                row["action"] = (row["action"] + ";" if row["action"] else "") + "color_out"
                row["output_files"] = (
                    (row["output_files"] + ";" if row["output_files"] else "") + out_name
                )
                row["notes"] = (row["notes"] + " " if row["notes"] else "") + f"-> {out_name}"
                break
        if part in cmask:
            for row in rows:
                if row["source_file"] == cmask[part].name:
                    row["action"] = "dye_mask_used"
                    row["output_files"] = out_name
                    row["notes"] = "used_in_offline_dye"
                    break
        print(f"[A3] {out_name} <- {src.name}")

    # Headband red (shares clotha UV)
    clotha_final = OUT / "clotha_color_final.png"
    if clotha_final.exists():
        hb = make_headband_color(Image.open(clotha_final))
        hb_path = OUT / "headband_color_final.png"
        hb.save(hb_path, format="PNG")
        print(f"[A3] {hb_path.name} (red hachimaki from clotha)")

    # head cmask if present
    if "head" in cmask:
        for row in rows:
            if row["source_file"] == cmask["head"].name and not row["action"]:
                row["action"] = "dye_mask_weak_unused"
                row["notes"] = "head_cmask_not_primary_skin_un-dyed"

    # --- A4 atos ---
    for part, src in atos.items():
        im = resize_max(load_rgba(src), MAIN_TEX_SIZE)
        best_ch = -1
        best_std = -1.0
        stds = []
        for ch in range(4):
            s = channel_stddev(im, ch)
            stds.append(s)
            if s > best_std:
                best_std = s
                best_ch = ch
        for row in rows:
            if row["source_file"] == src.name:
                if best_std < ATOS_MIN_STDDEV:
                    row["action"] = "ao_skip"
                    row["notes"] = f"near_constant stddevs={['%.1f'%x for x in stds]}"
                    print(f"[A4] {part} skip AO std={stds}")
                else:
                    band = im.split()[best_ch]
                    # invert if bright mean
                    mean = sum(list(band.getdata())[::50]) / max(1, len(list(band.getdata())[::50]))
                    if mean > 128:
                        band = Image.eval(band, lambda v: 255 - v)
                        inv = True
                    else:
                        inv = False
                    op = OUT / f"{part}_ao.png"
                    band.save(op, format="PNG")
                    row["action"] = "ao_extract"
                    row["output_files"] = op.name
                    row["notes"] = f"ch={best_ch} std={best_std:.1f} invert={inv}"
                    print(f"[A4] {part} AO -> {op.name} ch={best_ch}")
                break

    # --- A4b quality: soft AO into color + body detail normal ---
    for part in ("head", "body", "clotha", "clothb", "hair"):
        col_name = {
            "head": "head_color.png",
            "body": "body_color.png",
            "clotha": "clotha_color_final.png",
            "clothb": "clothb_color_final.png",
            "hair": "hair_color_final.png",
        }[part]
        col_p = OUT / col_name
        ao_p = OUT / f"{part}_ao.png"
        if col_p.exists() and ao_p.exists():
            strength = 0.28 if part in ("clotha", "clothb") else 0.22
            out = multiply_ao_into_color(Image.open(col_p), Image.open(ao_p), strength)
            if part in ("clotha", "clothb"):
                out = punch_atlas_black_alpha(out, thr=16.0)
            out.save(col_p, format="PNG")
            print(f"[A4b] AO bake {part} strength={strength}")

    # body detail nrrc → soft blend into body_bump (same UV family on RE body)
    body_bump = OUT / "body_bump.png"
    detail_cand = sorted(OUT.glob("detail_body_*bodydetail*_bump.png")) + sorted(
        OUT.glob("detail_body_*bodydetail*_bump.png")
    )
    # also bodydetail explicit
    detail_cand = list(OUT.glob("detail_body_*bodydetail*_bump.png"))
    if not detail_cand:
        detail_cand = [
            p
            for p in OUT.glob("detail_body_*_bump.png")
            if "bodydetail" in p.name or "blenda" in p.name
        ][:1]
    if body_bump.exists() and detail_cand:
        d0 = detail_cand[0]
        blended = blend_bump_detail(Image.open(body_bump), Image.open(d0), amount=0.32)
        blended.save(body_bump, format="PNG")
        print(f"[A4b] body detail normal blend <- {d0.name}")

    # headband after AO on clotha
    clotha_final = OUT / "clotha_color_final.png"
    if clotha_final.exists():
        hb = make_headband_color(Image.open(clotha_final))
        hb.save(OUT / "headband_color_final.png", format="PNG")
        print("[A4b] refresh headband_color_final after AO")

    # Classic black belt (obi) — solid dark fabric, not white gi dye
    belt = Image.new("RGBA", (MAIN_TEX_SIZE, MAIN_TEX_SIZE), (28, 28, 30, 255))
    # subtle weave via noise-ish stripes
    ba = np.asarray(belt, dtype=np.float32)
    yy = np.linspace(0, 1, MAIN_TEX_SIZE, dtype=np.float32)[:, None]
    stripe = (np.sin(yy * 80.0) * 0.5 + 0.5) * 12.0
    ba[..., 0] = np.clip(ba[..., 0] + stripe, 0, 255)
    ba[..., 1] = np.clip(ba[..., 1] + stripe, 0, 255)
    ba[..., 2] = np.clip(ba[..., 2] + stripe * 0.9, 0, 255)
    Image.fromarray(ba.astype(np.uint8), "RGBA").save(
        OUT / "belt_color_final.png", format="PNG"
    )
    # Obi kanji plate: off-white
    sign = Image.new("RGBA", (512, 512), (235, 230, 220, 255))
    sign.save(OUT / "belt_sign_color_final.png", format="PNG")
    print("[A4b] belt_color_final + belt_sign_color_final")

    # mark remaining prepare rows without action
    for row in rows:
        if row["scope"] == "prepare" and not row["action"]:
            row["action"] = "indexed_only"
            row["notes"] = row["notes"] or "no_primary_pipeline_step"

    manifest = OUT / "manifest.csv"
    fields = ["id", "source_file", "part", "kind", "scope", "action", "output_files", "notes"]
    with manifest.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in rows:
            w.writerow(row)

    print(f"[A0] sources={len(sources)} manifest={manifest}")
    print(f"[done] OUT={OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

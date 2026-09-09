#!/usr/bin/env python3
"""Deterministic post-process: chroma-key a 2x2 magenta VFX sheet, split, center, pack, GIF."""
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageSequence

MAGENTA = (255, 0, 255)
CHROMA_TOL = 90.0
GUTTER_LUMA = 220
CELL = 256


def sample_chroma(im: Image.Image, inset: int = 12) -> tuple[int, int, int]:
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    pts = []
    for x0, y0 in ((0, 0), (w - inset, 0), (0, h - inset), (w - inset, h - inset)):
        for y in range(y0, min(h, y0 + inset)):
            for x in range(x0, min(w, x0 + inset)):
                pts.append(px[x, y])
    pts.sort()
    return pts[len(pts) // 2]


def chroma_alpha(im: Image.Image, key: tuple[int, int, int] | None = None, tol: float = CHROMA_TOL) -> Image.Image:
    """Key magenta. Steam baked as higher-G magenta is recovered via green lift, then despilled to grey."""
    im = im.convert("RGBA")
    if key is None:
        key = sample_chroma(im)
    px = im.load()
    w, h = im.size
    kr, kg, kb = key
    g_floor = kg + 18
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dist = math.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2)
            g_lift = g - kg
            if g_lift <= 18 and dist <= tol * 1.35:
                px[x, y] = (r, g, b, 0)
                continue
            if g_lift > 18 and r > 120 and b > 100:
                t = min(1.0, g_lift / 110.0)
                grey = max(g, int(80 + t * 150))
                px[x, y] = (grey, grey, grey, int(max(40, min(255, t * 255))))
                continue
            mx = max(r, g, b, 1)
            mn = min(r, g, b)
            sat = (mx - mn) / mx
            if sat < 0.28 and g >= 40:
                continue
            magenta_like = min(r, b) - g > 40 and sat > 0.35 and g < 140
            if dist <= tol or magenta_like:
                px[x, y] = (r, g, b, 0)
            elif dist < tol * 1.7:
                fade = (dist - tol) / (tol * 0.7)
                px[x, y] = (r, g, b, int(a * max(0.0, min(1.0, fade))))
    return im


def find_gutter_bands(im: Image.Image) -> tuple[int, int]:
    """Return (x_split, y_split) as the center of white cross if present, else mid."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()

    def band_score_v(x: int) -> float:
        s = 0.0
        for y in range(h):
            r, g, b = px[x, y]
            s += (r + g + b) / 3.0
        return s / h

    def band_score_h(y: int) -> float:
        s = 0.0
        for x in range(w):
            r, g, b = px[x, y]
            s += (r + g + b) / 3.0
        return s / w

    x0, x1 = int(w * 0.42), int(w * 0.58)
    y0, y1 = int(h * 0.42), int(h * 0.58)
    best_x, best_xs = w // 2, -1.0
    for x in range(x0, x1):
        sc = band_score_v(x)
        if sc > best_xs:
            best_xs, best_x = sc, x
    best_y, best_ys = h // 2, -1.0
    for y in range(y0, y1):
        sc = band_score_h(y)
        if sc > best_ys:
            best_ys, best_y = sc, y
    return best_x, best_y


def gutter_half_width(im: Image.Image, split_x: int, split_y: int) -> int:
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    half = 1
    for d in range(1, 24):
        r, g, b = px[min(w - 1, split_x + d), h // 4]
        luma = (r + g + b) / 3.0
        if luma < GUTTER_LUMA:
            half = d
            break
        half = d
    return max(2, half)


def despill(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            extra = min(r, b) - g
            if extra > 12 and r > 90 and b > 70:
                r = max(g, r - int(extra * 0.75))
                b = max(g, b - int(extra * 0.75))
                px[x, y] = (r, g, b, a)
    return im


def split_grid(im: Image.Image, rows: int, cols: int) -> list[Image.Image]:
    w, h = im.size
    cw, ch = w // cols, h // rows
    cells: list[Image.Image] = []
    for r in range(rows):
        for c in range(cols):
            cells.append(im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)))
    return cells


def split_2x2(im: Image.Image) -> list[Image.Image]:
    w, h = im.size
    sx, sy = find_gutter_bands(im)
    half = gutter_half_width(im, sx, sy)
    boxes = [
        (0, 0, max(1, sx - half), max(1, sy - half)),
        (min(w, sx + half), 0, w, max(1, sy - half)),
        (0, min(h, sy + half), max(1, sx - half), h),
        (min(w, sx + half), min(h, sy + half), w, h),
    ]
    return [im.crop(b) for b in boxes]


def content_bbox(im: Image.Image) -> tuple[int, int, int, int] | None:
    a = im.getchannel("A")
    bb = a.getbbox()
    return bb


def center_on_cell(im: Image.Image, cell: int = CELL) -> Image.Image:
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    bb = content_bbox(im)
    if bb is None:
        return out
    crop = im.crop(bb)
    cw, ch = crop.size
    scale = min((cell * 0.86) / max(cw, 1), (cell * 0.86) / max(ch, 1), 1.0)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    out.paste(crop, ((cell - nw) // 2, (cell - nh) // 2), crop)
    return out


def pack_grid(frames: list[Image.Image], cols: int = 2) -> Image.Image:
    cell = frames[0].size[0]
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        r, c = divmod(i, cols)
        sheet.paste(fr, (c * cell, r * cell), fr)
    return sheet


def save_gif(frames: list[Image.Image], path: Path, duration_ms: int = 90) -> None:
    pal = []
    for fr in frames:
        bg = Image.new("RGBA", fr.size, (24, 24, 24, 255))
        bg = Image.alpha_composite(bg, fr)
        pal.append(bg.convert("P", palette=Image.Palette.ADAPTIVE, colors=128))
    pal[0].save(
        path,
        save_all=True,
        append_images=pal[1:],
        duration=duration_ms,
        loop=0,
        disposal=2,
        optimize=False,
    )


def process(
    raw_path: Path,
    out_dir: Path,
    *,
    rows: int = 2,
    cols: int = 2,
    cell: int = CELL,
    pack_cols: int | None = None,
    element: str = "E1_core_flash",
    fps: int = 30,
    use_gutter_2x2: bool = False,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    frames_dir = out_dir / "frames"
    frames_dir.mkdir(exist_ok=True)

    raw = Image.open(raw_path).convert("RGBA")
    key = sample_chroma(raw)
    keyed = despill(chroma_alpha(raw, key=key))
    if use_gutter_2x2 and rows == 2 and cols == 2:
        cells = split_2x2(keyed)
    else:
        cells = split_grid(keyed, rows, cols)
    centered = [center_on_cell(c, cell=cell) for c in cells]
    for i, fr in enumerate(centered):
        fr.save(frames_dir / f"frame-{i:02d}.png")
    pc = pack_cols if pack_cols is not None else cols
    sheet = pack_grid(centered, pc)
    sheet_path = out_dir / "sheet-transparent.png"
    sheet.save(sheet_path)
    gif_path = out_dir / "preview.gif"
    duration_ms = max(1, round(1000 / fps))
    save_gif(centered, gif_path, duration_ms=duration_ms)
    meta = {
        "element": element,
        "grid": [cols, rows],
        "pack_cols": pc,
        "cell": cell,
        "fps": fps,
        "chroma": "#FF00FF",
        "chroma_sampled": list(key),
        "chroma_tol": CHROMA_TOL,
        "anchor": "center",
        "raw": str(raw_path),
        "frames": [f"frames/frame-{i:02d}.png" for i in range(len(centered))],
        "sheet": "sheet-transparent.png",
        "preview": "preview.gif",
    }
    (out_dir / "pipeline-meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Chroma-key, split, pack a magenta VFX sheet")
    p.add_argument("raw", nargs="?", default="vfx-ai-pipeline/runs/hit_ref_v1/E1_core_flash/raw-sheet.png")
    p.add_argument("out", nargs="?")
    p.add_argument("--rows", type=int, default=2)
    p.add_argument("--cols", type=int, default=2)
    p.add_argument("--cell", type=int, default=CELL)
    p.add_argument("--pack-cols", type=int, default=None)
    p.add_argument("--element", default="E1_core_flash")
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--gutter-2x2", action="store_true")
    args = p.parse_args()
    raw = Path(args.raw)
    out = Path(args.out) if args.out else raw.parent
    print(
        json.dumps(
            process(
                raw,
                out,
                rows=args.rows,
                cols=args.cols,
                cell=args.cell,
                pack_cols=args.pack_cols,
                element=args.element,
                fps=args.fps,
                use_gutter_2x2=args.gutter_2x2,
            ),
            indent=2,
        )
    )

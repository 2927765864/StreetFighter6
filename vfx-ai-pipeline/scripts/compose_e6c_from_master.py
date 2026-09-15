#!/usr/bin/env python3
"""E6-c wide-short fiber smoke: E4-c master mirrored → 14 frames, pivot f7, left.

Same motion as E4-b/E4-c except:
- master is horizontally flipped (faces left)
- travel is to the left (2× f1 sprite width on f1→f7)
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "runs" / "hit_ref_v1" / "E6c_wide_short_fiber_smoke"
PUBLIC = ROOT.parent / "app" / "public" / "vfx" / "hit_ref_v1" / "E6c_wide_short_fiber_smoke"
MASTER = OUT / "master.jpg"
MASTER_SRC = ROOT / "runs" / "hit_ref_v1" / "E4c_wide_short_fiber_smoke" / "master.jpg"

FRAMES = 14
FPS = 30
CELL = 640
EDGE_PAD = 10

PIVOT = 6
FADE_START = 7

GROW_PIVOT = 1.18
V_COMPRESS = 0.88
H_STRETCH_END = 1.34

SX_F1, SY_F1 = 1.0, 1.0
SX_PIVOT, SY_PIVOT = GROW_PIVOT, GROW_PIVOT * V_COMPRESS
SX_END, SY_END = SX_PIVOT * H_STRETCH_END, SY_PIVOT

VX_PRE = 1.00
VX_POST = 0.22


def chroma_alpha(im: Image.Image) -> Image.Image:
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    dist = np.sqrt((r - 255.0) ** 2 + (g - 0.0) ** 2 + (b - 255.0) ** 2)
    extra = np.maximum(0.0, np.minimum(r, b) - g)

    hard = dist <= 70.0
    key_t = np.clip(extra / 165.0, 0.0, 1.0)
    alpha = np.clip(1.0 - key_t, 0.0, 1.0) * 255.0
    alpha = np.where(hard, 0.0, alpha)

    r2 = np.clip(r - extra, 0.0, 255.0)
    b2 = np.clip(b - extra, 0.0, 255.0)
    grey = np.clip(0.18 * r2 + 0.64 * g + 0.18 * b2, 0.0, 255.0)
    grey = np.clip(grey * 1.06, 0.0, 255.0)

    luma = 0.3 * r2 + 0.59 * g + 0.11 * b2
    alpha = np.where(luma < 28, 0.0, alpha)

    out = np.zeros_like(arr)
    keep = alpha >= 8.0
    out[..., 0] = np.where(keep, grey, 0.0)
    out[..., 1] = np.where(keep, grey, 0.0)
    out[..., 2] = np.where(keep, grey, 0.0)
    out[..., 3] = np.where(keep, alpha, 0.0)
    return Image.fromarray(np.asarray(np.clip(out, 0, 255), dtype=np.uint8))


def crop_content(im: Image.Image, pad: int = 8) -> Image.Image:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return im
    x0, x1 = max(0, int(xs.min()) - pad), min(im.width, int(xs.max()) + pad + 1)
    y0, y1 = max(0, int(ys.min()) - pad), min(im.height, int(ys.max()) + pad + 1)
    return im.crop((x0, y0, x1, y1))


def ease_out(t: float) -> float:
    return 1.0 - (1.0 - t) ** 2


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def axes_scale(i: int) -> tuple[float, float]:
    if i <= PIVOT:
        u = ease_out(i / PIVOT) if PIVOT else 1.0
        return lerp(SX_F1, SX_PIVOT, u), lerp(SY_F1, SY_PIVOT, u)
    u = (i - PIVOT) / (FRAMES - 1 - PIVOT)
    u = ease_out(u)
    return lerp(SX_PIVOT, SX_END, u), lerp(SY_PIVOT, SY_END, u)


def raw_offset(i: int) -> float:
    if i <= PIVOT:
        return VX_PRE * (i / PIVOT)
    return VX_PRE + VX_POST * ((i - PIVOT) / (FRAMES - 1 - PIVOT))


def rel_alpha(i: int) -> float:
    if i < FADE_START:
        return 1.0
    u = (i - (FADE_START - 1)) / (FRAMES - FADE_START)
    return max(0.0, 1.0 - u)


def fit_motion(
    mw: int, mh: int, cell: int
) -> tuple[float, list[tuple[float, float, float, float, float]]]:
    """f1→f7 center travel = 2 × f1 width to the LEFT; f8→f14 slow left."""
    raw = [raw_offset(i) for i in range(FRAMES)]

    def layout(base: float) -> list[tuple[float, float, float, float]] | None:
        f1_w = mw * base * SX_F1
        if f1_w < 8:
            return None
        travel_pivot = 2.0 * f1_w
        cx0 = cell - EDGE_PAD - f1_w / 2.0
        out: list[tuple[float, float, float, float]] = []
        for i in range(FRAMES):
            sx, sy = axes_scale(i)
            nw = mw * base * sx
            nh = mh * base * sy
            cx = cx0 - travel_pivot * (raw[i] / VX_PRE)
            x = cx - nw / 2.0
            y = (cell - nh) / 2.0
            if x < EDGE_PAD or y < EDGE_PAD:
                return None
            if x + nw > cell - EDGE_PAD or y + nh > cell - EDGE_PAD:
                return None
            dx = x - (cell - nw) / 2.0
            dy = y - (cell - nh) / 2.0
            out.append((sx, sy, dx, dy))
        return out

    lo, hi = 0.04, 1.6
    best_base = None
    best_layout = None
    for _ in range(40):
        mid = (lo + hi) / 2
        lay = layout(mid)
        if lay is not None:
            best_base = mid
            best_layout = lay
            lo = mid
        else:
            hi = mid
    if best_base is None or best_layout is None:
        raise RuntimeError("could not fit E6-c 2-width left travel into cell")

    frames = [
        (sx, sy, dx, dy, rel_alpha(i))
        for i, (sx, sy, dx, dy) in enumerate(best_layout)
    ]
    return best_base, frames


def place(
    src: Image.Image,
    canvas_size: int,
    base: float,
    sx: float,
    sy: float,
    dx: float,
    dy: float,
    alpha: float,
) -> Image.Image:
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    w, h = src.size
    nw = max(1, int(round(w * base * sx)))
    nh = max(1, int(round(h * base * sy)))
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    if alpha < 0.999:
        a = np.asarray(resized).astype(np.float32)
        a[..., 3] *= max(0.0, min(1.0, alpha))
        resized = Image.fromarray(np.asarray(a, dtype=np.uint8))
    x = int(round((canvas_size - nw) / 2 + dx))
    y = int(round((canvas_size - nh) / 2 + dy))
    x = min(max(x, 0), canvas_size - nw)
    y = min(max(y, 0), canvas_size - nh)
    canvas.paste(resized, (x, y), resized)
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    flipped = Image.open(MASTER_SRC).convert("RGB").transpose(Image.FLIP_LEFT_RIGHT)
    flipped.save(MASTER, quality=95)

    frames_dir = OUT / "frames"
    frames_dir.mkdir(exist_ok=True)
    for old in frames_dir.glob("frame-*.png"):
        old.unlink()

    keyed = chroma_alpha(Image.open(MASTER))
    master_rgba = crop_content(keyed)
    master_rgba.save(OUT / "master-transparent.png")

    mw, mh = master_rgba.size
    base, motion = fit_motion(mw, mh, CELL)

    pal = []
    for i, (sx, sy, dx, dy, alpha) in enumerate(motion):
        frame = place(master_rgba, CELL, base, sx, sy, dx, dy, alpha)
        frame.save(frames_dir / f"frame-{i:02d}.png")
        pal.append(frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=64))

    pub = PUBLIC
    pub.mkdir(parents=True, exist_ok=True)
    for old in pub.glob("frame-*.png"):
        old.unlink()
    for i in range(FRAMES):
        src = frames_dir / f"frame-{i:02d}.png"
        Image.open(src).save(pub / src.name)

    pal[0].save(
        OUT / "preview.gif",
        save_all=True,
        append_images=pal[1:],
        duration=int(1000 / FPS),
        loop=0,
        disposal=2,
    )

    strip = Image.new("RGBA", (CELL * FRAMES, CELL), (18, 16, 22, 255))
    for i in range(FRAMES):
        im = Image.open(frames_dir / f"frame-{i:02d}.png").convert("RGBA")
        bg = Image.new("RGBA", (CELL, CELL), (18, 16, 22, 255))
        bg.alpha_composite(im)
        strip.paste(bg, (i * CELL, 0))
    strip.save(OUT / "contact_strip.png")

    meta = {
        "element": "E6c_wide_short_fiber_smoke",
        "strategy": "single_master_aniso_scale_translate_fade",
        "master": MASTER.name,
        "master_frame_1based": 1,
        "pivot_frame_1based": PIVOT + 1,
        "generator": "e4c_master_hflip_then_pil",
        "frames": FRAMES,
        "fps": FPS,
        "cell": CELL,
        "fade_from_frame_1based": FADE_START + 1,
        "base_fit_scale": round(base, 5),
        "axes": {
            "f1": [SX_F1, SY_F1],
            "f7": [round(SX_PIVOT, 4), round(SY_PIVOT, 4)],
            "f14": [round(SX_END, 4), round(SY_END, 4)],
        },
        "grow_pivot": GROW_PIVOT,
        "v_compress": V_COMPRESS,
        "h_stretch_end": H_STRETCH_END,
        "motion": (
            "E4-c master H-flipped. f1–f7 grow + V-squash + left travel "
            "2× f1 sprite width. f8–f14 H-stretch + fade + slow left."
        ),
    }
    (OUT / "pipeline-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (OUT / "prompt-used.txt").write_text(
        "E6-c = E4-c master flipped. 14 frames, pivot f7, travel left. "
        "f1-7 grow 1.18 + V-compress 0.88 + left 2× sprite width; "
        "f8-14 H-stretch 1.34, fade, slow left.\n"
    )
    (OUT / "notes.md").write_text(
        "# E6-c · 宽短纤维烟（向左，14 帧）\n\n"
        "E4-c master 水平翻转。14 帧，第 7 帧转折。\n\n"
        "- f1–f7：放大 1.18 + 竖直压 0.88，向左约 2× 第 1 帧宽度\n"
        "- f8–f14：水平拉伸 1.34、渐隐、缓慢左移\n"
    )

    print(f"wrote {FRAMES} frames → {OUT}")
    print(f"  master {mw}x{mh}, base_fit={base:.4f}")
    w1 = mw * base * motion[0][0]
    cx = []
    for i, (sx, sy, dx, dy, a) in enumerate(motion):
        nw = mw * base * sx
        cx.append((CELL - nw) / 2 + dx)
    print(
        f"  f1 width={w1:.1f}  f1→f7 center travel={cx[PIVOT] - cx[0]:.1f} "
        f"({(cx[PIVOT] - cx[0]) / w1:.2f}× f1 width)"
    )
    for i in (0, 3, 6, 7, 10, 13):
        sx, sy, dx, dy, a = motion[i]
        print(
            f"  f{i + 1:02d}: sx={sx:.3f} sy={sy:.3f} "
            f"dx={dx:+.1f} dy={dy:+.1f} alpha={a:.3f}"
        )


if __name__ == "__main__":
    main()

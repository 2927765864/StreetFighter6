#!/usr/bin/env python3
"""E8-c1 right-spread smoke: one locked master (CCW 90°) → 28-frame transform.

Master = 1-based frame 10 at (sx, sy) = (1, 1).
f1: overall 0.2 + extra vertical squash; f1→f10 ease-out scale to 1,
    V-stretch to normal, fast right.
f11→f28: fade out, keep V-stretching, slow right, uniform enlarge.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "runs" / "hit_ref_v1" / "E8c1_right_spread_smoke"
MASTER = OUT / "master_ccw90.jpg"

FRAMES = 28
FPS = 30
CELL = 640
CHROMA_TOL = 110.0
EDGE_PAD = 10

MASTER_FRAME = 9  # 0-based = 1-based 10
MID_FRAME = 19  # 1-based 20
FADE_START = 10  # 1-based 11

SX_F1, SY_F1 = 0.20, 0.11  # 0.2 overall + V-compress
SX_F10, SY_F10 = 1.0, 1.0
SX_F20, SY_F20 = 1.0, 1.32
SX_F28, SY_F28 = 1.22, 1.55

# Raw path relative to master. +x right.
VX_PRE = 0.72  # f1→f10 fast right (arrive at 0)
VX_POST = 0.18  # f11→f28 slow right


def chroma_alpha(im: Image.Image, tol: float = CHROMA_TOL) -> Image.Image:
    """Unmix #FF00FF so thin smoke stays, but RGB has no purple fringe."""
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    dist = np.sqrt((r - 255.0) ** 2 + (g - 0.0) ** 2 + (b - 255.0) ** 2)
    extra = np.maximum(0.0, np.minimum(r, b) - g)

    # Hard-kill near-pure key.
    hard = dist <= 70.0
    # Magenta mix amount; thin white-over-magenta still has leftover G.
    key_t = np.clip(extra / 165.0, 0.0, 1.0)
    alpha = np.clip(1.0 - key_t, 0.0, 1.0) * 255.0
    alpha = np.where(hard, 0.0, alpha)

    # Recover smoke color by subtracting magenta, then flatten to grey-white.
    r2 = np.clip(r - extra, 0.0, 255.0)
    b2 = np.clip(b - extra, 0.0, 255.0)
    grey = np.clip(0.18 * r2 + 0.64 * g + 0.18 * b2, 0.0, 255.0)
    # Slight lift so screen-blend smoke doesn't go muddy.
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


def ease_in(t: float) -> float:
    return t * t


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def axes_scale(i: int) -> tuple[float, float]:
    if i <= MASTER_FRAME:
        u = ease_out(i / MASTER_FRAME) if MASTER_FRAME else 1.0
        return lerp(SX_F1, SX_F10, u), lerp(SY_F1, SY_F10, u)
    if i <= MID_FRAME:
        u = (i - MASTER_FRAME) / (MID_FRAME - MASTER_FRAME)
        return lerp(SX_F10, SX_F20, u), lerp(SY_F10, SY_F20, ease_out(u))
    u = (i - MID_FRAME) / (FRAMES - 1 - MID_FRAME)
    return lerp(SX_F20, SX_F28, ease_out(u)), lerp(SY_F20, SY_F28, ease_out(u))


def raw_offset(i: int) -> tuple[float, float]:
    if i <= MASTER_FRAME:
        return VX_PRE * (i - MASTER_FRAME), 0.0
    return VX_POST * (i - MASTER_FRAME), 0.0


def rel_alpha(i: int) -> float:
    # Frames 1–10 opaque; fade begins on 1-based frame 11 (already < 1).
    if i <= MASTER_FRAME:
        return 1.0
    u = (i - MASTER_FRAME) / (FRAMES - 1 - MASTER_FRAME)
    return 1.0 - u


def fit_motion(
    mw: int, mh: int, cell: int
) -> tuple[float, list[tuple[float, float, float, float, float]]]:
    raw = [raw_offset(i) for i in range(FRAMES)]
    xs = [o[0] for o in raw]
    span = max(abs(min(xs)), abs(max(xs)), 1e-6)

    def try_amp(amp: float, base: float) -> bool:
        for i in range(FRAMES):
            sx, sy = axes_scale(i)
            nw = mw * base * sx
            nh = mh * base * sy
            dx = raw[i][0] / span * amp
            dy = 0.0
            x = (cell - nw) / 2 + dx
            y = (cell - nh) / 2 + dy
            if x < EDGE_PAD or y < EDGE_PAD:
                return False
            if x + nw > cell - EDGE_PAD or y + nh > cell - EDGE_PAD:
                return False
        return True

    target_amp = cell * 0.30
    best: tuple[float, float] | None = None
    for amp in np.linspace(target_amp, cell * 0.10, 32):
        lo, hi = 0.02, 2.0
        ok_base = None
        for _ in range(28):
            mid = (lo + hi) / 2
            if try_amp(float(amp), mid):
                ok_base = mid
                lo = mid
            else:
                hi = mid
        if ok_base is not None and ok_base > 0.04:
            best = (float(amp), float(ok_base))
            break
    if best is None:
        raise RuntimeError("could not fit E8-c1 trajectory into cell")

    amp, base = best
    frames = []
    for i in range(FRAMES):
        sx, sy = axes_scale(i)
        dx = raw[i][0] / span * amp
        frames.append((sx, sy, dx, 0.0, rel_alpha(i)))
    return base, frames


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
        "element": "E8c1_right_spread_smoke",
        "strategy": "single_master_aniso_scale_translate_fade",
        "master": MASTER.name,
        "generator": "grok_imagine_then_pil",
        "frames": FRAMES,
        "fps": FPS,
        "cell": CELL,
        "master_frame_1based": MASTER_FRAME + 1,
        "fade_from_frame_1based": FADE_START + 1,
        "base_fit_scale": round(base, 5),
        "axes": {
            "f1": [SX_F1, SY_F1],
            "f10": [SX_F10, SY_F10],
            "f20": [SX_F20, SY_F20],
            "f28": [SX_F28, SY_F28],
        },
        "motion": (
            "f1 scale 0.2 + V-squash; f1–f10 ease-out to 1 + V-unstretch + fast right; "
            "f11–f28 fade while V-stretch + slow right + enlarge"
        ),
    }
    (OUT / "pipeline-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (OUT / "prompt-used.txt").write_text(
        "E8-c1 CCW90 master = frame 10 of 28. PIL-only sequence: "
        "f1 0.2+V-squash, f1-10 snap scale/V-stretch + fast right, "
        "f11-28 fade while V-stretch + slow right + enlarge.\n"
    )

    print(f"wrote {FRAMES} frames → {OUT}")
    print(f"  master {mw}x{mh}, base_fit={base:.4f}")
    for i in (0, 4, 9, 10, 19, 20, 27):
        sx, sy, dx, dy, a = motion[i]
        print(
            f"  f{i + 1:02d}: sx={sx:.3f} sy={sy:.3f} "
            f"dx={dx:+.1f} dy={dy:+.1f} alpha={a:.3f}"
        )


if __name__ == "__main__":
    main()

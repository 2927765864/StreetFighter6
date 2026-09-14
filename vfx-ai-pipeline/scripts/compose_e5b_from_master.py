#!/usr/bin/env python3
"""E5-b narrow-long fiber smoke: same motion as E5-c, 16 frames.

Locked master = 1-based frame 8.
f1: uniform 0.5 scale, alpha 0.2.
f1→f8: ease-out scale 0.5→1, alpha 0.2→1, large move right (arrive at master).
f9→f16: slow horizontal stretch, slow right, fade to 0.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "runs" / "hit_ref_v1" / "E5b_narrow_long_fiber_smoke"
MASTER = OUT / "master.jpg"

FRAMES = 16
FPS = 30
CELL = 640
CHROMA_TOL = 110.0
EDGE_PAD = 10

MASTER_FRAME = 7  # 0-based = 1-based 8
FADE_START = 8  # 1-based 9

SX_F1, SY_F1 = 0.50, 0.50
SX_F8, SY_F8 = 1.0, 1.0
SX_END, SY_END = 1.42, 1.0
ALPHA_F1 = 0.20

# Raw path relative to master. +x right.
VX_PRE = 0.85  # f1→f8 fast right (arrive at 0)
VX_POST = 0.14  # f9→last slow right (weaker than pre so master stays large)


def chroma_alpha(im: Image.Image, tol: float = CHROMA_TOL) -> Image.Image:
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
    if i <= MASTER_FRAME:
        u = ease_out(i / MASTER_FRAME) if MASTER_FRAME else 1.0
        return lerp(SX_F1, SX_F8, u), lerp(SY_F1, SY_F8, u)
    u = (i - MASTER_FRAME) / (FRAMES - 1 - MASTER_FRAME)
    return lerp(SX_F8, SX_END, u), SY_F8


def raw_offset(i: int) -> tuple[float, float]:
    if i <= MASTER_FRAME:
        return VX_PRE * (i - MASTER_FRAME), 0.0
    return VX_POST * (i - MASTER_FRAME), 0.0


def rel_alpha(i: int) -> float:
    if i <= MASTER_FRAME:
        u = i / MASTER_FRAME if MASTER_FRAME else 1.0
        return lerp(ALPHA_F1, 1.0, u)
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
            x = (cell - nw) / 2 + dx
            y = (cell - nh) / 2
            if x < EDGE_PAD or y < EDGE_PAD:
                return False
            if x + nw > cell - EDGE_PAD or y + nh > cell - EDGE_PAD:
                return False
        return True

    target_amp = cell * 0.28
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
        raise RuntimeError("could not fit E5-b trajectory into cell")

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
        "element": "E5b_narrow_long_fiber_smoke",
        "strategy": "single_master_scale_translate_hstretch_fade",
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
            "f8": [SX_F8, SY_F8],
            "f16": [SX_END, SY_END],
        },
        "alpha_f1": ALPHA_F1,
        "motion": (
            "f1 scale 0.5 alpha 0.2; f1–f8 ease-out to 1 + fast right; "
            "f9–f16 slow H-stretch + slow right + fade"
        ),
    }
    (OUT / "pipeline-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (OUT / "prompt-used.txt").write_text(
        "E5-b master = frame 8 of 16 (same as E5-c). PIL-only sequence: "
        "f1 0.5 scale alpha 0.2, f1-8 scale/alpha to 1 + fast right, "
        "f9-16 slow horizontal stretch + slow right + fade.\n"
    )

    print(f"wrote {FRAMES} frames → {OUT}")
    print(f"  master {mw}x{mh}, base_fit={base:.4f}")
    for i in (0, 3, 7, 8, 11, 15):
        sx, sy, dx, dy, a = motion[i]
        print(
            f"  f{i + 1:02d}: sx={sx:.3f} sy={sy:.3f} "
            f"dx={dx:+.1f} dy={dy:+.1f} alpha={a:.3f}"
        )


if __name__ == "__main__":
    main()

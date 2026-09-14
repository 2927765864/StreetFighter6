#!/usr/bin/env python3
"""E7-c chunky sweat: one locked master → 16-frame transform.

Master = frame 7 (1-based).
f1: H-stretch / V-compress; f1→f6 move right while H-compress / V-stretch;
f7→f16 uniform enlarge to 1.15, keep drifting right + gravity down;
f10→f16 fade out.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "runs" / "hit_ref_v1" / "E7c_sweat_chunks"
MASTER = OUT / "master.jpg"

FRAMES = 16
FPS = 30
CELL = 384
CHROMA_TOL = 95.0
EDGE_PAD = 8

# 1-based frame 7 → 0-based index 6
MASTER_FRAME = 6
FADE_START = 9  # 1-based frame 10

# Anisotropic birth → settle (sx, sy). Master frame is (1, 1).
SX_F1, SY_F1 = 1.45, 0.62
SX_F6, SY_F6 = 0.88, 1.18
UNIFORM_END = 1.15

# Screen +x right, +y down. Offsets are relative to master-frame placement.
# Pre-master: rightward drift only. Post-master: continue right + gravity.
# Keep X aggressive; fit_motion will still clamp so the cell doesn't clip.
VX_PRE = 0.55
VX_POST = 0.48
G = 0.055


def chroma_alpha(im: Image.Image, tol: float = CHROMA_TOL) -> Image.Image:
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mag = (r > 160) & (b > 150) & (g < 90) & ((np.minimum(r, b) - g) > 40)
    dist = np.sqrt((r - 255.0) ** 2 + (g - 0.0) ** 2 + (b - 255.0) ** 2)
    alpha = np.where(mag | (dist <= tol), 0.0, 255.0)
    edge = (~mag) & (dist > tol) & (dist < tol * 1.6)
    fade = (dist - tol) / (tol * 0.6)
    alpha = np.where(edge, np.clip(fade, 0, 1) * 255.0, alpha)
    luma = 0.3 * r + 0.59 * g + 0.11 * b
    alpha = np.where((alpha > 0) & (luma < 90), 0.0, alpha)
    out = arr.copy()
    keep = alpha > 0
    mx = np.maximum(r, b)
    out[..., 0] = np.where(keep, np.clip(np.maximum(r, mx * 0.85), 200, 255), r)
    out[..., 1] = np.where(keep, np.clip(np.maximum(g, mx * 0.85), 200, 255), g)
    out[..., 2] = np.where(keep, np.clip(np.maximum(b, mx * 0.85), 200, 255), b)
    out[..., 3] = alpha
    return Image.fromarray(np.asarray(out, dtype=np.uint8))


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
    if i <= 5:
        # f1 → f6: H-stretch/V-compress → H-compress/V-stretch
        u = ease_out(i / 5.0) if i > 0 else 0.0
        return lerp(SX_F1, SX_F6, u), lerp(SY_F1, SY_F6, u)
    if i == MASTER_FRAME:
        return 1.0, 1.0
    # f7 → f16: uniform enlarge to 1.15
    u = (i - MASTER_FRAME) / (FRAMES - 1 - MASTER_FRAME)
    s = lerp(1.0, UNIFORM_END, ease_out(u))
    return s, s


def raw_offset(i: int) -> tuple[float, float]:
    """Unit-ish path relative to master frame (dx, dy)."""
    if i <= MASTER_FRAME:
        # Arrive at master from the left: earlier frames more left.
        t = float(i)
        x = VX_PRE * (t - MASTER_FRAME)
        y = 0.0
        return x, y
    t = float(i - MASTER_FRAME)
    x = VX_POST * t
    y = 0.5 * G * t * t
    return x, y


def rel_alpha(i: int) -> float:
    if i < FADE_START:
        return 1.0
    u = (i - FADE_START) / (FRAMES - 1 - FADE_START)
    return 1.0 - ease_in(u)


def fit_motion(
    mw: int, mh: int, cell: int
) -> tuple[float, list[tuple[float, float, float, float, float]]]:
    """
    Pick base_fit + trajectory amp so every anisotropic AABB stays in cell.
    Returns base_fit and per-frame (sx, sy, dx_px, dy_px, alpha).
    """
    raw = [raw_offset(i) for i in range(FRAMES)]
    xs = [o[0] for o in raw]
    ys = [o[1] for o in raw]
    span = max(abs(min(xs)), abs(max(xs)), abs(min(ys)), abs(max(ys)), 1e-6)

    def try_amp(amp: float, base: float) -> bool:
        for i in range(FRAMES):
            sx, sy = axes_scale(i)
            nw = mw * base * sx
            nh = mh * base * sy
            dx = raw[i][0] / span * amp
            dy = raw[i][1] / span * amp
            x = (cell - nw) / 2 + dx
            y = (cell - nh) / 2 + dy
            if x < EDGE_PAD or y < EDGE_PAD:
                return False
            if x + nw > cell - EDGE_PAD or y + nh > cell - EDGE_PAD:
                return False
        return True

    # Prefer a wide horizontal travel; fall back only if aniso scale won't fit.
    target_amp = cell * 0.34
    best: tuple[float, float] | None = None
    for amp in np.linspace(target_amp, cell * 0.14, 28):
        lo, hi = 0.02, 2.0
        ok_base = None
        for _ in range(28):
            mid = (lo + hi) / 2
            if try_amp(float(amp), mid):
                ok_base = mid
                lo = mid
            else:
                hi = mid
        if ok_base is not None and ok_base > 0.05:
            best = (float(amp), float(ok_base))
            break
    if best is None:
        raise RuntimeError("could not fit E7-c trajectory into cell")

    amp, base = best
    frames = []
    for i in range(FRAMES):
        sx, sy = axes_scale(i)
        dx = raw[i][0] / span * amp
        dy = raw[i][1] / span * amp
        frames.append((sx, sy, dx, dy, rel_alpha(i)))
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
        "element": "E7c_sweat_chunks",
        "strategy": "single_master_aniso_then_uniform_gravity",
        "master": MASTER.name,
        "frames": FRAMES,
        "fps": FPS,
        "cell": CELL,
        "master_frame_1based": MASTER_FRAME + 1,
        "fade_from_frame_1based": FADE_START + 1,
        "base_fit_scale": round(base, 5),
        "axes": {
            "f1": [SX_F1, SY_F1],
            "f6": [SX_F6, SY_F6],
            "f7": [1.0, 1.0],
            "f16_uniform": UNIFORM_END,
        },
        "motion": (
            "f1 H-stretch/V-compress; f1–f6 right + H-compress/V-stretch; "
            "f7 master; f7–f16 right+gravity + uniform→1.15; f10–f16 fade"
        ),
    }
    (OUT / "pipeline-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (OUT / "prompt-used.txt").write_text(
        "E7-c locked splash master = frame 7 of 16. "
        "PIL-only: f1 aniso birth, f1–f6 right + squash morph, "
        "f7–f16 right+gravity + uniform scale to 1.15, fade from f10.\n"
    )

    print(f"wrote {FRAMES} frames → {OUT}")
    print(f"  master {mw}x{mh}, base_fit={base:.4f}")
    for i in (0, 2, 5, 6, 7, 9, 10, 15):
        sx, sy, dx, dy, a = motion[i]
        print(
            f"  f{i + 1:02d}: sx={sx:.3f} sy={sy:.3f} "
            f"dx={dx:+.1f} dy={dy:+.1f} alpha={a:.3f}"
        )


if __name__ == "__main__":
    main()

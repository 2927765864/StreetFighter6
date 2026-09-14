#!/usr/bin/env python3
"""E8-b1 arc smoke: two masters → 12-frame transform.

f4 = master_01 @ 1.0
f1 = master_01 @ 0.7 + H-compress; f1→f4 scale up + H-stretch + down
f8 = master_02 @ 1.2; f5→f8 enlarge + down
f9→f12 H-stretch + fade + down
All frames drift downward.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "runs" / "hit_ref_v1" / "E8b1_arc_smoke"
M1 = OUT / "master_01.jpg"
M2 = OUT / "master_02.jpg"

FRAMES = 12
FPS = 30
CELL = 384
CHROMA_TOL = 110.0
EDGE_PAD = 8

# 1-based anchors
F4 = 3  # master_01
F8 = 7  # master_02 @ 1.2
FADE_START = 8  # 1-based f9 → index 8

SCALE_F1 = 0.7
SX_MULT_F1 = 0.72  # extra H-compress on top of 0.7
SCALE_F4 = 1.0
SCALE_F8 = 1.2
SX_MULT_F12 = 1.45  # H-stretch on f9–f12 (relative to uniform scale)

# Downward drift in raw units (fit_motion rescales into cell px)
DY_PER_FRAME = 0.11


def chroma_alpha(im: Image.Image, tol: float = CHROMA_TOL) -> Image.Image:
    """Key #FF00FF (incl. dirty/pink wash) and despill remaining smoke to cool grey."""
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    dist = np.sqrt((r - 255.0) ** 2 + (g - 0.0) ** 2 + (b - 255.0) ** 2)
    mag_extra = np.minimum(r, b) - g
    sat = (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)) / np.maximum(
        np.maximum(np.maximum(r, g), b), 1.0
    )
    # Pure + dirty magenta (pink wash still has high R/B vs G)
    mag = (dist <= tol) | ((mag_extra > 28) & (sat > 0.22) & (g < 160) & (r > 100) & (b > 100))
    mag |= (r > 180) & (b > 180) & (g < 130) & (mag_extra > 20)

    # Soft edge by distance from key
    alpha = np.where(mag, 0.0, 255.0)
    soft = (~mag) & (dist > tol) & (dist < tol * 1.85)
    fade = (dist - tol) / (tol * 0.85)
    alpha = np.where(soft, np.clip(fade, 0, 1) * 255.0, alpha)
    # Also soft-kill residual magenta tint by mag_extra
    tint = (~mag) & (mag_extra > 18) & (r > 90) & (b > 90)
    tint_fade = np.clip(1.0 - (mag_extra - 18) / 55.0, 0.0, 1.0)
    alpha = np.where(tint, np.minimum(alpha, tint_fade * 255.0), alpha)

    luma = 0.3 * r + 0.59 * g + 0.11 * b
    alpha = np.where((alpha > 0) & (luma < 55), 0.0, alpha)

    out = arr.copy()
    keep = alpha > 4
    # Despill: pull R/B down toward G so smoke reads grey-white, not purple
    extra = np.minimum(r, b) - g
    spill = keep & (extra > 8)
    corr = np.clip(extra * 0.92, 0, 255)
    out[..., 0] = np.where(spill, np.maximum(g, r - corr), r)
    out[..., 2] = np.where(spill, np.maximum(g, b - corr), b)
    # Second pass: any leftover purple (R≈B >> G) flatten to grey from G/luma
    rr, gg, bb = out[..., 0], out[..., 1], out[..., 2]
    still = keep & ((np.minimum(rr, bb) - gg) > 10)
    grey = np.clip(0.25 * rr + 0.5 * gg + 0.25 * bb, 0, 255)
    out[..., 0] = np.where(still, grey, out[..., 0])
    out[..., 1] = np.where(still, grey, out[..., 1])
    out[..., 2] = np.where(still, grey, out[..., 2])
    out[..., 3] = alpha
    # Premultiply-ish: kill near-zero alpha crumbs
    out[..., 3] = np.where(out[..., 3] < 8, 0.0, out[..., 3])
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


def ease_in_out(t: float) -> float:
    t = max(0.0, min(1.0, t))
    if t < 0.5:
        return 2.0 * t * t
    return 1.0 - 2.0 * (1.0 - t) ** 2


# Crossfade m1→m2 over f3–f6 (1-based). Overlap with strong m2 (starts @0.9).
BLEND_START = F4 - 1  # index 2 = f3
BLEND_END = F4 + 2  # index 5 = f6
W2_START = 0.9


def master_weights(i: int) -> tuple[float, float]:
    """(w1, w2). m2 enters at 0.9; do not mid-blend both to ~0.5."""
    if i < BLEND_START:
        return 1.0, 0.0
    if i > BLEND_END:
        return 0.0, 1.0
    u = (i - BLEND_START) / (BLEND_END - BLEND_START)
    # m2 already strong on first blend frame; ease up to 1.
    w2 = lerp(W2_START, 1.0, ease_out(u))
    # m1 stays solid longer, then drops (ease-in) so mid frames aren't washed out.
    w1 = 1.0 - ease_in(u)
    return w1, w2


def scale_m1(i: int) -> tuple[float, float]:
    if i <= F4:
        u = 0.0 if F4 == 0 else i / F4
        u = ease_out(u)
        s = lerp(SCALE_F1, SCALE_F4, u)
        sx_m = lerp(SX_MULT_F1, 1.0, u)
        return s * sx_m, s
    # Hold natural size while fading out through the blend.
    return SCALE_F4, SCALE_F4


def scale_m2(i: int) -> tuple[float, float]:
    # Before f5, enter near natural so overlap matches m1 size.
    if i <= F4:
        return SCALE_F4, SCALE_F4
    if i <= F8:
        u = (i - F4) / (F8 - F4)
        u = ease_out(u)
        s = lerp(SCALE_F4, SCALE_F8, u)
        return s, s
    u = (i - F8) / (FRAMES - 1 - F8)
    u = ease_out(u)
    s = SCALE_F8
    sx_m = lerp(1.0, SX_MULT_F12, u)
    return s * sx_m, s


def raw_offset(i: int) -> tuple[float, float]:
    # Relative to frame 4 (master_01 natural). All frames move down.
    return 0.0, DY_PER_FRAME * (i - F4)


def rel_alpha(i: int) -> float:
    if i < FADE_START:
        return 1.0
    u = (i - FADE_START) / (FRAMES - 1 - FADE_START)
    return 1.0 - ease_in(u)


def fit_motion(
    m1: Image.Image, m2: Image.Image, cell: int
) -> tuple[float, list[tuple[float, float, float, float, float, float, float, float]]]:
    """
    Returns base_fit and per-frame
    (w1, sx1, sy1, w2, sx2, sy2, dy, alpha).
    """
    sizes = [m1.size, m2.size]
    raw = [raw_offset(i) for i in range(FRAMES)]
    ys = [o[1] for o in raw]
    span = max(abs(min(ys)), abs(max(ys)), 1e-6)

    def layer_ok(mw: int, mh: int, sx: float, sy: float, base: float, dy: float) -> bool:
        nw = mw * base * sx
        nh = mh * base * sy
        x = (cell - nw) / 2
        y = (cell - nh) / 2 + dy
        if x < EDGE_PAD or y < EDGE_PAD:
            return False
        if x + nw > cell - EDGE_PAD or y + nh > cell - EDGE_PAD:
            return False
        return True

    def try_amp(amp: float, base: float) -> bool:
        for i in range(FRAMES):
            dy = raw[i][1] / span * amp
            w1, w2 = master_weights(i)
            if w1 > 0.01:
                sx, sy = scale_m1(i)
                if not layer_ok(sizes[0][0], sizes[0][1], sx, sy, base, dy):
                    return False
            if w2 > 0.01:
                sx, sy = scale_m2(i)
                if not layer_ok(sizes[1][0], sizes[1][1], sx, sy, base, dy):
                    return False
        return True

    target_amp = cell * 0.22
    best: tuple[float, float] | None = None
    for amp in np.linspace(target_amp, cell * 0.10, 24):
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
        raise RuntimeError("could not fit E8b1 trajectory into cell")

    amp, base = best
    frames = []
    for i in range(FRAMES):
        w1, w2 = master_weights(i)
        sx1, sy1 = scale_m1(i)
        sx2, sy2 = scale_m2(i)
        dy = raw[i][1] / span * amp
        frames.append((w1, sx1, sy1, w2, sx2, sy2, dy, rel_alpha(i)))
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
    if alpha <= 0.001:
        return canvas
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


def compose_frame(
    m1: Image.Image,
    m2: Image.Image,
    cell: int,
    base: float,
    w1: float,
    sx1: float,
    sy1: float,
    w2: float,
    sx2: float,
    sy2: float,
    dy: float,
    alpha: float,
) -> Image.Image:
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    if w1 > 0.01:
        layer = place(m1, cell, base, sx1, sy1, 0.0, dy, w1 * alpha)
        canvas = Image.alpha_composite(canvas, layer)
    if w2 > 0.01:
        layer = place(m2, cell, base, sx2, sy2, 0.0, dy, w2 * alpha)
        canvas = Image.alpha_composite(canvas, layer)
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    frames_dir = OUT / "frames"
    frames_dir.mkdir(exist_ok=True)
    for old in frames_dir.glob("frame-*.png"):
        old.unlink()

    m1 = crop_content(chroma_alpha(Image.open(M1)))
    m2 = crop_content(chroma_alpha(Image.open(M2)))
    m1.save(OUT / "master_01-transparent.png")
    m2.save(OUT / "master_02-transparent.png")

    base, motion = fit_motion(m1, m2, CELL)

    pal = []
    for i, (w1, sx1, sy1, w2, sx2, sy2, dy, alpha) in enumerate(motion):
        frame = compose_frame(m1, m2, CELL, base, w1, sx1, sy1, w2, sx2, sy2, dy, alpha)
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
        "element": "E8b1_arc_smoke",
        "strategy": "two_masters_crossfade_scale_stretch_down_fade",
        "master_01": M1.name,
        "master_02": M2.name,
        "frames": FRAMES,
        "fps": FPS,
        "cell": CELL,
        "anchors_1based": {"master_01": 4, "master_02_1_2x": 8},
        "crossfade_1based": [BLEND_START + 1, BLEND_END + 1],
        "fade_from_frame_1based": FADE_START + 1,
        "base_fit_scale": round(base, 5),
        "motion": (
            "f1 master01@0.7 H-compress; f1–f4 scale→1 + H-stretch + down; "
            "f3–f6 overlapping crossfade m1→m2 (m2 starts @0.9); "
            "f5–f8 enlarge→1.2 + down; f9–f12 H-stretch + fade + down"
        ),
    }
    (OUT / "pipeline-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (OUT / "prompt-used.txt").write_text(
        "E8b1 12f from two masters. f4=m1, f8=m2@1.2. "
        "f3–f6 overlapping crossfade, m2 enters at 0.9 (not mid-blend washout). "
        "Downward drift entire clip; H-compress→stretch then H-stretch+fade.\n"
    )

    print(f"wrote {FRAMES} frames → {OUT}")
    print(f"  base_fit={base:.4f}")
    for i in (0, 2, 3, 4, 5, 7, 8, 11):
        w1, sx1, sy1, w2, sx2, sy2, dy, a = motion[i]
        print(
            f"  f{i + 1:02d}: w1={w1:.2f} w2={w2:.2f} "
            f"sx1={sx1:.3f} sx2={sx2:.3f} dy={dy:+.1f} alpha={a:.3f}"
        )


if __name__ == "__main__":
    main()

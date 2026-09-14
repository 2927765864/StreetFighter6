#!/usr/bin/env python3
"""E7-b scattered sweat: one AI master, ballistic translate + scale + fade.

Master v1 (master.jpg) = look at frame 6 of 14.
Impulse up-left, then gravity arcs down while inertia keeps drifting left.
Content is fit into the cell so scale+drift never clips.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "runs" / "hit_ref_v1" / "E7b_sweat_scatter"
MASTER = OUT / "master.jpg"

FRAMES = 14
FPS = 30
CELL = 384
CHROMA_TOL = 95.0
EDGE_PAD = 8

# 1-based frame 6 → 0-based index 5
PEAK_FRAME = 5
SCALE_START = 0.75
SCALE_AT_PEAK = 1.0
SCALE_END = 1.24

# Last 4 frames (11–14) fade
FADE_START = FRAMES - 4  # index 10

# Ballistic (screen: +x right, +y down). Apex between f6 and f7.
# vy = VY0 + G*t = 0  →  t_apex = -VY0/G ≈ 5.4
G = 0.085
VY0 = -G * 5.4  # ≈ -0.459
VX0 = -0.135  # steady left from the initial burst


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


def ballistic_raw(i: float) -> tuple[float, float]:
    x = VX0 * i
    y = VY0 * i + 0.5 * G * i * i
    return x, y


def build_offsets() -> list[tuple[float, float]]:
    """Pixel offsets relative to peak frame, later scaled into cell fractions."""
    px, py = ballistic_raw(PEAK_FRAME)
    return [(ballistic_raw(i)[0] - px, ballistic_raw(i)[1] - py) for i in range(FRAMES)]


def rel_scale(i: int) -> float:
    if i <= PEAK_FRAME:
        u = i / PEAK_FRAME
        return lerp(SCALE_START, SCALE_AT_PEAK, ease_out(u))
    u = (i - PEAK_FRAME) / (FRAMES - 1 - PEAK_FRAME)
    return lerp(SCALE_AT_PEAK, SCALE_END, ease_out(u))


def rel_alpha(i: int) -> float:
    if i < FADE_START:
        return 1.0
    u = (i - FADE_START) / (FRAMES - 1 - FADE_START)
    return 1.0 - ease_in(u)


def fit_motion(
    mw: int, mh: int, cell: int, raw_off: list[tuple[float, float]]
) -> tuple[float, list[tuple[float, float, float, float]]]:
    """
    Pick base_fit and a trajectory scale so every frame's AABB stays in cell.
    Returns base_fit and per-frame (rel_scale, dx_px, dy_px, alpha).
    """
    # Normalize raw ballistic span to a unit-ish path, then search max amp.
    xs = [o[0] for o in raw_off]
    ys = [o[1] for o in raw_off]
    span = max(abs(min(xs)), abs(max(xs)), abs(min(ys)), abs(max(ys)), 1e-6)

    def try_amp(amp: float, base: float) -> bool:
        for i in range(FRAMES):
            rel = rel_scale(i)
            nw = mw * base * rel
            nh = mh * base * rel
            dx = raw_off[i][0] / span * amp
            dy = raw_off[i][1] / span * amp
            x = (cell - nw) / 2 + dx
            y = (cell - nh) / 2 + dy
            if x < EDGE_PAD or y < EDGE_PAD:
                return False
            if x + nw > cell - EDGE_PAD or y + nh > cell - EDGE_PAD:
                return False
        return True

    # Prefer readable travel (~18% of cell), then max base fit that still fits.
    target_amp = cell * 0.18
    best: tuple[float, float] | None = None
    for amp in np.linspace(target_amp, cell * 0.08, 24):
        # Max base for this amp
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
        raise RuntimeError("could not fit E7-b trajectory into cell")

    amp, base = best
    frames = []
    for i in range(FRAMES):
        rel = rel_scale(i)
        dx = raw_off[i][0] / span * amp
        dy = raw_off[i][1] / span * amp
        frames.append((rel, dx, dy, rel_alpha(i)))
    return base, frames


def place(src: Image.Image, canvas_size: int, scale: float, dx: float, dy: float, alpha: float) -> Image.Image:
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    w, h = src.size
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
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
    raw_off = build_offsets()
    base, motion = fit_motion(mw, mh, CELL, raw_off)

    # Apex check (for meta)
    t_apex = -VY0 / G

    pal = []
    for i, (rel, dx, dy, alpha) in enumerate(motion):
        frame = place(master_rgba, CELL, base * rel, dx, dy, alpha)
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
        "element": "E7b_sweat_scatter",
        "strategy": "single_master_then_ballistic_transform",
        "master": MASTER.name,
        "frames": FRAMES,
        "fps": FPS,
        "cell": CELL,
        "peak_frame_1based": PEAK_FRAME + 1,
        "fade_from_frame_1based": FADE_START + 1,
        "base_fit_scale": round(base, 5),
        "rel_scale": f"{SCALE_START} → {SCALE_AT_PEAK} @f6 → {SCALE_END}",
        "ballistic": {
            "vx0": VX0,
            "vy0": VY0,
            "g": G,
            "t_apex": round(t_apex, 3),
            "note": "screen +y down; left impulse + up then gravity",
        },
        "motion": "f1–f6 mild up-left; f7–f14 left-down arc; grow throughout; fade last 4",
    }
    (OUT / "pipeline-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (OUT / "prompt-used.txt").write_text(
        "E7-b master v1 (master.jpg) = natural look at frame 6 of 14. "
        "Sequence is PIL-only: ballistic up-left then left-down (inertia+gravity), "
        "continuous scale-up, alpha fades on the last 4 frames. Fit-to-cell prevents clipping.\n"
    )

    print(f"wrote {FRAMES} frames → {OUT}")
    print(f"  master {mw}x{mh}, base_fit={base:.4f}, t_apex≈{t_apex:.2f} (f{t_apex + 1:.1f})")
    for i in (0, 2, 5, 6, 9, 10, 13):
        rel, dx, dy, a = motion[i]
        print(
            f"  f{i + 1:02d}: rel={rel:.3f} dx={dx:+.1f} dy={dy:+.1f} alpha={a:.3f}"
        )


if __name__ == "__main__":
    main()

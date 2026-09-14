#!/usr/bin/env python3
"""E7 sweat spray: one AI master, then deterministic alpha / scale / translate.

Master v1 (master.jpg) is the look at ~frame 10 of 16. All motion is procedural.
Content is fit into the cell first so scale+drift never clips the spray.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "runs" / "hit_ref_v1" / "E7_sweat_spray"
MASTER = OUT / "master.jpg"

FRAMES = 16
FPS = 30
CELL = 384
CHROMA_TOL = 95.0
EDGE_PAD = 8

# 1-based frame 10 → 0-based index 9: master at natural (fitted) size
PEAK_FRAME = 9
# Relative to fitted peak size (frame 10 = 1.0)
SCALE_START = 0.42
SCALE_AT_PEAK = 1.0
SCALE_END = 1.28

# Drift toward bottom-left; more downward (gravity). Units = fraction of CELL.
DX_START_F = 0.06
DX_END_F = -0.14
DY_START_F = -0.08
DY_END_F = 0.18


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


def rel_motion(i: int) -> tuple[float, float, float, float]:
    """Relative scale (peak=1), dx/dy as CELL fractions, alpha."""
    t = i / (FRAMES - 1)
    if i <= PEAK_FRAME:
        u = i / PEAK_FRAME
        scale = lerp(SCALE_START, SCALE_AT_PEAK, ease_out(u))
    else:
        u = (i - PEAK_FRAME) / (FRAMES - 1 - PEAK_FRAME)
        scale = lerp(SCALE_AT_PEAK, SCALE_END, ease_out(u))
    dx_f = lerp(DX_START_F, DX_END_F, ease_out(t))
    dy_f = lerp(DY_START_F, DY_END_F, ease_out(t))
    if i < PEAK_FRAME:
        alpha = 1.0
    else:
        u = (i - PEAK_FRAME) / (FRAMES - 1 - PEAK_FRAME)
        alpha = 1.0 - ease_in(u)
    return scale, dx_f, dy_f, alpha


def fit_base_scale(mw: int, mh: int, cell: int) -> float:
    """Largest base scale so every frame's AABB stays inside the cell."""
    # For each frame: nw = mw * base * rel_scale
    # x = (cell - nw) / 2 + dx_f * cell
    # Require EDGE_PAD <= x and x + nw <= cell - EDGE_PAD
    # => nw / 2 + |dx_f * cell| <= cell / 2 - EDGE_PAD
    # => base * rel * mw / 2 + |dx_f| * cell <= cell/2 - EDGE_PAD
    # => base <= 2 * (cell/2 - EDGE_PAD - |dx_f|*cell) / (rel * mw)
    limits = []
    for i in range(FRAMES):
        rel, dx_f, dy_f, _ = rel_motion(i)
        room_x = cell / 2 - EDGE_PAD - abs(dx_f) * cell
        room_y = cell / 2 - EDGE_PAD - abs(dy_f) * cell
        if room_x <= 1 or room_y <= 1:
            raise RuntimeError(f"drift too large for cell at frame {i + 1}")
        limits.append(2.0 * room_x / (rel * mw))
        limits.append(2.0 * room_y / (rel * mh))
    return float(min(limits))


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
    # Soft clamp: if float math left a 1px overhang, shift in (should not clip content)
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
    base = fit_base_scale(mw, mh, CELL)
    peak_w = int(round(mw * base * SCALE_AT_PEAK))
    peak_h = int(round(mh * base * SCALE_AT_PEAK))

    pal = []
    for i in range(FRAMES):
        rel, dx_f, dy_f, alpha = rel_motion(i)
        scale = base * rel
        dx = dx_f * CELL
        dy = dy_f * CELL
        frame = place(master_rgba, CELL, scale, dx, dy, alpha)
        # Verify no content loss beyond empty pad
        a = np.asarray(frame)[..., 3]
        if a.max() == 0 and alpha > 0.01:
            raise RuntimeError(f"frame {i:02d} empty while alpha={alpha}")
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
        "element": "E7_sweat_spray",
        "strategy": "single_master_then_transform",
        "master": MASTER.name,
        "frames": FRAMES,
        "fps": FPS,
        "cell": CELL,
        "master_crop": [mw, mh],
        "base_fit_scale": round(base, 5),
        "peak_frame_1based": PEAK_FRAME + 1,
        "peak_px": [peak_w, peak_h],
        "rel_scale": f"{SCALE_START} → {SCALE_AT_PEAK} @f10 → {SCALE_END}",
        "motion": "fit-to-cell first (no clip); bottom-left drift (gravity-biased); alpha full until f10 then fade",
        "chroma_tol": CHROMA_TOL,
    }
    (OUT / "pipeline-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (OUT / "prompt-used.txt").write_text(
        "Master v1 (master.jpg) = look at frame 10 of 16. "
        "Master is fit into the cell so scale+drift never clips droplets. "
        "PIL-only: grow from small, drift bottom-left, fade from frame 10.\n"
    )
    print(f"wrote {FRAMES} frames → {OUT}")
    print(f"  master crop {mw}x{mh}, base_fit={base:.4f}, peak≈{peak_w}x{peak_h} in {CELL}")
    for i in (0, 4, 9, 12, 15):
        rel, dx_f, dy_f, a = rel_motion(i)
        print(
            f"  f{i + 1:02d}: rel={rel:.3f} abs_scale={base * rel:.4f} "
            f"dx={dx_f * CELL:.1f} dy={dy_f * CELL:.1f} alpha={a:.3f}"
        )


if __name__ == "__main__":
    main()

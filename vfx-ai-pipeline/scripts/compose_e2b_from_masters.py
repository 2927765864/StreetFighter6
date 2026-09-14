#!/usr/bin/env python3
"""E2-b hit sparks: two masters, pulse scale, slight right drift, then fade.

Frames 1–6: master.jpg with reciprocating scale 1 → 1.02 → 0.98 …
Frames 7–12: master_v2.jpg with the same pulse; last 3 frames fade out.
Gentle +X drift across the whole clip. Fit-to-cell so max scale+drift never clips.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "runs" / "hit_ref_v1" / "E2b_hit_sparks"
MASTER_A = OUT / "master.jpg"
MASTER_B = OUT / "master_v2.jpg"

FRAMES = 12
FPS = 30
CELL = 384
EDGE_PAD = 8
SWITCH_FRAME = 6  # 0-based: frame 7
FADE_START = FRAMES - 3  # index 9 → frames 10–12

SCALE_BASE = 1.0
SCALE_HI = 1.02
SCALE_LO = 0.98

# Slight rightward drift (px at cell space), frame 1 → last
DX_START = -6.0
DX_END = 18.0


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def dx_at(i: int) -> float:
    t = i / (FRAMES - 1)
    return lerp(DX_START, DX_END, t)


def chroma_sparks(im: Image.Image) -> Image.Image:
    """Key magenta (incl. dirty/dark magenta wash); keep warm orange-gold sparks."""
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    luma = 0.3 * r + 0.59 * g + 0.11 * b
    # Magenta / pink key (flat or vignetted)
    mag = (r > 140) & (b > 110) & (g < 95) & ((np.minimum(r, b) - g) > 25)
    # Warm spark: orange / gold / yellow
    warm = (r > 145) & (g > 65) & (r > b + 20) & (g > b + 10) & (luma > 85) & ~mag
    alpha = np.where(warm, 255.0, 0.0)
    # Soft edge on near-warm leftovers
    near = ~warm & ~mag & (r > 120) & (g > 50) & (r > b) & (luma > 70)
    alpha = np.where(near, np.clip((luma - 70) / 40.0, 0, 1) * 180.0, alpha)
    out = arr.copy()
    out[..., 3] = alpha
    # Clear keyed RGB to black (transparent)
    out[..., 0] = np.where(alpha > 0, r, 0)
    out[..., 1] = np.where(alpha > 0, g, 0)
    out[..., 2] = np.where(alpha > 0, b, 0)
    return Image.fromarray(np.asarray(out, dtype=np.uint8))


def crop_content(im: Image.Image, pad: int = 8) -> Image.Image:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return im
    x0, x1 = max(0, int(xs.min()) - pad), min(im.width, int(xs.max()) + pad + 1)
    y0, y1 = max(0, int(ys.min()) - pad), min(im.height, int(ys.max()) + pad + 1)
    return im.crop((x0, y0, x1, y1))


def ease_in(t: float) -> float:
    return t * t


def pulse_scale(i_local: int) -> float:
    """i_local 0 → 1.0; then alternate 1.02, 0.98, 1.02, 0.98…"""
    if i_local == 0:
        return SCALE_BASE
    return SCALE_HI if (i_local % 2 == 1) else SCALE_LO


def alpha_at(i: int) -> float:
    if i < FADE_START:
        return 1.0
    # Last 3 frames begin fading immediately (f10→f12 → 0)
    u = (i - FADE_START + 1) / 3.0
    return 1.0 - ease_in(min(1.0, u))


def fit_base(mw: int, mh: int, cell: int, max_rel: float, max_abs_dx: float) -> float:
    room_x = cell - 2 * EDGE_PAD - 2 * max_abs_dx
    room_y = cell - 2 * EDGE_PAD
    if room_x < 8:
        raise RuntimeError("dx drift too large for cell")
    return min(room_x / (mw * max_rel), room_y / (mh * max_rel))


def place(
    src: Image.Image, canvas_size: int, scale: float, dx: float, alpha: float
) -> Image.Image:
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
    y = (canvas_size - nh) // 2
    x = min(max(x, 0), canvas_size - nw)
    canvas.paste(resized, (x, y), resized)
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    frames_dir = OUT / "frames"
    frames_dir.mkdir(exist_ok=True)
    for old in frames_dir.glob("frame-*.png"):
        old.unlink()

    a = crop_content(chroma_sparks(Image.open(MASTER_A)))
    b = crop_content(chroma_sparks(Image.open(MASTER_B)))
    a.save(OUT / "master-transparent.png")
    b.save(OUT / "master_v2-transparent.png")

    max_rel = max(SCALE_BASE, SCALE_HI, SCALE_LO)
    max_abs_dx = max(abs(DX_START), abs(DX_END))
    # Shared fit so A/B swap doesn't jump in world size too wildly — use larger crop
    base_a = fit_base(a.size[0], a.size[1], CELL, max_rel, max_abs_dx)
    base_b = fit_base(b.size[0], b.size[1], CELL, max_rel, max_abs_dx)
    # Match peak footprint of the two masters (use min so both fit)
    # Prefer similar on-screen size: scale each so max side ≈ same at rel=1
    target = min(a.size[0] * base_a, b.size[0] * base_b, a.size[1] * base_a, b.size[1] * base_b)
    base_a = target / max(a.size[0], a.size[1])
    base_b = target / max(b.size[0], b.size[1])
    # Re-clamp to cell
    base_a = min(base_a, fit_base(a.size[0], a.size[1], CELL, max_rel, max_abs_dx))
    base_b = min(base_b, fit_base(b.size[0], b.size[1], CELL, max_rel, max_abs_dx))

    pal = []
    log = []
    for i in range(FRAMES):
        if i < SWITCH_FRAME:
            src, base, local = a, base_a, i
            tag = "A"
        else:
            src, base, local = b, base_b, i - SWITCH_FRAME
            tag = "B"
        rel = pulse_scale(local)
        alpha = alpha_at(i)
        dx = dx_at(i)
        frame = place(src, CELL, base * rel, dx, alpha)
        frame.save(frames_dir / f"frame-{i:02d}.png")
        pal.append(frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=64))
        log.append((i + 1, tag, rel, dx, alpha))

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
        "element": "E2b_hit_sparks",
        "strategy": "two_masters_pulse_scale_drift_fade",
        "masters": [MASTER_A.name, MASTER_B.name],
        "frames": FRAMES,
        "fps": FPS,
        "cell": CELL,
        "switch_frame_1based": SWITCH_FRAME + 1,
        "fade_from_frame_1based": FADE_START + 1,
        "pulse": f"{SCALE_BASE} → {SCALE_HI}/{SCALE_LO} reciprocating",
        "drift_x": f"{DX_START} → {DX_END}",
        "base_fit": {"A": round(base_a, 5), "B": round(base_b, 5)},
    }
    (OUT / "pipeline-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (OUT / "prompt-used.txt").write_text(
        "E2-b: master.jpg frames 1–6, master_v2.jpg frames 7–12. "
        "Reciprocating scale 1 / 1.02 / 0.98; slight right drift; last 3 frames fade.\n"
    )
    print(f"wrote {FRAMES} frames → {OUT}")
    for f, tag, rel, dx, alpha in log:
        print(f"  f{f:02d} {tag} scale={rel:.2f} dx={dx:+.1f} alpha={alpha:.3f}")


if __name__ == "__main__":
    main()

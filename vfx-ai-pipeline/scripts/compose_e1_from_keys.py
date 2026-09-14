#!/usr/bin/env python3
"""Build E1 10-frame sequence from 3 authored keys via alpha / scale / drift.

Keys:
  A = peak (ref ~frame 1)
  B = mid  (ref ~frame 7)
  C = dying (ref ~frame 10)

Timeline (30fps, E1 lives on t=1..10 of the 17-frame hit):
  0-2  A platform (appear-at-peak)
  3-4  A → B
  5-6  B
  7-8  B → C
  9    C dying

Anchor is the LEFT content edge (fist contact), not bbox center.
Scale is applied around that contact so mass shrinks toward the punch.
Drift is to the RIGHT (strike direction).
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
KEYS = ROOT / "runs" / "hit_ref_v1" / "E1_core_flash" / "iter11_keyframes"
OUT = ROOT / "runs" / "hit_ref_v1" / "E1_core_flash"
PUBLIC = ROOT.parent / "app" / "public" / "vfx" / "hit_ref_v1" / "E1_core_flash"

CELL = 512
N = 10
FPS = 30

# Fit the peak sprite so its bbox width is this fraction of the cell.
PEAK_WIDTH_FRAC = 0.62
CONTACT_X = 72
CONTACT_Y = CELL // 2

# Per output frame (index 0 = ref frame 1).
# Extra scale on top of each key's native size (A is authored at ~peak).
SCALE = [1.00, 0.97, 1.00, 0.90, 0.78, 0.70, 0.66, 0.58, 0.48, 0.40]
OPACITY = [1.00, 0.96, 1.00, 0.88, 0.78, 0.72, 0.68, 0.52, 0.36, 0.22]
# Rightward drift in pixels.
DRIFT = [0, 6, 14, 24, 36, 50, 64, 80, 96, 112]
# Mix of A, B, C (must sum to 1).
MIX = [
    (1.00, 0.00, 0.00),
    (0.92, 0.08, 0.00),
    (0.80, 0.20, 0.00),
    (0.45, 0.55, 0.00),
    (0.15, 0.85, 0.00),
    (0.00, 1.00, 0.00),
    (0.00, 0.92, 0.08),
    (0.00, 0.50, 0.50),
    (0.00, 0.18, 0.82),
    (0.00, 0.00, 1.00),
]


def black_to_alpha(im: Image.Image, lo: float = 10.0, hi: float = 140.0) -> Image.Image:
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    luma = rgb.max(axis=2)
    a = np.clip((luma - lo) / (hi - lo), 0.0, 1.0)
    # crush near-black fringe
    a = np.where(luma < lo, 0.0, a)
    rgba = np.dstack([rgb, a * 255.0]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def content_bbox(im: Image.Image, a_min: int = 12) -> tuple[int, int, int, int]:
    a = np.asarray(im.getchannel("A"))
    ys, xs = np.where(a >= a_min)
    if xs.size == 0:
        w, h = im.size
        return 0, 0, w, h
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def crop_pad(im: Image.Image, pad: int = 8) -> Image.Image:
    x0, y0, x1, y1 = content_bbox(im)
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.size[0], x1 + pad)
    y1 = min(im.size[1], y1 + pad)
    return im.crop((x0, y0, x1, y1))


def load_key(path: Path) -> Image.Image:
    return crop_pad(black_to_alpha(Image.open(path)))


def paste_left_anchor(
    canvas: np.ndarray,
    sprite: Image.Image,
    *,
    contact: tuple[int, int],
    scale: float,
    opacity: float,
    drift_x: float,
) -> None:
    if scale <= 0.01 or opacity <= 0.01:
        return
    sw, sh = sprite.size
    nw = max(1, int(round(sw * scale)))
    nh = max(1, int(round(sh * scale)))
    resized = sprite.resize((nw, nh), Image.Resampling.LANCZOS)
    # left content edge + vertical center of content
    x0, y0, x1, y1 = content_bbox(resized)
    left = x0
    cy = (y0 + y1) / 2.0
    dest_x = int(round(contact[0] + drift_x - left))
    dest_y = int(round(contact[1] - cy))

    src = np.asarray(resized).astype(np.float32)
    H, W = canvas.shape[:2]
    x1d = dest_x + nw
    y1d = dest_y + nh
    sx0 = 0
    sy0 = 0
    dx0 = dest_x
    dy0 = dest_y
    if dx0 < 0:
        sx0 = -dx0
        dx0 = 0
    if dy0 < 0:
        sy0 = -dy0
        dy0 = 0
    if x1d > W:
        x1d = W
    if y1d > H:
        y1d = H
    if dx0 >= x1d or dy0 >= y1d:
        return
    patch = src[sy0 : sy0 + (y1d - dy0), sx0 : sx0 + (x1d - dx0)]
    sa = (patch[..., 3:4] / 255.0) * opacity
    dst = canvas[dy0:y1d, dx0:x1d]
    # additive RGB, max alpha (flash)
    dst[..., :3] = np.clip(dst[..., :3] + patch[..., :3] * sa, 0, 255)
    dst[..., 3:4] = np.clip(np.maximum(dst[..., 3:4], patch[..., 3:4] * opacity), 0, 255)
    canvas[dy0:y1d, dx0:x1d] = dst


def save_gif(frames: list[Image.Image], path: Path, duration_ms: int) -> None:
    pal = []
    for fr in frames:
        bg = Image.new("RGBA", fr.size, (12, 12, 14, 255))
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


def pack_strip(frames: list[Image.Image]) -> Image.Image:
    cell = frames[0].size[0]
    strip = Image.new("RGBA", (cell * len(frames), cell), (0, 0, 0, 255))
    for i, fr in enumerate(frames):
        bg = Image.new("RGBA", fr.size, (12, 12, 14, 255))
        bg = Image.alpha_composite(bg, fr)
        strip.paste(bg.convert("RGBA"), (i * cell, 0))
    return strip


def main() -> None:
    a = load_key(KEYS / "key_01_peak_v4.jpg")
    b = load_key(KEYS / "key_07_mid.jpg")
    c = load_key(KEYS / "key_10_dying_v10.jpg")

    # Normalize so peak bbox width matches PEAK_WIDTH_FRAC * CELL.
    aw = content_bbox(a)[2] - content_bbox(a)[0]
    peak_scale = (CELL * PEAK_WIDTH_FRAC) / max(aw, 1)
    def fit(im: Image.Image) -> Image.Image:
        nw = max(1, int(round(im.size[0] * peak_scale)))
        nh = max(1, int(round(im.size[1] * peak_scale)))
        return im.resize((nw, nh), Image.Resampling.LANCZOS)

    a, b, c = fit(a), fit(b), fit(c)
    # Mid/dying already smaller in artwork; leave native relative size after shared fit.

    seq_dir = OUT / "iter11_seq"
    frames_dir = OUT / "frames"
    seq_dir.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)

    frames: list[Image.Image] = []
    for i in range(N):
        canvas = np.zeros((CELL, CELL, 4), dtype=np.float32)
        wa, wb, wc = MIX[i]
        scale = SCALE[i]
        opac = OPACITY[i]
        drift = DRIFT[i]
        contact = (CONTACT_X, CONTACT_Y)
        if wa > 0:
            paste_left_anchor(canvas, a, contact=contact, scale=scale, opacity=opac * wa, drift_x=drift)
        if wb > 0:
            paste_left_anchor(canvas, b, contact=contact, scale=scale, opacity=opac * wb, drift_x=drift)
        if wc > 0:
            paste_left_anchor(canvas, c, contact=contact, scale=scale, opacity=opac * wc, drift_x=drift)
        im = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), "RGBA")
        # tiny blur to hide mix seams
        if 0 < max(wa, wb, wc) < 0.99 and wa + wb + wc > 0.99:
            rgb = im.convert("RGB").filter(ImageFilter.GaussianBlur(0.4))
            achan = im.getchannel("A")
            im = Image.merge("RGBA", (*rgb.split(), achan))
        frames.append(im)
        im.save(seq_dir / f"frame-{i:02d}.png")
        im.save(frames_dir / f"frame-{i:02d}.png")

    sheet = Image.new("RGBA", (CELL * 5, CELL * 2), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        r, col = divmod(i, 5)
        sheet.paste(fr, (col * CELL, r * CELL), fr)
    sheet.save(OUT / "sheet-transparent.png")
    save_gif(frames, OUT / "preview.gif", duration_ms=round(1000 / FPS))
    save_gif(frames, seq_dir / "preview.gif", duration_ms=round(1000 / FPS))
    pack_strip(frames).save(seq_dir / "contact_strip.png")

    if PUBLIC.exists():
        for i, fr in enumerate(frames):
            fr.save(PUBLIC / f"frame-{i:02d}.png")

    meta = {
        "element": "E1_core_flash",
        "iter": 11,
        "method": "3-key alpha/scale/drift",
        "keys": {
            "A": "iter11_keyframes/key_01_peak_v4.jpg",
            "B": "iter11_keyframes/key_07_mid.jpg",
            "C": "iter11_keyframes/key_10_dying_v10.jpg",
        },
        "frames": N,
        "fps": FPS,
        "cell": CELL,
        "contact": [CONTACT_X, CONTACT_Y],
        "scale": SCALE,
        "opacity": OPACITY,
        "drift_px": DRIFT,
        "mix_ABC": MIX,
        "anchor": "left-edge",
    }
    (OUT / "pipeline-meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    (seq_dir / "pipeline-meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"wrote {N} frames → {frames_dir} and {seq_dir}")


if __name__ == "__main__":
    main()

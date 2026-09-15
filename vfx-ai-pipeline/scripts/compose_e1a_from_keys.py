#!/usr/bin/env python3
"""Build E1-a 13-frame sequence from iter11 keys A/B/C.

A = key_01_peak_v4  (top)
B = key_07_mid      (directly under A, same left-edge / vertical center)
C = key_10_dying    (directly under B, same placement)

Timeline (13 frames, 30fps):
  0      A+B+C, opacity 1. Rest pose.
  1-3    shake around rest (left-up / right / right-up + stretch)
  4-7    A 1→0.3, B 1→0.6, C stays 1; group drifts right, stretch Y, squash X
  8-12   A/B/C → 0; group drifts right, stretch X, squash Y

Scale is around the content center so X-squash does not cancel the right pan.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
KEYS = ROOT / "runs" / "hit_ref_v1" / "E1_core_flash" / "iter11_keyframes"
OUT = ROOT / "runs" / "hit_ref_v1" / "E1a_core_flash"
PUBLIC = ROOT.parent / "app" / "public" / "vfx" / "hit_ref_v1" / "E1a_core_flash"

CELL = 512
N = 13
FPS = 30
PEAK_WIDTH_FRAC = 0.62
CONTACT_X = 40
CONTACT_Y = CELL // 2

# Per-frame group transform relative to frame-0 rest (content-center pivot).
# dx, dy, sx, sy, a_op, b_op, c_op
FRAMES = [
    # 1: rest, all three full, stacked in place
    (0, 0, 1.00, 1.00, 1.00, 1.00, 1.00),
    # 2: left-up + vertical stretch
    (-16, -14, 1.00, 1.10, 1.00, 1.00, 1.00),
    # 3: right of rest + horizontal stretch
    (18, 0, 1.10, 1.00, 1.00, 1.00, 1.00),
    # 4: right-up + vertical stretch
    (14, -12, 1.00, 1.09, 1.00, 1.00, 1.00),
    # 5-8: A 1→0.3, B 1→0.6; whole group walks right from the shake
    (38, 0, 0.97, 1.06, 1.00, 1.00, 1.00),
    (62, 0, 0.94, 1.12, 0.77, 0.87, 1.00),
    (86, 0, 0.91, 1.18, 0.53, 0.73, 1.00),
    (110, 0, 0.88, 1.24, 0.30, 0.60, 1.00),
    # 9-13: all → 0; keep walking right, +X, -Y
    (134, 0, 0.93, 1.16, 0.24, 0.48, 0.80),
    (158, 0, 0.98, 1.08, 0.18, 0.36, 0.60),
    (182, 0, 1.03, 1.00, 0.12, 0.24, 0.40),
    (206, 0, 1.08, 0.92, 0.06, 0.12, 0.20),
    (230, 0, 1.13, 0.84, 0.00, 0.00, 0.00),
]


def black_to_alpha(im: Image.Image, lo: float = 10.0, hi: float = 140.0) -> Image.Image:
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    luma = rgb.max(axis=2)
    a = np.clip((luma - lo) / (hi - lo), 0.0, 1.0)
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


def paste_rgba(
    canvas: np.ndarray,
    sprite: Image.Image,
    dest_x: float,
    dest_y: float,
    opacity: float,
) -> None:
    if opacity <= 0.01:
        return
    nw, nh = sprite.size
    src = np.asarray(sprite).astype(np.float32)
    H, W = canvas.shape[:2]
    dx0 = int(round(dest_x))
    dy0 = int(round(dest_y))
    x1d = dx0 + nw
    y1d = dy0 + nh
    sx0 = 0
    sy0 = 0
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
    dst[..., :3] = np.clip(dst[..., :3] + patch[..., :3] * sa, 0, 255)
    dst[..., 3:4] = np.clip(np.maximum(dst[..., 3:4], patch[..., 3:4] * opacity), 0, 255)
    canvas[dy0:y1d, dx0:x1d] = dst


def rest_placement(
    sprite: Image.Image,
    left_x: float,
    cy: float,
) -> tuple[float, float]:
    """Top-left so content left edge is left_x and content vertical center is cy."""
    x0, y0, x1, y1 = content_bbox(sprite)
    dest_x = left_x - x0
    dest_y = cy - (y0 + y1) / 2.0
    return dest_x, dest_y


def transform_dest(
    dest_x: float,
    dest_y: float,
    w: int,
    h: int,
    *,
    pivot: tuple[float, float],
    sx: float,
    sy: float,
    ox: float,
    oy: float,
) -> tuple[float, float, int, int]:
    px, py = pivot
    ndx = px + (dest_x - px) * sx + ox
    ndy = py + (dest_y - py) * sy + oy
    return ndx, ndy, max(1, int(round(w * sx))), max(1, int(round(h * sy)))


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

    aw = content_bbox(a)[2] - content_bbox(a)[0]
    peak_scale = (CELL * PEAK_WIDTH_FRAC) / max(aw, 1)

    def fit(im: Image.Image, extra: float = 1.0) -> Image.Image:
        s = peak_scale * extra
        nw = max(1, int(round(im.size[0] * s)))
        nh = max(1, int(round(im.size[1] * s)))
        return im.resize((nw, nh), Image.Resampling.LANCZOS)

    a = fit(a, 1.0)
    b = fit(b, 1.0)
    c = fit(c, 1.0)

    ax0, ay0, ax1, ay1 = content_bbox(a)
    a_left = CONTACT_X
    a_cy = CONTACT_Y
    a_w = ax1 - ax0

    # B and C share A's left edge + vertical center (stacked directly under A).
    a_dx, a_dy = rest_placement(a, a_left, a_cy)
    b_dx, b_dy = rest_placement(b, a_left, a_cy)
    c_dx, c_dy = rest_placement(c, a_left, a_cy)
    pivot = (a_left + a_w / 2.0, a_cy)

    seq_dir = OUT / "iter1_seq"
    frames_dir = OUT / "frames"
    seq_dir.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    frames: list[Image.Image] = []
    for i in range(N):
        ox, oy, sx, sy, oa, ob, oc = FRAMES[i]
        canvas = np.zeros((CELL, CELL, 4), dtype=np.float32)
        # Draw under → over: C, B, A
        for sprite, dx, dy, op in (
            (c, c_dx, c_dy, oc),
            (b, b_dx, b_dy, ob),
            (a, a_dx, a_dy, oa),
        ):
            ndx, ndy, nw, nh = transform_dest(
                dx, dy, sprite.size[0], sprite.size[1],
                pivot=pivot, sx=sx, sy=sy, ox=ox, oy=oy,
            )
            resized = sprite.resize((nw, nh), Image.Resampling.LANCZOS)
            paste_rgba(canvas, resized, ndx, ndy, op)
        im = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), "RGBA")
        frames.append(im)
        im.save(seq_dir / f"frame-{i:02d}.png")
        im.save(frames_dir / f"frame-{i:02d}.png")
        im.save(PUBLIC / f"frame-{i:02d}.png")

    sheet = Image.new("RGBA", (CELL * 5, CELL * 3), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        r, col = divmod(i, 5)
        sheet.paste(fr, (col * CELL, r * CELL), fr)
    sheet.save(OUT / "sheet-transparent.png")
    save_gif(frames, OUT / "preview.gif", duration_ms=round(1000 / FPS))
    save_gif(frames, seq_dir / "preview.gif", duration_ms=round(1000 / FPS))
    pack_strip(frames).save(seq_dir / "contact_strip.png")
    pack_strip(frames).save(OUT / "contact_strip.png")

    meta = {
        "element": "E1a_core_flash",
        "iter": 1,
        "method": "3-key stacked A/B/C with shake then pan",
        "keys": {
            "A": "E1_core_flash/iter11_keyframes/key_01_peak_v4.jpg",
            "B": "E1_core_flash/iter11_keyframes/key_07_mid.jpg",
            "C": "E1_core_flash/iter11_keyframes/key_10_dying_v10.jpg",
        },
        "frames": N,
        "fps": FPS,
        "cell": CELL,
        "contact": [CONTACT_X, CONTACT_Y],
        "timeline": [
            {
                "i": i,
                "dx": FRAMES[i][0],
                "dy": FRAMES[i][1],
                "sx": FRAMES[i][2],
                "sy": FRAMES[i][3],
                "A": FRAMES[i][4],
                "B": FRAMES[i][5],
                "C": FRAMES[i][6],
            }
            for i in range(N)
        ],
        "anchor": "A-content-center",
    }
    (OUT / "pipeline-meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    (seq_dir / "pipeline-meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"wrote {N} frames → {frames_dir} and {seq_dir} and {PUBLIC}")


if __name__ == "__main__":
    main()

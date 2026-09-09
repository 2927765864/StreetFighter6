#!/usr/bin/env python3
"""Preview-only stack of E1–E6 onto a dark canvas (not a runtime recipe).

Timeline matches the 17-frame @30fps reference:
  t=0 empty
  t=1..10 E1+E2 (10 frames) + E3/E4/E5/E6
  t=11..14 smoke remnant only
  t=15..16 empty

Layer order: E3, E4, E5, E6 (alpha over) then E2, E1 (additive).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "runs" / "hit_ref_v1"
OUT = RUN / "compose_e1_e6"
CANVAS = 512
BG = (12, 14, 18, 255)
N = 17


def load_seq(name: str) -> list[Image.Image]:
    d = RUN / name / "frames"
    return [Image.open(p).convert("RGBA") for p in sorted(d.glob("frame-*.png"))]


def fit_center(im: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    w, h = im.size
    scale = (size * 0.92) / max(w, h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def additive(dst: Image.Image, src: Image.Image) -> Image.Image:
    d = np.asarray(dst).astype(np.float32)
    s = np.asarray(src).astype(np.float32)
    sa = s[..., 3:4] / 255.0
    out = d.copy()
    out[..., :3] = np.clip(d[..., :3] + s[..., :3] * sa, 0, 255)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def layer_at(seq: list[Image.Image], t: int, start: int = 1):
    i = t - start
    if i < 0 or i >= len(seq):
        return None
    return seq[i]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "frames").mkdir(exist_ok=True)
    e1 = load_seq("E1_core_flash")
    e2 = load_seq("E2_near_sparks")
    e3 = load_seq("E3_ring_smoke")
    e4 = load_seq("E4_wide_short_smoke")
    e5 = load_seq("E5_narrow_long_smoke")
    e6 = load_seq("E6_narrow_long_smoke_rtl")

    pal = []
    for t in range(N):
        canvas = Image.new("RGBA", (CANVAS, CANVAS), BG)
        for seq in (e3, e4, e5, e6):
            im = layer_at(seq, t)
            if im is not None:
                canvas = Image.alpha_composite(canvas, fit_center(im, CANVAS))
        for seq in (e2, e1):
            im = layer_at(seq, t)
            if im is not None:
                canvas = additive(canvas, fit_center(im, CANVAS))
        names = [n for n, s in (("E1", e1), ("E2", e2), ("E3", e3), ("E4", e4), ("E5", e5), ("E6", e6)) if layer_at(s, t)]
        tag = f"t={t:02d}  " + ("+".join(names) if names else "empty")
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((6, CANVAS - 28, 250, CANVAS - 6), fill=(0, 0, 0, 160))
        draw.text((12, CANVAS - 24), tag, fill=(230, 230, 230, 255))
        canvas.save(OUT / "frames" / f"comp-{t:02d}.png")
        pal.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=256))

    pal[0].save(OUT / "preview.gif", save_all=True, append_images=pal[1:], duration=33, loop=0, disposal=2)
    strip = Image.new("RGB", (CANVAS * N, CANVAS), BG[:3])
    for i in range(N):
        strip.paste(Image.open(OUT / "frames" / f"comp-{i:02d}.png").convert("RGB"), (i * CANVAS, 0))
    strip.resize((CANVAS * N // 4, CANVAS // 4), Image.Resampling.LANCZOS).save(OUT / "contact_strip.png")
    Image.open(OUT / "frames" / "comp-02.png").save(OUT / "peak.png")
    print(OUT)


if __name__ == "__main__":
    main()

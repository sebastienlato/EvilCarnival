#!/usr/bin/env python3
"""Convert the source PNGs in assets/ into web-sized WebP files in public/assets/.

Usage:  python3 tools/optimize_assets.py
Needs Pillow + numpy. Source PNGs are never modified.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets"
OUT = ROOT / "public" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

# name: (max long edge, quality)
SPEC = {
    "sky_night_panorama": (2048, 80),
    "moon_blood": (1024, 85),
    "treeline_silhouette": (1536, 85),
    "carnival_skyline_silhouette": (1536, 85),
    "gate_clown_face": (1536, 88),
    "clown_eyeball": (1024, 88),
    "logo_hollowgrin_lit": (1536, 88),
    "logo_hollowgrin_unlit": (1536, 88),
    "tex_tent_stripes": (1024, 80),
    "tex_carousel_canopy": (1536, 82),
    "carousel_horse_skeleton": (1024, 85),
    "carousel_goat": (1024, 85),
    "carousel_serpent": (1024, 85),
    "tex_ground_sawdust": (1024, 78),
    "tex_rusted_metal": (1024, 78),
    "mirror_frame_ornate": (1536, 85),
    "clown_silhouette_behind": (1024, 85),
    "fortune_machine": (1536, 88),
    "card_back": (1024, 85),
    "card_the_jester": (1024, 85),
    "card_the_ringmaster": (1024, 85),
    "card_the_red_balloon": (1024, 85),
    "card_the_wheel": (1024, 85),
    "ringmaster_hero": (1536, 88),
    "poster_belladonna": (1280, 84),
    "poster_gemini": (1280, 84),
    "poster_marrow": (1280, 84),
    "balloon_face": (512, 85),
    "ticket_front": (1536, 88),
    "ticket_back": (1536, 88),
    "debris_atlas": (1024, 85),
    "tex_velvet_curtain": (1024, 78),
    "ui_playbill_paper": (1024, 80),
}


def resize(im, long_edge):
    w, h = im.size
    s = long_edge / max(w, h)
    if s < 1:
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    return im


def main():
    total = 0
    for name, (edge, q) in SPEC.items():
        src = SRC / f"{name}.png"
        if not src.exists():
            print(f"  missing {src.name}, skipped")
            continue
        im = resize(Image.open(src), edge)
        dst = OUT / f"{name}.webp"
        im.save(dst, "WEBP", quality=q, method=6, alpha_quality=90)
        total += dst.stat().st_size
        print(f"  {dst.name:36s} {im.size[0]}x{im.size[1]}  {dst.stat().st_size / 1024:7.0f} KB")

    # Smoke: black background -> luminance becomes alpha (white RGB).
    smoke = resize(Image.open(SRC / "smoke_puff.png").convert("L"), 512)
    a = np.asarray(smoke).astype(np.float32) / 255.0
    a = np.clip((a - 0.03) / 0.97, 0, 1) ** 1.1
    # Force a soft falloff to zero at the edges so billboards never show a square.
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    a *= np.clip((1.0 - r) / 0.25, 0, 1)
    rgba = np.dstack([np.full_like(a, 255), np.full_like(a, 255), np.full_like(a, 255), a * 255]).astype(np.uint8)
    dst = OUT / "smoke_puff.webp"
    Image.fromarray(rgba, "RGBA").save(dst, "WEBP", quality=85, method=6)
    total += dst.stat().st_size
    print(f"  {dst.name:36s} 512x512  {dst.stat().st_size / 1024:7.0f} KB")

    # Cursor: small PNG for CSS/DOM use, cropped to the glove.
    glove = Image.open(SRC / "cursor_glove.png").convert("RGBA")
    glove = glove.crop(glove.getbbox())
    glove.thumbnail((160, 160), Image.LANCZOS)
    glove.save(OUT / "cursor_glove.webp", "WEBP", quality=90)
    print(f"  cursor_glove.webp {glove.size}")

    # Favicon from the eyeball.
    eye = Image.open(SRC / "clown_eyeball.png").convert("RGBA")
    eye = eye.crop(eye.getbbox()).resize((64, 64), Image.LANCZOS)
    eye.save(OUT / "favicon.png")

    print(f"total ≈ {total / 1024 / 1024:.1f} MB")
    detect_bulbs()


def detect_bulbs():
    """Find the painted marquee bulbs (hot, near-white blobs with a warm halo) so the
    site can place real HDR glow sprites exactly on top of them. Writes bulbs.json."""
    import json
    try:
        from scipy import ndimage
    except ImportError:
        print("  scipy not installed: skipping bulbs.json (pip3 install scipy)")
        return
    out = {}
    for name in ["gate_clown_face", "fortune_machine", "mirror_frame_ornate", "logo_hollowgrin_lit"]:
        im = np.asarray(Image.open(SRC / f"{name}.png").convert("RGBA")).astype(np.float32)
        r, g, b, a = im[..., 0], im[..., 1], im[..., 2], im[..., 3]
        lum = 0.3 * r + 0.59 * g + 0.11 * b
        lab, n = ndimage.label((lum > 246) & (a > 200))
        H, W = lum.shape
        pts = []
        for i in range(1, n + 1):
            ys, xs = np.where(lab == i)
            if len(xs) < 12 or len(xs) > 1500:
                continue
            w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
            if max(w, h) > 2.6 * min(w, h):
                continue
            cx, cy, rr = int(xs.mean()), int(ys.mean()), int(max(w, h) * 1.2) + 3
            patch = im[max(cy - rr, 0):min(cy + rr, H), max(cx - rr, 0):min(cx + rr, W)]
            if (patch[..., 0] - patch[..., 2]).mean() < 35:  # needs a warm halo
                continue
            u, v = xs.mean() / W, ys.mean() / H
            if name == "gate_clown_face" and 0.44 < u < 0.57 and 0.26 < v < 0.36:
                continue  # the highlight on the clown's nose is not a bulb
            pts.append([round(u, 4), round(v, 4), round(max(w, h) / 2 / W, 4)])
        out[name] = pts
        print(f"  bulbs: {name:24s} {len(pts)}")
    (OUT / "bulbs.json").write_text(json.dumps(out))


if __name__ == "__main__":
    main()

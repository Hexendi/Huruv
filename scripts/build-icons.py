#!/usr/bin/env python3
"""Regenerate the extension icons from the master logo.

Requires Pillow:  python3 -m pip install pillow

The source is `assets/noousra-icon.png`. Icons are written to
`public/icons/`, which Vite copies into `dist/` unchanged. Set the source in
`SOURCE` if the logo file is renamed.

The supplied logo is a white mark on a large transparent canvas. Icons are
composited on a navy tile so they stay visible in both light and dark browser
toolbars, and the transparent margin is trimmed before scaling.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "noousra-icon.png"
OUTPUT = ROOT / "public" / "icons"
SIZES = (16, 32, 48, 128, 256, 512)

NAVY = (17, 26, 104, 255)
WHITE = (255, 255, 255, 255)
ALPHA_THRESHOLD = 32


def load_mark() -> Image.Image:
    source = Image.open(SOURCE).convert("RGBA")
    alpha = source.getchannel("A")
    visible = alpha.point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    bounds = visible.getbbox()
    if bounds is None:
        raise SystemExit("The logo source is fully transparent.")

    mark = source.crop(bounds)

    # Normalize the white mark to full opacity; the source has a faint alpha
    # halo that becomes muddy when scaled down.
    pixels = mark.load()
    for y in range(mark.height):
        for x in range(mark.width):
            r, g, b, a = pixels[x, y]
            if a > ALPHA_THRESHOLD:
                pixels[x, y] = (WHITE[0], WHITE[1], WHITE[2], 255)

    return mark


def fit(mark: Image.Image, box: int) -> Image.Image:
    scale = min(box / mark.width, box / mark.height)
    width = max(1, round(mark.width * scale))
    height = max(1, round(mark.height * scale))
    return mark.resize((width, height), Image.Resampling.LANCZOS)


def rounded_tile(size: int, radius_ratio: float = 0.2) -> Image.Image:
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    radius = max(2, round(size * radius_ratio))
    draw.rounded_rectangle(
        (0, 0, size - 1, size - 1),
        radius=radius,
        fill=NAVY,
    )
    return tile


def render(mark: Image.Image, size: int, mark_ratio: float) -> Image.Image:
    canvas = rounded_tile(size)
    inner = fit(mark, max(1, round(size * mark_ratio)))
    canvas.alpha_composite(
        inner,
        ((size - inner.width) // 2, (size - inner.height) // 2),
    )
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing master logo: {SOURCE}")

    mark = load_mark()
    OUTPUT.mkdir(parents=True, exist_ok=True)

    for size in SIZES:
        ratio = 0.74 if size >= 32 else 0.8
        render(mark, size, ratio).save(OUTPUT / f"icon-{size}.png")

    render(mark, 256, 0.7).save(OUTPUT / "logo-256.png")

    print(f"Wrote {len(SIZES) + 1} files to {OUTPUT}")


if __name__ == "__main__":
    main()

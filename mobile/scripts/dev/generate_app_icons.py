#!/usr/bin/env python3
"""Generate DeDato mobile launcher assets from assets/dedato_trnsp.png (brand mark only)."""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
SRC = ASSETS / "dedato_trnsp.png"
SIZE = 1024
# DeDato design system — Vibrant Green
BG = (76, 175, 80, 255)  # #4CAF50
WHITE = (255, 255, 255, 255)


def extract_icon_mark(src: Image.Image) -> Image.Image:
    """Crop calendar mark (exclude wordmark) from brand PNG."""
    w, h = src.size
    thumb = src.copy()
    thumb.thumbnail((900, 900), Image.Resampling.LANCZOS)
    tw, th = thumb.size
    alpha = thumb.split()[3]
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("No opaque pixels in brand source")
    x0, y0, x1, y1 = bbox
    bh = y1 - y0
    # Wordmark sits below the calendar; keep upper ~58% of content bbox.
    icon_bottom = y0 + int(bh * 0.58)
    icon = thumb.crop((x0, y0, x1, icon_bottom))
    ib = icon.split()[3].getbbox()
    if ib:
        icon = icon.crop(ib)
    return icon


def mark_to_white(mark: Image.Image) -> Image.Image:
    """Green mark → white silhouette, preserve alpha."""
    mark = mark.convert("RGBA")
    r, g, b, a = mark.split()
    white_layer = Image.new("RGBA", mark.size, WHITE)
    white_layer.putalpha(a)
    return white_layer


def fit_center(canvas: int, mark: Image.Image, scale: float) -> Image.Image:
    side = int(canvas * scale)
    m = mark.copy()
    m.thumbnail((side, side), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    ox = (canvas - m.width) // 2
    oy = (canvas - m.height) // 2
    out.paste(m, (ox, oy), m)
    return out


def save_rgb(img: Image.Image, path: Path) -> None:
    img.convert("RGB").save(path, format="PNG", optimize=True)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing brand source: {SRC}")

    src = Image.open(SRC).convert("RGBA")
    mark = extract_icon_mark(src)
    white = mark_to_white(mark)

    # App icon: solid green + white calendar mark
    icon = Image.new("RGBA", (SIZE, SIZE), BG)
    fg = fit_center(SIZE, white, 0.52)
    icon = Image.alpha_composite(icon, fg)
    save_rgb(icon, ASSETS / "icon.png")

    # Adaptive foreground: white mark, ~66% safe area on transparent
    adaptive_fg = fit_center(SIZE, white, 0.58)
    adaptive_fg.save(ASSETS / "adaptive-icon.png", format="PNG", optimize=True)

    # Splash: green mark on white (matches splash backgroundColor #fff)
    splash = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 255))
    green_mark = fit_center(SIZE, mark, 0.45)
    splash = Image.alpha_composite(splash, green_mark)
    save_rgb(splash, ASSETS / "splash-icon.png")

    # Favicon
    fav = icon.resize((48, 48), Image.Resampling.LANCZOS)
    save_rgb(fav, ASSETS / "favicon.png")

    print("Wrote:", ASSETS / "icon.png")
    print("Wrote:", ASSETS / "adaptive-icon.png")
    print("Wrote:", ASSETS / "splash-icon.png")
    print("Wrote:", ASSETS / "favicon.png")

    sync_android_mipmaps(icon, adaptive_fg)
    print("Synced Android mipmap webp icons")

    sync_android_splash(ASSETS / "splash-icon.png")
    print("Synced Android splashscreen_logo pngs")

    ios_icon = (
        ROOT
        / "ios"
        / "DeDato"
        / "Images.xcassets"
        / "AppIcon.appiconset"
        / "App-Icon-1024x1024@1x.png"
    )
    if ios_icon.parent.exists():
        save_rgb(icon, ios_icon)
        print("Wrote:", ios_icon)


def sync_android_splash(splash_path: Path) -> None:
    res = ROOT / "android" / "app" / "src" / "main" / "res"
    splash_sizes = {
        "drawable-mdpi": 288,
        "drawable-hdpi": 432,
        "drawable-xhdpi": 576,
        "drawable-xxhdpi": 864,
        "drawable-xxxhdpi": 1152,
    }
    base = Image.open(splash_path).convert("RGB")
    for folder, side in splash_sizes.items():
        out_dir = res / folder
        if not out_dir.exists():
            continue
        img = base.resize((side, side), Image.Resampling.LANCZOS)
        img.save(out_dir / "splashscreen_logo.png", format="PNG", optimize=True)


def sync_android_mipmaps(icon_rgb: Image.Image, adaptive_fg: Image.Image) -> None:
    """Update committed bare-project launcher mipmaps (EAS does not apply app.config icon)."""
    res = ROOT / "android" / "app" / "src" / "main" / "res"
    legacy_sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    fg_sizes = {
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }
    icon_rgb = icon_rgb.convert("RGB")
    adaptive_fg = adaptive_fg.convert("RGBA")

    for folder, side in legacy_sizes.items():
        out_dir = res / folder
        if not out_dir.exists():
            continue
        img = icon_rgb.resize((side, side), Image.Resampling.LANCZOS)
        img.save(out_dir / "ic_launcher.webp", format="WEBP", quality=92, method=6)
        img.save(out_dir / "ic_launcher_round.webp", format="WEBP", quality=92, method=6)

    for folder, side in fg_sizes.items():
        out_dir = res / folder
        if not out_dir.exists():
            continue
        fg = adaptive_fg.resize((side, side), Image.Resampling.LANCZOS)
        fg.save(out_dir / "ic_launcher_foreground.webp", format="WEBP", quality=92, method=6)


if __name__ == "__main__":
    main()

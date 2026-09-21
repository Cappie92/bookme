#!/usr/bin/env python3
"""Generate DeDato mobile launcher assets from assets/dedato_trnsp.png (brand mark only).

Android adaptive foreground is derived from assets/icon.png (visual source of truth).
Android AdaptiveIconDrawable DEFAULT_VIEW_PORT_SCALE is 2/3: extra 18dp inset on each
side of the 108dp layer, so the launcher only shows the inner 72dp. Scaling the
icon.png artwork by 2/3 on the transparent 108dp layer makes the masked glyph match
the logo footprint inside icon.png.
"""

from __future__ import annotations

import json
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
GREEN_MATCH_THRESH = 18
# Android AdaptiveIconDrawable DEFAULT_VIEW_PORT_SCALE = 1 / (1 + 2 * 0.25) = 2/3
ADAPTIVE_VIEWPORT_SCALE = 2 / 3
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
ANDROID_LEGACY_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
ANDROID_FG_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


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


def icon_to_transparent_artwork(icon: Image.Image) -> Image.Image:
    """Keep only non-green pixels from icon.png on a transparent canvas."""
    icon = icon.convert("RGBA")
    pixels = []
    for r, g, b, a in icon.getdata():
        if a < 8:
            pixels.append((0, 0, 0, 0))
            continue
        if (
            abs(r - BG[0]) <= GREEN_MATCH_THRESH
            and abs(g - BG[1]) <= GREEN_MATCH_THRESH
            and abs(b - BG[2]) <= GREEN_MATCH_THRESH
        ):
            pixels.append((0, 0, 0, 0))
            continue
        pixels.append((r, g, b, a))
    out = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    out.putdata(pixels)
    return out


def scale_centered(img: Image.Image, scale: float) -> Image.Image:
    w, h = img.size
    nw = max(1, round(w * scale))
    nh = max(1, round(h * scale))
    scaled = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(scaled, ((w - nw) // 2, (h - nh) // 2), scaled)
    return canvas


def adaptive_foreground_from_icon(icon: Image.Image) -> Image.Image:
    """White artwork from icon.png, scaled so post-mask size matches icon.png."""
    return scale_centered(icon_to_transparent_artwork(icon), ADAPTIVE_VIEWPORT_SCALE)


def artwork_metrics(path: Path, treat_green_as_background: bool = True) -> dict:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            if treat_green_as_background and (
                abs(r - BG[0]) <= GREEN_MATCH_THRESH
                and abs(g - BG[1]) <= GREEN_MATCH_THRESH
                and abs(b - BG[2]) <= GREEN_MATCH_THRESH
            ):
                continue
            if x < minx:
                minx = x
            if y < miny:
                miny = y
            if x > maxx:
                maxx = x
            if y > maxy:
                maxy = y
    if maxx < 0:
        raise SystemExit(f"no artwork in {path}")
    bw = maxx + 1 - minx
    bh = maxy + 1 - miny
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    return {
        "path": str(path),
        "size": [w, h],
        "bbox": [minx, miny, maxx + 1, maxy + 1],
        "max_side_pct": 100.0 * max(bw, bh) / max(w, h),
        "min_side_pct": 100.0 * min(bw, bh) / min(w, h),
        "left_pct": 100.0 * minx / w,
        "right_pct": 100.0 * (w - (maxx + 1)) / w,
        "top_pct": 100.0 * miny / h,
        "bottom_pct": 100.0 * (h - (maxy + 1)) / h,
        "cx_pct": 100.0 * ((minx + maxx + 1) / 2) / w,
        "cy_pct": 100.0 * ((miny + maxy + 1) / 2) / h,
        "corners_transparent": all(im.getpixel(p)[3] < 16 for p in corners),
    }


def measure_android_icon_geometry() -> dict:
    icon = artwork_metrics(ASSETS / "icon.png", treat_green_as_background=True)
    adaptive = artwork_metrics(ASSETS / "adaptive-icon.png", treat_green_as_background=True)
    densities = {}
    for folder in ANDROID_LEGACY_SIZES:
        out_dir = ANDROID_RES / folder
        densities[folder] = {
            "legacy": artwork_metrics(out_dir / "ic_launcher.webp", treat_green_as_background=True),
            "round": artwork_metrics(out_dir / "ic_launcher_round.webp", treat_green_as_background=True),
            "foreground": artwork_metrics(
                out_dir / "ic_launcher_foreground.webp", treat_green_as_background=True
            ),
        }
    return {
        "viewport_scale": ADAPTIVE_VIEWPORT_SCALE,
        "unsafe_outer_pct": 100.0 * (1 - ADAPTIVE_VIEWPORT_SCALE) / 2,
        "icon": icon,
        "adaptive": adaptive,
        "target_foreground_max_side_pct": icon["max_side_pct"] * ADAPTIVE_VIEWPORT_SCALE,
        "target_foreground_min_side_pct": icon["min_side_pct"] * ADAPTIVE_VIEWPORT_SCALE,
        "densities": densities,
    }


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing brand source: {SRC}")

    src = Image.open(SRC).convert("RGBA")
    mark = extract_icon_mark(src)
    white = mark_to_white(mark)

    # App icon: solid green + white calendar mark
    icon = Image.new("RGBA", (SIZE, SIZE), BG)
    fg = fit_center(SIZE, white, 0.60)
    icon = Image.alpha_composite(icon, fg)
    save_rgb(icon, ASSETS / "icon.png")

    adaptive_fg = adaptive_foreground_from_icon(icon)
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


def sync_android_from_icon_png() -> None:
    """Committed-native sync from assets/icon.png. Does not rewrite iOS or splash."""
    icon_path = ASSETS / "icon.png"
    if not icon_path.exists():
        raise SystemExit(f"Missing icon source of truth: {icon_path}")
    icon = Image.open(icon_path).convert("RGBA")
    fg = adaptive_foreground_from_icon(icon)
    fg.save(ASSETS / "adaptive-icon.png", format="PNG", optimize=True)
    sync_android_mipmaps(icon, fg)
    print("Synced Android launcher from assets/icon.png (adaptive fg × viewport 2/3)")


def sync_android_from_ios_source() -> None:
    """Legacy flag: Android sync is driven by icon.png, not the iOS 1024 asset."""
    sync_android_from_icon_png()


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
    icon_rgb = icon_rgb.convert("RGB")
    adaptive_fg = adaptive_fg.convert("RGBA")

    for folder, side in ANDROID_LEGACY_SIZES.items():
        out_dir = ANDROID_RES / folder
        if not out_dir.exists():
            continue
        img = icon_rgb.resize((side, side), Image.Resampling.LANCZOS)
        img.save(out_dir / "ic_launcher.webp", format="WEBP", quality=92, method=6)
        img.save(out_dir / "ic_launcher_round.webp", format="WEBP", quality=92, method=6)

    for folder, side in ANDROID_FG_SIZES.items():
        out_dir = ANDROID_RES / folder
        if not out_dir.exists():
            continue
        fg = adaptive_fg.resize((side, side), Image.Resampling.LANCZOS)
        fg.save(out_dir / "ic_launcher_foreground.webp", format="WEBP", quality=92, method=6)


if __name__ == "__main__":
    import sys

    if "--measure-json" in sys.argv:
        print(json.dumps(measure_android_icon_geometry()))
    elif "--android-from-icon" in sys.argv or "--android-from-ios" in sys.argv:
        sync_android_from_icon_png()
    else:
        main()

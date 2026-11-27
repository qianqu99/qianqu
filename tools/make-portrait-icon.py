from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "icon-art.jpg"


def rounded_mask(size, radius):
    scale = 4
    mask = Image.new("L", (size * scale, size * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (0, 0, size * scale - 1, size * scale - 1),
        radius=radius * scale,
        fill=255,
    )
    return mask.resize((size, size), Image.LANCZOS)


def crop_square(image, left, top, right, bottom, size):
    width, height = image.size
    box = (
        int(width * left),
        int(height * top),
        int(width * right),
        int(height * bottom),
    )
    return image.crop(box).resize((size, size), Image.LANCZOS)


def portrait_icon(size, crop, radius_ratio=0.215, border_ratio=0.006):
    art = Image.open(SOURCE).convert("RGB")
    art = crop_square(art, *crop, size)
    radius = int(size * radius_ratio)
    mask = rounded_mask(size, radius)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Soft warm shadow so the portrait sits naturally on light and dark backgrounds.
    shadow_pad = max(2, int(size * 0.025))
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        (shadow_pad, shadow_pad, size - shadow_pad, size - shadow_pad),
        radius=radius,
        fill=(86, 54, 62, 52),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(2, int(size * 0.018))))
    canvas.alpha_composite(shadow, (0, max(1, int(size * 0.012))))

    portrait = art.convert("RGBA")
    portrait.putalpha(mask)
    canvas.alpha_composite(portrait)

    # A thin cream border keeps the artwork from looking pasted onto the taskbar.
    border = max(1, int(size * border_ratio))
    ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.rounded_rectangle(
        (border // 2, border // 2, size - border // 2 - 1, size - border // 2 - 1),
        radius=radius,
        outline=(255, 244, 236, 178),
        width=border,
    )
    canvas.alpha_composite(ring)
    return canvas


ICON_CROP = (0.03, 0.02, 0.97, 0.96)
MARK_CROP = (0.10, 0.04, 0.92, 0.86)

icon = portrait_icon(1024, ICON_CROP)
icon.save(ASSETS / "icon.png")
portrait_icon(512, ICON_CROP).save(ASSETS / "icon-512.png")
portrait_icon(256, MARK_CROP, radius_ratio=0.22, border_ratio=0.009).save(ASSETS / "brand-mark.png")
icon.save(
    ASSETS / "icon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)

print("ICON_READY", ASSETS)

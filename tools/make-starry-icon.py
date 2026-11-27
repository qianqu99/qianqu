from pathlib import Path
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

SIZE = 1024
rng = random.Random(20261127)
np_rng = np.random.default_rng(20261127)


def radial_glow(size, cx, cy, radius, color, strength=1.0):
    y, x = np.ogrid[:size, :size]
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / radius
    alpha = np.clip(1 - d, 0, 1) ** 2 * strength
    layer = np.zeros((size, size, 4), dtype=np.float32)
    layer[..., 0] = color[0]
    layer[..., 1] = color[1]
    layer[..., 2] = color[2]
    layer[..., 3] = alpha * 255
    return Image.fromarray(layer.astype(np.uint8), "RGBA")


# Deep-space gradient.
img = Image.new("RGBA", (SIZE, SIZE), (4, 8, 24, 255))
px = np.array(img).astype(np.float32)
y, x = np.mgrid[0:SIZE, 0:SIZE]
t = (x * 0.62 + y * 0.38) / SIZE
top = np.array([6, 10, 34], dtype=np.float32)
bottom = np.array([20, 8, 46], dtype=np.float32)
for c in range(3):
    px[..., c] = top[c] * (1 - t) + bottom[c] * t
img = Image.fromarray(px.astype(np.uint8), "RGBA").convert("RGBA")

# Nebula clouds.
for glow in [
    (260, 280, 410, (82, 58, 190), 0.33),
    (760, 690, 390, (30, 132, 196), 0.28),
    (700, 210, 260, (238, 120, 202), 0.2),
    (390, 810, 300, (38, 210, 212), 0.15),
]:
    layer = radial_glow(SIZE, *glow)
    img = Image.alpha_composite(img, layer)

img = img.filter(ImageFilter.GaussianBlur(0.8))
draw = ImageDraw.Draw(img, "RGBA")

# Thousands of faint stars.
for _ in range(1700):
    sx = rng.randrange(36, SIZE - 36)
    sy = rng.randrange(36, SIZE - 36)
    radius = rng.choice([0.7, 0.8, 1.0, 1.2, 1.6, 2.2])
    brightness = rng.randint(95, 230)
    alpha = rng.randint(55, 190)
    color = (brightness, min(255, brightness + 16), 255, alpha)
    draw.ellipse((sx - radius, sy - radius, sx + radius, sy + radius), fill=color)

# Brighter stars with cross sparkles.
sparkle_points = []
for _ in range(48):
    sx = rng.randrange(65, SIZE - 65)
    sy = rng.randrange(65, SIZE - 65)
    r = rng.choice([6, 8, 10, 13, 17, 22])
    alpha = rng.randint(105, 220)
    sparkle_points.append((sx, sy, r, alpha))
    glow = radial_glow(SIZE, sx, sy, r * 5.4, (185, 220, 255), alpha / 255 * 0.42)
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img, "RGBA")
    draw.line((sx - r, sy, sx + r, sy), fill=(225, 244, 255, alpha), width=max(1, r // 10))
    draw.line((sx, sy - r, sx, sy + r), fill=(225, 244, 255, alpha), width=max(1, r // 10))
    draw.ellipse((sx - r * 0.2, sy - r * 0.2, sx + r * 0.2, sy + r * 0.2), fill=(255, 255, 255, min(255, alpha + 20)))

# Soft vignette and rounded mask.
vignette = Image.new("L", (SIZE, SIZE), 0)
vd = ImageDraw.Draw(vignette)
vd.ellipse((-120, -120, SIZE + 120, SIZE + 120), fill=255)
vignette = vignette.filter(ImageFilter.GaussianBlur(90))
dark = Image.new("RGBA", (SIZE, SIZE), (0, 2, 12, 90))
img = Image.composite(img, Image.alpha_composite(img, dark), vignette)

mask = Image.new("L", (SIZE, SIZE), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle((18, 18, SIZE - 18, SIZE - 18), radius=196, fill=255)
img.putalpha(mask)

img.save(ASSETS / "icon.png")
img.resize((512, 512), Image.Resampling.LANCZOS).save(ASSETS / "icon-512.png")
img.resize((256, 256), Image.Resampling.LANCZOS).save(ASSETS / "brand-mark.png")
img.save(
    ASSETS / "icon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("WROTE", ASSETS / "icon.png")
print("WROTE", ASSETS / "icon.ico")

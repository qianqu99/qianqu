from pathlib import Path
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUT = ROOT / "docs" / "social-preview.png"

W, H = 1280, 640
rng = random.Random(20261127)


def font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def vertical_gradient(width, height, top, bottom):
    image = Image.new("RGB", (1, height))
    pixels = image.load()
    for y in range(height):
        t = y / max(1, height - 1)
        pixels[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return image.resize((width, height)).convert("RGBA")


base = vertical_gradient(W, H, (8, 18, 36), (24, 12, 42))

nebula = Image.new("RGBA", (W, H), (0, 0, 0, 0))
nd = ImageDraw.Draw(nebula)
for cx, cy, radius, color in [
    (210, 520, 330, (54, 196, 214, 52)),
    (1050, 120, 300, (116, 78, 190, 44)),
    (760, 560, 260, (190, 74, 120, 28)),
]:
    nd.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color)
nebula = nebula.filter(ImageFilter.GaussianBlur(90))
base = Image.alpha_composite(base, nebula)

stars = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(stars)
for _ in range(360):
    x = rng.randrange(W)
    y = rng.randrange(H)
    r = rng.choice([0.7, 0.9, 1.1, 1.4, 1.8, 2.4])
    alpha = rng.randrange(70, 220)
    sd.ellipse((x - r, y - r, x + r, y + r), fill=(225, 244, 255, alpha))
for _ in range(18):
    x = rng.randrange(W)
    y = rng.randrange(H)
    r = rng.choice([4, 5, 6, 7])
    sd.line((x - r, y, x + r, y), fill=(226, 246, 255, 170), width=1)
    sd.line((x, y - r, x, y + r), fill=(226, 246, 255, 170), width=1)
    sd.ellipse((x - 1.2, y - 1.2, x + 1.2, y + 1.2), fill=(255, 255, 255, 230))
base = Image.alpha_composite(base, stars)

icon = Image.open(ASSETS / "icon-512.png").convert("RGBA").resize((188, 188), Image.LANCZOS)
mask = Image.new("L", (188, 188), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, 187, 187), radius=42, fill=255)
icon.putalpha(mask)

glow = Image.new("RGBA", (260, 260), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse((30, 30, 230, 230), fill=(92, 208, 255, 44))
glow = glow.filter(ImageFilter.GaussianBlur(38))
base.alpha_composite(glow, (54, 196))
base.alpha_composite(icon, (90, 226))

draw = ImageDraw.Draw(base)
draw.text((318, 236), "qianqu", font=font(92, True), fill=(245, 252, 255, 255))
draw.text((322, 350), "星空播放器", font=font(34, True), fill=(174, 232, 245, 255))
draw.text((324, 404), "本地音乐 / 视频  ·  Bilibili  ·  网易云  ·  QQ 音乐  ·  酷狗", font=font(23), fill=(200, 216, 232, 235))

chips = ["v2.0.0", "Windows 10 / 11", "Electron", "MIT"]
x = 324
for text in chips:
    f = font(18, True)
    box = draw.textbbox((0, 0), text, font=f)
    w = box[2] - box[0] + 30
    draw.rounded_rectangle((x, 472, x + w, 512), radius=20, outline=(130, 214, 236, 150), width=1, fill=(10, 26, 46, 255))
    draw.text((x + 15, 481), text, font=f, fill=(210, 238, 248, 245))
    x += w + 12

draw.text((90, 584), "github.com/qianqu99/qianqu", font=font(18), fill=(150, 190, 215, 190))
draw.text((W - 90, 584), "STARRY  ·  QUIET  ·  YOURS", font=font(16, True), fill=(150, 190, 215, 160))

OUT.parent.mkdir(parents=True, exist_ok=True)
base.convert("RGB").save(OUT, quality=95)
print(OUT)

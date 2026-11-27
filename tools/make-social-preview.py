from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUT = ROOT / "docs" / "social-preview.png"

W, H = 1280, 640


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


base = vertical_gradient(W, H, (255, 250, 247), (255, 240, 237))

glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for cx, cy, radius, color in [
    (1050, 520, 360, (255, 196, 207, 96)),
    (190, 80, 300, (255, 220, 174, 86)),
    (720, 620, 280, (191, 231, 216, 70)),
]:
    gd.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color)
glow = glow.filter(ImageFilter.GaussianBlur(80))
base = Image.alpha_composite(base, glow)

icon = Image.open(ASSETS / "icon-512.png").convert("RGBA").resize((330, 330), Image.LANCZOS)
shadow = Image.new("RGBA", (390, 390), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((45, 50, 345, 350), radius=76, fill=(128, 72, 88, 52))
shadow = shadow.filter(ImageFilter.GaussianBlur(26))
base.alpha_composite(shadow, (820, 118))
base.alpha_composite(icon, (850, 145))

draw = ImageDraw.Draw(base)
draw.text((86, 112), "qianqu", font=font(100, True), fill=(61, 48, 53, 255))
draw.text((90, 232), "播放器", font=font(40, True), fill=(201, 111, 134, 255))
draw.text((90, 300), "本地音乐 / 视频  ·  Bilibili  ·  网易云  ·  QQ 音乐  ·  酷狗", font=font(23), fill=(112, 92, 100, 255))

chips = ["v2.0.1", "Windows 10 / 11", "Electron", "MIT"]
x = 90
for text in chips:
    f = font(18, True)
    box = draw.textbbox((0, 0), text, font=f)
    w = box[2] - box[0] + 30
    draw.rounded_rectangle((x, 372, x + w, 412), radius=20, outline=(217, 155, 170, 180), width=1, fill=(255, 255, 255, 190))
    draw.text((x + 15, 381), text, font=f, fill=(120, 85, 96, 255))
    x += w + 12

draw.text((90, 540), "github.com/qianqu99/qianqu", font=font(18), fill=(160, 142, 149, 255))
draw.text((W - 250, 540), "QUIET  ·  YOURS", font=font(16, True), fill=(160, 142, 149, 220))

OUT.parent.mkdir(parents=True, exist_ok=True)
base.convert("RGB").save(OUT, quality=95)
print(OUT)

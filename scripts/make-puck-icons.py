"""Draws the map position markers: top-down car, pickup and van, pointing up (the map rotates them
with your heading). Output at 3x (132 px = 44 pt) into assets/puck/. Run: python3 scripts/make-puck-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'puck'
SIZE = 132          # final pixels (@3x)
SS = 4              # supersampling
N = SIZE * SS

BODY = (244, 90, 12, 255)     # ODOS orange
ROOF = (255, 128, 56, 255)
DARK = (110, 34, 0, 255)      # outline and seams
GLASS = (24, 32, 44, 235)
LIGHT = (255, 246, 214, 255)
EDGE = (255, 255, 255, 255)   # white halo so it reads on dark and light maps


def px(v):
    return int(round(v * SS))


def rect(d, box, r, **kw):
    d.rounded_rectangle([px(c) for c in box], radius=px(r), **kw)


def poly(d, pts, **kw):
    d.polygon([(px(x), px(y)) for x, y in pts], **kw)


def finish(body_mask_fn, draw_fn, name):
    # Shadow + white halo from the body silhouette, then the details.
    mask = Image.new('L', (N, N), 0)
    body_mask_fn(ImageDraw.Draw(mask))
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    shadow = mask.filter(ImageFilter.GaussianBlur(px(4)))
    sh = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    sh.putalpha(shadow.point(lambda v: int(v * 0.45)))
    im.alpha_composite(sh, (0, px(3)))
    halo = mask.filter(ImageFilter.MaxFilter(px(2.5) * 2 + 1))
    white = Image.new('RGBA', (N, N), EDGE)
    white.putalpha(halo)
    im.alpha_composite(white)
    d = ImageDraw.Draw(im)
    draw_fn(d)
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    im.save(OUT / f'{name}@3x.png', optimize=True)


def car():
    # 50 x 108 (x 3x scale-free units on a 132 canvas), nose at the top.
    x0, x1, y0, y1 = 41, 91, 12, 120
    body = lambda d, fill=255: rect(d, (x0, y0, x1, y1), 20, fill=fill)

    def details(d):
        rect(d, (x0, y0, x1, y1), 20, fill=BODY, outline=DARK, width=px(2))
        poly(d, [(46, 42), (86, 42), (82, 56), (50, 56)], fill=GLASS)          # windshield
        rect(d, (50, 56, 82, 92), 6, fill=ROOF)                               # roof
        poly(d, [(50, 92), (82, 92), (85, 104), (47, 104)], fill=GLASS)        # rear window
        rect(d, (45, 15, 55, 21), 3, fill=LIGHT)                              # headlights
        rect(d, (77, 15, 87, 21), 3, fill=LIGHT)
        rect(d, (35, 46, 41, 52), 2, fill=DARK)                               # mirrors
        rect(d, (91, 46, 97, 52), 2, fill=DARK)

    finish(body, details, 'car')


def truck():
    x0, x1, y0, y1 = 39, 93, 8, 124
    body = lambda d: rect(d, (x0, y0, x1, y1), 14, fill=255)

    def details(d):
        rect(d, (x0, y0, x1, y1), 14, fill=BODY, outline=DARK, width=px(2))
        poly(d, [(44, 34), (88, 34), (85, 48), (47, 48)], fill=GLASS)          # windshield
        rect(d, (47, 48, 85, 70), 5, fill=ROOF)                               # cab roof
        rect(d, (47, 70, 85, 75), 2, fill=GLASS)                              # rear cab glass
        rect(d, (44, 80, 88, 119), 5, fill=DARK)                              # bed
        rect(d, (47, 83, 85, 116), 4, fill=(176, 62, 8, 255))                 # bed floor
        for y in (92, 100, 108):                                              # bed ribs
            d.line([(px(49), px(y)), (px(83), px(y))], fill=DARK, width=px(1.2))
        rect(d, (43, 11, 54, 17), 3, fill=LIGHT)
        rect(d, (78, 11, 89, 17), 3, fill=LIGHT)
        rect(d, (32, 40, 39, 47), 2, fill=DARK)
        rect(d, (93, 40, 100, 47), 2, fill=DARK)

    finish(body, details, 'truck')


def van():
    x0, x1, y0, y1 = 39, 93, 9, 123
    body = lambda d: rect(d, (x0, y0, x1, y1), 12, fill=255)

    def details(d):
        rect(d, (x0, y0, x1, y1), 12, fill=BODY, outline=DARK, width=px(2))
        poly(d, [(44, 24), (88, 24), (86, 38), (46, 38)], fill=GLASS)          # windshield (short hood)
        rect(d, (46, 38, 86, 118), 6, fill=ROOF)                              # long roof
        for y in (60, 82, 104):                                               # roof ribs
            d.line([(px(50), px(y)), (px(82), px(y))], fill=(214, 84, 20, 255), width=px(1.5))
        rect(d, (43, 12, 54, 18), 3, fill=LIGHT)
        rect(d, (78, 12, 89, 18), 3, fill=LIGHT)
        rect(d, (32, 28, 39, 35), 2, fill=DARK)
        rect(d, (93, 28, 100, 35), 2, fill=DARK)

    finish(body, details, 'van')


def none():
    # Fully transparent: replaces Mapbox's default blue dot on top of the vehicle.
    OUT.mkdir(parents=True, exist_ok=True)
    Image.new('RGBA', (3, 3), (0, 0, 0, 0)).save(OUT / 'none@3x.png')


if __name__ == '__main__':
    car()
    truck()
    van()
    none()
    print('wrote', sorted(p.name for p in OUT.iterdir()))

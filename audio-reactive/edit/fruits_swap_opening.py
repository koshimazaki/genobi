"""The opening of Dance with Fruits, baked in Retro Gaming (the owner's local
font, never bundled): the title splash and DANCE WITH FRUITS typed on the
beat over the opening mecha. Called from fruits-swap-bake-type.py, whose
helpers it takes as `b`. See docs/fruits-swap.md#the-opening."""
import colorsys
import math
import os
import subprocess

from PIL import Image, ImageFilter

BEAT = 0.6  # 100 BPM
FPS = 24
TITLE = "DANCE WITH FRUITS"
LIME = (213, 255, 112, 255)
SPLASH_FRAMES = 60  # 2.5 s: the four splash beats (58 frames) and a margin
SPLASH_AT = (0.5, 0.38)  # the apple's centre on the splash
# The opening mecha's known defect: frames 36 to 54 show a third hand near its
# right shoulder (x 0.42-0.65, y 0.00-0.35; worst at 0.58, 0.20 by frame 48).
# The apple flies onto that shoulder at the cut and covers it until the clip
# is clean (from frame 60), then pops off. Covered, not fixed.
SHOULDER_AT = (0.535, 0.175)
COVER_UNTIL = 60


def apple_logo(b):
    """The voxel apple from the opening render's frame 0, cut out of the
    studio's grey by saturation (the grey is near zero, the apple is not)."""
    frame = b.frame_of(f"{b.TMP}/vox-source.mp4", 0, f"{b.TMP}/vox-000.png")
    w, h = frame.size
    # The apple hangs top right of the dancer at frame 0.
    box = (int(w * 0.62), 0, int(w * 0.9), int(h * 0.5))
    crop = frame.crop(box)
    alpha = Image.new("L", crop.size)
    px, ax = crop.load(), alpha.load()
    for y in range(crop.height):
        for x in range(crop.width):
            r, g, bl, _ = px[x, y]
            _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, bl / 255)
            ax[x, y] = 255 if s > 0.32 and v > 0.06 else 0
    # Specks of colour off the apple are dropped: an opening (erode, then
    # dilate) removes anything smaller than the apple's own voxels.
    alpha = alpha.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))
    # Solid, not lattice: fill each row between its outermost apple pixels,
    # so nothing behind the logo shows through the gaps between voxels.
    ax = alpha.load()
    for y in range(alpha.height):
        xs = [x for x in range(alpha.width) if ax[x, y]]
        for x in range(xs[0], xs[-1] + 1) if xs else ():
            ax[x, y] = 255
    crop.putalpha(alpha)
    return crop.crop(alpha.getbbox())


def sized_logo(b):
    logo = apple_logo(b)
    target_h = int(b.H * 0.46)
    return logo.resize((int(logo.width * target_h / logo.height), target_h), Image.LANCZOS)


def place(img, logo, s, cx, cy):
    """The logo at scale s, centred on (cx, cy) in pixels."""
    if s <= 0.01:
        return
    lw, lh = max(1, int(logo.width * s)), max(1, int(logo.height * s))
    img.alpha_composite(logo.resize((lw, lh), Image.LANCZOS), (int(cx) - lw // 2, int(cy) - lh // 2))


def splash_frames(b, out_dir, logo):
    """Ordering (a): the apple pops on beat 0 and bounces on every beat;
    DANCE WITH lands on beat 2 and FRUITS, in lime, on beat 3."""
    left = b.word("DANCE WITH ", 112)
    right = b.word("FRUITS", 112, LIME)
    line_w = left.width + right.width - 8
    os.makedirs(out_dir, exist_ok=True)
    for f in range(SPLASH_FRAMES):
        t = f / FPS
        img = Image.new("RGBA", (b.W, b.H), b.BLACK)
        p = min(1.0, t / 0.25)
        k = 1.70158
        pop = 1 + (k + 1) * (p - 1) ** 3 + k * (p - 1) ** 2
        bounce = 1 + 0.05 * math.exp(-(t % BEAT) * 8)
        place(img, logo, pop * bounce, b.W * SPLASH_AT[0], b.H * SPLASH_AT[1])
        y = int(b.H * 0.78) - left.height // 2
        x = (b.W - line_w) // 2
        for at, piece, px in ((2 * BEAT, left, x), (3 * BEAT, right, x + left.width - 8)):
            if t >= at:
                # Lands from 1.3x over a tenth of a second.
                q = 1.3 - 0.3 * min(1.0, (t - at) / 0.1)
                pw, ph = int(piece.width * q), int(piece.height * q)
                img.alpha_composite(piece.resize((pw, ph), Image.NEAREST),
                                    (px - (pw - piece.width) // 2, y - (ph - piece.height) // 2))
        img.convert("RGB").save(f"{out_dir}/{f:02d}.png")


def typed_frames(b, out_dir, logo, until=4.2):
    """DANCE WITH FRUITS typed on the grid: two characters every eighth note
    (0.3 s), a lime block cursor after the last one, blinking on the eighth
    once the line is done; gone at `until` seconds. Over the first frames the
    splash's apple flies onto the mecha's right shoulder, bouncing on the
    beat, and pops off once the clip's third hand is gone."""
    size = 96
    full = b.word(TITLE, size)
    groups = [TITLE[i : i + 2] for i in range(0, len(TITLE), 2)]
    cursor = Image.new("RGBA", (size * 5 // 8, size * 7 // 8), LIME)
    os.makedirs(out_dir, exist_ok=True)
    count = int(until * FPS)
    for f in range(count):
        t = f / FPS
        img = Image.new("RGBA", (b.W, b.H), (0, 0, 0, 0))
        fly = 1 - (1 - min(1.0, f / 6)) ** 3
        cx = b.W * (SPLASH_AT[0] + (SHOULDER_AT[0] - SPLASH_AT[0]) * fly)
        cy = b.H * (SPLASH_AT[1] + (SHOULDER_AT[1] - SPLASH_AT[1]) * fly)
        bounce = 1 + 0.05 * math.exp(-(t % BEAT) * 8)
        leave = 1 - min(1.0, max(0, f - COVER_UNTIL) / 6) ** 2
        place(img, logo, bounce * leave, cx, cy)
        shown = min(len(groups), int(t / (BEAT / 2)) + 1)
        text = "".join(groups[:shown]).rstrip()
        x0 = (b.W - full.width) // 2
        y0 = int(b.H * 0.86) - full.height // 2
        cx = x0 + 8
        if text:
            piece = b.word(text, size)
            img.alpha_composite(piece, (x0, y0))
            cx = x0 + piece.width
        done = shown == len(groups)
        if not done or int(t / (BEAT / 2)) % 2 == 0:
            img.alpha_composite(cursor, (cx + 6, y0 + 6))
        img.save(f"{out_dir}/{f:02d}.png")
    return count


def bake_opening(b):
    src = f"{b.TMP}/vox-source.mp4"
    clean = f"{b.TMP}/mecha-clean.mp4"
    subprocess.run([b.FF, "-y", "-v", "error", "-i", src, "-vf", "scale=1920:1080:flags=lanczos", *b.ENCODE,
                    clean], check=True)
    # The end card's still: the mecha's clean frame 0, a centred square.
    subprocess.run([b.FF, "-y", "-v", "error", "-i", clean, "-vf",
                    "select=eq(n\\,0),crop=1080:1080:420:0,scale=600:600", "-frames:v", "1", "-q:v", "3",
                    f"{b.OUT}/fruits-swap-end-card.jpg"], check=True)
    logo = sized_logo(b)
    count = typed_frames(b, f"{b.TMP}/typed", logo)
    b.burn(src, f"{b.TMP}/typed", 0, count, f"{b.OUT}/fruits-swap-mecha.mp4")
    splash_frames(b, f"{b.TMP}/splash", logo)
    subprocess.run([b.FF, "-y", "-v", "error", "-framerate", "24", "-i", f"{b.TMP}/splash/%02d.png",
                    *b.ENCODE, f"{b.OUT}/fruits-swap-splash.mp4"], check=True)

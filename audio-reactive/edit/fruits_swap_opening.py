"""The opening of Dance with Fruits (v5): a plain Signal-black splash for the
live pixel-fruit shower to fly over, and over the opening mecha DANCE WITH
FRUITS typed on the beat in Retro Gaming (the owner's local font, never
bundled) with a neon-pink cursor, plus a swarm of the shower's pixel fruit
over the mecha's right shoulder until the clip is clean. Called from
fruits-swap-bake-type.py, whose helpers it takes as `b`. See
docs/fruits-swap.md#the-opening."""
import math
import os
import subprocess

from PIL import Image

BEAT = 0.6  # 100 BPM
FPS = 24
TITLE = "DANCE WITH FRUITS"
# The cut's one pink (fruits-swap.cut.json); FRUITS_PINK tries another.
PINK_HEX = os.environ.get("FRUITS_PINK", "#ff4dff")
PINK = tuple(int(PINK_HEX[i : i + 2], 16) for i in (1, 3, 5)) + (255,)
SPLASH_SECONDS = 2.5  # the four splash beats (58 frames) and a margin
# The opening mecha's known defect: frames 36 to 54 show a third hand near its
# right shoulder (x 0.42-0.65, y 0.00-0.35). A swarm of pixel fruit flies in
# before it, swirls there, and bursts away once the clip is clean (frame 60).
# Covered, not fixed.
COVER = (0.40, 0.0, 0.67, 0.42)
COVER_UNTIL = 60
GATHER, SETTLED = 20, 32  # the swarm flies in before the defect starts (36)
SWARM = 120
RADIUS = 330  # px: the disc reaches past the defect's corners
# The sprite-shower recipe's own pixel art (mix-sprite-shower.mjs), so the
# swarm is the same fruit that flies over the splash.
SPRITES = [
    ({"r": "#e8343c", "d": "#a51f2a", "w": "#ff9e9e", "g": "#3fa34d", "b": "#6b4423"},
     [".....b.gg...", ".....bgg....", "..rrrbrrr...", ".rrrrrrrrr..", "rrwrrrrrrrr.", "rwrrrrrrrdr.",
      "rrrrrrrrrdr.", "rrrrrrrrrdr.", ".rrrrrrrddr.", ".rrrrrrrdd..", "..rrd.ddd...", "............"]),
    ({"y": "#ffd84a", "o": "#d9a521", "k": "#4a3216"},
     ["..........k.", ".........yy.", "........yyo.", ".......yyyo.", "......yyyo..", ".....yyyo...",
      "...yyyyoo...", ".yyyyyoo....", "kyyyooo.....", ".kooo.......", "............", "............"]),
    ({"r": "#ff4d5e", "k": "#1a1a1a", "l": "#c9f2a0", "g": "#2f8f3a"},
     ["............", "............", "rrrrrrrrrrrr", "rrkrrrrkrrrr", "rrrrrkrrrrkr", ".rrkrrrrrrr.",
      ".rrrrrkrrrr.", "..rrrrrrrr..", "..llllllll..", "...gggggg...", "............", "............"]),
]


def sprite(kind, px):
    pal, rows = SPRITES[kind]
    img = Image.new("RGBA", (12 * px, 12 * px), (0, 0, 0, 0))
    for r, row in enumerate(rows):
        for c, k in enumerate(row):
            if k != ".":
                h = pal[k].lstrip("#")
                colour = tuple(int(h[i : i + 2], 16) for i in (0, 2, 4)) + (255,)
                img.paste(colour, (c * px, r * px, (c + 1) * px, (r + 1) * px))
    return img


def hash01(n):
    v = math.sin(n * 127.1 + 311.7) * 43758.5453
    return v - math.floor(v)


def cluster(b, f):
    """The swarm at clip frame f: pixel fruit fly in from off frame (frames
    GATHER to SETTLED), swirl in a round cloud over the shoulder, bobbing on
    the beat, and burst outward from COVER_UNTIL."""
    img = Image.new("RGBA", (b.W, b.H), (0, 0, 0, 0))
    if f < GATHER:
        return img
    t = f / FPS
    cx = (COVER[0] + COVER[2]) / 2 * b.W
    cy = (COVER[1] + COVER[3]) / 2 * b.H
    gather = min(1.0, (f - GATHER) / (SETTLED - GATHER))
    ease = 1 - (1 - gather) ** 3
    burst = max(0.0, (f - COVER_UNTIL) / FPS)
    for i in range(SWARM):
        # Even over the disc (sqrt), the bigger sprites nearer the middle.
        rad = RADIUS * math.sqrt(hash01(i * 5 + 1))
        ang = hash01(i * 7 + 2) * 2 * math.pi + t * 0.5
        px = 12 if rad < RADIUS * 0.6 else 10
        s = sprite(int(hash01(i * 11 + 3) * 3), px)
        x = cx + math.cos(ang) * rad
        y = cy + math.sin(ang) * rad + math.sin(t * 2 * math.pi / BEAT + i) * 6
        # From off frame along the same ray, into place.
        far = 1500
        x += math.cos(ang) * far * (1 - ease)
        y += math.sin(ang) * far * (1 - ease)
        if burst:
            x += math.cos(ang) * burst * 5200
            y += math.sin(ang) * burst * 5200
        if -s.width < x < b.W + s.width and -s.height < y < b.H + s.height:
            img.alpha_composite(s, (int(x) - s.width // 2, int(y) - s.height // 2))
    return img


def typed_frames(b, out_dir, until=4.2):
    """DANCE WITH FRUITS typed on the grid: two characters every eighth note
    (0.3 s), a pink block cursor after the last one, blinking on the eighth
    once the line is done; gone at `until` seconds. The shoulder swarm rides
    over the first frames."""
    size = 96
    full = b.word(TITLE, size)
    groups = [TITLE[i : i + 2] for i in range(0, len(TITLE), 2)]
    cursor = Image.new("RGBA", (size * 5 // 8, size * 7 // 8), PINK)
    os.makedirs(out_dir, exist_ok=True)
    count = int(until * FPS)
    for f in range(count):
        t = f / FPS
        img = cluster(b, f) if f < COVER_UNTIL + 8 else Image.new("RGBA", (b.W, b.H), (0, 0, 0, 0))
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
    count = typed_frames(b, f"{b.TMP}/typed")
    b.burn(src, f"{b.TMP}/typed", 0, count, f"{b.OUT}/fruits-swap-mecha.mp4")
    # The splash: Signal black, for the live pixel-fruit shower to fly over.
    subprocess.run([b.FF, "-y", "-v", "error", "-f", "lavfi", "-i",
                    f"color=c=0x0c0e0c:s=1920x1080:r=24:d={SPLASH_SECONDS}", *b.ENCODE,
                    f"{b.OUT}/fruits-swap-splash.mp4"], check=True)

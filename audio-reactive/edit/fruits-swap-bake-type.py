"""Bakes the swap words in Retro Gaming (the owner's local font, never
bundled) into the template's media: the two swap-card stills, and a slam of
WATERMELON over the gold ninja's drop frames (source frames 115-143, the
two beats the cut shows from 4.79 s). Needs Pillow, ffmpeg, the font
installed, and the ninja's 2048 x 1152 source as
$TMP_DIR/gold-ninja-source.mp4. Run with python3 -I. See docs/fruits-swap.md."""
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = f"{ROOT}/public/media/director-templates/fruits-swap"
TMP = os.environ.get("TMP_DIR", f"{ROOT}/.local/fruits-swap/tmp")
# The owner's installed copy; the font file is never bundled (docs/fruits-swap.md).
FONT = os.environ.get("RETRO_GAMING", os.path.expanduser("~/Library/Fonts/Retro Gaming.ttf"))
FF = os.environ.get("FFMPEG", "ffmpeg")
W, H = 1920, 1080
WHITE, BLACK = (246, 248, 242, 255), (12, 14, 12, 255)
SIZE = 160  # a whole multiple of the face's pixel grid keeps edges square


def word(text, size=SIZE):
    """The word in white over a Signal-black offset block, unscaled."""
    font = ImageFont.truetype(FONT, size)
    l, t, r, b = font.getbbox(text)
    off = max(4, size // 16)
    img = Image.new("RGBA", (r - l + off + 8, b - t + off + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.fontmode = "1"  # no anti-aliasing: a pixel face stays pixels
    d.text((4 - l + off, 4 - t + off), text, font=font, fill=BLACK)
    d.text((4 - l, 4 - t), text, font=font, fill=WHITE)
    return img


def frame_of(clip, n, path):
    subprocess.run([FF, "-y", "-v", "error", "-i", f"{OUT}/{clip}", "-vf", f"select=eq(n\\,{n})",
                    "-frames:v", "1", path], check=True)
    return Image.open(path).convert("RGBA")


def card(clip, text, name):
    """The held frame, darkened as the card dims it, with the word on it."""
    base = frame_of(clip, 187, f"{TMP}/{name}-187.png")
    base = Image.alpha_composite(base, Image.new("RGBA", base.size, (12, 14, 12, 115)))
    w = word(text)
    base.alpha_composite(w, ((W - w.width) // 2, (H - w.height) // 2))
    base.convert("RGB").save(f"{OUT}/{name}.jpg", quality=90)


def slam_frames(text, frames, fps=24, beats=2, bpm=100):
    """The kinetic recipe's slam, frame by frame: in from 2.2x, a decaying
    shake, a pulse on the beat, a snap shut at the end, a dark flash."""
    hold = beats * 60 / bpm
    beat = 60 / bpm
    base = word(text)
    clamp = lambda x: min(1.0, max(0.0, x))
    wobble = lambda t, k: math.sin(t * 91.7 + k * 12.9) * math.sin(t * 57.3 + k)
    os.makedirs(f"{TMP}/slam", exist_ok=True)
    for f in range(frames):
        t = f / fps
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        flash = math.exp(-t * 16)
        if flash > 0.02:
            img.alpha_composite(Image.new("RGBA", (W, H), (12, 14, 12, int(255 * 0.55 * flash))))
        snap = clamp((t - hold) / 0.09)
        slam = 1 - (1 - clamp(t / min(0.12, beat * 0.3))) ** 3
        pulse = math.exp(-(t % beat) * 9) * 0.03 if t > beat else 0
        s = 2.2 - 1.2 * slam + pulse
        sx, sy = s * (1 + snap * 0.6), s * (1 - snap)
        if sy > 0.01:
            w = base.resize((max(1, int(base.width * sx)), max(1, int(base.height * sy))), Image.NEAREST)
            alpha = clamp(slam * 1.5)
            if alpha < 1:
                w.putalpha(w.getchannel("A").point(lambda a: int(a * alpha)))
            shake = (H / 54) * math.exp(-t * 9)
            x = (W - w.width) // 2 + int(wobble(t, 1) * shake)
            y = (H - w.height) // 2 + int(wobble(t, 2) * shake)
            img.alpha_composite(w, (x, y))
        img.save(f"{TMP}/slam/{f:02d}.png")


def bake_ninja(start=115, frames=29):
    src = f"{TMP}/gold-ninja-source.mp4"
    graph = (f"[0:v]scale=1920:1080:flags=lanczos[v];"
             f"[1:v]setpts=PTS-STARTPTS+{start}/24/TB[w];"
             f"[v][w]overlay=eof_action=pass:enable='between(n,{start},{start + frames - 1})'[o]")
    subprocess.run([FF, "-y", "-v", "error", "-i", src, "-framerate", "24", "-i", f"{TMP}/slam/%02d.png",
                    "-filter_complex", graph, "-map", "[o]", "-an", "-c:v", "libx264", "-preset", "slow",
                    "-crf", "19", "-pix_fmt", "yuv420p", "-r", "24", "-movflags", "+faststart",
                    f"{OUT}/fruits-swap-gold-ninja.mp4"], check=True)


if __name__ == "__main__":
    step = sys.argv[1] if len(sys.argv) > 1 else "all"
    if step in ("all", "cards"):
        # Card 2 reads the ninja's frame 187, which the slam does not touch.
        card("fruits-swap-mecha.mp4", "GORILLA", "fruits-swap-card-1")
        card("fruits-swap-gold-ninja.mp4", "PINK CAT", "fruits-swap-card-2")
    if step in ("all", "ninja"):
        slam_frames("WATERMELON", 29)
        bake_ninja()

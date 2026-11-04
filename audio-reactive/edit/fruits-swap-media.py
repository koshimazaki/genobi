"""Prepares Dance with Fruits' bundled media from the owner's renders: plain
1920 x 1080 encodes (CRF 19, no sound), the two swap-card stills (the held
frame darkened, no words: the words are live layers), the end card's still
and the Signal-black splash. Nothing is baked: every word and icon is a
layer in the cut (docs/fruits-swap.md). Needs ffmpeg and the 2048 x 1152
sources in $TMP_DIR as <name>-source.mp4, `vox-source.mp4` for the opening
mecha. Run with python3 -I."""
import os
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = f"{ROOT}/public/media/director-templates/fruits-swap"
TMP = os.environ.get("TMP_DIR", f"{ROOT}/.local/fruits-swap/tmp")
FF = os.environ.get("FFMPEG", "ffmpeg")
ENCODE = ["-an", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "24",
          "-movflags", "+faststart"]
# media id suffix -> source in TMP_DIR
CLIPS = {"mecha": "vox", "gorilla": "gorilla", "gold-ninja": "gold-ninja", "pink-cat": "pink-cat"}


def ff(*args):
    subprocess.run([FF, "-y", "-v", "error", *args], check=True)


def main():
    for name, src in CLIPS.items():
        ff("-i", f"{TMP}/{src}-source.mp4", "-vf", "scale=1920:1080:flags=lanczos", *ENCODE,
           f"{OUT}/fruits-swap-{name}.mp4")
    # The swap cards hold the outgoing frame (187, after the slice's last),
    # darkened to 55 % so the live word reads on it.
    for card, name in (("1", "mecha"), ("2", "gold-ninja")):
        ff("-i", f"{OUT}/fruits-swap-{name}.mp4", "-vf",
           "select=eq(n\\,187),drawbox=x=0:y=0:w=iw:h=ih:color=0x0c0e0c@0.45:t=fill",
           "-frames:v", "1", "-q:v", "2", f"{OUT}/fruits-swap-card-{card}.jpg")
    # The end card's still: the mecha's frame 0, a centred square.
    ff("-i", f"{OUT}/fruits-swap-mecha.mp4", "-vf", "select=eq(n\\,0),crop=1080:1080:420:0,scale=600:600",
       "-frames:v", "1", "-q:v", "3", f"{OUT}/fruits-swap-end-card.jpg")
    # The splash: Signal black, for the live pixel-fruit shower to fly over.
    ff("-f", "lavfi", "-i", "color=c=0x0c0e0c:s=1920x1080:r=24:d=2.5", *ENCODE, f"{OUT}/fruits-swap-splash.mp4")


if __name__ == "__main__":
    main()

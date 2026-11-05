# Dance with Fruits: the swap template

A showcase piece: a voxel character dances between two fruits to a 9 s loop,
and every loop can be a different character, cut on the beat with a Nokia-font
card in between. One character is one loop (about 8 s); up to three characters
make about 24 s. This page says what the person can hand in, what the agent
does with each thing, and what is proven today. The cut itself is documented in
[fruits.md](fruits.md) ("The swap edit") and logged in [`../edit/LOG.md`](../edit/LOG.md).

## Director template

Since 3 November 2026 the swap edit is an official mix template,
**Dance with Fruits** (`fruits-swap`): mecha, gorilla on the loop, gold ninja
on the drop beat, pink cat, and the house end card, built from the house
recipes (a splash of flying pixel fruit, the title typed on the beat,
Space.js swap cards, slice glitches, a neon-pink surveillance scan whose box
alone posterizes and turns to wireframe, pixel fruit flooding into the end
card) instead of the
Nokia pixel cards below, which the owner turned down. Since version 7 every
word and icon is a live layer in the Director, set in Press Start 2P (OFL,
bundled), and the opening mecha is the 2 November `mecha-fruit-song-vox`
render. The cut is data
(`shared/templates/fruits-swap.cut.json`) and opens in the Director at
`/director?example=fruits-swap`; see [the template page](../../docs/fruits-swap.md)
for the beat table, the media and how to repeat it. The ffmpeg build below
stays as the record of the first cut.

## What the person hands in

| Slot      | Accepts                             | Default when absent        |
| --------- | ----------------------------------- | -------------------------- |
| character | one image of a character, any style | the grey and gold mecha    |
| fruits    | one or two fruit names (or images)  | banana and apple           |
| audio     | a track, or a caption for new music | the Dance with Fruits loop |

One submission is one loop with that character. Two or three submissions are
two or three loops, each character on its own loop; the first one is the main
character and opens the piece. Nothing beyond three: the loop wears out.

## What the agent does with each slot

**Character.** The capture writes the dancer's frame-0 rectangle into the
window's `keyframes.json` (`regions.robot`, on the 1024x576 guide). The agent
scales that rectangle to the look still, pads it by about 10 percent so the raised
arm fits, and shows it to the person as the suggested bounding box. With a
yes, FLUX 3 Klein edits only that rectangle of the first still, putting the
person's character in the mecha's pose; the person's image is the reference.
Then LTX-2.5 Layout-to-Render renders window 0 on the explode guide with that
still. The six characters made on 3 November went this way, with the owner
making the stills in Genobi Image rather than Klein; both produce the same
input, a 1360x765 still aligned with frame 0.

**Fruits.** A new fruit is built as voxels in the Three.js study (the morph
asset catalogue, resampled to the same block count), coloured per state, and
the window is recaptured; the fruit noun changes in the render prompt and the
fruit's rectangle (`regions.fruit-left` / `fruit-right`) is edited in the still.
The gold gundam loop shows the result: watermelon and a green fruit instead of
apple and banana. Fruit-to-voxel from a prompt is a fixed catalogue today
(banana, papaya, apple, orange, watermelon); a prompt-to-new-voxel route is not
built.

**Audio.** A supplied track replaces the loop: the agent measures its loop
period and beat period from the audio (never assumed), recaptures the guide on
the new track and recomputes the seven cut frames from the measured grid. New
music comes from MiniMax Music 3 (text to music, the workflow route in the
registry) from a caption, then the same measurement. Every render and every
music generation is quoted and confirmed first.

## The cut

`../edit/fruits-swap-build.sh` takes one argument per loop, `NAME:RENDER`, with
`+NAME:RENDER` for a swap on the drop beat inside that loop:

```sh
RUN=~/Downloads/run3 OUT=/tmp/fruits-3 audio-reactive/edit/fruits-swap-build.sh \
  "mecha:fruit-mecha-explodeg1" \
  "gorilla:char-gorilla-explode+watermelon:char-gold-gundam-explode" \
  "unicorn:char-unicorn-explode"            # 602 frames, 25.08 s: the delivered v1
RUN=~/Downloads/run3 OUT=/tmp/fruits-1 audio-reactive/edit/fruits-swap-build.sh \
  "gorilla:char-gorilla-explode"            # 170 frames, 7.08 s: one character
```

The rules it encodes are in [fruits.md](fruits.md#the-general-rule-any-dance-edit-on-a-loop).
Both runs above were made on 3 November; the three-loop run reproduces the
delivered video stream byte for byte.

## What is proven and what is not

| Claim                                                  | State                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Character swap on the beat, 1 or 3 loops               | done, from renders on disk                                                |
| Six characters rendered from owner stills on one guide | done 3 November (gorilla, gundam, unicorn, pink cat, cat-mecha, ninja)    |
| Agent-suggested bounding box from `regions.robot`      | the rectangle is written by capture; the suggestion UI is not built       |
| Klein region edit of the still from a person's image   | the route exists (featured-demo manifest in PR 74); not run for these six |
| New fruit from a name                                  | catalogue fruits only; prompt-to-voxel not built                          |
| New track or MiniMax music                             | registry route exists; not run for this piece                             |
| Hosted template card with these slots                  | not built; this page and the script are the contract                      |

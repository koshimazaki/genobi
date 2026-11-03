# Pyramid: Dimensions

About 32 s of "Dimensions" (Radek Rudnicki Mix, Bob Macc Master) from 16 s:
inside the pyramid twice, outside it once, then a vehicle-to-mecha morph.
Keep it dry: the reverb is tricky on this track.

Presets: [pyramid-inside](../presets/pyramid-inside.md),
[pyramid-outside](../presets/pyramid-outside.md) (pulse),
[ship-mecha](../presets/ship-mecha.md).

## Windows

| Window | Start   | Preset          | Look                                            |
| ------ | ------- | --------------- | ----------------------------------------------- |
| w0     | 16.0    | pyramid-inside  | the owner's hangar still; closed still by Klein |
| w1     | 24.0417 | pyramid-inside  | the same still (interior squeezed to 0.3)       |
| w2     | 32.0833 | pyramid-outside | Klein desert look                               |
| w3     | 40.125  | ship-mecha      | Klein look of the spacecraft                    |

w1 can take an interior swap in the sci-fi family (a new still from its
`frame-0000.png`) so the two inside windows differ.

## Stitch

1. Render w0-w3 at gain 1 (193 frames each).
2. Cut on the window boundaries in order: inside, inside, outside, ship.
3. Effects to the beat on top.
4. **Audio swap at the end:** the dry track from 16.0 s over the whole cut.

## Status

| What                               | State                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| pyramid-inside, 2 November excerpt | rendered, follow 0.97, bass 0.58                                   |
| pulse, 2 November excerpt, desert  | rendered, follow 0.92                                              |
| dim-g1 w0, w1 (pyramid-inside)     | captured and bundled; w0 submitted when the box shut, not rendered |
| dim-g1 w2 (pulse)                  | captured, Klein look, bundled, not rendered                        |
| ship w3                            | captured, not rendered                                             |
| the gain-2 `dim` set               | dropped: saturated                                                 |

## How to repeat

```sh
TRACK='…/1. Dimensions (Radek Rudnicki Mix Bob Macc Master).mp3'
cap() { node scripts/experiments/capture.mjs --studies "$1" --track "$TRACK" --start "$2" \
  --output "GUIDES/$3" --frames 193 --width 1024 --height 576 \
  --band-gain auto --band-release 12 --motion-gain 1 --stage studio; }
cap pyramid-inside 16 w0
cap pyramid-inside 24.0417 w1
cap pulse 32.0833 w2
cap ship-mecha 40.125 w3
```

Looks: copy the hangar still to `LOOKS/w0/pyramid-inside/look-first.png` and
`LOOKS/w1/…`; make the closed still with `look.py one --frame
frame-closed-NNNN.png --reference look-first.png --aesthetic "a rusted sci-fi
hangar interior with riveted steel panels, cyan light strips, a gold robot,
hard sunlight from the open top, photographic"`; make the desert and ship
looks with `look.py batch` and each preset's still prompt. Then
`make-bundles.sh GUIDES/wN LOOKS/wN BUNDLES-wN` and `run-queue.sh`.

Rules learned: gain 1 (the gain-2 set saturated and was dropped); the aerial
cutaway pyramid still did not align, because no guide has that camera; the
ship window's band never fell under 0.54, so the study reads swells over the
take's own floor.

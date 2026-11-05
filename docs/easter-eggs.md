---
tags: [studio]
summary: Hidden extras in the studio — the Konami code opens the walkers game in the deck — and how to find each one.
---

# Easter eggs

Small hidden things in the studio. None of them spends anything, changes a
project or talks to a provider.

## Walkers (Konami code)

Type **↑ ↑ ↓ ↓ ← → ← → B A** anywhere in the studio. Click an empty part of
the page first: the code is ignored while a text field, a contenteditable or
a dialog has focus, so close the first-visit setup dialog before trying it.
It needs a keyboard, so a phone cannot enter it.

The [deck](genobi-deck.md) turns into a small puzzle. Little creatures (`o>`)
leave the door `∩`, and you get enough of them home `⌂` by giving them jobs:

| Key                    | Does                                                        |
| ---------------------- | ----------------------------------------------------------- |
| 1 / 2 / 3 or D / B / K | choose **dig**, **build** (a five-brick stair) or **block** |
| click or tap           | give the chosen job to a creature                           |
| ← / → then Enter       | the same from the keyboard                                  |
| P · R · N              | pause · restart · next field                                |
| M                      | mute (remembered in this browser)                           |
| .                      | step one tick (also how it plays under reduced motion)      |
| Esc                    | leave; the deck comes back exactly as it was                |

Water `≈` drowns, a fall of more than five cells splats, and steel `█` will
not dig. Each job has a limited stock. The five fields are Turn Around, Soft
Floor, Mind the Gap, Steel Pocket and Up and Over.

The game has its own Game Boy-style music and sounds, synthesised in the
browser and started by the code's last key. Its status uses the studio's
progress lines, `SAVED 3/5 ⣿⣿⣿⣀⣀` and `ENERGY 4/5 ⣿⣿⣿⣿⣀`, and appears in
the top-corner line too, always below any real job or agent.

How it is built: [the deck's walkers section](genobi-deck.md#the-walkers-game-konami-code).

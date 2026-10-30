---
tags: [studio, agents, setup]
summary: Teachings — short fixed hints, each saying what one part of the studio is for, shown in the deck's bar, the idle bubble and setup while nothing is running.
---

# Teachings

A teaching is one short sentence saying what a part of the studio is for:
"Ninja is your own layout. Keep only the tools you need." They show only while
nothing is running, so they fill quiet space and never compete with the work.
Fixed text, no model call, like the install wait's sentences
(`shared/install-messages.ts`).

## Where they show

- **The deck's bar.** With nothing to report, the [deck](genobi-deck.md) reads
  `READY · SPEAK OR TYPE TO START`, then cycles teachings prefixed
  `TEACHING · ` in the bar's uppercase, the sentence itself in its own case
  (see [the font](#the-font)). A working or finished session, a job's
  `progressLine`, linked agents and the supervisor's state always win
  (`src/deck/deck-now.ts`); the next quiet spell starts from the ready line
  again. The deck is the only surface that steps on a timer
  (`src/teachings/useIdleTeaching.ts`), at the install wait's reading pace.
- **The idle bubble.** With no session, the open [bubble](agent-bubble.md)
  ("Ready when you are") shows one teaching under its copy, labelled
  **Teachings**, with **Next**. A session's text takes that space back.
- **Setup.** Beneath the Genobi mark in setup's side column, at desktop widths
  only. On a phone the mark sits above the step, and a line of changing length
  there would move the step, so it is not shown. The block keeps a fixed
  height, so stepping never changes the dialog's size.

All three show the same teaching (`src/teachings/store.ts`): **Next** in one
place steps it everywhere. Nothing moves the studio's hero, composer, toolbar
or gallery; the bar, the bubble and setup are overlays or a dialog.

## Order and the seen list

Teachings come in a random order, so each visit brings different ones. Each
pick is drawn at random from the ones not yet seen, a shuffle one step at a
time, so every teaching shows once before any repeats. After a full cycle a
fresh shuffled cycle starts, and its first pick is never the teaching just
shown (`nextTeaching` in `shared/teachings.ts`, which takes its random source
as an argument so tests can seed it; the store passes `Math.random`). A page
load shows a new unseen one. The seen ids stay in this browser's local storage
under `genobi.teachings`, every read and write guarded; a private window or
blocked storage keeps the list in memory for the page instead. It is a
per-viewer convenience and is never sent anywhere.

There are no transitions: the text swaps in place, so reduced motion needs
nothing extra. Rotation still happens under reduced motion; it is a text
change, not movement.

## The font

Wherever a teaching shows (the deck's bar, the bubble, setup), the sentence
and its **Teachings** label are set in **Pixelify Sans**, a pixel face in the
spirit of an old Nokia phone screen; everything else in the deck and bubble
keeps its own font (`src/teachings/teachings.css`). It is self-hosted through
`@fontsource/pixelify-sans` under the SIL Open Font License 1.1 (listed in
[`LICENCES.md`](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md)
and `LICENCES-npm.md`). Only the Latin 400 file is imported, from the
teachings stylesheet, and the browser fetches it the first time a teaching
is drawn, not at first paint.

Pixelify Sans was compared with Tiny5 and Silkscreen at the bar's size.
Silkscreen has no lowercase and its wide caps fit less of a sentence into the
bar; Tiny5 is crisp but very small; Pixelify Sans is the most readable and
has a true mixed case. In caps at bar size its word spaces close up, so the
bar keeps only `TEACHING · ` in capitals and shows the sentence in its own
case, at 12px, inside the bar's existing height.

## The rule for a teaching

Every teaching states documented behaviour. Each `surface` is a preset id from
`src/studio/presets.ts`, or `studio` for the studio as a whole;
`tests/teachings.test.tsx` checks that, unique ids, non-empty text under 120
characters and the full cycle. The current list and where each claim comes
from:

| Teaching (short)                          | Source                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Scrolls hold the plan                     | The Scrolls preset's description, `src/studio/presets.ts`                         |
| The scroll remembers what the sword…      | The owner's line, kept exactly                                                    |
| In 3D, build a set and move the camera    | The 3D preset's description: "Build a set. Move the camera. Capture guidance."    |
| The camera move plays in the 3D preview   | `src/scene/CameraPreview.tsx` plays the move in the browser; nothing is submitted |
| Dual Swords puts two sources side by side | The Dual Swords preset's description                                              |
| Start from a template in the Director     | The Director preset; Character and reference controls in the root README          |
| The Editor is what Genobi returns         | [Vision](vision.md): "Edit what came back, in layers"                             |
| Arena in Project Tools                    | [Arena](arena.md): compare two to four workflow results                           |
| Ninja is your own layout                  | The Ninja preset's description                                                    |
| Press the mic and say what you want       | [Voice mode](voice-mode.md); the Hermes install sentences                         |
| Anything that costs money is quoted       | [Agent approvals](agent-approvals.md); the Hermes install sentences               |
| Open the deck and click a blob            | [The deck](genobi-deck.md): ten points, and the blob splits in two                |

There is no Image/Edit teaching; the owner dropped it. A new teaching adds its
source to this table in the same change.

## Follow-up: Genobi peeks

A small "Genobi peeks" pop-up that offers a teaching now and then is planned,
once the list feels right. It is not built.

---
tags: [studio, sound]
summary: The short synthesised cue the studio plays when a load starts and when it is done, so a missed header loader is still heard - four variants, how to pick one with ?loadsound, and the rules for when it sounds.
---

# Loading sounds

The header loader beside the wordmark shows a template media load or any job
that reports a percent. A person who looks away misses it, so a load that
lasts also plays a short cue when it starts and another when it is done. The
cues are synthesised with the Web Audio API in the walkers game's chip voices
(pulse, triangle, LFSR noise) plus a sine; there are no sample files.

| Variant | Start                           | Done                         |
| ------- | ------------------------------- | ---------------------------- |
| Chip    | two rising pulse blips          | a bright three-note arpeggio |
| Glass   | a soft sine ping with overtone  | two pings a sixth apart      |
| Sonar   | a rising triangle sweep, a tick | a bloop up an octave         |
| Swish   | a rising noise swish            | a soft triangle fifth        |

Chip is the default. Each cue is under a second and quiet: rendered in
Chrome, every cue peaks between -21 and -28 dBFS.

## When it sounds

- The start cue plays only when the load is still showing 0.6 s after it
  began (`START_DELAY_MS`), so a quick load stays silent.
- The done cue plays when that load ends, and only after its start cue did.
- Only real work sounds: a template media load, or an activity with a
  percent. The walkers game, which also shows in the header, never does.
- A browser starts audio only after the page has had a click or key, so a
  load before any gesture is silent rather than an error.

## Choosing a cue

Open the studio with `?loadsound` in the address (for example
`http://127.0.0.1:4317/?loadsound`). A small panel under the header plays
each variant's start and done; **Use** remembers one in this browser
(`localStorage` key `genobi.loadSound`), and **Turn loading sounds off**
silences them. Without `?loadsound` the panel is not shown.

## Code

| Piece                                  | Holds                                    |
| -------------------------------------- | ---------------------------------------- |
| `src/load-sound/cues.ts`               | The variants as data                     |
| `src/load-sound/player.ts`             | The Web Audio player and master volume   |
| `src/load-sound/useLoadSound.ts`       | When a cue plays, used by `LoadProgress` |
| `src/load-sound/choice.ts`             | The remembered choice                    |
| `src/load-sound/LoadSoundAudition.tsx` | The `?loadsound` panel                   |
| `tests/load-sound.test.tsx`            | Cues, player, timing and choice          |

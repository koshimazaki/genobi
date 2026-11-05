---
tags: [studio, agents, plan]
summary: The Genobi deck — a footer terminal that shows what the studio and its agent are doing, with ASCII visualisers; the MVP shipped and the plan to grow it.
---

# The Genobi deck

Voice is the way in: the person speaks, Genobi answers in the
[bubble](agent-bubble.md). The **deck** is for watching the work: a small
terminal in the footer that opens upward, showing what is running, the agent
session's log and a visualiser. With it closed, the Director and the job
cards still show their own status, so nothing depends on opening it. It reads
what the studio already polls and draws in the page, so it runs the same in a
browser and in a desktop shell such as Tauri, with no real terminal needed.

Its look is the studio's signature: braille dots and lime on dark, the same
characters the spinners, progress bars and agents' `progressLine` use.

## Where it is mounted

`<GenobiDeck />` is mounted once, in `src/components/Wordmark.tsx`, beside
`<AgentSessionPanel />` (the headless session follower) whose session it
reads, and the Genobi guide bubble. The wordmark is
in the studio header (`Topbar`) in every preset and in the standalone World
Builder's header, so the deck is there too. It is `position: fixed` to the
bottom right of the window, so where it sits in the markup moves nothing: the
header, hero, composer, toolbar and gallery keep their places with the deck
closed, open or absent, at desktop and phone widths.

**Box 1.9, 27 October 2026.** The deck had gone: 51777ec (26 October, "Add
H3 workflows, native agent launcher, and Arena review improvements") removed
`<GenobiDeck />` and its import from the wordmark inside a large unrelated
change, with no note, and no test failed. Nothing took its place in the
footer. In the same change Development (`src/supervisor/`) stopped embedding
the launcher's output: native sessions now run in a macOS Terminal window and
the supervisor viewer is a collapsible iframe there, so Development has no
log of its own to reconcile with; the deck still names linked supervisor
agents and links to Development. The deck is mounted again where it was, and
`tests/deck-mounted.test.tsx` renders the studio header and fails if the
deck (or the bubble) is not in it.

## The deck holds the session

Since 2 November 2026 (#57) the [bubble](agent-bubble.md) is a static guide.
The deck is where an agent session shows, and with it the session's controls:

- **The bar** shows the newest line of the shown session while it
  works (over a running job's line, since that line is in the log), a running
  job's `progressLine` otherwise, then a finished session's summary, then
  linked agents or the supervisor's state (`src/deck/deck-now.ts`). It is
  received text only, never an inferred step or percentage. With none of
  those, it reads `READY · SPEAK OR TYPE TO START`, then cycles
  [teachings](teachings.md) (`TEACHING · …`) until something real arrives.
- **The chain of steps** (#96, `shared/deck-steps.ts`, `src/deck/StepChain.tsx`)
  sits at the top of the open log and stays there while it scrolls. Each
  step has a state (✓ done, a spinner while working, … waiting for you,
  ✗ failed, ? unknown) and a short label. See
  [the chain of steps](#the-chain-of-steps) below.
- **Opening the deck** shows the whole log: the chain, the
  session's request, every retained update oldest first (up to 40), the
  summary, the conversation (**YOU ›** / **GENOBI ›**) and linked agents. It
  opens scrolled to the newest lines and then never moves the reading
  position. The log is not a live region; the approvals announce their own
  status.
- **The session's controls** (`src/deck/DeckSession.tsx`): each paid step
  waiting for the person with its plan, price and payer, **Approve** /
  **Decline**, **Open local session** for a relayed one, and **Stop
  session**. A waiting step opens the deck by itself, and so does a message
  voice sends to the session (`OPEN_DECK`).
- **Its other actions** only move the person: **Speak to agent**, **Project
  assets ↗** and **Open Development ↗**. The deck never starts or pays for
  anything by itself; Approve is the person's click on a quoted step.

### The chain of steps

The chain is built only from structured data the studio already receives,
oldest first:

1. **The person's words**, from the conversation (`AgentSession.exchange`):
   `Voice · 'swap the apple' · heard`, `Typed · '…' · sent`, or `· not read
yet` while a queued message waits for the runner. The server records
   whether the first prompt was spoken or typed (`source`); a later message,
   and an older server, show `You`.
2. **Tool calls**, from the runner's own events (`AgentSession.tools`): Claude
   Code's `tool_use` and `tool_result` (paired by call id) and Hermes'
   (paired by name), read in `server/agent-stream.ts` and
   `server/agent-hermes-stream.ts`. `Director · add-graphic anime-fruit-icons
· applied`, `Quote · priced`, `Jobs · working`. A call still working when
   the session ends reads `· no result`, state unknown. The only word read
   from a call's input is a Director command's `op` (and an added graphic's
   `moduleId`), each checked as a plain word.
3. **Quoted paid steps**, from `approvals`: `Quote · LTX upscale · $0.40 ·
waiting for you`, then `approved · started`, `declined`, `expired`,
   `refused` or `may have started · check the gallery`.
4. **Running jobs**, from Activity (`src/busy.ts`): each job's
   `progressLine`, so `UPSCALING LTX 42%` only when the provider reported 42%.
5. **The session's own state**: starting, working (only when no other step is
   working), waiting for your next message or approval, done, stopped,
   failed or interrupted.

The agent's free text is never read into a step: a line saying "upscale
done ✓" makes no step look done. That text still shows in the log below as
received. The newest three steps stay in view; older ones fold behind
`N earlier steps`, which opens to its own short scrolling list. With nothing
in the chain, nothing is drawn, so the idle bar keeps its ready line and
teachings. A relayed (hosted) session carries no tool calls or source, so its
chain has the request, quotes and state only. `tests/deck-steps.test.tsx`
builds a chain from a recorded Claude Code stream plus a job.

The deck reads the session through `useLatestAgentSession`: the panel's
newest poll, or the session just shown before its first poll, so a new spawn
(the spawn store, `src/agent/spawn-store.ts`, ends in `showAgentSession`
whichever runner and Terminal or bubble mode) reaches the bar at once.

## The MVP

| Part           | Where                                                               | What it does                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASCII programs | `shared/ascii/programs.ts`                                          | Three-colour shaded braille metaballs, a braille black hole and braille rain, as pure functions of grid and time: one character and two colours per cell                                                                      |
| Screen         | `src/deck/AsciiScreen.tsx`                                          | Draws a program as coloured text runs at 30 frames a second from the shared animation clock; still under reduced motion                                                                                                       |
| Activity       | `src/busy.ts`                                                       | What is working now, one line each, owned by whoever polls the work: the studio's job poller holds each running job's `progressLine`, so hiding a card or drawing a job twice cannot drop it; a Director swap holds its stage |
| Session        | `src/agent/useAgentSession.ts`                                      | The agent panel publishes each poll of the session, so the deck reads it without polling again                                                                                                                                |
| Deck           | `src/deck/GenobiDeck.tsx`, `DeckLog.tsx`, `deck-now.ts`, `deck.css` | Footer bar (spinner, GENOBI, the newest line), opening to the visualiser, the whole log and the actions; `VIS` cycles programs; open state and mode kept in this browser                                                      |

The open visualiser runs at 30 fps, with a slightly gentler drift while idle.
Only **Metaballs**, **Rain** and **Black hole** appear in the cycle. Metaballs
mixes three hues with light/dark shading and morphs on its own; moving the pointer
does not pull the blobs. Click a blob to score ten points and split it into two
smaller blobs. Small fragments disappear; the population stays bounded at fourteen.
**Pop next blob** provides the same action by keyboard. **Reset game** starts six
fresh blobs and clears the score. Score stays in this page's deck session and is
not sent to the agent, provider or server. Rain and Black hole respond to pointer
movement; click their image or the VIS control to change program.

The screen itself holds still: its box stays the deck's dark, semi-transparent
black (`--status-bg`) and never tints, tilts or nudges on hover, press or focus;
only its characters react. Keyboard focus shows the accent outline. Before
28 October 2026 hovering tinted it with `--accent-ghost` (lime, or coral in the
cyberpunk theme) and the studio shell's pressed-button rule moved it down a
pixel; `tests/deck-screen-still.test.ts` reads `deck.css` to keep it still.

**Pause** freezes the image; reduced motion keeps ambient movement still, while
intentional clicks still work. Opening the deck overlays the page without moving
the studio. Phones show the same visualiser above the log, the two scrolling
together. Checks live in `tests/genobi-deck.test.tsx`,
`tests/deck-mounted.test.tsx`, `tests/deck-screen-still.test.ts`, `tests/terminal-game.test.ts` and
`scripts/check-terminal-game.mjs` (local browser only).

Setup's install wait draws the same Rain outside the deck, as characters
only and faint behind the installer's progress (`src/deck/AsciiBackdrop.tsx`,
12 frames a second, still under reduced motion;
[voice setup](voice-setup.md#while-it-installs)).

## The walkers game (Konami code)

Typing ↑ ↑ ↓ ↓ ← → ← → B A anywhere in the studio, except in a text field,
a contenteditable or a dialog, opens a small walkers puzzle in the deck
(#97): little Genobi creatures (`o>`) leave a door (`∩`), walk, fall and turn
at walls, and the person gives them jobs (**dig** down through soil, **build**
a five-brick stair, **block** to turn others back), each a limited count, to
get enough of them home (`⌂`). It is our own design in that genre: the
creature, five fields, their names and art and the music are written for
Genobi. A fall of more than five cells splats; water (`≈`) and steel (`█`,
which will not dig) are the hazards.

| Field        | Teaches                                           |
| ------------ | ------------------------------------------------- |
| Turn Around  | Block one walker so the rest turn from the pond   |
| Soft Floor   | Dig through the floor to the corridor below       |
| Mind the Gap | Build a stair over water; hold the line meanwhile |
| Steel Pocket | Find the soil among steel before the pond         |
| Up and Over  | Stair over a hill, then a timed stair over a pond |

- **Where:** a pure, fixed-step simulation in `shared/walkers/` (`levels.ts`,
  `sim.ts`, `render.ts`, drawn as the same `Frame` the visualisers use);
  the deck side in `src/deck/walkers/`. `GenobiDeck.tsx` has one mount point,
  `WalkersSlot`: while the game is open the visualiser stays mounted but
  hidden, and Esc (or the bar, or EXIT) hands the deck back exactly: its open
  state, mode, pause and metaball game, and focus where it was.
- **Grid:** 40 × 9 while the game is open (the visualisers use 36 × 7), in the
  visualiser's column beside the log; phones draw it larger, above the log.
- **Controls:** tap or click a creature to give it the selected job; job
  buttons (1/2/3, or D/B/K) choose it; ←/→ pick a creature and Enter gives the
  job; P pauses, R restarts, N moves on, M mutes, `.` steps, Esc leaves. A
  hidden tab pauses the game and stops all sound. Under reduced motion nothing
  animates: STEP (or `.`) moves one tick.
- **Sound:** handheld-style chip audio synthesised with Web Audio
  (`chip-audio.ts`, `chip-tune.ts`): 12.5/25/50% pulse waves, a triangle
  bass and LFSR noise; an original eight-bar loop and effects for spawn,
  job, dig, build, splat, home, win and fail. No sample files. It starts on
  the Konami key press, plays quietly, mutes with M or SOUND (remembered in
  this browser) and stops on exit.
- **Status:** written with the studio's progress lines (`progressLine` in
  `shared/progress-line.ts`, through `shared/walkers/hud.ts`), never a bar of
  its own: `SAVED 1/4  25% ⣿⣤⣀⣀⣀` counts against the field's target, and
  `ENERGY 4/5  80% ⣿⣿⣿⣿⣀` is what is still in play (creatures on the field
  plus those still behind the door). The simulation has no clock, so energy
  is creatures, not time; it runs down to zero as the field resolves. Job
  buttons show their stock in the same capitals (`DIG 2`).
- **Activity line:** while open, the game publishes
  `WALKERS · FIELD 2 SOFT FLOOR · SAVED 3/4  75% ⣿⣿⣿⣀` to `busy.ts`
  through `setBackgroundActivity`, so the wordmark's loader and the deck bar
  show it. Background entries sort below every real one, the loader skips
  them while any real work is listed, and the deck's step chain leaves them
  out, so a job or an agent's line is never hidden. Leaving the game (Esc,
  EXIT, the bar, unmount) clears it.
- **Metaballs stays.** The walkers game is hidden behind the code and borrows
  the deck only while open, so the visible metaball game keeps its place.
- **Checks:** `tests/walkers-sim.test.ts` (walk, fall, turn, dig, build,
  block, splat, level complete, determinism, a recorded solution for every
  field) and `tests/walkers-audio.test.ts` (scheduling and stop with a fake
  `AudioContext`, the code and where it is ignored).

The programs follow Andreas Gysin's
[play.core](https://github.com/ertdfgcvb/play.core) (Apache-2.0) idea of a
program as a per-cell function; they are written for Genobi, not copied.

## The plan

Each step stands alone and is useful without the next.

1. **Stages for chained runs.** The chain of steps (above, #96) shows what
   happened and what runs now. Steps not yet started
   (`○ VIDEO` after `KLEIN IMAGE 73%`) still need a structured plan from the
   run itself, such as a chain's stage list, never the agent's own words.
2. **Voice in the deck.** The live transcript of what was said and what Genobi
   replied, as two coloured lines, so a voice session can be read back.
3. **Taste quiz while waiting.** Two visuals side by side (two ASCII programs,
   two Director graphics recipes, two reference frames); the person picks one
   and may say why. Picks stay a private list until the owner promotes one,
   as [taste memory](taste-memory.md) requires; a promoted pick then steers
   which effects and approaches an agent proposes for a video.
4. **The Genobi mask.** The mask rendered in 3D and drawn as braille dither:
   dots gather into it at launch, it breathes while a job runs, blinks once
   when one finishes. The same renderer feeds the deck and a terminal header.
5. **Inside agent terminals.** A Claude Code mod draws the same programs in a
   `Raster` band above the prompt (repainted with `$.ui.blit`) and puts the
   stage in place of Claude's own spinner word; Hermes prints `progressLine`
   through the skill today and can draw the programs from a small Python port
   of the same per-cell functions later; its spinners can be the same
   cli-spinners frames through `yaspin`, which uses that set (its licence
   to be checked before use). A standalone `genobi watch` in a plain terminal
   needs the "Link an agent" grant first: the studio scopes jobs to a session,
   so a watcher with a session of its own would see none of the person's.
6. **Taste quest: a style you grow.** The taste quiz as a game with levels.
   Each pick changes the deck's own look (palette, density, motion, the
   programs it runs) and Genobi offers the same choices for the next video, so
   the style a person grows while waiting is the style their takes start
   from. Levels unlock richer media in the order the studio can render them:

   | Level       | What you pick between                              | What it can steer in a video                              |
   | ----------- | -------------------------------------------------- | --------------------------------------------------------- |
   | 1. ASCII    | braille, block and character programs, palettes    | ASCII and braille overlays, title treatments              |
   | 2. Pixel    | pixel-art palettes, dithers, scale                 | pixel and dither grades (the Dual Editor's dither exists) |
   | 3. Images   | reference stills and looks from the catalogue      | Klein frame 0 edits, references, grade                    |
   | 4. Three.js | shaders, materials, camera moves in the 3D builder | World Builder scenes and playblasts                       |
   | 5. Type     | fonts and kinetic typography recipes               | Director titles ([motion fonts](motion-fonts.md))         |

   Picks stay private until the owner promotes them, as above; levels are a
   way to show more choices, not a gate on the studio's tools.

7. **A small game.** Something to play during a long render that also helps:
   spot what a Gen-Mod take changed, or guess which of your own takes a frame
   came from. Off by default.
8. **The bigger app.** The deck grown into its own window, Winamp-style:
   skinnable, docked or floating, with the visualiser reacting to the take's
   audio (the studio already analyses audio, `docs/audio-analysis.md`).

## Engines

The MVP draws with its own TypeScript programs. Two engines could take over
where they do more:

- **dotmax** (Rust, MIT OR Apache-2.0, `newjordan/dotmax`, 0.1.11 on
  crates.io, needs Rust 1.70): a braille grid with line, circle and colour
  primitives and effects such as plasma, black hole and ribbons, with images,
  GIF, video and 3D OBJ behind features. In a Tauri shell it runs natively on
  the Rust side; compiled to WASM, with its terminal-only modules left out, it
  writes coloured braille into a `<pre>` as the deck does. It is young (first
  published December 2025, about 700 downloads by October 2026): pin the
  version and try it before depending on it. Its demo also shows several hundred
  themed loaders (blood flow, an enzyme eating a line, a charging capacitor,
  an oscilloscope), each a small animation with a percentage: a library of
  progress skins the deck could pick from by stage and by the person's taste.
  The rule above still holds: a loader's fill follows the provider's reported
  progress, and with none it runs as an ambient loop without a percentage.
- **play.core** (Andreas Gysin, Apache-2.0): the per-cell runner the programs'
  shape comes from; unpublished on npm, so vendored if ever used.

Either one must keep drawing the same frames from the same inputs, so the deck,
a Claude Code band and a Hermes port do not drift apart.

## Rules

- Never a number standing in for one: a bar or percentage appears only when the
  provider reported progress; otherwise elapsed time.
- Decorative motion stops under reduced motion or Pause. Idle visual movement is not job progress.
- The deck never starts or pays for anything by itself. Approve, Decline
  and Stop act only on the person's click (moved here from the bubble, #57).
- It stays mounted in the studio header; `tests/deck-mounted.test.tsx` fails
  if a change drops it.
- Nothing about the person leaves the browser: the deck's own settings live in
  local storage, and picks go to taste memory only when the owner promotes them.

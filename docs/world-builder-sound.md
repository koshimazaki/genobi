---
tags: [3d, world-builder, sound]
summary: World Builder's Sound panel, the example track, the audio mod matrix, the reactive room presets and what the Comfy node shows of them.
---

# World Builder sound

Part of [World Builder and Scene Adapter](world-builder.md). Sound is live in
Shot, Build and Walk; a take freezes it on its frame grid at capture.

## The Sound panel

The owner, 29 October: "Look at what we had in Holodeck's World view — that
was really perfect — do it verbatim, but fit it in our one." The panel keeps
Holodeck's Audio Intel transport and instruments (`AudioControls.tsx`,
`SoundSections.tsx`). The audiovisual workflow now follows Camera's hierarchy:
editable response first, optional diagnostics after it.

- **Transport** at the top: Play/Stop (accented while playing) with a live
  LOW/MID/HIGH/LVL meter strip beside it, Load audio, the **Recent** menu and
  the track's name. Folded in the dock, the panel keeps the transport and its
  meter in view.
- **Audio response**, open by default: the active-route count and the
  [mod matrix](#audio-mod-matrix). Choose which bands affect which scene
  properties, then press Play to preview. Route changes still use the live
  tuning path without stopping playback.
- **Signal scopes**, closed by default: band meters with peak hold, a scrolling
  spectrogram and a spectrum. While the track plays they read a live
  AnalyserNode on the World Builder's `<audio>` element
  (`audio-analyser.ts`); otherwise they show the recipe's precomputed
  envelopes at the current frame, so scrubbing still reads. The analyser is
  attached only once the browser's audio context is running, so a context it
  keeps suspended never silences the track. One animation loop drives every
  meter (`useSignalScopes.ts`), scheduled on the window that holds the panel,
  so it keeps running when the panel is popped out. The native disclosure
  keeps the instruments mounted when closed; it does not restart the scope
  loop or reset route values.
- **Audio assets** and **Clear audio** remain below the response and scopes.

A track a person loads plays at once: a picked file, a drop on the scene, a
Recent or Audio assets pick, project audio, or a recent row dragged onto the
scene (`sound-autoplay.ts`). The pick or drop is the user gesture, but decoding
in between is async; when the browser still refuses playback the preview
stops, the status line says so, and Play is there to press. A failed load does
not play. An agent's `setAudio`, audio a Comfy editor sends and a named take's
dry sound load without playing.

Recent tracks are kept in this browser's IndexedDB (`audio-recent-store.ts`),
so they survive a reload: six tracks and 96 MB at most, the least recently
used dropped first. Project audio is listed but not stored, as the project
already holds it. Nothing is uploaded, and a track's name is shown only in the
list, never in the recipe. Without site storage the list lasts for the tab, and
the panel says so. The bin on a row forgets the track here.

## Audio mod matrix

The owner, 28 October: "If we move three things with different bands and
different settings, it would be good." A recipe's `audioRoutes` holds up to 16
routes, ported from Holodeck's mod matrix (`src/world-builder/mod-routes.ts`).
Each route reads one source (`low`, `mid`, `high` or `level`) and drives one
property of one target:

| Target                       | Properties                        |
| ---------------------------- | --------------------------------- |
| `primitives`, `prop:<id>`    | `scale`, `height`, `spin`, `glow` |
| `world`, `world:<set piece>` | `scale`, `height`, `spin`         |
| `avatar` (the character)     | `height`, `scale`, `yaw`          |
| `neuro` (the shader)         | `scale`, `light`                  |
| `light:key`, `light:fill`    | `light`                           |

Set pieces are the Playground's editable ids (`car-a`, `drone`, `stairs` and
the rest in `playground.ts`); routes to them act only in the Playground scene.
A route's value is `amount` (0 to 8) times the band level, silenced below its
`threshold` gate (0 to 1) and optionally inverted, then smoothed by `lerp`
(0.01 to 1; 1 follows the envelope exactly). Scale multiplies by 1 + value,
height adds metres, spin is a rate in rad/s, yaw adds radians, glow is the
prop's emissive intensity and light adds intensity (×3 on the key light, as
before). Routes on the same target and property add up.

Holodeck smooths live, frame by frame. Here the same one-pole smoothing runs
over the recipe's precomputed envelope from frame zero, so a route's value at a
frame depends only on the recipe, and a take is frame-exact however it was
previewed. Build hides the offsets, as before; Play applies route edits live in
every mode.

In the Sound tab each row has an on switch, the source with a small level
meter per band, target, property, Inv, and Amount, Gate and Response sliders.
**Add route** adds one; with a prop or set piece selected in Build it becomes
**Route selected** and targets it. Removing a prop removes its routes.

The single-route fields of older recipes (`audioBand`, `audioObject`,
`audioTarget`, `audioGain`, `audioGate`, `audioInvert`) are still accepted.
They describe one route, which migrates to the routes that reproduce it
exactly (scale and light also drove the Neuro shader, and light the key light,
whichever object was chosen). When any of them is present, as in the room and
storyboard examples or an agent's `configure({ ...getRecipe(), audioBand: "low" })`,
they replace the matrix with that one route. Fields such a patch leaves out
come from route 1 (its source, amount, gate, invert, object and property, where
the old fields can express them), so the patch changes only what it names. A recipe with no audio fields keeps the old default:
`level` pulses every primitive's scale and the shader at amount 2.
`describe()` lists the `audio-mod-matrix` capability.

## The example track

The owner, 29 October: opening World Builder and pressing Play should show the
audio analysis working at once. The example track is **Koshi Mosaic ·
Dimensions**: the first 60 seconds of the owner's own track as a 128 kbps
stereo MP3 with a 1.5-second fade-out
(`public/media/director-templates/dimensions-mix/mix-track.mp3`, 961 KB,
bundled with the owner's permission; see
[LICENCES.md](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md)).
`example-track.ts` fetches it when World Builder opens and shows it as the
track, **Dimensions** (the credit is its tooltip), in the studio page and in
the Comfy node, whose bundle copies it to the same relative path.

It does not play on open. Browsers refuse sound before a gesture, and decoding
on open would hold the scene busy while a Comfy graph sends its stored recipe
or audio. The first Play press with no track loaded (the Sound tab's Play in any
mode, the take strip's Play or Space in Shot camera) decodes it, loads its
envelopes and plays, so the scopes and the mod matrix move at once. Once any
track has loaded the example is no longer offered; it stays in Recent with the
tag Example.

## Reactive room presets

Every room preset (Small room, Acoustic room, Club, Cathedral) keeps its floor
and walls and adds two test objects either side of the character, both
circling it slowly with a prop `orbit` of 0.3 rad/s about the scene centre:

| Object         | Routes (`room-presets.ts`)                                                     |
| -------------- | ------------------------------------------------------------------------------ |
| `pulse-sphere` | low → height (amount 0.8), low → scale (0.9): it rises and grows with the lows |
| `spin-cube`    | mid → scale, inverted (0.8): it shrinks as the mids rise; mid → spin (4 rad/s) |

The routes have no gate and a response of 0.35. They replace the old default
(level pulsing every primitive, walls included, and the shader), so the walls
stay still. The objects are small enough that the Acoustics estimate of each
room is unchanged. The **Small room** names the owner's creature as its
character: the Load preset menu loads it with its receipt when the creature
VRM is attached under Scene, and the neutral mannequin when it is not
(`preset-menu.ts`). The node's `examples/rooms/*.json` are these presets as
recipes, so `small_room.json` names the creature; configured directly, without
the menu, it needs the creature attached.

## Inside the Comfy node

The Comfy node runs the same panel. Its Sound tab lists the graph's audio as
**Graph audio outputs**: SaveAudio, PreviewAudio and World Builder · Inputs
outputs of this session, newest first, tagged Graph output, with this
browser's recent tracks. There is no project there, so no project audio is
listed. With nothing run yet the list says which nodes fill it.

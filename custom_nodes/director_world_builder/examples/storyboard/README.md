# Storyboard recipes

`ninja/p01.json` … `p08.json` are the eight World Builder scenes behind the
Scrolls **Four Rooms** board, modelled on the Sky Gate sheet: one recipe per
panel, 17 frames at 24 fps, 1024×576, at most 24 primitives.

| Panel | Shot          | Set                           | Clip                         | Camera shot  |
| ----- | ------------- | ----------------------------- | ---------------------------- | ------------ |
| P01   | low wide      | Playground field              | jog (creature: `run`)        | `lowTrack`   |
| P02   | aerial track  | Playground field              | jog (creature: `run`)        | `wideOrbit`  |
| P03   | 360 reveal    | Cathedral                     | idle (creature: `ninja`)     | `orbit180`   |
| P04   | pass-by       | Monument + statue primitives  | sprint (creature: `run`)     | `sideAction` |
| P05   | low drop      | Club (`empty_club`)           | land (creature: `jump`)      | `lowTrack`   |
| P06   | impact insert | Small room                    | punch (creature: `ninja`)    | `pushIn`     |
| P07   | heroic medium | Acoustic room (`medium_room`) | spell                        | `shoulder`   |
| P08   | crane wide    | Cathedral                     | dance (creature: `backflip`) | `crane`      |

Each shot comes from `shotPatch` in `src/world-builder/camera-shots.ts`,
turned with the character's yaw so rooms are filmed through their open front.
The mannequin is the default; the creature clips need the owner's local VRM
and FBX files, which are not bundled, so swap `avatarAsset` and
`avatarMotion` only where that asset is loaded.

Capture: start the studio (`npx vite --port 5491 --strictPort`), then
`DIRECTOR_URL=http://127.0.0.1:5491 node scripts/capture-ninja-storyboard.mjs`.
The mannequin's moves for longer takes are in [`../moves/`](../moves/README.md).
Load any recipe in Comfy with **World Builder · Capture** and tile the first
frames with **World Builder · Storyboard** on `2x4`.

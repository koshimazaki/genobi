# Mannequin move library

One World Builder recipe per move: the bundled mannequin in a room, a named
camera shot, 1024×576 at 24 fps and 121 to 169 frames (5 to 7 s). Each take
is a video whose colour frames, linear depth and canny (drawn by **World
Builder · Capture**) are the guidance for one generated shot.

| Recipe                   | Moves, in order (seconds)                                          | Room               | Camera shot  | Frames |
| ------------------------ | ------------------------------------------------------------------ | ------------------ | ------------ | ------ |
| `jog.json`               | idle 1, jog 4                                                      | Acoustic room      | `sideAction` | 121    |
| `sprint.json`            | jog 1.5, sprint 3.5                                                | Cathedral          | `lowTrack`   | 121    |
| `jump.json`              | idle 1, jump 1.25, jump-air 0.5, land 1.25, idle 2                 | Small room         | `face`       | 145    |
| `roll.json`              | jog 1.5, roll 1.5, idle 2                                          | Club               | `sideAction` | 121    |
| `fall.json`              | idle 1.5, hit 0.5, fall 4                                          | Cathedral          | `orbit60`    | 145    |
| `sit.json`               | idle 1, sit-down 1.25, sit 1.5, sit-talk 1.5, stand-up 1, idle .75 | Acoustic room      | `face`       | 169    |
| `crouch.json`            | idle 1, crouch 2, crouch-walk 2                                    | Small room         | `pushIn`     | 121    |
| `sword.json`             | idle 1, sword 1.5, idle 0.75, sword 1.5, idle 1.25                 | Club               | `shoulder`   | 145    |
| `fall-cathedral.json`    | idle 1, hit 0.5, fall 4.5                                          | Cathedral          | `highWide`   | 145    |
| `fall-small-room.json`   | idle 1, hit 0.5, fall 4.5                                          | Small room         | `highWide`   | 145    |
| `fall-medium-room.json`  | idle 1, hit 0.5, fall 4.5                                          | Acoustic room      | `highWide`   | 145    |
| `dance-balls.json`       | dance 5, two audio-driven balls                                    | Club               | `face`       | 121    |
| `skydive-cathedral.json` | jump-air 8, face-down descent along `avatarPath`                   | Cathedral + towers | `skydive`    | 193    |

`avatarMotion` is a list of `{ clip, seconds }`; each move starts on the
nearest whole frame and the last runs to the end of the take. A clip that
plays once (jump, land, roll, fall, sit-down, stand-up, hit, sword and the
like) holds its last frame inside a list, so the fall ends on the floor. The
`sit` take adds a box bench under the mannequin. All animation is in place:
the mannequin does not travel across the room.

The three `fall-*` takes use the `highWide` shot: a wide 50° lens 2.7 m from
the figure at 25° above, azimuth −30°, aimed at 1.0 m. The standing figure
fills about 58% of the frame height with its feet in the lower fifth, and it
crashes near the bottom edge with the room still readable. The fall is `Death01`
played in place: the figure collapses where it stands.

`skydive-cathedral.json` is the descent before such a fall: the mannequin
lies face down (pitch +90°) at 38 m and drops along `avatarPath` (one key at
frame 192, `ease: "fall"`) between ten glass-tower boxes, through the open
roof of the Cathedral (closed on all four sides here), to its floor. The
`skydive` shot follows from just above and behind; he passes the roof line
(18 m) at about frame 139. The impact is left to the video model or to one of
the room fall takes as the next shot.

`dance-balls.json` puts two spheres (`ball-left`, `ball-right`) at hip height
either side of the dancing mannequin and routes the audio to them: low band →
scale on the left ball (amount 1.8), high band → height on the right
(1.0 m), and mid → glow on both (1.5), all with lerp 0.6 and a 0.02 gate (glow is the prop's emissive intensity, so it applies to
spheres). Its routes target the two props by id, not `primitives`, which
would also pulse the room's walls. The recipe names no track and embeds none:
attach audio before capture (`setAudio(blob)`, the Sound panel, or the capture
script's `AUDIO=` option below), or the balls stay still.

The library grows by adding a recipe here. `scripts/make-move-takes.ts`
records how these were made (`npx tsx scripts/make-move-takes.ts`
rewrites them); editing a JSON file directly is just as valid.

Capture: start the studio (`npx vite --port 5491 --strictPort`), then
`DIRECTOR_URL=http://127.0.0.1:5491 node scripts/capture-move-library.mjs`
(or name moves: `… capture-move-library.mjs jog fall`). `AUDIO=<file>`
attaches that track to every take of the run, so capture an audio take on its
own: `AUDIO=beat.wav … capture-move-library.mjs dance-balls`. Per move, under
`.local/move-library/`: `take.webm`, `depth.webm`, `first.png`,
`depth-first.png`, `receipt.json` and a five-frame `sheet.png`. Load a recipe
in Comfy with **World Builder · Capture** to get the same take as IMAGE
frames, depth and canny.

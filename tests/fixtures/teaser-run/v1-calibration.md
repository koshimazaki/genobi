# Teaser v1 calibration (owner side)

Not for a run to read. This is the v1 cut's every shot and overlay with its
literal values, kept so the owner and the tests can see how far a
rule-derived run lands from v1. A run derives its values from
`docs/genobi-teaser-run/decision-table.md` (rules and inputs) instead; the
run prompts forbid opening `tests/fixtures/`.

## The sections

### open: beats 0–12 (0.00–5.33 s)

**Music:** intro, first downbeat on beat 4. **Why:** nothing plays before the first shot, so an opaque card holds the frame; the boot status is true (the studio booted).

| Layer      | Recipe     | Lane   | Beat | Beats | Values                                                                            |
| ---------- | ---------- | ------ | ---: | ----: | --------------------------------------------------------------------------------- |
| `title`    | gen-title  | cards  |    0 |    12 | "GENOBI" / "THE AI FILM STUDIO YOU DIRECT"                                        |
| `status-0` | gen-status | status |    0 |    10 | "Booting the studio" → "Studio ready" · scan · doneAt 2.8 · fadeAt 4.144 · y 0.86 |

### first-shot: beats 12–20 (5.33–8.89 s)

**Music:** still the intro. **Why:** the first picture is _built_ in front of the viewer (gen-image), and the status names FLUX 3 because the forest guardian is a FLUX 3 run. Beat 20 is a required cut.

| Layer      | Recipe     | Lane   | Beat | Beats | Values                                                                                      |
| ---------- | ---------- | ------ | ---: | ----: | ------------------------------------------------------------------------------------------- |
| `reveal-1` | gen-image  | cards  |   12 |     8 | still `still-character.jpg` · duration 3                                                    |
| `status-1` | gen-status | status |   12 |     8 | "Generating shot 01 · FLUX 3" → "Shot ready" · twinkle · doneAt 3.1 · fadeAt 3.256 · y 0.93 |

### generations: beats 20–36 (8.89–16.00 s)

**Music:** intro, a break on 28–36. **Why:** the owner's generations first; the HUD says what the studio did; MAKE slams on the break before the drop.

| Beat | Beats | Asset          | sourceSeconds | cropY |  zoom | Label                        |
| ---: | ----: | -------------- | ------------: | ----: | ----: | ---------------------------- |
|   20 |     8 | `character`    |             0 |  null |  1.33 | Forest guardian · first look |
|   28 |     4 | `product`      |             2 |  null |  1.33 | Toy creatures                |
|   32 |     4 | `audio-visual` |           0.3 |  null | 1.317 | Neon bloom · close           |

| Layer       | Recipe       | Lane   | Beat | Beats | Values                                            |
| ----------- | ------------ | ------ | ---: | ----: | ------------------------------------------------- |
| `hud-1`     | hud          | hud    |   20 |    16 | "GENOBI // CUT IN GENOBI" · "MUSIC / KOSHIMAZAKI" |
| `glitch-20` | slice-glitch | glitch |   20 |   0.5 | amount 0.85 · seed 143 · duration 0.2             |
| `make`      | kinetic      | impact |   34 |     2 | "MAKE" · size 150                                 |

### make: beats 36–76 (16.00–33.78 s)

**Music:** drop on 36 (+7.2 dB), break 72–76. **Why:** the studio opens on the drop: gallery, then one Camera detail per beat (families, the prompt, the quote), a loader and the motorbike built by gen-image; DIRECT on the break.

| Beat | Beats | Asset        | sourceSeconds | cropY |  zoom | Label                     |
| ---: | ----: | ------------ | ------------: | ----: | ----: | ------------------------- |
|   36 |     8 | `ui-gallery` |           0.2 |  null |     — | Gallery · the generations |
|   44 |    12 | `ui-camera`  |           0.2 |  null |     — | Camera · model families   |
|   56 |     6 | `ui-camera`  |           6.6 |  null |     — | Camera · the prompt       |
|   62 |     8 | `ui-camera`  |           9.3 |  null |     — | Camera · the quote        |
|   70 |     6 | `library-01` |             0 |  null | 1.023 | Motorbike · the shot      |

| Layer       | Recipe       | Lane   | Beat | Beats | Values                                                                                  |
| ----------- | ------------ | ------ | ---: | ----: | --------------------------------------------------------------------------------------- |
| `cursor-36` | ui-cursor    | cursor |   36 |     8 | helper: `cursor ui-gallery 0.2 8`                                                       |
| `zoom-36`   | ui-zoom      | zoom   |   36 |     8 | centre 0.62, 0.45 · zoom 1.4                                                            |
| `glitch-36` | slice-glitch | glitch |   36 |   0.5 | amount 0.85 · seed 255 · duration 0.2                                                   |
| `cursor-44` | ui-cursor    | cursor |   44 |    12 | helper: `cursor ui-camera 0.2 12`                                                       |
| `zoom-44`   | ui-zoom      | zoom   |   44 |    12 | centre 0.3, 0.8 · zoom 2.3                                                              |
| `focus-44`  | ui-focus     | focus  |   46 |     9 | box 0.301, 0.727, 0.02, 0.03 · "MODEL FAMILIES · LTX FLUX H3 UPSCALE" · fadeAt 3.65     |
| `cursor-56` | ui-cursor    | cursor |   56 |     6 | helper: `cursor ui-camera 6.6 6`                                                        |
| `zoom-56`   | ui-zoom      | zoom   |   56 |     6 | centre 0.4, 0.4 · zoom 2                                                                |
| `cursor-62` | ui-cursor    | cursor |   62 |     8 | helper: `cursor ui-camera 9.3 8`                                                        |
| `focus-62`  | ui-focus     | focus  |   62 |     4 | box 0.669, 0.693, 0.123, 0.079 · "QUOTED FIRST · NOTHING SPENT UNASKED" · fadeAt 1.428  |
| `zoom-62`   | ui-zoom      | zoom   |   62 |     8 | centre 0.72, 0.46 · zoom 2.4                                                            |
| `status-2`  | gen-status   | status |   64 |     6 | "Generating · FLUX 3 · 10 s" → "Shot ready" · orbit · doneAt 1.6 · fadeAt 2.367 · y 0.8 |
| `reveal-2`  | gen-image    | reveal |   68 |     5 | still `still-motorbike.jpg` · duration 1.8                                              |
| `direct`    | kinetic      | impact |   72 |     2 | "DIRECT" · size 150                                                                     |
| `glitch-72` | slice-glitch | glitch |   72 |   0.5 | amount 0.85 · seed 507 · duration 0.2                                                   |

### direct: beats 76–140 (33.78–62.22 s)

**Music:** drop on 76 (+14.1 dB), the biggest change on 92, drop on 124. **Why:** the Director and Editor in use, the 92 drop cut to two-beat generations, shot and lens pickers, the rendered Dimensions mix, Send to Genobi boxed before the build. BUILD / WORLDS on the 136–140 break.

| Beat | Beats | Asset           | sourceSeconds | cropY | zoom | Label                         |
| ---: | ----: | --------------- | ------------: | ----: | ---: | ----------------------------- |
|   76 |     8 | `ui-director`   |           0.2 |  null |    — | Director · the mix plays      |
|   84 |     8 | `ui-editor`     |           0.2 |  null |    — | Editor · the timeline         |
|   92 |     2 | `mix-03`        |           0.3 |   240 |    — | Nocthorn · drop               |
|   94 |     2 | `mix-01`        |             1 |   200 |    — | Mirebloom · splash            |
|   96 |     4 | `product`       |          15.4 |  null | 1.33 | Toy creatures · glass         |
|  100 |     8 | `ui-editor`     |             5 |  null |    — | Editor · layers are recipes   |
|  108 |     8 | `ui-directions` |           0.6 |  null |    — | Editor · shot and lens        |
|  116 |     8 | `dimensions`    |          12.6 |  null |    — | The Dimensions mix · rendered |
|  124 |     8 | `ui-directions` |             5 |  null |    — | Editor · send to Genobi       |
|  132 |     4 | `character`     |          10.4 |  null | 1.33 | Forest guardian · fire        |
|  136 |     4 | `character`     |            16 |  null | 1.33 | Forest guardian · close       |

| Layer        | Recipe       | Lane   |  Beat | Beats | Values                                                                            |
| ------------ | ------------ | ------ | ----: | ----: | --------------------------------------------------------------------------------- |
| `cursor-76`  | ui-cursor    | cursor |    76 |     8 | helper: `cursor ui-director 0.2 8`                                                |
| `zoom-76`    | ui-zoom      | zoom   |    76 |     8 | centre 0.2, 0.33 · zoom 2                                                         |
| `glitch-76`  | slice-glitch | glitch |    76 |   0.5 | amount 0.85 · seed 535 · duration 0.2                                             |
| `wipe-84`    | signal-wipe  | wipe   |  83.5 |     1 | right · seed 84                                                                   |
| `cursor-84`  | ui-cursor    | cursor |    84 |     8 | helper: `cursor ui-editor 0.2 8`                                                  |
| `zoom-84`    | ui-zoom      | zoom   |    84 |     8 | centre 0.45, 0.74 · zoom 1.7                                                      |
| `glitch-92`  | slice-glitch | glitch |    92 |  0.75 | amount 1 · seed 647 · duration 0.3                                                |
| `cursor-100` | ui-cursor    | cursor |   100 |     8 | helper: `cursor ui-editor 5 8`                                                    |
| `zoom-100`   | ui-zoom      | zoom   |   100 |     8 | centre 0.62, 0.62 · zoom 1.8                                                      |
| `wipe-108`   | signal-wipe  | wipe   | 107.5 |     1 | left · seed 108                                                                   |
| `cursor-108` | ui-cursor    | cursor |   108 |     8 | helper: `cursor ui-directions 0.6 8`                                              |
| `zoom-108`   | ui-zoom      | zoom   |   108 |     8 | centre 0.28, 0.55 · zoom 2.2                                                      |
| `focus-108`  | ui-focus     | focus  |   110 |     5 | box 0.26, 0.492, 0.055, 0.037 · "SHOT & LENS · PER CLIP DIRECTION" · fadeAt 1.872 |
| `cursor-124` | ui-cursor    | cursor |   124 |     8 | helper: `cursor ui-directions 5 8`                                                |
| `zoom-124`   | ui-zoom      | zoom   |   124 |     8 | centre 0.76, 0.45 · zoom 2                                                        |
| `focus-124`  | ui-focus     | focus  |   128 |     4 | box 0.903, 0.455, 0.07, 0.035 · "SEND TO GENOBI" · fadeAt 1.428                   |
| `build`      | kinetic      | impact |   136 |     4 | "BUILD / WORLDS" · size 120                                                       |

### build-remix: beats 140–188 (62.22–83.56 s)

**Music:** drop on 156, cut on 140 after the break. **Why:** the 3D World Builder; neon bloom on the drop; Dual Swords; Scrolls kept to four beats, zoomed onto its dark cells (owner: Scrolls is a light page in a dark film).

| Beat | Beats | Asset          | sourceSeconds | cropY |  zoom | Label                    |
| ---: | ----: | -------------- | ------------: | ----: | ----: | ------------------------ |
|  140 |     8 | `ui-world`     |           0.2 |  null |     — | 3D · orbit the set       |
|  148 |     8 | `ui-world`     |           3.8 |  null |     — | 3D · build tools         |
|  156 |     4 | `audio-visual` |            13 |  null | 1.317 | Neon bloom · stands      |
|  160 |     4 | `audio-visual` |             5 |  null | 1.317 | Neon bloom · reaches     |
|  164 |     4 | `ui-world`     |          7.95 |  null |     — | 3D · a preset set        |
|  168 |     4 | `ui-world`     |         10.95 |  null |     — | 3D · the neuro shader    |
|  172 |     8 | `ui-swords`    |           0.3 |  null |     — | Dual Swords · A and B    |
|  180 |     4 | `ui-scrolls`   |             5 |  null |     — | Scrolls · the storyboard |
|  184 |     4 | `audio-visual` |            20 |  null | 1.317 | Neon bloom · lotus       |

| Layer        | Recipe       | Lane   |  Beat | Beats | Values                                 |
| ------------ | ------------ | ------ | ----: | ----: | -------------------------------------- |
| `cursor-140` | ui-cursor    | cursor |   140 |     8 | helper: `cursor ui-world 0.2 8`        |
| `zoom-140`   | ui-zoom      | zoom   |   140 |     8 | centre 0.42, 0.42 · zoom 1.35          |
| `glitch-140` | slice-glitch | glitch |   140 |   0.5 | amount 0.85 · seed 983 · duration 0.2  |
| `wipe-148`   | signal-wipe  | wipe   | 147.5 |     1 | up · seed 148                          |
| `cursor-148` | ui-cursor    | cursor |   148 |     8 | helper: `cursor ui-world 3.8 8`        |
| `zoom-148`   | ui-zoom      | zoom   |   148 |     8 | centre 0.3, 0.45 · zoom 1.5            |
| `glitch-156` | slice-glitch | glitch |   156 |  0.75 | amount 1 · seed 1095 · duration 0.3    |
| `cursor-164` | ui-cursor    | cursor |   164 |     4 | helper: `cursor ui-world 7.95 4`       |
| `zoom-164`   | ui-zoom      | zoom   |   164 |     4 | centre 0.55, 0.35 · zoom 1.3           |
| `cursor-168` | ui-cursor    | cursor |   168 |     4 | helper: `cursor ui-world 10.95 4`      |
| `zoom-168`   | ui-zoom      | zoom   |   168 |     4 | centre 0.45, 0.45 · zoom 1.25          |
| `cursor-172` | ui-cursor    | cursor |   172 |     8 | helper: `cursor ui-swords 0.3 8`       |
| `zoom-172`   | ui-zoom      | zoom   |   172 |     8 | centre 0.42, 0.4 · zoom 1.6            |
| `remix`      | kinetic      | impact |   172 |     2 | "COMPARE / REMIX" · size 110           |
| `glitch-172` | slice-glitch | glitch |   172 |   0.5 | amount 0.85 · seed 1207 · duration 0.2 |
| `wipe-180`   | signal-wipe  | wipe   | 179.5 |     1 | right · seed 180                       |
| `cursor-180` | ui-cursor    | cursor |   180 |     4 | helper: `cursor ui-scrolls 5 4`        |
| `zoom-180`   | ui-zoom      | zoom   |   180 |     4 | centre 0.35, 0.8 · zoom 2.3            |

### agents: beats 188–236 (83.56–104.89 s)

**Music:** drop on 188, break 232–236. **Why:** the Genobi agent: the brief, the status that states the approval rule (not a draft nobody made), Scrolls cell camera, the Signal reel, the inspector; ONE STUDIO on the break.

| Beat | Beats | Asset        | sourceSeconds | cropY | zoom | Label                               |
| ---: | ----: | ------------ | ------------: | ----: | ---: | ----------------------------------- |
|  188 |     4 | `mix-01`     |             6 |   240 |    — | Mirebloom · bursts                  |
|  192 |     8 | `ui-agent`   |           0.2 |  null |    — | Genobi · the brief                  |
|  200 |     8 | `ui-agent`   |          3.75 |  null |    — | Genobi · ready to start             |
|  208 |     4 | `ui-scrolls` |           6.5 |  null |    — | Scrolls · camera per cell           |
|  212 |     4 | `mix-02`     |             8 |   220 |    — | Duneward · robed form               |
|  216 |     8 | `signal`     |           2.4 |  null |    — | Signal · one character, every angle |
|  224 |     8 | `ui-editor`  |           8.6 |  null |    — | Editor · the inspector              |
|  232 |     4 | `mix-02`     |           1.3 |   120 |    — | Duneward · eyes ignite              |

| Layer        | Recipe       | Lane   | Beat | Beats | Values                                                                                                             |
| ------------ | ------------ | ------ | ---: | ----: | ------------------------------------------------------------------------------------------------------------------ |
| `glitch-188` | slice-glitch | glitch |  188 |  0.75 | amount 1 · seed 1319 · duration 0.3                                                                                |
| `cursor-192` | ui-cursor    | cursor |  192 |     8 | helper: `cursor ui-agent 0.2 8`                                                                                    |
| `zoom-192`   | ui-zoom      | zoom   |  192 |     8 | centre 0.2, 0.3 · zoom 2.1                                                                                         |
| `cursor-200` | ui-cursor    | cursor |  200 |     8 | helper: `cursor ui-agent 3.75 8`                                                                                   |
| `zoom-200`   | ui-zoom      | zoom   |  200 |     8 | centre 0.18, 0.38 · zoom 2.3                                                                                       |
| `focus-200`  | ui-focus     | focus  |  202 |     5 | box 0.017, 0.377, 0.235, 0.062 · "YOUR AGENT · TYPED OR SPOKEN" · fadeAt 1.872                                     |
| `status-3`   | gen-status   | status |  202 |     6 | "Brief: a 20 s teaser on the beat" → "Nothing runs until you approve" · pulse · doneAt 1.6 · fadeAt 2.367 · y 0.86 |
| `cursor-208` | ui-cursor    | cursor |  208 |     4 | helper: `cursor ui-scrolls 6.5 4`                                                                                  |
| `zoom-208`   | ui-zoom      | zoom   |  208 |     4 | centre 0.45, 0.5 · zoom 1.6                                                                                        |
| `cursor-224` | ui-cursor    | cursor |  224 |     8 | helper: `cursor ui-editor 8.6 8`                                                                                   |
| `zoom-224`   | ui-zoom      | zoom   |  224 |     8 | centre 0.88, 0.55 · zoom 2                                                                                         |
| `one`        | kinetic      | impact |  232 |     4 | "ONE STUDIO" · size 120                                                                                            |

### final-drop: beats 236–260 (104.89–115.56 s)

**Music:** the final drop on 236 (+14.1 dB). **Why:** twelve two-beat shots of the owner's generations, a glitch every bar, the HUD.

| Beat | Beats | Asset          | sourceSeconds | cropY |  zoom | Label      |
| ---: | ----: | -------------- | ------------: | ----: | ----: | ---------- |
|  236 |     2 | `mix-03`       |             4 |   160 |     — | Montage 01 |
|  238 |     2 | `product`      |             3 |  null |  1.33 | Montage 02 |
|  240 |     2 | `audio-visual` |             9 |  null | 1.317 | Montage 03 |
|  242 |     2 | `character`    |            14 |  null |  1.33 | Montage 04 |
|  244 |     2 | `mix-02`       |             8 |   220 |     — | Montage 05 |
|  246 |     2 | `library-03`   |             2 |  null | 1.023 | Montage 06 |
|  248 |     2 | `mix-01`       |           7.9 |   200 |     — | Montage 07 |
|  250 |     2 | `product`      |            12 |  null |  1.33 | Montage 08 |
|  252 |     2 | `audio-visual` |          18.5 |  null | 1.317 | Montage 09 |
|  254 |     2 | `character`    |            17 |  null |  1.33 | Montage 10 |
|  256 |     2 | `mix-03`       |             9 |   240 |     — | Montage 11 |
|  258 |     2 | `audio-visual` |            26 |  null | 1.317 | Montage 12 |

| Layer        | Recipe       | Lane   | Beat | Beats | Values                                                              |
| ------------ | ------------ | ------ | ---: | ----: | ------------------------------------------------------------------- |
| `hud-2`      | hud          | hud    |  236 |    24 | "GENOBI // CUT ON THE BEAT IN THE DIRECTOR" · "MUSIC / KOSHIMAZAKI" |
| `glitch-236` | slice-glitch | glitch |  236 |  0.75 | amount 1 · seed 1655 · duration 0.3                                 |
| `glitch-240` | slice-glitch | glitch |  240 | 0.375 | amount 0.9 · seed 1683 · duration 0.15                              |
| `glitch-244` | slice-glitch | glitch |  244 | 0.375 | amount 0.9 · seed 1711 · duration 0.15                              |
| `glitch-248` | slice-glitch | glitch |  248 | 0.375 | amount 0.9 · seed 1739 · duration 0.15                              |
| `glitch-252` | slice-glitch | glitch |  252 | 0.375 | amount 0.9 · seed 1767 · duration 0.15                              |
| `glitch-256` | slice-glitch | glitch |  256 | 0.375 | amount 0.9 · seed 1795 · duration 0.15                              |

### end-card: beats 260–269 (115.56–119.56 s)

**Music:** the outro has no bass. **Why:** one opaque layer holds from the last shot to the last beat; the credits name the track.

| Layer        | Recipe       | Lane   | Beat | Beats | Values                                                                                                  |
| ------------ | ------------ | ------ | ---: | ----: | ------------------------------------------------------------------------------------------------------- |
| `end-card`   | end-card     | end    |  260 |     9 | "MADE WITH" / "GENOBI" / "THE AI FILM STUDIO YOU DIRECT" / "MUSIC · TRAILER-GENOBI" / "KOSHIMAZAKI MIX" |
| `glitch-260` | slice-glitch | glitch |  260 |   0.5 | amount 0.85 · seed 1823 · duration 0.2                                                                  |

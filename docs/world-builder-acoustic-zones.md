---
tags: [3d, sound, world-builder]
summary: Explicit metre-scale room and outdoor zones, local CPU reverb estimates, scene-size coupling and audio rendering evidence.
---

# World Builder: story zones and local CPU room sound

World Builder can now attach explicit acoustic zones to a metre-scale story.
The camera (or an explicitly selected mannequin listener) chooses one active
enclosure on the same frame clock as the picture. A street or a point outside
all zones is dry: there is no inferred enclosed-room RT60.

This is an audible **model estimate**, not a measured room response. Each indoor
zone is a rectangular, broadband shoebox proxy. Decorative skyline geometry,
taxi motion and character meshes do not become acoustic walls automatically.

## Authoring contract

`motion.acousticZones` contains 1–8 labelled zones. It is mutually exclusive with
the existing `motion.room` single-room contract. `motion.acousticListener` is
`camera` by default, or `avatar` for the mannequin's feet pose plus a fixed
1.65 m ear height. Listener positions come from the same camera/character path
evaluator used for the shot. The last 5 cm at an indoor wall are clamped inward
for the shoebox calculation.

Every zone has `id`, `label`, `kind`, `center` and `dimensions`. The centre is the
world centre of the **floor**; dimensions are width, height and depth in metres.
Room-local x/z coordinates are centred and y is height above the floor.

An indoor `kind: "room"` also has a local `source`, six `absorption` values, a
deterministic `seed`, and optional `openings: [{ face, areaM2 }]`. An outdoor
`kind: "outdoor"` has no absorption or source: its result is dry. The shared
scene bounds apply to zones; opening area cannot exceed its room face.

Zone bounds are half open. On a shared floor the upper zone owns the boundary;
just below it the lower room becomes active. The smallest containing zone wins
for nested spaces, with author order as a stable tie-break. No zone means dry.

Saving A–D snapshots preserves the full authored zone configuration and listener
choice. A composed loop can retain zones only when every slot has the identical
configuration: use one architectural scene with different camera views. Mixing
zones with a slot that has none, different room sizes/materials, a different
listener, or incompatible part identities gives a clear error. Generated blocks
retain their original IDs instead of being matched to nearby walls or props.
Zone-bearing loops use Direct movement without whole-object rotation; camera
orbit remains available. The fixed zone bounds do not morph between enclosures.
**Save scene** preserves the complete authored story when an A–D loop is not the
right representation.

Room sources are authored independently per zone. Reusing one dry source file
means the same recording is emitted from each zone's specified local position.
It does not simulate a sound source travelling between rooms or propagating
through connecting portals.

## Scaling and apertures

The scene-size operation scales visible geometry, zone centres and dimensions,
local sources, camera paths and character **positions** together. The mannequin
keeps its human height. Aperture area scales by the square of the size factor,
so scaling a building does not accidentally seal or enlarge a shaft relative to
its surrounding surface.

For a face with base absorption `a` and opening coverage `q`, the approximate
effective absorption is `a + (1-a)q`. Open area is treated as sound escaping the
active room. The connected descent therefore labels its result an
`open-shaft-proxy`. It does not calculate coupled-room decay, diffraction,
occlusion, transmission between floors, or the frequency response of portals.
Those require a richer acoustic engine and should not be described as measured.

## Rendering and evidence

`buildAcousticSchedule(recipe)` evaluates the full picture grid, up to 721 frames
on the 24 fps / 8k+1 contract. Sound duration is `frames / fps`, including the last
frame's duration. Static mode explicitly freezes frame zero, even if it is dry.

The bounded sampler retains both sides of every zone/material/seed boundary.
It then prioritises authored state/camera keys and adaptively samples room
dimensions, source, listener and centre. Its maximum coordinate error is recorded
in the receipt; this is an input interpolation error, not an acoustic accuracy
claim. At most 24 snapshots and unique IR renders are used. If mandatory
boundaries cannot fit, rendering fails with a clear budget message instead of
discarding an outdoor transition. Large remaining coordinate errors are exposed
as `budgetLimited`.

Within one room, full-history wet convolution outputs crossfade linearly on the
picture clock. A boundary holds the previous environment until the exact new
frame. This prevents reverb leaking into the outdoor side of a boundary.
Boundary changes can be audible; they are not a portal-wave transition model.
The final room holds through an optional tail. If the shot ends outdoors there
is no final enclosed-room tail.

The local browser CPU engine uses deterministic early image reflections and a
seeded damped diffuse tail. It is adapted selectively from this repository's
`codex/dynamic-room-sound` branch at
`dc34bbf3c90060ddb43c6a3471c5a06f546a7cb5`; the IR and convolution algorithms are
reused rather than replaced. The current extension adds explicit dry zones,
listener-driven selection, aperture metadata, full-length timing, and mandatory
boundary sampling. It uses Offline Web Audio with no model call or audio upload.
Reflection delays are relative to the direct arrival. The dry path keeps the
chosen dry gain; camera distance does not add direct-source attenuation or a
propagation delay. Mono room responses process stereo channels independently,
without binaural positioning or stereo widening.

Dry source, control audio and the editor soundtrack remain separate roles.
Prepared control envelopes affect scene evaluation; rendered wet audio never
feeds back into motion analysis. Sources are trimmed or silence padded to the
picture clock. Output can extend the final decay or deliberately trim with a
short fade. A single whole-mix gain prevents clipping and is recorded.

The receipt includes the frozen recipe, scene evaluation provenance, source and
output hashes, exact schedule, zone labels, material/aperture assumptions,
estimated RT60 values, IR truncation, wet/dry settings and tail policy. The
default IR cap is 4 seconds (bounded at 6 seconds), so long cathedral estimates
can be truncated; the estimate and truncation flag remain explicit.

## Verification

`tests/world-acoustic-zones.test.ts` covers room/outdoor validation, physical
size and aperture scaling, listener-based selection, 721-frame boundaries,
material changes, rejected boundary loss, dry-only rendering and absent outdoor
tails. The ported CPU fixtures independently check exact convolution, retained
source history, deterministic responses, stereo tails, cancellation, clipping,
finite PCM safety and receipt hashes.

`node scripts/check-world-room-audio.mjs` also runs the real browser
OfflineAudioContext consumer with page network requests blocked. The local
Chrome check on 2026-10-31 matched an independent exact impulse oracle within
`2.56e-9` sample amplitude, with zero stereo crossfeed and a retained final tail.
The default first-person, 385-frame Endless descent rendered 7 unique IRs from 9 snapshots,
retained boundaries 193/289/337, and produced finite audio with exactly zero wet
contribution during the outdoor section. Two long cathedral responses reported
truncation at the default cap. Bass avenue produced zero IRs and zero tail.
The compact [CPU verification result](media/world-room-audio-proof.json) records
the current default-view run without machine paths or runtime timing noise.
These are software-consumer checks, not a measured-room or listening-study
validation. Set `DIRECTOR_BROWSER_PATH` when Chrome is outside Playwright's
default installation.

The existing static room/AKUSPACE workflow remains separate. Animated story
zones use this local CPU consumer. A future coupled-room solver can consume the
explicit metre-scale zone and aperture data without reinterpreting skyline
voxels as sealed architecture.

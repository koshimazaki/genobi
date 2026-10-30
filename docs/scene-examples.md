---
tags: [3d, agents, sound, mcp]
summary: Editable primitive starter scenes, bundled mannequins, deterministic capture and an LTX plus AKUSPACE first-frame workflow kit.
---

# Scene examples: use them before expanding the builder

Choose an example in the 3D Scene picker, make a shot, and test the actual
capture. The same data is available to agents through `genobi_scene`.
No new modelling engine or external asset service is required.

| Example            | Parts                                                   | Default cast        |
| ------------------ | ------------------------------------------------------- | ------------------- |
| Cathedral interior | Walls, floor, ceiling, columns, pews, altar             | One mannequin       |
| House interior     | Enclosed room, sofa, table, rug, cabinet                | One mannequin       |
| Exploded house     | Separated foundation, floors, walls, roof and furniture | None                |
| Neo Tokyo street   | Primitive buildings, glowing signs, windows, sidewalks  | One mannequin       |
| Mountains          | Layered peaks around a wide foreground                  | None                |
| Forest             | Trees around an open clearing                           | One mannequin       |
| Forest meeting     | Forest and two figures facing each other                | Two mannequins      |
| Forest companion   | Forest, mannequin and one pug dog                       | One mannequin + dog |
| City meeting       | Neon street and two figures facing each other           | Two mannequins      |

## Combinations

The tool's `examples` action lists choices; `example` returns a scene document.
Optional `surroundings` selects none, forest, mountains or city. Optional `cast`
selects none, solo or pair. The studio Subject picker offers the neutral mannequin
and a single abstract blob, alongside Scene default. An optional neutral pug is
also available; Forest companion includes a mannequin and dog together. An exploded house in a forest with two people is:

```json
{
  "action": "example",
  "example": "exploded-house",
  "surroundings": "forest",
  "cast": "pair"
}
```

Every part keeps a stable id, including `extra-` ids for companion environments.
Use the existing revision-checked commands to adjust parts and camera placement.
Save a hybrid as JSON and use **Load scene**. An enclosed interior still has its
walls; an exploded model is an open display and does not report enclosed-room
acoustics.

## Existing character assets

Characters use the already bundled Holodeck mannequin and its idle, talk, walk,
interact, punch, spell and dance clips. Walking is in-place. The renderer replaces
the authored coloured materials with neutral matte grey for abstract blocking.
**Cast credits** supplies a downloadable credit file; kits also carry the notices.
The optional pug comes from Quaternius's CC0 farm animals used in the
[Three.js game tutorial](https://threejs.org/manual/pages/game.html). Its four
poses are `idle`, `walk`, `walk-slow` and `jump`. Walking is in-place; humanoid
poses such as talking/spells are refused for the dog. **Neutral dog · pug** changes
the current cast to dogs; **Mannequin & dog · forest** gives a mixed starter.
Agents can set each actor's `asset` (`mannequin` or `pug`), pose and transform
independently with `set-characters`. The creature is the third, owner-supplied asset described below.
The dog uses the same neutral grey material, not its original colour scheme.
Robot, Soldier, fox, bear, child and mecha models remain reference sources.

The **Subject** picker can replace the existing abstract hero with a mannequin,
return to Scene default, or use one neutral sphere as the blob. It preserves the
saved scene and its surroundings. Examples with no actors can also receive a
mannequin. A scene with 200 non-hero primitives must free a slot before adding a
blob; it is refused in place without losing the scene.

A scene can hold eight characters with independent positions, rotations, scales
and poses. The studio waits for readiness before capture, reports missing assets,
and samples animations by frame time. Preview and capture have independent
skeletons and geometry, so scrubbing or changing scenes cannot alter an existing
capture. Old scene files without characters still work.

## Glitch Candies creature

Choose **Glitch Candies creature · local VRM** beside Neutral mannequin in the
Subject picker. Open **Creature model & motion** and load the original VRM.
Its exact fingerprint is pinned in the importer; arbitrary avatars are refused.
The model stays in this tab. Its metadata says OnlyAuthor / Redistribution
Prohibited, so no model or private FBX bytes ship in the repository or kits.
The repository's MIT licence does not cover the creature; verify output rights
for the intended use. Refreshing requires loading the file again.

The creature retains its authored colours, textures and MToon materials. It has
53 humanoid bones and no embedded animations. The bundled CC0 mannequin clips
are retargeted for idle, talk, walk, interact, punch, spell and dance. For the
original motion, choose a **Creature motion slot**, **Assign FBX animation**
(animation-only Mixamo FBX), then use **Preview creature motion**. Assigning
an FBX replaces that slot for this tab; run, fly and backflip require an FBX.
No external textures or URLs are loaded from motion files.

Scene JSON can mix `asset: "creature"` and `asset: "mannequin"` with independent
poses and transforms. Agents use the same `set-characters` command. A scene that
needs the creature or an unassigned motion blocks capture with a loading error.
Preview and capture have separate skeletons, materials and textures; animation
is sampled by frame time. Secondary spring physics, facial animation and UV
animation are held still for deterministic capture. This is a reusable character
for blocking and image-conditioned footage, not a guarantee that a video model
will preserve its identity.

Kits include `creature.json` with the canonical model fingerprint and assigned
FBX fingerprints, alongside the first-frame PNG. Playblast receipts record the
same provenance. Model and motion files are not included; an imported scene's
`asset` and `pose` require the same local files and assignments after refresh.

Private-fixture verification uses `scripts/check-creature.mjs` with
`CREATURE_VRM_PATH` and `CREATURE_FBX_PATH` (an Idle FBX). It checks desktop and
phone import, motion, a mixed mannequin/creature scene, first-frame kit and a
real MP4 with network writes blocked. These files and captures remain local.

## From 3D to LTX with AKUSPACE

**Export LTX + AKUSPACE kit** captures the real first frame and downloads:

- The PNG, editable scene and camera-path JSON.
- A prepared `workflow.json` using the pinned Docker image's AKUSPACE i2v graph.
- A manifest and README naming the PNG and dry reference recording to upload.

The real dry recording is supplied by the operator; it is not synthesized or
included in the kit. Open the [AKUSPACE Docker image](akuspace-docker.md), upload
the inputs, verify models/nodes and run only when ready. Rooms use their advisory
nearest room preset. Forests/mountains use outdoor day, and city examples outdoor
night. The LoRA and both image-conditioning passes remain in the graph.

This workflow conditions the **first image**. It does not consume the full
playblast or enforce the exported 3D camera path. Camera wording is a suggestion.
Exact layout/motion-conditioned LTX and a one-click studio generation handoff
remain separate gaps; the current Acoustic Space studio entry is text-to-video.
`genobi_scene video-plan` returns the same prepared graph without executing it.
No paid call, download of model weights or provider submission occurs on export.

## Checks

The scene/example tests validate every starter's round trip and camera receipt,
hybrid edit handles, character limits and asset refusal, first-frame workflow
links, duration, retained LoRA and day/night mapping. The character test loads the
real bundled GLB and checks animation sampling and capture isolation. Browser
checks exercise the scene picker, PNG/kit download, scene save/load and MP4
capture with API writes blocked. Real model generation requires a separate run;
local preparation is not evidence of an LTX result.

## Curated sources for later additions

Use existing examples and assets before building new asset systems:

- [Three.js animation blending](https://threejs.org/examples/webgl_animation_skinning_blending.html): Soldier reference; model rights need independent verification.
- [Three.js Robot Expressive](https://threejs.org/examples/webgl_animation_skinning_morph.html): CC0 model reference, not bundled.
- [R3F example gallery](https://github.com/pmndrs/react-three-examples): React implementations of animation, materials and camera techniques; individual model rights still apply. Its Soldier blending example uses the upstream Three.js asset.
- [Kenney](https://kenney.nl/assets): curated open game packs; [Animated Characters Protagonists](https://kenney.nl/assets/animated-characters-protagonists) is CC0.
- [Quaternius](https://quaternius.com): character, animal, mech, interior and environment packs; inspect the licence on the specific pack/version. [Ultimate Animated Character Pack](https://quaternius.com/packs/ultimatedanimatedcharacter) lists CC0.

Larger character and pet libraries remain future additions. A source link is not
an integrated model. New models need pinned provenance, credits, clip mapping,
size normalization and capture checks before joining the asset allowlist.

## Animation expansion, verified 24 October 2026

[Universal Animation Library 2](https://quaternius.com/packs/universalanimationlibrary2.html)
lists 130+ humanoid animations, GLB/FBX/Blend and CC0. It complements the first
library with melee, parkour, farming, fishing and zombie movement. Its page
separates free and source tiers, so the exact downloaded edition must be pinned.
It is a retargeting source, not a drop-in animation for every model. Animal rigs require their own compatible clips; a humanoid library cannot
automatically animate quadrupeds.

[Bestiary — Dungeon Monsters](https://quaternius.com/packs/bestiarydungeonmonsterskit.html)
provides seven humanoid-rigged monsters, three colour variants and compatibility
with the Universal Animation Library. Its current licence is **QAL**, not CC0.
[QAL](https://quaternius.com/license.html) allows finished projects but restricts
redistribution as standalone assets, packs and templates. Keep this as an
optional operator-acquired source rather than vendoring it into this public
asset library. Asset redistribution requires a separately confirmed grant.

[Animated Mech Pack](https://quaternius.com/packs/animatedmech.html) lists four
animated mechs under CC0 and is a candidate for a future authored-character expansion.
These three packs are researched sources; importing/retargeting their files is
not implemented by this PR.

## Blockout or authored character

The studio opens on a neutral blob in Set. Use **Subject** to choose the mannequin
or blob explicitly. Mannequins provide pose, scale and interaction guidance;
the blob supports composition and camera tests with less character identity.
First-frame i2v can carry source appearance into the result; this kit has no
separate depth/pose-only conditioning pass. State the intended final appearance
in the prompt and inspect the result rather than assuming image conditioning
preserves only geometry.

Kenney's verified CC0 sources: [Nature Kit](https://kenney.nl/assets/nature-kit),
[City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban),
[Modular Dungeon Kit](https://kenney.nl/assets/modular-dungeon-kit) and
[Mini Characters](https://kenney.nl/assets/mini-characters). His
[support page](https://kenney.nl/support) confirms the asset pages are CC0,
including commercial use with no attribution requirement. These are future
sources; no Kenney meshes are imported by this change.

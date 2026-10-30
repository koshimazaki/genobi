# World Builder asset notices

`testMap.glb`, `vehicles.glb`, and `AnimationLibrary.glb` are the existing
Holodeck EC Playground assets, reused from [Ecctrl](https://github.com/pmndrs/ecctrl).
Ecctrl is copyright (c) 2023–2026 Erdong Chen, MIT; see ECCTRL-LICENSE.txt.
Character animations are based on Quaternius Universal Animation Library (CC0),
as recorded in the [upstream NOTICE](https://github.com/pmndrs/ecctrl/blob/main/NOTICE).
The arrangement adapts Holodeck's frozen EC Playground, scaled to one tenth.
Holodeck's MIT notice is retained in src/world-builder/Holodeck-LICENSE.txt.

Draco decoder files are copied from the installed Three.js distribution.
Draco is copyright The Draco Authors, Apache-2.0; see draco/LICENSE.txt.
Three.js MIT terms are in THREE-LICENSE.txt.

## Neutral pug companion

`Pug.glb` is Quaternius's pug from the **LowPoly Animated Farm Animal Pack**,
[released by its creator under CC0-1.0](https://opengameart.org/content/lowpoly-animated-farm-animal-pack).
The [Three.js game tutorial](https://threejs.org/manual/pages/game.html) uses this
model. Source glTF and binary are pinned to
[Three.js r180](https://github.com/mrdoob/three.js/tree/r180/manual/examples/resources/models/animals).

`scripts/pack-pug-model.py` verifies both source hashes and repacks them as one
GLB without altering meshes, rig or clips. SHA-256 of bundled GLB:
`78fab7a59b5dfa00b56f07bc390d71a2987add94333379e250c893b310947d1a`.
Runtime normalizes height to 0.55 m and uses neutral matte grey materials.
The included poses are idle, walk, slow walk and jump. No model generation or
retargeting is performed.

---
tags: [director, workflows, research, 3d]
summary: An optional hologram turntable recipe grounded in Alien.js, with a later approved-asset or Tripo route.
---

# Hologram turntable

Status: research reference, not implemented or render-tested in Genobi.
This is an optional companion to the [Kōda-inspired VFX recipes](README.md),
not a prompt attributed to Kōda.

## Verified source

The hologram example is in **Alien.js**, the 3D/material sibling of Space.js:
[Patrick Schroen's `shader_hologram.html`](https://github.com/alienkitty/alien.js/blob/67172dde1fe260e582957ee4fecbcf5983552c8c/examples/three/shader_hologram.html).
The inspected source uses separate scene/hologram layers, Fresnel edge lighting,
wireframe geometry, bloom and a glitch treatment. Space.js supplies UI/control
utilities in this library family; it is not the location of this shader example.
See the [Alien.js](../credits/libraries/alien-js/README.md) and
[Space.js](../credits/libraries/space-js/README.md) creator/licence dossiers.

## Reusable brief

Present an approved character model as a slowly rotating hologram: restrained
edge glow and structural lines against a dark field, with occasional signal
distortion. Keep silhouette and facial detail legible. Use an explicit camera
and turntable clock, and return to the starting orientation for a loop. Add the
[scan HUD](surveillance-scan.md) as a separate layer if the brief needs it.

## Optional longer route

Image/reference → a separately approved 3D generation or existing model → mesh
and texture review → scene/material adapter → deterministic capture → Director
editing and optional video-generation handoff.

Tripo is a user-proposed candidate for the 3D step. No specific model, API,
licence, integration or performance has been selected or verified here. Use an
existing approved asset for the first proof; the generic Three.js scene importer
is still future work.

Before promotion, test one material and one asset change, camera framing,
transparency, resource disposal, capture compatibility and the loop seam.
Record model/texture provenance separately from the MIT renderer terms.

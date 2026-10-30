---
tags: [licences, director]
summary: Paper Shaders — usage, provenance and licence boundaries.
---

# Paper Shaders

**Created by Paper Design.** [Visit the project](https://github.com/paper-design/shaders).

## Why it belongs in our taste layer

Focused shader treatments with a coherent visual vocabulary.

## What Genobi uses

Status: **integrated**. The Genobi teaser's `paper-shader` Director recipe
(`docs/director-bundle/example/graphics/teaser-paper.mjs`) runs Paper's
`ShaderMount` and fragment shaders unchanged from `@paper-design/shaders`
0.0.81, stopped and set to the composition's time with `setFrame` (the teaser uses its dithering shader;
[the teaser](../../../genobi-teaser.md)).

Recommendations and references are not installed or executed merely by listing
them here. Agents should check the actual deliverable's dependency graph and
credit only what they used. Users may replace this recommendation.

## Licence and provenance

- Licence: **Apache-2.0**.
- Source: https://github.com/paper-design/shaders
- Reviewed version / commit: `71be01576e8402c62ac76386bb4a7c59092e24c7`.
- Checked: 2026-10-23.
- [Original licence](LICENSE.txt)
- [Original NOTICE](NOTICE.txt)

Preserve LICENSE and NOTICE on code redistribution; mark modified files. Visible creator credit is appreciated, not required for rendered videos.

These saved licence texts document the reviewed source; they do not license
unrelated artwork, demos, fonts, models or trademarks. For package dependencies,
`package-lock.json` and `LICENCES-npm.md` record the shipped package version.

- `NOTICE.txt` SHA-256: `c3155d6a359d9841d63f7feb4938d2c99bb4ef681fa20be1eb4bfa71307f746b`
- `LICENSE.txt` SHA-256: `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`

## Changes and collaboration

No modifications to this upstream library are introduced by the taste catalogue. Integration and recommendation text are original Genobi work.

Contribute useful fixes upstream when appropriate, with a focused patch and
validation. A credit is not an endorsement or a statement that the creator has
approved Genobi. No creator has been contacted as part of this change.

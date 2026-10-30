---
tags: [licences, director]
summary: Space.js — usage, provenance and licence boundaries.
---

# Space.js

**Created by Patrick Schroen.** [Visit the project](https://github.com/alienkitty/space.js).

## Why it belongs in our taste layer

Compact monospace controls and precise easing.

## What Genobi uses

Status: **integrated**. The Genobi teaser's `space-hud` Director recipe
(`docs/director-bundle/example/graphics/teaser-space.mjs`) builds Space.js's
`Tracker` and `Reticle` unchanged from `@alienkitty/space.js` 1.2.0 and drives
its ticker from the composition's time ([the teaser](../../../genobi-teaser.md)).
Its easing modules are also used in separate local motion studies.

Recommendations and references are not installed or executed merely by listing
them here. Agents should check the actual deliverable's dependency graph and
credit only what they used. Users may replace this recommendation.

## Licence and provenance

- Licence: **MIT**.
- Source: https://github.com/alienkitty/space.js
- Reviewed version / commit: `b9bff17bc4b13ecce2b273d2f0c5f8f71760adf1`.
- Checked: 2026-10-23.
- [Original licence](LICENSE.txt)

Preserve copyright and MIT notice. Check dependencies for the chosen entry point.

These saved licence texts document the reviewed source; they do not license
unrelated artwork, demos, fonts, models or trademarks. For package dependencies,
`package-lock.json` and `LICENCES-npm.md` record the shipped package version.

- `LICENSE.txt` SHA-256: `6c92931d542233265b2a9568e80bf95e8b9d41d011dc78e229fba6e6aed5b2c3`

## Changes and collaboration

No modifications to this upstream library are introduced by the taste catalogue. Integration and recommendation text are original Genobi work.

Contribute useful fixes upstream when appropriate, with a focused patch and
validation. A credit is not an endorsement or a statement that the creator has
approved Genobi. No creator has been contacted as part of this change.

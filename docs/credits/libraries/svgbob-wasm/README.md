---
tags: [licences, director]
summary: svgbob (WASM) — optional creative use, pinned source and licence boundaries.
---

# svgbob (WASM)

**Created by [Angus Hollands; svgbob by Ivan Y.; contributors](https://github.com/agoose77).**

Converts plain-text diagrams into editable SVG through a Rust/WASM wrapper.

## Genobi relationship

Optional ASCII input: diagrams for websites, documentation or video graphics. Produces SVG, not a video-to-ASCII converter; not installed. Selected from [Uncommon Web / Teknium](https://webdev.teknium.io/).
This is an opt-in resource for a matching brief, not a default style or a full game engine.
No runtime, demo assets or source implementation have been copied into Genobi.

## Source and terms

- [Reviewed source](https://github.com/agoose77/svgbob-wasm/tree/47ef6a030381ce06ea9fafc92ee87743938cbb8e) on 2026-10-24.
- [Original licence](https://github.com/agoose77/svgbob-wasm/blob/47ef6a030381ce06ea9fafc92ee87743938cbb8e/LICENSE_APACHE); preserved verbatim in [LICENSE.txt](LICENSE.txt).
- Licence-file SHA-256: `62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a`.
- Recorded terms: Apache-2.0.

Preserve Apache-2.0 licence, copyright and any applicable NOTICE; mark modified files. Review dependencies and example assets separately. Wrapper Cargo.toml declares Apache-2.0 and depends on svgbob 0.6.6; both wrapper licence files are retained. Pin the actual built WASM and inspect its dependency tree.

The wrapper also ships [an MIT text](LICENSE-MIT.txt), but its package declaration is Apache-2.0. The core [svgbob project](https://github.com/ivanceras/svgbob) is separate from this wrapper.

[Explore the original example](https://github.com/ivanceras/svgbob). The source snapshot and upstream documentation
were inspected; local integration, deterministic video export and device performance
have not been tested. Pin the exact distributed package and selected assets before adoption.

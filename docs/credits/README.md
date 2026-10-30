---
tags: [licences, agents, director]
summary: The people and projects behind Genobi’s curated creative toolkit.
---

# The taste layer: people, tools and lineage

These are tools we recommend because their visual craft and interaction design
help agents make deliberate creative choices. Each creator gets a dedicated
page, the reviewed source, original licence and notice files, and an explanation
of what Genobi uses. This is a curated starting point you can swap or extend.

The `/taste` page uses a graphite shell throughout: page, controls, panels and
example backdrops. Its neutral surfaces stay consistent when the studio uses
Signal or another theme. Colours inside the credited example media remain part
of those examples.

## Libraries and creators

| Project                                                                          | Creator                                                                        | Licence                     | Relationship |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------- | ------------ |
| [Transitions.dev / UI generation](libraries/transitions-ui-generation/README.md) | [Jakub Antalik](https://github.com/Jakubantalik)                               | LicenseRef-Transitions-dev  | integrated   |
| [Paper Shaders](libraries/paper-shaders/README.md)                               | [Paper Design](https://github.com/paper-design)                                | Apache-2.0                  | recommended  |
| [Alien.js](libraries/alien-js/README.md)                                         | [Patrick Schroen](https://github.com/alienkitty)                               | MIT                         | recommended  |
| [Space.js](libraries/space-js/README.md)                                         | [Patrick Schroen](https://github.com/alienkitty)                               | MIT                         | recommended  |
| [Three.js](libraries/three/README.md)                                            | [Three.js authors](https://github.com/mrdoob/three.js)                         | MIT                         | integrated   |
| [Anime.js](libraries/animejs/README.md)                                          | [Julian Garnier and contributors](https://github.com/juliangarnier)            | MIT                         | integrated   |
| [p5.js](libraries/p5/README.md)                                                  | [Processing Foundation and contributors](https://processingfoundation.org/)    | LGPL-2.1                    | integrated   |
| [p5.brush](libraries/p5-brush/README.md)                                         | [Alejandro Campos Uribe](https://github.com/acamposuribe)                      | MIT                         | recommended  |
| [Claude Animation Base](libraries/claude-animation-base/README.md)               | [John Heibel](https://github.com/johnheibel)                                   | MIT                         | reference    |
| [IBM Plex Mono](libraries/ibm-plex-mono/README.md)                               | [IBM](https://github.com/IBM/plex)                                             | OFL-1.1                     | integrated   |
| [Geist](libraries/geist/README.md)                                               | [Vercel](https://vercel.com/font)                                              | OFL-1.1                     | integrated   |
| [GlyphCSS](libraries/glyphcss/README.md)                                         | [apresmoi / Layoutit](https://github.com/apresmoi)                             | MIT                         | recommended  |
| [PixiJS Filters](libraries/pixi-filters/README.md)                               | [Mathew Groves, Chad Engler and contributors](https://github.com/pixijs)       | MIT                         | recommended  |
| [Three Plotter Renderer](libraries/three-plotter-renderer/README.md)             | [Geoff Gaudreault](https://github.com/neurofuzzy)                              | MIT                         | recommended  |
| [Krbn](libraries/krbn/README.md)                                                 | [vpalos and Krbn contributors](https://github.com/vpalos)                      | MIT                         | recommended  |
| [Hermes Agent](libraries/hermes/README.md)                                       | [Nous Research / Teknium and contributors](https://github.com/NousResearch)    | MIT                         | reference    |
| [crt-terminal](libraries/crt-terminal/README.md)                                 | [Dmitriy Lipin](https://github.com/essserrr)                                   | MIT                         | recommended  |
| [svgbob (WASM)](libraries/svgbob-wasm/README.md)                                 | [Angus Hollands; svgbob by Ivan Y.; contributors](https://github.com/agoose77) | Apache-2.0                  | recommended  |
| [cli-spinners](libraries/cli-spinners/README.md)                                 | [Sindre Sorhus and contributors](https://github.com/sindresorhus)              | MIT                         | recommended  |
| [ascii-magic-art](libraries/ascii-magic-art/README.md)                           | [ASCII Magic / kailashsr38 and contributors](https://github.com/kailashsr38)   | MIT AND LicenseRef-Unsplash | recommended  |
| [play.core](libraries/play-core/README.md)                                       | [Andreas Gysin / ertdfgcvb and contributors](https://github.com/ertdfgcvb)     | Apache-2.0                  | recommended  |
| [textmode.js](libraries/textmode-js/README.md)                                   | [humanbydefinition and contributors](https://github.com/humanbydefinition)     | MIT                         | recommended  |
| [Matrix digital rain](libraries/matrix-rain/README.md)                           | [Rezmason and contributors](https://github.com/Rezmason)                       | MIT                         | recommended  |

Integrated means used by this app or its supplied video study. Recommended means
selected for possible future agent work, not automatically installed. Reference
means an approach we learned from; its code and media are not bundled.
Alien.js and Space.js were used as small modules in a separate local motion
study shelf; the Signal preset runtime does not depend on them.

## Optional ASCII and textmode tools

The seven additions above are a specialist shelf, not Genobi's default aesthetic.
Choose them when the brief calls for glyphs, diagrams, terminal animation or code rain;
keep other video, typography, 3D and game styles equally available. Spinners and
controlled glitches can be small overlays rather than whole-scene treatments.
The same resources can support websites and games in other projects.

No new runtime is installed. Each dossier distinguishes the original library from
Teknium's demonstration and records capture/platform limitations. The `aesthetic`
and `binary` spinners are the first candidates for a future deterministic overlay.
ASCII Magic's two photo scenes retain separate rights; textmode.js's development
source is private despite its MIT published distribution. A catalogue entry is not
an automatic dependency or a finished Director module.

## Uncommon Web and Hermes

The **presentation** of our browsable `/taste` page takes inspiration from
**[Uncommon Web](https://webdev.teknium.io/)**, assembled by Hermes Agent for
**[Teknium](https://github.com/teknium1)**. This credit concerns how interactive
examples are presented, not the origin of Genobi’s Taste layer. The page leads
with Genobi’s own collection and craft studies; the Uncommon Web link sits in
“Ideas have a lineage, too.” Individual embeds retain their demo-host credits
alongside each library’s authors. Remote demos and media are displayed from
their credited hosts, not bundled as Genobi assets.

The selected additions are GlyphCSS, PixiJS Filters, Krbn (the graphite still-life
example), Three Plotter Renderer and Hermes. `drawille-canvas` (braille graphics)
and `dithercn` remain research links until exact distribution notices are recorded.
GlyphCSS's MIT code does not cover the non-commercial submarine-cable dataset
or ODbL data in its documentation site; no such datasets are bundled.

Genobi supports Hermes via its existing plugin and MCP. Load the Director and
`genobi-licensing` skills and call `genobi_licences` to discover this selection.
We have not verified that a stock Hermes installation includes Uncommon Web.
The catalogue is also published at `/credits/catalog.json` for agents without MCP.

## Artistic and workflow inspiration

- **[Andrew Zellinger](https://github.com/a2z2k26):** a collaborator of Koshi’s
  and creator of TTS/STT Voice MCP and Bumba Open Harness. Included as a creator
  reference; no upstream runtime is bundled.

- **[Kōda / @aimikoda](https://x.com/aimikoda):** The author credits their character-sheet
  and storyboard workflow as an inspiration for Scrolls. The supplied neon-glitch,
  surveillance-scan and anime-opening examples live in the separate
  **[VFX recipe shelf](../vfx-recipes/README.md)**. These are adapted workflow
  references, not installed libraries or finished templates. Individual post
  attribution and source-access limits are recorded there; no creator media is copied.
- **[Claudia / anabology](https://claudia.gallery/):** agent-assisted filmmaking,
  character consistency and inspectable production records. This is a project
  reference, not a bundled open-source production engine. Its
  [use page](https://claudia.gallery/use/) permits character/image reuse with
  stated boundaries; songs, other creators' media and personal accounts are
  excluded. No Claudia code, music or images are copied into this integration.
- **[motion2code / Lovis Odin](https://github.com/lovisdotio/motion2code):** the
  reference-to-seekable-code workflow. No upstream runtime or source media copied.
- **Kibo:** artistic inspiration named by Koshi. Exact profile and post URL are
  still unverified, so no handle is guessed and no code/artwork is copied.
  A social post without a licence is not recorded as permission to reuse it.
- **ManimGX:** named in earlier Genobi planning as a graphics reference; exact
  repository and licence still need verification before adoption.

The earlier [reference review](../director-references.md) also records
PDoomVideo. Its package metadata alone did not establish a complete licence;
keep it a reference until the source and media terms are resolved.
The drawing references include p5.js and p5.brush, plus John Heibel's
Claude Animation Base. They are distinct from Claudia.gallery.

## Typography and media

See [font choices](../motion-fonts.md) for Nokia Cellphone, Retro Gaming,
Explorers, Arame, U8g2, IBM Plex and Geist. Local-only font choices do not copy
font binaries into GitHub. Existing media/model terms stay in [LICENCES.md](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md).

## Agent workflow

Load `genobi-licensing` before selecting creative components and at run completion.
Use `genobi_licences` for the curated catalogue and a planned/used report. Keep
unknown rights visible; put licences and creator credits beside the output and
link them in its README. The [strategy](../licence-strategy.md) distinguishes
agent guidance from future server enforcement. Credits are prominent because
people made these tools, not because credit substitutes for permission.

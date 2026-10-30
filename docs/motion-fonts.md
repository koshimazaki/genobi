---
tags: [licences, director]
summary: Signal typography — usage, provenance and licence boundaries.
---

# Signal typography

Checked 23 October 2026. IBM Plex Mono is the portable default. Selecting a
local font uses CSS `local()`; its binary is not copied into this repository.
If it is unavailable, the app falls back to bundled IBM Plex or Instrument Sans.
A local installation is not itself proof of permission for every publication.

| Family             | Verified source / terms                                                                                                                                             | Integration                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| IBM Plex Mono      | [IBM Plex](https://github.com/IBM/plex), SIL OFL 1.1                                                                                                                | Existing Fontsource dependency; bundled                                                                         |
| Geist              | [Vercel Geist](https://github.com/vercel/geist-font), SIL OFL 1.1                                                                                                   | Regular WOFF2 bundled with `public/motion/fonts/geist/OFL.txt`                                                  |
| Nokia Cellphone FC | Zeh Fernando's `nokiafc22.txt` grants free distribution and use in movies, games, videos and broadcasts; prohibits selling the font                                 | Bundled as `public/motion/fonts/nokia-fc/nokiafc22.woff2` with `nokiafc22.txt`; the Dimensions mix's pixel face |
| Retro Gaming       | Daymarius / Vasily Draigo's [author upload](https://www.dafont.com/retro-gaming.font) says 100% Free; the downloaded archive has no separate redistribution licence | Local choice; do not infer OFL or unrestricted redistribution                                                   |
| Explorers          | Rémi Bordet, [Studio Innate](https://shop.studioinnate.com/product/explorers/); proprietary paid licence, web WOFF offered with Extended Licence                    | Local headline choice; no binary redistributed                                                                  |
| Arame              | Installed font points to Hitype's licence; no redistribution grant verified                                                                                         | Local headline choice; no binary redistributed                                                                  |
| U8G / U8g2         | [U8g2 code](https://github.com/olikraus/u8g2/blob/master/LICENSE) is BSD-2-Clause; fonts retain their own licences                                                  | No font collection copied; see below                                                                            |

Geist is pinned to `75d647056bcbd9eaba3a14b1b58290d0692685d6`, file
`fonts/Geist/webfonts/Geist-Regular.woff2`. Its OFL notice remains alongside it.
Instrument Sans retains its existing Fontsource OFL notice.

SIDKIT uses `u8g2_font_nokiafc22_tr` and several small bitmap families. U8g2 is a
renderer and font collection, not one font licence. Its
[X11 group](https://github.com/olikraus/u8g2/wiki/fntgrpx11), including 5×7,
contains public-domain/unencumbered notices; other groups have other terms.
An exact bitmap-font port should retain the selected source's notice and
pixel metrics. This version uses the Nokia FC family for that visual
connection; it does not claim to render U8g2 bitmap glyphs in the browser.

## Fonts in the Director

The Director's preview and Render MP4 draw through one renderer
(`src/director/renderer.ts`) in the page you have open, so they agree when they
run in the same browser. They can disagree with a render made elsewhere, such
as an agent's headless Chrome, because of fonts installed on one computer.
Brave and Safari hide user-installed fonts from web pages; Chrome shows them. On
29 October 2026 a saved copy of the Dimensions mix with its title still in
Explorers drew Explorers in Chrome renders and Instrument Sans in the owner's
Brave preview. The mix no longer uses Explorers or Retro Gaming: its title,
slams and end-card title ask for `"Nokia Cellphone FC", "Pixelify Sans",
monospace`, and Nokia Cellphone FC is bundled, so every browser draws it.

The renderer now resolves every free-text `font` recipe parameter (a CSS family
stack, as in `kinetic`) before the recipe sees it
(`shared/director/fonts.ts`, `src/director/font-registry.ts`):

1. Every bundled face is loaded explicitly at the weights the project uses
   (`document.fonts.load`), so the first frame is never drawn before its font.
2. Each family in the stack is tested in order. A bundled family counts when
   its file loaded. A local family counts when this page can measure it.
   `document.fonts.check` says yes to any family without an `@font-face`, so
   the test compares text widths instead.
3. Families the page cannot use are dropped. The frame falls to the stack's
   first bundled face, or to the documented stand-in when the stack names
   none: IBM Plex Mono for a `monospace` stack, Instrument Sans otherwise.
4. The clip inspector names the outcome under **Recipe controls**: "Font
   'Explorers' isn't available here; showing Instrument Sans Variable", or that
   a local face is in use but is not bundled.

A `font` parameter that the recipe's schema limits to an enum (`fx-title`) is a
key the recipe maps to its own bundled stack, and is left alone.

| Bundled family           | Weights loaded  | Licence                                           | Package                                |
| ------------------------ | --------------- | ------------------------------------------------- | -------------------------------------- |
| Instrument Sans Variable | 400–700         | SIL OFL 1.1                                       | `@fontsource-variable/instrument-sans` |
| IBM Plex Mono            | 400             | SIL OFL 1.1                                       | `@fontsource/ibm-plex-mono`            |
| Pixelify Sans            | 400, 700, latin | SIL OFL 1.1                                       | `@fontsource/pixelify-sans`            |
| Nokia Cellphone FC       | one face        | Free to distribute, not to sell (`nokiafc22.txt`) | `public/motion/fonts/nokia-fc/`        |

Explorers, Retro Gaming and Arame are not bundled; see the table above for why. To render one of them the same way everywhere, its
licence has to allow web embedding and redistribution. For Explorers that
means Studio Innate's Extended Licence. Only then can the file be bundled.

### Adding a bundled font

1. Verify the licence allows self-hosting in a web app and redistribution in
   this repository, and record it in [LICENCES.md](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md) and the table above.
2. Prefer a Fontsource package (`npm install @fontsource/<name>`), then
   `npm run licences`. Otherwise put the WOFF2 and its licence text under
   `public/` with an `@font-face` rule.
3. Import its CSS in `src/director/font-registry.ts` and add it to
   `BUNDLED_FONTS` in `shared/director/fonts.ts` with its weights and licence.
4. Run `tests/director-fonts.test.ts` and `node scripts/check-director-fonts.mjs`
   with the local server running.

Nokia Cellphone FC is the one non-OFL face the studio ships. Its notice (kept
beside the file) reads "This is a free font/file, distribute as you wish to who
you wish" and "Do NOT sell this font"; it also says the author does not know
whether Nokia's original bitmap design carries rights of its own. Bundling it
in a free, self-hosted studio is distribution, not sale; selling the font or a
font pack would not be. Retro Gaming is not bundled: the font names "All rights
reserved" and its archive carries no licence. Explorers is not bundled and no
longer used by the Dimensions mix (29 October 2026).

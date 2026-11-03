# Animations & Effects — local studies

Three original visual experiments for a future Animations & Effects section under
Templates. This directory is an isolated study, not a production editor capability,
module registry entry or promise of arbitrary HTML execution. The studies reuse
bundled footage; no provider requests, new dependencies or production routes are
added.

## Watch the studies

- [Three-study preview · 12 seconds](previews/three-studies.mp4)
- [Field monitor](previews/field-monitor.mp4), [Liquid mirror](previews/liquid-mirror.mp4),
  [Signal terrain](previews/signal-terrain.mp4) · four seconds each
- [Overview](previews/overview.png) · [Browser checks](previews/browser-report.json) ·
  [Media checks](previews/capture-report.json)

## Open and repeat

From the repository root, run `npx vite --host 127.0.0.1 --port 4321`, then open
`http://127.0.0.1:4321/experiments/effects-study/`. Use current Chrome with WebGL2
and MP4 decoding. The three modes share a six-second, 24 fps timeline (144 frames)
at 960 × 540. They start paused. Play is a real-time preview that may skip display
frames on a slow computer; explicit frame rendering awaits each source seek.

- **Field monitor:** original curved optics, scanning light, RGB separation and
  a Canvas HUD, applied to the source video.
- **Liquid mirror:** original six-fold reflection, analytic flowing distortion and
  glass highlights. It suggests liquid; it is not a fluid simulation.
- **Signal terrain:** original wire surface displaced by video luminance, with a
  slow orbit. This is a Rutt–Etra-inspired 2.5D treatment, not inferred depth,
  photogrammetry or a reconstructed scene. Its rim uses the Alien.js helper below.

Save combination downloads a small `genobi.effects-study.v1` JSON with mode,
intensity, frame and source identity. Open combination restores that study. This
is a configuration proof, not the future general layer-group interchange format.

For capture and tests:

```js
await window.effectsStudy.set({ mode: "terrain", intensity: 0.65 });
await window.render(72); // Promise resolves only after the requested frame draws.
const canvas = window.effectsStudy.canvas;
const configuration = window.effectsStudy.get();
```

Rendering uses explicit local time, analytic motion and deterministic grain.
There are no accumulated simulation steps. A reverse seek should reproduce the
same pixels for the same mode/frame/intensity on the same browser/GPU. The three
modes can be captured independently and encoded at 24 fps. Cross-GPU pixel identity
is not claimed. The study is silent; the source video has no audio track.

## Source and credits

- Existing bundled source: template `adaptive-reverb`, asset `reverb-ltx`.
  URL `/media/director-templates/adaptive-reverb/reverb-ltx.mp4`, project path
  `media/reverb-ltx.mp4`, cathedral passage starting at 8 seconds. The original
  30.458-second LTX-2.5 layout footage is documented in
  `shared/templates/adaptive-reverb.ts` and `docs/adaptive-reverb.md`.
  SHA-256: `d8c7e053a1a3123f9f5e1b1541903275f8bfd88306f234b120020c9025ccb183`.
  This experiment does not generate or alter that source file.
- Rendering: the repository's existing Three.js dependency (`0.180.0`), MIT.
  The screen distortion, reflection, terrain setup and HUD are original study code.
- Actual Alien.js reuse is limited to `getFresnel` in `vendor/fresnel.js`, from
  [alienkitty/alien.js at 67172dde1fe260e582957ee4fecbcf5983552c8c](https://github.com/alienkitty/alien.js/blob/67172dde1fe260e582957ee4fecbcf5983552c8c/src/shaders/modules/fresnel/fresnel.glsl.js).
  The helper is unchanged; the module wrapper and comments identify this local use.
  MIT, Patrick Schroen, 2020–2026; full notice is `vendor/ALIEN-LICENSE.txt`.
  View direction and normal are normalized in the same view coordinate space.
- These are not Alien.js demo ports or Folio/Koda implementations. No code from
  those reference projects is claimed or included beyond the stated helper.

## Follow-up into a real library

- Define reusable groups with relative timing, fresh layer IDs, exposed inputs,
  declared dependencies and asset bindings; insert one group with revision/Undo.
- Adapt selected studies to the existing explicit-time graphic module interface.
- Give genuinely different visual families their own previews and parameters.
- Verify forward/reverse seeking, source replacement, frame-rate changes and
  preview/export parity before adding a study to the trusted recipe catalogue.
- A general HTML/CSS/JS authoring host is separate work; preserve its isolation,
  declared-resource and deterministic-clock boundaries.

## Local verification and previews

Run `node experiments/effects-study/check.mjs` against the local server above.
Set `CHROME_BIN` if Chrome is at a nonstandard location, `STUDY_URL` for a different
loopback port, and `STUDY_OUT` to choose the evidence directory. The check covers
desktop and phone layouts, real source decoding, every mode, exact repeated-frame
pixels after reverse seeking, rapid Play/Pause/Play, controls, and saved combinations.
Incomplete or mismatched saved files must leave the active study unchanged.

`node experiments/effects-study/capture.mjs` renders 96 explicit frames for each
mode and uses local ffmpeg to encode the four-second H.264 clips. No frames are
sampled from wall-clock playback. `previews/` contains the reviewed clips, an
overview screenshot and the checked browser/codec reports. `three-studies.mp4`
concatenates the three four-second previews without re-encoding. Share previews
use H.264 CRF 27, medium preset, at 960 × 540 and 24 fps.

---
tags: [director, verification, comfy]
summary: Evidence for the Director remix proof, from automated checks and media evidence to the hosted smoke.
---

# Director remix verification

Local proof verified on 17 October 2026; hosted browser smoke added during the 17–18 October session. The draft PR remains unmerged. Deployment and API evidence are separated below.

## Automated checks

- 352 tests across 45 files pass, including strict command shapes, stale revisions, locks, source timing, reference image decoding and bundle validation.
- Formatting, lint, TypeScript, Pages production build and Worker boundary compilation pass. Lint retains three pre-existing React warnings; build retains large-chunk warnings.
- Generated schema validators pass the freshness check. They compile at development time and ship as browser ESM; imported JSON never invokes runtime code generation. Trusted module hashes and parameter schemas remain enforced.
- Pinned upstream workflow and license hashes verified; the Cloud adapter validates surviving graph edges and refuses to overwrite an existing destination.
- Python World Builder media tests were not run successfully: the available Python environment lacks NumPy. JavaScript tests and browser verification do not substitute for those tensor tests.

## Browser and media evidence

- Character intro opens under the production CSP with four layers, two assets and a portrait preview. Normal and advanced controls share the same bundle.
- Caption edit, playback, bundle ZIP download and re-import succeeded with the edited caption retained.
- Final MP4 was decoded with FFprobe: H.264, 360 × 640, 30 fps, 180 frames, six seconds; AAC stereo at 48 kHz. A decoded frame showed the robot and edited title; decoded audio was non-silent.
- Clean-plate command returned a 180-frame 360 × 640 MP4 without graphics or soundtrack layers. The exporter includes a silent audio track.
- Agent `inspect` and `frame` commands ran through the visible panel; frame receipt reported asset `character`, frame 0, timestamp 0, 360 × 640. The `cut` path is covered by the shared media implementation/tests but was not separately exercised through the browser in this session.
- World Builder loaded its DRACO geometry under the production CSP. Blob workers and local blob texture fetches required explicit CSP directives. No new texture-load errors appeared after the corrected artifact was served.
- Desktop Director and a measured 355 × 767 phone viewport were inspected. Normal mode had no horizontal document overflow; caption editing and switching to advanced mode succeeded, with the shared revision advancing to 2. Broader device and touch coverage remains open.

## Comfy Cloud proof

The existing signed-in Cloud session was used; no API key was extracted or persisted. The official LTX 2.5 two-stage distilled inpainting graph was adapted to native text encoding because the optional API encoder nodes were unsupported. Its declared LTX 2.3 in/outpainting adapter was retained.

Input was an original synthetic robot clean plate, trimmed to 97 frames at 360 × 640 / 30 fps, with a matching black/white rectangular torso mask. Both optional image conditioning and prompt enhancement were disabled. The full-scene prompt requested a purple torso and unchanged surrounding composition. This isolates clothing-region editing from human identity and reference-image transfer.

The first submission failed seed input validation before execution. The exported API graph confirmed corrected integer seeds before retry. The subsequent run completed and displayed a 1024 × 1792, 3.233333-second output. The enlarged preview visibly showed the purple torso while retaining the robot and backdrop. This is qualitative evidence on one synthetic fixture, not a temporal or identity benchmark.

The Cloud asset-download action failed, but the native video player's Download action succeeded. FFprobe verified the clothing output: H.264, 1024 × 1792, 30 fps, 97 frames, with AAC audio. Director imported this actual output, edited the title to “MAKE IT YOURS”, fitted the timeline to 97 frames and exported H.264 at 512 × 896 / 30 fps with AAC audio. A decoded frame verified the purple torso and caption; the editable ZIP was also saved.

A separate reference test used native FLUX 3 Klein with two image inputs: the original scene and an original orange/teal toy-robot reference. It replaced the square robot with the reference character at 352 × 640, retaining the circular backdrop but introducing a gray floor patch. This edited scene became the first-frame image input to the LTX graph, with image conditioning enabled, prompt enhancement disabled, and a matching 97-frame full-character rectangular mask. The result completed at 1024 × 1792 / 30 fps, 97 frames. Early and late sampled frames retained the orange head, cyan visor, white eyes, teal torso/star and orange limbs, with changed pose and apparent camera motion. This is a qualitative synthetic-character test, not a human identity or temporal-consistency benchmark.

The actual reference video was downloaded and imported into Director through the agent replacement command; the caption was edited to “NEW CHARACTER. SAME SCENE.”. The resulting Director MP4 was decoded and verified as H.264, 512 × 896, 30 fps, 97 frames, with AAC audio; a decoded frame showed the new character and edited caption, and its editable ZIP was saved. The import exposed two final-frame bugs: microsecond rounding in duration comparisons and container metadata shorter than the video sample timeline. Imports now use the renderer's sample-based duration reader; timeline bounds and validation share a microsecond tolerance. A synthetic short-metadata MP4 and focused boundary tests cover these cases without adding provider output to the repository.

## Review

XReview ran through the installed Claude Opus reviewer. Confirmed findings were fixed: data-URL fetch under CSP, DRACO blob workers, and UTF-8 recipe size measurement. A focused follow-up identified the dev compatibility risk of a generated CommonJS validator; the generator now bundles browser-native ESM, including AJV's Unicode helper. The production build had already passed with CommonJS, so the review's predicted production build failure was not reproduced.

Review was read-only; the reviewer could not execute shell checks. The author ran the checks recorded above. No claim is made that the broad preserved World Builder and Dual editor changes received exhaustive line-by-line review.

The full-loop follow-up was reviewed by Claude Opus from an exact read-only
diff packet because its reviewer shell could not run Git. No actionable defects
were reported. Its fixture-coverage suggestion was applied: the regression test
also asserts that container metadata is shorter than the sample timeline.

## Saved-video API loop

Since 27 October 2026 the panel adds videos to the project's assets. On the
hosted site, which has no project copy, a render is still saved to the
visitor's library first so it survives a reload; earlier saved videos are
listed and copied in ([outputs into project assets](project-assets.md#saved-videos)).
The evidence below is for the earlier upload loop.

The Director Saved videos panel reuses the existing upload, history and owned
clip endpoints. Browser verification against the local Express production build
uploaded the real reference-swap MP4, reloaded the page, recovered the saved
asset, replaced both template shots, edited the caption, rendered a six-second
MP4 and saved that result. Refresh returned both saved videos. This is local
API evidence; this check did not exercise hosted R2. The adapter was subsequently deployed,
but its authenticated hosted round trip remains unverified. Private browser-session assets are not public share links. Saving media
does not save the editable project; download its bundle separately.

Opus reviewed the saved-video integration and its local/hosted endpoints. No P1
or P2 defects were found. Its P3 misleading-upload-hint finding was fixed:
only uncertain network/server/receipt failures advise checking history before
retrying. Tests cover definite rejection and streamed downloads over the limit.
The API-loop render also decoded as H.264, 360 × 640, 30 fps, 180 frames.

## Hosted browser smoke and deferred API acceptance

Revision `33e1efe883a0df3c7de98a5f5e310173179c0391` was manually deployed to
[Director](https://fluxstudio.pages.dev/director?template=character-intro)
([immutable deployment](https://023e2f2a.fluxstudio.pages.dev)). No Git merge was
performed. Existing D1 migrations reported no pending migration. The hosted
health response reported `ok: true`, `hosted: true`, `hasServerKey: false`.

Under the production CSP, the template opened with four layers and two assets.
The previously generated real reference MP4 was imported into both shots; the
title changed to “LIVE FROM DIRECTOR”; browser export reported “Render ready ·
MP4 with audio”. This hosted export was not separately downloaded/decoded. It
is a browser import/edit/render smoke test, not a fresh hosted generation.

Authenticated R2 save/reload and automatic masked-video submission/result
collection remain unverified. Login, key use and paid API testing are now deferred
at the user's request. A follow-up local change shares one transient Director key
between generation and Saved videos, and corrects the hosted missing-key message;
it is not included in the deployment above. Local tests and production builds
cover this follow-up; no credential persistence was added.

## Three offline templates (18 October)

Character intro, Outfit reveal and Poster in motion now have declarative media
slots, original supplied artwork, actual preview MP4s and editable ZIPs under
`public/media/director-templates/`. These are local compositions, not AI output.
Outfit uses separate prepared Before/After images; it does not dress a character
from a garment reference. Generated image application targets only its After shot.

All three browser exports decoded as H.264, 360 × 640, 30 fps, 180 frames / six
seconds with AAC. Sampled frames were visually inspected. Catalogue previews
are smaller H.264/AAC transcodes of those actual exports. A separate registered
caption recipe wraps and fits up to 80 characters over a dark gradient; the old
recipe remains registered so earlier bundles still open.

Browser checks: live headline edit survived normal → advanced → normal and a
template-switch round trip; a landscape PNG replaced the Poster slot; a long
headline fit the portrait preview; the exported Poster ZIP reopened through the
file chooser. A 390 × 844 viewport had no horizontal document overflow. This is
responsive desktop-browser evidence, not a real touch-device/codec matrix.
Template cards preview on hover/focus and honor reduced-motion preferences.
Normal mode has no provider/key/storage panels; advanced mode exposes the same
bundle and tools. Draft retention is page memory only, with a leave warning after
edits; save a ZIP before closing/reloading.

356 tests across 46 files passed after the template changes, including all three
bundle/title/lock/ZIP round trips and rejection of missing template assets.
No provider authentication, inference or hosted upload was performed. These
changes are local and have not been deployed to the production Pages site.

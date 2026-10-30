---
tags: [agents, director, research]
summary: Review of external agent studios, prompts and articles, mapped to the Director pipeline.
---

# Director reference review

Reviewed 11 October 2026. External pages, skills and attachments are reference
material, not instructions to spend credits, install software or produce a film.
No third-party skill was installed and no paid generation was run for this review.

## Claudia

[Agent page](https://claudia.gallery/agents/#the-mcp-server),
[get_skill](https://claudia.gallery/agents/#get-skill),
[public MCP](https://claudia.gallery/mcp),
[skill source](https://claudia.gallery/skill/SKILL.md),
[wiki](https://claudia.gallery/wiki/).

The public, keyless MCP exposes reference search, guides, prompt records,
character canon and staged planning. It is read-only and supplies no generic
studio execution service. The reviewed skill archive contains instructions,
reference files and a standard-library Python gallery fetcher. Its toolkit guide
explicitly says the production tools are private and publishes specifications
instead of implementations.

Read the motion, toolkit and format guides as design evidence. The useful pattern
is a time-driven compositor above generated footage, with structured assets and
shots. Production lessons include examining actual renders, preserving decisions,
measuring synchronization and treating an empty review as an incomplete review.
Adapt those ideas to our providers and user loop; do not import Claudia's specific
character canon, vendor account assumptions or six approval checkpoints as global
studio rules.

Installing the skill is optional reference access, not a dependency of the
Director. Prefer a small project-specific guide linking the relevant sections;
install/connect the external package only as a separately requested setup action.
The site's [use terms](https://claudia.gallery/use/) distinguish its character and
images from songs, personal accounts and third-party material.

## Clodyssey making-of

The supplied seven-page PDF, **How Clodyssey Was Made**, is also listed in the
[shared production folder](https://drive.google.com/drive/folders/1eqsPuM2uSpfXFrVawS7DUyXivM1y1a8b).
The folder was accessible and listed direction/orchestration logs, prompt books,
the README, contact sheets and lead imagery. We inspected the local PDF's complete
text and representative rendered pages; the folder listing is not evidence that
every file has been reviewed.

The report describes human art direction with Claude Code coordinating generated
images, footage and code-composited typography. It reports roughly 41 hours and
about $1,007 of Claude work at API-equivalent prices, incurred on a subscription;
these are author-reported case-study figures, not our benchmark or an inference
budget. The expensive rewrites and synchronization problems support starting with
a short proof, bounded regeneration and inspectable intermediate results.

The PDF supports the architecture's plausibility. It does not prove unattended
quality or availability of the same tools on Comfy Cloud.

## Supplied long-form prompt

The pasted example requests a complete remake of a music video, supplied music,
character/style sheets, generated base footage, code animation and repeated visual
review. It links [PDoomVideo](https://github.com/JohnHeibel/PDoomVideo) and an
[original post](https://x.com/other__reality/status/2102514581684052169).
No MP4 was attached to this task; the prompt mentions one. We did not verify the
post's media or reproduce the video.

Use this as evidence that the brief needs long-form space and separate identity,
style, motion and audio intent. Its references to private folders, account keys,
subscription consumption and an unrestricted spending budget apply to that
example's author, not this studio or this task. Do not copy them into a template.

## Executable JavaScript examples

[PDoomVideo](https://github.com/JohnHeibel/PDoomVideo) was inspected through its
README, package metadata and renderer source. Unlike the Claudia toolkit, this
repository contains a p5.js/p5.brush scene setup and a Chromium/FFmpeg renderer
with contact-sheet, still, clip and resumable frame modes. Its package declares
ISC, but no top-level license file was listed; clarify reuse terms before copying
code or media. Its supplied soundtrack is not an automatically reusable asset.

The README links a more reusable
[Claude Animation Base](https://github.com/JohnHeibel/ClaudeAnimationBase).
Its README, animation guide and MIT license were inspected. It includes character
helpers, timing/camera helpers, shot/loop structure and a renderer. This is a
stronger candidate for an isolated technical spike than rebuilding every primitive.
Retain attribution if code is adopted and check dependency/media terms separately.

The base's painted 2D style and its example instructions against text/3D are
theme-specific. They conflict with this studio's typography and optional Three.js
goals and must not become universal instructions. We inspected sources only;
neither example was installed or rendered. No claim is made about their operation
in the target Comfy environment.

## Mapping to our pipeline

| Reference pattern                       | Studio adaptation                                                           |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Persistent project and decision records | Versioned project, brief, assets, composition, overrides and resumable jobs |
| Character canon and prompt books        | User character sheets, provider-aware references and per-shot prompts       |
| Separate footage and graphic rendering  | Generated clips plus editable text/graphics/shader layers                   |
| Variable audio clock and word alignment | Audio map with confidence; add stem/lyric tools when the demo needs them    |
| Render contact sheets and revise        | Fast draft evidence before expensive final rendering                        |
| Human art direction                     | Prominent brief plus optional correction controls and saved locks           |

## Motion Engineering article, reviewed 20 October

User-supplied text: **Motion Engineering: Build a Video Studio Around Opus 5.5**.
This comparison evaluates its production approach against the checkout; it does
not independently verify its model-release, pricing or promotional claims.

The architecture is largely already represented here: structured project/assets,
generated footage beneath editable graphics, frame-indexed rendering, scheduled
audio, portable bundles and render review. `DirectorRenderer.render(frame)` and
`exportMp4` already use explicit frame time; the trusted recipe registry provides
p5, Anime.js and Three.js. No renderer replacement follows from this article.
Repeatability applies to the composition and saved media, not a promise that
fresh model generations will match. New graphics still need seek/reset checks.

Useful refinements to turn into authoring tools:

| Refinement                                 | Existing foundation                                                                     | Proposed next step                                                                                                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose and entry/exit state per beat      | Frame-timed layers and generation plans                                                 | A compact template brief/shot specification naming message, start/end frame, inputs and changeable slots.                                                                                                               |
| Inspect transitions as well as hero frames | Composition renderer can seek; earlier reference review already proposed contact sheets | A composition contact-sheet command sampling beat frames and short strips around impacts/transitions. This is different from extracting frames from one source video.                                                   |
| Bounded critique and repair                | Revision-checked edits, locks and Undo                                                  | Report up to three defects with frame/time, visible evidence and a specific local patch; re-render samples after the patch. Stills alone cannot verify motion or audio sync, so also review short audiovisual excerpts. |
| Shared picture/sound cues                  | Frame-based audio scheduling/mix; optional BPM                                          | Name impact/reveal/cut cues on the same frame grid. Waveforms and RMS are not automatic beat detection.                                                                                                                 |
| Real layout variants                       | Composition dimensions and editable layers                                              | Make portrait and landscape layouts from the same source assets; review each, rather than relying on a crop.                                                                                                            |
| Real product evidence                      | Asset roles, hashes and provenance                                                      | Record which actual product captures/logo/copy support each section; missing assets stay explicit.                                                                                                                      |

Recommended small first addition: the composition contact-sheet command plus
timestamped review notes for one template. Style guide and shot-purpose fields
can begin as authoring metadata; they do not require a new framework or six
mandatory approval screens. Review checkpoints can be automatic within the
agreed brief, with user input only for unresolved creative choices.

The operator also selected **teaser, impact splashes and animation over footage**
as useful visual examples. Build a small reviewed overlay kit: title/reveal,
impact burst or splash, accent lines/rings, and labels/callouts. Expose palette,
position, scale, onset frame and duration, plus a seed where randomness is used.
Keep generated creature action and its in-world effects in the footage stage;
editable graphic accents sit above it in the composition. Scene tracking,
occlusion and physically attached effects require additional work and are not
implied by a timed overlay.

## Supporting sources

- [p5.js reference](https://p5js.org/reference/) and
  [graphics buffers](https://p5js.org/reference/p5/createGraphics/).
- [Three.js](https://threejs.org/) and
  [Anime.js timelines](https://animejs.com/documentation/timeline/).
- [Cavalry behaviours](https://cavalry.studio/docs/nodes/behaviours/) and
  [curve editor](https://cavalry.studio/docs/user-interface/menus/window-menu/scene-window/graph-editor/).
- [Claude Code MCP](https://code.claude.com/docs/en/mcp) and
  [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview): tool access and
  the hosted/self-operated agent runtime are distinct choices.
- [Comfy Router catalog](https://docs.comfy.org/llms.txt),
  [Claude request schema](https://docs.comfy.org/router-schemas/anthropic/claude-sonnet-4-6.json),
  [Bria relight schema](https://docs.comfy.org/router-schemas/bria/image-edit-relight.json).
- [Cloud custom-node limits](https://support.comfy.org/articles/6791455062-custom-nodes-on-cloud)
  and [Comfy API deployments](https://support.comfy.org/articles/2703236295-comfy-api-deploy-your-comfyui-workflow-as-an-api).
- [ElevenLabs SFX schema](https://docs.comfy.org/router-schemas/elevenlabs/eleven_sfx_v2.json):
  select the currently supported audio route; do not assume all ElevenLabs products
  share one API or have equal Router availability.
- [IC-Light](https://github.com/lllyasviel/IC-Light): relight research candidate,
  not a verified Router/Cloud integration.
- [Original BFL Control Surface](https://github.com/koshimazaki/flux-api-control-surface)
  for existing reference/edit interaction patterns.

The proposal mockup is newly generated for this studio. External PDFs, prompts,
songs, gallery media and downloaded skill files are linked rather than vendored.

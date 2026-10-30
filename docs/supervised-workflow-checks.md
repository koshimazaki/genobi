---
tags: [plan, workflows, agents, studio]
summary: End-to-end acceptance for supervised workflow checks.
---

# Supervised workflow checks

The test is the complete creative journey: run a supported workflow, see its
output in Assets, add it to the intended project, edit/export it and compare
results in Arena. A successful request or passing unit test alone does not
establish that journey. This page records scope; it is not a completed-run report.

## Current campaign

Creative maintains the route matrix and reviews outputs. Developer reproduces
gaps and returns focused fixes; the supervisor reviews changes before retesting.
Keep Comfy Router model operations separate from native Comfy workflows. Record
unsupported combinations explicitly rather than inferring support from a label.

For each supported route, record:

1. Model/workflow, inputs, settings and expected output.
2. Accepted quote and receipt for paid work; preserve uncertain submissions.
3. Actual output, inspected dimensions/duration and successful playback.
4. Where the output appears in Assets and which session owns it.
5. An explicit handoff to the intended project, visible in that project's Assets.
6. A frame/cut/export where applicable, including reuse of two source videos.
7. Arena results, observations and a preferred result when comparison applies.

Use `pass`, `fail`, `blocked` and `not-run` separately. Missing credentials,
missing project links and missing source access are blockers, not successful
runs. Keep private evidence, media, identities and spend ledgers outside Git.

## Existing pieces and gaps

- Studio-owned generations join its queue/history and asset surfaces. An
  isolated agent's history is separate. `genobi_take_to_project` explicitly
  copies a Ready generation job into a linked project at its current revision;
  receiving a take does not automatically place it on the timeline.
- Frame/trim/concat tools create derived session sources. Since #140 an agent
  hands a video or audio result into a linked project with
  `genobi_take_to_project` and its `sourceId`; a frame (a still) still cannot
  be handed in that way. Since 27 October the studio's own outputs (3D takes
  and first frames, Dual Swords frames, rendered and saved videos, gallery
  results) land in the project's assets through one path
  ([outputs into project assets](project-assets.md)). Neither has been run in
  a supervised campaign yet. Arena hashes are not session source IDs.
- Arena already accepts media dropped from Assets, Library and gallery cards.
  It can copy completed studio runs into comparison slots. Its records persist
  locally; its metadata export does not embed the media.
- Editable Director ZIP save/load is the current portable checkpoint. It is
  not a project-folder browser or a saved bundle of the entire test campaign.
- The supervisor follows new events and resizes after a hidden Development
  view opens when **Follow latest** is enabled. Turning it off permits reading
  older messages without repositioning.

## Local campaign evidence · 26 October 2026

Four LTX Fast camera studies completed through the owner Camera UI on Comfy
Router. Each was requested at five seconds, HD, 16:9, with native audio and
explicit camera settings. Downloaded files measured 5.16 seconds, 1280×720,
25 fps with audio. Each receipt confirmed 135.78 credits. The clips were
manually imported into one linked Director project, placed by Creative into
four five-second timeline sections, saved as an editable ZIP, and rendered
locally to a 20-second MP4 with audio. This verifies generation, download,
manual project import, agent placement and export; it does not prove automatic
take attachment, public catalogue publication or owner-visible Arena review.

Confirmed gaps: some completed Router outputs initially lacked their billing
header; later read-only result requests returned it. The app currently stops
polling Ready jobs, so receipt reconciliation needs a bounded read-only path.
Never resubmit a generation to recover its receipt. Derived frames/cuts also
still lack a direct agent handoff into a linked project. Runner-neutral
supervisor launching and these handoff/accounting changes remain proposals.

Developer corrected two reproduced presentation issues during the campaign:
in-progress generation tooltips no longer name BFL for every provider, and
new job downloads use a neutral Genobi filename. Generated media, private
project identifiers and the shared spend ledger remain outside Git.

A two-second LTX Pro smoke run and a FLUX image/edit pair also completed through
Router, were downloaded and imported into the campaign assets. The image edit
changed the requested inset colour while preserving the scene in visual review.
A successful quote alone is not counted as a completed route check.

The same campaign reproduced two Cloud workflow failures: Klein's UNETLoader
rejected the required diffusion filename as absent from the Cloud catalogue;
Acoustic Space's job reported success with an empty output list, including on a
later read. Neither was resubmitted. FLUX video also completed through Router.
Upscale was quoted but not submitted once confirmed and unresolved charges
consumed the campaign allowance. These are local observations, not evidence
that every workflow works end to end. Final summaries must distinguish ready
media, failed workflows and an unrun budget-blocked route.

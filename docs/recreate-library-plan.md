---
tags: [studio, templates, agents, director]
summary: A plan for durable asset recipes, honest Recreate and Make similar actions, and reusable creature examples with original inputs.
---

# Recreate library: preserve the inputs behind an asset

Proposed follow-up to [#108](https://github.com/koshimazaki/genobi/issues/108),
using [#12](https://github.com/koshimazaki/genobi/issues/12) for portable archives
and [#37](https://github.com/koshimazaki/genobi/issues/37) for agent attachment.
The requirement is to reopen an asset with its original prompt, original image
and recorded setup, then either repeat that setup or deliberately make a variant.
This page describes planned work, not a feature already available everywhere.

## Why some assets cannot currently be recreated

Three records serve different lifetimes:

1. Camera jobs keep the prompt and public run settings. Camera Recreate can also
   read the take's workflow and run location (`src/run-restore.ts`).
2. `src/run-inputs.ts` retains reference images and Klein edit boxes in a private
   browser cache: at most 30 days, 50 runs and 64 MiB. This supports reload, not
   permanent archiving or another browser. A blocked database has a tab-only fallback.
3. Director generation records preserve public settings and owned reference
   asset IDs. `shared/director/generation-settings.ts` intentionally omits
   credentials, tickets and machine paths, but also omits the workflow template
   and retains only the count of Klein boxes. That prevents a complete project
   round trip even when prompt text is present.

An imported MP4 alone does not contain an authoritative generation recipe. An
output frame is not proof of the original reference image. Missing history must
remain visible; do not manufacture a prompt or label a reconstruction original.

## Seed inventory already in the repository

| Example                                | Recorded inputs                                                                                                                     | What is still needed                                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forest guardian                        | `shared/gallery/generations.ts` stores the original start image, verbatim prompt, 20-second duration, 21:9 aspect and HD selection. | Mark any unrecorded settings explicitly. This is the first seed for a reusable generation record.                                                                                |
| Bloom                                  | `shared/templates/bloom-teaser.ts` stores `BLOOM_SHEET`, `BLOOM_PROMPT` and recipes for both H3 takes.                              | Preserve the distinction between the known video recipe and the sheet's unknown originating model. Collect any missing run settings.                                             |
| Toy creatures                          | The preview exists, but `generationRecords["product-video"]` has empty image and prompt fields.                                     | Recover the actual start image, original prompt and run settings before enabling faithful Recreate.                                                                              |
| Neon bloom                             | The retained preview record has empty image and prompt fields. Its card is currently hidden from the main gallery.                  | Recover the originals before promoting it; keep its existing preview links valid.                                                                                                |
| Dimensions creatures                   | Three H3 clips and an editable cut exist in `shared/templates/dimensions-mix.ts`, without per-clip `mix.recipes`.                   | One source record per creature: original sheet/reference slots, prompt, model, workflow and known controls. Do not use the generic anime-teaser recipe as historical provenance. |
| Dance with Fruits / Acoustic Spaces v2 | Per-slot stills and partial recipe records already support the template Recreate path.                                              | Keep the guide/capture, original look and control/soundtrack roles with the recipe, and expose missing settings.                                                                 |

Keep a repository example and a personal saved recipe separate. Only curated,
explicitly shareable inputs belong in public examples. Private job identifiers,
provider handles, sessions, keys, private Taste and temporary upload tickets do not.

## User flow

- **Open** previews media or opens the editable cut; it does not imply restored
  generation inputs.
- **Recreate** opens Camera with the saved recipe and a summary of restored and
  missing inputs. Missing required edit/reference/guide media keeps Generate
  disabled; it never silently becomes a different generation mode.
- **Make similar** starts a new variant linked to the source recipe, keeps its
  references and relevant settings, and invites changes to the subject, prompt
  or look. It preserves the original and still requires a fresh paid approval.
- **Save recipe** stores the prompt, source media and public setup with the
  project. **Export recipe** packages those inputs so reopening does not depend
  on browser-cache retention or signed links.

Show the source image, prompt and model beside the result. Use explicit states
such as **Inputs available**, **Some inputs missing** and **Preview only**.
Describe the result as recreating a setup, not guaranteeing identical stochastic
pixels. Show model/workflow changes before any new run.

## Portable record

Extend the existing generation and slot-recipe contracts rather than inventing
another unrelated catalogue. Version the additions and migrate older records
without inventing values. A record should carry:

- Stable recipe ID/version, name and optional parent recipe for a variant.
- Original user prompt and composed provider prompt as distinct recorded fields.
- Generator mode, registry model, recorded provider and workflow template/version;
  known seed, dimensions, duration, camera, negative prompt and other public inputs.
- Ordered reference roles/slots, including duplicate uses of the same image;
  source/guide/control-audio/soundtrack roles and original editable region boxes.
- Bundle-relative media paths, content hashes, inspected type/dimensions/duration
  and any frozen scene/capture fingerprint required by the selected workflow.
- Provenance and field-level completeness: recorded, supplied later, reconstructed
  or unknown. Keep a supplied replacement distinct from an original.

Resolve a destination and issue new session-bound upload tickets when preparing a
new run. A saved recipe never authorises spending or revives an expired quote.

## Delivery slices

1. **Restore correctness (#108).** Preserve recorded edit mode, disclose dropped
   workflow choice and provider truth, and retain duplicate reference slots.
2. **Durable records (#108/#12).** Store workflow identity, original editable
   inputs and media in the existing project/archive path. Prove cache-independent
   restore before adding gallery controls.
3. **Shared discovery (#37/#14).** Expose recipe inspect/list/restore preparation
   through the existing tool definitions so HTTP, CLI and MCP agree. Update the
   capability map and teaching skills with supported and unavailable paths.
4. **Library UX.** Add Recreate/Make similar and completeness states to Assets and
   example cards without changing studio dimensions. Start with Forest guardian
   and Bloom; fill creature records from verified originals as they are recovered.
5. **Repository examples.** Export the same portable schema plus media, a preview
   and a short reproduction guide. A validator checks hashes, required input roles,
   schema compatibility and absence of private fields. Use existing gallery and
   watch/embed machinery for publication.

## Acceptance

- Save a recipe, close the browser, clear its run-input cache, reopen its archive
  and recover the same recorded prompt, source images, reference order and setup.
- A Klein edit with a missing reference remains an incomplete edit; a different
  selected workflow cannot be presented as the restored original.
- A legacy preview with no original prompt remains Preview only. Supplying missing
  history changes its completeness without altering the original output.
- Make similar creates a distinct record; the original remains inspectable.
- Changing project or source during an async load cannot apply an old recipe or
  upload to the new target. Stale revisions are refused across all adapters.
- Recreate/inspect/preview spend nothing. New generation quotes the resolved
  destination and inputs, then uses the existing one-use/idempotency lifecycle.
- Verify keyboard, phone and desktop flows, input hashes after ZIP round trip,
  agent/UI parity, and a complete exported example. Live generation is a separate
  approved qualification step, not a prerequisite for the archive tests.

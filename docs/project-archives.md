---
tags: [director, bundle, studio]
summary: Save a complete local project archive, verify its media and companion files, and restore it without the original browser cache.
---

# Local project archives

When a cut is finished, choose **Save editable project** in Director or
**Download bundle** in Editor. Keep the downloaded ZIP with the project's
delivery files. **Open saved project** / **Open bundle** restores it in another
browser session; the archive carries its own media and does not require the
original browser cache or local server cookie.

The archive includes `project.json`, all named media and registered graphics
modules, the prompt brief and fonts, feedback derived from the manifest, and
`world/recipe.json` / `world/scene.json` when the project carries those sources.
Agent-imported media is ordinary owned project media and travels with it.
Unused cache files, private agent replay records and machine paths are excluded.

Saving first snapshots and validates the source. Missing or changed media blocks
the download with the affected path, leaving the open project untouched. Restore
the original bytes, or deliberately replace/remove the asset, then save again.
The saved archive must fit the same 150 MiB and 128-file limits as Open bundle;
generated feedback and the integrity index consume bytes but no media slots.

## Integrity and recovery

New saves include `archive.json` version 1: the project ID/revision and every
other entry's relative path, byte length and SHA-256. This checks the brief and
World sources as well as media. Open refuses missing, changed, duplicate,
unindexed or unsafe entries before changing the project. Checksums detect file
inconsistency; they are not an authorship signature. Existing bundles without
the index still use their manifest hashes and document validators.

A failed or interrupted open retains the current cut. If a person or agent edits
or switches the project while the archive is being read, the restore is refused;
open it again when ready. A successful restore follows the normal editor's
monotonic revision and Undo rules. It never rewinds a live concurrency counter.

The archive includes World source documents and project-owned media. It does
not capture arbitrary bytes held only by the mounted World renderer, local VRM
or FBX files, credentials or third-party runtimes. Keep any required original
model/motion files separately and reattach them. Local project archives do not
create hosted workspaces, members, cross-device server revisions or retention.

See [Director bundle v1](director-bundle/README.md),
[Agent project media](project-media.md), and
[the owner's local-only scope](https://github.com/koshimazaki/genobi/issues/12#issuecomment-6644775412).

## Verification — 5 November 2026

Local regressions archive real agent-imported image/audio/video, a prompt brief
and a World recipe, then restore every byte and the same structure into a fresh
studio store. They cover legacy ZIPs, changed or missing media, corrupt companion
hashes, duplicate/unsafe paths, truncated input, limits and edits during restore.
A local Chrome run used Download bundle, then Open bundle in a fresh browser
profile and compared the project and all media, brief and World source bytes.
A subsequent corrupt ZIP retained the open cut and showed the import failure.
No provider was called; this is local archive evidence, not deployed storage.

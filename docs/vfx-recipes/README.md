---
tags: [director, workflows, research, agents]
summary: Credited prompt recipes for neon glitch, character scans, anime-opening edits and hologram treatments.
---

# VFX recipes

A shelf inside the [useful libraries and inspirations](../credits/README.md):
reusable creative briefs and processing plans, alongside code libraries.
A recipe can combine generated footage, a local effect pass, and Director editing.
It becomes an executable template or an effect skill after a reviewed render proves it.
These entries are **references to evaluate**, not installed effects or tested presets.

## Starting recipes

| Recipe                                            | Input → intended result                                            | Status / lineage                                    |
| ------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| [Dark neon glitch](neon-glitch.md)                | Video → isolated neon subject, displaced trails and vertical drips | Adapted brief; Kōda, user-supplied transcription    |
| [Surveillance subject scan](surveillance-scan.md) | Character image → six-stage looping scan, GIF and MP4              | Adapted brief; Kōda, user-supplied transcription    |
| [Anime opening](anime-opening.md)                 | Reference sheet → action footage → timed edit and graphics         | Adapted brief; Kōda, supplied Seedance/Opus example |
| [Hologram turntable](hologram-turntable.md)       | Approved 3D asset → rendered hologram → optional scan overlay      | Research recipe; Patrick Schroen / Alien.js example |

## Credit and source boundaries

**[Kōda / @aimikoda](https://x.com/aimikoda)** is credited for the shared prompts
and character-sheet/storyboard workflow. The author identifies that workflow as an
inspiration for Scrolls. This attribution is user-supplied, also consistent with
the earlier Kōda/Seedance research record; it is not a claim that Kōda made Genobi.

The supplied anime-opening example contains this
[post link](https://x.com/aimikoda/status/2110120443390709934).
Its relation to the complete transcription has not been independently verified:
X returned 403 during this source check. The two VFX prompts have a profile link
but no individual post permalinks. Do not invent those links or treat the anime
post as the source of all three recipes.

The pages below are original Genobi adaptations of the supplied ideas, not a
verbatim prompt archive. No creator video, character art or third-party code is
bundled. No licence for the original posts or media has been established; link
and credit the source, and check the actual assets/components used in a run.

## From a brief to a reusable tool

Start with the person's chosen image/video and effect. Expose palette, intensity,
timing, mask correction, output size and loop settings; let an agent choose sensible
technical parameters and report them. Do not require every user to specify blocks,
noise or FFmpeg arguments. The person can override the recipe.

For the first proof, save source hashes, frame count/rate, mask method, seed,
effect order, parameters and output receipt. Preview representative frames and
review subject edges, legible labels, temporal stability and the loop seam.
Keep the clean source and separate overlay layers for further editing.

Then decide whether the effect belongs in a registered Director graphics module,
an offline video processor, or a preparation tool. Temporal trails need ordered
frame state or a reproducible warm-up; a stateless overlay alone does not provide
them. A skill should drive a working tool and describe its real limits. It is not
a substitute for implementation. Track that work separately from this shelf.

One useful chain is **character turntable → neon treatment → scan HUD → Director
titles, sound and edit**. Decide whether the HUD shares the distortion or stays
crisp above it. A 3D/Tripo route is optional; an existing clip is the shorter proof.

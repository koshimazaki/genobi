---
tags: [workflows, comfy, backend, mcp, licences]
summary: Comfy's Openjutsu character swap in Genobi, its first frame made by a FLUX 3 Image Klein box edit, on its own Comfy deployment, and how to run the first test.
---

# Openjutsu character swap

The `openjutsu-swap` registry entry swaps the person in a 5 to 15 second part
of a clip for a character, keeping the scene, the performance and the clip's
own sound. It runs Comfy's Openjutsu graph (MiniMax H3 with Akatz Labs' swap
LoRA and SAM 3.1), copied in [`workflows/openjutsu-swap.json`](https://github.com/koshimazaki/Genobi/blob/main/workflows/openjutsu-swap.README.md)
with its provenance and notices. Genobi's change is the first frame: Openjutsu
asks GPT Image 2.5 to put the character into the frame where the part starts;
Genobi makes that frame with a FLUX 3 Image Klein box edit, so a box can hold
the whole person or one item (a hat, a shirt, a held object), each with its
own reference image.

## A run is two paid steps

1. **The first frame**, an ordinary Klein API image run
   (`flux-3-klein-api`, BFL key, BFL's per-image price). `anchorRequest` in
   `shared/openjutsu-anchor.ts` writes it: the frame at the part's start is
   reference 1, the character and item images follow, and each box is one
   edit row in BFL's layout format (`from: ref_image_N`, `src_bbox` the whole
   reference, `tgt_bbox` the box, on the 0–1000 grid), the same rows the
   studio's Edit mode writes (`src/image-regions.ts`). The prompt starts with
   Openjutsu's own first-frame instruction for a whole person, or says that
   only the named items change and the face, hair and rest of the outfit
   stay. Both adapters read the rows back and refuse a box off the grid or a
   missing reference (`shared/image-layout.ts`).
2. **The swap**, the `openjutsu-swap` entry on the `workflow` route: the clip
   as a source the session owns (`sourceId`), `imageReferences` [character,
   first frame], `duration` the part's length, `description` the direction
   (at most 500 characters), and `swap: {start, size, seed, items?}` with
   Openjutsu's limits (`server/validate-swap.ts`). The prompt is Openjutsu's:
   "Replace the selected person in `<Video 1>` with the character in
   `<Picture 1>`. Preserve the source performance, scene and audio timing.",
   then "Start from the first frame in `<Picture 2>`." when there is one, then
   "Change only the hat and the shirt on the person; …" when `swap.items`
   names items, then the direction.

Each step is quoted and submitted on its own, so each has one quote, one
idempotency key and one provider call. If the first frame fails, or is
skipped, the swap runs without it: the anchor slot's `whenAbsent` rule
removes the anchor nodes and sets `803.use_anchor` to `false`, as Openjutsu
does. When the boxes changed only items, the edited frame is the character
too, so without it there is nothing to swap in and the run stops.

## Host

The graph needs Akatz Labs' patched node pack, which neither Comfy Cloud nor a
stock ComfyUI holds, so the template lists its own hosts
(`WorkflowTemplate.hosts`): a Comfy deployment built for it from the pins in
`comfy-build/` ([Comfy Developer Platform deployment](comfy-deployment.md)).
The run goes there whatever the session's location, and the take records it
(`recipe.location`: `deployment`). The hosted Worker refuses the entry before
pricing, and `workflowRun` refuses a host the template does not list, unsent.
With no deployment set the swap refuses at quote, before anything is reserved
(`WorkflowDestinations.serves`).

The entry is `localOnly`, so the hosted studio does not list it. The local
studio's Model menu shows it disabled, with a note naming where it runs
(`outsideComposer`): the composer sends no clip, character or part, so
Generate stays off on it. It runs from `npm run swap` or an agent's
`genobi_quote` then `genobi_submit`.

| Host             | Settings                                                                                                             | Key       | Client                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | --------- | --------------------- |
| Comfy deployment | `GENOBI_DEPLOYMENT_URL` (https, public host), or `GENOBI_WORKFLOW_DESTINATION=deployment` with `GENOBI_WORKFLOW_URL` | Comfy key | `server/comfy-sdk.ts` |

The deployment is a Comfy Developer Platform deployment built from the swap's
ComfyUI with `comfy build push --release`, at `https://{name}.run.comfy.app`,
reached with the same SDK calls as Comfy Cloud (`assets.fromBytes`, `submit`,
`jobs.get`, `getDownloadUrl`). The SDK reads its base URL only from
`COMFY_BASE_URL` at construction, so the deployment client sets it for that one
synchronous construction and restores it (`withBaseUrl`), and its fetch reaches
the deployment's origin only and never follows a redirect. An operator's own
`COMFY_BASE_URL` still refuses every SDK run.

A second host was removed on 28 October 2026.
A job an earlier build recorded there still loads: polling closes it as expired
with a "no longer supports" note and sends nothing (`closeRetired` in
`server/keys.ts`).

## Cost

Genobi has no price for the deployment's GPU time, so the swap's quote says
`estimateUsd: 0` with a `billing` line instead of a number: "Comfy deployment
GPU time, billed by Comfy to the deployment's workspace". The first frame is priced at BFL's Klein rate.
Nothing here is a spending cap.

## Running the first test

Nothing below runs in CI; every step after the cut is a real request.

1. Build and deploy the swap's Comfy deployment
   ([Comfy Developer Platform deployment](comfy-deployment.md)).
2. Save a BFL key (the first frame) and a Comfy key (the swap) in the studio's
   Connect step, or set `BFL_API_KEY` and `COMFY_API_KEY`.
3. Start the studio with the deployment, for example
   `GENOBI_DEPLOYMENT_URL=https://<name>.run.comfy.app npm run dev`.
4. Quote both steps without spending anything:

   ```sh
   npm run swap -- --clip talk.mp4 --start 3 --seconds 5 --size 480 \
     --ref hero.png --box person:80,300,1000,720:0 --direction "keep the glasses"
   ```

   `scripts/openjutsu-swap.ts` cuts the part with ffmpeg (at most 768 high,
   H.264, a small upload), takes its first frame, uploads
   the part, and quotes the Klein edit and the swap. A box is
   `target:top,left,bottom,right:ref`, `ref` an index into the `--ref` images;
   `--box hat:40,380,220,620:0 --box shirt:300,320,650,680:1` changes items.
   `--character` names the swap's character when no person box does.

5. Add `--confirm` to run them: the Klein edit is charged to the BFL key, the
   swap's GPU time to the deployment's workspace.
   Each step is submitted once under a printed idempotency key; a lost answer
   stops the script with that key and never sends again. The result is saved
   beside you and in the studio as `/api/clips/<job id>`.

An agent runs the same steps through MCP or the CLI: `genobi_media_trim` and
`genobi_media_frames` for the part and its frame, `genobi_quote` and
`genobi_submit` for each paid step, with the bodies above.

## Limits

Openjutsu's: one continuous shot, a person in the part's first frame (SAM
looks there; a part that opens on a title card fails), the largest person is
swapped, a silent clip gives a silent result. The deployment client uploads
the clip as an asset, so the 10 MB request-body cap does not bound it. The
deployment has not run this graph from Genobi yet: the client, the payload and
the result handling are tested against fakes (`tests/openjutsu-*.test.ts`,
`tests/comfy-deployment.test.ts`), not against a deployed app.

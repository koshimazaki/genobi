---
tags: [workflows, models, agents, mcp, bfl, comfy]
summary: Upscaling video in Genobi - SeedVR2 (open) and FLUX Video Upscale (API), their real limits, run locations and payers, single and split runs (19 s parts plus the remainder, a local GPU's part length), the one-approval agent flow, failures, and the CLI and MCP commands.
---

# Upscaling

Genobi has two video upscalers. This page is the whole process: which one to
use, what each takes, how a clip longer than one upscale is cut, upscaled in
parts and joined, and how an agent asks for it. Model specifics (the graph,
its slots and models, the licence) are on
[the SeedVR2 page](seedvr2-upscale.md). Agents load the
[`genobi-upscale` skill](https://github.com/koshimazaki/Genobi/blob/main/plugins/genobi/skills/genobi-upscale/SKILL.md).

## The two upscalers

| Upscaler                                                 | Weights           | Where it runs and who pays                                                                                       | Length per run                                       |
| -------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **SeedVR2 · Video upscale** (`model: "seedvr2-upscale"`) | Open (Apache-2.0) | A local ComfyUI (this machine or one on the LAN): **$0, no key**. Comfy Cloud: a Comfy key, held at FLUX's rate. | Local: up to 120 s (VRAM is the limit). Cloud: 20 s. |
| **FLUX Video Upscale** (`model: "flux-3"`, the default)  | Closed (BFL API)  | Comfy Router with a Comfy key, or BFL direct with a BFL key, billed per output megapixel-second.                 | 20 s (BFL's own limit)                               |

Both take an MP4 up to 50 MB and 2560 × 1440, an amount from 1.5× to 3×, and
make at most 13.75 megapixels a frame. Checked limits:

- **FLUX Video Upscale:** "at most 20 seconds of source footage", 50 MB and
  2560 × 1440 (the [BFL page](https://docs.bfl.ai/flux_tools/flux_video_upscale)
  and Router's
  [`bfl/video-upscale-v1` schema](https://docs.comfy.org/router-schemas/bfl/video-upscale-v1.json),
  checked 30 October 2026). Neither states a minimum.
- **SeedVR2:** the graph has no length cap (no trim, temporal chunking on
  auto). On a local ComfyUI the studio lets a run take up to the local upload
  cap, 120 s; on Comfy Cloud it holds SeedVR2 to 20 s, since Cloud documents
  no other limit.
- The hosted studio uploads at most 20 s and has no split.

Choose SeedVR2 for an open, free local run (an NVIDIA GPU with 24 GB or more
is comfortable); FLUX Video Upscale for BFL's model, a prompt, or Creative
mode.

## One run or parts

A clip within one run's length is one ordinary upscale: `genobi_quote`, then
the person's approval (a studio agent) or `genobi_submit` behind their
agreement. A longer clip, on the local studio, is a **split upscale**:

1. **Plan, free.** The clip is measured with ffprobe and cut on frame
   boundaries into full **19 s** parts plus the remainder: 23.125 s at
   24 fps is frames 0–455 and 456–554 (19 s and 4.125 s). 19 s leaves a
   second under the 20 s ceiling, so a part whose sound outlasts its picture
   still measures under it. A remainder under 1 s joins the part before it
   when that part stays within the limit; otherwise the last two parts share
   their frames. Up to seven parts. Each cut is re-encoded by frame number,
   so it is exact wherever the keyframes are.
2. **One quote.** Every part is quoted; the set's price is the sum (a local
   SeedVR2 set is $0). On the demo key the whole set must fit the day's runs
   and budget. A plan that cannot be priced takes its cuts back.
3. **One confirmation.** One `quoteId` covers the set. Each part is still its
   own run, reserved on disk before it is sent under its own key
   (`parts-<set>-<part>-<attempt>`), and never sent again.
4. **Join.** When every part is ready, the parts are joined in order at the
   upscaled size and the source's frame rate, each held to its planned frame
   count, with the **source's own sound** (an upscaler may drop it). The
   result has the source's frame count, and is a derived source whose record
   says split → upscale × N → concat.

### Joining parts by hand

Parts upscaled outside the studio (another tool, a cloud graph) are joined in
the same order the studio uses: **picture first, sound last.**

1. Drop the sound from every upscaled part.
2. Join the pictures, in order.
3. Lay the original clip's full, unsplit sound over the joined picture,
   starting on its first frame. If the sound runs a frame or two longer, hold
   the last picture frame rather than trimming the sound.

```sh
ffmpeg -i part1.mp4 -i part2.mp4 -i original-sound.wav \
  -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0,tpad=stop_mode=clone:stop=-1[v]" \
  -map "[v]" -map 2:a -c:v libx264 -crf 19 -pix_fmt yuv420p -c:a aac -b:a 256k \
  -t <sound duration> -movflags +faststart joined.mp4
```

Why: a seam a fraction of a frame wide cannot be seen, but it can be heard.
Each part's sound is encoded separately, with its own encoder padding at the
start and end, so joining the parts' sound leaves a tiny gap or overlap at
every cut. The ear hears it as a click or glitch, and the eye misses it. The
original sound was never cut, so laying it over the joined picture leaves
nothing to hear at the seams. This was first heard on the Dimensions mix,
joined from two upscaled parts at 19 s.

### A local GPU's part length

SeedVR2 on a local ComfyUI takes a part length of its own: 1 to 120 s, or 0
for the whole clip in one part. VRAM is the limit: start at 19 s and raise it
if the GPU holds it (a 60 s part length makes the 23.125 s mix one part). The
local ComfyUI may be another machine on the LAN, set as the run location's
host ([run location](run-location.md)). FLUX Video Upscale and Comfy Cloud
refuse any part length but 19 s (`part_length_fixed`).

So the studio's offer depends on the model and the run location: for SeedVR2
on a local ComfyUI a clip of 20 to 120 s is one ordinary run, with **Upscale
in parts** offered only to spare VRAM; for FLUX Video Upscale and Comfy Cloud,
a clip past 20 s shows **Split into N parts**.

## The same request reopens its set

Planning again with exactly the same request (source, model, amount,
creativity, prompt, part length and run location) reopens its newest set that
has not been joined or declined, instead of cutting and pricing the work
twice. Any difference, a changed prompt included, plans a new set, so a
confirmation never sends replaced text.

## An agent in the studio

A studio agent session cannot spend (`PAID_ROUTES`). Its plan becomes **one
approval step** in the person's studio, with the combined price and "in N
parts joined with its sound". Approve confirms the set in the agent's
session, on the payer the person saw; each part is reserved and sent once,
and the server reads the set on its own until it is joined (for up to two
hours; a server restart starts those reads again for every approved set not
yet joined or failed). Decline voids the set: none of it can run.

The agent may split its own clips, library clips, or a take the person picked
for it: the plan reads a picked take as the person's, as a quote does
(`readerOf`, the agent's read scope). The cuts, the runs and the join stay in
the agent's session, and a hand-in of the joined clip reads the picked take
through the same scope, so its history passes the lineage check. The agent reads `genobi_upscale_parts` until it is
joined, reports the joined clip and each part's state, and hands the clip to
a linked project with `genobi_take_to_project` (`joined.sourceId`).

An agent outside the studio (an MCP client the person runs) asks the person
and, after they agree, calls `genobi_upscale_parts_confirm` itself.

## When a part fails

- The finished parts are kept; the set says which part failed. The open
  dialog and an approved agent set keep polling any other unfinished parts
  until their results are saved, even while the set reports a failure.
- An **uncertain** part (a submission whose acceptance was never recorded)
  may already have been charged. It is never resent on its own: tell the
  person, and let them check their usage.
- A failed part is retried alone: `genobi_upscale_parts_retry` prices it, and
  only the person's agreement to that price lets
  `genobi_upscale_parts_retry_confirm` send it. While a retry is being sent
  the part takes no other retry (`part_busy`). A claim left by a server that
  stopped mid-send is settled on the next retry: a run reserved under it
  keeps its outcome (never resent); with none, the claim goes and its quote
  can be confirmed again. Confirming a retry on an approved agent set also
  resumes its background polling and join; it never resubmits other parts.
- A cut that fails part way takes back the parts already made.
- A failed join is tried again with `genobi_upscale_parts {"rejoin": true}`;
  it is free.

## Commands

| MCP tool                             | CLI                                            | Pays             |
| ------------------------------------ | ---------------------------------------------- | ---------------- |
| `genobi_media_probe`                 | `genobi media-probe`                           | No               |
| `genobi_upscale_parts_plan`          | `genobi upscale-parts-plan`                    | No               |
| `genobi_upscale_parts`               | `genobi upscale-parts`                         | No               |
| `genobi_upscale_parts_confirm`       | `genobi upscale-parts-confirm --confirm`       | Yes, once agreed |
| `genobi_upscale_parts_retry`         | `genobi upscale-parts-retry`                   | No               |
| `genobi_upscale_parts_retry_confirm` | `genobi upscale-parts-retry-confirm --confirm` | Yes, once agreed |

`genobi schema upscale-parts-plan` prints the exact input. Examples:

```sh
genobi upscale-parts-plan --input '{"generator":"upscale","description":"","duration":5,"resolution":"hd","sourceId":"<clip>","model":"seedvr2-upscale","upscaleFactor":2}'
genobi upscale-parts-plan --input '{"generator":"upscale","description":"","duration":5,"resolution":"hd","sourceId":"<clip>","model":"seedvr2-upscale","upscaleFactor":2,"partSeconds":60}'
genobi upscale-parts --input '{"setId":"<set>"}'
genobi upscale-parts-confirm --confirm --input '{"setId":"<set>","quoteId":"<quote>"}'
```

`duration` and `resolution` are fields every request carries; an upscale
sends neither and is priced from the measured source.

## Code

`shared/upscale-parts.ts` (the plan), `server/upscale-parts*.ts` (the set
service, its read side and routes), `server/upscale-media.ts` and
`server/ffmpeg-parts.ts` (cut and join), `server/agent-approvals.ts` (the one
approval), `mcp/upscale-parts-tools.ts`, and the studio's
`src/components/UpscalePartsDialog.tsx`. Tests: `tests/upscale-parts-*.test.ts*`.
No paid split has been run yet.

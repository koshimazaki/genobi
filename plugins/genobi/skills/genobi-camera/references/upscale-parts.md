# Split upscale: a clip longer than 20 s

The whole process, inspection to the joined clip, is the `genobi-upscale`
skill; this card is the short version.

FLUX Video Upscale and SeedVR2 each take at most 20 s of source. On the local
studio (it needs ffmpeg; the hosted studio has none) a longer clip, up to two
minutes, is upscaled in parts. A single `genobi_quote` for it is refused with
`upscale_too_long`, which points here.

1. **Plan, free.** `genobi_upscale_parts_plan` with the same inputs
   `genobi_quote` takes for `"generator": "upscale"` (`sourceId`, `model`
   `"flux-3"` or `"seedvr2-upscale"`, `upscaleFactor`; for SeedVR2 on a local
   ComfyUI, `partSeconds`). The clip is cut on frame boundaries into full 19 s
   parts plus the remainder (23.125 s at 24 fps: frames 0–455 and 456–554). The answer lists each part's frames and
   seconds, the combined `estimateUsd` (the sum of the parts' quotes; $0 for
   SeedVR2 on a local ComfyUI), a `setId` and one `quoteId`.
2. **Ask.** Show the person the parts and the combined price. In a studio
   agent session the plan is already one approval step in their studio;
   you cannot confirm it. Nothing runs without their agreement.
3. **Confirm once.** `genobi_upscale_parts_confirm` with `setId` and
   `quoteId` (paid; the CLI needs `--confirm`). Each part is its own reserved
   run under its own key, sent once; repeating the call never resends a part.
   A quote that lapsed is refused: read the set for a new `quoteId` and ask
   again.
4. **Read.** `genobi_upscale_parts` polls the parts. When every part is
   ready it joins them in order into one MP4 at the upscaled size, with the
   source's frame count and the source's own sound, and answers with
   `joined.sourceId`. `genobi_take_to_project` with that `sourceId` places it
   in a linked Director project, its record saying it is a `concat` of the
   upscaled parts and the source.
5. **A failed part.** The finished parts are kept. Tell the person which part
   failed, and that an `uncertain` part may already have been charged. Never
   resend it yourself: `genobi_upscale_parts_retry` quotes that part alone,
   and only their agreement to that price lets
   `genobi_upscale_parts_retry_confirm` send it.

See [upscaling](https://github.com/koshimazaki/Genobi/blob/main/docs/upscaling.md).

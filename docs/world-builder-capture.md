---
tags: [3d, world-builder]
summary: The World Builder Capture panel ported from Holodeck — badge, record button, format, rate and time, passes and outputs.
---

# World Builder · Capture panel

The Capture panel follows Holodeck's World Capture panel, almost verbatim in
layout, restyled to the studio's tokens. It is one of the
[dockable panels](world-builder-controls.md#panels-two-docked-one-popped-out), so it
docks in the inspector column or pops out into its own window, keeping every
control live. Holodeck's MIT notice is in
`src/world-builder/Holodeck-LICENSE.txt`; the ported files say so at the top.

Every control maps onto something the World Builder already does. Holodeck
controls with no counterpart here (frame rates other than 24, frame preview,
operator corners, burn-in, proof video, a viewport-sized capture) are left out
rather than imitated.

## Layout

- **Status strip.** A state badge, then the size, frame rate, take length and
  where the take goes (`MP4 → assets` in the studio, `WEBM` otherwise). The
  badge reads **ARMED** with nothing held, **REC n/N** (pulsing, frames
  rendered over the take's frames) while a take captures, **REC LIVE** while
  **Record live** under the scene runs, and **READY · TAKE** or
  **READY · LIVE CLIP** once one is held. **Fold** hides the settings and
  keeps the transport and Output in view.
- **Transport.** The record button is **Capture take**: it works from every
  mode and during Play, which it stops before capturing from frame 0. While a
  take renders it becomes **Cancel capture**. **Save PNG** saves frame 0 (Shot
  camera). The meter shows the frames rendered and the last take's name.
- **Format.** Aspect tiles for 16:9 (1280 × 704), 1:1 (1024 × 1024), 9:16
  (704 × 1280) and 4:5 (768 × 960), drawn as Holodeck's bracket glyphs, and
  **Cust**, which opens width and height fields. Custom sides snap to the
  nearest multiple of 64 within 256–1920, as the recipe requires.
- **Rate & time.** Takes are fixed at 24 fps. The take length stepper (also
  beside Capture take under the scene) moves one 8k + 1 step, and its seconds
  are typeable: Enter or leaving the field sets the nearest 8k + 1 frame count
  (typing 10 gives 241 frames, 10.04 s), clamped to 9–241 frames, with the
  frames shown beside it; text that is not a positive number is refused. The quick
  lengths 1, 2, 3, 4, 5, 8 and 10 s set **Move seconds**, which the recipe
  rounds to the nearest 8k + 1 frame count: 25, 49, 73, 97, 121, 193 and 241
  frames. The tile matching the current frames is selected; a length off the
  bank selects none. **Move seconds**, the frames field and **Seamless loop**
  (with **360° loop · 2 s**) are the same controls as before.
- **Passes & sync.** What a take carries: the colour pass (WebM and first
  frame), the linear depth pass, which is always rendered (its near and far
  range, `depthNear` and `depthFar` in metres, are editable here), the matching
  WAV when a track is loaded, and the move's length and loop.
- **Output.** **Send first frame to Director**, **Send take to Comfy** (inside
  the Comfy node's iframe only), **Apply room** (studio, after a take with
  sound; see [room sound](world-builder.md)) and the **Export take** fold: Add take to
  project assets (studio), Video · WebM, First frame, Depth · WebM, Capture
  receipt and Matching audio · WAV. Their enable rules are unchanged.

Format, the move, the loop and the depth range are the set, so they change in
Shot camera and lock while a capture or load runs. The quick lengths and the
take length stepper work in every mode, as the length is not part of the set.

## Files and checks

`CaptureControls.tsx` (status and transport), `CaptureFormat.tsx` (Format and
Rate & time), `CaptureOutput.tsx` (Passes & sync and Output),
`CapturePrimitives.tsx` (badge, aspect glyph, segmented bank),
`capture-panel.ts` (presets, duration bank, badge state) and
`capture-panel.css`. `tests/world-builder-capture-panel.test.tsx` covers the
badge states, the bank's 8k + 1 mapping, aspect selection and that every
action is present. `scripts/check-world-capture-panel.mjs` drives the panel in
a browser at desktop and phone widths, docked and popped out (badge states,
aspect tiles, custom-size snapping, the duration bank and overflow); run it with
`DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-world-capture-panel.mjs`
against a dev server. `scripts/check-world-workspace.mjs` covers Capture take
and Cancel.

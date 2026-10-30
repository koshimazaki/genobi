---
tags: [director, dual-editor, plan]
summary: Dual Editor editing scope, with captured requirements, the timeline contract, frame grading and next steps.
---

# Dual Editor editing scope

Dual Editor stays a compact local utility beside Director. Its default is the
existing two-frame comparison; Timeline is a separate view with the same visual
system and asset drawer. Director remains the broader production workspace.

## Captured requirements

1. **Spec:** add practical browser video editing to Dual Editor.
2. **Spec:** split a video into frame-bounded sections.
3. **Spec:** delete unwanted sections.
4. **Spec:** join sections from multiple clips.
5. **Spec:** retain individual-frame inspection.
6. **Spec:** show a playhead and timeline.
7. **Spec:** limit the utility to two video tracks.
8. **Decision:** keep larger multitrack production in Director.
9. **Question resolved:** keep the Dual Editor name; Frames and Timeline name its views.
10. **Spec:** trim a clip's beginning or end.
11. **Spec:** assemble a short teaser and export the complete edit.
12. **Spec:** use local file drop and the existing source assets.
13. **Design:** preserve dual comparison and the existing Assets drawer.
14. **Design:** put an accent-colored Edit frame control beside View.
15. **Design:** give actionable controls the existing accent treatment.
16. **Spec:** reversible exposure/brightness adjustments.
17. **Spec:** saturation boost for generated frames.
18. **Spec:** hue adjustment.
19. **Spec:** contrast adjustment.
20. **Spec:** automatic foreground separation, rather than requiring a lasso.
21. **Spec:** transparent PNG output and background replacement.
22. **Spec:** use the other comparison frame as the replacement background.
23. **Research:** inspect Rust Photoshop-style editors and reusable algorithms.
24. **Candidate:** actual scene relighting; exposure grading is not relighting.
25. **Spec:** compare both frames and copy grading settings between them.
26. **Design:** progressive disclosure; keep this utility simple.
27. **Quality:** prefer useful open-source processing over cosmetic controls.
28. **Spec:** preserve edited pixels in Keep frame and PNG export.
29. **Spec:** Space plays/pauses Timeline; Backspace/Delete removes its selected section.
30. **Spec:** World Builder character Space jumps; holding Shift runs.
31. **Spec:** World Builder scene playback has a Loop toggle.
32. **Spec:** add more precise color grading using RGB/channel curves.
33. **Spec:** offer a few grading presets.
34. **Spec:** drag clip bodies in time and between tracks; trim by dragging either edge.
35. **Decision:** A sits above B and replaces its picture and audio in overlaps.
36. **Research/candidate:** compare both frames through a Comfy vision model.

Items 1–23 and 25–35 map to the implementation and controls below. Item 24 and
item 36 remain explicit follow-ups, not active inference features.

## Timeline contract

- Append videos through either track's +, Add viewer A/B, local drop or an asset
  drop. Each source owns a separate decoder; replacing a frame viewer cannot
  invalidate the edit. Up to 20 sources and 40 clip sections stay in this tab.
- A is the upper track. A replaces B's picture **and sound** during overlaps.
  Same-track overlaps are rejected. Gaps are black and silent. No audio mixing,
  transitions or compositing layers are implied.
- Dragging either trim handle previews that clip directly in the program viewer:
  the first included source frame on the left, the last included source frame on
  the right. This temporarily overrides track priority, pauses sound, and follows
  pointer movement and arrow-key trims using exact indexed decoding. Body moves
  show the first included frame. The final boundary remains visible on release;
  normal playback/scrubbing restores the program view. Cancel or rejected edits
  clear the override; obsolete decode results cannot replace a newer frame.
- In is inclusive and Out exclusive, expressed in zero-based source frames.
  Split uses the indexed presentation timestamp at/before the playhead. Every
  original frame remains in exactly one resulting section.
- Drag a section body to move it or switch tracks; drag either edge to trim.
  Arrow keys nudge a focused clip by 1/30 s or a trim handle by one source frame.
  Select a section to set its track, timeline start, source In/Out and mute.
  Trim start/end uses the playhead; the end includes its visible frame.
  Delete leaves a gap; Join closes gaps and orders all sections sequentially.
  Undo retains up to 40 edit states. File references clear on reload.
- Edit this frame opens the selected section's frame in its A/B frame viewer.
  Frame edits affect exported PNGs, not an entire source video.
- Export defaults to **Lossless · source copy**: compressed video/audio bytes and
  source timestamps are retained, without decoding, resizing or re-encoding.
  A complete unchanged source is downloaded byte-for-byte, retaining its other
  tracks and metadata too. Compatible cut/join sections are remuxed locally.
  Starts/ends must be verified safe keyframe boundaries (or the source end),
  with no dependent frames crossing the cut. Audio must align to complete packets.
  Codec configuration, dimensions, colour metadata and video transform must match
  across sources; remuxing extra audio/video tracks is refused. Black gaps require
  rendering. Unsupported edits stop with an explanation; there is no automatic
  lossy fallback or changed trim. Remuxed copies are bounded to 512 MB in memory.
- **Native exact cuts · re-encode** is an explicit alternative for arbitrary cuts,
  mixed dimensions and black gaps. It uses a high-quality browser encoder: H.264/
  AAC in MP4 or VP8/Opus in WebM. This path is lossy, 8-bit SDR and cannot preserve
  HDR. Audio is decoded, aligned by PTS and encoded at 320 kbps; unsupported audio
  blocks unless explicitly muted. The canvas contains the maximum source width
  and height, rounded UP to even dimensions. There is no 1080p cap: a 2176 × 928
  generation stays 2176 × 928, and a 4K source stays 4K. A canvas over 40 MP is
  refused rather than silently reduced.
- For mixed dimensions, **Keep native size · pad** retains 1:1 pixels and centres
  each source with black borders; **Scale to fit** resizes to that shared canvas
  while preserving aspect ratio, with bars as needed. The footer lists source
  dimensions, the actual output canvas and each source's sizing. Re-encode cadence
  uses the highest median source cadence (fixed fps, shown explicitly); source-copy
  retains the original timestamps, including variable frame rate.
- Edits are limited to two minutes. Decoded audio is limited to 160 MB across
  the re-encoded edit. Output stays in memory until download; cancel retains the
  edit. Encoders may add audio priming/padding. Frame edits affect exported PNGs;
  they do not grade timeline videos.
- Keyboard shortcuts ignore input/select/textarea, editable text, dialogs
  (including native `<dialog>` modals such as key settings), modified key
  chords and repeated keydown events.

## Frame grading and backgrounds

Images (PNG/JPEG/WebP) can also be opened in either viewer and reused from the
Assets drawer. Timeline accepts video clips. Video selection still
uses the existing indexed decoder. Original pixels are retained. Edited pixels
are used by the preview, histogram, Keep frame and PNG exports.

Exposure multiplies linear-light RGB by 2^EV. Brightness and contrast operate on
sRGB; then master/channel curves and HSV saturation/hue apply. Curves have fixed
input anchors at 0, 64, 128, 192 and 255; their three interior output values are
editable through the graph and keyboard-accessible sliders. Interpolation is
piecewise linear. Neutral, Punch, Warm and Cool presets are reversible. Compare
original previews and exports the original while active. Copy adjustments copies
the grade, not a mask or background from a different frame.

Background removal uses the [BiRefNet-lite 512 model export](https://huggingface.co/studioludens/birefnet-lite-512),
MIT-licensed, at revision `962e67969ec6acec9c19fab76acee4f5e22e990c`.
The first explicit Remove background action downloads approximately 183 MB and
caches it in the browser. [ONNX Runtime Web](https://github.com/microsoft/onnxruntime)
1.24.3 runs it in a dedicated WASM worker. No pixels are uploaded. The model worker is released after inference. The static CSP permits WASM compilation and HTTPS model downloads only from
Hugging Face domains alongside the existing same-origin connections. Frame/source
changes cancel stale work; Cancel terminates the worker. The 512 px alpha mask is
resampled to the original image dimensions; hair and fine edges need inspection.
Use the other frame as background center-crops that entire frame behind the
cutout. It does not remove the other frame's subject or inpaint hidden scenery.

## Research and next steps

The likely Rust references are [PhotoCraft](https://github.com/storytold/photocraft)
and [OpenPhoto](https://github.com/yuanzhixiang/openphoto). PhotoCraft describes a
clean-room Rust application and carries MIT/Apache-2.0 licenses. OpenPhoto has a
Photoshop-style UI and adjustment/filter test fixtures. Neither was imported:
embedding a desktop editor would expand this utility's integration surface.
[Graphite](https://github.com/GraphiteEditor/Graphite) is another Rust-based,
node-oriented browser editor with a [permissive license](https://graphite.art/license/).
The compact pixel pipeline and existing Mediabunny decoder avoid an additional
Rust toolchain while keeping real exported results consistent with previews.

[ComfyUI-QwenVL](https://github.com/1038lab/ComfyUI-QwenVL) is a community custom
node pack for local Qwen image/video understanding; [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL)
is an image-capable model family. That establishes a possible local workflow,
not availability on Comfy Cloud or Router. The Director registry currently has
no verified image-comparison endpoint. Before wiring a Compare with vision
button, inspect the chosen server's node schema and weights/license, verify
multi-image input, then test an explicit two-frame request. Its report should
cover exposure, palette, framing and background differences, offer suggestions
for the existing controls, and require review before applying them. Keep source
pixels and numeric scopes authoritative; model commentary is advisory.

Real relighting needs a separate verified image-conditioned workflow. It is not
represented by the exposure, curves or warm/cool controls.

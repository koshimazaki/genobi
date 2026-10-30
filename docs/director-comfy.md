---
tags: [workflows, director, comfy, ltx]
summary: Clean Director MP4 export into the pinned LTX workflow, the Comfy Cloud adapter and the asset and render node notes.
---

# MP4 and LTX handoff

Use **Video swap → Export clean MP4 for Comfy** to render the current image/video timeline without text, effects or soundtrack. This uses Director's frame-exact H.264/AAC exporter; the clean output's audio is silence. The normal **Render MP4** keeps text and the separate soundtrack.

1. Open the clean plate in Dual editor. Export source frame 0 as PNG. Edit that frame with FLUX using the desired character or garment reference while preserving composition. A character photo alone is not a scene-aligned edited first frame.
2. Fetch the pinned official workflow: `node scripts/fetch-director-ltx.mjs /tmp/director-ltx`. The script verifies SHA-256 and saves the upstream license beside the unmodified graph. It does not install dependencies or submit a job.
3. Load the graph in a compatible ComfyUI with its declared models/custom nodes. Supply original video, mask video, full desired-scene prompt, and the edited first frame if using I2V. White mask regenerates; black keeps. Use identical dimensions and matching frame count/cadence for source and mask. Allow space for changed silhouette; review edges and occlusion.
4. Normalize source and mask together to the model/workflow's required dimensions/cadence/frame window. The Director fixture is 360×640 at 30 fps; do not assume those dimensions are valid LTX latent dimensions. Follow the pinned graph's preprocessing. The LTX 2.5 example uses its declared 2.3 in/outpainting adapter; don't swap a similarly named adapter blindly.
5. Export the generated video from Comfy as an actual MP4 file. Import it into Director with the replacement input or `replace` command. The first template has two 90-frame shots: replacing both restarts the supplied video for each shot. To preserve a six-second sequence, use advanced mode with a six-second layer or cut and replace each shot separately. Original soundtrack stays separate; source video sound is not implicitly mixed.
6. Render the final composition and compare identity, clothing, motion, background and text. Save the ZIP for editing and MP4 for sharing.

Comfy graph JSON and Director project JSON are different formats. Never import a Comfy graph as `project.json`. Do not embed MP4/base64 or credentials into either manifest. Native Comfy upload/view APIs carry video bytes; a Router URL input is not interchangeable with a native uploaded filename. The masked-video adapter still needs a dedicated upload/job contract before a one-click hosted path can be claimed.

`frame`/`cut` tools use the dual editor's indexed presentation timestamps. Cuts are half-open source-frame intervals and re-encode; container duration alone does not prove temporal alignment. Browser codec support is checked; current Chrome/Edge with H.264/AAC are the fallback when another browser lacks encoders.

[Official editing guide](https://docs.ltx.io/open-source-model/feature-guides/editing-effects/in-outpainting) · [Pinned graph](https://github.com/Lightricks/ComfyUI-LTXVideo/blob/44c8a36b7c31ee00b4271daed11dc2a4aa481140/example_workflows/2.5/LTX-2.5_ICLoRA_Inpaint_Two_Stage_Distilled.json)

The upstream graph/models have their own terms (including the LTX-2 Community License in this revision). They are not relicensed under this application's MIT license. A bounded Comfy Cloud inference completed on 17 October 2026 using a synthetic robot, matching 97-frame source/mask videos, and text-only clothing-region guidance. See [verification](director-remix-verification.md) for the limits of this proof.

## Comfy Cloud adapter

After fetching the pinned graph, run:

```sh
node scripts/prepare-director-ltx-cloud.mjs /tmp/director-ltx/workflow.json /tmp/director-ltx/cloud.json
```

The adapter verifies the source hash, removes the optional Gemma API encoders unsupported by the tested Cloud environment, and retains native text encoding. Keep the fetched upstream license beside the derived graph. Import into a new Cloud workflow, check model bindings, upload the source and matching mask, and inspect the exported API graph before submitting. The script neither submits jobs nor accesses credentials.

For the bounded proof, **use image input** and **Enhance positive prompt** were off, mask dilation was 15, and both prompt-enhancer seeds were integer `457289196`. Even an unused enhancer must pass Cloud input validation. The first attempt failed validation because the imported seed was blank; the corrected exported API graph was checked before one successful submission. A subsequent edited-first-frame reference run completed with image input enabled; see [verification](director-remix-verification.md) for its synthetic-character scope. The original workflow's note about optional API keys does not apply to this native-only adapter.

## Asset and render nodes

Ordinary Comfy Cloud cannot install our custom node pack.

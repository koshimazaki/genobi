# Workflows

Workflows the studio runs on the `workflow` route, as API-format JSON with named slots the app fills before submission (`shared/comfy/slots.ts`). The template table, `shared/comfy/workflows.ts`, lists each with the capabilities it serves and pairs it with its slot values (`shared/comfy/akuspace.ts`, `shared/comfy/klein.ts`, `shared/comfy/music.ts`). A run goes to the session's run location: Comfy Cloud API v2 through `@comfyorg/sdk` (`server/comfy-sdk.ts`) with the visitor's Comfy key, or the local ComfyUI through its own HTTP API (`server/comfy-local.ts`). See [run location and workflow swapping](../docs/run-location.md).

| File                                                                       | Template id              | Capabilities                       | Default behind                                          |
| -------------------------------------------------------------------------- | ------------------------ | ---------------------------------- | ------------------------------------------------------- |
| [`ltx-2-5-akuspace-t2v.json`](ltx-2-5-akuspace-t2v.README.md)              | `ltx-2-5-akuspace-t2v`   | acoustic space                     | LTX-2.5 · Acoustic Space                                |
| `ltx-2-5-t2v.json` (see the [same README](ltx-2-5-akuspace-t2v.README.md)) | `ltx-2-5-t2v`            | text to video, acoustic space      | Nothing yet; a swap for Acoustic Space without the LoRA |
| [`flux-3-klein-t2i.json`](flux-3-klein-t2i.README.md)                      | `flux-3-klein-t2i`       | image                              | FLUX 3 Image Klein · Image, the open run                |
| [`openjutsu-swap.json`](openjutsu-swap.README.md)                          | `openjutsu-swap`         | character swap                     | Openjutsu · Character swap, on its Comfy deployment     |
| [`minimax-music-3.json`](minimax-music-3.README.md)                        | `minimax-music-3`        | text to music                      | MiniMax Music 3 · Text to music (generator `audio`)     |
| [`ltx-2-5-genmod-audio.json`](genmod.README.md)                            | `ltx-2-5-genmod-audio`   | none yet (Gen-Mod `audio` route)   | Nothing yet; core nodes only, not run                   |
| [`ltx-2-5-genmod-control.json`](genmod.README.md)                          | `ltx-2-5-genmod-control` | none yet (Gen-Mod `control` route) | Nothing yet; core nodes only, not run                   |

Not a studio template, kept here for the Comfy side: [`world-builder-acoustics.api.json`](world-builder-acoustics.api.README.md) is the World Builder pack's acoustics graph in API format, with its first run's evidence; it runs on a ComfyUI that has the pack, through `POST /prompt`, and no studio route fills it. The [Falling room](../docs/falling-room.md) uses it for its take: put the take's WebM, depth WebM and recipe in node 1 and its WAV in node 14.

Also not templates, for opening in the ComfyUI editor (UI format, laid out with groups and Note nodes): three end-to-end World Builder graphs from a Capture take to a saved clip, with the take's room as sound. [`world-builder-akuspace-ltx.json`](world-builder-akuspace-ltx.README.md) (LTX-2.5 with the AKUSPACE LoRA loaded), [`world-builder-layout-to-render.json`](world-builder-layout-to-render.README.md) (the take as the Layout-to-Render layout video) and [`world-builder-canny-depth.json`](world-builder-canny-depth.README.md) (the take's depth or canny pass through the Union Control IC-LoRA). `node scripts/check-ui-workflows.mjs --object-info <ComfyUI URL> <file>` validates one against a running ComfyUI without queueing it.

A template lists its slots (including a `model` slot for every loader input, which a local ComfyUI's model map fills), the node types it needs and the model files Comfy Cloud must hold. To add one: put the API-format graph here with a README, add its template and values beside the others in `shared/`, add a row to `workflowTemplates` with the capabilities it serves, and let `tests/workflow-templates.test.ts` check its links, slots and loaders.

Planned next: LTX image-to-video (needs image upload), the LTX-2.5 latent spatial upscaler ×2, and `FluxVideoUpscaleNode`. Each file lists the nodes and models it needs; `tests/workflow.test.ts` and `tests/klein-workflow.test.ts` check that every link names a node the graph holds and every slot names a literal.

## Key adaptive-reverb workflows

The compact set used for the final adaptive-reverb v5 work, plus its separate
AKUSPACE audio experiment. These API templates are submitted explicitly;
the studio does not fill or queue them. No private media is included.

| Selector          | Workflow and instructions                                             | Role                                                                                                |
| ----------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `layout-to-video` | [World Builder L2R + track](world-builder-l2r-a2v.README.md)          | Final party shot; [studio input preset](world-builder-l2r-a2v-studio.README.md) shares the endpoint |
| `akuspace`        | [Image + track + AKUSPACE](ltx-i2v-a2v-akuspace.README.md)            | Learned small-room sound; partially regenerates the music                                           |
| `cpu-reverb`      | [Adaptive reverb on CPU](world-builder-adaptive-reverb-cpu.README.md) | Scene recipe + original track → IR and wet mix, local CPU/Mac                                       |

One shared [Developer Platform deployment](../docs/comfy-deploy.md) covers the
two GPU selectors with the exact `ltx-world-key` model set; CPU reverb stays
local. The [manifest](ltx-world-builder.endpoints.json) maps these three names.
[room-reverb.sh](room-reverb.README.md) levels and crossfades their exported IRs.

### Fill a key workflow

Create a JSON object keyed by token name without the surrounding `__`.
Use exactly the tokens listed in that workflow's README. `RECIPE_JSON` is a
JSON string, seeds are JSON integers, and media names are relative to ComfyUI
`input/`. Then, offline:

```sh
python3 workflows/materialize-ltx.py --endpoint layout-to-video --values values.json --output /tmp/layout.api.json
```

Add `--preset studio` for that input preset, or choose `--endpoint akuspace`
or `--endpoint cpu-reverb`. The helper writes a new file exclusively, refuses
missing/unknown tokens and invalid seeds/paths, and never submits. The CPU
[recipe builder](world-builder-adaptive-reverb-cpu.README.md) also accepts a
recipe file or capture receipt directly. Each paid GPU submission is a separate
owner-run action described in the deployment guide.

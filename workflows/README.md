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

## Worked LTX / World Builder API templates

The [30 October GPU workflow collection](ltx-world-builder.README.md) preserves
successful graphs with explicit input placeholders. These are standalone API
templates, not studio-registered slots. Fill them with `materialize-ltx.py`;
the [shared build and deployment plan](../docs/comfy-deploy.md) uses the named
endpoint catalogue below. GPU-session results are documented per graph;
Developer Platform execution remains unverified.

| Workflow                                                                          | Endpoint          | Build set           |
| --------------------------------------------------------------------------------- | ----------------- | ------------------- |
| [`world-builder-l2r-dive.json`](world-builder-l2r-dive.README.md)                 | `dive`            | `world-builder-l2r` |
| [`world-builder-l2r-cathedral.json`](world-builder-l2r-cathedral.README.md)       | `cathedral`       | `world-builder-l2r` |
| [`world-builder-l2r-a2v-party-v8.json`](world-builder-l2r-a2v-party-v8.README.md) | `party_v8`        | `world-builder-l2r` |
| [`world-builder-l2r-a2v.json`](world-builder-l2r-a2v.README.md)                   | `party`           | `world-builder-l2r` |
| [`world-builder-l2r-a2v-studio.json`](world-builder-l2r-a2v-studio.README.md)     | `studio`          | `world-builder-l2r` |
| [`world-builder-l2r-party.json`](world-builder-l2r-party.README.md)               | `party_base`      | `world-builder-l2r` |
| [`world-builder-l2r-studio.json`](world-builder-l2r-studio.README.md)             | `studio_base`     | `world-builder-l2r` |
| [`ltx-i2v-a2v.json`](ltx-i2v-a2v.README.md)                                       | `studio_cpu`      | `ltx-i2v`           |
| [`ltx-i2v-a2v-akuspace.json`](ltx-i2v-a2v-akuspace.README.md)                     | `studio_akuspace` | `ltx-i2v`           |
| [`ltx-i2v-dive-cathedral.json`](ltx-i2v-dive-cathedral.README.md)                 | `cathedral_i2v`   | `ltx-i2v`           |
| [`ltx-i2v-dive-medium-room.json`](ltx-i2v-dive-medium-room.README.md)             | `medium_room`     | `ltx-i2v`           |
| [`ltx-i2v-dive-small-room.json`](ltx-i2v-dive-small-room.README.md)               | `small_room`      | `ltx-i2v`           |
| [`ltx-i2v-party.json`](ltx-i2v-party.README.md)                                   | `party_i2v`       | `ltx-i2v`           |
| [`ltx-i2v-vocalist.json`](ltx-i2v-vocalist.README.md)                             | `vocalist_i2v`    | `ltx-i2v`           |
| [`ltx-i2v-chain-cathedral.json`](ltx-i2v-chain-cathedral.README.md)               | `chain_cathedral` | `ltx-i2v`           |
| [`ltx-i2v-chain-party.json`](ltx-i2v-chain-party.README.md)                       | `chain_party`     | `ltx-i2v`           |
| [`ltx-i2v-chain-studio.json`](ltx-i2v-chain-studio.README.md)                     | `chain_studio`    | `ltx-i2v`           |
| [`ltx-fall15-t2v-s1.json`](ltx-fall15-t2v-s1.README.md)                           | `fall15_t2v_s1`   | `ltx-i2v`           |
| [`ltx-fall15-t2v-s2.json`](ltx-fall15-t2v-s2.README.md)                           | `fall15_t2v_s2`   | `ltx-i2v`           |
| [`ltx-fall15-voice-s1.json`](ltx-fall15-voice-s1.README.md)                       | `fall15_voice_s1` | `ltx-i2v`           |
| [`ltx-fall15-voice-s2.json`](ltx-fall15-voice-s2.README.md)                       | `fall15_voice_s2` | `ltx-i2v`           |
| [`ltx-vo-female-s1.json`](ltx-vo-female-s1.README.md)                             | `vo_female_s1`    | `ltx-i2v`           |
| [`ltx-vo-female-s2.json`](ltx-vo-female-s2.README.md)                             | `vo_female_s2`    | `ltx-i2v`           |

[Whole-track room reverb](room-reverb.README.md) is the accompanying CPU script;
its inputs are the scene IRs saved by the L2R graphs. It uses no model or account.

A template lists its slots (including a `model` slot for every loader input, which a local ComfyUI's model map fills), the node types it needs and the model files Comfy Cloud must hold. To add one: put the API-format graph here with a README, add its template and values beside the others in `shared/`, add a row to `workflowTemplates` with the capabilities it serves, and let `tests/workflow-templates.test.ts` check its links, slots and loaders.

Planned next in the studio registry: LTX image-to-video (the standalone API graphs above already accept uploaded images), the LTX-2.5 latent spatial upscaler ×2, and `FluxVideoUpscaleNode`. Each file lists the nodes and models it needs; `tests/workflow.test.ts` and `tests/klein-workflow.test.ts` check that every link names a node the graph holds and every slot names a literal.

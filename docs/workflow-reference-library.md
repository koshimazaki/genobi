---
tags: [workflows, comfy, models, director, agents, research]
summary: Future model and custom-node workflow references for reusable video production, separate from runnable studio entries.
---

# Workflow reference library

This catalogue holds useful external models, node packs and workflow ideas for
future integration. Entries here are research candidates; the model menu and
runtime registry list only capabilities with an implemented adapter. Agents can
find this page through `genobi_docs` using the `workflows` or `research` tag.

## MiniMax H3 seamless loops

This is a custom-node/workflow reference for
MiniMax H3, rather than another model by itself.

| Reference         | Detail                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository        | [pxl-pshr/ComfyUI-MiniMaxH3-Loop](https://github.com/pxl-pshr/ComfyUI-MiniMaxH3-Loop)                                                                                             |
| Source pin        | [733647e41a7574a354639623d4b50e7f6152ee09](https://github.com/pxl-pshr/ComfyUI-MiniMaxH3-Loop/tree/733647e41a7574a354639623d4b50e7f6152ee09)                                      |
| Package           | `minimaxh3-loop` 1.0.1; ComfyUI ≥0.42.0, from [package metadata](https://github.com/pxl-pshr/ComfyUI-MiniMaxH3-Loop/blob/733647e41a7574a354639623d4b50e7f6152ee09/pyproject.toml) |
| Node-pack licence | [GPL-3.0](https://github.com/pxl-pshr/ComfyUI-MiniMaxH3-Loop/blob/733647e41a7574a354639623d4b50e7f6152ee09/LICENSE); model weights and companion packs have separate terms        |
| Status            | Referenced only; no installation, weights, workflow import or render performed                                                                                                    |

The [upstream README](https://github.com/pxl-pshr/ComfyUI-MiniMaxH3-Loop/blob/733647e41a7574a354639623d4b50e7f6152ee09/README.md)
describes wrapped-context sampling and decoding, optional ControlNet restyling
of an existing loop, and interpolation across its end/start boundary. Examples
cover the ordinary, Turbo, FastH3 and Control workflows. Interpolation needs
ComfyUI-Frame-Interpolation; the Control example also uses VideoHelperSuite.
Its [prompt guide](https://github.com/pxl-pshr/ComfyUI-MiniMaxH3-Loop/blob/733647e41a7574a354639623d4b50e7f6152ee09/PROMPTING.md)
favours continuing or cyclic activity with a stable scene. These are upstream
capability claims, not Genobi render evidence.

### Where it fits

The intended use is a repeatable footage layer beneath editable titles,
graphics or other Director layers. Keep the generated loop, its prompt,
workflow/model versions, timing and audio alongside the editable project.
Voice or an MCP-connected agent could later prepare that workflow, request a
quote/approval and place the result. The wider goal is a reusable production
platform for ordinary work after the submission, with loops as one capability.

Comfy Cloud is the intended hosted destination, but availability of **this exact
pack**, its models and companion nodes is unverified. A Comfy package declaration
or public workflow does not establish availability in an account. Check the
account's node/model inventory before selecting a run location; see the
[Cloud inventory](comfy-cloud-inventory.md) and [run locations](run-location.md).

### Future integration task

Validate one pinned workflow and its dependencies on the
chosen Comfy instance. Measure the picture and audio seam over repeated cycles,
retain fps/duration metadata, then add the validated template, model entry and
agent guidance through the existing workflow adapter. Preserve quote, approval
and replay protection for any paid run. Review node/model terms before bundling
code or weights. No runnable menu entry follows from this reference alone.

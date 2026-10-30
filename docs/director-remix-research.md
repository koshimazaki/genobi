---
tags: [director, research]
summary: Public evidence on Higgsfield Katana and Genjutsu, and the proposed Director reconstruction.
---

# Katana / Genjutsu → Director: evidence and proposed reconstruction

Checked 17 October 2026. Public UI and documentation inspection only; no access to private implementation or competitor generation runs.

[Katana](https://higgsfield.ai/katana) shows reference media/instructions, preset previews, Recreate, and categories for personalized edits, style transfer and motion transfer. Recreate opened a Claude/MCP connection flow. Its [launch description](https://higgsfield.ai/blog/higgsfield-katana) describes an agent recreating pacing and shot structure and revising affected shots. Exact backend models, renderer, prompts and internal JSON are unknown. Portable JSON export was not established; that does not prove its absence.

[Genjutsu](https://higgsfield.ai/genjutsu) exposes motion transfer and object swapping. Treat these as distinct recipes within the same workspace. Our proposed architecture is reference/slot analysis → per-shot generation → deterministic composition → targeted revision. This is a compatible product design inferred from observable behavior, not recovered internals.

| Goal                                                  | Documented candidate                                                                                                                                             | Director mapping                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Localized character / clothing replacement in a video | [LTX in/outpainting](https://docs.ltx.io/open-source-model/feature-guides/editing-effects/in-outpainting): source, matching mask and optional edited first frame | Clean plate + FLUX-edited first frame + mask → imported video layer        |
| Transfer a performance to a look                      | [LTX workflow compatibility](https://docs.ltx.io/open-source-model/reference/workflow-asset-compatibility): Motion Transfer workflow + corresponding adapter     | Separate template recipe; not pixel-preserving replacement                 |
| Constrain restyling to geometry                       | [IC-LoRA Union Control](https://docs.ltx.io/open-source-model/integration-tools/ic-lo-ra-adapters), using depth/canny/pose                                       | Evaluate structure preservation and appearance leakage                     |
| Render an authored scene                              | [Layout-to-render](https://docs.ltx.io/open-source-model/vfx-post-production/layout-to-render)                                                                   | World Builder layout clip + styled first frame; add soundtrack in Director |

The LTX 2.5 two-stage inpainting example intentionally references a 2.3 in/outpainting adapter; use the complete official graph and its matching asset stack. Arbitrarily replacing those versions is not a compatibility fix. Alpha subject extraction is not automatically a selected-garment mask. Source/mask timing, framing and occlusion remain quality constraints.

The existing FLUX region UI composes reference and target boxes using the provider's documented grid. A rectangle plus prompt is a conditioning request; it is not evidence of an exact mask or perfect identity retention. Keep title/graphics as compositor layers so text does not need regeneration with each image.

Differentiation proposed here: portable media+JSON bundles, editable procedural graphics, World Builder scenes, agent-callable frames/cuts, and the same simple/advanced project. Retain the existing modular gallery; add compact examples as entry points rather than replacing it with a locked preset catalog.

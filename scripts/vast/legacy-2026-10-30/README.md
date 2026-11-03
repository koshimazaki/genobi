# Proven Vast LTX session — 30 October 2026 (reference)

These seven files were supplied from the successful Genobi / Camera Director
Vast session: a **RTX PRO 6000 96 GB**, ComfyUI **0.41.0**, LTX-2.5
Layout-to-Render, Koshi nodes and World Builder. The source material is retained
to explain what worked, not to promise that all old API graphs still work with
the latest Genobi scene schema.

This directory contains:

- `SESSION-LOG.md`: outcome ledger, the chosen v6 cut, CPU/AKUSPACE sound
  decisions and historical inputs. The original personal `~/Downloads` audio
  path has been replaced with a portable filename; no soundtrack is committed.
- `WORKFLOWS.md`: worked, failed and untested graph identifiers.
- `DEVELOP.md`: engineering findings from the real GPU session.
- `make-dive-scenes.py`: generates the cathedral, party and studio move-library
  recipes, given a directory of existing `skydive-cathedral`,
  `fall-cathedral`, `fall-medium-room` and `fall-small-room` JSON recipes.
- `make-a2v.py`: builds CPU-vs-AKUSPACE graph variants **from an existing**
  `jobs/dive4-party.api.json`; its referenced images and audio are not included.
- `setup.v4.reference.txt`: original machine-specific setup script, kept
  non-executable deliberately. It was designed for the previous Vast PyTorch
  image with `/workspace/ComfyUI`, `/venv/comfyui/bin/python`, loopback port
  **18188** and a Caddy listener on 8188. Its `sources` mode can move the
  existing ComfyUI installation and its source installer can replace directories.
- `upload.v4.reference.txt`: original SSH tar-stream command, also kept
  non-executable. It refers to the operator's local `vast-wb` SSH alias and a
  prior pack with many other files; this upload alone is **not** a complete pack.

**Do not run the old `setup sources`, `setup models`, or `upload` scripts
against an existing machine.** They can replace files or download approximately
185 GB of models. Neither script implements the new pinned experiment receipts
or duplicate-job protection.

## Reuse the existing machine safely

1. Use the operator's working SSH/Tailscale route. The `vast-wb` alias may exist
   on the operator's Mac; it is not an internet hostname or an address the
   assistant can assume works in another environment.
2. Run `sh scripts/vast/inspect-existing.sh` on the GPU machine. This checks
   the existing ComfyUI folders, models, CUDA and the three historical local
   ports **without modifying them**.
3. If the earlier `/workspace/ComfyUI/models` exists, run
   `python3 scripts/vast/assets.py verify --models-dir /workspace/ComfyUI/models`
   from the current Genobi experimental branch. It rehashes the six required
   LTX model files and shows what is actually missing. Do not redownload
   verified files just because the new bootstrap uses a different folder.
4. Check the **live node schemas** against the new materialized
   `workflow.api.json`. Do not submit before the guide, look still and matching
   audio are frozen and verified.
5. Run one fruit pilot via `workflows/experiments/run.py`, preserving its
   receipt and the original music. Do not repeat an uncertain submission.

The original `setup.v4.reference.txt` reads Hugging Face credentials from the
`HF_TOKEN` environment variable only. It does **not** fetch a token from the
Mac Keychain: the operator must provide access to the worker safely and
independently. Never add tokens, SSH private keys, model weights, tracks, or
generated private assets to this Git repository.

The old run also relied on other files not present in these uploads:
`make-l2r-a2v.py`, `chain-v2.py`, `room-reverb.sh`,
`REPO_COMMIT`, `models-extra.txt`, `RUNBOOK.md` and the actual
`jobs/`, `input/`, `takes/` and reference media. These historical
builders are not drop-in replacements for the two pinned
`workflows/experiments` candidates.

For current instructions see [Vast runner](../../../docs/vast-runner.md) and
[the audio-reactive pilot](../../../docs/audio-reactive-ltx-pilot.md).

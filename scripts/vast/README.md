# Vast worker scripts

Use the **existing instance first**, rather than recreating the successful
ComfyUI installation:

```sh
sh scripts/vast/inspect-existing.sh
```

This is read-only. In particular, the 30 October Vast PyTorch session ran
ComfyUI on `127.0.0.1:18188` behind the image's Caddy proxy. Do not assume
the current worker uses the new runner's default `127.0.0.1:8188`.

If the prior models are still present, run the pinned verifier against their
actual location before considering a model download:

```sh
python3 scripts/vast/assets.py verify --models-dir /workspace/ComfyUI/models
```

For a fresh **empty** workspace, use `bootstrap.py` and the current
[`docs/vast-runner.md`](../../docs/vast-runner.md).
For an actual experiment use `workflows/experiments/prepare.py` and
`workflows/experiments/run.py`, not the historical shell scripts.

The 30 October GPU session notes, graph builders and original setup/upload
scripts are kept in [`legacy-2026-10-30/`](legacy-2026-10-30/README.md).
Old setup/upload files have deliberately been saved as `.txt` references;
they are machine-specific and can replace existing files. Keep Keychain, SSH
credentials, Hugging Face tokens and audio out of Git.

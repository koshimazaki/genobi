# Comfy build recipe

For the compact adaptive-reverb release, use only **ltx-world-key**:

```sh
python3 comfy-build/scripts/comfy_build_spec.py --name genobi-ltx-world --sets ltx-world-key --check-workflows > ./comfy-build.yaml
```

This emits nine remote, hash-pinned models and the three required node packs.
Only World Builder is a local node upload; there are no local model uploads.
[Key deployment guide](../docs/comfy-deploy.md) covers comfy-cli 1.24 commands,
the two GPU selectors and local CPU reverb. Existing broader sets below remain
independent recipes. The optional seventh model-list field preserves a verified
resolver source URI; the SHA-256 fixes its bytes.

The pins and recipe for Genobi's Comfy Developer Platform builds: Comfy's
Openjutsu character swap (MiniMax H3, SAM 3.1 and Akatz Labs'
`h3_character_swap` pack), AKUSPACE and Layout-to-Render.

```sh
sh comfy-build/scripts/prepare-comfy-build.sh ./comfy-work swap
```

How to push, release and deploy it, sizes and costs:
[Comfy Developer Platform deployment](../docs/comfy-deployment.md).

| File                   | Holds                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| `sources.lock`         | ComfyUI and each node pack at a full commit, by set, with its patch      |
| `models/*.txt`         | One model set per workflow: repository, revision, size, SHA-256          |
| `patches/`             | Openjutsu's GPL-3.0 patch to the swap pack                               |
| `scripts/`             | Source install, the `comfy-build.yaml` generator and the model fetcher   |
| `workflows/`           | Openjutsu's swap graph, for `comfy deploy run --workflow`                |
| `tests/`               | The generator and fetcher, no network: `python3 -I tests/test_models.py` |
| `THIRD_PARTY_NOTICES/` | Licences of what the build carries                                       |

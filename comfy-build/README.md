# Comfy build recipe

The pins and recipe for Genobi's Comfy Developer Platform builds: Comfy's
Openjutsu character swap (MiniMax H3, SAM 3.1 and Akatz Labs'
`h3_character_swap` pack), AKUSPACE, Layout-to-Render and the worked
LTX / World Builder families.

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

## Worked LTX / World Builder release

Use sets `world-builder-l2r ltx-i2v` for the shared `genobi-ltx-world`
deployment: nine model files (109.464 GB), exactly the loader union of the
23 worked API templates. `world-builder-l2r.txt` excludes the untried Union
Control LoRA from the older layout set; `ltx-i2v.txt` preserves the tested
int8/AKUSPACE files. Revisions, sizes and the public LoRA hash are copied
from the existing verified model pins. Eight gated weights upload from disk.

`sources.lock` includes World Builder at this repository's public v0.1
commit, with `patches/world_builder.patch` for the Capture 2 GiB cap and
Inputs preview downscale. Its subfolder/patch makes it `source: local`;
source preparation installs it automatically. The LTXVideo and Koshi packs
remain at the tested commits. No model download, build or deploy was run
for this addition.

Offline spec generation and graph/model coverage (no comfy-cli required):

```sh
PYTHONDONTWRITEBYTECODE=1 python3 comfy-build/scripts/comfy_build_spec.py --name genobi-ltx-world --sets world-builder-l2r ltx-i2v --check-workflows > /tmp/genobi-comfy-build.yaml
PYTHONDONTWRITEBYTECODE=1 python3 -I comfy-build/tests/test_comfy_spec.py
PYTHONDONTWRITEBYTECODE=1 python3 -I comfy-build/tests/test_ltx_workflows.py
```

`comfy build validate` is unavailable; use these repo checks. The
[owner-run release and deployment guide](../docs/comfy-deploy.md) lists exact
commands, named room endpoints, costs and the remaining FFmpeg/FFprobe and
asset-upload checks. The owner starts the paid build/deploy and test jobs.

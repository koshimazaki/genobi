# AKUSPACE ComfyUI image

ComfyUI with the Koshi AKUSPACE nodes and ComfyUI-LTXVideo, every pack pinned, running AKUSPACE text to video, audio to audio and image to
video on LTX-2.5 on one NVIDIA GPU.

```sh
cp env.example .env       # HF_TOKEN
docker compose build
docker compose run --rm fetch-models
docker compose up -d
docker compose exec comfyui sh /opt/akuspace/scripts/entrypoint.sh verify
```

What is pinned and why, the workflows, inputs, models and the verify check:
[AKUSPACE ComfyUI in Docker](../../docs/akuspace-docker.md).

| File                | Holds                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| `Dockerfile`        | The image: Ubuntu 24.04, torch, ComfyUI and the packs                  |
| `compose.yaml`      | One GPU, port 8188 on this machine only, `./data` as the volume        |
| `custom-nodes.lock` | The node packs and their commits                                       |
| `constraints.txt`   | torch, torchvision and torchaudio, held for every install              |
| `models.txt`        | The model files `fetch-models` downloads                               |
| `workflows/`        | Genobi's image-to-video graph; the Koshi graphs are copied in at build |
| `scripts/`          | Node install, entrypoint, model download and verify                    |

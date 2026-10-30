#!/bin/sh
# serve (default): start ComfyUI on :8188 with its state on the /data volume.
# fetch-models: download the LTX-2.5 files and the AKUSPACE LoRA (HF_TOKEN).
# verify: check a running instance against the bundled workflows.
set -eu

scripts=/opt/akuspace/scripts
dirs="models models/diffusion_models models/text_encoders models/vae models/loras
  models/latent_upscale_models input output temp user workflows"

if [ "$(id -u)" = 0 ]; then
  # A bind mount arrives owned by the host. Own the folders (not the files in
  # them, which may be read-only model weights) and drop to the comfy user.
  chown comfy:comfy /data 2>/dev/null || true
  for dir in $dirs; do
    mkdir -p "/data/$dir"
    chown comfy:comfy "/data/$dir" 2>/dev/null || true
  done
  exec setpriv --reuid=comfy --regid=comfy --init-groups sh "$0" "$@"
fi

for dir in $dirs; do
  mkdir -p "/data/$dir"
done
# The bundled graphs, where the host can open them.
cp /opt/akuspace/workflows/*.json /data/workflows/

command="${1:-serve}"
[ "$#" -gt 0 ] && shift

case "$command" in
  serve)
    # COMFY_ARGS adds flags, for example "--cpu" on a machine without a GPU.
    # shellcheck disable=SC2086
    exec python main.py --listen 0.0.0.0 --port 8188 --disable-auto-launch \
      --extra-model-paths-config /opt/akuspace/extra_model_paths.yaml \
      --input-directory /data/input --output-directory /data/output \
      --temp-directory /data/temp --user-directory /data/user \
      ${COMFY_ARGS:-} "$@"
    ;;
  fetch-models)
    exec sh "$scripts/fetch-models.sh" /opt/akuspace/models.txt /data/models "$@"
    ;;
  verify)
    exec python "$scripts/verify.py" --workflows /opt/akuspace/workflows \
      --models /data/models --input /data/input --comfy-dir "$COMFY_DIR" "$@"
    ;;
  *)
    exec "$command" "$@"
    ;;
esac

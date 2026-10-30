# ComfyUI for AKUSPACE on LTX-2.5.
#
# Bakes in ComfyUI, the pinned custom node packs and the three AKUSPACE
# workflows (text to video, audio to audio, image to video). Model weights are
# not in the image: LTX-2.5 is gated and the files are about 37 GB, so they
# live on the /data/models volume and `fetch-models` downloads them.
#
# Build from this directory:  docker build -t genobi/akuspace-comfy .
# See README.md for running it with a GPU and checking it.

# Ubuntu 24.04 ships Python 3.12.
ARG BASE_IMAGE=ubuntu:24.04
FROM ${BASE_IMAGE}

# ComfyUI v0.42.5. LTXVDualCFGGuider and the LTX-2.5 audio nodes are core
# from 0.33.0; older builds reject every AKUSPACE graph.
ARG COMFYUI_REPO=https://github.com/comfyanonymous/ComfyUI
ARG COMFYUI_COMMIT=483dae4326356b81de05d27aca3f433dd323cc25
# Empty installs PyPI's wheels (CUDA 13.0). Set an index such as
# https://download.pytorch.org/whl/cu128 for hosts with an older driver.
ARG TORCH_INDEX_URL=

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    COMFY_DIR=/opt/ComfyUI \
    AKUSPACE_DIR=/opt/akuspace \
    PATH=/opt/venv/bin:$PATH

# libgl1 and libglib2.0 for OpenCV (Koshi effects), libsndfile for soundfile.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl git ffmpeg libgl1 libglib2.0-0t64 libsndfile1 \
        python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv

COPY constraints.txt ${AKUSPACE_DIR}/constraints.txt
RUN pip install --no-cache-dir ${TORCH_INDEX_URL:+--index-url "$TORCH_INDEX_URL"} \
        -r ${AKUSPACE_DIR}/constraints.txt

RUN git init -q ${COMFY_DIR} \
    && git -C ${COMFY_DIR} fetch -q --depth 1 ${COMFYUI_REPO} ${COMFYUI_COMMIT} \
    && git -C ${COMFY_DIR} checkout -q FETCH_HEAD \
    && rm -rf ${COMFY_DIR}/.git \
    && pip install --no-cache-dir -c ${AKUSPACE_DIR}/constraints.txt \
        -r ${COMFY_DIR}/requirements.txt

COPY custom-nodes.lock ${AKUSPACE_DIR}/custom-nodes.lock
COPY scripts/install-nodes.sh ${AKUSPACE_DIR}/scripts/install-nodes.sh
RUN sh ${AKUSPACE_DIR}/scripts/install-nodes.sh ${AKUSPACE_DIR}/custom-nodes.lock \
        ${COMFY_DIR}/custom_nodes ${AKUSPACE_DIR}/constraints.txt

# The text-to-video and audio-to-audio graphs come from the pinned Koshi pack,
# so they always match its nodes; image to video is Genobi's own.
COPY workflows/ ${AKUSPACE_DIR}/workflows/
RUN cp ${COMFY_DIR}/custom_nodes/Koshi-Nodes/workflows/akuspace/akuspace_t2v_native_onepass.json \
        ${AKUSPACE_DIR}/workflows/akuspace-t2v.json \
    && cp ${COMFY_DIR}/custom_nodes/Koshi-Nodes/workflows/akuspace/akuspace_t2v_2stage_hq.json \
        ${AKUSPACE_DIR}/workflows/akuspace-t2v-2stage.json \
    && cp ${COMFY_DIR}/custom_nodes/Koshi-Nodes/workflows/akuspace/akuspace_a2a_treat_recording.json \
        ${AKUSPACE_DIR}/workflows/akuspace-a2a.json

COPY extra_model_paths.yaml ${AKUSPACE_DIR}/extra_model_paths.yaml
COPY models.txt ${AKUSPACE_DIR}/models.txt
COPY scripts/entrypoint.sh scripts/fetch-models.sh scripts/verify.py ${AKUSPACE_DIR}/scripts/

# The entrypoint starts as root only to create and own the /data folders on a
# bind mount, then runs everything as this user.
RUN (userdel --remove ubuntu 2>/dev/null || true) \
    && useradd --create-home --uid 1000 comfy \
    && mkdir -p /data \
    && chown -R comfy:comfy /data ${COMFY_DIR}
WORKDIR ${COMFY_DIR}

VOLUME ["/data"]
EXPOSE 8188

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8188/system_stats >/dev/null || exit 1

ENTRYPOINT ["sh", "/opt/akuspace/scripts/entrypoint.sh"]
CMD ["serve"]

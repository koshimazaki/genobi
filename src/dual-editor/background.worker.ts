import * as ort from "onnxruntime-web/wasm";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";

// MIT model export. Immutable revision; no remote inference and no uploaded pixels.
const MODEL =
  "https://huggingface.co/studioludens/birefnet-lite-512/resolve/962e67969ec6acec9c19fab76acee4f5e22e990c/onnx/model.onnx";
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
let session: ort.InferenceSession | undefined;
self.onmessage = async (event: MessageEvent<Uint8ClampedArray>) => {
  try {
    if (!session) {
      self.postMessage({
        status: "Loading local model · 183 MB on first use…",
      });
      const cache = await caches.open("director-birefnet-512-v1");
      let response = await cache.match(MODEL);
      if (!response) {
        response = await fetch(MODEL, { credentials: "omit" });
        if (!response.ok)
          throw new Error("The background model could not be downloaded.");
        await cache.put(MODEL, response.clone());
      }
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 200 * 1024 ** 2)
        throw new Error("The background model exceeded its expected size.");
      session = await ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
      });
    }
    self.postMessage({ status: "Separating foreground on this device…" });
    const rgba = event.data,
      size = 512 * 512,
      input = new Float32Array(size * 3);
    const mean = [0.485, 0.456, 0.406],
      std = [0.229, 0.224, 0.225];
    for (let i = 0; i < size; i++)
      for (let c = 0; c < 3; c++)
        input[c * size + i] = (rgba[i * 4 + c] / 255 - mean[c]) / std[c];
    const tensor = new ort.Tensor("float32", input, [1, 3, 512, 512]);
    const result = await session.run({ input_image: tensor });
    const logits = result[session.outputNames[0]],
      data = logits.data as Float32Array;
    const alpha = new Uint8ClampedArray(size * 4);
    for (let i = 0; i < size; i++) {
      alpha[i * 4] = alpha[i * 4 + 1] = alpha[i * 4 + 2] = 255;
      alpha[i * 4 + 3] = Math.round(255 / (1 + Math.exp(-data[i])));
    }
    tensor.dispose();
    for (const value of Object.values(result)) value.dispose();
    self.postMessage({ alpha }, { transfer: [alpha.buffer] });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Background removal failed.",
    });
  }
};

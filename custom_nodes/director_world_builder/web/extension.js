import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Frames and assets stay on this Comfy origin. A capture never queues a workflow.
const editors = new Map();
const viewURL = (item) => "/view?" + new URLSearchParams(item);
// The session's recent audio outputs (SaveAudio, PreviewAudio, Inputs), newest
// first. Only names are kept here; the bytes come from this Comfy's /view when
// an open World Builder lists them in its Sound tab.
const recentAudio = [];
const audioItems = (output) =>
  [
    ...(Array.isArray(output?.audio) ? output.audio : []),
    ...(output?.world_inputs?.[0]?.soundtrack ?? []),
  ]
    .filter(
      (i) =>
        typeof i?.filename === "string" &&
        ["output", "temp", "input"].includes(i.type),
    )
    .map((i) => ({
      filename: i.filename,
      subfolder: typeof i.subfolder === "string" ? i.subfolder : "",
      type: i.type,
    }));
async function offerAudio(frame, item) {
  const res = await api.fetchApi(viewURL(item));
  if (!res.ok) return;
  const blob = await res.blob();
  if (blob.size > 32 * 1024 * 1024 || !blob.type.startsWith("audio/")) return;
  frame.contentWindow?.postMessage(
    { type: "director:recent-audio", blob, name: item.filename },
    location.origin,
  );
}
const style = document.createElement("style");
style.textContent = `
.director-wb{padding:0;border:0;overflow:hidden;background:#11171e;color:#d7e3ed}
.director-wb[open]{display:flex;flex-direction:column}
.director-wb[open]:not(:modal){position:static;inset:auto;margin:0;width:100%;height:100%;border-radius:6px}
.director-wb:modal{margin:auto;width:96vw;max-width:1600px;height:94vh;max-height:94vh;border:1px solid #45525f;border-radius:12px}
.director-wb>iframe{flex:1;min-height:0;width:100%;border:0;background:#11171e}
.director-wb-bar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;box-sizing:border-box;height:52px;padding:10px 18px}
.director-wb-bar>p{margin:0;font:12px system-ui}
.director-wb:not(:modal)>.director-wb-bar{height:24px;padding:4px 8px}
.director-wb:not(:modal)>.director-wb-bar>p{font-size:11px}
.director-wb:not(:modal) button{display:none}`;
document.head.append(style);
app.registerExtension({
  name: "Director.WorldBuilder",
  setup() {
    api.addEventListener("executed", ({ detail }) => {
      for (const item of audioItems(detail?.output)) {
        const key = JSON.stringify(item),
          at = recentAudio.findIndex((x) => JSON.stringify(x) === key);
        if (at >= 0) recentAudio.splice(at, 1);
        recentAudio.unshift(item);
        recentAudio.length = Math.min(recentAudio.length, 6);
        for (const frame of editors.values())
          void offerAudio(frame, item).catch(() => {});
      }
    });
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name === "DirectorSceneCapture") {
      const created = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        created?.apply(this, arguments);
        const frame = document.createElement("iframe");
        frame.src = new URL("./index.html", import.meta.url).href;
        frame.title = "World Builder";
        const note = document.createElement("p");
        note.textContent = "Capture in the editor before queuing.";
        // One editor per node: shown inline in the node, then lifted into the
        // top layer by showModal(). The iframe never moves, so it never reloads.
        const dialog = document.createElement("dialog");
        dialog.className = "director-wb";
        const toolbar = document.createElement("div");
        toolbar.className = "director-wb-bar";
        const close = document.createElement("button");
        close.textContent = "Back to graph";
        close.onclick = () => dialog.close();
        toolbar.append(note, close);
        dialog.append(toolbar, frame);
        const layout = (compact) =>
          frame.contentWindow?.postMessage(
            { type: "director:layout", compact },
            location.origin,
          );
        const inline = () => {
          if (dialog.open) return;
          dialog.show();
          layout(true);
        };
        // Back to graph, or Escape, returns the editor to the node. The close
        // event is queued, so the one Open fires below finds it already open.
        dialog.addEventListener("close", inline);
        // The frontend styles the widget's element, so it gets a holder.
        const holder = document.createElement("div");
        holder.style.cssText = "width:100%;height:100%";
        holder.append(dialog);
        this.addWidget("button", "Open World Builder", null, () => {
          if (dialog.matches(":modal")) return;
          if (dialog.open) dialog.close();
          dialog.showModal();
          layout(false);
        });
        const view = this.addDOMWidget("world_view", "director-world", holder, {
          serialize: false,
          getMinHeight: () => 300,
        });
        view.serialize = false;
        this.setSize([480, 640]);
        inline();
        const set = (name, value) => {
          const w = this.widgets?.find((w) => w.name === name);
          if (w) {
            w.value = value;
            w.callback?.(value);
          }
        };
        const upload = async (blob, suffix) => {
          const form = new FormData();
          form.append("image", blob, `world-${crypto.randomUUID()}.${suffix}`);
          form.append("type", "input");
          form.append("subfolder", "director");
          const response = await api.fetchApi("/upload/image", {
            method: "POST",
            body: form,
          });
          if (!response.ok) throw new Error("Comfy capture upload failed.");
          const file = await response.json();
          return [file.subfolder, file.name].filter(Boolean).join("/");
        };
        let ready = false;
        const listener = async (event) => {
          if (
            event.origin !== location.origin ||
            event.source !== frame.contentWindow
          )
            return;
          if (event.data?.type === "director:ready") {
            ready = true;
            layout(!dialog.matches(":modal"));
            editors.set(this.id, frame);
            // Oldest first, so the newest ends on top of the Sound tab's list.
            void (async () => {
              for (const item of [...recentAudio].reverse())
                await offerAudio(frame, item).catch(() => {});
            })();
            const text = this.widgets?.find(
              (w) => w.name === "recipe_json",
            )?.value;
            if (text && text !== "{}") {
              try {
                frame.contentWindow.postMessage(
                  { type: "director:recipe", recipe: JSON.parse(text) },
                  location.origin,
                );
              } catch {
                note.textContent = "Stored recipe is invalid.";
              }
            }
            return;
          }
          if (
            !ready ||
            !["director:capture", "director:take"].includes(event.data?.type)
          )
            return;
          try {
            const data = event.data,
              video = data.type === "director:take",
              blob = video ? data.video : data.blob;
            if (
              !(blob instanceof Blob) ||
              blob.size > 128 * 1024 * 1024 ||
              blob.type !== (video ? "video/webm" : "image/png")
            )
              throw new Error("Invalid capture payload.");
            const recipe = JSON.stringify(data.recipe);
            if (new TextEncoder().encode(recipe).length > 64000)
              throw new Error("Recipe too large.");
            note.textContent = "Uploading capture…";
            const capture = await upload(blob, video ? "webm" : "png");
            let audio = "";
            if (video && data.audio instanceof Blob) {
              if (
                data.audio.size > 32 * 1024 * 1024 ||
                data.audio.type !== "audio/wav"
              )
                throw new Error("Invalid audio payload.");
              audio = await upload(data.audio, "wav");
            }
            let depth = "";
            if (data.depth instanceof Blob) {
              if (
                data.depth.size > 128 * 1024 * 1024 ||
                data.depth.type !== (video ? "video/webm" : "image/png")
              )
                throw new Error("Invalid depth payload.");
              depth = await upload(data.depth, video ? "webm" : "png");
            }
            set("capture_file", capture);
            set("audio_file", audio);
            set("depth_file", depth);
            set("recipe_json", recipe);
            note.textContent = "Capture attached. Queue when ready.";
            app.graph.setDirtyCanvas(true, true);
          } catch (error) {
            note.textContent = error.message;
          }
        };
        window.addEventListener("message", listener);
        const removed = this.onRemoved;
        this.onRemoved = function () {
          dialog.removeEventListener("close", inline);
          dialog.close();
          dialog.remove();
          editors.delete(this.id);
          window.removeEventListener("message", listener);
          removed?.apply(this, arguments);
        };
      };
    }
    if (nodeData.name === "DirectorSceneInputs") {
      const created = nodeType.prototype.onNodeCreated,
        executed = nodeType.prototype.onExecuted;
      nodeType.prototype.onNodeCreated = function () {
        created?.apply(this, arguments);
        this.addWidget(
          "button",
          "Send inputs to World Builder",
          null,
          async () => {
            try {
              if (editors.size !== 1)
                throw new Error(
                  "Open exactly one World Builder Capture node before sending inputs.",
                );
              const data = this.worldInputs;
              if (!data) throw new Error("Queue this Inputs node first.");
              const frame = [...editors.values()][0];
              // The browser prepares audio first, then screen media through one atomic asset message.
              const payload = { type: "director:assets" };
              for (const [key, source] of [
                ["audio", data.soundtrack?.[0]],
                ["screen", data.screen?.[0]],
              ])
                if (source) {
                  const res = await api.fetchApi(viewURL(source));
                  if (!res.ok)
                    throw new Error("Comfy input file is unavailable.");
                  payload[key] = await res.blob();
                }
              frame.contentWindow.postMessage(payload, location.origin);
            } catch (error) {
              app.ui.dialog.show(error.message);
            }
          },
        );
      };
      nodeType.prototype.onExecuted = function (message) {
        executed?.apply(this, arguments);
        this.worldInputs = message.world_inputs?.[0];
      };
    }
  },
});

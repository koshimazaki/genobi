import DeploymentPreset from "./DeploymentPreset";
import {
  clearLayoutTake,
  layoutRecipe,
  stageLayoutTake,
  useLayoutTake,
} from "../layout-take";
import { useSettingsStore } from "../settings-store";
import { useEffect, useRef, useState } from "react";
import {
  deployEndpoint,
  isDeployModel,
} from "../../shared/comfy/deploy-catalogue";
import { deployTemplates } from "../../shared/comfy/deploy-workflows";
import type { DeployInput } from "../../shared/comfy/deploy-input";
import type { ComposerState } from "../useComposer";
import { request } from "../useJobs";
import PromptInput from "./PromptInput";
import "../styles/deployment.css";

/** Compact input panel inside the existing video reference tray footprint. */
export default function DeploymentWorkspace({
  state,
  update,
  apiKey,
  onError,
  onBusy,
  onOpenCamera,
  onOpenAcoustic,
}: {
  state: ComposerState;
  update: (patch: Partial<ComposerState>) => void;
  apiKey: string;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
  onOpenCamera: () => void;
  onOpenAcoustic: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const captured = useLayoutTake((s) => s.pending);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const busyCallback = useRef(onBusy);
  busyCallback.current = onBusy;
  useEffect(() => {
    mounted.current = true;
    return () => {
      // ComposerWorkspace unmounts us when switching to a non-deployment model.
      mounted.current = false;
      if (inFlight.current) busyCallback.current(false);
    };
  }, []);
  const current = useRef(state);
  current.current = state;
  const model = state.model;
  const selectedTemplate = useSettingsStore((s) => s.workflows[model]);
  if (!isDeployModel(model)) return null;
  const endpoint = deployEndpoint(model);
  const template = deployTemplates.find(
    (t) => t.id === (selectedTemplate ?? endpoint.workflow.slice(0, -5)),
  )!;
  const tokens = [
    ...new Set(
      Object.keys(template.slots)
        .filter((path) => template.slots[path].kind !== "model")
        .map((path) => {
          const dot = path.indexOf(".");
          return String(
            template.graph[path.slice(0, dot)].inputs[path.slice(dot + 1)],
          ).slice(2, -2);
        }),
    ),
  ];
  const input: DeployInput = state.deploy ?? {
    seed: 0,
    negativePrompt: "",
    assets: {},
  };
  const change = (patch: Partial<DeployInput>) =>
    update({ deploy: { ...(current.current.deploy ?? input), ...patch } });
  async function attach(token: string, file: File) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusy(true);
    onError("");
    try {
      if (token === "RECIPE_JSON") {
        if (file.size > 64000)
          throw new Error("Choose a capture recipe under 64 KB.");
        const recipe = layoutRecipe(await file.text());
        if (!mounted.current) return;
        if (current.current.model === model) change({ recipe });
        return;
      }
      if (file.size > 150_000_000)
        throw new Error("Keep each deployment input under 150 MB.");
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      const types: Record<string, string> = {
        webm: "video/webm",
        wav: "audio/wav",
        flac: "audio/flac",
        mp3: "audio/mpeg",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
      };
      const { id } = await request<{ id: string }>(
        `/api/settings/deployment-assets/${token}`,
        {
          method: "POST",
          headers: {
            "Content-Type": types[extension ?? ""] ?? file.type,
            ...(apiKey ? { "x-byo-key": apiKey } : {}),
          },
          body: file,
        },
      );
      if (!mounted.current) return;
      if (current.current.model === model)
        change({
          assets: { ...(current.current.deploy?.assets ?? {}), [token]: id },
        });
    } catch (error) {
      if (mounted.current)
        onError(
          error instanceof Error
            ? error.message
            : "Could not attach that input.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  async function attachScene() {
    if (inFlight.current || !captured) return;
    inFlight.current = true;
    setBusy(true);
    onBusy(true);
    setNote("");
    onError("");
    try {
      const next = await stageLayoutTake(captured, apiKey);
      if (!mounted.current) return;
      if (
        current.current.model !== model ||
        useLayoutTake.getState().pending !== captured
      )
        throw new Error(
          "The selected take or model changed. Attach the scene again when ready.",
        );
      change(next);
      clearLayoutTake(captured.id);
      setNote(
        "Captured scene attached. Its first frame is the initial look reference; replace it if you want another look. Review the track and prompt, then Generate for a quote. Nothing was generated.",
      );
    } catch (error) {
      if (mounted.current)
        onError(
          error instanceof Error
            ? error.message
            : "Could not attach the captured scene.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return (
    <div className="image-workspace video-workspace deployment-workspace">
      <PromptInput
        {...state}
        resizable
        onChange={(description) => update({ description })}
        onSlotsChange={(slots) => update({ slots })}
        onOpenCamera={onOpenCamera}
        onOpenAcoustic={onOpenAcoustic}
      />
      <section
        className="video-reference-tray deployment-inputs"
        aria-label="Deployment inputs"
      >
        <p>
          {model === "ltx-deploy-layout-to-video"
            ? "Scene-derived room reverb"
            : "AKUSPACE learned-audio experiment"}{" "}
          · {state.duration}s at 24 fps
        </p>
        {model === "ltx-deploy-layout-to-video" && captured && (
          <div>
            <p>
              Captured scene: {captured.name}. Attaching uploads its
              colour/depth take, first frame and matching audio to your
              registered deployment.
            </p>
            <button disabled={busy} onClick={() => void attachScene()}>
              Attach captured scene
            </button>
            <button
              disabled={busy}
              onClick={() => clearLayoutTake(captured.id)}
            >
              Discard captured scene handoff
            </button>
          </div>
        )}
        {note && <p role="status">{note}</p>}
        {tokens
          .filter((token) => /(_WEBM|_PNG|_AUDIO|RECIPE_JSON)$/.test(token))
          .map((token) => (
            <label key={`${model}-${token}`}>
              {token.toLowerCase().replaceAll("_", " ")}
              {token === "DEPTH_WEBM" ? " (optional)" : ""}
              <input
                type="file"
                disabled={busy}
                accept={
                  token === "RECIPE_JSON"
                    ? ".json"
                    : token.endsWith("WEBM")
                      ? ".webm"
                      : token.endsWith("AUDIO")
                        ? ".wav,.flac,.mp3"
                        : ".png,.jpg,.jpeg,.webp"
                }
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void attach(token, file);
                  event.target.value = "";
                }}
              />
              <span>
                {token === "RECIPE_JSON"
                  ? input.recipe
                    ? "Attached"
                    : "Required"
                  : input.assets[token]
                    ? "Attached"
                    : token === "DEPTH_WEBM"
                      ? "No depth guide"
                      : "Required"}
              </span>
            </label>
          ))}
        {model === "ltx-deploy-layout-to-video" && <DeploymentPreset />}
        <label>
          Seed
          <input
            type="number"
            min="0"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            value={input.seed}
            onChange={(e) => change({ seed: Number(e.target.value) })}
          />
        </label>
        <details>
          <summary>Negative prompt and workflow notes</summary>
          <textarea
            aria-label="Negative prompt"
            maxLength={12000}
            value={input.negativePrompt}
            onChange={(e) => change({ negativePrompt: e.target.value })}
          />
          <p>
            Inputs are staged on your deployment. Tickets last two hours in this
            studio process. Reattach after restart. L2R needs the matching
            capture recipe; room geometry comes from that recipe.
          </p>
          <p>
            AKUSPACE changes the music. CPU adaptive reverb runs separately on
            your machine. Confirm each paid run separately.
          </p>
          <a
            href={`https://github.com/koshimazaki/Genobi/blob/main/workflows/${endpoint.workflow.replace(".json", ".README.md")}`}
            target="_blank"
            rel="noreferrer"
          >
            Workflow inputs and limits
          </a>
        </details>
      </section>
    </div>
  );
}

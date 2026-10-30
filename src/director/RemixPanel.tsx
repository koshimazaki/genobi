import ProjectTools from "../arena/ProjectTools";
import { StudioPanel, useShell } from "../studio/ShellContext";
import { useRef, useState } from "react";
import { download, digest, validateFiles, type Bundle } from "./bundle";
import { findTemplate } from "./template-catalogue";
import TemplateCards from "./TemplateCards";
import { templateAddress } from "./route-template";
import MixPlan from "./MixPlan";
import {
  DIRECTOR_PROJECT_BYTES,
  DIRECTOR_PROJECT_LIMIT,
  editLayer,
} from "../../shared/director/types";
import { runDirectorCommand } from "./remix-commands";
import AgentPanel from "./AgentPanel";
import TemplatePlan from "./TemplatePlan";
import {
  findHouseTemplate,
  findMixTemplate,
} from "../../shared/templates/catalogue";
import ProjectPrompt from "./ProjectPrompt";
import RemixGeneration from "./RemixGeneration";
import type { PageKey } from "../usePageKey";
import type { GenerateInput } from "../../shared/types";
import type { publicGenerationRecipe } from "../../shared/director/generation-recipe";
import { referenceBytes } from "./reference-bytes";
import { studioStore } from "../studio/store";
import { executeStudioCommand } from "../studio/commands";
import MediaSlots from "./MediaSlots";
import { mediaSlots, pictureSlots, type MediaSlot } from "./remix-slots";
import "./remix.css";

export default function RemixPanel({
  connection,
  bundle,
  disabled,
  editingDisabled,
  exportVideo,
  advanced,
  setAdvanced,
  commit,
  busy,
  report,
}: {
  connection: PageKey;
  bundle: Bundle;
  disabled: boolean;
  editingDisabled: boolean;
  exportVideo: () => void;
  advanced: boolean;
  setAdvanced: (v: boolean) => void;
  commit: (b: Bundle) => void;
  busy: (v: boolean) => void;
  report: (e: unknown) => void;
}) {
  const shell = useShell();
  const inFlight = useRef(false),
    current = useRef(bundle);
  current.current = bundle;
  const title = bundle.project.layers.find((l) => l.id === "title");
  const [notice, setNotice] = useState("");
  const [toolsOpened, setToolsOpened] = useState(advanced);

  const template = findTemplate(bundle.project.id);
  const slots = mediaSlots(bundle.project);
  const pictures = pictureSlots(bundle.project);
  const remixShots = pictures.flatMap((slot) => [...slot.layerIds]);
  const isRemix = remixShots.length > 0;
  const generationShots =
    template?.id === "outfit-reveal"
      ? remixShots.filter((id) => id === "outfit-after")
      : remixShots;
  async function choose(id: string) {
    const mix = findMixTemplate(id);
    if (!mix) throw new Error("This template is unavailable.");
    await locked(async (before) => {
      const saved = studioStore.getState().director.drafts[id]?.bundle;
      const next =
        saved ?? (await (await import("./mix-template")).loadMixTemplate(mix));
      if (current.current !== before)
        throw new Error("Project changed; choose the template again");
      const updated = {
        ...next,
        project: { ...next.project, revision: before.project.revision + 1 },
      };
      current.current = updated;
      commit(updated);
      const url = templateAddress(id, location.href);
      window.history.replaceState(null, "", url);
      setNotice(
        saved
          ? "Your draft is restored."
          : "The cut is open. Play it, or open the editor to change it.",
      );
    });
  }
  function setTitle(parameters: Record<string, string | number>) {
    if (editingDisabled || title?.kind !== "graphics" || title.locked) return;
    try {
      commit({
        ...bundle,
        project: editLayer(bundle.project, title.id, {
          parameters: { ...title.parameters, ...parameters },
        }),
      });
    } catch (e) {
      report(e);
    }
  }

  async function locked<T>(operation: (b: Bundle) => Promise<T>): Promise<T> {
    if (
      disabled ||
      inFlight.current ||
      Object.values(studioStore.getState().operations).some(Boolean)
    )
      throw new Error("Wait for the current edit or render to finish");
    inFlight.current = true;
    busy(true);
    const before = current.current;
    try {
      return await operation(before);
    } finally {
      inFlight.current = false;
      busy(false);
    }
  }
  async function execute(command: unknown, file?: File) {
    if (disabled || inFlight.current)
      throw new Error("Wait for the current edit or render to finish");
    const result = await executeStudioCommand(command, file);
    if ("blob" in result && result.blob) download(result.blob, result.filename);
    return result.receipt;
  }
  function replace(slot: MediaSlot, file: File) {
    if (disabled) return;
    void execute(
      {
        op: "replace",
        revision: bundle.project.revision,
        layerIds: [...slot.layerIds],
      },
      file,
    )
      .then(() => setNotice(`${slot.label} updated.`))
      .catch(report);
  }
  async function applyGenerated(
    file: File,
    input: GenerateInput,
    recipe?: ReturnType<typeof publicGenerationRecipe>,
  ) {
    await locked(async (before) => {
      const result = await runDirectorCommand(
        before,
        {
          op: "replace",
          revision: before.project.revision,
          layerIds: generationShots,
        },
        file,
      );
      if (!("bundle" in result) || !result.bundle)
        throw new Error("No replacement result");
      const next = result.bundle,
        generationId = `generation-${crypto.randomUUID().slice(0, 8)}`;
      const references = [];
      for (const [i, url] of (input.imageReferences ?? []).entries()) {
        const { type, bytes } = referenceBytes(url);
        const id = `${generationId}-ref-${i}`,
          ext =
            type === "image/jpeg"
              ? "jpg"
              : type === "image/webp"
                ? "webp"
                : "png",
          path = `references/${id}.${ext}`;
        next.files.set(path, bytes);
        next.project.assets[id] = {
          kind: "image",
          use: "reference",
          origin: "uploaded",
          file: { path, sha256: await digest(bytes) },
        };
        references.push(id);
      }
      const layer = next.project.layers.find(
        (l) => l.id === generationShots[0],
      )!;
      if (!("assetId" in layer)) throw new Error("Missing output asset");
      next.project.assets[layer.assetId].origin = "generated";
      next.project.assets[layer.assetId].generationId = generationId;
      next.project.generations.push({
        id: generationId,
        inputAssetIds: references.slice(0, 1),
        referenceAssetIds: references.slice(1),
        outputAssetIds: [layer.assetId],
        prompt: input.description,
        tool: "FLUX image edit via /api/jobs",
        ...(recipe ? { recipe } : {}),
      });
      if (
        [...next.files.values()].reduce((n, b) => n + b.length, 0) >
        DIRECTOR_PROJECT_BYTES
      )
        throw new Error(`Bundle exceeds ${DIRECTOR_PROJECT_LIMIT}`);
      await validateFiles(next);
      if (current.current !== before)
        throw new Error("Project changed; apply the result again");
      current.current = next;
      commit(next);
    });
  }
  return (
    <>
      <StudioPanel id="inputs">
        <section className="dir-remix">
          <div className="dir-remix-heading">
            <div>
              <span className="dir-eyebrow">MAKE IT YOURS</span>
              <h2>
                {advanced
                  ? "Your project, opened up"
                  : "Start with a little inspiration"}
              </h2>
            </div>
            <button
              disabled={editingDisabled}
              aria-pressed={advanced}
              onClick={() => {
                setToolsOpened(true);
                setAdvanced(!advanced);
              }}
            >
              {advanced ? "Back to simple" : "Open advanced editor"}
            </button>
          </div>
          <p>
            {advanced
              ? "Timing, layers, JSON and agent tools. Every change stays in this project."
              : "Pick a template, add your media, and make the words your own."}
          </p>
          {notice && <p role="status">{notice}</p>}
          {slots.length > 0 && (
            <>
              <h3>1. Add your media</h3>
              <MediaSlots slots={slots} disabled={disabled} replace={replace} />
            </>
          )}
          {isRemix ? (
            template?.id === "outfit-reveal" && (
              <p>
                Use two finished looks. Uploading a garment photo here will
                display that photo; it will not dress the character.
              </p>
            )
          ) : findMixTemplate(bundle.project.id) ? (
            <MixPlan project={bundle.project} />
          ) : findHouseTemplate(bundle.project.id) ? (
            <TemplatePlan project={bundle.project} />
          ) : (
            <p>
              This custom project is ready in the advanced editor. Choose a
              template to start another draft.
            </p>
          )}
          {title?.kind === "graphics" && "text" in title.parameters && (
            <>
              <h3>2. Make it yours</h3>
              <label>
                Headline
                <input
                  disabled={editingDisabled || title.locked}
                  maxLength={80}
                  value={String(title.parameters.text)}
                  onChange={(e) => setTitle({ text: e.target.value })}
                />
              </label>
              <div
                className="dir-caption-colors"
                role="group"
                aria-label="Headline color"
              >
                {[
                  { name: "Chalk", value: "#e4e8ed" },
                  { name: "Lime", value: "#dafa81" },
                  { name: "Peach", value: "#ffc2a1" },
                ].map((c) => (
                  <button
                    key={c.name}
                    disabled={editingDisabled || title.locked}
                    aria-pressed={title.parameters.color === c.value}
                    onClick={() => setTitle({ color: c.value })}
                  >
                    <span style={{ background: c.value }} />
                    {c.name}
                  </button>
                ))}
              </div>
              <p>
                Text updates as you type.{" "}
                {title.locked
                  ? "Unlock the headline in advanced mode to edit it."
                  : "Your timing and soundtrack stay in place."}
              </p>
            </>
          )}
          {!advanced && (
            <div className="dir-export-step">
              <h3>3. Take it with you</h3>
              <button
                className="dir-primary"
                disabled={disabled}
                onClick={exportVideo}
              >
                Export video
              </button>
              <p>
                MP4 with music, rendered on your device. Save an editable
                project above to keep working later.
              </p>
            </div>
          )}
          {!advanced && (
            <p className="dir-advanced-hint">
              Want more? Open advanced to change timing, arrange layers, edit
              JSON or use agent tools. It is the same project.
            </p>
          )}
        </section>
      </StudioPanel>
      <StudioPanel id="prompt">
        <div className="dir-remix">
          <ProjectPrompt
            key={bundle.project.id}
            bundle={bundle}
            // Each keystroke rebuilds the preview; gating on readiness would
            // disable the focused field after one character.
            disabled={editingDisabled}
          />
        </div>
      </StudioPanel>
      <StudioPanel id="templates">
        <div className="dir-remix">
          <TemplateCards
            activeId={bundle.project.id}
            disabled={disabled}
            onChoose={(id) => void choose(id).catch(report)}
          />
          <p className="dir-template-note">
            Finished cuts · no account needed. Template drafts stay here until
            you close or reload.
          </p>
        </div>
      </StudioPanel>
      <StudioPanel id="tools">
        {(shell || advanced || toolsOpened) && (
          <ProjectTools advanced={advanced} bundle={bundle}>
            {isRemix && (
              <RemixGeneration
                targetLabel={
                  template?.id === "outfit-reveal"
                    ? "the After shot"
                    : template?.id === "poster-motion"
                      ? "the poster"
                      : "both shots"
                }
                connection={connection}
                disabled={disabled}
                apply={applyGenerated}
              />
            )}
            <details>
              <summary>Video swap · LTX / ComfyUI</summary>
              <button
                disabled={disabled}
                onClick={() =>
                  void execute({
                    op: "plate",
                    revision: bundle.project.revision,
                  }).catch(report)
                }
              >
                Export clean MP4 for Comfy
              </button>
              <p>
                Export the source and first frame. Use the matching mask and
                scene-aligned edited first frame in Comfy, then import the
                finished MP4 into a media slot. Videos must cover their slot
                duration; each slot starts at source frame zero. Text and
                soundtrack remain separate.
              </p>
            </details>
            <AgentPanel
              project={bundle.project}
              disabled={disabled}
              execute={execute}
            />
            {!shell && (
              <nav aria-label="Creative apps">
                <a href="/">Generate / Swap</a>
                <a href="/dual-editor">Dual editor</a>
                <a href="/world-builder">World Builder</a>
              </nav>
            )}
          </ProjectTools>
        )}
      </StudioPanel>
    </>
  );
}

import type { Dispatch } from "react";
import { shapeLabels } from "./scene-contract";
import { Fold } from "./FloatingPanel";
import { ObjectInspector } from "./ObjectInspector";
import { CameraControls } from "./CameraControls";
import { SceneMotionControls } from "./SceneMotionControls";
import { AudioControls } from "./AudioControls";
import { CaptureControls } from "./CaptureControls";
import { RecipeControls } from "./RecipeControls";
import { Parameters } from "./Controls";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import type { BuilderAssets } from "./useBuilderAssets";
import type { RecentAudio } from "./audio-history";
import { CreatureFile } from "../scene3d/CreatureFile";
import { MotionList } from "./MotionList";
import { AvatarPlacement } from "./AvatarPlacement";
import { CREATURE_SHA256 } from "../../shared/scene/creature-reference";
import { creatureMotionReceipt } from "../scene3d/creature-fbx";
import {
  availableCharacterClips,
  characterAudioForAsset,
} from "./character-audio-options";
import { PanelDock } from "./PanelDock";
import { WorldSendToGenobi } from "./WorldSendToGenobi";
import { inComfyNode } from "./host";
import { WORLD_PROMPT_ID } from "../voice/world-prompt-target";
import {
  inspectorOpen,
  type DockAction,
  type DockPanel,
  type DockState,
} from "./panel-dock";
import type { DocumentPip } from "./useDocumentPip";
import type { Recipe } from "./recipe";

export type BuilderPanel = DockPanel;

type PanelProps = {
  s: BuilderSession;
  e: WorldEditor;
  a: BuilderAssets;
  projectAudio?: RecentAudio[];
  onCameraChange?: (recipe: Recipe) => void;
};

/** One panel's controls, wherever it is docked or popped. */
export function PanelBody({
  panel,
  s,
  e,
  a,
  projectAudio,
  folded = false,
  onCameraChange,
}: PanelProps & { panel: DockPanel; folded?: boolean }) {
  // An edit here stops Play first, so the panels stay open while it runs.
  const idle = s.ready && !s.busy && e.mode !== "walk";
  switch (panel) {
    case "camera": {
      const intent =
        (change: BuilderSession["change"]) =>
        async (patch: Partial<Recipe>) => {
          const applied = await change(patch);
          if (applied && s.api.current)
            onCameraChange?.(s.api.current.getRecipe());
          return applied;
        };
      return (
        <fieldset disabled={!idle}>
          <CameraControls
            s={
              onCameraChange
                ? { ...s, change: intent(s.change), tune: intent(s.tune) }
                : s
            }
            e={e}
            compact
          />
        </fieldset>
      );
    }
    case "audio":
      // Sound stays live in Shot, Build and Walk.
      return (
        <fieldset disabled={!s.ready || s.busy}>
          <AudioControls
            s={s}
            projectAudio={projectAudio}
            selected={e.selected}
            folded={folded}
          />
        </fieldset>
      );
    case "capture":
      return (
        <div className="wb-inspector-content">
          <CaptureControls s={s} a={a} shot={e.mode === "shot"} />
        </div>
      );
    case "object":
      return (
        <fieldset disabled={!idle}>
          <ObjectInspector s={s} e={e} />
        </fieldset>
      );
    case "scene":
      return (
        <fieldset disabled={!idle}>
          <SceneMotionControls s={s} e={e} />
          {s.recipe.avatar && <MotionList s={s} />}
          <CreatureFile
            onLoad={(pose) => {
              const motions = creatureMotionReceipt();
              const characterAudio = characterAudioForAsset(
                s.recipe.characterAudio,
                "creature",
                s.recipe.avatarAsset === "creature"
                  ? undefined
                  : availableCharacterClips("creature", motions),
              );
              s.change({
                avatar: true,
                avatarAsset: "creature",
                avatarMotion: pose ?? "idle",
                ...(characterAudio ? { characterAudio } : {}),
                creatureReference: {
                  sha256: CREATURE_SHA256,
                  motions,
                },
              });
            }}
          />
          <label>
            Scene direction
            <textarea
              id={WORLD_PROMPT_ID}
              aria-label="Scene direction"
              maxLength={4000}
              value={s.recipe.prompt}
              onChange={(ev) => s.change({ prompt: ev.target.value })}
              placeholder="What should this set become?"
            />
          </label>
          {/* The studio's agent session; inside Comfy the graph is the link. */}
          {!inComfyNode() && <WorldSendToGenobi recipe={s.recipe} />}
          <Fold title="Character placement">
            <AvatarPlacement s={s} />
          </Fold>
          <Fold title="Lighting">
            <label>
              Background
              <input
                type="color"
                value={s.recipe.background}
                onChange={(ev) => s.change({ background: ev.target.value })}
              />
            </label>
            <Parameters recipe={s.recipe} change={s.change} names={["light"]} />
          </Fold>
          {s.recipe.scene === "neuro" && (
            <Fold title="Shader">
              <Parameters
                recipe={s.recipe}
                change={s.change}
                names={["patternScale", "intensity", "speed"]}
              />
            </Fold>
          )}
          <Fold title="Objects">
            {s.recipe.scene === "stage" && (
              <label className="wb-check">
                <input
                  type="checkbox"
                  checked={s.recipe.screen !== false}
                  onChange={(ev) => s.change({ screen: ev.target.checked })}
                />
                Backdrop screen
              </label>
            )}
            <div className="wb-object-list">
              {e.objects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    e.chooseMode("edit");
                    e.select(`prop:${p.id}`);
                  }}
                >
                  {p.id}
                  <small>{shapeLabels[p.shape]}</small>
                </button>
              ))}
              {!e.objects.length && (
                <p className="wb-hint">Build → Add to place primitives.</p>
              )}
            </div>
          </Fold>
          <Fold title={inComfyNode() ? "Recipe" : "Recipe & agent controls"}>
            <RecipeControls s={s} />
          </Fold>
        </fieldset>
      );
  }
}

export function BuilderInspector({
  dock,
  dispatch,
  pip,
  ...panel
}: PanelProps & {
  dock: DockState;
  dispatch: Dispatch<DockAction>;
  pip: DocumentPip;
}) {
  // Every panel stays mounted (PanelDock moves its element, never its tree):
  // audio playback and JSON drafts survive docking, stacking and popping out.
  return (
    <aside
      id="wb-inspector"
      className="wb-panel wb-inspector"
      hidden={!inspectorOpen(dock)}
      aria-label="3D inspector"
    >
      <PanelDock
        dock={dock}
        dispatch={dispatch}
        pip={pip}
        body={(key, folded) => (
          <PanelBody panel={key} folded={folded} {...panel} />
        )}
        monitors={["audio"]}
      />
    </aside>
  );
}

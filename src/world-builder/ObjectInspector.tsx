import ThemedSelect from "../components/ThemedSelect";
import { useState } from "react";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import { NumberControl } from "./Controls";
import { faces, playgroundIds, scaledAxes } from "./scene-contract";
import { Fold } from "./FloatingPanel";
export function ObjectInspector({
  s,
  e,
}: {
  s: BuilderSession;
  e: WorldEditor;
}) {
  const [face, setFace] = useState("all");
  const t = e.transform,
    box = e.prop?.shape === "box";
  const surface = e.selected
    ? `${e.selected.startsWith("prop:") ? e.selected : `world:${e.selected}`}/${box ? face : "all"}`
    : "screen/all";
  const media = s.recipe.textures[surface];
  return (
    <>
      <label>
        Selected object
        <ThemedSelect
          aria-label="Selected scene object"
          value={e.selected}
          onChange={(event) => e.select(event.target.value)}
        >
          <option value="">Select in the scene…</option>
          {e.objects.map((p) => (
            <option key={p.id} value={`prop:${p.id}`}>
              {p.id}
            </option>
          ))}
          {s.recipe.scene === "playground" &&
            playgroundIds.map((id) => <option key={id}>{id}</option>)}
        </ThemedSelect>
      </label>
      {s.recipe.motion && t && (
        <p className="wb-hint">
          Editing the selected state. Other states keep their positions.
        </p>
      )}
      {t ? (
        <>
          <div className="wb-transform-grid">
            <span>Position</span>
            {(["x", "y", "z"] as const).map((axis) => (
              <NumberControl
                key={axis}
                label={`Position ${axis.toUpperCase()}`}
                value={t[axis]}
                min={-40}
                max={40}
                step={0.1}
                change={(v) => e.patchObject({ [axis]: v })}
              />
            ))}
          </div>
          <div className="wb-transform-grid">
            <span>Size</span>
            {(["scaleX", "scaleY", "scaleZ"] as const).map((axis, i) => (
              <NumberControl
                key={axis}
                label={`Size ${"XYZ"[i]}`}
                value={t.scale * (t[axis] ?? 1)}
                min={0.1}
                max={8}
                step={0.1}
                change={(v) => {
                  const [scaleX, scaleY, scaleZ] = scaledAxes(t);
                  e.patchObject({
                    scale: 1,
                    scaleX,
                    scaleY,
                    scaleZ,
                    [axis]: v,
                  });
                }}
              />
            ))}
          </div>
          <div className="wb-transform-grid">
            <span>Rotation °</span>
            {(["rotationX", "rotation", "rotationZ"] as const).map(
              (axis, i) => (
                <NumberControl
                  key={axis}
                  label={`Rotation ${"XYZ"[i]}`}
                  value={Math.round(((t[axis] ?? 0) * 180) / Math.PI)}
                  min={-180}
                  max={180}
                  step={1}
                  change={(v) => e.patchObject({ [axis]: (v * Math.PI) / 180 })}
                />
              ),
            )}
          </div>
          {e.prop && e.authored && (
            <>
              <label>
                Colour
                <input
                  type="color"
                  value={e.prop.color}
                  onChange={(ev) => e.patchObject({ color: ev.target.value })}
                />
              </label>
              <Fold title="Object direction">
                <textarea
                  aria-label="Object direction"
                  maxLength={1000}
                  value={e.prop.prompt}
                  onChange={(ev) => e.patchObject({ prompt: ev.target.value })}
                  placeholder="Describe this object's role…"
                />
              </Fold>
            </>
          )}
        </>
      ) : (
        <p className="wb-hint">
          Select a primitive or a Playground prop to move, rotate and stretch
          it.
        </p>
      )}
      <Fold title="Image / video texture">
        <p className="wb-hint">
          {e.selected
            ? `Assign media to ${e.selected.replace("prop:", "")}.`
            : "No selection: media goes to the studio screen."}
        </p>
        {box && (
          <label>
            Box face
            <ThemedSelect
              aria-label="Texture face"
              value={face}
              onChange={(ev) => setFace(ev.target.value)}
            >
              <option value="all">All faces</option>
              {faces.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </ThemedSelect>
          </label>
        )}
        <label className="wb-file-input">
          {media ? "Replace texture" : "Attach image or video"}
          <input
            aria-label="Surface texture file"
            type="file"
            accept="image/*,video/*"
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              if (file)
                s.run(
                  s.stopping(() => s.api.current!.setSurface(surface, file)),
                );
              ev.target.value = "";
            }}
          />
        </label>
        <small>
          {media?.name ??
            "Files stay in this tab; reattach after loading a recipe."}
        </small>
        {media && (
          <button
            onClick={() =>
              s.run(s.stopping(() => s.api.current!.clearSurface(surface)))
            }
          >
            Remove texture
          </button>
        )}
      </Fold>
      {e.prop && e.authored && (
        <button className="wb-danger" onClick={e.remove}>
          Delete selected primitive
        </button>
      )}
    </>
  );
}

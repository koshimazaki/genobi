import ThemedSelect from "../components/ThemedSelect";
import { creatureSlot, LOCAL_MOTIONS, motionLabel } from "./creature-slots";
import type { CharacterPose } from "../../shared/scene/characters";
import { CHARACTER_MODELS } from "../../shared/scene/character-catalog";
import { creatureMotions, importCreatureMotion } from "./creature-fbx";
import { useState } from "react";
import "./creature.css";
import { importCreature, localCreature } from "./creature";

export function CreatureFile({
  onLoad,
}: {
  onLoad: (pose?: CharacterPose) => void;
}) {
  const [slot, setSlot] = useState<CharacterPose>("idle");
  const [preview, setPreview] = useState<CharacterPose>("idle");
  const [motion, setMotion] = useState("");
  const [loaded, setLoaded] = useState(() => Boolean(localCreature()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <details className="s3d-fold s3d-creature">
      <summary>Creature model & motion</summary>
      <div className="s3d-fold-body">
        <label>
          Load creature VRM · this tab only
          <input
            type="file"
            accept=".vrm"
            disabled={busy || loaded}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              setError("");
              try {
                await importCreature(file);
                setLoaded(true);
                onLoad();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Creature could not load.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <p role="status">
          {busy
            ? "Loading creature…"
            : loaded
              ? "Creature ready · original materials, local motion. Reopen the file after refreshing."
              : "Use the original Creature VRM. It stays on this device; exports record its fingerprint without bundling model or motion files. Scene JSON records the asset and pose."}
        </p>
        {loaded && (
          <>
            <label>
              Load FBX motion pack
              <input
                type="file"
                accept=".fbx"
                multiple
                disabled={busy}
                onChange={async (event) => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = "";
                  if (!files.length) return;
                  setBusy(true);
                  setError("");
                  let selected: CharacterPose | undefined;
                  try {
                    if (files.length > 16)
                      throw new Error("Choose up to 16 motion files.");
                    for (const file of files) {
                      const pose = creatureSlot(file.name);
                      if (!pose)
                        throw new Error(
                          "Unrecognized motion name. Assign that FBX to a motion slot below.",
                        );
                      await importCreatureMotion(file, pose);
                      selected = pose;
                    }
                    selected = creatureMotions.has("idle") ? "idle" : selected;
                    setMotion(`${files.length} motion files attached`);
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Motion pack could not load.",
                    );
                  } finally {
                    if (selected) {
                      setPreview(selected);
                      onLoad(selected);
                    }
                    setBusy(false);
                  }
                }}
              />
            </label>
            <label>
              Creature motion slot
              <ThemedSelect
                aria-label="Creature motion slot"
                value={slot}
                onChange={(e) => setSlot(e.target.value as CharacterPose)}
              >
                {Object.keys(CHARACTER_MODELS.creature.clips).map((p) => (
                  <option key={p} value={p}>
                    {motionLabel(p)}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            <label>
              Assign FBX animation
              <input
                type="file"
                accept=".fbx"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  setError("");
                  try {
                    await importCreatureMotion(file, slot);
                    setMotion(`${slot} assigned`);
                    setPreview(slot);
                    onLoad(slot);
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Motion could not load.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            <p role="status">
              {motion ||
                "Idle, talk, walk, interact, punch, spell and dance use bundled motion until you assign an FBX. Run, fly, backflip, jump, ninja and twist need an FBX."}
            </p>
            <label>
              Preview creature motion
              <ThemedSelect
                aria-label="Preview creature motion"
                value={preview}
                onChange={(e) => {
                  const pose = e.target.value as CharacterPose;
                  setPreview(pose);
                  onLoad(pose);
                }}
              >
                {Object.keys(CHARACTER_MODELS.creature.clips)
                  .filter(
                    (p) =>
                      !LOCAL_MOTIONS.includes(p as CharacterPose) ||
                      creatureMotions.has(p as CharacterPose),
                  )
                  .map((p) => (
                    <option key={p} value={p}>
                      {motionLabel(p)}
                    </option>
                  ))}
              </ThemedSelect>
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}

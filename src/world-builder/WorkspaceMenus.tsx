import ThemedSelect from "../components/ThemedSelect";
import { menuPreset, presetMenu, SHADER_PRESET } from "./preset-menu";
import { NAMED_TAKES } from "./named-takes";
import { applyNamedTake } from "./apply-take";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import { CREATURE_SHA256 } from "../../shared/scene/creature-reference";
import { creatureMotionReceipt } from "../scene3d/creature-fbx";

export function WorkspaceMenus({
  s,
  e,
  onCreature,
}: {
  s: BuilderSession;
  e: WorldEditor;
  onCreature: () => void;
}) {
  // A preset or character change stops Play first (chooseMode, change).
  const disabled = !s.ready || s.busy || e.mode === "walk";
  return (
    <div className="wb-workspace-menus">
      <label title="Loading a preset replaces the whole set">
        Load preset
        <ThemedSelect
          aria-label="Load preset"
          value=""
          disabled={disabled}
          onChange={(ev) => {
            const value = ev.target.value;
            // A named take brings its moves, shot and dry sound with it.
            if (value.startsWith("take:")) {
              e.chooseMode("shot");
              s.run(() => applyNamedTake(s, value.slice(5)));
              return;
            }
            e.preset(
              value === SHADER_PRESET
                ? { ...s.recipe, scene: "neuro" }
                : menuPreset(value),
            );
          }}
        >
          <option value="" disabled>
            Replace the set with…
          </option>
          {presetMenu().map((name) => (
            <option key={name}>{name}</option>
          ))}
          {NAMED_TAKES.map((take) => (
            <option key={take.id} value={`take:${take.id}`}>
              {take.name} · take
            </option>
          ))}
        </ThemedSelect>
      </label>
      <label>
        Character
        <ThemedSelect
          aria-label="Scene character"
          value={s.recipe.avatar ? s.recipe.avatarAsset : "none"}
          disabled={!s.ready || s.busy || s.recipe.scene === "neuro"}
          onChange={(ev) => {
            const value = ev.target.value;
            s.change({
              avatar: value !== "none",
              avatarAsset:
                value === "blob"
                  ? "blob"
                  : value === "pug"
                    ? "pug"
                    : value === "creature"
                      ? "creature"
                      : "mannequin",
              avatarMotion: "idle",
              creatureReference:
                value === "creature"
                  ? {
                      sha256: CREATURE_SHA256,
                      motions: creatureMotionReceipt(),
                    }
                  : null,
            });
            if (value === "creature") onCreature();
          }}
        >
          <option value="none" disabled={e.mode === "walk"}>
            No character
          </option>
          <option value="mannequin">Neutral mannequin</option>
          <option value="creature">Our creature · VRM</option>
          <option value="pug">Dog · Pug</option>
          <option value="blob">Blob · theme colour</option>
        </ThemedSelect>
      </label>
    </div>
  );
}

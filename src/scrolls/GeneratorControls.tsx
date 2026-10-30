import ThemedSelect from "../components/ThemedSelect";
import { RUN_TITLE } from "../components/ImageControls";
import {
  scrollEntry,
  scrollRun,
  scrollModels,
  type ScrollEntryId,
} from "../../shared/scrolls/generator";
import { menuId } from "../../shared/registry";
import type { useScrolls } from "./useScrolls";

/**
 * The generator's model row, drawn from the held registry entry as the
 * Camera's image row is: Run (open graph or API) where Klein offers both,
 * then the ratios and tiers that entry takes. A choice is refitted
 * (`fitGenerator`) so the row and the quoted request agree.
 */
export function GeneratorControls({ s }: { s: ReturnType<typeof useScrolls> }) {
  const g = s.generator,
    entry = scrollEntry(g.entry),
    run = scrollRun(g.entry),
    disabled = s.busy || !!s.pending;
  const choose = (patch: Partial<typeof g>) =>
    s.setGenerator({ ...g, ...patch });
  return (
    <>
      <label>
        Image model
        <ThemedSelect
          value={menuId(entry)}
          disabled={disabled}
          onChange={(e) => choose({ entry: e.target.value as ScrollEntryId })}
        >
          {scrollModels().map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </ThemedSelect>
      </label>
      {run && (
        <label title={RUN_TITLE}>
          Run
          <ThemedSelect
            value={run.held}
            disabled={disabled}
            onChange={(e) =>
              choose({
                entry: (e.target.value === "api" ? run.api : run.open)
                  .id as ScrollEntryId,
              })
            }
          >
            <option value="open">Open · Comfy</option>
            <option value="api">API · BFL</option>
          </ThemedSelect>
        </label>
      )}
      <label>
        Aspect
        <ThemedSelect
          value={g.imageAspectRatio}
          disabled={disabled}
          onChange={(e) =>
            choose({
              imageAspectRatio: e.target.value as typeof g.imageAspectRatio,
            })
          }
        >
          {entry.controls.aspectRatios.map((ratio) => (
            <option key={ratio} value={ratio}>
              {ratio === "auto" ? "Auto" : ratio}
            </option>
          ))}
        </ThemedSelect>
      </label>
      <label>
        Size
        <ThemedSelect
          value={g.imageResolution}
          disabled={disabled}
          onChange={(e) =>
            choose({
              imageResolution: e.target.value as typeof g.imageResolution,
            })
          }
        >
          {entry.controls.resolutions.map((size) => (
            <option key={size} value={size}>
              {size === "768sq" ? "768 px" : size.toUpperCase()}
            </option>
          ))}
        </ThemedSelect>
      </label>
    </>
  );
}

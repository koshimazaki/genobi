/**
 * The Sound tab's mod matrix: each row routes one audio band to one target's
 * property, with amount, gate, smoothing and invert. Self-contained, so a
 * Sound panel only has to render it.
 *
 * Ported from Holodeck's ModMatrixEditor (src/components/audio/ModMatrixEditor.tsx,
 * MIT; notice in Holodeck-LICENSE.txt), restyled with Genobi's controls.
 */
import ThemedSelect from "../components/ThemedSelect";
import Icon from "../components/Icon";
import type { Recipe } from "./recipe";
import { sceneObjects } from "./scene-instances";
import {
  MAX_ROUTES,
  MOD_SOURCES,
  PROPERTY_LABELS,
  ROUTE_RANGES,
  createRoute,
  propertiesForTarget,
  targetForSelection,
  targetOptions,
  type ModRoute,
  type ModSource,
} from "./mod-routes";
import "./mod-matrix.css";

const SOURCE_LABELS: Record<ModSource, string> = {
  sub: "Sub",
  low: "Low",
  mid: "Mid",
  high: "High",
  level: "Lvl",
};

export function ModMatrixEditor({
  recipe,
  frame,
  selected = "",
  change,
}: {
  recipe: Recipe;
  /** The previewed frame, for the source meters. */
  frame: number;
  /** The editor's selection (`prop:<id>` or a set piece id), for Route selected. */
  selected?: string;
  change: (patch: Partial<Recipe>) => void;
}) {
  const routes = recipe.audioRoutes;
  const options = targetOptions(
    sceneObjects(recipe).map((p) => p.id),
    recipe.scene === "playground",
  );
  const routeTarget = targetForSelection(selected);
  const set = (next: ModRoute[]) => change({ audioRoutes: next });
  const update = (id: string, patch: Partial<ModRoute>) =>
    set(routes.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const levels = Object.fromEntries(
    MOD_SOURCES.map((source) => {
      const data =
        source === "level"
          ? recipe.envelope
          : (recipe.bandEnvelopes[source] ?? []);
      return [source, data[frame] ?? 0];
    }),
  ) as Record<ModSource, number>;
  return (
    <div className="wb-mod-matrix">
      {routes.length === 0 && (
        <p className="wb-hint">No routes. Add one to drive the set.</p>
      )}
      {routes.map((route, i) => (
        <RouteRow
          key={route.id}
          n={i + 1}
          route={route}
          levels={levels}
          options={
            options.some((o) => o.value === route.target)
              ? options
              : [...options, { value: route.target, label: route.target }]
          }
          update={(patch) => update(route.id, patch)}
          remove={() => set(routes.filter((r) => r.id !== route.id))}
        />
      ))}
      <button
        disabled={routes.length >= MAX_ROUTES}
        onClick={() =>
          set([
            ...routes,
            createRoute(routeTarget ? { target: routeTarget } : {}, routes),
          ])
        }
      >
        <Icon name="plus" size={13} />
        {routeTarget
          ? `Route selected · ${routeTarget.replace(/^\w+:/, "")}`
          : "Add route"}
      </button>
    </div>
  );
}

function RouteRow({
  n,
  route,
  levels,
  options,
  update,
  remove,
}: {
  n: number;
  route: ModRoute;
  levels: Record<ModSource, number>;
  options: { value: string; label: string }[];
  update: (patch: Partial<ModRoute>) => void;
  remove: () => void;
}) {
  const properties = propertiesForTarget(route.target);
  return (
    <div className="wb-mod-route" data-enabled={route.enabled}>
      <div className="wb-mod-route-head">
        <input
          type="checkbox"
          aria-label={`Route ${n} on`}
          checked={route.enabled}
          onChange={(ev) => update({ enabled: ev.target.checked })}
        />
        <div
          className="wb-mod-sources"
          role="radiogroup"
          aria-label={`Route ${n} source`}
        >
          {MOD_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              role="radio"
              aria-checked={route.source === source}
              onClick={() => update({ source })}
            >
              {SOURCE_LABELS[source]}
              <span
                aria-hidden
                style={{
                  transform: `scaleX(${Math.max(0.03, levels[source])})`,
                }}
              />
            </button>
          ))}
        </div>
        <button aria-label={`Delete route ${n}`} onClick={remove}>
          <Icon name="close" size={13} />
        </button>
      </div>
      <div className="wb-mod-route-target">
        <ThemedSelect
          aria-label={`Route ${n} target`}
          value={route.target}
          onChange={(ev) => {
            const target = ev.target.value;
            const valid = propertiesForTarget(target);
            update({
              target,
              property: valid.includes(route.property)
                ? route.property
                : valid[0],
            });
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </ThemedSelect>
        <ThemedSelect
          aria-label={`Route ${n} property`}
          value={route.property}
          onChange={(ev) =>
            update({ property: ev.target.value as ModRoute["property"] })
          }
        >
          {properties.map((p) => (
            <option key={p} value={p}>
              {PROPERTY_LABELS[p]}
            </option>
          ))}
        </ThemedSelect>
        <button
          aria-label={`Route ${n} invert`}
          aria-pressed={route.invert}
          onClick={() => update({ invert: !route.invert })}
        >
          Inv
        </button>
      </div>
      <div className="wb-mod-route-sliders">
        {(
          [
            ["amount", "Amount"],
            ["threshold", "Gate"],
            // 1 follows the track exactly; lower values smooth it.
            ["lerp", "Response"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <span>
              {label} <output>{route[key].toFixed(2)}</output>
            </span>
            <input
              type="range"
              aria-label={`Route ${n} ${label.toLowerCase()}`}
              {...ROUTE_RANGES[key]}
              value={route[key]}
              onChange={(ev) => update({ [key]: ev.target.valueAsNumber })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

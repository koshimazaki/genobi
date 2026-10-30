import {
  findHouseTemplate,
  findMixTemplate,
} from "../../shared/templates/catalogue";
import { loadExample, type Bundle } from "./bundle";
import { loadHouseTemplate } from "./house-template";
import { loadMixTemplate } from "./mix-template";
import { findShowcase, loadShowcase } from "./showcase";

/** One shared runtime initializes Director and Editor: both start with this cut. */
export const DEFAULT_DIRECTOR_TEMPLATE = "dimensions-mix";

/** Resolve the URL independently of gallery visibility; old template links survive. */
export function directorRoute(search: string) {
  const params = new URLSearchParams(search);
  const showcase = params.get("showcase");
  if (showcase) {
    const version = Number(params.get("version"));
    const entry = findShowcase(showcase)?.versions.find(
      (v) => v.version === version,
    );
    if (!entry) throw new Error("This showcase version is unavailable.");
    return {
      id: entry.projectId,
      explicit: true,
      load: () => loadShowcase(showcase, version),
    };
  }
  const example = params.get("example") ?? DEFAULT_DIRECTOR_TEMPLATE;
  const wrap = async (promise: Promise<Bundle>) => ({
    bundle: await promise,
    note: "",
  });
  if (example === "studio")
    return {
      id: "signal-studies",
      explicit: true,
      load: () => wrap(loadExample()),
    };
  const mix = findMixTemplate(example);
  const house = findHouseTemplate(example);
  if (!mix && !house) throw new Error("This template is unavailable.");
  return {
    id: example,
    explicit: params.has("example"),
    load: () =>
      wrap(mix ? loadMixTemplate(mix) : loadHouseTemplate(house!, search)),
  };
}

/** Choosing a template replaces a showcase route while keeping the workspace. */
export function templateAddress(id: string, current: string) {
  const url = new URL(current);
  url.searchParams.set("example", id);
  for (const key of ["template", "showcase", "version"])
    url.searchParams.delete(key);
  return url;
}

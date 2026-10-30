import { AppError } from "../../server/errors";

/**
 * Where the `workflow` route runs Genobi's graphs: Comfy Cloud (through the
 * official SDK, `server/comfy-sdk.ts`), a local ComfyUI (through its own HTTP
 * API, `server/comfy-local.ts`), or a Comfy API deployment (a Comfy Developer
 * Platform deployment, `https://{name}.run.comfy.app`, through the same SDK
 * with its own base URL). A session picks Local or Cloud as its run location
 * (`shared/comfy/run-location.ts`); a deployment is the server's default,
 * or the host of a template that lists it among its `hosts`.
 */
export const CLOUD_BASE = "https://cloud.comfy.org";

export type WorkflowDestination =
  | { kind: "cloud" }
  | { kind: "deployment"; url: string }
  | { kind: "local"; url: string };
/** Where a run went: a destination setting, or a pinned template's host. */
export type DestinationKind = WorkflowDestination["kind"];

/**
 * Run locations an earlier build recorded on a take and this one has no
 * client for: Runware Serverless, removed on 28 October 2026 (Comfy
 * deployments host the swap). A stored job or quote that names one still
 * loads; a run there is refused by `notConfigured`, and a stored job is
 * closed by `closeRetired` (`server/keys.ts`), never sent anywhere.
 */
const RETIRED_LOCATIONS: ReadonlySet<string> = new Set(["runware"]);
export const isRetiredLocation = (value: unknown) =>
  typeof value === "string" && RETIRED_LOCATIONS.has(value);
/** Said of a run, or a quote, recorded at a retired location. */
export const RETIRED_LOCATION_MESSAGE =
  "This run went to a host Genobi no longer supports, so it cannot be read here. Check your usage with that provider before starting another.";

export const DEFAULT_DESTINATION: WorkflowDestination = { kind: "cloud" };
const MAX_URL = 2048;
const LOOPBACK = new Set(["127.0.0.1", "localhost"]);
const SAFE_PATH = /^\/[A-Za-z0-9._~/-]*$/;

const invalid = (message: string) =>
  new AppError(400, message, "invalid_destination");

/**
 * Reads a destination setting. A deployment URL must be https on its documented Comfy
 * host; a local URL must be http on 127.0.0.1 or localhost. Neither may carry
 * credentials, a query or a fragment, and the URL is returned in its parsed,
 * normalised form without a trailing slash.
 */
export function parseWorkflowDestination(
  kind: unknown,
  url?: unknown,
): WorkflowDestination {
  if (kind === undefined || kind === "" || kind === "cloud")
    return DEFAULT_DESTINATION;
  if (kind !== "deployment" && kind !== "local")
    throw invalid(
      "The workflow destination must be cloud, deployment or local.",
    );
  if (typeof url !== "string" || !url || url.length > MAX_URL)
    throw invalid("The workflow destination needs a URL.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid("The workflow destination URL is not a URL.");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    /[?#@]/.test(url) ||
    !SAFE_PATH.test(parsed.pathname) ||
    parsed.pathname.split("/").includes("..")
  )
    throw invalid(
      "The workflow destination URL may not carry credentials, a query or a fragment.",
    );
  if (kind === "local") {
    if (parsed.protocol !== "http:" || !LOOPBACK.has(host))
      throw invalid(
        "A local destination must be http://127.0.0.1 or http://localhost.",
      );
  } else if (
    !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.run\.comfy\.app\/?$/i.test(
      url,
    ) ||
    parsed.protocol !== "https:" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.run\.comfy\.app$/.test(host) ||
    parsed.port !== "" ||
    parsed.pathname !== "/"
  )
    throw invalid(
      "A Comfy deployment must be https://<deployment>.run.comfy.app with no port or path.",
    );
  const normalised = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  return { kind, url: normalised };
}

/** Said when a run reaches a destination this build cannot submit to. */
export const notConfigured = (destination: {
  kind: DestinationKind;
  url?: string;
}) =>
  new AppError(
    503,
    destination.kind === "local"
      ? "Workflows are set to run on a local ComfyUI, which this server has no client for. Nothing was sent or charged."
      : isRetiredLocation(destination.kind)
        ? "This workflow was set to run on a host Genobi no longer supports. Nothing was sent or charged."
        : "This workflow runs on a Comfy API deployment, and none is set: name its https URL in GENOBI_DEPLOYMENT_URL. Nothing was sent or charged.",
    "workflow_not_configured",
  );

const MODEL_FILE =
  /^(?:[A-Za-z0-9][A-Za-z0-9._ -]{0,127}\/){0,4}[A-Za-z0-9][A-Za-z0-9._ -]{0,127}\.(?:safetensors|gguf)$/;

/**
 * A model file a local ComfyUI loads, such as `GENOBI_KLEIN_MODEL`: the name
 * ComfyUI lists for it, relative to its own model folder (or a folder its
 * `extra_model_paths.yaml` adds), like `flux3/klein-int8.safetensors`. A
 * ComfyUI loader never takes an absolute path, so neither does this: no
 * leading slash, drive, `..`, backslash or control character, at most five
 * segments, ending in `.safetensors` or `.gguf`. Unset is undefined. The
 * refusal never repeats the value, so a mistyped path stays out of logs.
 */
export function parseModelFile(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    !MODEL_FILE.test(value) ||
    value.split("/").some((part) => part === "." || part === "..")
  )
    throw invalid(
      "The local model file must be a .safetensors or .gguf name inside ComfyUI's model folders, such as flux3/klein.safetensors.",
    );
  return value;
}

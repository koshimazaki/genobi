/**
 * Why a Comfy Cloud run failed, in Genobi's own words. The SDK's `job.error`
 * (`JobError`: `code`, `message`, `node_id`, `class_type`, `traceback`) is
 * provider text and may carry paths or custom-node output, so none of it is
 * shown as written (`ProviderResult.error`): the message is only matched
 * against a few known causes, and the failing node's class is shown only when
 * it reads as a plain node identifier.
 */
export interface RunFailure {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly class_type?: unknown;
}

const NODE_CLASS = /^[A-Za-z][A-Za-z0-9_.+-]{0,63}$/;

const CAUSES: { test: RegExp; words: string; hint?: string }[] = [
  {
    test: /out of memory|\boom\b|allocation on device/i,
    words: "ran out of GPU memory",
    hint: " Try a smaller size.",
  },
  {
    test: /value not in list|not found|no such file|does not exist|missing/i,
    words: "could not find a model, node or file the workflow needs",
  },
  {
    test: /moderat|safety|nsfw|content polic/i,
    words: "refused the request on content grounds",
  },
  {
    test: /invalid|validation|required input|bad request/i,
    words: "rejected an input the workflow sent",
  },
];

/** A user-facing line for a failed run, or undefined for the generic one. */
export function runFailure(
  error: RunFailure | null | undefined,
  provider = "Comfy Cloud",
) {
  if (!error || typeof error !== "object") return undefined;
  const text = [error.code, error.message]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  const node =
    typeof error.class_type === "string" && NODE_CLASS.test(error.class_type)
      ? error.class_type
      : undefined;
  const cause = CAUSES.find(({ test }) => test.test(text));
  if (!cause && !node) return undefined;
  const at = node ? ` at the ${node} node` : "";
  return cause
    ? `${provider} ${cause.words}${at}.${cause.hint ?? ""}`
    : `${provider} stopped this run${at}. Nothing was saved.`;
}

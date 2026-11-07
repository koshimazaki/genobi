import { StudioError, type GenobiApi } from "./api";

export interface OperationCheck {
  tool: string;
  feature?: string;
  runtime?: string;
  supported: boolean | null;
  ready: boolean | null;
  reason?: string;
  next?: string;
}
/** Also names the independently delivered media/export contracts; absence is unknown. */
export function operationFeature(tool: string) {
  if (tool === "genobi_project_media") return "projectMediaOperations";
  if (
    ["genobi_project_media_stage", "genobi_project_media_receipt"].includes(
      tool,
    )
  )
    return "projectMediaStaging";
  if (tool === "genobi_export") return "browserExport";
  if (tool === "genobi_world") return "worldControl";
  if (tool === "genobi_world_recipe") return "worldRecipe";
  if (tool.startsWith("genobi_voice_")) return "voice";
  if (tool === "genobi_audio_analysis") return "audioAnalysis";
  if (tool.startsWith("genobi_media_")) return "mediaTools";
  if (
    [
      "genobi_projects",
      "genobi_project",
      "genobi_link_project",
      "genobi_director_command",
      "genobi_take_to_project",
      "genobi_project_feedback",
    ].includes(tool)
  )
    return "projects";
  return undefined;
}

interface Manifest {
  schemaVersion?: unknown;
  runtime?: unknown;
  features?: Record<string, { supported?: unknown; reason?: unknown }>;
}
const short = (value: unknown, fallback: string) =>
  typeof value === "string" ? value.slice(0, 300) : fallback;

/** Read-only, freshly checked; a positive answer never replaces the server's mutation guards. */
export async function diagnoseOperation(
  api: Pick<GenobiApi, "get">,
  tool: string,
  args: Record<string, unknown>,
  inspectExportTarget = true,
): Promise<OperationCheck> {
  const feature = operationFeature(tool);
  const result: OperationCheck = {
    tool,
    ...(feature ? { feature } : {}),
    supported: null,
    ready: null,
  };
  if (!feature)
    return {
      ...result,
      reason: "No runtime-specific check is registered for this tool.",
      next: "Read its schema and documented status/quote requirements; this is not a readiness claim.",
    };
  let manifest: Manifest;
  try {
    manifest = await api.get("/api/capabilities");
  } catch (error) {
    if (!(error instanceof StudioError && error.status === 404)) throw error;
    return {
      ...result,
      reason: "The connected studio does not expose runtime capabilities.",
      next: "Update the local Genobi server and plugin together, then check again.",
    };
  }
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    !["local", "hosted"].includes(String(manifest.runtime)) ||
    !manifest.features ||
    typeof manifest.features !== "object"
  )
    return {
      ...result,
      reason: "The runtime capability response is missing or incompatible.",
      next: "Update the server and plugin together; do not infer support from the offline catalogue.",
    };
  result.runtime = String(manifest.runtime);
  const entry = Object.hasOwn(manifest.features, feature)
    ? manifest.features[feature]
    : undefined;
  if (entry?.supported !== true)
    return {
      ...result,
      supported: entry?.supported === false ? false : null,
      // Undeclared is unknown, not unready: only a declared refusal is false.
      ready: entry?.supported === false ? false : null,
      reason: short(
        entry?.reason,
        `The ${result.runtime} runtime does not advertise ${feature}.`,
      ),
      next:
        result.runtime === "hosted"
          ? "Use the local Genobi server for this operation. A paired hosted runner does not supply local project/media or browser control."
          : "Update this studio to a build implementing the operation; check status again.",
    };
  result.supported = true;
  result.ready = true;
  if (feature === "voice" && tool === "genobi_voice_transcribe") {
    const status = await api.get<{ available?: boolean; setup?: string }>(
      "/api/voice/status",
    );
    if (status.available !== true)
      return {
        ...result,
        ready: false,
        reason: "Local transcription is not ready.",
        next: short(
          status.setup,
          "Open Studio settings → Voice and finish local setup.",
        ),
      };
  }
  if (
    feature === "mediaTools" &&
    tool !== "genobi_media_tools" &&
    tool !== "genobi_media_probe"
  ) {
    const status = await api.get<{ ffmpeg?: boolean }>("/api/media/tools");
    if (status.ffmpeg !== true)
      return {
        ...result,
        ready: false,
        reason: "Local media processing needs ffmpeg.",
        next: "Install ffmpeg on the studio machine and restart the local server.",
      };
  }
  if (feature === "worldControl" && args.action === "command") {
    if (typeof args.session !== "string")
      return {
        ...result,
        ready: false,
        reason: "No World tab is paired.",
        next: "Open World Builder, link its one-use code (or studio grant), and use the returned session.",
      };
    let status: { connected?: boolean };
    try {
      status = await api.get<{ connected?: boolean }>(
        `/api/world/${encodeURIComponent(args.session)}/status`,
      );
    } catch (error) {
      if (!(error instanceof StudioError && error.status === 404)) throw error;
      return {
        ...result,
        ready: false,
        reason: "That World session is unknown, expired or not yours.",
        next: "Open World Builder, link its one-use code (or studio grant) again, and use the new session.",
      };
    }
    if (status.connected !== true)
      return {
        ...result,
        ready: false,
        reason: "The paired World tab is not responding.",
        next: "Bring that tab to the foreground or pair its replacement. Read its current revision before editing.",
      };
  }
  if (
    feature === "browserExport" &&
    args.action === "request" &&
    inspectExportTarget
  ) {
    const { targets } = await api.get<{
      targets: {
        tabId: string;
        source: { kind: string; id: string; revision: number };
        formats: string[];
      }[];
    }>("/api/exports/targets");
    const target = targets?.find((t) => t.tabId === args.tabId);
    const source = args.source as
      NonNullable<typeof target>["source"] | undefined;
    if (!target)
      return {
        ...result,
        ready: false,
        reason:
          "The requested export browser is not connected or linked to this session.",
        next: "Open the exact Director/Scroll document, link it, then read export targets. Headless export is unavailable.",
      };
    if (
      !source ||
      source.kind !== target.source.kind ||
      source.id !== target.source.id ||
      source.revision !== target.source.revision
    )
      return {
        ...result,
        ready: false,
        reason: "The export source has changed.",
        next: "Read targets again and preserve the person's latest document/revision.",
      };
    if (!target.formats.includes(String(args.format)))
      return {
        ...result,
        ready: false,
        reason: "This browser target does not support that format.",
        next: "Choose a format listed by export targets.",
      };
  }
  return result;
}

export async function preflightOperation(
  api: GenobiApi,
  tool: string,
  args: Record<string, unknown>,
) {
  if (!operationFeature(tool)) return;
  // Export replays are looked up by requestId before live-tab checks on the
  // server. Only explicit diagnostics inspect a new export's target here;
  // blocking a replay because its tab closed would hide a completed receipt.
  const check = await diagnoseOperation(api, tool, args, false);
  // Refuse only what is known to fail. An unknown answer (an older server
  // without the manifest or this feature) goes on to the server's own guards,
  // so a newer plugin never blocks an operation an older server still runs.
  if (check.supported === false || check.ready === false)
    throw new StudioError(
      `${check.reason} ${check.next}`,
      409,
      "capability_unavailable",
    );
}

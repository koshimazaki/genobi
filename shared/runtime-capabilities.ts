import {
  HOSTED_DEPLOY_INPUT_BYTES,
  LOCAL_DEPLOY_INPUT_BYTES,
} from "./comfy/deploy-file";

/**
 * Runtime support, not installation or credential readiness. Agents should
 * follow the status routes before choosing a tool, then quote before spending.
 * Keeping this free of Node/DOM APIs makes both HTTP adapters authoritative.
 */
export function runtimeCapabilities(runtime: "local" | "hosted") {
  const local = runtime === "local";
  const localFeature = (routes: string[], statusRoute?: string) => ({
    supported: local,
    routes: local ? routes : [],
    ...(local && statusRoute ? { statusRoute } : {}),
    ...(!local ? { reason: "Requires the local Genobi server." } : {}),
  });
  return {
    schemaVersion: 1,
    runtime,
    readiness: "Read status routes; supported does not mean configured.",
    runLocations: local
      ? ["local", "cloud", "both", "deployment"]
      : ["cloud", "deployment"],
    limits: {
      deploymentInputBytes: local
        ? LOCAL_DEPLOY_INPUT_BYTES
        : HOSTED_DEPLOY_INPUT_BYTES,
    },
    agentAccess: {
      mcp: "local-stdio",
      cli: "local-http",
      hosted: "paired-agent-relay",
      statusRoute: "/api/agent/status",
      note: "The bundled MCP and CLI connect to the local server. Hosted agent sessions use a paired local runner.",
    },
    features: {
      effectsCatalogue: {
        supported: true,
        routes: ["GET /api/effects", "POST /api/effects/variants"],
        persistence: "Returned configuration only; save it explicitly.",
        application: "Browser Editor, or local project commands.",
      },
      generation: {
        supported: true,
        routes: [
          "POST /api/quotes",
          "POST /api/jobs",
          "GET /api/jobs/:id",
          "GET /api/takes/:id",
          "GET /api/history",
        ],
        statusRoute: "/api/health",
        quoteBeforeSubmit: true,
      },
      workflows: {
        supported: true,
        routes: [
          "GET /api/settings/run-location",
          "POST /api/settings/run-location",
          "GET /api/settings/workflows",
          "POST /api/settings/workflows/selection",
          "POST /api/settings/deployment-assets/:token",
        ],
        statusRoute: "/api/settings/run-location",
      },
      projects: localFeature([
        "GET /api/projects",
        "GET /api/projects/:id",
        "GET /api/projects/:id/files/:sha256",
        "POST /api/projects/:id/commands",
      ]),
      worldRecipe: localFeature([
        "GET /api/projects/:id/world-recipe",
        "POST /api/projects/:id/world-recipe",
      ]),
      voice: localFeature(
        ["GET /api/voice/status", "POST /api/voice/transcribe"],
        "/api/voice/status",
      ),
      audioAnalysis: localFeature(
        ["GET /api/audio/status", "POST /api/audio/analyze"],
        "/api/audio/status",
      ),
      mediaTools: localFeature(
        [
          "GET /api/media/tools",
          "GET /api/media/:id/probe",
          "POST /api/media/:operation",
        ],
        "/api/media/tools",
      ),
      editor: { supported: true, execution: "browser", headlessExport: false },
      worldCapture: {
        supported: true,
        execution: "browser",
        headlessCapture: false,
      },
    },
  };
}

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { galleryPage } from "../shared/gallery/page";
import { createApp } from "./app";
import { ComfySdkWorkflows } from "./comfy-sdk";
import { DEFAULT_LOCAL_URL, LocalComfyWorkflows } from "./comfy-local";
import { WorkflowDestinations } from "./workflow-destinations";
import { parseWorkflowDestination } from "../shared/comfy/destination";
import { parseLocalModels } from "../shared/comfy/local-models";
import { ServerKeys } from "./keys";
import { macKeychain } from "./keychain";
import { RESTARTABLE_VARIABLE, RESTART_EXIT_CODE } from "./server-restart";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local port.");
// The default run location: Comfy Cloud unless the operator names a local
// ComfyUI (http on 127.0.0.1 or localhost) or a Comfy API deployment (https,
// which refuses unsent in this build). Each session may switch between Local
// and Cloud (server/workflow-settings.ts); Local uses GENOBI_WORKFLOW_URL when
// it is the default, and ComfyUI's own default address otherwise.
const destination = parseWorkflowDestination(
  process.env.GENOBI_WORKFLOW_DESTINATION,
  process.env.GENOBI_WORKFLOW_URL,
);
// The model files a local ComfyUI loads, by workflow and slot, named as
// ComfyUI lists them. GENOBI_KLEIN_MODEL still names Klein's. Never printed.
const local = new LocalComfyWorkflows({
  url: destination.kind === "local" ? destination.url : DEFAULT_LOCAL_URL,
  models: parseLocalModels(
    process.env.GENOBI_LOCAL_MODELS,
    process.env.GENOBI_KLEIN_MODEL,
  ),
});
// A Comfy API deployment (a Comfy Developer Platform deployment's https URL):
// the default destination when it is one, else GENOBI_DEPLOYMENT_URL, which
// serves the templates that name it as a host (the Openjutsu swap) while the
// rest keep the session's location.
const deployment =
  destination.kind === "deployment"
    ? destination
    : process.env.GENOBI_DEPLOYMENT_URL
      ? parseWorkflowDestination(
          "deployment",
          process.env.GENOBI_DEPLOYMENT_URL,
        )
      : undefined;
const {
  app,
  service,
  projects,
  voice,
  voiceInstaller,
  audio,
  agents,
  development,
  activity,
  runner,
} = await createApp({
  directory: path.join(root, ".local"),
  publicDirectory: path.join(root, "public"),
  // One Comfy key serves all generation; a BFL key is the optional advanced
  // slot for upscale. The environment wins over a key saved in the Keychain.
  keys: ServerKeys.fromEnvironment(
    process.env,
    process.platform === "darwin" ? macKeychain() : undefined,
  ),
  workflows: new WorkflowDestinations(new ComfySdkWorkflows(), {
    local,
    deployment:
      deployment && new ComfySdkWorkflows({ destination: deployment }),
  }),
  runLocation: { destination, local },
  agent: { studioOrigin: `http://127.0.0.1:${port}` },
  // Only under scripts/dev-server.mjs, which starts the server again.
  restart:
    process.env[RESTARTABLE_VARIABLE] === "1"
      ? () => shutdown(RESTART_EXIT_CODE)
      : undefined,
});

app.get(["/watch/:id", "/embed/:id"], (request, response) => {
  const page = galleryPage(request.path, `http://127.0.0.1:${port}`);
  if (!page) {
    response.status(404).send("Preview unavailable");
    return;
  }
  response.set(page.headers).send(page.body);
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.get("/{*path}", (_request, response) =>
    response.sendFile(path.join(dist, "index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const { devServerOptions } = await import("./dev-server");
  const vite = await createServer(devServerOptions(root, port));
  app.use(vite.middlewares);
}

const server = app.listen(port, "127.0.0.1", () =>
  console.log(`camera-director is ready at http://127.0.0.1:${port}`),
);
runner.resume();
// Age out abandoned jobs the way the Worker sweep does, then advance the jobs
// this server holds its own key for.
const tick = setInterval(() => {
  void service.sweep().catch(() => {});
  void service.resumeServerJobs().catch(() => {});
}, 5_000);
tick.unref();
void service.sweep();
void service.resumeServerJobs();
let stopping = false;
function shutdown(code: number) {
  // A terminal's Ctrl-C reaches both the supervisor and this process.
  if (stopping) return;
  stopping = true;
  clearInterval(tick);
  projects.close();
  const installClosed = voiceInstaller.close();
  voice.close();
  const audioClosed = audio.close();
  // Stop taking connections first, so no reconnecting stream holds the
  // exit open; then wait for the listener and for an agent's children,
  // which may ignore SIGTERM until the SIGKILL that follows, with a ceiling.
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeIdleConnections();
  void Promise.race([
    Promise.all([
      closed,
      runner.close(),
      agents.close(),
      development.close(),
      installClosed,
      audioClosed,
    ]).then(() => activity.flush()),
    new Promise((resolve) => setTimeout(resolve, 8_000)),
  ]).finally(() => process.exit(code));
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => shutdown(0));

import { DeploymentAssets } from "./deployment-assets";
import { ActivityStore } from "./activity";
import { mountDevelopment, type DevOptions } from "./development-routes";
import { RunnerConnection } from "./runner-connection";
import { localRunnerRouter } from "./runner-routes";
import { activityRouter } from "./activity-routes";
import { activityMiddleware } from "./activity-middleware";
import { ArenaStore } from "./arena-store";
import { arenaRoutes, arenaStudio } from "./arena-studio";
import { mountPairings } from "./pairings";
import { MemoryProjects } from "./memory-projects";
import { TasteProfiles } from "./taste-profiles";
import { memoryRouter } from "./memory-routes";
import { VoiceInstaller } from "./voice-install";
import { savedVoiceConfig } from "./voice-settings";
import {
  approvalService,
  noteAgentQuote,
  noteAgentSet,
} from "./agent-approval-service";
import {
  agentAccess,
  quoteFor,
  readerOf,
  scopeAgentRequest,
} from "./agent-scope";
import { mediaRouter } from "./media-routes";
import { jobForReader, madeBy, shareTakes } from "./shared-takes";
import express from "express";
import { jsonErrors } from "./error-handler";
import { randomUUID } from "node:crypto";
import { AppError, requireKey } from "./errors";
import { defaultProviders, type Providers } from "./providers";
import { JobService } from "./jobs";
import type { WorkflowClient } from "../shared/comfy/workflow";
import type { WorkflowDestination } from "../shared/comfy/destination";
import type { LocalComfyWorkflows } from "./comfy-local";
import { WorkflowSettings } from "./workflow-settings";
import { settingsRouter } from "./settings-routes";
import { layoutRouter } from "./layout-routes";
import { LocalLayouts } from "./layouts";
import { expectationOf, expecting } from "./settings-expectation";
import { uploadRouter } from "./upload-routes";
import {
  localRateLimit,
  RATE_LIMIT_MESSAGE,
  RATE_WINDOW_MS,
  type RateBucket,
} from "../shared/limits";
import { publicJob, Store } from "./store";
import { MediaTools, type MediaToolsOptions } from "./media-tools";
import { requireTake } from "./take";
import { chainRouter } from "./chains";
import { partMedia, upscalePartsRouter } from "./upscale-parts-routes";
import { UpscalePartsService } from "./upscale-parts";
import { takeToProject } from "./project-takes";
import { projectRouter } from "./project-routes";
import { worldRecipeRouter } from "./world-recipe-routes";
import { VoiceService, voiceConfig, type VoiceOptions } from "./voice";
import { AudioAnalysis, type AudioAnalysisOptions } from "./audio-analysis";
import { audioRouter } from "./audio-routes";
import {
  machineRouter,
  MachineProbeService,
  type MachineOptions,
} from "./machine";
import { voiceRouter } from "./voice-routes";
import { finishingOn, keylessLocal, ServerKeys } from "./keys";
import { accountRouter } from "./account-routes";
import { keyRouter, type FindCommand } from "./key-routes";
import type { AgentConfig } from "./agent-config";
import { AgentRunnerSetting } from "./agent-runner-setting";
import { setupRouter } from "./setup-routes";
import { HermesProfileSetup } from "./agent-hermes-profile-setup";
import { setupFacts } from "./agent-setup-facts";
import { AgentSessions, type AgentSessionsOptions } from "./agent-sessions";
import { sweepTerminalFolders } from "./agent-session-terminal";
import {
  agentRouter,
  agentTicket,
  fromAgent,
  PAID_ROUTES,
  refuseAgentSpend,
} from "./agent-routes";
import {
  validateIdempotencyKey,
  validateInput,
  validateQuoteId,
} from "./validation";

export interface AppOptions extends DevOptions {
  directory: string;
  publicDirectory: string;
  /** The server's own keys: environment and Keychain (`server/index.ts`). */
  keys?: ServerKeys;
  /** One key placed in its slot by prefix, when `keys` is not given (tests). */
  serverKey?: string;
  providers?: Partial<Providers>;
  /**
   * The workflow route; `ComfySdkWorkflows` on the configured destination
   * unless a test injects one.
   */
  workflows?: WorkflowClient;
  deploymentFetcher?: typeof fetch;
  /** The default run location (`GENOBI_WORKFLOW_DESTINATION`) and the local ComfyUI. */
  runLocation?: {
    destination?: WorkflowDestination;
    local?: LocalComfyWorkflows;
  };
  /** The local ffmpeg service; tests inject a runner. */
  mediaTools?: MediaToolsOptions;
  /** How often an approved agent's split upscale is read on its own; 0: never. */
  upscaleFollowMs?: number;
  /** Local voice transcription; tests inject the worker and decoder. */
  voice?: VoiceOptions;
  /** How `/api/agent/runners` finds a runner's command; tests inject one. */
  findCommand?: FindCommand;
  /**
   * Project-prompt agent sessions: the studio's own origin, and the runner
   * configuration (read from the environment unless a test injects one).
   */
  agent?: Partial<Omit<AgentSessionsOptions, "config" | "link">> & {
    config?: AgentConfig;
  };
  /** Local audio analysis; tests inject the librosa worker. */
  audio?: AudioAnalysisOptions;
  /** The machine check; tests inject canned command output. */
  machine?: MachineOptions;
}

export async function createApp(options: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  const arena = new ArenaStore(options.directory);
  await arena.load();
  const store = new Store(options.directory);
  await store.load();
  const activity = new ActivityStore(options.directory);
  const projects = new MemoryProjects(options.directory);
  await projects.load();
  const tasteProfiles = new TasteProfiles(options.directory, projects);
  const providers = { ...defaultProviders(), ...options.providers };
  const keys = options.keys ?? ServerKeys.single(options.serverKey);
  await keys.load();
  const local = options.runLocation?.local;
  const settings = new WorkflowSettings(store, {
    destination: options.runLocation?.destination,
    localStatus: local && (() => local.status()),
  });
  const deploymentAssets = new DeploymentAssets(
    settings,
    keys,
    options.deploymentFetcher,
  );
  const service = new JobService(
    store,
    options.publicDirectory,
    keys,
    providers,
    options.workflows,
    settings,
    deploymentAssets,
  );
  const tools = new MediaTools(
    store,
    (id, sessionId) => service.source(id, sessionId),
    options.mediaTools,
  );
  const savedVoice = await savedVoiceConfig(options.directory);
  const environmentVoice = voiceConfig();
  const voice = new VoiceService({
    ...options.voice,
    config: options.voice?.config ?? {
      ...environmentVoice,
      python: savedVoice.python ?? environmentVoice.python,
      model: savedVoice.model ?? environmentVoice.model,
    },
  });
  const voiceInstaller = new VoiceInstaller(voice, options.directory);
  const parts = new UpscalePartsService(
    service,
    partMedia(tools),
    options.upscaleFollowMs,
  );
  // An approved agent's split upscale keeps advancing after a restart.
  parts.resumeFollowers();
  const approvals = approvalService(store, keys, service, parts);
  // The environment's runner, or the one chosen in setup (`.local/agent.json`).
  const runnerSetting = await AgentRunnerSetting.load(
    options.directory,
    options.agent?.config,
  );
  const agents = new AgentSessions({
    studioOrigin: "http://127.0.0.1:4317",
    approvals,
    memory: { projects, profiles: tasteProfiles },
    setupFacts: setupFacts(keys, voice),
    ...options.agent,
    config: runnerSetting.config,
    refresh: () => runnerSetting.refresh(),
    ...agentAccess(store, settings, options.publicDirectory),
    // The studio names its project by id; an owned copy handle maps to that
    // id, and a handle the session is only linked to stays unknown (404).
    link: (copyId, owner) =>
      projects.link(
        projects
          .list(owner)
          .find((p) => p.copyId === copyId && p.access === "owner")?.id ??
          copyId,
        owner,
      ),
  });
  const audio = new AudioAnalysis(
    tools,
    (id, sessionId) => service.source(id, sessionId),
    projects,
    options.audio,
  );
  const studioOrigin = options.agent?.studioOrigin ?? "http://127.0.0.1:4317";
  const runner = new RunnerConnection(options.directory, agents, studioOrigin);
  await runner.load();
  /**
   * The local mirror of the Worker's D1 limiter: same buckets, same window,
   * one in-memory map instead of a shared table. Every API route has a ceiling
   * so a runaway client cannot loop a route for free on either backend.
   */
  const rateWindows = new Map<string, { starts: number; count: number }>();
  function limit(bucket: RateBucket, id: string) {
    const now = Date.now();
    const key = `${bucket}:${id}`;
    const open = rateWindows.get(key);
    const window =
      open && now - open.starts < RATE_WINDOW_MS
        ? open
        : { starts: now, count: 0 };
    window.count++;
    rateWindows.set(key, window);
    if (rateWindows.size > 1000)
      for (const [existing, value] of rateWindows)
        if (now - value.starts > RATE_WINDOW_MS) rateWindows.delete(existing);
    if (window.count > localRateLimit(bucket))
      throw new AppError(429, RATE_LIMIT_MESSAGE);
  }

  // An agent's browser opens its ticket before it holds any session.
  app.get("/api/agent/ticket/:ticket", agentTicket(agents));
  app.use("/api", (request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const host = request.headers.host ?? "";
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
      return next(
        new AppError(
          403,
          "This local prototype accepts loopback requests only.",
        ),
      );
    const origin = request.headers.origin;
    if (origin && origin !== `http://${host}`)
      return next(new AppError(403, "Use the local app to make this request."));
    const cookie = request.headers.cookie
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("camera_session="))
      ?.slice(15);
    const sessionId =
      cookie && /^[0-9a-f-]{36}$/.test(cookie) ? cookie : randomUUID();
    if (sessionId !== cookie)
      response.cookie("camera_session", sessionId, {
        httpOnly: true,
        sameSite: "strict",
        maxAge: 30 * 86400_000,
        path: "/",
      });
    response.locals.sessionId = sessionId;
    response.locals.agent = fromAgent(agents, request, sessionId);
    scopeAgentRequest(agents, request, response.locals);
    shareTakes(store, request, response.locals);
    // Paid writes are counted once here; each read route counts its own bucket.
    // Unpaid routes count their own too: project copy writes (`edit`), voice
    // and audio analysis on this machine (voice-routes.ts, audio-routes.ts),
    // settings (settings-routes.ts) and agent sessions, so Stop is never held
    // up by the paid-write ceiling.
    if (
      request.method === "POST" &&
      !request.path.startsWith("/projects/") &&
      !request.path.startsWith("/memory/") &&
      !request.path.startsWith("/voice/") &&
      !request.path.startsWith("/audio/") &&
      !request.path.startsWith("/settings/") &&
      !request.path.startsWith("/agent/") &&
      !request.path.startsWith("/runner/") &&
      !request.path.startsWith("/activity") &&
      !/^\/(world|scrolls)\//.test(request.path) &&
      !request.path.startsWith("/arena")
    )
      try {
        limit("submit", sessionId);
      } catch (error) {
        return next(error);
      }
    // The run location and template a paid write expects (settings-expectation.ts).
    try {
      response.locals.expected = expectationOf(request.headers);
    } catch (error) {
      return next(error);
    }
    next();
  });
  app.use("/api/activity", activityRouter(activity, projects, limit, store));
  app.use("/api/runner", localRunnerRouter(runner, limit));
  app.use("/api", activityMiddleware(activity, projects, store));
  // An agent's session never spends: the person approves in their studio.
  for (const route of PAID_ROUTES) app.post(route, refuseAgentSpend);
  app.use("/api", accountRouter(service, keys, providers, limit));
  app.get("/api/history", async (_request, response) => {
    limit("history", response.locals.sessionId);
    const studio = Boolean(response.locals.sharedOwner);
    response.json(await service.history(response.locals.sessionId, studio));
  });
  app.post(
    "/api/jobs",
    express.json({ limit: "16mb" }),
    async (request, response) => {
      const input = validateInput(request.body);
      const idempotencyKey = validateIdempotencyKey(
        request.headers["idempotency-key"],
      );
      const byoKey =
        request.headers["x-byo-key"] === undefined
          ? undefined
          : requireKey(request.headers["x-byo-key"]);
      const job = await expecting(response.locals, () =>
        service.submit(
          input,
          response.locals.sessionId,
          idempotencyKey,
          byoKey,
          validateQuoteId(request.headers["quote-id"]),
          undefined,
          madeBy(request, response.locals, input),
        ),
      );
      response
        .status(job.status === "Error" ? 200 : 202)
        .json({ job: publicJob(job) });
    },
  );
  // Counted with the paid writes above: a quote prices a paid run.
  app.post(
    "/api/quotes",
    express.json({ limit: "16mb" }),
    async (request, response) => {
      const { input, quote, sourceSession } = await expecting(
        response.locals,
        () => quoteFor(service, request, response.locals),
      );
      // An agent's quote becomes a step the person approves (#23).
      await noteAgentQuote(agents, approvals, service, request, {
        locals: response.locals,
        input,
        quote,
        sourceSession,
      });
      response.status(201).json({ quote });
    },
  );
  app.get("/api/jobs/:id", async (request, response) => {
    limit("poll", response.locals.sessionId);
    const byoKey =
      request.headers["x-byo-key"] === undefined
        ? undefined
        : requireKey(request.headers["x-byo-key"]);
    const result = await service.poll(
      request.params.id,
      readerOf(response.locals, request.params.id),
      byoKey,
    );
    response.json({
      job: jobForReader(result.job, response.locals.sessionId),
      ...(result.needsKey ? { needsKey: true } : {}),
    });
  });
  app.get("/api/takes/:id", (request, response) => {
    // A stored record, never a provider call: it reads like history.
    limit("history", response.locals.sessionId);
    const job = service.owned(
      request.params.id,
      readerOf(response.locals, request.params.id),
    );
    response.json({ take: requireTake(publicJob(job), job.take) });
  });
  app.use("/api", uploadRouter(store));
  // Local only: the ffmpeg media tools and the clips they read and make.
  app.use("/api", mediaRouter(tools, store, limit));
  app.use(
    "/api/upscale-parts",
    upscalePartsRouter(parts, limit, (request, locals, set) =>
      noteAgentSet(agents, approvals, parts, request, locals, set),
    ),
  );
  app.use(
    "/api/chains",
    chainRouter(service, limit, (input, id) =>
      keylessLocal(keys, service.settings, input, id),
    ),
  );
  // An agent hands its own finished take into a project copy it is linked to.
  app.post(
    "/api/projects/:id/takes",
    express.json({ limit: "1kb" }),
    takeToProject(service, store, projects, limit),
  );
  app.use("/api/memory", memoryRouter(projects, tasteProfiles, limit));
  app.use("/api/projects", projectRouter(projects, limit));
  app.use("/api/projects", worldRecipeRouter(projects, limit));
  mountPairings(app, limit);
  const studio = arenaStudio(service, store, options.publicDirectory);
  app.use("/api/arena", arenaRoutes(arena, limit, studio));
  // Local only, like the media tools: the hosted Worker has no voice route.
  app.use("/api/voice", voiceRouter(voice, limit, voiceInstaller));
  // Keychain and installed runners; agent routes below own /agent/status.
  app.use(
    "/api",
    keyRouter(keys, limit, options.findCommand, (kind) =>
      finishingOn(store.data.jobs, kind),
    ),
  );
  // Local process routes; the hosted Worker uses its separate runner relay.
  app.use("/api/agent", agentRouter(agents, limit));
  const development = mountDevelopment(app, options, limit, store, {
    config: runnerSetting.config,
  });
  void sweepTerminalFolders((agents.terminal ??= development.terminal));
  // Setup's Connect step: the chosen harness, its sign-in and the login Terminal.
  app.use(
    "/api",
    setupRouter(runnerSetting, limit, development.terminal, {
      profile: new HermesProfileSetup(runnerSetting, studioOrigin),
    }),
  );
  // Local only, like voice: the hosted Worker has no audio analysis route.
  app.use("/api/audio", audioRouter(audio, limit));
  app.use("/api/settings", deploymentAssets.router(limit));
  app.use("/api/settings", settingsRouter(settings, limit, local));
  // Local only: hosted visitors keep layouts in the browser (layout-routes.ts).
  const layouts = new LocalLayouts(options.directory);
  app.use("/api/layouts", layoutRouter(layouts, limit));
  // Local only: the hosted Worker has no machine to read.
  app.use(
    "/api/machine",
    machineRouter(
      new MachineProbeService(options.directory, options.machine),
      limit,
    ),
  );
  app.use("/api", (_request, _response, next) =>
    next(new AppError(404, "API route not found.")),
  );
  app.use(jsonErrors);
  return {
    app,
    activity,
    runner,
    service,
    parts,
    store,
    projects,
    voice,
    voiceInstaller,
    audio,
    settings,
    agents,
    development,
    keys,
  };
}

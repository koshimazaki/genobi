// Setup's Connect step on the local server: the harness chosen for project
// prompts (`/api/settings/agent-runner`), whether each harness is signed in
// (`/api/agent/sign-in`), its own sign-in opened in Terminal, and Hermes'
// `genobi` profile set up from the saved choice (`/api/agent/hermes-profile`),
// and the intro video setup offers while an install waits
// (`/api/settings/intro-video`).
// Keys use `PUT /api/keys/:kind` (key-routes.ts). The hosted Worker has none
// of these.
import express, { type RequestHandler, type Response } from "express";
import { sameOrigin } from "./agent-routes";
import { AppError } from "./errors";
import type { AgentRunnerSetting } from "./agent-runner-setting";
import type { DevelopmentTerminal } from "./development-terminal";
import type { HermesProfileSetup } from "./agent-hermes-profile-setup";
import { harnessSignIn } from "./harness-sign-in";
import { SETUP_RUNNERS } from "../shared/agent-runner-setting";
import { introVideoAddress } from "../shared/intro-video";
import type { RateBucket } from "../shared/limits";

/**
 * Same origin with the studio's header, as the agent routes require, and
 * never an agent's own session: an agent cannot pick the harness that runs
 * it, read sign-in state, open a Terminal or set up a profile.
 */
const ownerOnly: RequestHandler = (_request, response, next) =>
  next(
    response.locals.agent
      ? new AppError(
          403,
          "Agents cannot change the studio's harness or sign-in.",
          "agent_nested",
        )
      : undefined,
  );

/** Each answer is read fresh: a Check again must never see a cached one. */
const fresh: RequestHandler = (_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
};

export interface SetupRouterOptions {
  signIn?: typeof harnessSignIn;
  /** Runs the profile setup; without it the route answers 503. */
  profile?: HermesProfileSetup;
  /** The intro video's address; `GENOBI_INTRO_VIDEO_URL` when not given. */
  introVideo?: string | null;
}

export function setupRouter(
  setting: AgentRunnerSetting,
  limit: (bucket: RateBucket, id: string) => void,
  terminal?: DevelopmentTerminal,
  {
    signIn = harnessSignIn,
    profile,
    introVideo = process.env.GENOBI_INTRO_VIDEO_URL,
  }: SetupRouterOptions = {},
) {
  const router = express.Router();
  const session = (response: Response) => response.locals.sessionId as string;
  // "Watch the video while it downloads": null until the video exists.
  const video = introVideoAddress(introVideo) ?? null;
  router.get("/settings/intro-video", sameOrigin, (_request, response) => {
    limit("history", session(response));
    response.json({ video });
  });
  router.get(
    "/settings/agent-runner",
    sameOrigin,
    ownerOnly,
    fresh,
    (_request, response) => {
      limit("history", session(response));
      response.json(setting.state());
    },
  );
  router.post(
    "/settings/agent-runner",
    sameOrigin,
    ownerOnly,
    express.json({ limit: "2kb" }),
    async (request, response) => {
      limit("edit", session(response));
      response.json(await setting.save(request.body));
    },
  );
  // Three short read-only status commands; see harness-sign-in.ts. Each read
  // runs them again, after finding the harnesses again (one installed since
  // the server started counts without a restart).
  router.get(
    "/agent/sign-in",
    sameOrigin,
    ownerOnly,
    fresh,
    async (_request, response) => {
      limit("history", session(response));
      await setting.refresh();
      response.json({
        harnesses: await signIn({
          hermesProvider: setting.config.hermesProvider,
        }),
      });
    },
  );
  router.post(
    "/agent/sign-in/:runner",
    sameOrigin,
    ownerOnly,
    async (request, response) => {
      limit("submit", session(response));
      const runner = SETUP_RUNNERS.find((r) => r === request.params.runner);
      if (!runner) throw new AppError(404, "API route not found.");
      if (!terminal)
        throw new AppError(
          503,
          "Restart the local server to enable native terminals.",
        );
      response
        .status(201)
        .json(await terminal.login(runner, setting.config.hermesProvider));
    },
  );
  // "Set up Hermes": the `genobi` profile from the saved model and provider,
  // the same code as `npm run agent:hermes-profile`, without a shell.
  // Refusals answer at once; progress is read with GET.
  router.get(
    "/agent/hermes-profile",
    sameOrigin,
    ownerOnly,
    fresh,
    (_request, response) => {
      limit("history", session(response));
      if (!profile) throw new AppError(503, "Hermes setup is unavailable.");
      response.json(profile.status(session(response)));
    },
  );
  router.post(
    "/agent/hermes-profile",
    sameOrigin,
    ownerOnly,
    async (_request, response) => {
      limit("submit", session(response));
      if (!profile) throw new AppError(503, "Hermes setup is unavailable.");
      response.status(202).json(await profile.start(session(response)));
    },
  );
  return router;
}

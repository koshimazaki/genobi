// Agent scopes (#23): only picked takes and the upscale source in settings
// are readable through SCOPED_READS, using the fake runner's agent grant.
// Every registered route must be scoped or listed below with a reason.
// Fake provider only; local exports never broaden source ownership.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCOPED_READS } from "../server/agent-scope";
import { GENOBI_TOOLS } from "../server/agent-runner";
import type { Run } from "../server/ffmpeg";
import type { Project } from "../shared/director/types";
import { agentStudio } from "./agent-harness";
import { base } from "./house-template-fixtures";
import { input } from "./server-harness";

/** Every other route, and why the read scope does not apply to it. */
const NOT_SCOPED: Record<string, string> = {
  "GET /api/effects": "static public effect metadata; names no private media",
  "POST /api/effects/variants":
    "pure configuration validation; no storage or private reads",
  "GET /api/capabilities": "runtime feature metadata; names no private media",
  "GET /api/agent/sessions":
    "answers no session locally; reads nothing of the person's",
  "GET /api/runner/status": "pairing owner status only; marked agents refused",
  "POST /api/runner/connect":
    "explicit local owner confirmation; marked agents refused",
  "DELETE /api/runner/connect": "pairing owner only; marked agents refused",
  "GET /api/activity":
    "own session history only, never broader agent owner history",
  "POST /api/activity":
    "linked-project access checked; job backend requires owned/scoped job",
  "PUT /api/activity": "owner preference only; marked agents refused",
  "DELETE /api/arena/:id":
    "Arena deletion requires ownership; pairing does not grant deletion.",
  "GET /api/arena":
    "Arena has owner checks and explicit one-use pairing; no source/job grant.",
  "POST /api/arena":
    "Arena has owner checks and explicit one-use pairing; no source/job grant.",
  "POST /api/arena/link":
    "Arena has owner checks and explicit one-use pairing; no source/job grant.",
  "GET /api/arena/:id":
    "Arena has owner checks and explicit one-use pairing; no source/job grant.",
  "POST /api/arena/:id":
    "Arena has owner checks and explicit one-use pairing; no source/job grant.",
  "POST /api/arena/:id/link":
    "Arena has owner checks and explicit one-use pairing; no source/job grant.",
  "POST /api/arena/:id/files":
    "Arena has owner checks and explicit one-use pairing; no source/job grant.",
  "POST /api/arena/:id/media":
    "Arena owner or paired session; copies that session's own media or a public catalogue clip.",
  "POST /api/arena/:id/run-request":
    "Arena owner or paired session; a request the person must quote and confirm, never a spend.",
  "DELETE /api/arena/:id/run-request":
    "Arena owner or paired session; clears a run request only.",
  "POST /api/arena/:id/slots/:slot/result":
    "Arena owner or paired session; the run must be that session's own Ready job.",
  "GET /api/arena/:id/files/:hash":
    "Arena has owner checks and explicit one-use pairing; no source/job grant.",

  "POST /api/scrolls/fill":
    "Scrolls fill: the person's tab asks for its own one-use code; marked agents refused.",
  "POST /api/scrolls/fill/panels":
    "Scrolls fill: text panels by a one-use code from the person's Send; reads nothing of theirs.",
  "GET /api/scrolls/fill/:id":
    "Scrolls fill: only the tab that asked collects its panels; marked agents refused.",
  "POST /api/world/connect":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "POST /api/world/link":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "DELETE /api/world/:id":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "GET /api/world/:id/next":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "POST /api/world/:id/commands":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "GET /api/world/:id/commands/:command":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "POST /api/world/:id/commands/:command":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "POST /api/world/:id/files/:file":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "GET /api/world/:id/files/:file":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "GET /api/world/:id/files":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "DELETE /api/world/:id/files":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "GET /api/memory/taste": "owner profile only; marked agents refused",
  "POST /api/memory/taste": "explicit owner action; marked agents refused",
  "POST /api/memory/taste/shelf":
    "explicit owner action; marked agents refused",
  "GET /api/memory/projects/:id/context":
    "project link scope, active runner bound to one project",
  "POST /api/memory/projects/:id/decisions":
    "project link scope and evidence actor checks",
  "POST /api/memory/projects/:id/checkpoint":
    "project link and session-principal checks",
  "POST /api/memory/projects/:id/sessions":
    "project link scope, no additional grants",
  "POST /api/memory/projects/:id/taste": "project link scope; proposal only",
  "POST /api/memory/projects/:id/references":
    "project link scope; stores annotation only",
  "GET /api/memory/projects/:id/memory-export":
    "owner only; marked agents refused",
  "POST /api/memory/projects/:id/forget":
    "explicit owner action; marked agents refused",

  "GET /api/agent/ticket/:ticket": "signs the agent's browser in",
  "GET /api/history": "lists the request's own session",
  "POST /api/jobs": "spends: refused to agents",
  "POST /api/uploads": "writes into the request's own session",
  "GET /api/media/tools": "names no media",
  "POST /api/media/:operation":
    "writes derived media into the request's own session",
  "GET /api/health": "names no media",
  "GET /api/credits": "names no media",
  "GET /api/budget": "names no media",
  "GET /api/agent/status": "names no media",
  "POST /api/agent/sessions": "refused to agents",
  "GET /api/agent/sessions/:id": "an agent session, owned by the person",
  "POST /api/agent/sessions/:id/messages":
    "an agent session, owned by the person",
  "POST /api/agent/sessions/:id/stop": "an agent session, owned by the person",
  "POST /api/agent/run/messages":
    "an agent collects its own session's messages; names no media",
  "POST /api/agent/sessions/:id/approvals/:quote/approve":
    "spends: the person's own approval, refused to agents",
  "POST /api/agent/sessions/:id/approvals/:quote/decline":
    "the person's own decline of an agent's step",
  "GET /api/audio/status": "names no media",
  "GET /api/chains": "lists the request's own chains",
  "POST /api/chains":
    "a chain runs in its own session; an agent's cannot be approved",
  "GET /api/chains/:id": "a chain, owned by its session",
  "POST /api/chains/:id/approve": "spends: refused to agents",
  "POST /api/chains/:id/cancel": "a write on the request's own chain",
  "GET /api/upscale-parts": "lists the request's own split upscales",
  "POST /api/upscale-parts":
    "cuts and quotes in the request's own session; sends nothing",
  "GET /api/upscale-parts/:id": "a split upscale, owned by its session",
  "POST /api/upscale-parts/:id/confirm": "spends: refused to agents",
  "POST /api/upscale-parts/:id/parts/:index/retry":
    "quotes a part of the request's own set; sends nothing",
  "POST /api/upscale-parts/:id/parts/:index/confirm":
    "spends: refused to agents",
  "POST /api/upscale-parts/:id/join":
    "joins the request's own finished parts; free",
  "GET /api/keys": "names no media",
  "GET /api/keys/bfl/dashboard":
    "metadata-only key availability, no media or secret",
  "PUT /api/keys/bfl/dashboard": "explicit key reuse; marked agents refused",
  "PUT /api/keys/:kind": "a key, not media",
  "DELETE /api/keys/:kind": "a key, not media",
  "GET /api/agent/runners": "names no media",
  "GET /api/machine": "names no media",
  "GET /api/layouts": "saved layouts, not media",
  "PUT /api/layouts/:id": "saved layouts, not media",
  "DELETE /api/layouts/:id": "saved layouts, not media",
  "GET /api/projects": "projects have their own link scope",
  "POST /api/projects/link": "projects have their own link scope",
  "GET /api/projects/:id": "projects have their own link scope",
  "GET /api/projects/:id/feedback": "projects have their own link scope",
  "PUT /api/projects/:id": "projects have their own link scope",
  "PUT /api/projects/:id/files/:sha256": "projects have their own link scope",
  "GET /api/projects/:id/files/:sha256": "projects have their own link scope",
  "POST /api/projects/:id/commands": "projects have their own link scope",
  "POST /api/projects/:id/link": "projects have their own link scope",
  "GET /api/projects/:id/events": "projects have their own link scope",
  "GET /api/projects/:id/world-recipe": "projects have their own link scope",
  "POST /api/projects/:id/world-recipe": "projects have their own link scope",
  "POST /api/projects/:id/world-recipe/applied":
    "projects have their own link scope; owner only",
  "GET /api/settings/run-location": "settings, not media",
  "POST /api/settings/run-location": "settings, not media",
  "GET /api/settings/workflows": "settings, not media",
  "POST /api/settings/workflows/selection": "settings, not media",
  "GET /api/settings/agent-runner": "the chosen harness; refused to agents",
  "POST /api/settings/agent-runner": "the chosen harness; refused to agents",
  "GET /api/settings/intro-video": "the intro video's address, not media",
  "GET /api/agent/sign-in": "sign-in booleans; refused to agents",
  "POST /api/agent/sign-in/:runner":
    "opens a login Terminal; refused to agents",
  "GET /api/agent/hermes-profile": "profile setup steps; refused to agents",
  "POST /api/agent/hermes-profile":
    "sets up Hermes' genobi profile; refused to agents",
  "GET /api/voice/setup/found":
    "verified voice model folders; refused to agents",
  "GET /api/voice/setup": "names no media",
  "GET /api/voice/setup/progress": "names no media",
  "POST /api/voice/setup/folder": "names no media",
  "POST /api/voice/setup": "names no media",
  "DELETE /api/voice/setup": "names no media",
  "GET /api/voice/status": "names no media",
  "POST /api/voice/prewarm": "names no media",
  "DELETE /api/voice/prewarm": "names no media",
  "POST /api/voice/transcribe": "transcribes uploaded audio, names no media",
};

/**
 * The routes the local server declares: `app.<method>("/api/…")` in
 * `server/app.ts`, and `router.<method>("…")` in each router mounted there,
 * with its mount path.
 */
function declaredRoutes() {
  const dir = path.resolve("server");
  const app = readFileSync(path.join(dir, "app.ts"), "utf8");
  // `mountPairings` (server/pairings.ts) mounts World's and Scrolls' routers.
  const pairings = readFileSync(path.join(dir, "pairings.ts"), "utf8");
  const mounts = new Map<string, string>();
  for (const m of `${app}\n${pairings}`.matchAll(
    /app\.use\(\s*"(\/api[^"]*)",\s*(\w+)\(/g,
  ))
    mounts.set(m[2], m[1]);
  const routes = [
    ...app.matchAll(/\bapp\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g),
  ].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const text = readFileSync(path.join(dir, file), "utf8");
    const routers = [...text.matchAll(/export function (\w+)\(/g)]
      .map((m) => m[1])
      .filter((name) => mounts.has(name));
    if (!routers.length) continue;
    expect(routers, `${file} mounts one router`).toHaveLength(1);
    for (const m of text.matchAll(
      /\brouter\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g,
    ))
      routes.push(
        `${m[1].toUpperCase()} ${(mounts.get(routers[0]) + m[2]).replace(/\/$/, "")}`,
      );
  }
  return routes;
}

type Studio = Awaited<ReturnType<typeof agentStudio>>;

/** A finished take in this session, on the fake provider. */
async function finished(studio: Studio, cookie: string, description: string) {
  const made = await fetch(`${studio.base}/api/jobs`, {
    method: "POST",
    headers: {
      cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ ...input, description }),
  });
  const id = (await made.json()).job.id as string;
  for (let i = 0; i < 50; i++) {
    const { job } = await (
      await fetch(`${studio.base}/api/jobs/${id}`, { headers: { cookie } })
    ).json();
    if (job.status === "Ready") return id;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The take did not finish.");
}

async function linkCode(studio: Studio, cookie: string) {
  const bundle = base();
  const project = bundle.project as Project;
  for (const bytes of new Set(bundle.files.values()))
    await fetch(
      `${studio.base}/api/projects/${project.id}/files/${createHash("sha256").update(bytes).digest("hex")}`,
      {
        method: "PUT",
        headers: { cookie, "Content-Type": "application/octet-stream" },
        body: bytes,
      },
    );
  const send = (route: string, method: string, body: object) =>
    fetch(`${studio.base}/api/projects${route}`, {
      method,
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  await send(`/${project.id}`, "PUT", {
    baseRevision: null,
    project: { ...project, revision: 1 },
    brief: null,
  });
  return (await (await send(`/${project.id}/link`, "POST", {})).json())
    .code as string;
}

describe("the agent read scope", () => {
  it("covers every route that reads by id, and the server declares no other unnamed route", () => {
    const declared = declaredRoutes();
    for (const route of SCOPED_READS)
      expect(declared, `${route} is declared`).toContain(route);
    const unclassified = declared.filter(
      (route) =>
        !(SCOPED_READS as readonly string[]).includes(route) &&
        !(route in NOT_SCOPED),
    );
    expect(unclassified).toEqual([]);
  });

  it("applies to each scoped route alike", { timeout: 60_000 }, async () => {
    const studio = await agentStudio();
    const person = await studio.fresh();
    const stranger = await studio.fresh();
    const code = await linkCode(studio, person);
    studio.bfl.media = new Uint8Array(
      await readFile(path.resolve("tests/fixtures/metadata.mp4")),
    );
    studio.bfl.ready = true;
    const picked = await finished(studio, person, "Picked");
    const inSettings = await finished(studio, person, "These settings");
    const unpicked = await finished(studio, person, "Not picked");
    const theirs = await finished(studio, stranger, "Someone else's");
    const started = await studio.start(person, "grant hang", {
      context: {
        picks: [{ kind: "take", id: picked, media: "video", name: "Picked" }],
        settings: {
          generator: "upscale",
          model: "flux-3",
          sourceId: inSettings,
          upscaleFactor: 2,
        },
      },
    });
    const [, grant] = await studio.waitFor(
      person,
      started.body.id,
      /^grant ([0-9a-f]{24})$/,
    );
    const mark = { "X-Genobi-Agent-Session": "1" };
    const marks = { ...mark, "X-Genobi-Agent-Run": grant };
    const health = await fetch(`${studio.base}/api/health`, { headers: marks });
    const cookie = health.headers.get("set-cookie")!.split(";")[0];
    const send = (
      method: string,
      route: string,
      body?: object,
      headers: object = marks,
    ) =>
      fetch(`${studio.base}${route}`, {
        method,
        headers: { ...headers, cookie, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const linked = await send("POST", "/api/projects/link", { code });
    const copyId = (await linked.json()).project.copyId as string;

    /** Each scoped route, reading `id`; the status it answers. */
    const reads: Record<
      (typeof SCOPED_READS)[number],
      (id: string, headers?: object) => Promise<Response>
    > = {
      "GET /api/jobs/:id": (id, h) =>
        send("GET", `/api/jobs/${id}`, undefined, h),
      "GET /api/takes/:id": (id, h) =>
        send("GET", `/api/takes/${id}`, undefined, h),
      "GET /api/clips/:id": (id, h) =>
        send("GET", `/api/clips/${id}`, undefined, h),
      "GET /api/media/:id/probe": (id, h) =>
        send("GET", `/api/media/${id}/probe`, undefined, h),
      "POST /api/quotes": (id, h) =>
        send(
          "POST",
          "/api/quotes",
          { ...input, generator: "upscale", sourceId: id, upscaleFactor: 2 },
          h,
        ),
      "POST /api/projects/:id/takes": (id, h) =>
        send(
          "POST",
          `/api/projects/${copyId}/takes`,
          { jobId: id, baseRevision: 1 },
          h,
        ),
      "POST /api/audio/analyze": (id, h) =>
        send("POST", "/api/audio/analyze", { sourceId: id }, h),
    };
    expect(Object.keys(reads).sort()).toEqual([...SCOPED_READS].sort());
    const status = async (route: keyof typeof reads, id: string, h?: object) =>
      (await reads[route](id, h)).status;

    for (const route of SCOPED_READS) {
      // Readable: anything but not found (a stale project revision or a
      // video named as audio still proves the read went through).
      expect(await status(route, picked), `${route}: picked`).not.toBe(404);
      expect(
        await status(route, inSettings),
        `${route}: settings source`,
      ).not.toBe(404);
      expect(await status(route, unpicked), `${route}: unpicked`).toBe(404);
      expect(await status(route, theirs), `${route}: another's`).toBe(404);
      expect(
        await status(route, picked, mark),
        `${route}: without the grant`,
      ).toBe(404);
    }
    expect(studio.bfl.submissions).toBe(4);

    // After Stop the grant reads nothing.
    await studio.call(person, `/sessions/${started.body.id}/stop`, {
      method: "POST",
    });
    await studio.settle(person, started.body.id);
    for (const route of SCOPED_READS)
      expect(await status(route, picked), `${route}: after Stop`).toBe(404);
  });
});

/** ffmpeg as the media tools see it: present, and ffprobe answering one clip. */
const fakeMedia: Run = async (_command, args) => {
  if (args[0] === "-version") return "ffmpeg version test";
  if (args.includes("-show_entries"))
    return JSON.stringify({
      format: { duration: "1.0" },
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          width: 640,
          height: 360,
          r_frame_rate: "24/1",
        },
      ],
    });
  throw new Error("No ffmpeg run is expected here.");
};

// The media tools an agent session gets (#14): the probe reads through the
// scope, so a picked take is measured; the cutting routes resolve sources in
// the request's own session, so the same take is not found and nothing runs.
// Exposing local exports does not expand this ownership boundary.
describe("the media routes for an agent session", () => {
  it(
    "probe a picked take, but cut only the session's own media",
    { timeout: 30_000 },
    async () => {
      const studio = await agentStudio({
        app: { mediaTools: { run: fakeMedia } },
      });
      const person = await studio.fresh();
      studio.bfl.media = new Uint8Array(
        await readFile(path.resolve("tests/fixtures/metadata.mp4")),
      );
      studio.bfl.ready = true;
      const picked = await finished(studio, person, "Picked");
      const started = await studio.start(person, "grant hang", {
        context: {
          picks: [{ kind: "take", id: picked, media: "video", name: "Picked" }],
        },
      });
      const [, grant] = await studio.waitFor(
        person,
        started.body.id,
        /^grant ([0-9a-f]{24})$/,
      );
      const marks = {
        "X-Genobi-Agent-Session": "1",
        "X-Genobi-Agent-Run": grant,
      };
      const health = await fetch(`${studio.base}/api/health`, {
        headers: marks,
      });
      const cookie = health.headers.get("set-cookie")!.split(";")[0];
      const send = (method: string, route: string, body?: object) =>
        fetch(`${studio.base}${route}`, {
          method,
          headers: { ...marks, cookie, "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      const probe = await send("GET", `/api/media/${picked}/probe`);
      expect(probe.status).toBe(200);
      expect((await probe.json()).probe.video).toMatchObject({ width: 640 });
      for (const [operation, body] of [
        ["trim", { sourceId: picked, start: 0, duration: 0.5 }],
        ["frames", { sourceId: picked, times: [0] }],
        ["concat", { sourceIds: [picked, picked] }],
        ["crossfade", { sourceIds: [picked, picked], duration: 0.2 }],
        [
          "space",
          {
            sourceId: picked,
            segments: [{ start: 0, end: 0.5, preset: "small_room" }],
          },
        ],
      ] as const)
        expect(
          (await send("POST", `/api/media/${operation}`, body)).status,
          operation,
        ).toBe(404);
      expect(GENOBI_TOOLS).toContain("genobi_media_probe");
      for (const writer of [
        "genobi_media_frames",
        "genobi_media_trim",
        "genobi_media_concat",
      ])
        expect(GENOBI_TOOLS).toContain(writer);
      for (const writer of ["genobi_media_crossfade", "genobi_media_space"])
        expect(GENOBI_TOOLS).not.toContain(writer);
    },
  );
});

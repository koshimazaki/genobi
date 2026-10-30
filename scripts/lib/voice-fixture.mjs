/**
 * The voice browser check's fixtures: a studio page whose API routes are all
 * answered here, so nothing is transcribed, submitted or run, and the
 * measurements the checks share. Used by scripts/check-voice-overlay.mjs.
 */
import assert from "node:assert/strict";

export const TRANSCRIPT = "Open Genobi and orbit the vessel for 6.1 seconds.";
/** The session action once the transcript has gone into a prompt. */
export const SEND = "Send to agent instead";
export const READY = {
  available: true,
  python: true,
  model: true,
  ffmpeg: true,
  maxSeconds: 180,
  // A short list, so the check sees the server's list win over the studio's.
  languages: ["auto", "English", "French", "Japanese"],
  language: "auto",
};
/** The ten characters the fixture gives every project copy handle. */
export const HANDLE = "k7qm2xrpab";

const notFound = (route) =>
  route.fulfill({ status: 404, json: { error: "API route not found." } });

/**
 * Returns `open`, which loads a studio page. `status` answers the voice
 * status route (null: missing, as on the hosted studio). `agent` answers the
 * agent routes: undefined leaves them missing; `{ status, session }` gives
 * the status body and the session answer (`{ status, json }`); `read`, when
 * given, is what the panel's poll reads, `approve` and `decline` answer a
 * paid step's buttons (`{ status, json }`) and `job` is the run an approval
 * started, as `GET /api/jobs/:id` reads it. `copy` lets
 * the open project's copy exist, so its handle can be found. `text` is what
 * the stubbed transcription answers.
 */
export function voiceFixture(browser, base, errors) {
  return async function open({
    width = 1440,
    status = READY,
    delay = 0,
    refuse = false,
    agent,
    copy = false,
    script,
    text = TRANSCRIPT,
    path = "/?workspace=ninja",
  } = {}) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      permissions: ["microphone"],
    });
    const sent = {
      prewarm: 0,
      cancel: 0,
      wav: [],
      agentStatus: [],
      sessions: [],
      approvals: [],
      copies: new Set(),
      // Any other write the page tries: none may be a generation.
      writes: [],
    };
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      if (path === "/api/voice/status")
        return status ? route.fulfill({ json: status }) : notFound(route);
      if (path === "/api/voice/prewarm" && method === "POST") {
        sent.prewarm++;
        return route.fulfill({ status: 202, json: { warming: true } });
      }
      if (path === "/api/voice/prewarm" && method === "DELETE") {
        sent.cancel++;
        return route.fulfill({ json: { stopped: true } });
      }
      if (path === "/api/voice/transcribe" && method === "POST") {
        sent.wav.push({
          language: new URL(request.url()).searchParams.get("language"),
          type: request.headers()["content-type"],
          head: request.postDataBuffer()?.subarray(0, 12).toString("latin1"),
        });
        if (delay) await new Promise((r) => setTimeout(r, delay));
        return route.fulfill({ json: { text } });
      }
      if (path === "/api/agent/status") {
        sent.agentStatus.push(request.headers()["x-genobi-agent"]);
        return agent ? route.fulfill({ json: agent.status }) : notFound(route);
      }
      if (path === "/api/agent/sessions" && method === "POST") {
        sent.sessions.push({
          header: request.headers()["x-genobi-agent"],
          body: request.postDataJSON(),
        });
        return agent?.session ? route.fulfill(agent.session) : notFound(route);
      }
      // A paid step's Approve or Decline: recorded, never run.
      const step = path.match(
        /^\/api\/agent\/sessions\/[^/]+\/approvals\/([^/]+)\/(approve|decline)$/,
      );
      if (step && method === "POST") {
        sent.approvals.push({
          quote: step[1],
          action: step[2],
          key: request.headers()["idempotency-key"],
          header: request.headers()["x-genobi-agent"],
        });
        return agent?.[step[2]]
          ? route.fulfill(agent[step[2]])
          : notFound(route);
      }
      // The session panel reads its session while it runs.
      if (path.startsWith("/api/agent/sessions/") && method === "GET")
        return agent?.session
          ? route.fulfill({
              json: agent.read ?? {
                ...agent.session.json,
                status: "running",
                lines: ["Working…"],
              },
            })
          : notFound(route);
      if (copy && path.startsWith("/api/projects")) {
        const [, , , id, files] = path.split("/");
        if (method === "PUT" && id && !files) sent.copies.add(id);
        if (method === "PUT") return route.fulfill({ json: {} });
        if (path === "/api/projects")
          return route.fulfill({
            json: {
              projects: [...sent.copies].map((id) => ({
                id,
                copyId: `${id}.${HANDLE}`,
                access: "owner",
              })),
            },
          });
        return notFound(route);
      }
      // A run an approval started joins the gallery's polling.
      if (agent?.job && path === `/api/jobs/${agent.job.id}`)
        return route.fulfill({ json: { job: agent.job } });
      // The open bubble reads the activity history while it is shown.
      if (path === "/api/activity" && method === "GET")
        return route.fulfill({ json: { enabled: false, events: [] } });
      // Arena's list endpoint answers { arenas: [] }; the generic jobs/sources
      // fallback below is not its shape and would disable the Arena panel.
      if (path === "/api/arena" && method === "GET")
        return route.fulfill({ json: { arenas: [] } });
      if (method !== "GET") {
        sent.writes.push(`${method} ${path}`);
        return route.abort();
      }
      return route.fulfill({
        json:
          path === "/api/health"
            ? { hasServerKey: false }
            : { jobs: [], sources: [] },
      });
    });
    // Count microphone requests.
    await context.addInitScript(
      ({ refuse }) => {
        localStorage.setItem("genobi-setup-seen-v1", "1");
        // The agent bubble is opt-in since the activity settings landed; a
        // person who wants the session panel shown has this preference set.
        // Logging itself stays off, so no activity write is mistaken for a run.
        localStorage.setItem(
          "genobi-activity-v1",
          JSON.stringify({ enabled: false, showBubble: true, events: [] }),
        );
        window.voiceMicRequests = 0;
        const granted = navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices,
        );
        navigator.mediaDevices.getUserMedia = (constraints) => {
          window.voiceMicRequests++;
          return refuse
            ? Promise.reject(new DOMException("denied", "NotAllowedError"))
            : granted(constraints);
        };
      },
      { refuse },
    );
    if (script) await context.addInitScript(script);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}${path}`);
    const voice = page.getByRole("button", { name: "Voice", exact: true });
    await voice.waitFor();
    // The Director panels load lazily; measure only once they have.
    if (path.includes("ninja"))
      await page.locator("#project-prompt-text").waitFor();
    else if (path.includes("camera"))
      await page.locator("#description").waitFor();
    else await page.locator(".template-gallery").waitFor();
    await page.waitForTimeout(600);
    return { context, page, voice, sent };
  };
}

/** Page boxes of the toolbar, gallery and shown panels: what must not move. */
export const layout = (page) =>
  page.evaluate(() =>
    [
      ".topbar",
      ".genobi-presets",
      ".genobi-config-button",
      ".voice-button",
      ".template-gallery:not([hidden])",
      ".genobi-grid",
      ".genobi-grid > [data-panel]:not([hidden])",
    ]
      .flatMap((s) => [...document.querySelectorAll(s)])
      .map((el) => {
        const r = el.getBoundingClientRect();
        return [
          el.className.split(" ")[0] + (el.dataset.panel ?? ""),
          Math.round(r.x),
          Math.round(r.y + scrollY),
          Math.round(r.width),
          Math.round(r.height),
        ].join(" ");
      }),
  );
/** A prompt's text: a textarea's value or the Director's editable text. */
export const fieldText = (page, id) =>
  page
    .locator(`#${id}`)
    .evaluate((el) =>
      el instanceof HTMLTextAreaElement ? el.value : el.textContent,
    );
export const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
export const focusedName = (page) =>
  page.evaluate(
    () =>
      document.activeElement?.getAttribute("aria-label") ??
      document.activeElement?.textContent,
  );

/** The pill hangs under the header, against its right edge. */
export async function underHeader(page, width) {
  const [pill, header, mic] = await Promise.all([
    page.locator(".voice-pill").boundingBox(),
    page.locator(".topbar").boundingBox(),
    page.locator(".voice-button").boundingBox(),
  ]);
  assert(
    await page.locator(".topbar-right .voice-button").count(),
    "Voice is in the header",
  );
  assert(pill.y >= header.y + header.height, `under the header at ${width}`);
  assert(pill.y - (header.y + header.height) <= 12, `close under at ${width}`);
  assert(
    Math.abs(pill.x + pill.width - (header.x + header.width)) <= 1,
    `right-aligned at ${width}`,
  );
  assert(pill.height <= 36, `a thin pill at ${width}`);
  assert(mic.width <= 32, `an icon-only mic at ${width}`);
  assert(pill.x >= 0 && pill.x + pill.width <= width, `fits at ${width}`);
}

/** Lit canvas pixels, and a hash of them to compare two frames. */
export const pixels = (page) =>
  page.locator("canvas.voice-led").evaluate((canvas) => {
    const data = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0,
      hash = 0;
    for (let i = 3; i < data.length; i += 4)
      if (data[i]) {
        lit++;
        hash = (hash * 31 + data[i] + i) | 0;
      }
    return { lit, hash };
  });

/** Opening the mic records at once; this waits until it is listening. */
export const listening = (page) =>
  page.getByText(/^LISTENING/).waitFor({ state: "attached" });

/** Ends the note with the pill's Stop and waits for the transcript. */
export async function transcribed(page, stop) {
  await (
    stop ??
    page.getByRole("button", { name: "Stop and transcribe", exact: true })
  ).click();
  const transcript = page.getByLabel("Transcript", { exact: true });
  await transcript.waitFor();
  return transcript;
}

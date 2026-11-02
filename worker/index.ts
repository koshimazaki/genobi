import { defaultProviders, providerFor } from "../server/providers";
import {
  deploymentState,
  deploymentCatalogue,
  deploymentSettingsRoute,
  deploymentUpload,
} from "./deployments";
import { readExpectation } from "../shared/comfy/expectation";
import { AppError, requireKey } from "../server/errors";
import { checkedCloudCatalogue } from "../server/comfy-cloud-check";
import { BUILD_COMMIT } from "../shared/build-info";
import {
  validateIdempotencyKey,
  validateInput,
  validateQuoteId,
} from "../server/validation";
import { requireTake } from "../server/take";
import { history, ownedJob, rateLimit, sessionSource } from "./storage";
import { serveMedia, upload } from "./media";
import { poll, submit } from "./jobs";
import { quote } from "./quotes";
import { chainRoute } from "./chains";
import { sweep } from "./sweep";
import { galleryPage } from "../shared/gallery/page";
import { runnerRoute } from "./runner-routes";
import { RunnerStore, digest } from "./runner-store";
import { runtimeCapabilities } from "../shared/runtime-capabilities";

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
/** Bounds a JSON body even for clients using chunked transfer encoding. */
async function readJson(
  request: Request,
  maxBytes = 16 * 1024 * 1024,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new AppError(413, "The request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Expected a request body.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new AppError(413, "The request is too large.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(combined));
}

async function readInput(request: Request) {
  return validateInput(await readJson(request));
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (/^\/(watch|embed)\//.test(url.pathname)) {
      if (request.method !== "GET" && request.method !== "HEAD")
        return new Response(null, {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
      const page = galleryPage(url.pathname, url.origin);
      return page
        ? new Response(request.method === "HEAD" ? null : page.body, {
            headers: page.headers,
          })
        : new Response("Preview unavailable", { status: 404 });
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    let cookie: string | undefined;
    try {
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin)
        throw new AppError(403, "Use the studio to make this request.");
      if (request.headers.get("sec-fetch-site") === "cross-site")
        throw new AppError(403, "Use the studio to make this request.");
      const old = request.headers
        .get("cookie")
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("camera_session="))
        ?.slice(15);
      const session =
        old && /^[0-9a-f-]{36}$/.test(old) ? old : crypto.randomUUID();
      if (session !== old)
        cookie = `camera_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${url.protocol === "https:" ? "; Secure" : ""}`;
      if (
        url.pathname.startsWith("/api/runner/") ||
        url.pathname.startsWith("/api/agent/")
      ) {
        let result;
        try {
          result = await runnerRoute(
            request,
            new RunnerStore(env.DB),
            session,
            (bucket, id) => rateLimit(env, bucket, id),
            await digest(request.headers.get("cf-connecting-ip") || "local"),
          );
        } catch (error) {
          if (error instanceof AppError || error instanceof SyntaxError)
            throw error;
          // Validators supply safe messages; storage/runtime failures remain generic.
          throw new AppError(
            400,
            "Invalid runner request or unavailable relay.",
          );
        }
        const response = json(result);
        if (cookie) response.headers.append("Set-Cookie", cookie);
        return response;
      }
      const get = request.method === "GET";
      const post = request.method === "POST";
      const keyHeader = request.headers.get("x-byo-key");
      const key = keyHeader ? requireKey(keyHeader) : undefined;
      const settings = await deploymentSettingsRoute(
        request,
        env,
        session,
        () => readJson(request, 2048),
      );
      if (settings) {
        const response = json(settings);
        if (cookie) response.headers.append("Set-Cookie", cookie);
        return response;
      }
      if (post) {
        if (!key)
          throw new AppError(
            400,
            "Connect your Comfy or BFL key first.",
            "invalid_key",
          );
        const ip = request.headers.get("cf-connecting-ip") || "local";
        const hash = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(ip),
        );
        await rateLimit(
          env,
          "submitPerIp",
          Array.from(new Uint8Array(hash), (n) =>
            n.toString(16).padStart(2, "0"),
          ).join(""),
        );
        await rateLimit(env, "submit", session);
      }
      let response: Response;
      if (get && url.pathname === "/api/capabilities") {
        await rateLimit(env, "history", session);
        response = json(runtimeCapabilities("hosted"));
      } else if (get && url.pathname === "/api/health") {
        // Housekeeping rides on the two routes a page load hits once, never on
        // the 4-second poll, so its cost scales with visits rather than ticks.
        ctx.waitUntil(sweep(env).catch(() => {}));
        response = json({
          ok: true,
          hasServerKey: false,
          hosted: true,
          // The build this isolate was compiled from. A merged fix is not a
          // deployed one: the deploy job skips without credentials, so this is
          // how a caller (and CI) tells the live bundle from the checkout.
          commit: BUILD_COMMIT,
        });
      } else if (get && url.pathname === "/api/credits") {
        await rateLimit(env, "credits", session);
        const balanceKey = requireKey(key);
        const balance = await providerFor(
          balanceKey,
          defaultProviders(),
        ).balance(balanceKey);
        response = json({
          credits: balance.usdCents,
          checkedAt: balance.checkedAt,
          provider: providerFor(balanceKey, defaultProviders()).id,
        });
      } else if (get && url.pathname === "/api/settings/run-location") {
        // Hosted runs every workflow on Comfy Cloud and says so.
        await rateLimit(env, "history", session);
        response = json(await deploymentState(env, session));
      } else if (get && url.pathname === "/api/settings/workflows") {
        await rateLimit(env, "history", session);
        const catalogue = await deploymentCatalogue(env, session);
        if (url.searchParams.get("check") === "cloud") {
          await rateLimit(env, "credits", session);
          response = json(await checkedCloudCatalogue(catalogue, key));
        } else response = json(catalogue);
      } else if (
        post &&
        /^\/api\/settings\/deployment-assets\/[^/]+$/.test(url.pathname)
      ) {
        response = json(
          await deploymentUpload(
            request,
            env,
            session,
            url.pathname.split("/").at(-1)!,
            key!,
          ),
          201,
        );
      } else if (get && url.pathname === "/api/history") {
        await rateLimit(env, "history", session);
        ctx.waitUntil(sweep(env).catch(() => {}));
        response = json(await history(env, session));
      } else if (post && url.pathname === "/api/jobs") {
        const input = await readInput(request);
        response = json(
          {
            job: await submit(
              env,
              input,
              session,
              validateIdempotencyKey(request.headers.get("idempotency-key")),
              key!,
              url.origin,
              validateQuoteId(request.headers.get("quote-id") ?? undefined),
              undefined,
              undefined,
              readExpectation(
                request.headers.get("genobi-run-location") ?? undefined,
                request.headers.get("genobi-workflow") ?? undefined,
              ),
            ),
          },
          202,
        );
      } else if (post && url.pathname === "/api/quotes") {
        // Counted with the paid writes above: a quote prices a paid run.
        response = json(
          {
            quote: await quote(
              env,
              await readInput(request),
              session,
              key!,
              undefined,
              readExpectation(
                request.headers.get("genobi-run-location") ?? undefined,
                request.headers.get("genobi-workflow") ?? undefined,
              ),
            ),
          },
          201,
        );
      } else if (get && /^\/api\/jobs\/[^/]+$/.test(url.pathname)) {
        // Each poll can spend one upstream BFL call, so it needs its own ceiling.
        await rateLimit(env, "poll", session);
        response = json(
          await poll(env, url.pathname.split("/").at(-1)!, session, key),
        );
      } else if (get && /^\/api\/takes\/[^/]+$/.test(url.pathname)) {
        // A stored record, never a provider call: it reads like history.
        await rateLimit(env, "history", session);
        const row = await ownedJob(
          env,
          url.pathname.split("/").at(-1)!,
          session,
        );
        response = json({
          take: requireTake(
            JSON.parse(row.data),
            row.take ? JSON.parse(row.take) : undefined,
          ),
        });
      } else if (post && url.pathname === "/api/uploads") {
        await providerFor(key!, defaultProviders()).balance(key!);
        response = json({ source: await upload(request, env, session) }, 201);
      } else if (
        (get || request.method === "HEAD") &&
        /^\/api\/clips\/[^/]+$/.test(url.pathname)
      ) {
        await rateLimit(env, "media", session);
        // Library clips are static assets under /media; this route is private.
        const { key: objectKey } = await sessionSource(
          env,
          url.pathname.split("/").at(-1)!,
          session,
        );
        response = await serveMedia(request, env, objectKey);
      } else if (
        (get || request.method === "HEAD") &&
        /^\/api\/input\/[0-9a-f-]{72}$/.test(url.pathname)
      ) {
        const token = url.pathname.split("/").at(-1)!;
        // A capability link carries no cookie, so the token itself is the identity.
        await rateLimit(env, "media", token);
        const share = await env.DB.prepare(
          "SELECT object_key FROM shares WHERE token=? AND expires>?",
        )
          .bind(token, Date.now())
          .first<{ object_key: string }>();
        if (!share) throw new AppError(404, "Video link expired.");
        response = await serveMedia(request, env, share.object_key);
        response.headers.set("Cache-Control", "no-store");
      } else if (
        url.pathname === "/api/chains" ||
        url.pathname.startsWith("/api/chains/")
      ) {
        const result = await chainRoute(env, request, url, session, key, () =>
          readJson(request),
        );
        if (!result) throw new AppError(404, "API route not found.");
        response = json(result.body, result.status);
      } else throw new AppError(404, "API route not found.");
      if (cookie) response.headers.append("Set-Cookie", cookie);
      return response;
    } catch (error) {
      const response =
        error instanceof AppError
          ? json({ error: error.message, code: error.code }, error.status)
          : error instanceof SyntaxError
            ? json({ error: "The request was not valid JSON." }, 400)
            : json(
                {
                  error:
                    "The studio could not complete this request. Try again.",
                },
                500,
              );
      if (cookie) response.headers.append("Set-Cookie", cookie);
      return response;
    }
  },
  /**
   * The Workers deployment (wrangler.jsonc) drives the sweep from cron. Pages
   * has no cron trigger, so the same work also runs from the request path
   * above; `sweep` claims its turn either way and never runs twice.
   */
  async scheduled(_controller, env) {
    await sweep(env);
  },
} satisfies ExportedHandler<Env>;

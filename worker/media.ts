import { AppError } from "../server/errors";
import { toHex } from "../shared/take";
import {
  inspectUpload,
  UPLOAD_LABEL,
  UPLOAD_LIMITS,
  UPLOAD_MESSAGE,
  UPLOAD_SUFFIX,
  uploadType,
} from "../shared/uploads";
import { saveSource } from "./storage";
import type { Source } from "../shared/types";

export async function upload(request: Request, env: Env, session: string) {
  const type = uploadType(request.headers.get("content-type"));
  const size = Number(request.headers.get("content-length"));
  if (
    !type ||
    !request.body ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > UPLOAD_LIMITS[type.kind]
  )
    throw new AppError(400, UPLOAD_MESSAGE);
  const id = crypto.randomUUID();
  const key = `${session}/${id}.${UPLOAD_SUFFIX[type.kind]}`;
  try {
    // One pass: the bytes stream into R2 and through the hash together.
    const [stored, hashed] = request.body.tee();
    const digest = new crypto.DigestStream("SHA-256");
    await Promise.all([
      putMedia(
        env,
        key,
        stored,
        size,
        UPLOAD_LIMITS[type.kind],
        type.contentType,
      ),
      hashed.pipeTo(digest),
    ]);
    let metadata;
    try {
      metadata = await inspectUpload(type, size, async (offset, length) => {
        const chunk = await env.MEDIA.get(key, { range: { offset, length } });
        if (!chunk) throw new Error("Missing upload");
        return chunk.arrayBuffer();
      });
    } catch (error) {
      throw new AppError(400, (error as Error).message);
    }
    const label = (
      new URL(request.url).searchParams.get("filename") ||
      UPLOAD_LABEL[type.kind]
    )
      .split(/[\\/]/)
      .at(-1)!
      .replace(/[\x00-\x1f\x7f]/g, " ")
      .trim()
      .slice(0, 100);
    const source: Source = {
      id,
      label,
      url: `/api/clips/${id}`,
      origin: "upload",
      ...(type.kind === "video" ? {} : { mediaType: type.kind }),
      ...metadata,
    };
    await saveSource(
      env,
      source,
      session,
      key,
      size,
      toHex(await digest.digest),
    );
    return source;
  } catch (error) {
    await env.MEDIA.delete(key);
    throw error;
  }
}

/** R2 requires a known stream length; reject unbounded bodies rather than buffer video in Worker memory. */
export async function putMedia(
  env: Env,
  key: string,
  body: ReadableStream<Uint8Array>,
  size: number,
  max: number,
  contentType = "video/mp4",
) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > max)
    throw new AppError(502, "The video has an unsupported download size.");
  const stream = new FixedLengthStream(size);
  const copying = body.pipeTo(stream.writable);
  await Promise.all([
    copying,
    env.MEDIA.put(key, stream.readable, {
      httpMetadata: { contentType },
    }),
  ]);
}

export async function serveMedia(request: Request, env: Env, key: string) {
  const head = await env.MEDIA.head(key);
  if (!head) throw new AppError(404, "Video not found.");
  const headers = new Headers({
    "Content-Type": head.httpMetadata?.contentType ?? "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    ETag: head.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });
  let offset = 0,
    length = head.size,
    status = 200;
  const range = request.headers.get("range");
  if (
    range &&
    (!request.headers.has("if-range") ||
      request.headers.get("if-range") === head.httpEtag)
  ) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${head.size}` },
      });
    const end = match[1]
      ? match[2]
        ? Math.min(Number(match[2]), head.size - 1)
        : head.size - 1
      : head.size - 1;
    offset = match[1]
      ? Number(match[1])
      : Math.max(0, head.size - Number(match[2]));
    length = end - offset + 1;
    if (!Number.isSafeInteger(offset) || offset >= head.size || length <= 0)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${head.size}` },
      });
    status = 206;
    headers.set("Content-Range", `bytes ${offset}-${end}/${head.size}`);
  }
  headers.set("Content-Length", String(length));
  if (request.method === "HEAD") return new Response(null, { status, headers });
  const object = await env.MEDIA.get(key, { range: { offset, length } });
  if (!object) throw new AppError(404, "Video not found.");
  return new Response(object.body, { status, headers });
}

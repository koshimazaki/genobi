// The derived-media hand-in under test (Box 2.3): the local server with a fake
// ffmpeg that writes checked-in clips, a person's project with a one-use link
// code, and an agent that reaches it through its own MCP server or as a bare
// session cookie. No real ffmpeg, provider or browser is started.
import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";
import type { Run } from "../server/ffmpeg";
import { wav } from "./audio-fixtures";
import { studio } from "./project-copy-harness";

export const fixture = (name: string) => path.resolve("tests/fixtures", name);

const VIDEO_PROBE = {
  format: { duration: "10.0" },
  streams: [
    {
      codec_type: "video",
      codec_name: "h264",
      width: 640,
      height: 360,
      r_frame_rate: "24/1",
    },
  ],
};
const AUDIO_PROBE = {
  format: { duration: "4.0" },
  streams: [
    {
      codec_type: "audio",
      codec_name: "pcm_s16le",
      sample_rate: "8000",
      channels: 1,
    },
  ],
};

/** The bytes the fake writes: a video trim, a video join, an audio cut. */
export const OUTPUT = {
  trim: fixture("native-audio.mp4"),
  concat: fixture("aligned-audio.mp4"),
  audioSeconds: 1,
};

/**
 * ffmpeg as the media tools see it: a probe answers by the stored file's
 * type (`.audio` for sound, otherwise video), and each run writes a
 * checked-in clip, a one-second WAV or a PNG to its output path.
 */
export const fakeFfmpeg: Run = async (_command, args) => {
  if (args[0] === "-version") return "ffmpeg version test";
  const file = args.at(-1)!;
  if (args.includes("-show_entries"))
    return JSON.stringify(file.endsWith(".audio") ? AUDIO_PROBE : VIDEO_PROBE);
  if (file.endsWith(".audio")) await writeFile(file, wav(OUTPUT.audioSeconds));
  else if (file.endsWith(".image"))
    await copyFile(fixture("reference.png"), file);
  else
    await copyFile(
      args.some((arg) => arg.includes("concat=")) ? OUTPUT.concat : OUTPUT.trim,
      file,
    );
  return "";
};

/**
 * The person's project, pushed and with a link code, on a fake ffmpeg or,
 * where it is installed, the real one.
 */
export async function linkedStudio(run: Run | "real ffmpeg" = fakeFfmpeg) {
  const owner = await studio(
    undefined,
    run === "real ffmpeg" ? {} : { mediaTools: { run } },
  );
  await owner.upload(owner.cookie);
  await owner.push(owner.cookie, null, 1);
  const code = async () =>
    (await owner.send(owner.cookie, `/${owner.project.id}/link`, "POST"))
      .code as string;
  return { ...owner, code };
}
export type Owner = Awaited<ReturnType<typeof linkedStudio>>;

/** An agent's own MCP server, in its own studio session. */
export async function agentOn(base: string) {
  const api = new GenobiApi(studioUrl(base));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(api).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[])[0].text;
    return { error: result.isError === true, text };
  };
  /** A call that must succeed, its answer parsed. */
  const json = async (name: string, args: Record<string, unknown>) => {
    const result = await call(name, args);
    if (result.error) throw new Error(`${name}: ${result.text}`);
    return JSON.parse(result.text);
  };
  return { call, json, close: () => client.close() };
}

/** An agent as a bare session cookie, linked to the person's copy. */
export async function agentSession(owner: Owner) {
  const cookie = await owner.fresh();
  const request = (route: string, init: RequestInit = {}) =>
    fetch(`${owner.base}${route}`, {
      ...init,
      headers: { cookie, ...(init.headers as Record<string, string>) },
    });
  const post = (route: string, body: unknown) =>
    request(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const linked = await post("/api/projects/link", { code: await owner.code() });
  const copyId = ((await linked.json()) as { project: { copyId: string } })
    .project.copyId;
  const upload = async (bytes: Uint8Array<ArrayBuffer>, type: string) =>
    (
      (await (
        await request("/api/uploads?filename=track.wav", {
          method: "POST",
          headers: { "Content-Type": type },
          body: bytes,
        })
      ).json()) as { source: { id: string } }
    ).source.id;
  const handIn = (body: Record<string, unknown>) =>
    post(`/api/projects/${copyId}/takes`, body);
  return {
    cookie,
    /** The session id is the cookie's value. */
    session: cookie.slice("camera_session=".length),
    copyId,
    post,
    upload,
    handIn,
  };
}

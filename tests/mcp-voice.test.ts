import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenobiApi, studioUrl } from "../mcp/api";
import { commandSchema, commandTool } from "../cli/commands";
import { voiceConfig } from "../server/voice";
import { studio } from "./project-copy-harness";
import { mcpAgent } from "./mcp-agent-harness";
import { wav } from "./audio-fixtures";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe("local speech-to-text through MCP and CLI", () => {
  it("discovers the local worker and transcribes linked audio without starting a generation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "genobi-mcp-voice-"));
    directories.push(root);
    const python = path.join(root, "python3"),
      ffmpeg = path.join(root, "ffmpeg"),
      model = path.join(root, "model");
    for (const executable of [python, ffmpeg]) {
      await writeFile(executable, "#!/bin/sh\nexit 0\n");
      await chmod(executable, 0o755);
    }
    await mkdir(model);
    await writeFile(path.join(model, "config.json"), "{}");
    const start = vi.fn(() => ({
      ready: Promise.resolve({ model: "test", loadSeconds: 0 }),
      run: async () => ({
        segments: [{ start: 0, end: 1, text: "Make the light warmer." }],
        language: "English",
        inferSeconds: 0.1,
      }),
      kill: () => {},
    }));
    const decode = vi.fn(async () =>
      Float32Array.from(
        { length: 16_000 },
        (_, i) => Math.sin((2 * Math.PI * 220 * i) / 16_000) * 0.2,
      ),
    );
    const owner = await studio(undefined, {
      voice: {
        config: { ...voiceConfig({}), python, ffmpeg, model },
        start,
        decode,
      },
    });
    try {
      await owner.upload(owner.cookie);
      await owner.push(owner.cookie, null, 1);
      const agent = await mcpAgent(owner.base);
      const status = await agent.json("genobi_voice_status");
      expect(status).toMatchObject({ available: true, maxSeconds: 180 });
      expect(status.languages).toContain("English");
      expect(JSON.stringify(status)).not.toContain(root);
      expect(start).not.toHaveBeenCalled();
      const { code } = await owner.send(
        owner.cookie,
        `/${owner.project.id}/link`,
        "POST",
      );
      const { copyId } = await agent.json("genobi_link_project", { code });
      const result = await agent.json("genobi_voice_transcribe", {
        projectAsset: { copyId, assetId: "audio" },
        language: "English",
      });
      expect(JSON.stringify(result)).toContain("Make the light warmer.");
      expect(start).toHaveBeenCalledOnce();
      expect(decode).toHaveBeenCalledOnce();
      expect(owner.bfl.submissions).toBe(0);

      const other = await mcpAgent(owner.base);
      const refused = await other.call("genobi_voice_transcribe", {
        projectAsset: { copyId, assetId: "audio" },
      });
      expect(refused.error).toBe(true);
      expect(refused.text).toContain("Project not found");
      const filePath = path.join(root, "overlong.wav");
      await writeFile(filePath, wav(181));
      const tooLong = await agent.call("genobi_voice_transcribe", { filePath });
      expect(tooLong.error).toBe(true);
      expect(tooLong.text).toContain("duration limit");
      expect(decode).toHaveBeenCalledOnce();

      // The terminal command is this same tool, with the same schema and local route.
      const cli = commandTool(["voice", "transcribe"], false);
      await writeFile(filePath, wav(1));
      const args = commandSchema(cli).parse({ filePath, language: "English" });
      const answer = await cli.run(new GenobiApi(studioUrl(owner.base)), args);
      expect(JSON.stringify(answer)).toContain("Make the light warmer.");
      expect(decode).toHaveBeenCalledTimes(2);
    } finally {
      owner.voice.close();
    }
  });

  it("permits safe voice commands but never reads a filesystem path for a studio agent", async () => {
    const tool = commandTool(["voice-transcribe"], true);
    expect(commandTool(["voice-status"], true).name).toBe(
      "genobi_voice_status",
    );
    const fetcher = vi.fn<typeof fetch>();
    const api = new GenobiApi(studioUrl(), fetcher, true);
    await expect(tool.run(api, { filePath: "/etc/passwd" })).rejects.toThrow(
      "linked project",
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      commandSchema(tool).safeParse({
        sourceId: "source",
        filePath: "/tmp/audio.wav",
      }).success,
    ).toBe(false);
  });
});

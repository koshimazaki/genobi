// A finished take, or a local media tool's result, handed into a linked
// project copy, for agents (issue #15, Box 2.3). The MCP server holds its own
// studio session, so the files it makes are not the person's: the studio
// lists its Ready takes (`server/shared-takes.ts`) but no project receives
// them on its own. This route copies a take or a derived
// source the calling session owns into the copy's own file store as an asset
// with its generation record, at the revision the agent read, and announces
// it like any other agent write; the studio then reloads the copy and
// fetches the file from it. Local only, like the rest of the project copy.
import { readerOf } from "./agent-scope";
import { publicGenerationRecipe } from "../shared/director/generation-recipe";
import { createHash } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type express from "express";
import { recordFeedbackBase } from "../shared/director/feedback";
import type { Asset, Derivation, Project } from "../shared/director/types";
import type { RateBucket } from "../shared/limits";
import { AUDIO_EXTENSION } from "../shared/music";
import { MEDIA_SOURCE_ID } from "../shared/media-limits";
import { validateProject } from "../src/director/validate";
import { AppError } from "./errors";
import type { JobService } from "./jobs";
import {
  bounded,
  exactKeys,
  exists,
  isObject,
  namedBytes,
  requiredFiles,
  tooLarge,
} from "./project-bundle";
import { derivedMedia } from "./project-derived";
import { handInIds, holding, readMedia, type HandIn } from "./project-media";
import { ProjectCopies } from "./projects";
import type { Store } from "./store";
import { takeOutputs } from "../shared/take";

const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;
const EXTENSION: Record<string, string> = {
  "video/mp4": "mp4",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  ...AUDIO_EXTENSION,
};

/** The project copy, plus the one write an agent makes with media. */
export class AgentProjectCopies extends ProjectCopies {
  /**
   * Store a take's or a derived file's bytes in the copy's file store and add
   * them as a production asset with a generation record, at `baseRevision`.
   * A derived file's record names its operation and inputs, each input that
   * the project already holds as an `inputAssetIds` entry. Adding the same
   * file again answers with the asset already there.
   */
  addMedia(id: string, sessionId: string, base: number, media: HandIn) {
    const { assetId, generationId } = media;
    const sha256 = createHash("sha256").update(media.bytes).digest("hex");
    return this.run(async () => {
      const record = this.readable(id, sessionId);
      const held = record.project.assets[assetId];
      if (held?.file.sha256 === sha256)
        return answer(
          assetId,
          record.revision,
          false,
          held.kind,
          record.project.generations.find((g) => g.id === held.generationId)
            ?.derivation,
        );
      if (held)
        throw new AppError(
          409,
          `Asset id ${assetId} is taken.`,
          "asset_exists",
        );
      if (base !== record.revision)
        throw new AppError(
          409,
          "The project copy has changed since that revision. Read it again before writing.",
          "revision_conflict",
          { revision: record.revision },
        );
      const project: Project = structuredClone(record.project);
      const inputs = (media.derived?.sources ?? []).map((source) =>
        holding(project, source),
      );
      const derivation: Derivation | undefined = media.derived && {
        operation: media.derived.operation,
        sources: media.derived.sources.map((source, i) => ({
          kind: source.kind,
          origin: source.origin,
          ...(inputs[i] ? { assetId: inputs[i] } : {}),
        })),
      };
      const asset: Asset = {
        kind: media.kind,
        use: "production",
        file: {
          path: `media/${assetId}.${EXTENSION[media.contentType]}`,
          sha256,
        },
        ...(media.durationSeconds === undefined
          ? {}
          : { durationSeconds: media.durationSeconds }),
        origin: "generated",
        generationId,
      };
      project.assets[assetId] = asset;
      project.generations.push({
        id: generationId,
        inputAssetIds: [
          ...new Set(inputs.filter((input) => input !== undefined)),
        ],
        referenceAssetIds: [],
        outputAssetIds: [assetId],
        prompt: media.prompt.slice(0, 2000),
        tool: media.tool,
        ...(media.recipe ? { recipe: media.recipe } : {}),
        ...(derivation ? { derivation } : {}),
      });
      project.revision = record.revision + 1;
      try {
        validateProject(project);
      } catch (error) {
        throw new AppError(422, bounded(error), "take_refused");
      }
      const files = path.join(this.dir(record.sessionId, record.id), "files");
      const target = path.join(files, sha256);
      const fresh = !(await exists(target));
      if (fresh) {
        await mkdir(files, { recursive: true, mode: 0o700 });
        await writeFile(`${target}.tmp`, media.bytes, { mode: 0o600 });
        await rename(`${target}.tmp`, target);
      }
      if (
        (await namedBytes(files, requiredFiles(project, record.brief))) >
        this.projectBytes
      ) {
        if (fresh) await rm(target, { force: true });
        throw tooLarge();
      }
      const next = {
        ...record,
        revision: project.revision,
        // An agent's write: feedback is measured from here, as after a command.
        project: recordFeedbackBase({
          project,
          prompt: record.brief?.text ?? "",
        }).project,
        updatedAt: new Date().toISOString(),
      };
      await this.save(next, "agent");
      // Announced as an agent write with no command: the studio reloads the
      // copy, fetching the new file from it.
      this.emit(next, { baseRevision: record.revision, source: "command" });
      return answer(assetId, next.revision, true, media.kind, derivation);
    });
  }
}

const answer = (
  assetId: string,
  revision: number,
  added: boolean,
  kind: Asset["kind"],
  derivation?: Derivation,
) => ({
  assetId,
  revision,
  added,
  kind,
  ...(derivation ? { derivation } : {}),
});

/**
 * The take a session owns (or, for an agent, a take its person picked), read
 * and checked as Director media.
 */
async function takeMedia(
  service: JobService,
  store: Store,
  jobId: string,
  sessionId: string,
  outputId?: string,
): Promise<HandIn> {
  const job = service.owned(jobId, sessionId);
  if (job.status !== "Ready" || !job.take)
    throw new AppError(
      409,
      "That job has no finished take yet.",
      "take_not_ready",
    );
  const missing = () =>
    new AppError(404, "The take's media is no longer stored.", "take_missing");
  const selected = takeOutputs(job).find(
    (output) => output.assetId === (outputId ?? job.id),
  );
  if (!selected)
    throw new AppError(
      404,
      "That output does not belong to this take.",
      "take_missing",
    );
  const source = store.data.sources.find(
    (s) => s.id === selected.assetId && s.sessionId === sessionId,
  );
  if (!source || !selected.available) throw missing();
  const kind = selected.mediaType;
  return {
    ...handInIds("take", selected.assetId),
    kind,
    ...(await readMedia(source.filePath, kind, missing)),
    prompt: job.prompt,
    tool: "Genobi take, handed in by an agent",
    recipe: publicGenerationRecipe(job.take.recipe),
  };
}

/**
 * `POST /api/projects/:id/takes` with `{jobId, baseRevision, outputId?}` for a take, or
 * `{sourceId, baseRevision}` for a media tool's result.
 */
export function takeToProject(
  service: JobService,
  store: Store,
  copies: AgentProjectCopies,
  limit: (bucket: RateBucket, id: string) => void,
): express.RequestHandler {
  return async (request, response) => {
    const sessionId = response.locals.sessionId as string;
    limit("edit", sessionId);
    const body: unknown = request.body;
    const job = isObject(body) && "jobId" in body;
    if (
      !isObject(body) ||
      !exactKeys(body, ["jobId", "sourceId", "baseRevision", "outputId"]) ||
      "jobId" in body === "sourceId" in body ||
      (job
        ? typeof body.jobId !== "string" || !JOB_ID.test(body.jobId)
        : typeof body.sourceId !== "string" ||
          !MEDIA_SOURCE_ID.test(body.sourceId)) ||
      (body.outputId !== undefined &&
        (!job ||
          typeof body.outputId !== "string" ||
          !MEDIA_SOURCE_ID.test(body.outputId))) ||
      !Number.isSafeInteger(body.baseRevision) ||
      (body.baseRevision as number) < 1
    )
      throw new AppError(
        400,
        "Send jobId (a take) or sourceId (a media tool's result), and the baseRevision you read.",
        "invalid_take",
      );
    // The media is read as its owner: the agent's own run or result, or one
    // the person picked (agent-scope.ts). The project is still the agent's
    // own link: `addMedia` checks it against this session.
    const id = String(job ? body.jobId : body.sourceId);
    const reader = readerOf(response.locals, id);
    const media = job
      ? await takeMedia(
          service,
          store,
          id,
          reader,
          body.outputId as string | undefined,
        )
      : await derivedMedia(service, store, id, reader, (step) =>
          readerOf(response.locals, step),
        );
    response.json(
      await copies.addMedia(
        String(request.params.id),
        sessionId,
        body.baseRevision as number,
        media,
      ),
    );
  };
}

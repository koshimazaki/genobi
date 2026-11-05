import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { recordFeedbackBase } from "../shared/director/feedback";
import { applyMediaOperation } from "../shared/director/media-operations";
import type { Asset } from "../shared/director/types";
import { ASSET_MEDIA_TYPES } from "../shared/director/asset-media";
import {
  projectMediaWrite,
  type MediaOperationReceipt,
} from "../shared/project-media-command";
import { activeReferences } from "../src/director/prompt-brief";
import { validateProject } from "../src/director/validate";
import { AppError } from "./errors";
import {
  bounded,
  exists,
  namedBytes,
  requiredFiles,
  tooLarge,
} from "./project-bundle";
import { AgentProjectCopies } from "./project-takes";
import type { ProjectMediaStaging } from "./project-media-stage";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Agent asset writes preserve the owner copy's revision, grant and media rules. */
export class MediaProjectCopies extends AgentProjectCopies {
  mediaOperation(
    id: string,
    session: string,
    body: unknown,
    staging: ProjectMediaStaging,
  ) {
    const parsed = projectMediaWrite.safeParse(body);
    if (!parsed.success)
      throw new AppError(
        400,
        "Send requestId, baseRevision and a valid media command.",
        "invalid_media_command",
      );
    const { requestId, baseRevision, command } = parsed.data;
    const caller = hash(session),
      digest = hash(JSON.stringify(parsed.data));
    return this.run(async () => {
      const record = this.readable(id, session);
      const prior = record.mediaWrites?.find(
        (write) => write.caller === caller && write.requestId === requestId,
      );
      if (prior) {
        if (prior.digest !== digest)
          throw new AppError(
            409,
            "That requestId already names a different media operation.",
            "media_request_conflict",
          );
        return {
          ...prior.receipt,
          replayed: true,
          currentRevision: record.revision,
        };
      }
      if (baseRevision !== record.revision)
        throw new AppError(
          409,
          "The project changed. Read it again and preserve those edits before a new operation.",
          "revision_conflict",
          { revision: record.revision },
        );
      if (
        command.op === "remove" &&
        record.brief &&
        activeReferences(record.brief).some(
          (reference) => reference.assetId === command.assetId,
        )
      )
        throw new AppError(
          409,
          "Asset is used in the project prompt. Swap or remove that reference first.",
          "asset_in_use",
        );
      let imported: { id: string; asset: Asset } | undefined;
      let upload: Awaited<ReturnType<ProjectMediaStaging["read"]>> | undefined;
      if ("receiptId" in command) {
        upload = await staging.read(record.copyId, session, command.receiptId);
        const media = upload.receipt;
        const use = command.op === "attach" ? command.use : "production";
        const assetId = `asset-${media.sha256.slice(0, 46)}-${use === "reference" ? "ref" : "prod"}`;
        imported = {
          id: assetId,
          asset: {
            kind: media.kind,
            use,
            origin: "uploaded",
            file: {
              path: `media/${assetId}.${ASSET_MEDIA_TYPES[media.contentType].extension}`,
              sha256: media.sha256,
            },
            ...(media.kind === "image"
              ? {}
              : { durationSeconds: media.duration }),
          },
        };
      }
      let result;
      try {
        result = applyMediaOperation(
          record.project,
          command,
          `asset-${randomUUID()}`,
          imported,
        );
        validateProject(result.project);
      } catch (error) {
        throw new AppError(422, bounded(error), "media_operation_refused");
      }
      const files = path.join(this.dir(record.sessionId, record.id), "files");
      const needed = requiredFiles(result.project, record.brief);
      for (const sha of needed)
        if (
          sha !== upload?.receipt.sha256 &&
          !(await exists(path.join(files, sha)))
        )
          throw new AppError(
            409,
            "A referenced project file is missing. Restore it before editing media.",
            "files_missing",
          );
      const target = upload && path.join(files, upload.receipt.sha256);
      const fresh = !!target && !(await exists(target));
      const temp = target && `${target}.${randomUUID()}.tmp`;
      const receipt: MediaOperationReceipt = {
        requestId,
        copyId: record.copyId,
        sourceRevision: baseRevision,
        revision: result.project.revision,
        assetIds: result.assetIds,
        layerIds: result.layerIds,
      };
      try {
        if (fresh && upload && temp && target) {
          await mkdir(files, { recursive: true, mode: 0o700 });
          await writeFile(temp, upload.bytes, { mode: 0o600 });
          await rename(temp, target);
        }
        if ((await namedBytes(files, needed)) > this.projectBytes)
          throw tooLarge();
        const next = {
          ...record,
          revision: receipt.revision,
          project: recordFeedbackBase({
            project: result.project,
            prompt: record.brief?.text ?? "",
          }).project,
          updatedAt: new Date().toISOString(),
          mediaWrites: [
            ...(record.mediaWrites ?? []).slice(-63),
            { caller, requestId, digest, receipt },
          ],
        };
        // Commit the result and its replay receipt together, before acknowledgement.
        await this.save(next, "agent");
      } catch (error) {
        const committed = this.readable(id, session).mediaWrites?.some(
          (write) => write.caller === caller && write.requestId === requestId,
        );
        if (!committed && fresh && target) await rm(target, { force: true });
        throw error;
      } finally {
        if (temp) await rm(temp, { force: true });
      }
      this.emit(this.readable(id, session), {
        baseRevision,
        source: "command",
      });
      return { ...receipt, replayed: false, currentRevision: receipt.revision };
    });
  }
}

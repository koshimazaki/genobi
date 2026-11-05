import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { inspectAudio } from "../shared/audio";
import { inspectImage } from "../shared/image";
import { inspectMp4 } from "../shared/mp4";
import {
  MEDIA_RECEIPT_ID,
  PROJECT_MEDIA_STAGE_MS,
  PROJECT_MEDIA_STAGE_BYTES,
  PROJECT_MEDIA_STAGE_FILES,
  PROJECT_MEDIA_STAGE_TOTAL,
  type ProjectMediaReceipt,
} from "../shared/project-media";
import { UPLOAD_LIMITS, uploadType } from "../shared/uploads";
import { AppError } from "./errors";
import { bounded } from "./project-bundle";
import type { ProjectCopies } from "./projects";

const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const missing = () =>
  new AppError(
    404,
    "Media receipt missing or expired. Stage the file again in this session and project.",
    "media_receipt_missing",
  );

/** A receipt is committed only after the full, hash-checked file is inspected. */
export class ProjectMediaStaging {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private copies: ProjectCopies,
    private clock: () => number = Date.now,
    private quota = PROJECT_MEDIA_STAGE_TOTAL,
  ) {}

  /** Startup reclaims interrupted or expired uploads without touching project files. */
  async sweep() {
    const root = path.join(this.copies.directory, "project-media-staging");
    for (const owner of await readdir(root).catch(() => [] as string[])) {
      const ownerDir = path.join(root, owner);
      for (const copy of await readdir(ownerDir).catch(() => [] as string[])) {
        const directory = path.join(ownerDir, copy);
        for (const id of await readdir(directory)) {
          try {
            await this.receipt(directory, id);
          } catch {
            await rm(path.join(directory, id), {
              recursive: true,
              force: true,
            });
          }
        }
        if (!(await readdir(directory)).length)
          await rm(directory, { recursive: true });
      }
      if (!(await readdir(ownerDir)).length)
        await rm(ownerDir, { recursive: true });
    }
  }

  private directory(copyId: string, session: string) {
    // Every operation checks the current grant; a receipt never grants access.
    const copy = this.copies.read(copyId, session);
    return {
      copyId: copy.copyId,
      directory: path.join(
        this.copies.directory,
        "project-media-staging",
        hash(session),
        copy.copyId,
      ),
    };
  }

  private async receipt(directory: string, id: string) {
    try {
      const receipt = JSON.parse(
        await readFile(path.join(directory, id, "receipt.json"), "utf8"),
      ) as ProjectMediaReceipt;
      if (
        receipt.receiptId !== id ||
        receipt.sha256 !== id ||
        !Number.isSafeInteger(receipt.byteLength) ||
        receipt.byteLength <= 0 ||
        receipt.byteLength > PROJECT_MEDIA_STAGE_BYTES ||
        Date.parse(receipt.expiresAt) <= this.clock() ||
        !Number.isFinite(Date.parse(receipt.expiresAt))
      )
        throw missing();
      return receipt;
    } catch {
      throw missing();
    }
  }

  /** Exact retry/read after a lost acknowledgement; foreign sessions see nothing. */
  async read(copyId: string, session: string, id: string) {
    const { directory, copyId: canonical } = this.directory(copyId, session);
    if (!MEDIA_RECEIPT_ID.test(id)) throw missing();
    const receipt = await this.receipt(directory, id);
    const file = path.join(directory, id, "media");
    const size = await stat(file).catch(() => {
      throw missing();
    });
    if (!size.isFile() || size.size !== receipt.byteLength) throw missing();
    const bytes = await readFile(file).catch(() => {
      throw missing();
    });
    if (
      receipt.copyId !== canonical ||
      bytes.length !== receipt.byteLength ||
      hash(bytes) !== id
    )
      throw missing();
    return { receipt, bytes };
  }

  stage(
    copyId: string,
    session: string,
    sha256: string,
    bytes: Buffer,
    declared: string | undefined,
  ) {
    const run = this.queue
      .catch(() => {})
      .then(() => this.store(copyId, session, sha256, bytes, declared));
    this.queue = run;
    return run;
  }

  private async store(
    copyId: string,
    session: string,
    sha256: string,
    bytes: Buffer,
    declared: string | undefined,
  ) {
    const { directory, copyId: canonical } = this.directory(copyId, session);
    const type = uploadType(declared);
    if (
      !type ||
      !MEDIA_RECEIPT_ID.test(sha256) ||
      bytes.length === 0 ||
      bytes.length > PROJECT_MEDIA_STAGE_BYTES ||
      bytes.length > UPLOAD_LIMITS[type.kind]
    )
      throw new AppError(
        400,
        "Stage a supported image, audio or MP4 file within its upload limit, named by SHA-256.",
        "invalid_media",
      );
    if (hash(bytes) !== sha256)
      throw new AppError(
        400,
        "The media does not match its SHA-256.",
        "media_hash_mismatch",
      );
    const read = async (offset: number, length: number) =>
      new Uint8Array(bytes.subarray(offset, offset + length)).buffer;
    let metadata;
    try {
      metadata =
        type.kind === "image"
          ? inspectImage(bytes)
          : type.kind === "audio"
            ? await inspectAudio(bytes.length, read)
            : {
                ...(await inspectMp4(bytes.length, read)),
                contentType: "video/mp4",
              };
      if (metadata.contentType !== type.contentType)
        throw new Error("The media contents do not match the declared type.");
    } catch (error) {
      throw new AppError(422, bounded(error), "invalid_media");
    }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let total = 0;
    let count = 0;
    for (const id of await readdir(directory)) {
      try {
        const held = await this.receipt(directory, id);
        total += held.byteLength;
        count++;
      } catch {
        await rm(path.join(directory, id), { recursive: true, force: true });
      }
    }
    try {
      const held = await this.read(copyId, session, sha256);
      return { receipt: held.receipt, stored: false };
    } catch (error) {
      if (!(
        error instanceof AppError && error.code === "media_receipt_missing"
      ))
        throw error;
      // A committed receipt whose bytes were damaged cannot block a clean retry.
      try {
        const damaged = await this.receipt(directory, sha256);
        total -= damaged.byteLength;
        count--;
        await rm(path.join(directory, sha256), {
          recursive: true,
          force: true,
        });
      } catch {
        /* No valid receipt was present. */
      }
    }
    if (total + bytes.length > this.quota || count >= PROJECT_MEDIA_STAGE_FILES)
      throw new AppError(
        413,
        "This project's staged media is full. Wait for receipts to expire, then stage fewer or smaller files.",
        "media_stage_full",
      );
    const receipt: ProjectMediaReceipt = {
      receiptId: sha256,
      copyId: canonical,
      sha256,
      byteLength: bytes.length,
      kind: type.kind,
      ...metadata,
      expiresAt: new Date(this.clock() + PROJECT_MEDIA_STAGE_MS).toISOString(),
    };
    const target = path.join(directory, sha256);
    const temporary = path.join(directory, `pending-${randomUUID()}`);
    try {
      await mkdir(temporary, { mode: 0o700 });
      await writeFile(path.join(temporary, "media"), bytes, { mode: 0o600 });
      await writeFile(
        path.join(temporary, "receipt.json"),
        JSON.stringify(receipt),
        { mode: 0o600 },
      );
      await rename(temporary, target);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
    return { receipt, stored: true };
  }
}

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
import {
  EXPORT_BYTES,
  EXPORT_RETENTION_MS,
  exportRequest,
  exportReceipt,
  exportFileInfo,
  sameExportSource,
  type ExportReceipt,
  type ExportRequest,
} from "../shared/browser-export";
import { AppError } from "./errors";
import { inspectExport } from "./export-inspection";

export const exportIdentity = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export interface StoredExport {
  id: string;
  owner: string;
  caller: string;
  digest: string;
  request: ExportRequest;
  receipt: ExportReceipt;
}
const UUID = /^[a-f0-9-]{36}$/;
/** Completed artifacts outlive the browser and restart, with bounded private retention. */
export class ExportArtifacts {
  readonly records = new Map<string, StoredExport>();
  private root: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    directory: string,
    private now = Date.now,
  ) {
    this.root = path.join(directory, "browser-exports");
  }
  async load() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const name of await readdir(this.root)) {
      if (!UUID.test(name)) {
        if (/^[a-f0-9-]{36}\.[a-f0-9-]{36}\.tmp$/.test(name))
          await rm(path.join(this.root, name), {
            recursive: true,
            force: true,
          });
        continue;
      }
      try {
        if (
          (await stat(path.join(this.root, name, "receipt.json"))).size >
            16_000 ||
          (await stat(this.file(name))).size > EXPORT_BYTES
        )
          throw new Error("Artifact exceeds limits");
        const record = JSON.parse(
          await readFile(path.join(this.root, name, "receipt.json"), "utf8"),
        ) as StoredExport;
        exportRequest.parse(record.request);
        exportReceipt.parse(record.receipt);
        const r = record.receipt;
        const { extension, contentType } = exportFileInfo(
          record.request.format,
        );
        if (
          !sameExportSource(r.source, record.request.source) ||
          r.format !== record.request.format ||
          r.file !== `${r.source.id}-r${r.source.revision}.${extension}` ||
          r.contentType !== contentType ||
          r.download !== `/api/exports/${name}/artifact` ||
          Date.parse(r.createdAt) > this.now() ||
          Date.parse(r.expiresAt) - Date.parse(r.createdAt) !==
            EXPORT_RETENTION_MS
        )
          throw new Error("Invalid artifact receipt");
        if (
          !/^[a-f0-9]{64}$/.test(record.owner) ||
          !/^[a-f0-9]{64}$/.test(record.caller) ||
          record.digest !== exportIdentity(JSON.stringify(record.request))
        )
          throw new Error("Invalid artifact identity");
        if (
          record.id !== name ||
          record.receipt.artifactId !== name ||
          !Number.isFinite(Date.parse(record.receipt.expiresAt)) ||
          Date.parse(record.receipt.expiresAt) <= this.now()
        )
          throw new Error("Expired artifact");
        const bytes = await readFile(path.join(this.root, name, "artifact"));
        if (bytes.length !== record.receipt.byteLength)
          throw new Error("Invalid artifact");
        if (
          createHash("sha256").update(bytes).digest("hex") !==
          record.receipt.sha256
        )
          throw new Error("Changed artifact");
        this.records.set(name, record);
      } catch {
        await rm(path.join(this.root, name), { recursive: true, force: true });
      }
    }
    await this.sweep();
  }
  async sweep() {
    for (const [id, r] of this.records)
      if (Date.parse(r.receipt.expiresAt) <= this.now()) {
        this.records.delete(id);
        await rm(path.join(this.root, id), { recursive: true, force: true });
      }
  }
  file(id: string) {
    return path.join(this.root, id, "artifact");
  }
  save(
    id: string,
    owner: string,
    caller: string,
    request: ExportRequest,
    bytes: Buffer,
  ) {
    const run = this.queue.then(async () => {
      await this.sweep();
      const records = [...this.records.values()];
      if (
        records.length >= 32 ||
        records.reduce((sum, r) => sum + r.receipt.byteLength, bytes.length) >
          600 * 1024 * 1024 ||
        records
          .filter((r) => r.owner === owner)
          .reduce((sum, r) => sum + r.receipt.byteLength, bytes.length) >
          300 * 1024 * 1024
      )
        throw new AppError(
          413,
          "Export storage is full. Download existing artifacts and wait for their one-hour expiry.",
          "export_storage_full",
        );
      const info = await inspectExport(request, bytes);
      const receipt: ExportReceipt = {
        artifactId: id,
        source: request.source,
        format: request.format,
        file: `${request.source.id}-r${request.source.revision}.${info.extension}`,
        contentType: info.contentType,
        byteLength: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        download: `/api/exports/${id}/artifact`,
        createdAt: new Date(this.now()).toISOString(),
        expiresAt: new Date(this.now() + EXPORT_RETENTION_MS).toISOString(),
      };
      const record = {
        id,
        owner,
        caller,
        request,
        digest: exportIdentity(JSON.stringify(request)),
        receipt,
      };
      const temporary = path.join(this.root, `${id}.${randomUUID()}.tmp`);
      try {
        await mkdir(temporary, { mode: 0o700 });
        await writeFile(path.join(temporary, "artifact"), bytes, {
          mode: 0o600,
        });
        await writeFile(
          path.join(temporary, "receipt.json"),
          JSON.stringify(record),
          { mode: 0o600 },
        );
        await rename(temporary, path.join(this.root, id));
        this.records.set(id, record);
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
      return record;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}

import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";

export const INPUT_LIMIT = 24 * 1024 * 1024;
export async function readJsonInput(
  value?: string,
  stdin: Readable = process.stdin,
): Promise<unknown> {
  if (value === undefined) return {};
  let text = value;
  if (value === "-" || value.startsWith("@")) {
    const source = value === "-" ? stdin : createReadStream(value.slice(1));
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of source) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > INPUT_LIMIT) throw new Error("JSON input exceeds 24 MiB.");
      chunks.push(bytes);
    }
    text = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.byteLength(text) > INPUT_LIMIT)
    throw new Error("JSON input exceeds 24 MiB.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "Invalid JSON input. Use --input @file.json or --input - with JSON on stdin.",
    );
  }
}

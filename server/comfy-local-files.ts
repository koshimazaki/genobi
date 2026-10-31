import type { WorkflowOutput } from "../shared/comfy/workflow";

export const FILE_NAME = /^[A-Za-z0-9_()-][A-Za-z0-9 _.()-]{0,254}$/;
const MEDIA: Record<string, WorkflowOutput["media"]> = {
  mp4: "video",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  mp3: "audio",
  wav: "audio",
  flac: "audio",
};
interface SavedFile {
  filename: string;
  subfolder: string;
  type: string;
}

export const safeSubfolder = (value: string) =>
  value === "" ||
  (value.length <= 512 &&
    value.split("/").every((part) => FILE_NAME.test(part) && part !== ".."));

/** Validated output files retain their node identity, never a global fallback. */
export function localOutputFiles(outputs: Record<string, unknown>) {
  return Object.entries(outputs).flatMap(([nodeId, output]) => {
    if (!output || typeof output !== "object") return [];
    return Object.values(output).flatMap((list) =>
      Array.isArray(list)
        ? list.flatMap((item: SavedFile | null) => {
            if (
              typeof item?.filename !== "string" ||
              typeof (item.subfolder ?? "") !== "string" ||
              item.type !== "output" ||
              !FILE_NAME.test(item.filename) ||
              !safeSubfolder(item.subfolder ?? "")
            )
              return [];
            const type =
              MEDIA[
                item.filename
                  .slice(item.filename.lastIndexOf(".") + 1)
                  .toLowerCase()
              ];
            return type ? [{ nodeId, type, file: item }] : [];
          })
        : [],
    );
  });
}

export function localOutputUrl(base: string, file: SavedFile) {
  const query = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder ?? "",
    type: "output",
  });
  return `${base}/view?${query}`;
}

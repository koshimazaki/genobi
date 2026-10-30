import type { memoryContext } from "../../shared/memory/context";
import type { ProjectMemory, TasteProfile } from "../../shared/memory/schema";
import type { TasteShelf } from "../../shared/licensing/taste-shelf";
export type MemoryContext = ReturnType<typeof memoryContext> & {
  copyId: string;
  revision: number;
  tasteRevision: number;
};
export async function memoryRequest<T>(
  route: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `/api/memory/${route}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Genobi-Owner-Action": "1",
          },
          body: JSON.stringify(body),
        },
  );
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "Project memory is available in the local studio. Save the project there first.",
    );
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(
        typeof data.error === "string"
          ? data.error
          : "Project memory is available in the local studio. Save the project there first.",
      ),
      { status: response.status },
    );
  return data as T;
}
export const readProfile = () => memoryRequest<TasteProfile>("taste");
export function downloadMemory(
  value: ProjectMemory | TasteProfile | TasteShelf,
  name: string,
) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

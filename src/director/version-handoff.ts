import { versionSlots } from "../../shared/templates/version";
import {
  findHouseTemplate,
  findMixTemplate,
} from "../../shared/templates/catalogue";

/** Public template identity only. Uploaded media and edits travel in the explicit ZIP. */
export function versionStudioUrl(
  template: string,
  workspace: string,
  make: readonly string[] = [],
) {
  if (!findHouseTemplate(template) && !findMixTemplate(template))
    throw new Error("This template is unavailable.");
  const url = new URL("http://127.0.0.1:4317/director");
  url.searchParams.set("example", template);
  url.searchParams.set(
    "workspace",
    workspace === "editor" ? "editor" : "director",
  );
  url.searchParams.set("handoff", "project-zip");
  const declared = versionSlots(
    (findHouseTemplate(template) ?? findMixTemplate(template))!,
  ).map((slot) => slot.id);
  const requested = make.filter((id) => declared.includes(id));
  url.searchParams.set("generate", requested.join(","));
  return url.href;
}

export function versionRequestedSlots(template: string, search: string) {
  const found = findHouseTemplate(template) ?? findMixTemplate(template);
  if (!found) return [];
  const requested =
    new URLSearchParams(search).get("generate")?.slice(0, 2048).split(",") ??
    [];
  return versionSlots(found)
    .map((slot) => slot.id)
    .filter((id) => requested.includes(id));
}

import catalogue from "./catalog.json";
import {
  parseUsage,
  type Decision,
  type TasteLibrary,
  type UsagePreference,
} from "./types";
export const tasteLibraries = catalogue as TasteLibrary[];

/** Checks a selected inventory, not all transitive dependencies or legal rights. */
export function licenceReport(
  usage: UsagePreference,
  ids: string[],
  stage: "planned" | "used" = "planned",
  versions: Record<string, string> = {},
) {
  usage = parseUsage(usage);
  if (
    !Array.isArray(ids) ||
    ids.length > 100 ||
    ids.some(
      (id) => typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(id),
    )
  )
    throw new Error("Use at most 100 component IDs");
  if (!["planned", "used"].includes(stage))
    throw new Error("Invalid report stage");
  const selected = new Set(ids);
  // Known dependencies must not disappear because a wrapper is MIT.
  for (const id of selected) {
    tasteLibraries
      .find((item) => item.id === id)
      ?.requires?.forEach((dependency) => selected.add(dependency));
  }
  if (
    !versions ||
    typeof versions !== "object" ||
    Array.isArray(versions) ||
    Object.keys(versions).length > 100 ||
    Object.entries(versions).some(
      ([id, version]) =>
        !selected.has(id) ||
        typeof version !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(version),
    )
  )
    throw new Error(
      "Supply exact versions only for selected components and dependencies",
    );
  const rows = [...selected].map((id) => {
    const item = tasteLibraries.find((entry) => entry.id === id);
    let decision: Decision = "conditions";
    let reason =
      item?.conditions ??
      "Unknown component or asset rights. Verify exact version, licence, source and intended use.";
    if (!item) decision = "review";
    else if (usage.policy === "mit-only" && item.license !== "MIT") {
      decision = "excluded";
      reason = `Does not meet strict MIT-only selection (${item.license}).`;
    } else if (usage.policy === "open-source" && !item.openSource) {
      decision = "excluded";
      reason =
        "Not recorded as open-source licensed; choose another component.";
    } else if (
      ["redistribute-source", "resell-template"].includes(usage.purpose) &&
      item.redistribution === "review"
    ) {
      decision = "review";
      reason = `Check redistribution conditions for this deliverable. ${reason}`;
    }
    if (item && decision !== "excluded") {
      if (item.selectionReview) {
        decision = "review";
        reason = `${item.selectionReview} ${reason}`;
      }
      if (
        stage === "used" &&
        (!versions[id] || versions[id] !== item.version)
      ) {
        decision = "review";
        reason = `${versions[id] ? "Actual version differs from the reviewed catalogue." : "Actual version was not supplied."} Verify the exact version and its notices. ${reason}`;
      }
    }
    return {
      id,
      name: item?.name ?? id,
      author: item?.author ?? "Unverified",
      license: item?.license ?? "Unknown",
      source: item?.source ?? null,
      version:
        stage === "used" ? (versions[id] ?? null) : (item?.version ?? null),
      reviewedVersion: item?.version ?? null,
      checked: item?.checked ?? null,
      decision,
      reason,
      dependency: !ids.includes(id),
    };
  });
  return {
    version: 2,
    stage,
    usage,
    scope:
      "Caller-supplied inventory plus known dependencies; not an audit or legal clearance. Models, API terms, fonts, music, images and unlisted dependencies require separate evidence.",
    needsReview:
      rows.length === 0 || rows.some((row) => row.decision !== "conditions"),
    rows,
  };
}
export function licenceMarkdown(report: ReturnType<typeof licenceReport>) {
  const safe = (s: string) => s.replace(/[|\n\r]/g, " ");
  return [
    "# Run licences and credits",
    "",
    `Inventory: ${report.stage}. Intended use: ${report.usage.purpose}. Preference: ${report.usage.policy}.`,
    "",
    report.scope,
    "",
    "This report does not change the licences or grant missing rights.",
    "",
    "| Component / creator | Version | Licence | Check | Conditions / source |",
    "| --- | --- | --- | --- | --- |",
    ...report.rows.map(
      (r) =>
        `| ${safe(r.name)} — ${safe(r.author)} | ${safe(r.version ?? "unknown")} | ${r.license} | ${r.decision} | ${safe(r.reason)} ${r.source ?? "Source needed"} |`,
    ),
    "",
    "Retain original LICENSE/NOTICE files when required. A recommendation is not evidence that a component was used. Record all actual components, model routes and input-asset rights before publication.",
    "",
  ].join("\n");
}

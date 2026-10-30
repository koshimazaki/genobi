/** Legacy job links remain readable; IDs never bypass session ownership checks. */
export function jobIdFromUrl(url: string): string | null {
  return validId(new URL(url).searchParams.get("job"));
}
function validId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
    ? value
    : null;
}
export function selectedJob(url: string, state: unknown): string | null {
  return (
    jobIdFromUrl(url) ??
    validId(
      state && typeof state === "object" && !Array.isArray(state)
        ? (state as Record<string, unknown>).studioJobId
        : null,
    )
  );
}
export function jobHistoryState(state: unknown, id: string | null) {
  return {
    ...(state && typeof state === "object" && !Array.isArray(state)
      ? state
      : {}),
    studioJobId: validId(id),
  };
}
export function cleanJobUrl(url: string): string {
  const next = new URL(url);
  next.searchParams.delete("job");
  return `${next.pathname}${next.search}${next.hash}`;
}

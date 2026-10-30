import type {
  DecisionInput,
  MemoryEvent,
  ProjectMemory,
  TastePreference,
  TasteScope,
} from "./schema";

/** Stable JSON receipts make an identical retry independent of key order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const MAX_EVENTS = 4000;
export function appendEvent(
  memory: ProjectMemory,
  input: DecisionInput,
  meta: Pick<MemoryEvent, "actor" | "sessionId" | "projectId">,
  at: string,
): MemoryEvent {
  if (memory.events.length >= MAX_EVENTS)
    throw new Error(
      "Export and clear project history before adding more events (4,000 maximum).",
    );
  const { baseRevision, memoryRevision: _expected, ...fields } = input;
  const event: MemoryEvent = {
    ...fields,
    schema: 1,
    ...meta,
    revision: baseRevision,
    cursor: ++memory.cursor,
    at,
    receipt: canonical(input),
  };
  memory.events.push(event);
  memory.revision++;
  return event;
}
export function applicable(preferences: TastePreference[], scope: TasteScope) {
  const active = preferences.filter(
    (p) =>
      p.status === "active" &&
      (p.scope.medium === "*" || p.scope.medium === scope.medium) &&
      (p.scope.useCase === "*" || p.scope.useCase === scope.useCase),
  );
  return active.filter(
    (p) => !active.some((other) => other.supersedes === p.id),
  );
}
export interface Guidance {
  id: string;
  topic: string;
  value: string;
}
/** Precedence is explicit; an equal-rank conflict has no arbitrary winner. */
export function resolveGuidance(
  request: Guidance[],
  decisions: Guidance[],
  taste: TastePreference[],
  defaults: Guidance[] = [],
) {
  const result: {
    topic: string;
    source: string;
    choices: Guidance[];
    conflict: boolean;
  }[] = [];
  const seen = new Set<string>();
  for (const [source, tier] of [
    ["request", request],
    ["project", decisions],
    ["taste", taste],
    ["template", defaults],
  ] as const) {
    const topics = new Set(tier.map((p) => p.topic));
    for (const topic of topics) {
      if (seen.has(topic)) continue;
      seen.add(topic);
      let choices: Guidance[] = tier
        .filter((p) => p.topic === topic)
        .map(({ id, topic, value }) => ({ id, topic, value }));
      if (source === "taste") {
        const items = tier as TastePreference[];
        const rank = (p: TastePreference) =>
          Number(p.scope.medium !== "*") + Number(p.scope.useCase !== "*");
        const best = Math.max(
          ...items.filter((p) => p.topic === topic).map(rank),
        );
        choices = items
          .filter((p) => p.topic === topic && rank(p) === best)
          .map(({ id, topic, value }) => ({ id, topic, value }));
      }
      result.push({
        topic,
        source,
        choices,
        conflict: new Set(choices.map((c) => c.value)).size > 1,
      });
    }
  }
  return result;
}
export function projectGuidance(events: MemoryEvent[]): Guidance[] {
  const superseded = new Set(
    events
      .filter(
        (e) =>
          e.actor === "owner" &&
          e.source === "explicit-user" &&
          e.kind === "preference" &&
          e.guidance,
      )
      .map((e) => e.supersedes)
      .filter(Boolean),
  );
  return events
    .filter(
      (e) =>
        e.kind === "preference" &&
        e.actor === "owner" &&
        e.source === "explicit-user" &&
        e.guidance &&
        !superseded.has(e.id),
    )
    .map((e) => ({ id: e.id, ...e.guidance! }));
}

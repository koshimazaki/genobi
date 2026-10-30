import type { ReferencePurpose } from "./prompt-insertion";
export function promptMention(text: string, caret: number) {
  const match = text
    .slice(0, caret)
    .match(/(?:^|\s)(@|add(?:\s+|$))([a-z0-9_-]{0,32})$/i);
  if (!match) return;
  const lead = match[0].length - match[0].trimStart().length;
  return { start: caret - match[0].length + lead, end: caret, query: match[2] };
}
export function mentionIntent(query: string): {
  kind: "image" | "video" | "font" | "references";
  purpose?: ReferencePurpose;
  search: string;
} {
  const q = query.toLowerCase();
  if (q && ["character", "char", "car"].some((s) => s.startsWith(q)))
    return { kind: "image", purpose: "Character", search: "" };
  if (q && "style".startsWith(q))
    return { kind: "image", purpose: "Style", search: "" };
  if (q && "font".startsWith(q)) return { kind: "font", search: "" };
  if (q && "image".startsWith(q)) return { kind: "image", search: "" };
  if (q && "video".startsWith(q)) return { kind: "video", search: "" };
  return { kind: "references", search: query };
}

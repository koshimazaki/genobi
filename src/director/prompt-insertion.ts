export type ReferencePurpose = "Character" | "Style";
export function insertPromptReference(
  text: string,
  label: string,
  start: number,
  end: number,
  purpose?: ReferencePurpose,
) {
  const insert = `${purpose ? `${purpose}: ` : ""}[${label}] `;
  const next = text.slice(0, start) + insert + text.slice(end);
  if (next.length > 12000)
    throw new Error("The prompt is limited to 12,000 characters.");
  return { text: next, caret: start + insert.length };
}
export function promptReferencePurpose(text: string, label: string) {
  return (["Character", "Style"] as const).find((purpose) =>
    text.includes(`${purpose}: [${label}]`),
  );
}

export const purposes = [
  "demo",
  "commercial-video",
  "redistribute-source",
  "resell-template",
] as const;
export const policies = ["any-licensed", "open-source", "mit-only"] as const;
export interface UsagePreference {
  purpose: (typeof purposes)[number];
  policy: (typeof policies)[number];
}
export type Decision = "conditions" | "review" | "excluded";
export interface TasteLibrary {
  id: string;
  name: string;
  author: string;
  creatorUrl?: string;
  example?: string;
  license: string;
  source: string;
  version: string;
  checked: string;
  status: "integrated" | "recommended" | "reference";
  reason: string;
  use: string;
  conditions: string;
  openSource: boolean;
  redistribution: "conditions" | "review";
  requires?: string[];
  /** Mixed-content selections need evidence of the actual pieces used. */
  selectionReview?: string;
}
export function parseUsage(value: unknown): UsagePreference {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid usage preference");
  const { purpose, policy } = value as Record<string, unknown>;
  if (
    !purposes.includes(purpose as UsagePreference["purpose"]) ||
    !policies.includes(policy as UsagePreference["policy"])
  )
    throw new Error("Invalid usage preference");
  return {
    purpose: purpose as UsagePreference["purpose"],
    policy: policy as UsagePreference["policy"],
  };
}

import type { SelectionPreference } from "../shared/licensing/selection";

/** Advisory catalogue defaults only; never silently alter generation inputs. */
export function profileDefaults(
  tool: string,
  args: Record<string, unknown>,
  selection: SelectionPreference = {},
) {
  return tool === "genobi_models"
    ? { ...args, selection: { ...selection, ...(args.selection as object) } }
    : args;
}

import { parseUsage, type UsagePreference } from "../../shared/licensing/types";
import {
  parseSelection,
  type SelectionPreference,
} from "../../shared/licensing/selection";
const selectionKey = "genobi-model-selection-v1";
export function readSelection(): SelectionPreference | undefined {
  try {
    const value = localStorage.getItem(selectionKey);
    return value ? parseSelection(JSON.parse(value)) : undefined;
  } catch {
    return undefined;
  }
}
export function saveSelection(value: SelectionPreference) {
  const valid = parseSelection(value);
  try {
    localStorage.setItem(selectionKey, JSON.stringify(valid));
  } catch {
    /* Private browser: selections remain in this view only. */
  }
}
const key = "genobi-usage-preference-v1";
export function clearUsage() {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
}
export function readUsage(): UsagePreference | undefined {
  try {
    const value = localStorage.getItem(key);
    return value ? parseUsage(JSON.parse(value)) : undefined;
  } catch {
    return undefined;
  }
}
export function saveUsage(value: UsagePreference) {
  const valid = parseUsage(value);
  try {
    localStorage.setItem(key, JSON.stringify(valid));
  } catch {
    /* Private browser: use only for this report. */
  }
}

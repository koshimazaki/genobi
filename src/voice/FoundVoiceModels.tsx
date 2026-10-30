import type { FoundVoiceModel } from "./setup-api";

/**
 * What the search for an existing Qwen3-ASR-0.6B found, before any download
 * is offered: each verified copy with "Use this one" (linked into a new
 * install, no download), or a line saying none was found. Only copies the
 * server verified by the pinned sizes and SHA-256 are listed.
 */
export function FoundVoiceModels({
  found,
  searching,
  disabled,
  onUse,
}: {
  /** Undefined until the search answers. */
  found?: readonly FoundVoiceModel[];
  searching: boolean;
  disabled: boolean;
  onUse: (folder: string) => void;
}) {
  if (!found)
    return (
      <p role="status">
        {searching
          ? "Looking for Qwen3-ASR already on this machine…"
          : "Checking this machine for Qwen3-ASR…"}
      </p>
    );
  if (!found.length)
    return (
      <p role="status">
        No verified copy of Qwen3-ASR is on this machine, so Install new
        downloads it.
      </p>
    );
  return (
    <>
      <p role="status">
        Found on this machine and checked against the pinned files. Using one
        skips the download.
      </p>
      <ul className="voice-found" aria-label="Voice models on this machine">
        {found.map((model) => (
          <li key={model.folder}>
            <code>{model.label}</code>
            <button
              type="button"
              className="primary"
              disabled={disabled}
              onClick={() => onUse(model.folder)}
            >
              Use this one
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

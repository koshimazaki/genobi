import { useEffect, useRef, useState } from "react";
import type { GenerateInput } from "../../shared/types";
import type { PartSetView } from "../../shared/upscale-parts";
import { isSeedvr2 } from "../../shared/comfy/seedvr2";
import {
  UPSCALE_PART_MAX_SECONDS,
  UPSCALE_SPLIT_MAX_SECONDS,
} from "../../shared/upscale-parts";
import { shouldPollParts } from "../../shared/upscale-parts-poll";
import { useSettingsStore } from "../settings-store";
import { partRange, partsClient, partState } from "../upscale-parts-client";
import Icon from "./Icon";
import { useModalDialog } from "./useModalDialog";

const usd = (value: number) => `$${value.toFixed(2)}`;
const POLL_MS = 5000;

/**
 * A clip longer than one upscale, upscaled in parts: the plan (each part's
 * frames and seconds), the combined price, and one button that confirms the
 * set. Opening it plans and quotes, which is free; the server reopens a set
 * made from exactly this request (prompt included) rather than planning
 * another. A failed part is retried alone, behind its own price and its own
 * press. SeedVR2 on a local ComfyUI takes a part length of its own.
 */
export default function UpscalePartsDialog({
  input,
  apiKey,
  onClose,
  onJoined,
}: {
  input: GenerateInput;
  apiKey: string;
  onClose: () => void;
  /** The joined clip is in the session: refresh the studio's sources. */
  onJoined: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useModalDialog(dialog);
  const [set, setSet] = useState<PartSetView>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const joined = useRef(false);

  async function act(work: () => Promise<{ set: PartSetView }>) {
    setBusy(true);
    setError("");
    try {
      setSet((await work()).set);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }

  // The request as the dialog opened: a changed setting closes and reopens it.
  const opened = useRef({ input, apiKey });
  const location = useSettingsStore((state) => state.location);
  const adjustable = isSeedvr2(input.model) && location === "local";
  const [length, setLength] = useState(UPSCALE_PART_MAX_SECONDS);
  const plan = (seconds: number) => {
    const { input: first, apiKey: key } = opened.current;
    return act(() =>
      partsClient.plan(
        seconds === UPSCALE_PART_MAX_SECONDS
          ? first
          : { ...first, partSeconds: seconds },
        key,
      ),
    );
  };
  useEffect(() => {
    void plan(UPSCALE_PART_MAX_SECONDS);
    // Planned once on opening; a new part length plans again on request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = set && shouldPollParts(set);
  useEffect(() => {
    if (!set || !live) return;
    const timer = setTimeout(
      () =>
        void partsClient.read(set.id, apiKey).then(
          (reply) => setSet(reply.set),
          () => setSet({ ...set }),
        ),
      POLL_MS,
    );
    return () => clearTimeout(timer);
  }, [set, live, apiKey]);

  useEffect(() => {
    if (set?.joined && !joined.current) {
      joined.current = true;
      onJoined();
    }
  }, [set, onJoined]);

  const count = set?.parts.length ?? 0;
  return (
    <dialog
      ref={dialog}
      className="camera-dialog upscale-parts-dialog"
      aria-labelledby="upscale-parts-heading"
      onCancel={onClose}
    >
      <header>
        <div>
          <h2 id="upscale-parts-heading">Upscale in parts</h2>
          <p>
            One upscale takes up to 20 seconds. This clip is cut on frame
            boundaries, each part upscaled on its own, then joined with the
            clip&apos;s own sound.
          </p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </header>
      <div className="camera-dialog-body">
        {adjustable && !set?.confirmed && (
          <div className="upscale-parts-length">
            <label htmlFor="upscale-part-length">
              Part length, seconds (local GPU: VRAM is the limit; 0 is the whole
              clip)
            </label>
            <input
              id="upscale-part-length"
              type="number"
              min={0}
              max={UPSCALE_SPLIT_MAX_SECONDS}
              step={1}
              value={length}
              onChange={(event) => setLength(Number(event.target.value))}
            />
            <button
              type="button"
              className="text-button"
              disabled={busy || length === set?.partSeconds}
              onClick={() => void plan(length)}
            >
              Plan again
            </button>
          </div>
        )}
        {!set && busy && <p role="status">Cutting the clip into parts…</p>}
        {set && (
          <ol className="upscale-parts-list" aria-label="Parts">
            {set.parts.map((part) => (
              <li key={part.index} data-status={part.job?.status ?? "plan"}>
                <span>{partRange(part)}</span>
                {set.confirmed && <span>{partState(part)}</span>}
                {part.retryQuote ? (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        partsClient.confirmRetry(
                          input,
                          set.id,
                          part.index,
                          part.retryQuote!.id,
                          apiKey,
                        ),
                      )
                    }
                  >
                    Retry part {part.index + 1} ·{" "}
                    {usd(part.retryQuote.estimateUsd)}
                  </button>
                ) : (
                  set.confirmed &&
                  (part.refused ||
                    (part.job &&
                      part.job.status !== "Ready" &&
                      part.job.error &&
                      part.job.status !== "Pending")) && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          partsClient.retry(input, set.id, part.index, apiKey),
                        )
                      }
                    >
                      Price a retry
                    </button>
                  )
                )}
              </li>
            ))}
          </ol>
        )}
        {set?.joined && (
          <p role="status">
            Joined: {set.joined.label} · {set.joined.width} ×{" "}
            {set.joined.height} · {set.joined.duration.toFixed(2)} s. It is in
            your clips.
          </p>
        )}
        {set?.joinError && (
          <p role="alert">
            {set.joinError}{" "}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => act(() => partsClient.rejoin(set.id))}
            >
              Join again
            </button>
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="camera-dialog-actions">
        <button className="text-button" onClick={onClose}>
          {set?.confirmed ? "Close" : "Cancel"}
        </button>
        {set && !set.confirmed && (
          <button
            className="primary-button"
            disabled={busy}
            onClick={() =>
              act(async () => {
                try {
                  return await partsClient.confirm(
                    input,
                    set.id,
                    set.quoteId,
                    apiKey,
                  );
                } catch (e) {
                  // A lapsed quote: show the new price; never confirm it unseen.
                  setSet((await partsClient.read(set.id, apiKey)).set);
                  throw e;
                }
              })
            }
          >
            Upscale {count} parts · {usd(set.estimateUsd)} est.{" "}
            <Icon name="arrow" size={16} />
          </button>
        )}
      </div>
    </dialog>
  );
}

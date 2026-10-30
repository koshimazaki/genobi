import { useEffect, useState } from "react";
import type { Source } from "../../shared/types";
import {
  versionSourceSeconds,
  type VersionSlot,
} from "../../shared/templates/version";
import { TEMPLATE_ACCEPT } from "../../shared/templates/intake";
import { request } from "../useJobs";
import type { Bundle } from "./bundle";
import MediaTile from "./MediaTile";
import { mediaType, useObjectUrl } from "./media-playback";
import { versionMediaFile } from "./version-results";

function AudioWave({ bytes }: { bytes?: Uint8Array<ArrayBuffer> }) {
  const [peaks, setPeaks] = useState<number[]>([]);
  useEffect(() => {
    if (!bytes || typeof AudioContext === "undefined") return;
    const audio = new AudioContext();
    let live = true;
    void audio
      .decodeAudioData(bytes.slice().buffer)
      .then((buffer) => {
        if (!live) return;
        const channel = buffer.getChannelData(0),
          stride = Math.max(1, Math.floor(channel.length / 80));
        setPeaks(
          Array.from({ length: 80 }, (_, i) => {
            let peak = 0;
            for (
              let j = i * stride;
              j < Math.min(channel.length, (i + 1) * stride);
              j += 16
            )
              peak = Math.max(peak, Math.abs(channel[j]));
            return peak;
          }),
        );
      })
      .catch(() => {})
      .finally(() => void audio.close());
    return () => {
      live = false;
    };
  }, [bytes]);
  return (
    <svg viewBox="0 0 160 32" role="img" aria-label="Track waveform">
      <path
        d={peaks
          .map((p, i) => `M${i * 2} ${16 - p * 15}v${Math.max(1, p * 30)}`)
          .join(" ")}
        fill="none"
        stroke="currentColor"
      />
    </svg>
  );
}

export function VersionPreview({
  bundle,
  ids,
  fallback,
}: {
  bundle: Bundle;
  ids: string[];
  fallback?: string;
}) {
  return (
    <div className="dir-version-previews">
      {ids.length ? (
        ids.map((id) => {
          const asset = bundle.project.assets[id];
          if (!asset) return null;
          const bytes = bundle.files.get(asset.file.path);
          return (
            <div key={id}>
              <MediaTile asset={asset} bytes={bytes} name={id}>
                {(frame) => frame}
              </MediaTile>
              {asset.kind === "audio" && <AudioWave bytes={bytes} />}
            </div>
          );
        })
      ) : fallback ? (
        <img alt="Template default" src={fallback} />
      ) : (
        <p>No asset selected.</p>
      )}
    </div>
  );
}

/** The same choices for every declared slot, filtered by its media kind. */
export default function VersionInputSlot({
  slot,
  bundle,
  ids,
  defaults,
  disabled,
  make,
  pick,
  upload,
  generate,
}: {
  slot: VersionSlot;
  bundle: Bundle;
  ids: string[];
  defaults: string[];
  disabled: boolean;
  make: boolean;
  pick: (ids: string[]) => void;
  upload: (files: File[]) => Promise<void>;
  generate: (make: boolean) => void;
}) {
  const [owned, setOwned] = useState<Source[]>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function tracks() {
    setLoading(true);
    setError("");
    try {
      setOwned(
        (await request<{ sources: Source[] }>("/api/history")).sources.filter(
          (s) => s.mediaType === "audio" && s.origin !== "sample",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function ownTrack(id: string) {
    if (!/^[0-9a-f-]{36}(?:-audio-[0-9]+(?:-[0-9]+)*)?$/.test(id)) return;
    setLoading(true);
    setError("");
    try {
      await upload([
        await versionMediaFile(
          `/api/clips/${id}`,
          "track",
          ["audio"],
          50_000_000,
        ),
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const chosen = ids[0] ? bundle.project.assets[ids[0]] : undefined;
  const audioUrl = useObjectUrl(
    chosen?.kind === "audio" ? bundle.files.get(chosen.file.path) : undefined,
    true,
    chosen ? mediaType(chosen.file.path) : "",
  );
  return (
    <fieldset className="dir-version-slot" disabled={disabled || loading}>
      <legend>
        {slot.label} · {slot.min ? "Required" : "Optional"} · {slot.min}–
        {slot.max}
      </legend>
      <p>{slot.hint}</p>
      {slot.kind !== "image" &&
        versionSourceSeconds(bundle.project, slot) > 0 && (
          <p>
            At least {versionSourceSeconds(bundle.project, slot).toFixed(2)} s
            of source media to keep the current timing.
          </p>
        )}
      <VersionPreview bundle={bundle} ids={ids} fallback={slot.picture?.url} />
      {audioUrl && (
        <audio
          aria-label={`${slot.label} preview`}
          controls
          preload="metadata"
          src={audioUrl}
        />
      )}
      <div className="dir-version-controls">
        <button
          type="button"
          onClick={() => {
            pick(defaults);
            generate(false);
          }}
        >
          Keep default
        </button>
        <label>
          Project assets / Inspirations
          <select
            aria-label={`${slot.label}: project assets and inspirations`}
            multiple={slot.max > 1}
            value={slot.max > 1 ? ids : (ids[0] ?? "")}
            onChange={(e) => {
              pick(
                [...e.target.selectedOptions]
                  .map((o) => o.value)
                  .filter(Boolean),
              );
              generate(false);
            }}
          >
            <option value="">Choose {slot.kind}</option>
            {(["production", "reference"] as const).map((use) => (
              <optgroup
                label={use === "production" ? "Project assets" : "Inspirations"}
                key={use}
              >
                {Object.entries(bundle.project.assets)
                  .filter(([, a]) => a.kind === slot.kind && a.use === use)
                  .map(([id, a]) => (
                    <option key={id} value={id}>
                      {a.file.path.split("/").pop()}{" "}
                      {a.origin === "generated" ? "· Generated" : ""}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Upload {slot.kind}
          <input
            aria-label={`Upload ${slot.label}`}
            type="file"
            multiple={slot.max > 1}
            accept={
              slot.kind === "video"
                ? "video/mp4,.mp4"
                : TEMPLATE_ACCEPT[slot.kind]
            }
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length)
                void upload(files).catch((e: Error) => setError(e.message));
            }}
          />
        </label>
        {slot.kind === "audio" && (
          <button type="button" onClick={() => void tracks()}>
            Pick generated / owned track
          </button>
        )}
        {owned && (
          <label>
            Owned tracks
            <select
              aria-label="Owned tracks"
              value=""
              onChange={(e) => void ownTrack(e.target.value)}
            >
              <option value="">Choose track</option>
              {owned.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.label} · {s.duration.toFixed(1)} s
                </option>
              ))}
            </select>
          </label>
        )}
        {slot.min === 0 && (
          <button
            type="button"
            onClick={() => {
              pick([]);
              generate(false);
            }}
          >
            Leave empty
          </button>
        )}
        {
          <label>
            <input
              type="checkbox"
              checked={make}
              onChange={(e) => {
                generate(e.target.checked);
              }}
            />
            Ask Genobi to generate this input
          </label>
        }
      </div>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}

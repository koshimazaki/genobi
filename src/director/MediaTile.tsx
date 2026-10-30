import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { Asset } from "../../shared/director/types";
import Icon from "../components/Icon";
import ReferencePreview from "../components/ReferencePreview";
import { AssetFrame } from "./AssetThumbnail";
import {
  claimPlayback,
  mediaType,
  releaseMedia,
  releasePlayback,
  stopPlayback,
  useObjectUrl,
  useReducedMotion,
} from "./media-playback";
import "./media-tile.css";

type Bytes = Uint8Array<ArrayBuffer>;

/**
 * A project-media card that can be seen and heard where it sits. A video
 * plays muted on hover or keyboard focus (a play button instead when reduced
 * motion is asked for); audio has a small play/pause and progress line; the
 * Preview button, or a double-click where `doubleClick` is set, opens a
 * modest lightbox with sound. The card itself, its click, drag and labels,
 * stay the caller's: `children` receives the media box to place in it.
 */
export default function MediaTile({
  asset,
  bytes,
  seconds,
  name,
  className,
  doubleClick = false,
  children,
}: {
  asset: Asset;
  bytes?: Bytes;
  seconds?: number;
  /** The file's display name, for the controls' accessible names. */
  name: string;
  className?: string;
  /** Double-click opens the lightbox. Off where a click opens a dialog. */
  doubleClick?: boolean;
  children: (frame: ReactNode) => ReactNode;
}) {
  const reduced = useReducedMotion();
  const [pointer, setPointer] = useState(false);
  const [focus, setFocus] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Audio keeps its element (and position) between pause and play.
  const [armed, setArmed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>();
  const tile = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLMediaElement | null>(null);
  // Set before a pause this tile asked for; any other pause is a stop.
  const ownPause = useRef(false);
  const video = asset.kind === "video",
    audio = asset.kind === "audio";
  const open = opener !== undefined;
  const available = !!bytes && !failed && !open;
  const hoverPlay = available && video && !reduced && (pointer || focus);
  const active = available && (hoverPlay || playing || armed);
  const url = useObjectUrl(bytes, active, mediaType(asset.file.path));
  const toggle = audio || (video && reduced);

  function reset() {
    setPlaying(false);
    setArmed(false);
    setPointer(false);
    setFocus(false);
    setProgress(0);
  }
  useEffect(() => {
    const el = media.current;
    if (!url || !el) return;
    if (playing || hoverPlay) {
      claimPlayback(el);
      el.play()?.catch(() => {
        // Refused or interrupted: back to the poster, nothing left loading.
        if (el.paused && media.current === el) reset();
      });
    } else if (!el.paused) {
      ownPause.current = true;
      el.pause();
    }
  }, [url, playing, hoverPlay]);
  // Let the element go when its URL does (hover ended, closed, unmounted).
  useEffect(() => {
    const el = media.current;
    return () => releaseMedia(el);
  }, [url]);
  const paused = () => {
    if (ownPause.current) ownPause.current = false;
    else reset();
  };
  const fail = () => {
    reset();
    setFailed(true);
  };
  const frame = bytes ? (
    <AssetFrame asset={asset} bytes={bytes} seconds={seconds}>
      {url && video && (
        <video
          key={url}
          ref={media as RefObject<HTMLVideoElement | null>}
          className="media-tile-video"
          src={url}
          muted
          loop
          playsInline
          preload="metadata"
          onPause={paused}
          onError={fail}
        />
      )}
      {url && audio && (
        <audio
          key={url}
          ref={media as RefObject<HTMLAudioElement | null>}
          src={url}
          preload="metadata"
          onPause={paused}
          onEnded={reset}
          onError={fail}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            setProgress(a.duration ? a.currentTime / a.duration : 0);
          }}
        />
      )}
      {audio && armed && (
        <span className="media-tile-progress" aria-hidden="true">
          <span style={{ width: `${Math.min(1, progress) * 100}%` }} />
        </span>
      )}
      {failed && <span className="media-tile-note">Can’t play</span>}
    </AssetFrame>
  ) : (
    <span className="dir-asset-frame" data-kind={asset.kind}>
      <span className="dir-asset-placeholder">Missing file</span>
    </span>
  );
  return (
    <div
      ref={tile}
      className={className ? `media-tile ${className}` : "media-tile"}
      data-kind={asset.kind}
      data-playing={url ? "" : undefined}
      onPointerEnter={(e) => e.pointerType !== "touch" && setPointer(true)}
      onPointerLeave={() => setPointer(false)}
      onFocus={(e) => {
        // The card itself, from the keyboard: its own controls do not play.
        const card: Element | null = e.currentTarget.querySelector("button");
        if (e.target === card) setFocus(focusVisible(card));
      }}
      onBlur={(e) => {
        if (!tile.current?.contains(e.relatedTarget as Node | null))
          setFocus(false);
      }}
      onDoubleClick={
        doubleClick && bytes
          ? () => setOpener(tile.current?.querySelector("button") ?? null)
          : undefined
      }
    >
      {children(frame)}
      <span className="media-tile-controls">
        {toggle && (
          <button
            type="button"
            className="media-tile-button"
            aria-label={`${playing ? "Pause" : "Play"} ${name}`}
            title={playing ? "Pause" : "Play"}
            disabled={!available}
            onClick={() => {
              if (!playing) {
                setArmed(audio);
                setPlaying(true);
              } else setPlaying(false);
            }}
          >
            <Icon name={playing ? "pause" : "play"} size={11} />
          </button>
        )}
        <button
          type="button"
          className="media-tile-button"
          aria-label={`Preview ${name}`}
          title="Preview"
          disabled={!bytes}
          onClick={(e) => setOpener(e.currentTarget)}
        >
          <Icon name="expand" size={11} />
        </button>
      </span>
      {open && bytes && (
        <TilePreview
          asset={asset}
          bytes={bytes}
          name={name}
          opener={opener}
          onClose={() => setOpener(undefined)}
        />
      )}
    </div>
  );
}

function focusVisible(el: Element) {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/** The lightbox, on the body so the drawer's small-media rules miss it. */
function TilePreview({
  asset,
  bytes,
  name,
  opener,
  onClose,
}: {
  asset: Asset;
  bytes: Bytes;
  name: string;
  opener: HTMLElement | null;
  onClose: () => void;
}) {
  const url = useObjectUrl(bytes, true, mediaType(asset.file.path));
  const played = useRef<HTMLMediaElement | null>(null);
  // Opening stops every other preview; the lightbox's own player then takes
  // its turn like a tile's, and lets go when it closes.
  useEffect(() => {
    stopPlayback();
    return () => {
      if (played.current) releasePlayback(played.current);
    };
  }, []);
  if (!url) return null;
  // React events bubble through portals; keep the tile's and the drawer's
  // handlers out of it.
  return createPortal(
    <div
      className="media-lightbox-host"
      onClick={stop}
      onDoubleClick={stop}
      onKeyDown={stop}
      onFocus={stop}
      onBlur={stop}
      onPointerDown={stop}
      onPointerEnter={stop}
    >
      <ReferencePreview
        url={url}
        label={name}
        kind={asset.kind}
        sound
        opener={opener}
        className="media-lightbox"
        closeLabel="Close preview"
        onPlay={(media) => {
          played.current = media;
          claimPlayback(media);
        }}
        onClose={onClose}
      />
    </div>,
    document.body,
  );
}

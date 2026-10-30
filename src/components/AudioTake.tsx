import Icon from "./Icon";
import "../styles/music.css";

/**
 * A finished song where a clip shows its video: the browser's own player,
 * inside the same media footprint, so the card and the hero keep their size.
 * It never autoplays; the person presses play. `credit` is the name the
 * model's licence asks to be shown with what it makes ("MiniMax-Music3").
 */
export default function AudioTake({
  url,
  label,
  credit,
  onReady,
  onError,
}: {
  url: string;
  label: string;
  credit?: string;
  onReady?: () => void;
  onError?: () => void;
}) {
  return (
    <div className="audio-take">
      <Icon name="sound" size={28} />
      <audio
        src={url}
        controls
        preload="metadata"
        aria-label={label}
        onLoadedMetadata={onReady}
        onError={onError}
        onPlay={(event) =>
          // One sound at a time, as one clip plays at a time.
          document.querySelectorAll("audio, video").forEach((media) => {
            if (media !== event.currentTarget)
              (media as HTMLMediaElement).pause();
          })
        }
      />
      {credit && <p className="audio-take__credit">Made with {credit}</p>}
    </div>
  );
}

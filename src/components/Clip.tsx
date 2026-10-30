import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
export default function Clip({
  url,
  poster,
  label,
  onOpen,
  preload,
  onReady,
  onError,
}: {
  url: string;
  poster?: string;
  label: string;
  onOpen?: () => void;
  /** A caller revealing this clip needs the first frame, not just metadata. */
  preload?: "none" | "metadata" | "auto";
  onReady?: () => void;
  onError?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const previewing = useRef(false);
  const play = () => {
    document.querySelectorAll("video").forEach((v) => {
      if (v !== ref.current) v.pause();
    });
    void ref.current?.play().catch(() => setPlaying(false));
  };
  const stop = () => {
    previewing.current = false;
    ref.current?.pause();
  };
  useEffect(() => {
    const stopHidden = () => {
      if (document.hidden) stop();
    };
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) stop();
    });
    if (ref.current) observer.observe(ref.current);
    document.addEventListener("visibilitychange", stopHidden);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", stopHidden);
    };
  }, []);
  return (
    <div
      className="clip-player"
      onPointerEnter={(e) => {
        if (
          onOpen &&
          e.pointerType === "mouse" &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          previewing.current = true;
          play();
        }
      }}
      onPointerLeave={() => {
        if (previewing.current) stop();
      }}
    >
      <video
        ref={ref}
        src={url}
        poster={poster}
        preload={preload ?? (poster ? "none" : "metadata")}
        muted
        playsInline
        loop
        controls={!onOpen && playing}
        aria-label={label}
        onLoadedData={onReady}
        onError={onError}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      {(onOpen || !playing) && (
        <button
          className="clip-play"
          aria-label={`Play ${label}`}
          onClick={() => {
            if (onOpen) {
              stop();
              onOpen();
            } else play();
          }}
        >
          <Icon name="play" size={18} />
        </button>
      )}
    </div>
  );
}

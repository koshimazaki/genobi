import { useEffect, useRef, useState } from "react";

export default function PreviewVideo({
  video,
  poster,
  title,
  active,
  sound = false,
  onSoundBlocked,
}: {
  video?: string;
  poster?: string;
  title: string;
  active: boolean;
  sound?: boolean;
  onSoundBlocked?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const visible = useRef(true);
  const [intersecting, setIntersecting] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      setIntersecting(entry.isIntersecting);
      if (!entry.isIntersecting) {
        element.muted = true;
        element.pause();
      }
    });
    observer.observe(element);
    const pause = () => {
      if (document.hidden) {
        element.muted = true;
        element.pause();
      }
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      observer.disconnect();
      element.muted = true;
      element.pause();
      document.removeEventListener("visibilitychange", pause);
    };
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let cancelled = false;
    const playing =
      active &&
      !document.hidden &&
      intersecting &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.muted = !playing || !sound;
    if (playing) {
      void element.play().catch((error: unknown) => {
        if (
          cancelled ||
          document.hidden ||
          !visible.current ||
          (error instanceof DOMException && error.name === "AbortError")
        )
          return;
        // Autoplay permission can be stricter than userActivation suggests.
        element.muted = true;
        if (sound) onSoundBlocked?.();
        void element.play().catch(() => {});
      });
    } else element.pause();
    return () => {
      cancelled = true;
    };
  }, [active, sound, onSoundBlocked, intersecting]);
  return (
    <>
      {video && !failed ? (
        <video
          ref={ref}
          src={video}
          poster={poster}
          muted
          loop
          playsInline
          preload="none"
          onError={() => setFailed(true)}
          aria-hidden="true"
        />
      ) : poster ? (
        <img src={poster} alt="" />
      ) : (
        <span className="preview-unavailable">Preview coming soon</span>
      )}
      {failed && (
        <span className="preview-unavailable">Video unavailable · {title}</span>
      )}
    </>
  );
}

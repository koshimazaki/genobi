import { useEffect, useRef, useState } from "react";

export default function PreviewVideo({
  video,
  poster,
  title,
  active,
}: {
  video?: string;
  poster?: string;
  title: string;
  active: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) element.pause();
    });
    observer.observe(element);
    const pause = () => {
      if (document.hidden) element.pause();
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      observer.disconnect();
      element.pause();
      document.removeEventListener("visibilitychange", pause);
    };
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (
      active &&
      !document.hidden &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      void element.play().catch(() => {});
    else element.pause();
  }, [active]);
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

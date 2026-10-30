import { useEffect, useRef, useState } from "react";

/**
 * One clock, muted by default. Pause every player on hide, seek or playback
 * failure. `solo` plays one result on its own: the shared clock stops and the
 * others pause, so a single clip can be watched without the sync loop.
 */
export function useArenaPlayback(
  active: boolean,
  identity: string,
  initialTime = 0,
) {
  const generation = useRef(0);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [soloing, setSoloing] = useState<string>();
  function pause() {
    generation.current++;
    videos.current.forEach((v) => v.pause());
    setPlaying(false);
    setSoloing(undefined);
  }
  async function solo(id: string) {
    const video = videos.current.get(id);
    if (!video) return;
    if (soloing === id) return pause();
    pause();
    const attempt = generation.current;
    setError("");
    if (video.readyState < 2 || video.error) {
      setError("Wait for this video to load, or replace the clip.");
      return;
    }
    if (video.ended || video.currentTime >= video.duration - 0.04)
      video.currentTime = 0;
    try {
      await video.play();
      if (attempt !== generation.current) return video.pause();
      setSoloing(id);
      video.addEventListener("pause", () => setSoloing(undefined), {
        once: true,
      });
    } catch {
      if (attempt === generation.current)
        setError("Playback was interrupted. Press Play to try again.");
    }
  }
  function loaded() {
    const times = [...videos.current.values()]
      .map((v) => v.duration)
      .filter((n) => Number.isFinite(n) && n > 0);
    setDuration(times.length ? Math.min(...times) : 0);
  }
  function seek(t: number) {
    pause();
    videos.current.forEach((v) => {
      if (v.readyState >= 1) v.currentTime = Math.min(t, v.duration);
    });
    setTime(t);
  }
  async function play() {
    if (playing) return pause();
    if (soloing) pause();
    const attempt = ++generation.current;
    setError("");
    const list = [...videos.current.values()];
    if (!list.length || list.some((v) => v.readyState < 2 || v.error)) {
      setError(
        "Wait for every video to load, or replace the unavailable clip.",
      );
      return;
    }
    const start = time >= duration - 0.04 ? 0 : time;
    list.forEach((v) => {
      v.currentTime = start;
    });
    try {
      await Promise.all(list.map((v) => v.play()));
      if (attempt !== generation.current) {
        list.forEach((v) => v.pause());
        return;
      }
      setPlaying(true);
    } catch {
      if (attempt !== generation.current) return;
      pause();
      setError("Playback was interrupted. Press Play to try again.");
    }
  }
  useEffect(() => {
    generation.current++;
    const guard = generation;
    const items = videos.current;
    items.forEach((v) => v.pause());
    setPlaying(false);
    setSoloing(undefined);
    setTime(initialTime);
    loaded();
    return () => {
      guard.current++;
      items.forEach((v) => v.pause());
    };
  }, [identity, initialTime]);
  useEffect(() => {
    if (!active) {
      generation.current++;
      videos.current.forEach((v) => v.pause());
      setPlaying(false);
    }
  }, [active]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        generation.current++;
        videos.current.forEach((v) => v.pause());
        setPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    let published = -Infinity;
    const tick = (now: number) => {
      const list = [...videos.current.values()];
      const master = list[0];
      if (!master || master.ended || master.currentTime >= duration - 0.025) {
        list.forEach((v) => v.pause());
        setPlaying(false);
        setTime(duration);
        return;
      }
      for (const v of list.slice(1))
        if (Math.abs(v.currentTime - master.currentTime) > 0.08)
          v.currentTime = master.currentTime;
      if (now - published >= 100) {
        setTime(master.currentTime);
        published = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
  return {
    videos,
    playing,
    soloing,
    time,
    duration,
    error,
    loaded,
    seek,
    play,
    pause,
    solo,
  };
}

import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineSource } from "./timeline-export";
import { LatestFrame } from "./latest-frame";
interface Request {
  source: TimelineSource;
  frame: number;
}
export default function BoundaryPreview({ source, frame }: Request) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<
    (Request & { canvas?: HTMLCanvasElement; error?: string }) | null
  >(null);
  const queue = useMemo(
    () =>
      new LatestFrame<Request, HTMLCanvasElement>(
        (r) => r.source.engine.decode(r.frame),
        (r, canvas) => setResult({ ...r, canvas }),
        (r, error) =>
          setResult({
            ...r,
            error:
              error instanceof Error
                ? error.message
                : "Boundary frame could not be decoded.",
          }),
      ),
    [],
  );
  useEffect(() => {
    void queue.request({ source, frame });
    return () => queue.clear();
  }, [queue, source, frame]);
  const current =
    result?.source === source && result.frame === frame ? result : null;
  useEffect(() => {
    if (!canvas.current || !current?.canvas) return;
    canvas.current.width = current.canvas.width;
    canvas.current.height = current.canvas.height;
    canvas.current.getContext("2d")?.drawImage(current.canvas, 0, 0);
  }, [current]);
  return (
    <>
      <canvas
        ref={canvas}
        className="de-boundary-canvas"
        aria-label={`Trim preview, source frame ${frame}`}
        hidden={!current?.canvas}
      />
      {!current?.canvas && (
        <span role={current?.error ? "alert" : "status"}>
          {current?.error ?? `Decoding source frame ${frame}…`}
        </span>
      )}
    </>
  );
}

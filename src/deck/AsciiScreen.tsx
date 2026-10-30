import { useMemo } from "react";
import {
  DEFAULT_COLOUR,
  PROGRAMS,
  type Frame,
  type ProgramName,
} from "../../shared/ascii/programs";
import { useAnimationTime } from "../spinner";

const hex = (colour: number) =>
  colour & DEFAULT_COLOUR
    ? undefined
    : `#${colour.toString(16).padStart(6, "0")}`;

/** One frame as rows of coloured runs: neighbouring cells of one colour share a span. */
export function frameRuns(f: Frame) {
  const rows: { text: string; fg?: string; bg?: string }[][] = [];
  for (let y = 0; y < f.rows; y++) {
    const runs: { text: string; fg?: string; bg?: string }[] = [];
    for (let x = 0; x < f.columns; x++) {
      const i = (y * f.columns + x) * 3;
      const text = String.fromCodePoint(f.cells[i]);
      const fg = hex(f.cells[i + 1]),
        bg = hex(f.cells[i + 2]);
      const last = runs.at(-1);
      if (last && last.fg === fg && last.bg === bg) last.text += text;
      else runs.push({ text, fg, bg });
    }
    rows.push(runs);
  }
  return rows;
}

/**
 * A Genobi ASCII program drawn as text on the shared animation clock: the
 * same frames Claude Code's Raster or a Hermes port would draw. Decorative;
 * it holds still under reduced motion or when `on` is false.
 */
export default function AsciiScreen({
  program,
  columns,
  rows,
  on = true,
  speed = 1,
  frame,
}: {
  program: ProgramName;
  columns: number;
  rows: number;
  on?: boolean;
  speed?: number;
  frame?: Frame;
}) {
  const time = useAnimationTime(on && !frame);
  // Cap the text renderer at 30 frames per second.
  const tick = Math.floor((time * speed) / (1000 / 30));
  const lines = useMemo(
    () =>
      frameRuns(
        frame ?? PROGRAMS[program](columns, rows, tick * (1000 / 30) + 1200),
      ),
    [program, columns, rows, tick, frame],
  );
  return (
    <pre className="ascii-screen" aria-hidden="true">
      {lines.map((runs, y) => (
        <span key={y} className="ascii-row">
          {runs.map((run, x) => (
            <span key={x} style={{ color: run.fg, background: run.bg }}>
              {run.text}
            </span>
          ))}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

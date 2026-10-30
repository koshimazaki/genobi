import { useMemo } from "react";
import {
  frameText,
  PROGRAMS,
  type ProgramName,
} from "../../shared/ascii/programs";
import { useAnimationTime } from "../spinner";

/** A backdrop needs no more than this; the deck's screen runs at 30. */
const FPS = 12;

/**
 * A Genobi ASCII program's characters only, as one block of text in the
 * colour CSS gives it: a faint backdrop behind something else (setup's
 * install wait). `AsciiScreen` draws the same frames with their colours.
 * Decorative and hidden from assistive technology; it holds still under
 * reduced motion or when `on` is false.
 */
export default function AsciiBackdrop({
  program,
  columns,
  rows,
  on = true,
  className,
}: {
  program: ProgramName;
  columns: number;
  rows: number;
  on?: boolean;
  className?: string;
}) {
  const time = useAnimationTime(on);
  const tick = Math.floor(time / (1000 / FPS));
  const text = useMemo(
    () => frameText(PROGRAMS[program](columns, rows, tick * (1000 / FPS))),
    [program, columns, rows, tick],
  );
  return (
    <pre
      className={className ? `ascii-backdrop ${className}` : "ascii-backdrop"}
      aria-hidden="true"
    >
      {text}
    </pre>
  );
}

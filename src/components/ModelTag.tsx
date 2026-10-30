/**
 * Which model made a clip, on its gallery card and in the lightbox: a muted
 * mono tag from `modelSignature`. It is informational, not a control, so it
 * never takes the accent.
 */
export default function ModelTag({
  tag,
  title,
}: {
  tag: string;
  title: string;
}) {
  return (
    <span className="clip-model" title={title}>
      {tag}
    </span>
  );
}

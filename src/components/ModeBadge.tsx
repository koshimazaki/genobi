import type { Generator, VideoModel } from "../../shared/types";
import Icon from "./Icon";
import { modeName } from "../generators";

/**
 * The name of the generator the composer is in, above the prompt.
 *
 * It reads `src/generators.ts`, like the model menu and the composer foot, so
 * the three cannot name the same endpoint differently. With a model it names
 * the held entry, so an LTX run is not badged as FLUX 3, nor Klein as FLUX 3.
 */
export default function ModeBadge({
  generator,
  model,
}: {
  generator: Generator;
  model?: VideoModel;
}) {
  const name = modeName(generator, model);
  return (
    <div className="mode-badge" aria-live="polite">
      <Icon name={name.icon} size={17} />
      <span>{name.label}</span>
    </div>
  );
}

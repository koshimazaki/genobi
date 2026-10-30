import { MUSIC_CAPTION_LIMIT, MUSIC_LYRICS_LIMIT } from "../../shared/music";
import { entryFor } from "../../shared/registry";
import type { ComposerState } from "../useComposer";
import PromptField from "./PromptField";
import "../styles/image-references.css";
import "../styles/music.css";

/**
 * MiniMax Music 3's inputs inside the composer's reserved footprint: the
 * caption where every other mode has its prompt, the lyrics where Image keeps
 * its references. The lyrics field has a fixed height and scrolls, so
 * choosing Music never grows the composer; only a long caption does.
 */
export default function MusicWorkspace({
  state,
  update,
}: {
  state: ComposerState;
  update: (patch: Partial<ComposerState>) => void;
}) {
  return (
    <div className="image-workspace music-workspace">
      <div className="image-prompt">
        <PromptField
          id="music-caption"
          label="Describe the music"
          labelClassName="upscale-prompt-label"
          value={state.description}
          onChange={(description) => update({ description })}
          maxLength={MUSIC_CAPTION_LIMIT}
          placeholder="Style, mood, tempo, instruments: synthwave teaser, driving bass, 128 BPM, no vocals…"
        />
      </div>
      <div className="music-lyrics">
        <label htmlFor="music-lyrics">
          <span>Lyrics · optional</span>
          {/* The MiniMax-Music3 licence asks for its name where it is used. */}
          <span
            className="music-credit"
            title="Licensed under the MiniMax-Music3 Community License"
          >
            {entryFor(state.generator, state.model).credit}
          </span>
        </label>
        <textarea
          id="music-lyrics"
          value={state.lyrics ?? ""}
          maxLength={MUSIC_LYRICS_LIMIT}
          onChange={(event) => update({ lyrics: event.target.value })}
          placeholder={"[verse]\n…\n[chorus]\n…"}
        />
      </div>
    </div>
  );
}

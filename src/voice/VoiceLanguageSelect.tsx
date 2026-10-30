import ThemedSelect from "../components/ThemedSelect";
import {
  AUTO_LANGUAGE,
  DEFAULT_VOICE_LANGUAGE,
  VOICE_LANGUAGES,
  type VoiceLanguage,
} from "../../shared/voice-languages";

/**
 * The language the local model listens for: English first (the default),
 * then Auto-detect, then the rest of Qwen3-ASR's list in alphabetical order.
 * The server's own list wins when it sends one.
 */
export function VoiceLanguageSelect({
  value,
  offered,
  onChange,
}: {
  value: VoiceLanguage;
  offered?: readonly VoiceLanguage[];
  onChange: (language: VoiceLanguage) => void;
}) {
  const known = new Set<VoiceLanguage>(offered ?? VOICE_LANGUAGES);
  const rest = VOICE_LANGUAGES.filter(
    (name) => name !== DEFAULT_VOICE_LANGUAGE && known.has(name),
  ).sort();
  const options: VoiceLanguage[] = [
    DEFAULT_VOICE_LANGUAGE,
    AUTO_LANGUAGE,
    ...rest,
  ];
  return (
    // Paired by id: a wrapping label would add the chosen option to the name.
    <div className="voice-language">
      <label htmlFor="voice-language">Language</label>
      <ThemedSelect
        id="voice-language"
        value={value}
        onChange={(event) => onChange(event.target.value as VoiceLanguage)}
      >
        {options.map((name) => (
          <option key={name} value={name}>
            {name === AUTO_LANGUAGE ? "Auto-detect" : name}
          </option>
        ))}
      </ThemedSelect>
    </div>
  );
}

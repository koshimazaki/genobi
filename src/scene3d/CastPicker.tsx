import ThemedSelect from "../components/ThemedSelect";
import type { SubjectChoice } from "../../shared/scene/subject";
export function CastPicker({
  value,
  onChange,
}: {
  value: SubjectChoice;
  onChange: (value: SubjectChoice) => void;
}) {
  return (
    <label className="s3d-scene-picker">
      <span>Subject</span>
      <ThemedSelect
        aria-label="Subject"
        value={value}
        onChange={(e) => onChange(e.target.value as SubjectChoice)}
      >
        <option value="saved">Scene default</option>
        <option value="mannequin">Neutral mannequin</option>
        <option value="creature">Glitch Candies creature · local VRM</option>
        <option value="pug">Neutral dog · pug</option>
        <option value="blob">Abstract blob</option>
      </ThemedSelect>
    </label>
  );
}

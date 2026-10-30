import { useState } from "react";
import { isComfyKey, type KeyKind } from "../../shared/provider";
import Icon from "./Icon";

/** Visit-only keys never enter storage. Only the active provider can disconnect. */
export function PageKeyForm({
  kind,
  value,
  onSave,
}: {
  kind: KeyKind;
  value: string;
  onSave: (key: string) => void;
}) {
  const [error, setError] = useState("");
  const connected = Boolean(value) && isComfyKey(value) === (kind === "comfy");
  const label = kind === "comfy" ? "Comfy" : "BFL";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const entered = new FormData(event.currentTarget).get("apiKey");
        const key = typeof entered === "string" ? entered.trim() : "";
        if (isComfyKey(key) !== (kind === "comfy")) {
          setError(`Enter a ${label} key in this field.`);
          return;
        }
        onSave(key);
      }}
    >
      <label htmlFor={`page-key-${kind}`}>{label} API key</label>
      {connected && (
        <p className="key-slot__status">Connected for this visit</p>
      )}
      <input
        id={`page-key-${kind}`}
        name="apiKey"
        type="password"
        autoComplete="off"
        defaultValue={connected ? value : ""}
        placeholder={kind === "comfy" ? "comfyui-…" : "Enter your BFL key"}
        minLength={8}
        maxLength={512}
        required
      />
      <div className="dialog-actions">
        <button
          type="button"
          className="text-button"
          disabled={!connected}
          onClick={() => onSave("")}
        >
          Disconnect
        </button>
        <button className="primary-button" type="submit">
          Connect {label} <Icon name="arrow" />
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

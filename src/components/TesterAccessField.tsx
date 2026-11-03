import { useEffect, useState } from "react";
import { isTesterToken, runsLeftWords } from "../../shared/tester";
import {
  readTesterStatus,
  unlockTester,
  useTesterAccess,
} from "../tester-access";
import Icon from "./Icon";
import { readSetting } from "../settings-store";
import { readRunLocation, readWorkflows } from "../run-settings";

/**
 * Hosted reviewer access, shown only when the operator has enabled it and no
 * key of the visitor's own is connected. The code is held in this form's
 * state while typed, sent once, and dropped; the page keeps only the
 * short-lived token, in the same page memory as a visitor key.
 */
export function TesterAccessField({
  value,
  onSave,
}: {
  value: string;
  onSave: (key: string) => void;
}) {
  const available = useTesterAccess();
  const unlocked = isTesterToken(value);
  const [code, setCode] = useState("");
  const [runs, setRuns] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!unlocked) {
      setRuns(null);
      return;
    }
    const controller = new AbortController();
    readTesterStatus(value, controller.signal)
      .then((status) => setRuns(status.runsLeft))
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage("Test access expired. Enter the access code again.");
      });
    return () => controller.abort();
  }, [unlocked, value]);
  if (!available || (value && !unlocked)) return null;
  if (unlocked)
    return (
      <div className="tester-access">
        <p className="key-slot__status" role="status">
          Test access unlocked.{" "}
          {runs === null ? "Checking runs left…" : runsLeftWords(runs)}
        </p>
        <p className="settings-note">
          Runs the Comfy Deploy layout-to-video and AKUSPACE workflows on the
          Genobi test deployment. Each run still shows its quote and waits for
          your confirmation.
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => onSave("")}
          >
            Forget test access
          </button>
        </div>
      </div>
    );
  return (
    <form
      className="tester-access"
      onSubmit={(event) => {
        event.preventDefault();
        const entered = code.trim();
        if (!entered || busy) return;
        setBusy(true);
        setMessage("");
        unlockTester(entered)
          .then((result) => {
            setCode("");
            setRuns(result.runsLeft);
            onSave(result.token);
            // The unlock registered the test deployment for this session:
            // read it through the settings lanes so the model menu offers it.
            void readSetting("run-location", () => readRunLocation()).catch(
              () => {},
            );
            void readSetting("workflow", () => readWorkflows()).catch(() => {});
          })
          .catch((error: Error) => {
            setCode("");
            setMessage(error.message);
          })
          .finally(() => setBusy(false));
      }}
    >
      <label htmlFor="tester-access-code">
        Enter the access code from the submission
      </label>
      <input
        id="tester-access-code"
        type="password"
        autoComplete="off"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        maxLength={256}
        required
        disabled={busy}
      />
      <div className="dialog-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          Unlock test runs <Icon name="arrow" />
        </button>
      </div>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}

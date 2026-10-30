import Icon from "./Icon";

/** The composer's error, and the prompt to reconnect a key a run is waiting on. */
export default function ComposerAlerts({
  error,
  onDismiss,
  needsKey,
  onConnectKey,
}: {
  error: string;
  onDismiss: () => void;
  needsKey: boolean;
  onConnectKey: () => void;
}) {
  return (
    <>
      {error && (
        <div role="alert" className="error-message">
          <span>{error}</span>
          <button
            className="icon-button"
            onClick={onDismiss}
            aria-label="Dismiss error"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {needsKey && (
        <div className="error-message">
          <span>Re-enter your key to resume this generation.</span>
          <button className="text-button" onClick={onConnectKey}>
            Connect key
          </button>
        </div>
      )}
    </>
  );
}

/** Browser hand-offs the World Builder session shares with its panels. */
export const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
export const host = () =>
  window.parent !== window ? window.parent : (window.opener as Window | null);
export const send = (data: unknown) =>
  host()?.postMessage(data, location.origin);

/**
 * The session's `run`: clear the error, do the work, show its error if it
 * fails. Resolves true when the work succeeded, false after a failure, so a
 * control can put back what it showed.
 */
export const runWork =
  (setError: (message: string) => void) => (work: () => Promise<unknown>) => {
    setError("");
    return work().then(
      () => true,
      (e: unknown) => {
        setError(errorText(e));
        return false;
      },
    );
  };

const repository = "https://github.com/koshimazaki/Genobi";

export function LocalRunInstructions({
  expanded = false,
}: {
  expanded?: boolean;
}) {
  return (
    <details className="local-run-instructions" open={expanded || undefined}>
      <summary>Prefer to clone from GitHub?</summary>
      <p>Run Genobi on your computer with Node 22 or newer.</p>
      <pre>
        <code>{`git clone ${repository}.git
cd Genobi
npm ci
npm run dev`}</code>
      </pre>
      <p>
        Open <a href="http://127.0.0.1:4317">the local studio</a>, then choose
        the mic to set up voice. You can also keep using typed prompts.
      </p>
      <p>
        <a href={repository} target="_blank" rel="noreferrer">
          GitHub repository ↗
        </a>
        {" · "}
        <a
          href={`${repository}/blob/main/docs/voice-mode.md`}
          target="_blank"
          rel="noreferrer"
        >
          Voice setup guide ↗
        </a>
      </p>
    </details>
  );
}

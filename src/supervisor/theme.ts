/** Send resolved studio colors, so an embedded viewer follows every theme. */
export function supervisorTheme() {
  const style = getComputedStyle(document.documentElement);
  const mapping: Record<string, string> = {
    "--bg": "--bg",
    "--panel": "--surface",
    "--line": "--border",
    "--muted": "--soft",
    "--text": "--text",
    "--accent": "--readout",
    "--blue": "--intel",
    "--button-ink": "--accent-ink",
    "--chip-bg": "--raised",
    "--chip-border": "--border-strong",
    "--chip-text": "--text",
    "--scrollbar": "--machined",
  };
  return Object.fromEntries(
    Object.entries(mapping).map(([target, source]) => [
      target,
      style.getPropertyValue(source).trim(),
    ]),
  );
}

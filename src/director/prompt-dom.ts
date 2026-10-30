/**
 * Canonical prompt text excludes chip decoration and preserves line breaks.
 * Each line renders as its own block (`PromptLines`), so a block after the
 * first starts with a newline, as a browser's own Enter does.
 */
export function promptDomText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node instanceof HTMLElement) {
    if (node.dataset.promptDecoration !== undefined) return "";
    if (node.dataset.promptRef) return `[${node.dataset.promptRef}]`;
    if (node.tagName === "BR") return "\n";
  }
  let text = "";
  for (const [i, child] of [...node.childNodes].entries()) {
    const block = isBlock(child);
    const next = promptDomText(child);
    if (block && i > 0) text += "\n";
    text += block && next === "\n" ? "" : next;
  }
  return text;
}
const isBlock = (node: Node) =>
  node instanceof HTMLElement && ["DIV", "P"].includes(node.tagName);
export function promptSelection(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return;
  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const through = document.createRange();
  through.selectNodeContents(root);
  through.setEnd(range.endContainer, range.endOffset);
  return {
    start: promptDomText(prefix.cloneContents()).length,
    end: promptDomText(through.cloneContents()).length,
  };
}
export function setPromptSelection(
  root: HTMLElement,
  start: number,
  end = start,
) {
  function point(offset: number): [Node, number] {
    let left = Math.max(0, offset);
    function visit(node: Node): [Node, number] | undefined {
      if (node instanceof HTMLElement) {
        if (node.dataset.promptDecoration !== undefined) return;
        if (node.dataset.promptRef) {
          const length = node.dataset.promptRef.length + 2;
          if (left <= length) {
            const index = [...node.parentNode!.childNodes].indexOf(
              node as ChildNode,
            );
            return [node.parentNode!, index + (left > 0 ? 1 : 0)];
          }
          left -= length;
          return;
        }
        if (node.tagName === "BR") {
          const index = [...node.parentNode!.childNodes].indexOf(
            node as ChildNode,
          );
          if (left === 0) return [node.parentNode!, index];
          left -= 1;
          return;
        }
      }
      if (node.nodeType === 3) {
        const length = node.textContent?.length ?? 0;
        if (left <= length) return [node, left];
        left -= length;
        return;
      }
      for (const [i, child] of [...node.childNodes].entries()) {
        // Mirrors promptDomText: a later block adds one newline, and a block
        // holding only a <br> is an empty line of no length.
        if (isBlock(child)) {
          if (i > 0) {
            if (left === 0) {
              const prev = node.childNodes[i - 1];
              return [
                prev,
                prev.nodeType === 3
                  ? (prev.textContent?.length ?? 0)
                  : prev.childNodes.length,
              ];
            }
            left -= 1;
          }
          if (promptDomText(child) === "\n") {
            if (left === 0) return [child, 0];
            continue;
          }
        }
        const found = visit(child);
        if (found) return found;
      }
    }
    return visit(root) ?? [root, root.childNodes.length];
  }
  const range = document.createRange();
  const a = point(start),
    b = point(end);
  range.setStart(...a);
  range.setEnd(...b);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
export function promptCaretRect(root: HTMLElement) {
  const selection = window.getSelection();
  if (selection?.rangeCount && root.contains(selection.anchorNode)) {
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(false);
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height) return rect;
  }
  return root.getBoundingClientRect();
}

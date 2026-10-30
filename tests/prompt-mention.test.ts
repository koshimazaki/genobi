import { expect, it } from "vitest";
import { promptMention, mentionIntent } from "../src/director/prompt-mention";
it("opens the reference picker at the caret for add, character prefixes and @", () => {
  for (const query of ["add", "add car", "add ch", "@", "@style"]) {
    const text = `Use ${query} after this`;
    const match = promptMention(text, 4 + query.length)!;
    expect(match).toMatchObject({ start: 4, end: 4 + query.length });
  }
  expect(mentionIntent("car")).toMatchObject({
    purpose: "Character",
    kind: "image",
    search: "",
  });
  expect(mentionIntent("ch")).toMatchObject({ purpose: "Character" });
  expect(mentionIntent("style")).toMatchObject({ purpose: "Style" });
  expect(mentionIntent("font")).toMatchObject({ kind: "font" });
  expect(mentionIntent("before")).toMatchObject({ search: "before" });
  expect(promptMention("add character walking", 21)).toBeUndefined();
  expect(promptMention("address", 7)).toBeUndefined();
});

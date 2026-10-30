// Box 1.8, decision 2: a push on a revision an agent already moved on meets
// 409 `revision_conflict`. The studio reads the agent's revision into the
// store, never pushes over it on its own, and asks; only "Use mine" puts the
// person's version back over the agent's changes. Against the real server.
import { describe, expect, it } from "vitest";
import {
  answerCopyConflict,
  askCopyConflict,
  copyConflict,
  type CopyConflict,
} from "../src/director/copy-conflict";
import { readManifest } from "../src/director/project-copy";
import { CopySync } from "../src/director/project-copy-sync";
import { readBrief } from "../src/director/prompt-brief";
import { createStudioStore } from "../src/studio/store";
import { base } from "./house-template-fixtures";
import { settle, studio } from "./copy-sync-harness";

async function conflicted() {
  const server = await studio();
  const store = createStudioStore();
  const questions: CopyConflict[] = [];
  const sync = new CopySync({
    store,
    fetcher: server.fetcher,
    notice: () => {},
    live: () => {},
    debounce: 0,
    conflict: (question) => questions.push(question),
  });
  const id = base().project.id;
  store.getState().actions.initialize(base());
  await sync.push();
  // The agent edits on revision 1; this page has not heard of it yet.
  expect(
    (await server.agent(id, 1, { op: "set-prompt", text: "From the agent" }))
      .revision,
  ).toBe(2);
  const now = store.getState().director.bundle!;
  store
    .getState()
    .actions.commit({ ...now, project: { ...now.project, name: "Mine" } });
  await sync.push();
  const bundle = () => store.getState().director.bundle!;
  return { ...server, store, sync, questions, id, bundle };
}

describe("a push conflict while an agent works", () => {
  it("opens the agent's revision and asks before replacing it", async () => {
    const { questions, bundle, id, fetcher } = await conflicted();
    expect(readBrief(bundle()).text).toBe("From the agent");
    expect(bundle().project.name).not.toBe("Mine");
    expect(questions).toEqual([
      expect.objectContaining({ projectId: id, revision: 2 }),
    ]);
    // Nothing was pushed over the agent's revision without an answer.
    await settle();
    expect((await readManifest(id, fetcher))!.project.revision).toBe(2);
  });

  it("puts the person's version back over the agent's only on Use mine", async () => {
    const { questions, bundle, id, fetcher, sync } = await conflicted();
    questions[0].keepMine();
    expect(bundle().project.name).toBe("Mine");
    expect(readBrief(bundle()).text).not.toBe("From the agent");
    await settle();
    await sync.flush();
    const copy = (await readManifest(id, fetcher))!;
    expect(copy.project.revision).toBeGreaterThan(2);
    expect(copy.project.name).toBe("Mine");
  });

  it("asks again when the agent moved on before the answer", async () => {
    const { questions, bundle, id, agent, sync } = await conflicted();
    expect(
      (await agent(id, 2, { op: "set-prompt", text: "Later" })).revision,
    ).toBe(3);
    // The stream tells the page; it opens revision 3.
    await sync.event(id, {
      projectId: id,
      revision: 3,
      baseRevision: 2,
      source: "command",
    });
    expect(readBrief(bundle()).text).toBe("Later");
    questions[0].keepMine();
    expect(bundle().project.name).not.toBe("Mine");
    expect(questions.at(-1)).toMatchObject({ revision: 3 });
  });

  it("the studio's question runs Use mine once, and Keep the agent's not at all", () => {
    let kept = 0;
    const question = { projectId: "p", revision: 4, keepMine: () => kept++ };
    askCopyConflict(question);
    expect(copyConflict()).toBe(question);
    answerCopyConflict(false);
    expect(copyConflict()).toBeUndefined();
    expect(kept).toBe(0);
    askCopyConflict(question);
    answerCopyConflict(true);
    answerCopyConflict(true);
    expect(kept).toBe(1);
  });
});

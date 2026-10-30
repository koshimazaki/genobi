import { expect, it } from "vitest";
import {
  upgradeOpenedBundle,
  type BundleUpgrade,
} from "../src/director/upgrade-bundle";
import { createStudioStore } from "../src/studio/store";
import { base } from "./house-template-fixtures";

it("keeps a same-project edit made while an imported bundle's upgrade loads", async () => {
  const store = createStudioStore();
  store.getState().actions.initialize(base());
  const opened = store.getState().director.bundle!;
  let finish!: (value: BundleUpgrade) => void;
  const pending = upgradeOpenedBundle(
    store,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  store
    .getState()
    .actions.commit(
      { ...opened, project: { ...opened.project, name: "New edit" } },
      opened,
    );
  const edited = store.getState().director.bundle;
  finish({
    bundle: {
      ...opened,
      project: { ...opened.project, name: "Stale upgrade" },
    },
    note: "Upgraded",
  });
  expect(await pending).toBeUndefined();
  expect(store.getState().director.bundle).toBe(edited);
});

it("applies an upgrade as an undoable edit when the opened bundle stays current", async () => {
  const store = createStudioStore();
  store.getState().actions.initialize(base());
  const opened = store.getState().director.bundle!;
  expect(
    await upgradeOpenedBundle(store, async () => ({
      bundle: { ...opened, project: { ...opened.project, name: "Upgraded" } },
      note: "Upgraded",
    })),
  ).toBe("Upgraded");
  expect(store.getState().director.bundle!.project.name).toBe("Upgraded");
  expect(store.getState().director.history.at(-1)).toBe(opened);
});

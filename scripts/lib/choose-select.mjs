/** Choose through the visible studio menu, using its native form value as the contract. */
export async function chooseSelect(locator, choice) {
  const result = await locator.evaluateAll((nodes, wanted) => {
    const select =
      nodes.find((node) => node.tagName === "SELECT") ??
      nodes
        .map(
          (node) =>
            node.closest(".themed-select")?.querySelector("select") ??
            node.querySelector("select"),
        )
        .find(Boolean);
    if (!select) throw new Error("No select belongs to this control.");
    const option = Array.from(select.options).find((option) =>
      typeof wanted === "string"
        ? option.value === wanted
        : option.label === wanted.label,
    );
    if (!option || option.disabled)
      throw new Error("No enabled option matches this value.");
    const trigger = select
      .closest(".themed-select")
      ?.querySelector("button.instrument-trigger");
    if (!trigger) throw new Error("No studio menu belongs to this select.");
    return { id: trigger.id, label: option.label };
  }, choice);
  const page = locator.page();
  await page.locator(`[id=${JSON.stringify(result.id)}]`).click();
  await page.getByRole("option", { name: result.label, exact: true }).click();
}

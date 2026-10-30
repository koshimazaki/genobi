import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ProgramRow from "../src/director/ProgramRow";
import DirectorStage from "../src/director/DirectorStage";
import RenderResult from "../src/director/RenderResult";
import { renderReport } from "../shared/licensing/render-report";
import { base } from "./house-template-fixtures";

const project = base().project;
function markup(populated: boolean) {
  return renderToStaticMarkup(
    <ProgramRow
      advanced
      project={project}
      selected=""
      disabled={false}
      command={() => ""}
      output={
        populated ? (
          <RenderResult url="" report={renderReport(project)} edit={() => {}} />
        ) : undefined
      }
    >
      <DirectorStage project={project} canvas={() => {}} ready status="Ready" />
    </ProgramRow>,
  );
}

it.each([false, true])(
  "keeps prompt above two sibling monitor panes (populated=%s)",
  (populated) => {
    const html = markup(populated);
    const doc = new JSDOM(html).window.document;
    const row = doc.querySelector(".dir-program-row")!;
    expect([...row.children].map((e) => e.className)).toEqual([
      "dir-project-direction",
      "dir-monitor-panes",
    ]);
    const panes = doc.querySelector(".dir-monitor-panes")!;
    expect(panes.children).toHaveLength(3);
    expect(panes.children[0].className).toBe("dir-stage");
    expect(panes.children[2].className).toBe(
      populated ? "dir-render-result" : "dir-output-empty",
    );
  },
);

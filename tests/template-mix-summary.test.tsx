import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { adaptiveReverb } from "../shared/templates/adaptive-reverb";
import { bloomTeaser } from "../shared/templates/bloom-teaser";
import { dimensionsMix } from "../shared/templates/dimensions-mix";
import MixFields from "../src/template-gallery/MixFields";

it.each([
  [adaptiveReverb, 4, 1],
  [bloomTeaser, 11, 2],
  [dimensionsMix, 12, 3],
] as const)(
  "counts the actual shots in $0.name, including uncropped landscape sources",
  (template, shots, sources) => {
    const html = renderToStaticMarkup(<MixFields template={template} />);
    expect(html).toContain(`${shots} shots from ${sources} bundled video`);
    expect(html).not.toContain("0 slices");
    expect(html).toContain(`Timeline at ${template.mix!.cut.bpm} BPM`);
  },
);

import { useEffect, useState } from "react";
import { fontNotice } from "../../shared/director/fonts";
import { fontRequest, resolveFont } from "./font-registry";

/**
 * Which face a layer's `font` stack is drawn in on this page: the same
 * resolution the renderer makes for the preview and Render MP4, so a font
 * the browser cannot use is named here instead of silently replaced.
 */
export default function FontNotice({
  parameters,
  schema,
}: {
  parameters: Record<string, unknown>;
  schema?: Parameters<typeof fontRequest>[1];
}) {
  const request = fontRequest(parameters, schema);
  const [notice, setNotice] = useState<ReturnType<typeof fontNotice>>();
  const stack = request?.stack,
    weight = request?.weight,
    text = request?.text;
  useEffect(() => {
    if (stack === undefined) return;
    let live = true;
    setNotice(undefined);
    void resolveFont(stack, weight, text).then((r) => {
      if (live) setNotice(fontNotice(r, stack));
    });
    return () => {
      live = false;
    };
  }, [stack, weight, text]);
  if (!request || !notice) return null;
  return (
    <p
      className="dir-font-notice"
      data-warn={notice.warn}
      role={notice.warn ? "status" : undefined}
    >
      {notice.text}
    </p>
  );
}

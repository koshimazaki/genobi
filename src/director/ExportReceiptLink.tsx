import type { ExportReceipt } from "../../shared/browser-export";

export default function ExportReceiptLink({
  receipt,
}: {
  receipt: ExportReceipt | undefined;
}) {
  if (!receipt) return null;
  return (
    <p className="dir-status">
      <a href={receipt.download} download={receipt.file}>
        Download requested {receipt.format === "mp4" ? "MP4" : "project ZIP"}
      </a>{" "}
      · source revision {receipt.source.revision}
    </p>
  );
}

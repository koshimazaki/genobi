import { parseWorkflowDestination } from "../../shared/comfy/destination";

/** Revalidate persisted metadata before making a clickable link. */
export default function DeploymentLink({
  deployment,
}: {
  deployment: { url: string; name: string };
}) {
  try {
    const destination = parseWorkflowDestination("deployment", deployment.url);
    if (destination.kind !== "deployment") return null;
    const name = new URL(destination.url).hostname.split(".")[0];
    return (
      <a
        className="deployment-link"
        href={destination.url}
        target="_blank"
        rel="noreferrer"
      >
        Runs on your Comfy deployment {name}
      </a>
    );
  } catch {
    return null;
  }
}

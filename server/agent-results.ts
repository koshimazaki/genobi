import {
  APPROVAL_RESULTS_MAX,
  type AgentApproval,
} from "../shared/agent-approval";
import type { Running } from "./agent-session-types";
/** Records a started or uncertain step's outcome, newest last, bounded. */
export function noteResult(session: Running, view: AgentApproval) {
  if (view.status !== "started" && view.status !== "uncertain") return;
  session.results.delete(view.quoteId);
  session.results.set(view.quoteId, {
    quoteId: view.quoteId,
    status: view.status,
    ...(view.jobId ? { jobId: view.jobId } : {}),
  });
  while (session.results.size > APPROVAL_RESULTS_MAX)
    session.results.delete(session.results.keys().next().value!);
}

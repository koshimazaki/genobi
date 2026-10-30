import {
  projectFeedback,
  type DirectorFeedback,
} from "../../shared/director/feedback";
import type { Bundle } from "./bundle";
import { readBrief } from "./prompt-brief";

// The studio's side of feedback for the agent (`shared/director/feedback.ts`):
// the feedback for the open bundle and the file a saved bundle carries.

const promptOf = (bundle: Bundle) => {
  try {
    return readBrief(bundle).text;
  } catch {
    return "";
  }
};

/** The open bundle's feedback: changes since the agent's revision, and notes. */
export const feedbackOf = (bundle: Bundle): DirectorFeedback =>
  projectFeedback({ project: bundle.project, prompt: promptOf(bundle) });

/** The feedback as the file Download bundle writes and the panel copies. */
export const feedbackJson = (feedback: DirectorFeedback) =>
  `${JSON.stringify(feedback, null, 2)}\n`;

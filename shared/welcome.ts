/**
 * Genobi's welcome, drafted from "In one line" and "What you can do" in
 * docs/vision.md: what Genobi is, its surfaces, and that the mic starts a
 * session. Fixed text, no model call. Setup shows it first while an install
 * waits (`shared/install-messages.ts`); the agent bubble can show the same
 * words when no session is running (the setup design, Box 1.8
 * decision 6). Under 120 words, so it reads in one go.
 */
export const WELCOME =
  "Genobi is an open-source video studio. Every model, the agent and the 3D " +
  "guidance can run on your own machine, with paid cloud routes as an " +
  "option. Direct a shot in 3D, guide an image with boxes, swap a " +
  "character, remix a template on the Director's timeline, and edit what " +
  "an agent sends back as layers in the Editor. Arena compares models on " +
  "one prompt, and the deck at the bottom shows what the studio is doing. " +
  "Press the mic and say what you want: that starts a session with your " +
  "agent, which works the same tools you do. Anything that costs money is " +
  "quoted first and waits for your approval.";

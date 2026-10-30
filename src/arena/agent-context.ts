import { AGENT_PROMPT_MAX } from "../../shared/agent-session";

/** The visible Arena supplies its saved comparison only when the person starts an agent. */
let prepare: (() => Promise<{ id: string; code: string }>) | undefined;
export function registerArenaContext(
  callback: () => Promise<{ id: string; code: string }>,
) {
  prepare = callback;
  return () => {
    if (prepare === callback) prepare = undefined;
  };
}
export async function arenaAgentPrompt(prompt: string) {
  if (!prepare) return prompt;
  const { id, code } = await prepare();
  const context = `\n\nActive Arena comparison: ${id}. Use genobi_arena action=link code=${code}, then read its prompt, approaches, references and results. Record status, exact workflow/model, results and observations back into this comparison with revision checks. Run only supported workflows after their existing quote/approval; never retry uncertain submissions. Compare source timing and identity separately. If a route is not supported, report it rather than substituting a model.`;
  if (prompt.length + context.length > AGENT_PROMPT_MAX)
    throw new Error(
      "Shorten the agent instruction; the full comparison prompt stays in Arena.",
    );
  return prompt + context;
}

---
name: hermes-creative
description: Direct a Genobi creative brief through scene preparation, guidance capture, take comparison and an editable handoff, recording tool failures for a separate developer session.
---

# Creative run

Use the tools actually exposed by this session. Read `genobi-studio` with
`genobi_skill`, and use `genobi_registry` and `genobi_docs` to discover the
current workflow. Read schemas before constructing calls. A recipe mentioning
an unavailable tool is a capability gap, not permission to bypass the profile.

1. Establish the intended result, reference roles, acceptance criteria and
   authorized spending scope from the brief. Inspect available models and
   the linked project context. Pair World, Director and Arena explicitly;
   their permissions are separate. Keep the source scene, identity reference
   and style reference distinct.
2. Build or revise the scene with supported World/Director commands. Save a
   checkpoint and inspect the guide before proposing generation. Record the
   camera, source interval, dimensions, recipe version and reference roles.
   A model label in Arena does not add a generation route.
3. For any upscale, load `genobi-upscale`: a clip over 20 s is planned in
   parts behind one approval. Quote supported paid steps and show the exact plan and cost. These terminal
   profiles are agent-marked and cannot submit or approve generation. A
   terminal quote is not automatically attached to a studio session bubble;
   hand the recipe to the person for execution in their studio, or use the
   existing studio-started agent approval flow. Never remove the agent mark,
   use another identity to spend, or retry an uncertain submission.
4. Bring available results into the paired comparison/project through the
   supported tools. Inspect the output, including the source-guided interval
   separately from any generated tail. Change one intended variable at a
   time for comparisons; call out unmatched conditions. Record preference
   and observations without inventing measurements or billing receipts.
5. Finish the requested edit/export when the exposed tools support it;
   otherwise identify the exact manual step. Report output locations,
   editable project state, inspected evidence and remaining gaps. Checkpoint
   meaningful work so another session can continue.

## Hand a failure to Developer

When you run as a studio-started Genobi session and the person asks for a
change to the studio, start a Developer with `genobi_develop` (the
`genobi-develop` skill). In this standalone terminal profile the studio
refuses that tool (`agent_nested`), so write the packet below instead.

Prepare a local, private handoff under `.local/hermes-handoffs/` in the
working checkout, or in the operator's chosen private folder. Include:

- Goal and acceptance criterion; checkout SHA and studio URL.
- Smallest reproducer, exact tool/schema version and sanitized input.
- Expected versus observed behavior, error and relevant screenshots/files.
- What already ran, any pending/uncertain paid job, and safe resume point.
- Suggested diagnosis, clearly separated from observed facts.

Do not copy keys, session cookies, pairing codes or signed URLs into the
handoff. Keep owner media private. Preparing a handoff does not start or
message another agent; do that only when the person has authorized it.

## Recreate the Genobi teaser

Follow the `genobi-teaser-run` skill
(plugins/genobi/skills/genobi-teaser-run/SKILL.md, docs/genobi-teaser-run/README.md).
It needs a terminal for the analyser, the verifier and the render: run it
here once this role has one, and in `hermes-developer` until then. Without a
terminal you can still read its decision rules and claim rules to review a
run's contact sheet or wording.

## Improve the next run

You may refine your installed role skill and add local skills when real work
supports the change. Preserve a concise before/after example and its limits.
To share it, propose the change to the corresponding source under
`profiles/hermes-creative/` (or the applicable Genobi plugin skill). Have
Developer review and verify it before updating the working creator profile.
Do not update profiles during an active run. Installed skills are copies;
`hermes profile update` replaces distribution-owned skills, so transfer useful
local edits back to the repo before updating.

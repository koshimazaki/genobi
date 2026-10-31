/** The Genobi tools a session may call. `genobi_submit` spends, so it is not here. */
export const GENOBI_TOOLS = [
  "genobi_status",
  "genobi_scrolls",
  // Text only, by a one-use code from the Send that started the session.
  "genobi_scrolls_panels",
  // Read-only and stateless: a 3D scene document and its room acoustics.
  "genobi_scene",
  // Explicit one-use pairing grants control of one live browser World.
  "genobi_world",
  // Comparison records/media only; explicit one-use Arena pairing.
  "genobi_arena",
  "genobi_models",
  // Read-only node/model metadata checks, including explicit Comfy Cloud reads.
  "genobi_workflows",
  "genobi_jobs",
  "genobi_job",
  "genobi_quote",
  "genobi_template_plan",
  "genobi_world_recipe",
  "genobi_audio_analysis",
  "genobi_deployment_stage",
  "genobi_voice_status",
  "genobi_voice_transcribe",
  "genobi_take",
  // Never spends: copies a take (its own, or one the person picked) into the
  // project the agent is linked to, as the Director skill asks.
  "genobi_take_to_project",
  "genobi_projects",
  "genobi_link_project",
  "genobi_project",
  "genobi_context",
  "genobi_decision",
  "genobi_session_checkpoint",
  "genobi_taste",
  "genobi_reference",
  "genobi_project_feedback",
  "genobi_director_command",
  // Read-only: this machine and which models run here or on Comfy Cloud.
  "genobi_machine",
  // Read-only: search the tools and skills by tag or text.
  "genobi_registry",
  // Read-only: every runner can perform the licence check taught by its skill.
  "genobi_licences",
  // Read-only: search and read the project wiki.
  "genobi_docs",
  // Probe reads through the selected-source scope. Local ffmpeg writers
  // remain restricted to sources their calling session can resolve. Adding
  // them does not grant access to owner-picked or Arena media, nor attach
  // exports to the person's project. Crossfade and AKUSPACE remain excluded.
  "genobi_media_tools",
  "genobi_media_probe",
  "genobi_media_frames",
  "genobi_media_trim",
  "genobi_media_concat",
  // A split upscale's plan and reads: free. Its plan becomes one step the
  // person approves (`server/agent-approvals.ts`); the confirms stay out.
  "genobi_upscale_parts_plan",
  "genobi_upscale_parts",
  // Never spends: starts a Developer (the person's saved runner, a worktree
  // from origin/main) for a change to the studio, or reads one it started.
  "genobi_develop",
  // Read-only: the entry skill points here for the skills a task needs.
  "genobi_skill",
];

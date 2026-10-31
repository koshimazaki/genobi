---
tags: [templates, 3d, sound, agents]
summary: The Falling room template, the owner's generated loop in eight steps (brief, scene, picture and room sound, sequence, manual edit, revision, kept edit, bundle), mapped to what exists, what is free, what is paid and what is blocked.
---

# Falling room

The owner's generated loop: "Speak the brief → build the scene → generate the
picture and room sound → play the falling-room sequence → make one manual edit
→ speak a revision → agent preserves the edit → export and share the editable
bundle." The template is `falling-room` (`shared/templates/falling-room.ts`,
[house templates](templates.md)); the `falling-room` skill is the agent's
procedure. Open it at `/director?example=falling-room`. It is no longer a
gallery card (29 October 2026): a fall was the wrong example, and a flying
one will replace it once the creature's fly clip has an owner-assigned model
([gallery](template-gallery.md#falling-room)). This page stays
as the record of the loop and a World Builder example.

What it plans: **Still**, 2 s, one FLUX 3 Image Klein image
(`flux-3-klein-api`, 1K, 16:9, about $0.009), with the take's first frame as
its reference when the project holds one; then **Fall**, 6.04 s, the World
Builder's Falling room take; and **Room sound**, the take's WAV after Apply
room. Only the still is paid. Nothing runs when the template opens.

## The eight steps

| Step                        | What does it                                                                                                                                                                                                                                                                                                                                                                                                            | Free or paid                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1. Speak the brief          | The header mic ([voice mode](voice-mode.md)) starts or messages a session. Without a mic, the Genobi bubble's **Brief** box: Start Genobi sends the typed words, source `typed` ([agent setup](agent-setup.md#spawn-the-agent))                                                                                                                                                                                         | Free; the session uses the harness |
| 2. Build the scene          | Read the paired World tab’s `recipe` command, then `genobi_world_recipe` with its `revision` as `expectedRevision` and `take: "falling-room"` leaves the take on the linked project; the open World Builder applies it with `configure`, loads its dry sound and reports `applied` ([agent hand-off](world-builder.md#agent-hand-off)). The person can also pick **Falling room · take** in the Scene menu              | Free                               |
| 3. Picture and room sound   | The picture: the Klein still, quoted and approved like any paid run. The room sound: the take's dry WAV (synthesised from the recipe, [named takes](world-builder.md#named-takes)) through **Apply room · Cathedral**, local ffmpeg Space, added to project assets. In Comfy, `workflows/world-builder-acoustics.api.json` does the same from the geometry (Reverb)                                                     | Room free; the still about $0.009  |
| 4. The falling sequence     | **Capture take** records the 145-frame take as MP4 and WAV into the project; the agent puts the MP4 on the Fall plate (`replace-plate shot-fall`) and the roomed WAV under it (`add-clip`, frames 60 to 241)                                                                                                                                                                                                            | Free                               |
| 5. One manual edit          | Any edit in the Director or Editor (the check changes the title's text in the Editor's inspector)                                                                                                                                                                                                                                                                                                                       | Free                               |
| 6. Speak a revision         | The mic, or a typed message, to the running session (`POST /api/agent/sessions/:id/messages`); it arrives as the session's next turn                                                                                                                                                                                                                                                                                    | Free                               |
| 7. The agent keeps the edit | `genobi_project_feedback` lists the person's changes since the agent's last command (here `set-parameters title text "FALLING ROOM" → "THE FALL"`); the skill applies them before anything else, a stale revision is refused, a locked layer refuses edits                                                                                                                                                              | Free                               |
| 8. Export and share         | **Download bundle** writes the project, its media, the brief, `feedback.json` and now `world/recipe.json` (and `world/scene.json` when the 3D camera loaded a scene); **Open bundle** checks and reads them back, and **Load project recipe** reapplies the recipe ([the project's recipe and scene](world-builder.md#the-projects-recipe-and-scene)). Sharing is that offline ZIP; a hosted share link is out of scope | Free                               |

## What was run (29 October 2026)

On a scratch local server (port 4347, its own `.local`) with the
`tests/fixtures/agent/fake-claude.mjs` runner standing in for Claude Code and
headless Chromium on SwiftShader. `POST /api/jobs` and `/api/quotes` were
stubbed in the browser, so nothing could be paid; the Klein still was not run.
All thirteen steps passed with no page errors:

1. The gallery showed the Falling room card (since removed); its drawer opens.
2. **Take it to Director** opens the project: plates `shot-still` and
   `shot-fall` and the title.
3. The bubble's Brief box starts a session; its first turn carries the typed
   brief.
4. An agent (the Genobi CLI on its own session) links the project with the
   Director's code, reads the paired World tab's recipe/revision, and sends the take with that `expectedRevision`.
5. The 3D view applies it within about four seconds: `orbit60`, 145 frames,
   idle, hit, fall, the dry sound's 145-frame envelope, audio gain 0; the
   hand-off reads `applied`.
6. **Capture take** adds the MP4 and WAV to project assets (30 to 70 s on
   SwiftShader).
7. **Apply room · Cathedral** adds the roomed WAV in about a second.
8. The agent's `replace-plate` and `add-clip` land at revisions 7 and 8.
9. The person changes the title to THE FALL in the Editor.
10. A revision message reaches the running session as its next turn.
11. The agent's feedback shows exactly that edit.
12. Download bundle's ZIP holds `world/recipe.json` and `feedback.json`.
13. Open bundle reads it back; Load project recipe restores the Falling room
    recipe after the set was changed.

The gallery card's preview was that take, captured headless with
`scripts/capture-move-library.mjs fall` and muxed with its dry sound: the free
half of the template, not a Klein result. The clip left with the card. The take's floor impacts are timed
to that capture (the hips at frame 72, the back at 76).

## What is blocked or not proven

- **Klein spend.** The still has not run; it needs a BFL key in the studio
  and the person's approval of about $0.009. With a first frame or a sheet,
  the request carries images and goes through the CLI from a file.
- **Desktop ComfyUI.** The Comfy route for the room
  (`workflows/world-builder-acoustics.api.json`, run once on Desktop with
  another capture) has not run on the Falling room take.
- **Voice model.** The spoken brief and revision need the voice install
  ([voice setup](voice-setup.md)); the check used the typed routes.
- **By ear.** Neither the dry sound nor the room has been judged by ear.
- The hand-off keeps one recipe per project in memory; a server restart
  forgets one not yet applied. The roomed WAV is told from the dry one by
  order only (the project listing names no files).

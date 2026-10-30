---
tags: [agents, director, ltx, workflows]
summary: The anime teaser run card - four quoted LTX-2.5 Fast shots cut into a vertical 11-second teaser, the first template Claude Code and Hermes both run, with prompts, price, acceptance checks, the gaps found and the replication protocol.
---

# Anime teaser run card

The first template both agents run: a vertical
martial-arts teaser cut from four shots of the
[anime opening](../vfx-recipes/anime-opening.md) beat map. Claude Code runs it
first, then Hermes from the skills alone, each recorded by the
[session watcher](../hermes-runs.md#run-cards-and-logs). **Nothing on this
page has run or spent money yet.**

The `anime-teaser` skill
([`plugins/genobi/skills/anime-teaser/SKILL.md`](https://github.com/koshimazaki/Genobi/blob/main/plugins/genobi/skills/anime-teaser/SKILL.md))
held this card's steps up to version 0.1. Since Box 2.2 it is version 0.2,
the audio-first template of [the specification](../anime-teaser-template.md)
(see [Version 2](#version-2-audio-first-then-the-cut)); the version-1 steps
stay described on this page. An agent the studio starts reads skills, not
this wiki. `tests/plugin-skills.test.ts` checks every call in the skill
against the tool schemas and every quote against the studio's own validator.

## The teaser

Four shots, 11 seconds, 9:16, on LTX-2.5 Fast (`ltx-2-5-fast`, open weights)
through Comfy Router at `hd` (720 by 1280), the model the house template skills
already use.

| Shot   | Beat map                                  | Length | Frames at 30 fps | Camera (LTX wording)           |
| ------ | ----------------------------------------- | ------ | ---------------- | ------------------------------ |
| Breath | 1: eyes and breath, the quiet opening     | 2 s    | 0 to 60          | Close-up, eye level, Dolly in  |
| Strike | 3: forward punch with a long trail        | 3 s    | 60 to 150        | Medium shot, low angle, Static |
| Stance | 8: low stance and breath, the quiet beat  | 2 s    | 150 to 210       | Wide shot, eye level, Static   |
| Impact | 15 and 16: floor impact, flash, held pose | 4 s    | 210 to 330       | Full shot, eye level, Static   |

The Director project is the character piece at 9:16
(`/director?example=character-piece`): 360 by 640, 11 seconds at 30 fps. It is
the only vertical project the Director opens from an address, and a clip may
not run past a project's end, so the Stance is 2 seconds (as in the beat map,
13 to 15 s) rather than 3, and the teaser is 11 seconds rather than 12. Its
three palette plates sit under the new track and are covered by it.

## The prompts

Each prompt is one present-tense paragraph in the order the
[LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide) gives and the
studio's composer writes (`shared/ltx-prompt.ts`): shot size and angle, scene,
light, action, character, camera movement, audio. `cameraEnabled` is false, so
the studio appends nothing; the shot, angle and movement sentences are copied
from the LTX tables in [camera wording](../camera-wording.md) and the
`genobi-camera` skill, and the light sentences (Dramatic shadows, Muted) from
the studio's Light table. The character sentence is the same, word for word, in
all four.

The recipe's exclusions are kept in words LTX can follow: she is alone (no
opponents) and empty-handed (no weapons), no music, no speech and no words on
screen (no subtitles), and the trails and flash are flat painted brushstrokes,
not glossy CG fire.

**Breath**, 2 s, 142 words:

```text
A close-up frames the upper part of the subject. The camera sits at eye level with the subject. Hand-drawn 2D anime in a painterly style, broad textured planes of cool blue and teal in a bare stone courtyard at dusk. Hard light from one side carves dramatic shadows across the subject. Initially her eyes are closed; a moment later they open and she draws one slow breath, a faint warm glow gathering in painted strokes at her fingertips. She is a young woman in her twenties with a short black ponytail, a scarred brow, a sleeveless indigo gi with a frayed white belt and bare feet, alone and empty-handed. The camera pushes in toward the subject. At the end the subject fills the frame. One slow breath and a soft wind across stone; no music, no speech and no words on screen.
```

**Strike**, 3 s, 160 words:

```text
A medium shot frames the subject from the waist upward. The camera looks up at the subject from a low angle. Hand-drawn 2D anime in a painterly style, broad textured planes of cool blue and teal in a bare stone courtyard at dusk. Hard light from one side carves dramatic shadows across the subject. Initially she draws her right fist back to her hip; a moment later she drives a straight punch forward, and a long warm orange trail follows her fist like one painted brushstroke, flat and textured, not glossy CG fire. She is a young woman in her twenties with a short black ponytail, a scarred brow, a sleeveless indigo gi with a frayed white belt and bare feet, alone and empty-handed. The camera holds a static frame on the subject for the whole shot. A sharp exhale, the snap of her sleeve and the rush of the strike; no music, no speech and no words on screen.
```

**Stance**, 2 s, 146 words:

```text
A wide shot gives the subject room in its surroundings. The camera sits at eye level with the subject. Hand-drawn 2D anime in a painterly style, broad textured planes of cool blue and teal in a bare stone courtyard at dusk. The colour palette is muted, with soft, desaturated tones. Initially she sinks into a low stance, hands open at her sides; a moment later her shoulders drop as she breathes out, and the painted glow around her hands shrinks to two small embers. She is a young woman in her twenties with a short black ponytail, a scarred brow, a sleeveless indigo gi with a frayed white belt and bare feet, alone and empty-handed. The camera holds a static frame on the subject for the whole shot. Near silence: her slow breath and a faint wind; no music, no speech and no words on screen.
```

**Impact**, 4 s, 182 words:

```text
A full shot keeps the whole subject in the frame. The camera sits at eye level with the subject. Hand-drawn 2D anime in a painterly style, broad textured planes of cool blue and teal in a bare stone courtyard at dusk. Hard light from one side carves dramatic shadows across the subject. Initially she drops from a leap and drives her open palm into the stone floor; a flash of warm light bursts outward in flat painted brushstrokes, not glossy CG fire, and the motion slows for a moment before a sudden stop. A moment later she holds a kneeling pose as painted embers settle around her, and she lifts her eyes to meet the lens. She is a young woman in her twenties with a short black ponytail, a scarred brow, a sleeveless indigo gi with a frayed white belt and bare feet, alone and empty-handed. The camera holds a static frame on the subject for the whole shot. A deep thud on stone, embers crackling as they settle, then her breath; no music, no speech and no words on screen.
```

**Identity is not guaranteed.** The four shots are separate text-to-video
runs with no reference image, and the model keeps no identity between
runs, so the same words may give four slightly different faces. The recipe says the same of the Director modules: they support the
edit, they do not guarantee choreography or identity continuity.

## Price and the stop rule

The template skills' own figures give the rate: a 4-second LTX-2.5 Fast shot at
`hd` is $0.52 and a 3-second one $0.39, from 27.16 Comfy credits a second at 210
credits a dollar (`estimateRunUsd`, `shared/quote.ts`). So:

| Shot      | Estimate  | Ceiling   |
| --------- | --------- | --------- |
| Breath    | $0.26     | $0.30     |
| Strike    | $0.39     | $0.45     |
| Stance    | $0.26     | $0.30     |
| Impact    | $0.52     | $0.60     |
| **Total** | **$1.42** | **$1.50** |

These are estimates; each quote is the figure that binds, and the run's real
cost arrives with its result. **Stop rule:** any quote above its ceiling, or
four that come to more than $1.50, and the agent quotes nothing more, tells the
person the prices and asks. Four runs exceed the studio demo key's three a
session a day, so the run needs the owner's saved key (payer `owner`).

## The run

Two prompts in the studio, because an agent the studio starts cannot submit:
its quotes become steps the person approves in the bubble
([Confirm before spending](../agent-approvals.md)).

| #   | Who    | What happens                                                                                    |
| --- | ------ | ----------------------------------------------------------------------------------------------- |
| 1   | Person | Opens the character piece at 9:16, starts the watcher, types the first prompt                   |
| 2   | Agent  | `genobi_status`, `genobi_models`, `genobi_link_project`, `genobi_project` (checks 360 by 640)   |
| 3   | Agent  | `genobi_quote` four times, checking each price against its ceiling, then stops and says so      |
| 4   | Person | Approves the four steps in the bubble; the runs go to their gallery                             |
| 5   | Person | When all four are Ready, picks them Breath first, Impact last, and types the second prompt      |
| 6   | Agent  | `genobi_take_to_project` for each pick, then four `add-clip` commands on one new track          |
| 7   | Agent  | The title on the held pose: `set-template-inputs` and `trim-clip` on the project's name caption |
| 8   | Agent  | The motion effects, only when `genobi_project` lists them (not today; see below)                |
| 9   | Agent  | Leaves the Stance (frames 150 to 210) without effects and hands back                            |
| 10  | Person | Plays the cut, exports the MP4 from the Director                                                |

In a chat the person starts themselves (Claude Code or `hermes -p genobi`
with the plugin), the agent has `genobi_budget`, `genobi_submit` and
`genobi_provenance`, asks for a yes to the total and runs the same steps in its
own session; the skill says where the two differ. The watcher records only
sessions the studio starts.

### The finish

Cuts land on the four shot boundaries: the takes abut on one track. The
intended finish uses the motion effects of [#71](../director-bundle/motion-effects.md):
at frame 210 a two-frame warm white flash (`transition`, cut, in), radial
`speed-lines` for 18 frames and a decaying `shake` (10 px, 18 Hz, decay 4); a
`styled-title` on the held pose (frames 270 to 330); one cool `grade` over the
whole cut; nothing on the Stance, the quiet beat. The skill writes each of
these out with its parameters, checked against the recipes' schemas.

The Director cannot retime a clip, so the brief speed ramp on the floor impact
is asked of the model in the Impact prompt ("the motion slows for a moment
before a sudden stop"); the flash, lines and shake stand beside it whether or
not the take ramps.

## Acceptance checks

- Four Ready takes, one per shot, each at the length quoted.
- Each placed on its shot: `teaser-breath`, `teaser-strike`, `teaser-stance`
  and `teaser-impact` at frames 0, 60, 150 and 210 on one track, as
  `genobi_project` reads them back.
- The title shows over the held pose only, and nothing is added to frames 150
  to 210.
- The export plays: the person exports the MP4 from the Director and plays it
  through.
- The provenance card validates (`readProvenance` accepts it). See the gaps:
  today this check can pass only on the chat route.
- The run log shows every quote with its price at or under its ceiling, and
  the person's approval of each before its run.

## Gaps found while writing the card

Each is a reason a run can need a nudge or stop short; none is fixed here.

- **The motion effects cannot be added over MCP.** `add-graphic` brings in
  recipes from the trusted registry, `docs/director-bundle/example/studio.json`,
  which holds rings, bars, dither, title, crt and caption only. A project
  without the five effects cannot gain them from an agent, and the Director's
  own Add track copies only a recipe a layer already uses. The skill therefore
  checks `registryRecipes` and, today, finishes with the cuts and the project's
  caption as the title.
- **Provenance from a studio session.** `genobi_provenance` is not among a
  studio session's tools (`GENOBI_TOOLS`), and the approved runs belong to the
  person's session, which a chat's MCP session cannot read. A card for a
  studio-session run needs one of those to change.
- **The demo key** allows three runs a session a day; the teaser needs four.
- **Finding the session to watch.** The studio shows neither the session id
  nor its own cookie; both come from the browser's developer tools
  ([Hermes runs](../hermes-runs.md#run-cards-and-logs)).

## Version 2: audio first, then the cut

The owner's workflow for the anime template, dictated on 27 October 2026
and built in Box 2.2 as the `anime-teaser` template and skill version 0.2
([specification](../anime-teaser-template.md#what-is-built); not run yet; the
run above is version 1):

1. **Audio first.** Through Comfy, generate four short music candidates from
   one style prompt (for example "synthwave" or "synthwave dubstep") so the
   person can listen and choose one; or load a track the person supplies.
   Genobi has no audio-generation route yet; the model is whatever the
   configured provider offers (ElevenLabs, Stable Audio or an open model such
   as ACE-Step on Comfy Cloud), and it is quoted like any other paid step.
2. **Two sheets, two videos.** The person makes a character sheet and a
   storyboard in Scrolls, a prompt and assets for each, ideally by voice. Two
   10-second videos are generated from them (LTX-2.5 Fast today; MiniMax H3
   with the sheet as identity and a guide clip once its upload path has run).
3. **The cut.** With the two images, the videos and the chosen audio in the
   project, the agent (Claude Code or Hermes) slices the video to the beat
   with the Dual Swords ffmpeg tools and the beat grid, adds kinetic effects
   where the beat asks for them, and places two title cards.

Pieces that exist: audio analysis and the beat grid, `genobi_media_trim` and
`genobi_media_concat`, Director clip and title commands, the motion modules.
Audio generation (MiniMax Music 3, Box 2.1) and the four-candidate
listen-and-choose step (the skill's step 9) now exist too. Missing: a
voice-filled sheet flow.

## Replication protocol

1. **Run 1: Claude Code** (Opus) on the person's machine, the studio's runner
   set to `claude`, the watcher recording each of the two prompts with
   `--label anime-teaser`.
2. **Run 2: Hermes** from the skills alone (`GENOBI_AGENT_RUNNER=hermes`), the
   same card, prompts, project and watcher.
3. For each step below, mark whether Hermes did it **unaided**, needed a
   **nudge** (a follow-up prompt from the person) or **failed**. Every nudge
   becomes an edit to the skill, never a change to the run, and the next run
   uses the edited skill.
4. The two logs under `docs/hermes-runs/` are the evidence; link each from
   [Hermes runs](../hermes-runs.md#run-cards-and-logs) and the wiki home.

| Step                                  | Claude Code (run 1) | Hermes (run 2) | Skill edit |
| ------------------------------------- | ------------------- | -------------- | ---------- |
| Status, models and the project linked | Not run             | Not run        |            |
| Project shape checked (360 by 640)    | Not run             | Not run        |            |
| Four quotes, prices against ceilings  | Not run             | Not run        |            |
| Stopped and said what waits           | Not run             | Not run        |            |
| Picks handed into the project         | Not run             | Not run        |            |
| Four clips at their frames            | Not run             | Not run        |            |
| Title on the held pose                | Not run             | Not run        |            |
| Effects checked, skipped or applied   | Not run             | Not run        |            |
| Quiet beat left alone, hand-back      | Not run             | Not run        |            |

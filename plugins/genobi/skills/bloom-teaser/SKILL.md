---
name: bloom-teaser
description: Make a version of Bloom, the anime-teaser mix template - answer "character sheet" by showing the sheet and the prompt both MiniMax H3 takes were made from, make a new take of the person's own character in Camera with that prompt (quoted first), and swap a take or the track into the cut on the beat. Every paid step waits for the person's yes.
license: MIT
compatibility: Needs this checkout with npm ci and Node 22 or later; a new take needs the Genobi studio running locally with a Comfy key (MiniMax H3 on Comfy Router), or the Genobi CLI.
metadata:
  version: "0.1.0"
  template: "bloom-teaser"
  tier: "Open"
  tags: "agents, director, templates, storyboard"
  docs: "docs/bloom-teaser.md, docs/templates.md, docs/director-generate.md"
---

# Bloom (anime teaser)

A 19-second anime teaser of the owner's character Bloom, a flora-cybernetic
ninja: two MiniMax H3 (open weights) takes of one character sheet, cut to the
owner's track "Anime-Genobi" at 140 BPM under a character-scan and
surveillance look (a Space.js scan of the sheet, CRT scanlines, a REC / CAM
HUD, target boxes, callouts, a helm scan, a wireframe sweep and an editable
end card). It is a **mix** template (`run: "mix"`): opening it generates
nothing. The cut, the look, the track and how to repeat it are in
[the template page](../../../../docs/bloom-teaser.md); read it first.

## What the person hands in

The person **says or types** what they want; a sheet, a clip or a track is
an optional reference, and a spoken sentence alone is enough to start.

| Slot            | They say or type (a reference is optional)     | Example sentence                      | What happens                                           |
| --------------- | ---------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| character sheet | that they want to see it                       | "show me the character sheet"         | the sheet and the prompt are shown                     |
| new take        | their character, in words or as a sheet        | "make one of a moss knight like this" | a new MiniMax H3 take in Camera, quoted first          |
| take            | which take to replace, and with what or a clip | "this instead of the forest take"     | `bloom-h3-a.mp4` (forest) or `bloom-h3-b.mp4` (studio) |
| track           | the song they want                             | "cut it to this song"                 | `bloom-track.mp3`, re-measured                         |
| words           | a line of text                                 | "call it …"                           | the end card's words, the HUD's subject                |

## What the agent does with each slot

**"Character sheet".** Show both recorded inputs, never a paraphrase:

- the sheet, `BLOOM_SHEET` in `shared/templates/bloom-teaser.ts`
  (`public/media/director-templates/bloom-teaser/bloom-sheet.jpg`): open it
  so the person sees it;
- the prompt, `BLOOM_PROMPT` in the same file, quoted exactly as the owner
  wrote it, typos included, with the sheet as `<<<img1>>>`.

Say what is and is not known: the video is MiniMax H3 (open weights); the
sheet is a reference image whose own model is not recorded, so never name
one for it or call it open.

**A new take.** It goes through **Camera** with `BLOOM_PROMPT`, the person's
sheet in place of Bloom's. When they only describe their character, make the
sheet first, the way the `anime-teaser` skill does (FLUX 3 Edit, quoted and
confirmed), and show it before the take. Camera's MiniMax H3 on Comfy Router
(`minimax-h3-router`) takes **exactly two** reference images (the character
sheet, then the storyboard), while the recorded takes name one sheet; so ask
for a second reference (a storyboard panel or another view of the character)
and say the run is not the recorded one repeated. Read the `genobi-camera`
skill's H3 card for lengths, sizes and wording before quoting (H3 offers 4 to
15 s; the recorded takes are 15.08 s). Quote it, show the price, wait for a
yes, then submit. When the take is Ready, hand it into the project and swap
it in for the take it replaces.

**A take.** Swap the clip into `bloom-h3-a` or `bloom-h3-b` in the Director
(Make my version, or the Editor). The shots are in beats, so they stay on the
grid; the source windows are the old take's, so check the poses still land
and run `checkMix`, which refuses a slice that runs past its take.

**A track.** Measured, never assumed: the tempo, the first beat and the first
downbeat from the audio (`shared/audio-analysis.ts`). Then set
`durationSeconds` in the template and `bpm`, `inPointSeconds`,
`track.seconds` and `beats` in the cut (the cut may not outlast the track),
and the `bpm` / `seconds` of the HUD, panels, scan and slams. Every step is
in the page's "The track".

After any swap, render with the in-page renderer and show a contact sheet
before saying anything about the result.

## The paid gates

Nothing is rendered without a quote and the person's yes
([Quote, approve, then spend](../../../../docs/capabilities.md#quote-approve-then-spend)):
a new take is `genobi_quote`, the price shown, a yes to that price, then
`genobi_submit` with that quote (or `genobi submit --confirm` from the CLI).
Never retry an uncertain submission automatically or change its key. Showing
the sheet and the prompt, the swaps, `checkMix` and the in-page render cost
nothing.

## Where the deep procedure lives

- [The template page](../../../../docs/bloom-teaser.md): the footage, the
  cut's beat table, the look, the track and How to repeat it.
- The `genobi-camera` skill (load it with `genobi_skill`): the MiniMax H3
  card and its camera wording.
- The `anime-teaser` skill: the generated anime teaser (sheet, storyboard,
  two H3 shots, a track) when the person wants a whole new piece rather than
  one take.
- [Make your version](../../../../docs/director-generate.md): swapping media
  into a finished template's slots.

Record each brief and correction with `genobi_decision`, quoting the person.

## Not built yet

- Repeating the recorded run exactly: the takes' route is not recorded, and
  Camera's H3 on Router needs two references where the recorded prompt names
  one.
- Nobody listened to the cut here: the cut points are beat arithmetic. Say
  "give it a listen" and leave the verdict to the person.
- A hosted card that takes these slots: today the drop happens in the
  Director's Make my version or in a chat with the agent.

# Music model card

Read this card when the person wants a track: a teaser's music bed, or the
`track` reference of a template when none was dropped. Quote every candidate
and wait for approval before each submission. Never retry an uncertain paid
submission.

### MiniMax Music 3 · Text to music (`minimax-music-3`)

| Field   | Value                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "audio", "model": "minimax-music-3"`; `description` is the caption, `lyrics` optional, `duration` whole seconds from 5 to 120   |
| Route   | `workflow`, `workflow/minimax-music-3` on the selected Comfy destination; needs a Comfy key. Open weights                                     |
| Camera  | None; a song has no camera                                                                                                                    |
| Output  | One MP3 (V0) take; the studio measures its length from the file and serves it as `audio/mpeg`                                                 |
| Cost    | Quote first. A provisional GPU-time allowance (240 s at 0.266 credits/s, about $0.30), not a measured price; Cloud reports no credits per run |
| Source  | `workflows/minimax-music-3.json`; recipe, provenance and licence notes in `workflows/minimax-music-3.README.md`                               |

**Caption.** The template's note asks for three parts in order: global
metadata (genre, tempo, key, mood), vocal details, arrangement. For an
instrumental bed say "no vocals" in the caption. Keep it under 2,000
characters.

**Lyrics.** Section tags (`[intro]`, `[verse]`, `[chorus]`, `[bridge]`,
`[outro]`, `[Instrumental]`) are the structure the model follows; the words
only carry mood. Leave `lyrics` empty or omit it for none: it is sent empty,
and whether an empty field alone makes an instrumental has not been tested.
Up to 3,000 characters.

**Duration** is a ceiling, not the song's length (`max_duration`). The
encoder decides the length: it samples until it emits its end token, often
well before the ceiling. The take
records the measured length; read it before placing the song, and do not
promise the person a length. A longer request does not force a longer song.

**Candidates.** Four candidates are four quotes and four submissions, each
with its own `idempotencyKey`. Every run draws a fresh seed, so the same
caption gives four different songs. There is no batch request. Show the
person all four takes and let them pick; the others stay as takes.

**Into a project.** `genobi_take_to_project` hands a Ready song in as a
production audio asset with its measured length; place it on an audio track
with `add-clip`, then `genobi_audio_analysis` reads its beats. A section of
it cut with `genobi_media_trim` goes in by its `sourceId` the same way, as an
audio asset whose record names the song as its input once the song is in.

**Licence.** The weights are under the MiniMax-Music3 Community License
([LICENSE](https://huggingface.co/MiniMaxAI/MiniMax-Music3/blob/main/LICENSE),
checked 27 October 2026), not Apache-2.0: the `apache-2.0` tag on the
Comfy-Org card is the repackager's label. Commercial use is allowed under its
conditions: keep the notice; follow its Acceptable Use Policy (disclose
publicly posted songs as machine generated; no military use); a commercial
product shows "MiniMax-Music3" in its interface, with written authorization
from MiniMax above US$20 million yearly revenue from such products; a hosted
service keeps safeguards against infringing uses. **Keep the credit:** when a
song goes into a project, a credit card, a title or anything published, carry
"MiniMax-Music3" with it, and never remove the credit the studio shows.

The hosted studio refuses music for now (`audio_local_only`): run it from the
local studio.

Example: `genobi_quote {"generator": "audio", "model": "minimax-music-3", "description": "Synthwave anime teaser, driving bass, dubstep drops, 128 BPM, no vocals.", "duration": 20}`

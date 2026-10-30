---
tags: [3d, agents, mcp]
summary: Walk, switch characters, animate the local creature, and record camera and character movement through World, API or CLI.
---

# Live World sessions

In World, choose a character and enter **Walk**. WASD/arrows move, Shift runs,
Space jumps. The creature uses its attached Backflip for jumping. Buttons and
keys 1/2/3 trigger Ninja Idle, Fireball and Backflip. Character switching keeps
the capsule position. Follow, Orbit and Shot camera move work while walking.
Shot uses the prepared camera path and keeps looking at the character.

Load the original local Creature VRM and its FBX pack under Scene first.
The original pack's nine slots stay distinct: Idle, Walking, Run, Standard Run,
Flying, Backflip, Fireball, Breathing Idle, Ninja Idle. Model and motion bytes
stay in the tab; refresh requires reattachment. The creature retains its raw
humanoid rig, normalized Mixamo retargeting, authored spring joints and
colliders. Secondary movement uses fixed 60 Hz integration for repeatable
seeking. No Unreal-specific retarget mapping has been verified here.

**Record live** captures up to 30 seconds of the viewport, including character
switches, actions and camera movement. Stop recording and open Capture to
save WebM, first PNG and a receipt with sampled state. It requests 30 fps;
real-time frame delivery depends on the browser. This is distinct from the
fixed-frame **Capture take**, which also works while walking: it freezes the
current viewport (after a follow, orbit or shot camera) as the recipe's shot
camera, saves the character's position, returns to Shot and replays that
camera with the recipe's move on the 24 fps grid
([World Builder](world-builder.md#build-and-explore)). Live clips currently
contain no audio.

## Pair an agent

Run the local studio with `npm run dev`. A Vite-only preview or hosted site
cannot provide the bridge. In World click **Connect agents**, then supply its
one-use pairing code to the agent. The CLI shares the MCP tool:

```sh
genobi world --input '{"action":"link","code":"CODE_FROM_WORLD"}'
```

The result contains `id`. Use it as `session` below; the same CLI profile keeps
the linked cookie. `--url http://127.0.0.1:PORT` selects a nondefault server.

```json
{
  "action": "command",
  "session": "SESSION_UUID",
  "command": {
    "op": "control",
    "input": {
      "character": "creature",
      "move": [0, 1],
      "running": true,
      "camera": "orbit",
      "seconds": 3
    }
  }
}
```

Movement is camera-relative: `[right, forward]`. Each command's movement expires
after 0.1–10 seconds. Keyboard movement can run alongside camera commands.
Camera mode persists until changed or stopped. `action` accepts an attached
motion slot, including `ninja`, `spell` (Fireball), `backflip` or `jump`.

Commands return an id immediately. Poll with:

```json
{ "action": "result", "session": "SESSION_UUID", "id": "COMMAND_UUID" }
```

Wait for `done` or `error` before dependent work. A `running` command with no
answer has an unknown outcome; do not submit it again automatically.

Record a clip by sending `record-start`, then coordinated `control` commands,
then `record-stop`. Each is a command, e.g.:

```json
{
  "action": "command",
  "session": "SESSION_UUID",
  "command": { "op": "record-stop" }
}
```

After its result is done, download into a **new** directory (the latest clip
or captured take, with whichever passes it has):

```json
{ "action": "download", "session": "SESSION_UUID", "directory": "./world-clip" }
```

`status` reports readiness, available motions and position. `stop` clears agent
and keyboard movement and returns the camera to Follow. It does not end a
recording; use `record-stop`. No operation submits a paid generation.

`presets` lists the [scene library](world-builder.md#scene-library)'s presets,
each move-library preset with its `file` name. `load-preset` with a `name`
loads one into the scene (it stops Play and is refused in Walk); the name is a
preset's own (`Move · fall-cathedral`, `Fall · big room`, a saved one) or a
move-library file name without `.json` (`fall-cathedral`), and its result
carries the loaded `recipe` beside `name`, `scene`, `frames` and `seconds`.
`recipe` returns the current recipe as `getRecipe()` gives it, at most 64 KB
of JSON, to read back what a preset, a hand-off or the person left in the
scene. `takes` lists the tab's library takes. A recorded clip also lands in
that library.

## Send a take to the project

`send-to-project` with a `take` (a library take's `id` from `takes`, or its
name, the newest of that name winning) does what the take card's **Send to
Director** does, in the paired tab:

```sh
genobi world --input '{"action":"command","session":"SESSION_UUID","command":{"op":"send-to-project","take":"falling-room-wide"}}'
```

The take's first frame lands under Inspirations as a reference, and the take
under Project, re-encoded in the tab from WebM to MP4 (`take-mp4.ts`, the same
encoder Add to assets uses; there is no server transcoder), with its WAV when
it has sound. The files are named after the take, so `genobi project` lists
each asset with that name as its `label`. The result, once `done`, gives
`take` (`id`, `name`), `frame`, `video` and `audio` (or `null`), each with its
`assetId`, `added` (false when the project already held those bytes), `use`
and `filename`. Place them with `genobi director-command` on a linked project.

It goes into the project open in that studio tab, so it needs no project link
of its own. It is refused, as an `error` result, outside the studio (the
ComfyUI node's World Builder has no project: `Open the studio to send
takes.`), for a take past the project's 150 MB media limit before anything lands, for a
name the library does not hold, while another take is being added, and when
the browser cannot encode MP4. Encoding takes about as long as the take; read
`result` until `done` or `error`, and never resend one whose result has not
come back. `src/world-builder/send-take.ts` holds the rules;
`tests/world-send-to-project.test.ts` covers them.

## Capture a take

An agent paired with the open tab finishes a take without browser scripting
by sending the `capture` command with a name:

```sh
genobi world --input '{"action":"command","session":"SESSION_UUID","command":{"op":"capture","name":"falling-room-wide"}}'
```

The tab runs what the Capture button runs: Play stops, the current recipe is
rendered on its fixed frame grid from frame zero, and the take (colour WebM,
depth WebM and PNG when the renderer has a depth pass, first frame, receipt,
and the loaded sound as WAV) carries the given name, which must be 1 to 64
letters, digits, hyphens or underscores. The command is done once the take is
in the **Takes** library; its result gives `name`, `frames`, `width`,
`height`, `fps`, `seconds`, `passes`, `audio` and `files`, the local API path
and size of each of `clip.webm`, `first.png`, `receipt.json`, `depth.webm`,
`depth-first.png` and `audio.wav` the take has. Action `download` saves them
into a new directory. The session holds only the latest take or live clip.
Unlike the button, it is not added to project assets: send it with
`send-to-project` (above), or the person uses Add to assets or Send to
Director ([scene library](world-builder.md#scene-library)).

It is refused, as an `error` result, in Walk (`Return to Shot camera before
capture.`), while recording live (`Stop live recording first.`), while another
take is being captured or the scene is loading (`Stop preview or wait for the
current operation.`) and while a take is being added to assets. Build is
allowed: the viewport becomes the shot camera, as with the button. A capture
takes as long as its frames do; read `result` until `done` or `error`, and
never resubmit one whose result has not come back. Nothing is generated or
uploaded beyond the local server. `src/world-builder/agent-capture.ts` holds
the rules; `tests/world-capture.test.ts` covers them.

## HTTP boundary

All routes live below `/api/world` on the loopback-only local server, using its
session cookie and same-origin checks. The owner tab POSTs `connect`, polls
`/:id/next`, and acknowledges dispatched commands. Agents POST `link` with the
one-use code, POST `/:id/commands`, GET `/:id/commands/:command`, and GET the
returned file paths with their paired cookie. Only the owner can dispatch,
acknowledge, upload, clear `/:id/files` or DELETE `/:id` to disconnect.
`GET /:id/files` lists the held files. Disconnect stops controls.

Connections, commands and the latest clip or take are memory-only. Four
sessions, 16 pending commands and 64 command receipts per session are allowed.
Files are bounded to 64 MB each and 144 MB per session. Connections expire
after five minutes without browser polling; new commands refuse a tab silent
for ten seconds. Keep the World tab foregrounded. Restart/reload requires pairing again.
The bridge neither reads arbitrary files nor evaluates agent-supplied code.
CLI download creates a new directory and never overwrites an existing one.

## Two codes, and why

Pairing with World and linking a project are separate grants. The World code
lets an agent steer, capture and send takes in that one tab; it does not let
the agent read or edit the project. `genobi_world_recipe` and every
`genobi project` or `director-command` call need the project link the person
makes under Project Tools → Workflow tools → JSON editor → **Link an agent**,
a second one-use code. A paired World session does not mint that link for
itself: doing so would widen what the person agreed to when they paired World
(steering one tab) into editing their project, so the person grants it
separately. `send-to-project` and `load-preset` work with the World code
alone; a recipe the agent built itself reaches the scene through
`genobi_world_recipe` on a linked project. That hand-off records who sent it
as `from`: `person` for the owner's studio, `cli` for the Genobi CLI, and
`agent` for an agent session or another linked client.

---
name: director-remix
description: Recreate a Director template with replacement character or clothing assets, edit its JSON bundle, export exact frames and cut MP4s using Director and the dual editor. Use for template remixes and Comfy handoffs in camera-director.
---

# Director remix

Run `npm run dev` and open `/director?template=character-intro` on the printed local URL. The app is the execution host; the skill is the agent-facing procedure. Read [the tool contract](../../../docs/director-agent-tools.md) for commands and [Comfy handoff](../../../docs/director-comfy.md) for video generation.

1. Open the supplied ZIP bundle, or use Character intro. Preserve the input ZIP before changes. Normal mode accepts a prepared image/video and title; advanced mode exposes the timeline and **JSON editor & agent tools**.
2. In that panel, fill **Agent command** with `{"op":"inspect"}`, click **Run command**, and read **Agent receipt**. Use actual layer/asset IDs and the current revision from this result. File inputs are the supported media ingress; do not fabricate local paths in JSON or send base64 videos through the command field.
3. For a character replacement, attach a prepared image or video to **Command replacement file**, then run `{"op":"replace","revision":1,"layerIds":["character-wide","character-close"]}` with the inspected revision. Both shots retain timing and transforms. A replacement video restarts at source frame zero for each shot and must cover both shot durations. For distinct clips, replace one shot at a time.
4. Edit text with `{"op":"text","revision":2,"layerId":"title","text":"MAKE IT YOURS"}`. Inspect again after another actor edits. Locked layers reject these edits. Full project JSON is an explicit project replacement and can change locks; use it only when the requested edit calls for that scope.
5. For FLUX inference, use the generation disclosure: scene image + reference image, character/clothing mode, optional region/instructions and the user's transient provider key. Check the job status; never click Generate again to recover an uncertain submission. Apply the completed result explicitly. Do not put a key into commands, project JSON, receipts, files or memory.
6. For exact source frames/cuts, use the `frame` and `cut` commands. These invoke the dual editor's existing decoder and MP4 exporter. `plate` exports Director's visual timeline without captions, effects or music for Comfy. Export the exact first frame from that plate in Dual editor, then follow the linked LTX workflow. A source-frame index and a composition-frame index are different units.
7. For stored MP4s, open **Saved videos · import and store**, refresh the list, choose a saved video and an unlocked target under **Replace clip**, then **Use saved video**. Upload a completed Comfy MP4 here if it is not already in the library. Hosted uploads use a transient connection key; local uploads need none. After rendering, **Save rendered video** stores the MP4. On an uncertain upload, refresh history before retrying. This library is private to the browser session, expires under retention/quotas, and does not save project JSON.
8. Preview, render MP4, inspect it, and download the bundle. The ZIP is the editable deliverable; the MP4 is the viewing deliverable. App navigation currently reloads the page: save first.

Use permitted browser UI actions to fill commands and upload files. This skill does not require page JavaScript injection or grant access to a provider. It does not install models, start a GPU server or authorize paid inference. The first proof offers local composition and an explicit LTX handoff, not automatic tracked-mask generation or an LTX cloud submission endpoint.

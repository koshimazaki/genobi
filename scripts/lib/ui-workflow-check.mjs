// Structural checks for UI-format ComfyUI workflows (the JSON the editor
// saves: `nodes`, `links`, `groups`). No server is needed for
// `checkStructure` and `modelFiles`; `checkSchemas` takes an /object_info
// dump (plus overlays for packs that are not installed) and checks that every
// class exists, every link type-matches the class's own schema, and every
// required input is linked or carries a widget.

/** Node types the frontend draws itself; they never reach the server. */
export const FRONTEND_ONLY = new Set(["MarkdownNote", "Note", "Reroute"]);

const WIDGET = new Set([
  "INT",
  "FLOAT",
  "STRING",
  "BOOLEAN",
  "COMBO",
  "COMFY_DYNAMICCOMBO_V3",
]);
const MATCH = "COMFY_MATCHTYPE_V3";

const FRONTEND_INPUTS = new Set(["AUDIO_UI", "AUDIOUPLOAD", "IMAGEUPLOAD"]);
const typeOf = (spec) => (Array.isArray(spec[0]) ? "COMBO" : spec[0]);
const forced = (spec) => Boolean(spec[1] && spec[1].forceInput);

/** True when an output of type `out` may feed an input declared `input`. */
export function accepts(out, input) {
  if (input === "*" || input === MATCH || out === MATCH) return true;
  return out === input || input.split(",").includes(out);
}

/** Link table and per-node link fields agree; link types match both ends. */
export function checkStructure(wf) {
  const errors = [];
  const nodes = new Map();
  for (const n of wf.nodes) {
    if (nodes.has(n.id)) errors.push(`duplicate node id ${n.id}`);
    nodes.set(n.id, n);
  }
  const ids = new Set();
  for (const [id, from, fromSlot, to, toSlot, type] of wf.links) {
    if (ids.has(id)) errors.push(`duplicate link id ${id}`);
    ids.add(id);
    const a = nodes.get(from);
    const b = nodes.get(to);
    if (!a || !b) {
      errors.push(`link ${id} names a missing node`);
      continue;
    }
    const out = a.outputs?.[fromSlot];
    const inp = b.inputs?.[toSlot];
    if (!out || !inp) {
      errors.push(`link ${id} names a missing slot`);
      continue;
    }
    if (!(out.links ?? []).includes(id))
      errors.push(`link ${id} missing from ${a.type}.${out.name}.links`);
    if (inp.link !== id)
      errors.push(`link ${id} not on ${b.type}.${inp.name}.link`);
    if (out.type !== type)
      errors.push(
        `link ${id} type ${type} ≠ ${a.type}.${out.name} ${out.type}`,
      );
    if (!accepts(type, inp.type))
      errors.push(`link ${id} ${type} → ${b.type}.${inp.name} ${inp.type}`);
  }
  for (const n of wf.nodes) {
    for (const i of n.inputs ?? [])
      if (i.link != null && !ids.has(i.link))
        errors.push(`${n.type} ${n.id}.${i.name} names missing link ${i.link}`);
    for (const o of n.outputs ?? [])
      for (const l of o.links ?? [])
        if (!ids.has(l))
          errors.push(`${n.type} ${n.id}.${o.name} names missing link ${l}`);
  }
  if (wf.last_node_id < Math.max(...wf.nodes.map((n) => n.id)))
    errors.push("last_node_id is below the highest node id");
  if (wf.last_link_id < Math.max(0, ...ids))
    errors.push("last_link_id is below the highest link id");
  return errors;
}

/** Every class, link and required input against /object_info schemas. */
export function checkSchemas(wf, info) {
  const errors = [];
  const byId = new Map(wf.nodes.map((n) => [n.id, n]));
  for (const n of wf.nodes) {
    if (FRONTEND_ONLY.has(n.type)) continue;
    const s = info[n.type];
    if (!s) {
      errors.push(`${n.id}: class ${n.type} is not in /object_info`);
      continue;
    }
    const declared = { ...s.input?.required, ...s.input?.optional };
    for (const i of n.inputs ?? []) {
      const spec = declared[i.name];
      // The frontend adds upload/preview widgets and dynamic-combo children.
      if (!spec && (i.name.includes(".") || FRONTEND_INPUTS.has(i.type)))
        continue;
      if (!spec) {
        errors.push(`${n.id} ${n.type}: no input named ${i.name}`);
        continue;
      }
      const want = typeOf(spec);
      if (want !== MATCH && want !== "*" && i.type !== want)
        errors.push(`${n.id} ${n.type}.${i.name}: ${i.type}, schema ${want}`);
      if (i.link != null) {
        const link = wf.links.find((l) => l[0] === i.link);
        if (link && !accepts(link[5], want))
          errors.push(
            `${n.id} ${n.type}.${i.name} takes ${want}, fed ${link[5]}`,
          );
      }
    }
    (n.outputs ?? []).forEach((o, slot) => {
      const raw = s.output?.[slot];
      const want = Array.isArray(raw) ? "COMBO" : raw;
      if (s.output_name?.[slot] !== o.name)
        errors.push(
          `${n.id} ${n.type} output ${slot} is ${o.name}, schema ${s.output_name?.[slot]}`,
        );
      else if (want !== MATCH && o.type !== want)
        errors.push(`${n.id} ${n.type}.${o.name}: ${o.type}, schema ${want}`);
    });
    for (const [name, spec] of Object.entries(s.input?.required ?? {})) {
      const i = (n.inputs ?? []).find((x) => x.name === name);
      const widget = WIDGET.has(typeOf(spec)) && !forced(spec);
      // Older saves list only sockets in `inputs`; widgets live positionally
      // in `widgets_values`.
      if (widget && (i?.widget || i?.link != null)) continue;
      if (widget && !i && (n.widgets_values ?? []).length) continue;
      if (!widget && i?.link != null) continue;
      errors.push(
        `${n.id} ${n.type}: required ${name} is ${widget ? "missing" : "not linked"}`,
      );
    }
  }
  for (const l of wf.links)
    if (!byId.has(l[1]) || !byId.has(l[3]))
      errors.push(`link ${l[0]} dangling`);
  return errors;
}

/** Loader classes and the widget that names their file. */
export const LOADERS = new Set([
  "UNETLoader",
  "CLIPLoader",
  "VAELoader",
  "LatentUpscaleModelLoader",
  "LoraLoaderModelOnly",
  "LTXICLoRALoaderModelOnly",
]);

/** The model filenames a workflow's loaders name. */
export function modelFiles(wf) {
  const files = [];
  for (const n of wf.nodes)
    if (LOADERS.has(n.type))
      for (const v of n.widgets_values ?? [])
        if (typeof v === "string" && /\.(safetensors|pth|ckpt)$/.test(v))
          files.push({ node: n.id, type: n.type, file: v });
  return files;
}

/** Basenames listed in comfy-build/models/*.txt (column 4 is the path). */
export function listedModels(texts) {
  const names = new Set();
  for (const text of texts)
    for (const line of text.split("\n")) {
      if (!line.trim() || line.startsWith("#")) continue;
      const path = line.trim().split(/\s+/)[3];
      if (path) names.add(path.slice(path.lastIndexOf("/") + 1));
    }
  return names;
}

const GUIDES = new Set(["LTXAddVideoICLoRAGuide"]);
const STILLS = new Set(["LoadImage"]);

/**
 * Every image size feeding an IC-LoRA guide, and every LTX video latent built
 * in a graph with one, is a multiple of 64. This static rule stands in for
 * the LoRA header's `reference_downscale_factor`: the guide and latent sides
 * divided by 32 (the VAE's spatial factor) must divide by that factor, which
 * is 2 for the Union Control IC-LoRA (1024×576 → 32×18, but 960×544 → 30×17
 * fails in iclora.py). A still at frame −1 (LoadImage) is resized by the
 * guide to the latent, so it is not checked; any other source must pass
 * through a "scale dimensions" ResizeImageMaskNode the rule can read.
 */
export function checkGuideSizes(wf) {
  const errors = [];
  const byId = new Map(wf.nodes.map((n) => [n.id, n]));
  const link = new Map(wf.links.map((l) => [l[0], l]));
  const source = (n, name) => {
    const i = (n.inputs ?? []).find((x) => x.name === name);
    const l = i?.link != null ? link.get(i.link) : undefined;
    return l ? byId.get(l[1]) : undefined;
  };
  const sized = (n, what) => {
    if (n?.type !== "ResizeImageMaskNode")
      return `${what} comes from ${n?.type ?? "nothing"}, not a sized resize`;
    const [mode, w, h] = n.widgets_values ?? [];
    if (mode !== "scale dimensions")
      return `${what}: ResizeImageMaskNode ${n.id} uses "${mode}", size unknown`;
    if (w % 64 || h % 64)
      return `${what}: ResizeImageMaskNode ${n.id} is ${w}×${h}, not multiples of 64`;
    return null;
  };
  const guides = wf.nodes.filter((n) => GUIDES.has(n.type));
  for (const g of guides) {
    const src = source(g, "image");
    if (STILLS.has(src?.type)) continue;
    const e = sized(src, `guide ${g.id} image`);
    if (e) errors.push(e);
  }
  if (!guides.length) return errors;
  for (const n of wf.nodes.filter((x) => x.type === "EmptyLTXVLatentVideo")) {
    for (const [slot, name] of [
      [0, "width"],
      [1, "height"],
    ]) {
      const src = source(n, name);
      if (!src) {
        const v = n.widgets_values?.[slot];
        if (v % 64)
          errors.push(`latent ${n.id} ${name} ${v} is not a multiple of 64`);
      } else if (src.type === "GetImageSize") {
        const e = sized(source(src, "image"), `latent ${n.id} ${name}`);
        if (e) errors.push(e);
      } else errors.push(`latent ${n.id} ${name} comes from ${src.type}`);
    }
  }
  return errors;
}

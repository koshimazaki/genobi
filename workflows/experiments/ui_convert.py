"""Convert a ComfyUI frontend (UI) workflow, subgraphs included, to API format.

Uses the target server's /object_info for widget names, hidden inputs and output
nodes, so the result matches what that server would accept. Offline and pure:
the caller fetches object_info. Conservative by design:

- a node type the server does not list is refused (all of them are named);
- subgraph instances are expanded with ids "<instance>:<inner>", nested too;
- Reroute, muted (mode 2) and bypassed (mode 4) nodes are spliced out;
- a ComfySwitchNode with a literal switch, and a StringContains with literal
  inputs, are folded, then nodes no output node reaches are pruned, so an
  unused prompt-enhancer branch does not demand its models.
"""
import copy

UI_ONLY = {"Note", "MarkdownNote", "Reroute", "PrimitiveNode"}
WIDGET_TYPES = {"INT", "FLOAT", "STRING", "BOOLEAN", "COMBO", "COMFY_DYNAMICCOMBO_V3"}
FRONTEND_ONLY = {"upload", "control_after_generate", "control_before_generate"}
INPUT_NODE, OUTPUT_NODE = -10, -20


def is_widget(spec):
    if not isinstance(spec, (list, tuple)) or not spec:
        return False
    options = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
    return (isinstance(spec[0], list) or spec[0] in WIDGET_TYPES) and not options.get("forceInput")


def schema_inputs(schema):
    """Declared (non-hidden) inputs in server order: [(name, spec)]."""
    inputs = schema.get("input", {})
    order = schema.get("input_order") or {}
    rows = []
    for group in ("required", "optional"):
        declared = inputs.get(group) or {}
        names = order.get(group) or list(declared)
        rows.extend((name, declared[name]) for name in names if name in declared)
    return rows


def widget_values(node, schema, notes):
    """Map a node's saved widget values to input names; prefer the named form."""
    declared = schema_inputs(schema)
    names = {name for name, _ in declared}
    named = node.get("widgets_values_named")
    values = node.get("widgets_values")
    result = {}
    if isinstance(named, dict) or isinstance(values, dict):
        for key, value in (named if isinstance(named, dict) else values).items():
            if key.split(".")[0] in names:
                result[key] = value
            elif key not in FRONTEND_ONLY:
                notes.append(f"{node['id']}: dropped widget {key!r} the server does not declare")
        return result
    values = list(values or [])
    position = 0
    for name, spec in declared:
        if not is_widget(spec):
            continue
        if position >= len(values):
            break
        result[name] = values[position]
        position += 1
        options = spec[1] if len(spec) > 1 and isinstance(spec[1], dict) else {}
        if options.get("control_after_generate") or (spec[0] == "INT" and name in ("seed", "noise_seed")):
            position += 1
        if any(key.endswith("_upload") and options[key] for key in options):
            position += 1
    if position != len(values):
        notes.append(f"{node['id']}: {len(values)} saved widget values, {position} mapped by position; check it")
    return result


class Scope:
    """One graph level: the top workflow or one subgraph instance."""

    def __init__(self, nodes, links, prefix, subgraphs, parent=None, instance=None, definition=None):
        self.nodes = {node["id"]: node for node in nodes}
        self.links = {}
        for link in links or []:
            if isinstance(link, dict):
                self.links[link["id"]] = (link["origin_id"], link["origin_slot"])
            else:
                self.links[link[0]] = (link[1], link[2])
        self.prefix, self.subgraphs = prefix, subgraphs
        self.parent, self.instance, self.definition = parent, instance, definition

    def child(self, node):
        definition = self.subgraphs[node["type"]]
        return Scope(definition["nodes"], definition.get("links"), f"{self.prefix}{node['id']}:",
                     self.subgraphs, self, node, definition)

    def link(self, link_id):
        """A link id -> ("link", api_id, slot), ("value", v) or None."""
        if link_id is None or link_id not in self.links:
            return None
        origin, slot = self.links[link_id]
        if origin == INPUT_NODE:
            return self.boundary_input(slot)
        return self.output(origin, slot)

    def boundary_input(self, slot):
        """A subgraph input slot -> what the instance supplies (link, widget or nothing)."""
        name = self.definition["inputs"][slot]["name"]
        entry = next((item for item in self.instance.get("inputs", []) if item.get("name") == name), None)
        if entry is not None and entry.get("link") is not None:
            return self.parent.link(entry["link"])
        named = self.instance.get("widgets_values_named")
        if isinstance(named, dict) and name in named:
            return ("value", named[name])
        widget_inputs = [item["name"] for item in self.definition["inputs"]
                         if item.get("type") in WIDGET_TYPES - {"COMFY_DYNAMICCOMBO_V3"}]
        values = self.instance.get("widgets_values")
        if isinstance(values, list) and name in widget_inputs and widget_inputs.index(name) < len(values):
            return ("value", values[widget_inputs.index(name)])
        return None

    def output(self, node_id, slot):
        node = self.nodes.get(node_id)
        if node is None:
            return None
        if node["type"] in self.subgraphs and node.get("mode", 0) == 0:
            inner = self.child(node)
            link_ids = inner.definition["outputs"][slot].get("linkIds") or []
            return inner.link(link_ids[0]) if link_ids else None
        if node["type"] == "Reroute":
            return self.link((node.get("inputs") or [{}])[0].get("link"))
        if node["type"] == "PrimitiveNode":
            return ("value", (node.get("widgets_values") or [None])[0])
        if node.get("mode", 0) == 2:
            return None
        if node.get("mode", 0) == 4:
            wanted = (node.get("outputs") or [])[slot].get("type") if slot < len(node.get("outputs") or []) else None
            match = next((item for item in node.get("inputs", []) if item.get("type") == wanted and item.get("link") is not None), None)
            return self.link(match["link"]) if match else None
        return ("link", f"{self.prefix}{node_id}", slot)


def emit(scope, info, graph, missing, notes):
    for node in scope.nodes.values():
        kind, mode = node["type"], node.get("mode", 0)
        if kind in UI_ONLY or mode in (2, 4):
            continue
        if kind in scope.subgraphs:
            emit(scope.child(node), info, graph, missing, notes)
            continue
        schema = info.get(kind)
        if not isinstance(schema, dict):
            missing.add(kind)
            continue
        inputs = widget_values(node, schema, notes)
        for item in node.get("inputs", []):
            source = scope.link(item.get("link"))
            if source is None:
                continue
            inputs[item["name"]] = [source[1], source[2]] if source[0] == "link" else source[1]
        graph[f"{scope.prefix}{node['id']}"] = {"class_type": kind, "inputs": inputs}


def folded_value(node):
    """(True, replacement) for a foldable node, else (False, None)."""
    inputs = node["inputs"]
    if node["class_type"] == "StringContains" and not any(
            isinstance(inputs.get(k), list) for k in ("string", "substring", "case_sensitive")):
        text, part = str(inputs.get("string", "")), str(inputs.get("substring", ""))
        if not inputs.get("case_sensitive", True):
            text, part = text.lower(), part.lower()
        return True, part in text
    if node["class_type"] == "ComfySwitchNode" and isinstance(inputs.get("switch"), bool):
        return True, inputs.get("on_true" if inputs["switch"] else "on_false")
    return False, None


def fold_constants(graph):
    """Fold literal StringContains and ComfySwitchNode, rewiring their consumers."""
    while True:
        found = next(((k, r) for k, n in graph.items() for ok, r in [folded_value(n)] if ok), None)
        if found is None:
            return graph
        node_id, replacement = found
        del graph[node_id]
        for node in graph.values():
            for name, value in list(node["inputs"].items()):
                if isinstance(value, list) and len(value) == 2 and value[0] == node_id:
                    if replacement is None:
                        del node["inputs"][name]
                    else:
                        node["inputs"][name] = copy.deepcopy(replacement)


def prune(graph, info):
    """Keep only nodes some output node depends on."""
    keep, stack = set(), [k for k, n in graph.items() if info.get(n["class_type"], {}).get("output_node")]
    while stack:
        node_id = stack.pop()
        if node_id in keep or node_id not in graph:
            continue
        keep.add(node_id)
        stack.extend(v[0] for v in graph[node_id]["inputs"].values() if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str))
    return {k: v for k, v in graph.items() if k in keep}


def convert(ui, info):
    """UI workflow + object_info -> (api graph, report). Raises on unknown node types."""
    if not isinstance(ui, dict) or not isinstance(ui.get("nodes"), list):
        raise ValueError("Expected a ComfyUI frontend workflow with a nodes list.")
    subgraphs = {item["id"]: item for item in (ui.get("definitions") or {}).get("subgraphs", [])}
    graph, missing, notes = {}, set(), []
    emit(Scope(ui["nodes"], ui.get("links"), "", subgraphs), info, graph, missing, notes)
    if missing:
        raise ValueError("The server does not list these node types: " + ", ".join(sorted(missing)))
    total = len(graph)
    graph = prune(fold_constants(copy.deepcopy(graph)), info)
    dangling = [f"{k}.{name}" for k, n in graph.items() for name, v in n["inputs"].items()
                if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and v[0] not in graph]
    if dangling:
        raise ValueError("Conversion left links to removed nodes: " + ", ".join(sorted(dangling)))
    return graph, {"nodes_emitted": total, "nodes_kept": len(graph), "notes": notes}

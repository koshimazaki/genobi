"""Synthetic UI workflow with one subgraph, and a matching fake object_info. Test data only."""


def link(link_id, origin, origin_slot, target, target_slot, kind):
    return {"id": link_id, "origin_id": origin, "origin_slot": origin_slot, "target_id": target,
            "target_slot": target_slot, "type": kind}


def node(node_id, kind, inputs=(), widgets=None, mode=0, named=None, outputs=()):
    row = {"id": node_id, "type": kind, "mode": mode,
           "inputs": [{"name": n, "type": t, "link": l} for n, t, l in inputs],
           "outputs": [{"name": t, "type": t} for t in outputs]}
    if widgets is not None:
        row["widgets_values"] = widgets
    if named is not None:
        row["widgets_values_named"] = named
    return row


SUBGRAPH = {
    "id": "sg-1", "name": "Generate",
    "inputs": [{"name": "video", "type": "VIDEO", "linkIds": [10]}, {"name": "text", "type": "STRING", "linkIds": [11]},
               {"name": "neg", "type": "STRING", "linkIds": [12]}, {"name": "seed", "type": "INT", "linkIds": [13]}],
    "outputs": [{"name": "VIDEO", "type": "VIDEO", "linkIds": [30]}],
    "nodes": [
        node(10, "CLIPLoader", widgets=["clip.safetensors", "ltxv", "default"], outputs=["CLIP"]),
        node(11, "CLIPTextEncode", [("clip", "CLIP", 14), ("text", "STRING", 11)], [""]),
        node(12, "CLIPTextEncode", [("clip", "CLIP", 16), ("text", "STRING", 12)], [""]),
        node(13, "LTXVConditioning", [("positive", "CONDITIONING", 15), ("negative", "CONDITIONING", 17)], [24]),
        node(14, "GetVideoComponents", [("video", "VIDEO", 10)]),
        node(15, "LTXVGetTilingSizes", [("image", "IMAGE", 19)],
             named={"tile_size": "HD", "output_size": "4K", "tiling_preview": "display only"}),
        node(16, "LTXVTiledFusionSampler", [("positive", "CONDITIONING", 23), ("seed", "INT", 13),
                                             ("tile_width", "INT", 21)], [42, "fixed", 1.0]),
        node(17, "FakeDecode", [("samples", "LATENT", 22)], outputs=["VIDEO"]),
        node(18, "GemmaAPITextEncode", [("prompt", "STRING", None)], ["", ""], mode=2),
        node(20, "StringContains", [], ["", "ltxv_", True]),
        node(21, "ComfySwitchNode", [("on_false", "CONDITIONING", 18), ("on_true", "CONDITIONING", 25),
                                     ("switch", "BOOLEAN", 24)], [True]),
        node(22, "CLIPLoader", widgets=["enhancer.safetensors", "ltxv", "default"]),
        node(26, "FakeEncoder", [("clip", "CLIP", 26)]),
    ],
    "links": [link(10, -10, 0, 14, 0, "VIDEO"), link(11, -10, 1, 11, 1, "STRING"), link(12, -10, 2, 12, 1, "STRING"),
              link(13, -10, 3, 16, 1, "INT"), link(14, 10, 0, 11, 0, "CLIP"), link(16, 10, 0, 12, 0, "CLIP"),
              link(15, 11, 0, 13, 0, "CONDITIONING"), link(17, 12, 0, 13, 1, "CONDITIONING"),
              link(18, 13, 0, 21, 0, "CONDITIONING"), link(19, 14, 0, 15, 0, "IMAGE"), link(21, 15, 0, 16, 2, "INT"),
              link(22, 16, 0, 17, 0, "LATENT"), link(23, 21, 0, 16, 0, "CONDITIONING"),
              link(24, 20, 0, 21, 2, "BOOLEAN"), link(25, 26, 0, 21, 1, "CONDITIONING"),
              link(26, 22, 0, 26, 0, "CLIP"), link(30, 17, 0, -20, 0, "VIDEO")],
}

UI = {
    "nodes": [
        node(1, "LoadVideo", widgets=["", "image"], outputs=["VIDEO"]),
        node(2, "PrimitiveStringMultiline", widgets=[""], outputs=["STRING"]),
        node(3, "PrimitiveStringMultiline", widgets=[""], outputs=["STRING"]),
        node(4, "sg-1", [("video", "VIDEO", 1), ("text", "STRING", 2), ("neg", "STRING", 3)], ["", "", 7]),
        node(5, "SaveVideo", [("video", "VIDEO", 5)], ["output", "auto", "auto"]),
        node(6, "MarkdownNote", widgets=["notes"]),
        node(7, "Reroute", [("", "*", 4)]),
    ],
    "links": [[1, 1, 0, 4, 0, "VIDEO"], [2, 2, 0, 4, 1, "STRING"], [3, 3, 0, 4, 2, "STRING"],
              [4, 4, 0, 7, 0, "VIDEO"], [5, 7, 0, 5, 0, "VIDEO"]],
    "definitions": {"subgraphs": [SUBGRAPH]},
}


def schema(required, output, order=None, output_node=False):
    row = {"input": {"required": required}, "output": output, "output_node": output_node}
    if order:
        row["input_order"] = {"required": order}
    return row


INFO = {
    "LoadVideo": schema({"file": [["clip.mp4"], {"video_upload": True}]}, ["VIDEO"]),
    "PrimitiveStringMultiline": schema({"value": ["STRING", {"multiline": True}]}, ["STRING"]),
    "SaveVideo": schema({"video": ["VIDEO"], "filename_prefix": ["STRING", {}], "format": [["auto"]], "codec": [["auto"]]},
                        [], output_node=True),
    "CLIPLoader": schema({"clip_name": [["clip.safetensors", "enhancer.safetensors"]], "type": [["ltxv"]],
                          "device": [["default"]]}, ["CLIP"]),
    "CLIPTextEncode": schema({"text": ["STRING", {"multiline": True}], "clip": ["CLIP"]}, ["CONDITIONING"]),
    "LTXVConditioning": schema({"positive": ["CONDITIONING"], "negative": ["CONDITIONING"], "frame_rate": ["FLOAT", {}]},
                               ["CONDITIONING", "CONDITIONING"]),
    "GetVideoComponents": schema({"video": ["VIDEO"]}, ["IMAGE", "AUDIO", "FLOAT"]),
    "LTXVGetTilingSizes": schema({"image": ["IMAGE"], "tile_size": [["qHD", "HD", "FullHD"]],
                                  "output_size": [["FullHD", "4K", "8K"]]}, ["INT", "INT"]),
    "LTXVTiledFusionSampler": schema({"positive": ["CONDITIONING"], "seed": ["INT", {"control_after_generate": True}],
                                      "cfg": ["FLOAT", {}], "tile_width": ["INT", {}]}, ["LATENT"],
                                     order=["positive", "seed", "cfg", "tile_width"]),
    "FakeDecode": schema({"samples": ["LATENT"]}, ["VIDEO"]),
    "FakeEncoder": schema({"clip": ["CLIP"]}, ["CONDITIONING"]),
    "StringContains": schema({"string": ["STRING", {}], "substring": ["STRING", {}], "case_sensitive": ["BOOLEAN", {}]},
                             ["BOOLEAN"]),
    "ComfySwitchNode": schema({"switch": ["BOOLEAN", {}], "on_false": ["*"], "on_true": ["*"]}, ["*"],
                              order=["switch", "on_false", "on_true"]),
}

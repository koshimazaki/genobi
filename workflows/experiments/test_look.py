"""Look still tests with a fake ComfyUI transport. No network, model or GPU."""
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

from comfy_client import ResponseError
import look
from look_graph import (BANNED, LATENT_NODE, MODELS, build_prompt, check_aspect, checked_url, fill_graph, load_graph,
                        preflight_graph)


def png(path, width, height, shade=0):
    """A real, tiny, uncompressed-content PNG so the size reader sees true headers."""
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    rows = b"".join(b"\x00" + bytes([shade]) * width for _ in range(height))
    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
                           + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))
    return Path(path)


class FakeLookComfy:
    base = "http://127.0.0.1:8189"

    def __init__(self):
        self.uploads, self.graphs, self.histories = [], [], {}
        self.failure, self.pending = None, False
        self.catalogue, self.info_calls = {}, 0

    def info(self):
        self.info_calls += 1
        return self.catalogue

    def upload(self, path, request_id, role, expected_sha256):
        self.uploads.append((Path(path).name, role))
        return f"genobi-experiments/{request_id}/{role}{Path(path).suffix}"

    def submit(self, graph, request_id):
        if self.failure:
            raise self.failure
        self.graphs.append(graph)
        prompt_id = f"p{len(self.graphs)}"
        size = graph[LATENT_NODE]["inputs"]
        self.histories[prompt_id] = (request_id, size["width"], size["height"])
        return {"prompt_id": prompt_id}

    def history(self, prompt_id):
        if self.pending or prompt_id not in self.histories:
            return {}
        request_id = self.histories[prompt_id][0]
        image = {"filename": "look_00001_.png", "subfolder": f"genobi-experiments/{request_id}", "type": "output"}
        return {prompt_id: {"status": {"completed": True, "status_str": "success"},
                            "outputs": {"9": {"images": [image]}}}}

    def download(self, descriptor, output):
        prompt_id = next(k for k, v in self.histories.items() if descriptor["subfolder"].endswith(v[0]))
        _, width, height = self.histories[prompt_id]
        png(output, width, height, shade=200)


def catalogue(drop=None):
    """An /object_info listing every class the filled graph uses and each model it loads."""
    graph, _ = load_graph()
    filled = fill_graph(graph, ["a", "b", "c"], "p", 1536, 896, 1, "x")
    info = {}
    for node in filled.values():
        schema = info.setdefault(node["class_type"], {"input": {"required": {}}, "output": ["*"]})
        for name, value in node["inputs"].items():
            if isinstance(value, str) and value.endswith(".safetensors") and value != drop:
                schema["input"]["required"].setdefault(name, [[]])[0].append(value)
    return info


def capture_fixture(root):
    """The keyframes.json contract the capture builder writes, with 768x448 guide frames."""
    root = Path(root)
    root.mkdir()
    (root / "recipe.json").write_text(json.dumps({"version": 1, "width": 768, "height": 448, "frames": 193, "fps": 24}))
    rows = [("first", 0, "frame-0000.png"), ("closed", 37, "frame-closed-0037.png"), ("open", 112, "frame-open-0112.png")]
    for i, (_, _, name) in enumerate(rows):
        png(root / name, 768, 448, shade=40 + i)
    (root / "keyframes.json").write_text(json.dumps(
        {"frames": [{"role": r, "index": n, "file": f} for r, n, f in rows], "band": "low"}))
    return root


FAST = {"sleep": lambda _: None, "poll_interval": 1}


class LookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.client = FakeLookComfy()

    def test_fill_uses_real_graph_slots(self):
        graph, _ = load_graph()
        prompt = build_prompt("dusk desert", ["style"])
        filled = fill_graph(graph, ["a/reference-0.png", "a/reference-1.png"], prompt, 1536, 896, 42, "x/look")
        self.assertEqual(filled["reference-0"]["inputs"]["image"], "a/reference-0.png")
        self.assertEqual(filled["reference-1"]["class_type"], "LoadImage")
        for node in ("17", "50"):
            self.assertEqual(filled[node]["inputs"]["images.image0"], ["reference-0", 0])
            self.assertEqual(filled[node]["inputs"]["images.image1"], ["reference-1", 0])
        self.assertEqual(filled["edit-prompt"]["inputs"]["value"], prompt)
        self.assertIs(filled["51"]["inputs"]["switch"], True)
        self.assertEqual(filled["7"]["inputs"]["seed"], 42)
        self.assertEqual(filled["47"]["inputs"]["sampling_mode.seed"], 42)
        self.assertEqual(filled[LATENT_NODE]["inputs"], {"width": 1536, "height": 896, "batch_size": 1})
        self.assertEqual(filled["7"]["inputs"]["latent_image"], [LATENT_NODE, 0])
        self.assertAlmostEqual(filled["17"]["inputs"]["resolution.megapixels"], 1536 * 896 / 2**20, places=5)
        self.assertEqual(filled["9"]["inputs"]["filename_prefix"], "x/look")
        self.assertEqual(graph["reference-0"]["inputs"]["image"], "pending", "the loaded graph is not mutated")
        for node_id, node in filled.items():
            for value in node["inputs"].values():
                if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str):
                    self.assertIn(value[0], filled, f"{node_id} links a missing node")

    def test_fill_rejects_bad_size_and_counts(self):
        graph, _ = load_graph()
        with self.assertRaisesRegex(ValueError, "multiple of 16"):
            fill_graph(graph, ["a"], "p", 1530, 896, 1, "x")
        with self.assertRaisesRegex(ValueError, "references"):
            fill_graph(graph, ["a"] * 5, "p", 1536, 896, 1, "x")

    def test_prompt_never_names_the_capture(self):
        for roles in ([], ["style"], ["aesthetic"], ["style", "aesthetic"]):
            prompt = build_prompt("cathedral nave, morning light", roles)
            self.assertIsNone(BANNED.search(prompt))
            self.assertIn("composition", prompt)
        for word in ("clay", "3D", "3-d", "Unreal Engine", "rendered", "Render"):
            with self.assertRaisesRegex(ValueError, "finished look"):
                build_prompt(f"a {word} desert")
        with self.assertRaises(ValueError):
            build_prompt("x" * 601)
        self.assertNotIn("\n", build_prompt("dusk\n\x00sky"))

    def test_aspect_matches_prepare_rule(self):
        self.assertLessEqual(check_aspect(1536, 896, 768, 448), 1.0)
        self.assertLessEqual(check_aspect(1920, 1120, 768, 448), 1.0)
        with self.assertRaisesRegex(ValueError, "guide aspect"):
            check_aspect(1536, 864, 768, 448)
        with self.assertRaisesRegex(ValueError, "guide aspect"):
            check_aspect(1024, 1024, 768, 448)

    def test_url_rule_matches_run(self):
        for ok in ("http://127.0.0.1:8189", "http://localhost:8189/", "http://127.0.0.2:8188", "http://[::1]:8188",
                   "https://10.0.0.5:8188", "https://comfy.example.com"):
            checked_url(ok)
        for bad in ("http://10.0.0.5:8188", "http://192.168.1.4:8188", "http://example.com:8188", "http://8.8.8.8",
                    "http://0.0.0.0:8188", "http://u:p@127.0.0.1", "http://127.0.0.1/prompt", "ftp://127.0.0.1"):
            with self.assertRaises(ValueError, msg=bad):
                checked_url(bad)

    def test_preflight_refuses_missing_class_or_model_before_upload(self):
        frame = png(self.root / "frame-0000.png", 768, 448)
        self.client.catalogue = catalogue()
        del self.client.catalogue["EmptyFlux2LatentImage"]
        with self.assertRaisesRegex(ValueError, "Missing node EmptyFlux2LatentImage"):
            look.generate(self.client, frame, "desert", self.root / "look.png", 1536, 896, check=True, **FAST)
        self.client.catalogue = catalogue(drop="flux2-vae.safetensors")
        with self.assertRaisesRegex(ValueError, "flux2-vae"):
            look.generate(self.client, frame, "desert", self.root / "look.png", 1536, 896, check=True, **FAST)
        self.assertEqual((self.client.info_calls, self.client.uploads, self.client.graphs), (2, [], []))
        self.assertFalse((self.root / "look.receipt.json").exists())
        self.client.catalogue = catalogue()
        receipt = look.generate(self.client, frame, "desert", self.root / "look.png", 1536, 896, check=True, **FAST)
        self.assertEqual(receipt["status"], "downloaded")

    def test_preflight_requires_all_four_klein_files(self):
        graph, _ = load_graph()
        filled = fill_graph(graph, ["a"], "p", 1536, 896, 1, "x")
        self.assertEqual(preflight_graph(filled, catalogue())["model_filenames"], sorted(MODELS))
        filled["46"]["inputs"]["clip_name"] = "qwen3vl_4b_int8_convrot.safetensors"
        with self.assertRaisesRegex(ValueError, "no longer loads qwen3.5"):
            preflight_graph(filled, catalogue())

    def test_batch_preflight_runs_once(self):
        capture = capture_fixture(self.root / "capture")
        self.client.catalogue = catalogue()
        look.batch(self.client, capture, "desert", self.root / "looks", 1536, 896, check=True, **FAST)
        self.assertEqual((self.client.info_calls, len(self.client.graphs)), (1, 3))

    def test_one_writes_look_and_receipt(self):
        frame = png(self.root / "frame-0000.png", 768, 448)
        out = self.root / "look.png"
        receipt = look.generate(self.client, frame, "clean desert sky", out, 1536, 896, 7, **FAST)
        self.assertEqual(receipt["status"], "downloaded")
        self.assertEqual(look.png_size(out), (1536, 896))
        saved = json.loads((self.root / "look.receipt.json").read_text())
        self.assertEqual(saved["prompt_id"], "p1")
        self.assertEqual(saved["seed"], 7)
        self.assertEqual((saved["width"], saved["height"]), (1536, 896))
        self.assertEqual(saved["inputs"][0], {"slot": "reference-0", "role": "guide", "file": "frame-0000.png",
                                              "sha256": look.sha256(frame)})
        self.assertEqual(saved["output"]["sha256"], look.sha256(out))
        self.assertIn("clean desert sky", saved["prompt"])
        self.assertNotIn(str(self.root), json.dumps(saved), "no machine paths in the receipt")
        with self.assertRaisesRegex(ValueError, "already exists"):
            look.generate(self.client, frame, "clean desert sky", out, 1536, 896, **FAST)
        self.assertEqual(len(self.client.graphs), 1)

    def test_one_refuses_wrong_aspect_before_anything(self):
        frame = png(self.root / "frame-0000.png", 768, 448)
        with self.assertRaisesRegex(ValueError, "guide aspect"):
            look.generate(self.client, frame, "desert", self.root / "look.png", 1024, 1024, **FAST)
        self.assertEqual((self.client.uploads, self.client.graphs), ([], []))
        self.assertFalse((self.root / "look.receipt.json").exists())

    def test_uncertain_submission_is_not_retried(self):
        frame = png(self.root / "frame-0000.png", 768, 448)
        self.client.failure = OSError("connection reset")
        with self.assertRaisesRegex(RuntimeError, "submission_unknown"):
            look.generate(self.client, frame, "desert", self.root / "look.png", 1536, 896, **FAST)
        self.assertEqual(json.loads((self.root / "look.receipt.json").read_text())["status"], "submission_unknown")
        self.client.failure = ResponseError(400)
        with self.assertRaisesRegex(RuntimeError, "rejected"):
            look.generate(self.client, frame, "desert", self.root / "look2.png", 1536, 896, **FAST)

    def test_timeout_then_fetch_reads_only(self):
        frame = png(self.root / "frame-0000.png", 768, 448)
        self.client.pending = True
        out = self.root / "look.png"
        receipt = look.generate(self.client, frame, "desert", out, 1536, 896, wait_seconds=0, **FAST)
        self.assertEqual(receipt["status"], "accepted_not_finished")
        self.client.pending = False
        receipt = look.fetch(self.root / "look.receipt.json", 0, self.client, **FAST)
        self.assertEqual(receipt["status"], "downloaded")
        self.assertEqual(len(self.client.graphs), 1, "fetch never POSTs")

    def test_batch_orders_and_chains_the_first_look(self):
        capture = capture_fixture(self.root / "capture")
        mood = png(self.root / "mood.png", 64, 64)
        out = self.root / "looks"
        manifest = look.batch(self.client, capture, "towers from above, dusk haze", out, 1536, 896,
                              aesthetic_image=mood, **FAST)
        self.assertEqual([r["look"] for r in manifest["looks"]],
                         ["look-first.png", "look-closed-0037.png", "look-open-0112.png"])
        self.assertEqual(self.client.uploads, [
            ("frame-0000.png", "reference-0"), ("mood.png", "reference-1"),
            ("frame-closed-0037.png", "reference-0"), ("look-first.png", "reference-1"), ("mood.png", "reference-2"),
            ("frame-open-0112.png", "reference-0"), ("look-first.png", "reference-1"), ("mood.png", "reference-2")])
        self.assertIn("second image, an earlier finished frame", self.client.graphs[1]["edit-prompt"]["inputs"]["value"])
        saved = json.loads((out / "looks.json").read_text())
        self.assertEqual(saved["aesthetic"], "towers from above, dusk haze")
        self.assertEqual(saved["looks"][1], {"role": "closed", "index": 37, "frame": "frame-closed-0037.png",
                                             "look": "look-closed-0037.png", "receipt": "look-closed-0037.receipt.json"})
        # A second batch reuses finished looks and queues nothing.
        look.batch(self.client, capture, "towers from above, dusk haze", out, 1536, 896, aesthetic_image=mood, **FAST)
        self.assertEqual(len(self.client.graphs), 3)

    def test_batch_stops_when_first_look_is_unfinished(self):
        capture = capture_fixture(self.root / "capture")
        self.client.pending = True
        with self.assertRaisesRegex(RuntimeError, "accepted_not_finished"):
            look.batch(self.client, capture, "desert", self.root / "looks", 1536, 896, wait_seconds=0, **FAST)
        self.assertEqual(len(self.client.graphs), 1)
        with self.assertRaisesRegex(RuntimeError, "fetch"):
            look.batch(self.client, capture, "desert", self.root / "looks", 1536, 896, wait_seconds=0, **FAST)

    def test_batch_rejects_bad_keyframes(self):
        capture = capture_fixture(self.root / "capture")
        for frames in ([{"role": "closed", "index": 3, "file": "frame-closed-0037.png"}],
                       [{"role": "first", "index": 0, "file": "../frame-0000.png"}],
                       [{"role": "first", "index": 0, "file": "frame-0000.png"}] * 2):
            (capture / "keyframes.json").write_text(json.dumps({"frames": frames}))
            with self.assertRaises(ValueError):
                look.batch(self.client, capture, "desert", self.root / "looks", 1536, 896, **FAST)
        self.assertEqual(self.client.graphs, [])


if __name__ == "__main__":
    unittest.main()

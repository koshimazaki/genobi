"""The model fetcher and the bundled model sets, with no network: a fake opener
serves bytes. Run with:  python3 -I tests/test_models.py"""

import hashlib
import io
import logging
import os
import sys
import tempfile
import unittest
import urllib.error

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import models  # noqa: E402

DATA = b"safetensors bytes " * 100
SHA = hashlib.sha256(DATA).hexdigest()
REV = "a" * 40


class Response(io.BytesIO):
    def __init__(self, data, status=200):
        super().__init__(data)
        self.status = status


class Opener:
    def __init__(self, data=DATA, error=None):
        self.data = data
        self.error = error
        self.requests = []

    def __call__(self, request, timeout):
        self.requests.append(request)
        if self.error:
            raise self.error
        start = 0
        header = request.get_header("Range")
        if header:
            start = int(header.split("=")[1].rstrip("-"))
            return Response(self.data[start:], 206)
        return Response(self.data)


def model(sha=SHA, size=len(DATA)):
    return models.Model("loras", "org/repo", REV, "sub/file.safetensors", size, sha)


class ModelsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def test_bundled_sets_parse_and_share_files_once(self):
        folder = os.path.join(ROOT, "models")
        sets = {name: models.load_sets([os.path.join(folder, name)]) for name in os.listdir(folder)}
        self.assertEqual(len(sets["swap.txt"]), 7)
        self.assertAlmostEqual(sum(m.size for m in sets["swap.txt"]) / 1e9, 46.3, places=1)
        self.assertTrue(all(m.sha256 for m in sets["swap.txt"]), "every swap file is hash-pinned")
        both = models.load_sets([os.path.join(folder, "akuspace.txt"), os.path.join(folder, "layout-to-render.txt")])
        self.assertEqual(len(both), len(sets["akuspace.txt"]) + len(sets["layout-to-render.txt"]) - 3)

    def test_downloads_verifies_and_marks(self):
        opener = Opener()
        models.ensure_models([model()], self.root, token="hf_tokenvalue", open_url=opener)
        dest = os.path.join(self.root, "loras", "file.safetensors")
        with open(dest, "rb") as handle:
            self.assertEqual(handle.read(), DATA)
        with open(dest + ".sha256") as handle:
            self.assertEqual(handle.read().strip(), SHA)
        [request] = opener.requests
        self.assertEqual(request.full_url, f"https://huggingface.co/org/repo/resolve/{REV}/sub/file.safetensors")
        # The token rides only on the first hop, never on the CDN redirect.
        self.assertEqual(request.unredirected_hdrs.get("Authorization"), "Bearer hf_tokenvalue")
        self.assertNotIn("Authorization", request.headers)

    def test_skips_a_file_already_present(self):
        models.ensure_models([model()], self.root, open_url=Opener())
        opener = Opener(error=AssertionError("must not download"))
        models.ensure_models([model()], self.root, open_url=opener)
        self.assertEqual(opener.requests, [])

    def test_a_wrong_hash_is_refused_and_not_kept(self):
        with self.assertRaises(models.FetchError):
            models.ensure_models([model(sha="b" * 64)], self.root, open_url=Opener())
        folder = os.path.join(self.root, "loras")
        self.assertEqual(os.listdir(folder), [])

    def test_resumes_a_partial_download(self):
        folder = os.path.join(self.root, "loras")
        os.makedirs(folder)
        with open(os.path.join(folder, "file.safetensors.part"), "wb") as handle:
            handle.write(DATA[:500])
        opener = Opener()
        models.ensure_models([model()], self.root, open_url=opener)
        self.assertEqual(opener.requests[0].get_header("Range"), "bytes=500-")
        with open(os.path.join(folder, "file.safetensors"), "rb") as handle:
            self.assertEqual(handle.read(), DATA)

    def test_access_errors_fail_without_retrying_or_logging_the_token(self):
        error = urllib.error.HTTPError("https://huggingface.co/x", 401, "Unauthorized", {}, None)
        opener = Opener(error=error)
        with self.assertLogs("comfy-build", logging.INFO) as logs, self.assertRaises(models.FetchError) as caught:
            models.LOG.info("start")
            models.ensure_models([model()], self.root, token="hf_tokenvalue", open_url=opener)
        self.assertEqual(len(opener.requests), 1)
        self.assertIn("HTTP 401", str(caught.exception))
        self.assertNotIn("hf_tokenvalue", "\n".join(logs.output) + str(caught.exception))

    def test_size_only_pins_accept_the_right_size(self):
        models.ensure_models([model(sha=None)], self.root, open_url=Opener())
        self.assertTrue(models.present(model(sha=None), self.root))
        self.assertFalse(models.present(model(sha=None, size=1), self.root))

    def test_rejects_bad_lines(self):
        for line in (
            f"../x org/repo {REV} f.safetensors 1 -",
            f"loras org/repo {REV} ../f.safetensors 1 -",
            f"loras org/repo main f.safetensors 1 -",
            f"loras org/repo {REV} f.safetensors big -",
            f"loras org/repo {REV} f.safetensors 1 nothex",
        ):
            with self.assertRaises(ValueError):
                models.parse_models(line)


if __name__ == "__main__":
    unittest.main()

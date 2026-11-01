"""Replay/uncertainty tests using a fake transport. No network or GPU execution."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from common import REPO, read_json
from comfy_client import ComfyClient, ResponseError, checked_url, preflight_graph, remote_file
from run import RECEIPT, bundle_inputs, output_descriptors, poll_once, submit_once
from test_support import FakeComfy, audio_metadata, make_bundle, video_metadata


class RunTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = make_bundle(self.temp.name)
        _, self.graph = bundle_inputs(self.root)
        self.client = FakeComfy(self.graph)

    def test_missing_model_fails_before_upload_or_reservation(self):
        self.client.catalogue["UNETLoader"]["input"]["required"]["unet_name"] = [[]]
        with self.assertRaisesRegex(ValueError, "required model"):
            submit_once(self.root, self.client, 10)
        self.assertEqual(self.client.uploads, [])
        self.assertEqual(self.client.posts, 0)
        self.assertFalse((self.root / RECEIPT).exists())

    def test_pinned_ltx_v3_combo_schema_accepts_installed_lora(self):
        schema = read_json(REPO / "scripts/comfy-schemas/ltxvideo-220e1d4.json")["LTXICLoRALoaderModelOnly"]
        model = self.graph["21"]["inputs"]["lora_name"]
        schema["input"]["required"]["lora_name"][1]["options"] = [model]
        self.client.catalogue["LTXICLoRALoaderModelOnly"] = schema
        readiness = preflight_graph(self.graph, self.client.catalogue)
        self.assertIn(model, readiness["model_filenames"])
        schema["input"]["required"]["lora_name"][1]["options"] = []
        with self.assertRaisesRegex(ValueError, "required model"):
            submit_once(self.root, self.client, 10)
        self.assertEqual(self.client.posts, 0)

    def test_submission_is_reserved_and_original_track_bound_once(self):
        receipt = submit_once(self.root, self.client, 10)
        self.assertEqual(self.client.posts, 1)
        self.assertEqual(self.client.uploads, ["rgb", "look", "audio"])
        self.assertEqual(receipt["prompt_id"], "server-assigned-id")
        self.assertEqual(receipt["status"], "queued")
        self.assertEqual(read_json(self.root / RECEIPT)["request_id"], self.client.request_id)
        self.assertEqual(self.client.graph["40"]["inputs"]["audio"], receipt["uploads"]["audio"]["filename"])
        self.assertEqual(self.client.graph["60"]["inputs"]["audio"], ["av0", 0])
        with self.assertRaisesRegex(ValueError, "already has a run reservation"):
            submit_once(self.root, self.client, 10)
        self.assertEqual(self.client.posts, 1)

    def test_lost_submission_response_never_automatically_retries(self):
        self.client.failure = TimeoutError("fake interrupted response")
        with self.assertRaisesRegex(RuntimeError, "submission_unknown"):
            submit_once(self.root, self.client, 10)
        self.assertEqual(read_json(self.root / RECEIPT)["status"], "submission_unknown")
        with self.assertRaisesRegex(ValueError, "already has a run reservation"):
            submit_once(self.root, self.client, 10)
        self.assertEqual(poll_once(self.root, self.client)["status"], "submission_unknown")
        self.assertEqual(self.client.posts, 1)

    def test_unknown_can_recover_same_request_from_queue_without_post(self):
        self.client.failure = TimeoutError()
        with self.assertRaises(RuntimeError):
            submit_once(self.root, self.client, 10)
        self.client.queued["queue_running"] = [[0, "original-accepted-id", {},
                                               {"genobi_candidate_request": self.client.request_id}]]
        receipt = poll_once(self.root, self.client)
        self.assertEqual((receipt["status"], receipt["prompt_id"]), ("running", "original-accepted-id"))
        self.assertEqual(self.client.posts, 1)

    def test_client_rejection_is_terminal(self):
        self.client.failure = ResponseError(400)
        with self.assertRaisesRegex(RuntimeError, "rejected"):
            submit_once(self.root, self.client, 10)
        self.assertEqual(poll_once(self.root, self.client)["status"], "rejected")
        self.assertEqual(self.client.posts, 1)

    def test_server_error_does_not_prove_request_was_rejected(self):
        self.client.failure = ResponseError(500)
        with self.assertRaisesRegex(RuntimeError, "submission_unknown"):
            submit_once(self.root, self.client, 10)
        self.assertEqual(read_json(self.root / RECEIPT)["status"], "submission_unknown")
        self.assertEqual(self.client.posts, 1)

    def test_http_timeout_does_not_prove_request_was_rejected(self):
        self.client.failure = ResponseError(408)
        with self.assertRaisesRegex(RuntimeError, "submission_unknown"):
            submit_once(self.root, self.client, 10)
        self.assertEqual(read_json(self.root / RECEIPT)["status"], "submission_unknown")
        self.assertEqual(self.client.posts, 1)

    def test_upload_checks_actual_payload_hash_before_http(self):
        client = ComfyClient("http://127.0.0.1:1")
        with self.assertRaisesRegex(ValueError, "Frozen upload bytes"):
            client.upload(self.root / "assets/audio.wav", "mock-id", "audio", "0" * 64)

    def test_accepted_missing_history_is_not_declared_failed_or_resubmitted(self):
        submit_once(self.root, self.client, 10)
        self.assertEqual(poll_once(self.root, self.client)["status"], "accepted_status_unknown")
        self.assertEqual(self.client.posts, 1)

    def test_edited_frozen_input_refused_before_network_mutations(self):
        (self.root / "assets/audio.wav").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "Frozen input"):
            submit_once(self.root, self.client, 10)
        self.assertEqual(self.client.posts, 0)
        self.assertEqual(self.client.uploads, [])

    def test_resume_refuses_changed_endpoint_or_executed_graph(self):
        submit_once(self.root, self.client, 10)
        self.client.base = "http://127.0.0.1:9999"
        with self.assertRaisesRegex(ValueError, "original endpoint"):
            poll_once(self.root, self.client)
        self.client.base = "http://127.0.0.1:8188"
        (self.root / "executed-workflow.private.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "Executed workflow changed"):
            poll_once(self.root, self.client)

    def test_preflight_checks_missing_outputs_and_required_fields(self):
        self.client.catalogue["LoadImage"]["output"] = []
        with self.assertRaisesRegex(ValueError, "unavailable upstream output"):
            preflight_graph(self.graph, self.client.catalogue)

    def test_no_url_credentials_or_output_path_traversal(self):
        for url in ("http://name:secret@host", "http://host/?token=secret", "http://host/#secret"):
            with self.assertRaises(ValueError):
                checked_url(url)
        for descriptor in ({"filename": "../file.mp4"}, {"filename": "file.mp4", "subfolder": "../private"},
                           {"filename": "file.mp4", "type": "input"}):
            with self.assertRaises(ValueError):
                remote_file(descriptor, "output")

    def test_bearer_auth_requires_https_or_loopback(self):
        with patch.dict("os.environ", {"GENOBI_COMFY_BEARER": "offline-test-token"}):
            with self.assertRaisesRegex(ValueError, "HTTPS or a loopback"):
                ComfyClient("http://gpu.example.test:8188")
            for url in ("https://gpu.example.test:443", "http://127.0.0.1:8188"):
                self.assertEqual(ComfyClient(url).headers["Authorization"], "Bearer offline-test-token")

    def test_download_selects_saved_video_not_previews(self):
        entry = {"outputs": {"61": {"images": [{"filename": "candidate.mp4", "subfolder": "genobi-experiments/run", "type": "output"}]},
                             "67": {"images": [{"filename": "preview.png", "type": "temp"}]}}}
        self.assertEqual(len(output_descriptors(entry)), 1)
        self.assertEqual(output_descriptors(entry)[0]["filename"], "candidate.mp4")

    def completed_output(self, receipt, folder=None):
        descriptor = {"filename": "candidate_00001_.mp4", "subfolder": folder or f"genobi-experiments/{receipt['request_id']}", "type": "output"}
        self.client.histories[receipt["prompt_id"]] = {"status": {"completed": True, "status_str": "success"},
                                                      "outputs": {"61": {"images": [descriptor]}}}

    def test_unreceipted_local_output_is_preserved_and_refetched(self):
        receipt = submit_once(self.root, self.client, 10)
        self.completed_output(receipt)
        outputs = self.root / "outputs"
        outputs.mkdir()
        target = outputs / "generated.mp4"
        target.write_bytes(b"unverified prior file")
        downloads = []

        def download(descriptor, path):
            downloads.append(descriptor)
            path.write_bytes(b"fresh output from original remote job")

        def fake_probe(path, kind):
            return audio_metadata() if kind == "a:0" else video_metadata({"width": 768, "height": 512, "frames": 193})

        self.client.download = download
        with patch("run.probe", side_effect=fake_probe):
            result = poll_once(self.root, self.client)
        self.assertEqual(result["status"], "output_downloaded_unreviewed")
        self.assertEqual(len(downloads), 1)
        self.assertEqual(next(outputs.glob("unverified-*.mp4")).read_bytes(), b"unverified prior file")
        self.assertEqual(target.read_bytes(), b"fresh output from original remote job")
        self.assertEqual(self.client.posts, 1)
        target.write_bytes(b"changed after validation")
        with self.assertRaisesRegex(ValueError, "Saved output changed"):
            poll_once(self.root, self.client)
        self.assertEqual(self.client.posts, 1)

    def test_output_from_another_run_is_refused(self):
        receipt = submit_once(self.root, self.client, 10)
        self.completed_output(receipt, folder="genobi-experiments/another-run")
        with self.assertRaisesRegex(ValueError, "isolated output prefix"):
            poll_once(self.root, self.client)
        self.assertFalse((self.root / "outputs").exists())
        self.assertEqual(self.client.posts, 1)


if __name__ == "__main__":
    unittest.main()

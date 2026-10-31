"""Synthetic serial-audio contract tests, not evidence of a real AKUSPACE run."""
from pathlib import Path
import tempfile
import unittest

from evidence import validate
from prepare import digest, prepare, write_json


class SerialAudioEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "fixture"
        self.fixture = prepare(self.root)
        self.audio = self.fixture["audio"]["control.wav"]
        self.record = {"case_id": "serial_cpu_akuspace", "status": "measured", "seed": 42,
                       "workflow": "candidate", "control_audio": "control.wav", "reviewer": "unit-test-only",
                       "execution": {"kind": "local_gpu", "hardware": "MOCK, NO GPU EXECUTED", "wall_seconds": 1},
                       "artifacts": {}, "metrics": {"audio_review_complete": True, "source_change_disclosed": True,
                                                    "ending_review_complete": True, "repair_disclosed": True, "clipped_samples": 0}}
        self.graph = {
            "cpu": {"class_type": "LoadAudio", "inputs": {"audio": "uploads/mock-cpu.wav"}},
            "ref": {"class_type": "LoadAudio", "inputs": {"audio": "uploads/mock-reference.wav"}},
            "encoded": {"class_type": "LTXVAudioVAEEncode", "inputs": {"audio": ["cpu", 0]}},
            "aligned": {"class_type": "AKUSPACEReferenceAudioAligned", "inputs": {"reference_audio": ["ref", 0], "reference_guidance_scale": 0.0}},
            "mock": {"class_type": "MockOnlySynthesis", "inputs": {"latents": ["encoded", 0], "reference": ["aligned", 0]}},
            "save": {"class_type": "SaveAudioAdvanced", "inputs": {"audio": ["mock", 0]}},
        }
        self.save("workflow_json", self.graph)
        self.save("cpu_audio", b"MOCK CPU AUDIO, NOT A RECORDING")
        self.save("reference_audio", b"MOCK CPU AUDIO, NOT A RECORDING")
        self.save("akuspace_audio", b"MOCK AKUSPACE AUDIO, NO MODEL EXECUTED")
        self.save("processed_audio", b"MOCK AKUSPACE AUDIO, NO MODEL EXECUTED")
        self.save("execution_log", b"UNIT TEST ONLY")
        self.save("software_manifest", {"versions": {"code": "unit-test-only"}, "models": {"mock-model": "f" * 64}})
        self.manifest = {"version": 1, "workflow_sha256": self.hash("workflow_json"),
                         "source_control_sha256": self.audio["sha256"], "reference_source": "cpu_treatment",
                         "bindings": {role: {"graph_input": f"{node}.audio", "filename": self.graph[node]["inputs"]["audio"],
                                             "sha256": self.hash(role)} for role, node in (("cpu_audio", "cpu"), ("reference_audio", "ref"))}}
        self.save("executed_inputs", self.manifest)
        self.repair = {"mode": "none", "regions": [], "source_control_sha256": self.audio["sha256"],
                       **{role + "_sha256": self.hash(role) for role in ("cpu_audio", "akuspace_audio", "processed_audio")}}
        self.save("repair_manifest", self.repair)
        self.measured = {"method": "SYNTHETIC UNIT TEST, NO LISTENING REVIEW", "reviewer": "unit-test-only",
                         "media_sha256": self.hash("processed_audio"), "metrics": self.record["metrics"],
                         "input_sha256": {"control_audio": self.audio["sha256"], **{role: self.hash(role) for role in ("reference_audio", "cpu_audio", "akuspace_audio")}},
                         "audio_review": {
                             "comparisons": [{"pair": pair, "method": "MOCK", "notes": "MOCK", "level_match_gain_db": 0}
                                             for pair in ("original_vs_cpu", "cpu_vs_akuspace")],
                             "ending": {"start_seconds": 6, "end_seconds": 193 / 24, "notes": "MOCK"},
                             "alignment": {"method": "MOCK", "lag_samples": 0, "polarity_checked": True}}}
        self.save("measurements", self.measured)

    def save(self, role, value):
        path = self.root / f"unit-test-only-{role}"
        if isinstance(value, bytes):
            path.write_bytes(value)
        else:
            write_json(path, value)
        self.record["artifacts"][role] = {"path": path.name, "sha256": digest(path)}

    def hash(self, role):
        return self.record["artifacts"][role]["sha256"]

    def validate(self):
        return validate(self.root, {"version": 1, "records": [self.record]}, case_id="serial_cpu_akuspace")

    def save_graph(self):
        self.save("workflow_json", self.graph)
        self.manifest["workflow_sha256"] = self.hash("workflow_json")
        self.save("executed_inputs", self.manifest)

    def test_complete_serial_mock_has_explicit_cpu_reference_and_preserved_stems(self):
        self.assertEqual(self.validate()["records_checked"], 1)

    def test_reference_origin_cannot_be_relabelled(self):
        self.manifest["reference_source"] = "original_dry"
        self.save("executed_inputs", self.manifest)
        with self.assertRaisesRegex(ValueError, "actual original-dry or CPU-treated reference"):
            self.validate()

    def test_original_dry_reference_variant_is_bound_to_original_bytes(self):
        self.save("reference_audio", (self.root / self.audio["path"]).read_bytes())
        self.manifest["reference_source"] = "original_dry"
        self.manifest["bindings"]["reference_audio"]["sha256"] = self.hash("reference_audio")
        self.save("executed_inputs", self.manifest)
        self.measured["input_sha256"]["reference_audio"] = self.hash("reference_audio")
        self.save("measurements", self.measured)
        self.assertEqual(self.validate()["records_checked"], 1)

    def test_reference_node_cannot_use_a_different_connected_loader(self):
        self.graph["aligned"]["inputs"]["reference_audio"] = ["cpu", 0]
        self.graph["mock"]["inputs"]["unrelated"] = ["ref", 0]
        self.save_graph()
        with self.assertRaisesRegex(ValueError, "aligned-reference input"):
            self.validate()

    def test_cpu_input_must_initialize_latents_not_only_the_reference(self):
        self.graph["encoded"]["inputs"]["audio"] = ["ref", 0]
        self.graph["mock"]["inputs"]["unrelated"] = ["cpu", 0]
        self.save_graph()
        with self.assertRaisesRegex(ValueError, "initialize audio latents"):
            self.validate()

    def test_localized_repair_needs_alignment_review_and_regions(self):
        self.repair.update(mode="localized_crossfade", regions=[{"start_seconds": 7, "end_seconds": 8, "source": "cpu_treatment"}])
        self.save("repair_manifest", self.repair)
        with self.assertRaisesRegex(ValueError, "phase/alignment"):
            self.validate()
        self.repair["alignment_review_pass"] = True
        self.save("repair_manifest", self.repair)
        self.assertEqual(self.validate()["records_checked"], 1)

    def test_ending_and_comparison_notes_cannot_be_omitted(self):
        del self.measured["audio_review"]["ending"]
        self.save("measurements", self.measured)
        with self.assertRaisesRegex(ValueError, "final phrase/decay"):
            self.validate()

    def test_cpu_execution_cannot_claim_an_akuspace_model_run(self):
        self.record["execution"]["kind"] = "cpu"
        with self.assertRaisesRegex(ValueError, "model-generated"):
            self.validate()


if __name__ == "__main__":
    unittest.main()

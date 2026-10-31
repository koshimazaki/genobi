"""Validate supplied annotation distributions, without claiming automatic CV or true labels."""
import math


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def agree(metrics, name, actual):
    expected = metrics.get(name)
    if not finite(expected) or not math.isclose(expected, actual, rel_tol=1e-6, abs_tol=1e-6):
        raise ValueError(f"{name}: scalar does not agree with the archived observations.")


def frame(value):
    return type(value) is int and 0 <= value < 193


def point(value):
    return isinstance(value, list) and len(value) == 2 and all(finite(v) and 0 <= v <= 1 for v in value)


def landmarks(annotations, case, metrics):
    tracks = annotations.get("landmarks")
    if not isinstance(tracks, list) or not tracks:
        raise ValueError("Landmark annotation distributions are required, not only a maximum scalar.")
    errors, names = {"rigid": [], "wall": []}, set()
    for track in tracks:
        if not isinstance(track, dict) or not isinstance(track.get("id"), str) or not track["id"] or track["id"] in names:
            raise ValueError("Every landmark needs a unique nonempty ID.")
        names.add(track["id"])
        kind = track.get("kind")
        source, observed, occlusions = (track.get(k) for k in ("expected_xy", "observed_xy", "occlusions"))
        if kind not in errors or not isinstance(source, list) or not isinstance(observed, list) or len(source) != 193 or len(observed) != 193:
            raise ValueError("Landmarks need rigid/wall type and complete 193-frame coordinate arrays.")
        if not isinstance(occlusions, list) or any(
            not isinstance(o, dict) or not frame(o.get("frame")) or o.get("expected") is not True or
            not isinstance(o.get("reason"), str) or not o["reason"].strip() for o in occlusions
        ):
            raise ValueError("Every missing landmark observation needs a reviewed expected-occlusion entry.")
        missing = {i for i, xy in enumerate(observed) if xy is None}
        if len(occlusions) != len(missing) or {o["frame"] for o in occlusions} != missing:
            raise ValueError("The occlusion ledger must cover each and only each missing observation.")
        if len(missing) > 191:
            raise ValueError("A landmark must remain measurable in at least two frames.")
        for expected, actual in zip(source, observed):
            if not point(expected) or (actual is not None and not point(actual)):
                raise ValueError("Landmark positions must be finite coordinates normalized by width and height.")
            if actual is not None:
                error = math.hypot((actual[0] - expected[0]) * 1024, (actual[1] - expected[1]) * 576) / math.hypot(1024, 576)
                errors[kind].append(error)
    for kind in errors:
        metric = f"max_{kind}_landmark_error_diagonal"
        if metric in case.get("checks", {}):
            if not errors[kind]:
                raise ValueError(f"The case requires measurable {kind} landmarks.")
            agree(metrics, metric, max(errors[kind]))


def events(annotations, fixture, case, metrics):
    observations = annotations.get("events")
    if not isinstance(observations, list) or not observations:
        raise ValueError("Event timing needs a nonempty annotation distribution.")
    expected_frames = case.get("expected_event_frames")
    if not isinstance(expected_frames, list) or not expected_frames or len(expected_frames) != len(set(expected_frames)):
        raise ValueError("The case must declare its complete expected event schedule.")
    if case.get("event_basis") == "control_bursts":
        available = {e["centre_frame"] for e in fixture["audio"][case["control_audio"]]["events"]}
        if not set(expected_frames).issubset(available):
            raise ValueError("The case event schedule differs from its control audio.")
    elif case.get("event_basis") != "state_keys" or expected_frames != case.get("expected_state_frames"):
        raise ValueError("Unknown or inconsistent event timing basis.")
    errors, lags, ids, covered = [], [], set(), []
    for event in observations:
        if not isinstance(event, dict) or not isinstance(event.get("id"), str) or not event["id"]:
            raise ValueError("Every observed event needs an ID.")
        if event["id"] in ids:
            raise ValueError("Event annotation IDs must be unique.")
        ids.add(event["id"])
        target, source, observed = (event.get(k) for k in ("expected_frame", "source_frame", "generated_frame"))
        if not all(frame(v) for v in (target, source, observed)) or target not in expected_frames:
            raise ValueError("Event annotations must use actual diagnostic burst frames and finite frame indices.")
        errors.append(abs(source - target))
        lags.append(abs(observed - target))
        covered.append(target)
    if len(covered) != len(expected_frames) or set(covered) != set(expected_frames):
        raise ValueError("Event observations must cover every scheduled target exactly once; missing or ambiguous events fail.")
    if "source_max_frame_error" in metrics:
        agree(metrics, "source_max_frame_error", max(errors))
    agree(metrics, "max_event_lag_frames", max(lags))


def motion(annotations, metrics):
    series = annotations.get("motion_series")
    if not isinstance(series, dict) or not isinstance(series.get("definition"), str) or not series["definition"].strip():
        raise ValueError("Describe the measured scalar trajectory used for motion correlation/displacement.")
    expected, observed = (series.get(k) for k in ("expected", "observed"))
    if any(not isinstance(v, list) or len(v) != 193 or not all(finite(x) for x in v) for v in (expected, observed)):
        raise ValueError("Motion series must contain 193 finite samples without temporal realignment.")
    a = [x - sum(expected) / len(expected) for x in expected]
    b = [x - sum(observed) / len(observed) for x in observed]
    denominator = math.sqrt(sum(x*x for x in a) * sum(x*x for x in b))
    if denominator == 0 or max(expected) == min(expected):
        raise ValueError("Constant trajectories cannot qualify motion preservation.")
    agree(metrics, "generated_motion_correlation", sum(x*y for x, y in zip(a, b)) / denominator)
    agree(metrics, "retained_displacement_ratio", (max(observed) - min(observed)) / (max(expected) - min(expected)))


def states(annotations, case, metrics):
    expected = case.get("expected_state_frames")
    if expected is None:
        return
    observed = annotations.get("states")
    # Three states belong to these benchmark fixtures, not a global scene-schema limit.
    if not isinstance(observed, list) or len(observed) != len(expected):
        raise ValueError("State annotations must cover the complete benchmark state sequence.")
    last = -1
    for index, (item, target) in enumerate(zip(observed, expected)):
        if not isinstance(item, dict) or item.get("expected_id") != f"state-{index}" or item.get("observed_id") != item["expected_id"]:
            raise ValueError("Generated states are missing or occur in the wrong order.")
        actual = item.get("observed_frame")
        if item.get("expected_frame") != target or not frame(actual) or actual <= last or abs(actual - target) > 2:
            raise ValueError("State timing must preserve ordering and the PRD two-frame bound.")
        last = actual
    agree(metrics, "observed_state_count", len(observed))


def check_annotations(measured, fixture, case, metrics):
    annotations = measured.get("annotations")
    if not isinstance(annotations, dict) or not isinstance(annotations.get("method"), str) or not annotations["method"].strip():
        raise ValueError("Archive annotation method, complete landmark curves and event observations.")
    landmarks(annotations, case, metrics)
    events(annotations, fixture, case, metrics)
    if case.get("metrics") == "motion":
        motion(annotations, metrics)
    states(annotations, case, metrics)


def check_serial_review(measured):
    review = measured.get("audio_review")
    if not isinstance(review, dict):
        raise ValueError("Serial audio experiment needs source, ending and alignment review notes.")
    comparisons = review.get("comparisons")
    if not isinstance(comparisons, list) or {x.get("pair") for x in comparisons if isinstance(x, dict)} != {"original_vs_cpu", "cpu_vs_akuspace"}:
        raise ValueError("Compare both the original/CPU pair and the CPU/AKUSPACE pair.")
    for item in comparisons:
        if not isinstance(item, dict) or any(not isinstance(item.get(k), str) or not item[k].strip() for k in ("method", "notes")) or not finite(item.get("level_match_gain_db")):
            raise ValueError("Each comparison needs listening method, observations and level-match gain.")
    ending, alignment = review.get("ending"), review.get("alignment")
    if not isinstance(ending, dict) or not isinstance(ending.get("notes"), str) or not ending["notes"].strip():
        raise ValueError("Describe the final phrase/decay review, including degradation or muffling.")
    start, end = ending.get("start_seconds"), ending.get("end_seconds")
    if not finite(start) or not finite(end) or not 0 <= start < end:
        raise ValueError("Ending review must identify its actual listening window.")
    if not isinstance(alignment, dict) or not isinstance(alignment.get("method"), str) or not alignment["method"].strip() or not finite(alignment.get("lag_samples")) or alignment.get("polarity_checked") is not True:
        raise ValueError("Record lag measurement, alignment method and polarity review before evaluating a hybrid.")

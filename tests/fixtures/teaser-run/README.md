# Teaser run fixtures (owner side)

Not for a run to read: the run prompts forbid opening this folder.

- `v2.cut.json`: the Genobi teaser's cut on `main` (version 2 from the implementation update, with
  the typed-label holds from the implementation update), the target a run is compared with
  (`--reference v2`).
- `v1.cut.json` and `v1-calibration.md`: the v1 cut as merged in the implementation update and its
  literal values section by section (`--reference v1`), kept for history.
- `derived.cut.json`: the cut derived from `docs/genobi-teaser-run/` alone
  (the storyboard, the track analysis, the capture log and the decision
  rules) in the kit's dry run. The tests hold the kit's examples and rules to
  it. It scores 0.773 against v2.
- `derived-v1.cut.json`: the earlier v1-rules derivation, which the bundle
  test packages on v1's archived media.

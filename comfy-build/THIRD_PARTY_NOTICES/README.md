# Third-party notices

| Component                                                                                                       | Licence              | In this folder as                      | Where it is used                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `h3_character_swap` node pack (Akatz Labs, `worker_nodes/h3_character_swap`)                                    | GPL-3.0              | `h3_character_swap-GPL-3.0.txt`        | Fetched at the pinned commit and uploaded, patched, by the Comfy build recipe                                                        |
| `patches/h3_character_swap.patch` (Comfy Org's deployment patch to that pack)                                   | GPL-3.0, as the pack | `h3_character_swap-GPL-3.0.txt`        | Applied at build time; a verbatim copy of comfy-openjutsu `build/h3_character_swap.patch` at `70ec62d` (SHA-256 `14c946f5…95101a84`) |
| [h3-character-swap-tool](https://github.com/akatz-labs/h3-character-swap-tool) (the repository around the pack) | MIT                  | `akatz-h3-character-swap-tool-MIT.txt` | Only its `worker_nodes/h3_character_swap` folder is used                                                                             |
| [comfy-openjutsu](https://github.com/Comfy-Org/comfy-openjutsu) `workflows/swap.api.json`                       | MIT (Comfy Org)      | `comfy-openjutsu-MIT.txt`              | `workflows/openjutsu-swap.api.json`, reformatted (the app's copy is `workflows/openjutsu-swap.json`)                                 |

ComfyUI itself is GPL-3.0 and is fetched at its pinned commit, not copied here.
Model weights are not in this folder or the build; their licences are listed in
[LICENCES.md](../../LICENCES.md).

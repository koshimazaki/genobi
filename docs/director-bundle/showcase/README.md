---
tags: [director, bundle, agents, memory]
summary: Showcase projects - finished cuts kept version by version as Director project files, with the memory that explains each change, so any version opens in the Editor, can be recreated, and an agent can continue from it.
---

# Showcase projects

A showcase project is a finished piece kept as its whole history: one
Director project file per version, a record of why each version changed,
and a README that tells the story. Every version opens in the Editor as an
editable project of its own, so a person can take any version and make it
theirs, and an agent can continue from one.

| Project                                      | Versions | Gallery card    |
| -------------------------------------------- | -------- | --------------- |
| [Dimensions mix](dimensions-mix/README.md)   | v1 to v4 | Dimensions mix  |
| [Genobi teaser](genobi-teaser/README.md)     | v1 to v3 | Genobi teaser   |
| [Bloom](bloom-teaser/README.md)              | v1       | Bloom           |
| [Adaptive reverb](adaptive-reverb/README.md) | v1 to v3 | Adaptive reverb |

## What a folder holds

```
docs/director-bundle/showcase/<project>/
├── project-v1.json   a director.bundle.v1 project (schema/project.schema.json)
├── project-v2.json   …one per version
├── memory.json       the record: versions, media, memory (schema/showcase.schema.json)
└── README.md         How it was made: the timeline, and how to recreate each version
```

- **`project-v<N>.json`** is the frozen project for that version. For future versions with public history,
  `scripts/showcase-versions.mjs` takes the template, its cut and
  `mixProject` from that commit (`git show`), so the file is what the studio
  opened then, not today's code reading an old cut. Its id is
  `<project>-v<N>`, so opening it never touches the template's own copy.
- **`memory.json`** (`genobi.showcase.v1`) holds:
  - `versions`: for each, the date, optional public commit and PR, who shaped it (`owner`,
    `agent`), what changed and why, and the memory events that explain it;
  - `pending`: optional future version work; none is included in this snapshot;
  - `media`: every file the versions use, by bundle path, with the public
    URL that serves those exact bytes, or, for a file the studio no longer
    ships, why it was omitted; optional public git history may be recorded;
  - `archive`: when true, bytes a later version replaced at the same path
    (the teaser's re-recorded footage) are copied to
    `public/media/showcase/<project>/v<N>/` so the older version still opens;
  - `recipeDefaults`: when a recipe's bytes were replaced, older versions are
    built on today's trusted recipe (the registry trusts recipes by hash) and
    the version lists them under `rebased`; a parameter the recipe gained
    takes the value given here, chosen to draw as the old one did;
  - `memory`: `events` in the shape of the project memory's `decision`
    (`shared/memory/schema.ts`: `kind`, `objectIds`, `reason`, `source`,
    `guidance`) and `checkpoints` in the shape of `session-checkpoint`, each
    with `actor`, `at` and the `version` it belongs to. The owner's
    corrections are quoted in their own words and recorded as
    interpretations, never as stated preferences
    ([save memory as you go](https://github.com/koshimazaki/Genobi/blob/main/AGENTS.md#save-memory-as-you-go)).

`tests/showcase.test.ts` holds every folder to this: the record matches the
schema, events and checkpoints parse with the memory's own schemas, each
version is a valid project with its recorded id and size, each media file's
bytes match, and the newest version equals the template the gallery opens
today unless a version is pending.

## Open a version

- **In the studio:** Gallery › the project's card › **How it was made** ›
  **Open v<N> in the editor**. The version opens as its own project; move,
  trim and retitle anything. Your edits are saved to that version's project
  copy, never to the record.
- **By address:** `/director?showcase=<project>&version=<N>&workspace=editor`.
- **A file that is not shipped** (the Dimensions mix's baked end card, v1
  and v2): the editable card stands in over the same frames and a frame note
  on it says so; the earlier capture is omitted from this snapshot.

`scripts/check-showcase.mjs` opens every version from the gallery in Chrome
and saves a frame and the Editor of each.

## For agents: continue from a version

1. Read the project's `README.md` and `memory.json`: the versions, the
   owner's quoted corrections and the open `nextSteps` of the last
   checkpoint. The current request outranks them.
2. Ask the person to open the version in the Editor (above) and link it, or
   open it yourself in the studio's browser, then link the project copy as
   usual. Its id is `<project>-v<N>`.
3. Edit with Director commands on that copy (`set-parameters`,
   `set-placement`, …; see the `genobi-director` skill). Record each brief
   or correction with `decision` as an interpretation quoting the person,
   and a `session-checkpoint` after each meaningful step.
4. To make the result a new version: export the project (Download bundle or
   the copy's manifest), save it as `project-v<N+1>.json` with id
   `<project>-v<N+1>`, add the version and its memory events and checkpoint
   to `memory.json`, add the README timeline entry, and run `npm test`. When
   the version comes from a merged template change instead, add the
   `versions` entry with its public merge commit and run
   `node --import tsx scripts/showcase-versions.mjs <project>`, which writes
   the project file and refreshes `media`.

## Add a showcase project

Create `docs/director-bundle/showcase/<project>/memory.json` with the
record's hand-written fields (`project`, `name`, `template`, `summary`, the
`versions` with `date`, `by`, `title`, `summary`, `changes`, and optional public `commit` and `pr`,
`eventIds`, and `memory`), run the script above, write the README, and run
`npm test`. The template must be a mix template the gallery lists.

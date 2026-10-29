---
name: show-scenes-job
description: The show-scenes job for a production — inputs, two designs, judging, build with guards, write to a COPY project, pictures, the owner's pick, apply with a one-command undo. Use when a show's light scenes are designed or rebuilt (steps 4-6 of venue-to-show). Safe epic-build flags are the default; the full rebuild is opt-in and destructive.
---

# show-scenes-job

**Needs:** the di.iiii checkout (all paths are repo-relative), node >= 22, python3, a scratch stack on localhost (on a di-atlas machine `di-dev up <tree>`; elsewhere the repo's documented dev start, see `run-di-iiii`), a test browser (above), an admin token env file for `--token-file`. Memory notes are background only.

Method source: After Action Review (US Army TC 25-20) run as PDCA; the job itself was drafted from a real scenes job (session note `docs/ai/sessions/feat-moxir-scenes-v5-pr-2026-10-17.md`, cited as the worked example only). Words: `docs/ai/vocabulary.md`. `<space>`, `<show>`, `<prev>`, `<new>`, `<tag>` are yours; no production is a default.

**The full job text is this file's twin and the one source: `docs/ai/skills/show-scenes-job.md`** (inputs table, the 7 judging criteria, steps 1-9, the nine written traps). Read it before the job; fix it in the same branch as the work that proves it wrong. This file holds the rules that must never be skipped.

## Safe by default
Writing a rig into a project goes through `scripts/rigbuild/epic-build.mjs`. Pick the NARROW mode, always, and a dry run first:
| need | flag | writes |
|---|---|---|
| looks and cue list (what a scenes job needs) | `--looks-only` | looks + cues only |
| laser lines in time | `--laser-frames` | `beam.laser.frames` |
| addresses from the rig file | `--patch-only` (then `scripts/rigbuild/patch.mjs --project <id> --exact`) | universe/address |
Each: `node scripts/rigbuild/epic-build.mjs --api <localhost api> --project <new> --rig <rig.json> --token-file <env> <flag>` (dry run), same plus `--apply` to write, then read the counts back.

**Destructive, opt-in only: the full rebuild.** No narrow flag = delete N + create N units from the rig file; the rig's coordinates replace every hand placement and the laser frames are lost (measured 2026-10-15: 102 units moved, cube frames dropped; restored from backup). Since 2026-10-21 the tool refuses it on a project that holds units unless `--rebuild-all`, and `--rebuild-all --apply` needs `--out <dir>` (the document before is written there). Use it only with the owner's word, on a COPY, after the `show-checkpoint` skill ran. `--lasers-only` is a dry run unless `--apply` (it once wrote without it, N767).

## Rules that hold the job
1. Executors (designers, judge) run headless on their own API key, not the lead's chat plan meter; the chat leads and judges. Two designs, one judge, separate contexts; inputs and outputs are FILES.
2. Every write: backup -> dry run -> `--apply` -> read the count back. Writes go to a COPY project (`scripts/place/copy_project.mjs`), never the show document before the owner's pick.
3. Guards must exit 0 before the write: `scenes_build.py --check`, `scenes_flash.cjs` (WCAG 2.3.1, 3/s), `heads_check.mjs`, `physics_check.py` (0 leaks). Colours only from the file's `palette[]` / the seen wheel slots.
4. The owner picks by looking (sheet + room page). His word is the only gate to applying; record it verbatim in the session note.
5. Apply = backup copy, update, and the undo is one command (`copy_project.mjs --from <show>-before-<tag> --to <show> --update --apply`).
6. Pictures: `env-pick-shots.cjs` on a desk loaded by `show-loop.mjs --no-start`, in a test browser that is not the owner's (on a di-atlas machine: `di-test-browser`; elsewhere plain Playwright with a real GPU, never a software renderer); open them. A green run is not evidence.
7. End with the `job-end-gate` skill (physics, sterile, cost, what lives where).
Before any lamp check in the job: `hall-compare` skill.

# feat/moxir-work-light-2026-10-01 — the work light, and MOXIR handed to the PONYO laptop

Branch cut from `fix/review-a-findings-2026-09-30` (f00e404a, the `.14` preview line). aylmo session, 2026-10-01.

## What this branch adds

- `scripts/rigbuild/work-light.mjs` (+ `work-light.test.js`, 4 tests): a dim neutral ambient (`#a39c92`) in every
  room with a `rig-show`, scene-referred (level ÷ the room's `toneMappingExposure`, default level 1.4), undo file
  first, local install only. Cause, numbers and the way back: RIG_BUILD §20.4.
- Owner, on his screen: "ok so its to dark", then "let me see you fixed in all scenes". Applied to the 14 MOXIR rig
  rooms on aylmo's install (`.14`). Measured on Minimal only (RTX 3080, desktop, 5 cues: mean luma 10.5 / 18.9 / 9.6 /
  13 / 32.9). The other 7 visible versions are applied but NOT measured: the run was stopped at CPU 100 °C.
- The level is the owner's to judge by eye; he has not said yes yet.

## Found, not fixed here

- The owner's browser (Flatpak Chromium on aylmo) renders on the **Intel iGPU**; the RTX 3080 sits at 0 %. The room
  in his tab drove the CPU package to 98–100 °C with both fans at max. The Flatpak's NVIDIA GL extension
  (`GL.nvidia-615-71-09`) matches the driver, so the card is reachable; on 09-28 the PRIME env gave the Flatpak no
  WebGL at all. Owed: a tested route (separate profile, check `UNMASKED_RENDERER`), aylmo-only.

## Handover — MOXIR work for the PONYO laptop (Emilya's)

Owner, 2026-10-01: "we moved to emily laptop so move from moxir give them work". aylmo steps back from MOXIR.
Everything below is on GitHub (`dob-0/di.iiii`, public). The MOXIR **data** (the local install's space, 16 projects)
lives only on aylmo — restore file `~/di-backups/preview-rig-builder-2026-09-28/step-14b/moxir.diiii` (73 MB); the
public view is https://dev.diiii.xyz/moxir (older Minimal). Code items need no data.

Rules: one branch per item, cut from `fix/review-a-findings-2026-09-30` (or this branch); never commit to `dev`/`main`;
a regression test that fails without the fix; gate on a COUNTED vitest pass ("No test files found" exits 0); push the
branch the same day; write a session note `docs/ai/sessions/<branch>.md`. Review reports: `docs/ai/sessions/
cloud-review-{a,b}-2026-09-30.md` on branches `cloud/review-a-2026-09-30`, `cloud/review-b-2026-09-30`; what is
already fixed: `docs/ai/sessions/fix-review-a-findings-2026-09-30.md`.

| # | Item | Where | Size |
|---|---|---|---|
| 1 | **B3** — `conflictsWith` hull + `rigFlags` downgrade note: merge `feat/desk-serves-refusal-flags` into the review line, resolve, test | review B | small |
| 2 | **A4-4** — per-look op: two installs editing looks lose each other's updates (whole-`rigLooks` writes) | review A | medium |
| 3 | **A4-2** — a real save acknowledgement from `useProjectDocumentSync` for the scene-deck ledger (it now waits on the store version as a stand-in) | review A | medium |
| 4 | **A2-4b** — the DJ-riser / crew-floor laser zone | review A | small |
| 5 | **A5-5** — pool memoisation | review A | small |
| 6 | `StudioViewport` `TOOLBAR_BTN` radius 6 px → 2 px (owner's rule: rectangles only, 0–2 px) | code | tiny |
| 7 | The green "LOCAL local.thedi.studio" badge covers Undo / Restore on the scene deck (desktop) and "Mark this as good" (phone) | code | small |
| 8 | **Crane + truss** — the owner has not said what looked wrong; do it on PONYO from the real render (truss / clamps / crane were last fixed in `fix/truss-hangs-from-the-crane`, in f00e404a) | owner + code | ? |
| 9 | Phone Studio layout still draws 999 px pills (←, Nodes, Projection, Edit, cue chips) — found by PONYO | code | small |

Done on PONYO (local, not pushed — Emily's call): item "TOOLBAR_BTN 6→2 px" as af874a2d on
`fix/studio-toolbar-rectangles-2026-10-01` (+ a Windows path fix in `controlsAreRectangles`).

Already DONE on `f00e404a` (do not redo): A1-3 room-wide strobe grid, the runtime laser gate (`deskLookValues`), B6 pack/install
scripts, A5 1–4, A2-4 a/c/d, A3 1–6, A4 1,2,3,5,6 (corrected 2026-10-01 by session dob-c9). The review line is landing
through PR #679 (`land/rigbuilder-14-2026-10-01` → `dev`, dob-c9 on aylmo); cut new branches from `dev` after it merges,
or from `fix/review-a-findings-2026-09-30` before. Return route (PONYO): branches pushed to `emilyanikoghosyan/di.iiii`
(auto-PR to `dev`).

Not for PONYO: A2-3 (needs the maker's effect-distance figure), the crane + truss fix (the owner has not said what is wrong), the owner's look at `.14` and the work-light level,
measuring the other 7 versions (aylmo's own check, on aylmo), the browser-on-3080 fix (aylmo).

Emilya's own, if she agrees: give `dob-0` read access to `viz.di.formal` and `viz.di.scenes`; the real DMX charts
she has for the studio fixtures (the rental house's UP-* charts are still missing everywhere).

## Handover part 2 — the owner looks at MOXIR on PONYO (2026-10-01)

Owner: "i can see it now in machine of ponyo so move it all there"; to dob-c9 the same night: aylmo only pushes and lands
MOXIR, the MOXIR work itself is on PONYO. Everything aylmo still owed on MOXIR moves to
PONYO: the work light on PONYO's copy, the owner's look and his level, the measurement of the versions. Dropped:
aylmo's browser-on-3080 fix (he no longer looks on aylmo). All of it only on Emily's yes, as before.

1. **Get the script:** in the MOXIR worktree (at f00e404a), `git fetch origin feat/moxir-work-light-2026-10-01` and
   check it out (it is f00e404a + `scripts/rigbuild/work-light.mjs` + its test + docs; no app code changes).
2. **Restore point first** of PONYO's own moxir data (`di save moxir` or a copy of the data root).
3. **Dry run, then write:** `node scripts/rigbuild/work-light.mjs --api <PONYO's local …/serverXR> --space moxir
   --out <backup dir> --dry-run`, then without `--dry-run`. Token: `DI_API_TOKEN` env or `--token-file <env file with
   ADMIN_API_TOKEN=>`; it refuses any host but `local.thedi.studio` / `localhost` / `127.0.0.1`. It lists every rig
   room with the ambient it replaces; expect 14 rooms (archived ones skipped), realism rooms 0.4, older-night rooms 1.4.
   **Checked by PONYO: its copy (exported 21:51Z, after the run) ALREADY carries the work light** (0.4 / 1.4) — skip
   the write; the dry run should show "was" equal to the new value in every room.
4. **The owner's look:** open `/moxir` there, click through the version row and the scenes. His level:
   `--undo <dir>/work-light-undo.json`, then run again with `--level <n>` (1.4 now; 2 = brighter, 0.8 = darker).
   The level he picks goes back into RIG_BUILD §20.4 and `DEFAULT_LEVEL`.
5. **Measure (optional, Emily's yes):** `scripts/rigbuild/look-probe.mjs --gpu --base <PONYO base> --path
   /moxir/p/<project> --project <project> --out <dir> --tag <project> --viewports desktop` per version. Its CPU
   temperature guard reads Linux `sensors` only — on Windows it runs WITHOUT that guard; keep PONYO's stop rule
   (GPU above 85 °C or loud fans for a minute → stop). Aylmo's numbers for Minimal (RTX 3080, desktop): cue means
   10.5 / 18.9 / 9.6 / 13 / 32.9.
6. **Report** in ≤ 8 lines, once, to the owner and in this note (push to `emilyanikoghosyan/di.iiii`).

aylmo's own install keeps its work light (undo file on aylmo `~/di-backups/preview-rig-builder-2026-09-28/step-14b/
work-light/`); aylmo writes nothing more to MOXIR.

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
| 2 | **A1-3** — the strobe limit is per lamp; make it the room-wide union (flashes of all strobes together ≤ 3/s, photosensitive-epilepsy guidance the review cites) | review A | medium |
| 3 | **Runtime laser gate** — lasers are 0 in every look by data; add the gate in code so a look cannot light a laser without the sign-off marker at run time, not only in the deck | review A | medium |
| 4 | **A4-4** — per-look op: two installs editing looks lose each other's updates (whole-`rigLooks` writes) | review A | medium |
| 5 | **A2-4b** — the DJ-riser / crew-floor laser zone | review A | small |
| 6 | **A5-5** — pool memoisation; **B6** — re-run that review area (the run was cut) | review A/B | small |
| 7 | `StudioViewport` `TOOLBAR_BTN` radius 6 px → 2 px (owner's rule: rectangles only, 0–2 px) | code | tiny |
| 8 | Then one PR: the review line + this branch → `dev`, CI green (a Playwright hang: cancel + rerun) | GitHub | — |

Not for PONYO: A2-3 (needs the maker's effect-distance figure), the owner's look at `.14` and the work-light level,
measuring the other 7 versions (needs aylmo's data), the browser-on-3080 fix (aylmo).

Emilya's own, if she agrees: give `dob-0` read access to `viz.di.formal` and `viz.di.scenes`; the real DMX charts
she has for the studio fixtures (the rental house's UP-* charts are still missing everywhere).

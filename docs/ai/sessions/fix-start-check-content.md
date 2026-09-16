## 2026-09-16 — start-check compares content; tier-sync can rebuild its baseline

Found by the spaces audit (`docs/research/2026-09-16-spaces-audit.md`, PR from `docs/spaces-audit`).

- **start-check** judged "newer on dev" from `documentVersion`/`updatedAt`. Every tier bumps
  those on its own and re-addresses assets on arrival, so the owner's box printed ~94 NOT
  LATEST lines, mostly identical content. It also offered to pull `open/mini`,
  `open/i-dont-know`, `main/tools-sketch`, `what-we-have/suite-sketch` — all in local's trash.
  - Now: versions equal (or equal to a content-confirmed baseline entry's versions) → same,
    no fetch. Otherwise both documents are fetched (8 pairs at once, dev-later first, one
    15 s budget) and compared by `documentSignature().shape` (volatile fields stripped,
    assets by name). Content differs → direction from the baseline only; with no
    baseline entry it is "differs — look before pulling or pushing" (compare + pull
    commands), never guessed from timestamps and never NOT LATEST by itself.
    Unread in budget → `not confirmed: N`, never NOT LATEST.
  - `GET /api/trash` on local: a dev-only project in local's trash is "deleted here on
    purpose", no detail line, no pull.
  - Output: summary line, optional `not confirmed` line, ≤5 details (dev-ahead first).
- **tier-sync `--rebuild-baseline [--dry-run]`** (defaults `--from local --to dev`): reads
  both tiers, records every project whose shape is identical as
  `{ shape, versions: { local, dev } }`, lists the differing ones, replaces the
  destination's key only, writes nothing to a tier. `--changed` now writes the same
  versioned entries; every reader goes through `baselineShape()` so old bare-string
  entries still work.
- Live, owner's box (LOCAL_API_URL=http://localhost:4000, dev.diiii.xyz):
  - before: `11 newer on dev … 8 local ahead …` — 84 dev-ahead, 112 local-ahead, 2 both rows, 5.2 s.
  - after: `15 same · 4 newer on dev: main, what-we-have, the-light-put-back, network ·
    2 changed on both: open, br-id-ge · 3 local ahead … · 4 project(s) deleted here on purpose`
    — 10 dev-ahead, 2 both, ~11 s, 0 not confirmed.
  - `--rebuild-baseline --dry-run`: 198 identical · 17 differing · 31 one tier only (24 s).
    Same 17 as start-check's content-differing rows. Not run for real (owner's data tier).
- Review round: the timestamp direction called `what-we-have/map` "newer on dev" while
  local's copy was fuller — removed (bucket `differs`). `--changed --dry-run` used to
  write the baseline; every `--dry-run` now writes nothing (test drives the real
  `main()` against fake tiers for `--changed`, `--rebuild-baseline`, plain).
  - re-run: `15 same · 2 changed on both: open, br-id-ge · 6 differs — look before
    pulling or pushing · 1 local ahead · 8 local-only · 4 deleted here on purpose`, 12.3 s.
    The two "changed on both" come from the stale 09-06 baseline; after a real
    `--rebuild-baseline` they fall into `differs`.

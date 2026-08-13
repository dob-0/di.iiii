---
name: open-call
description: Run a full open-call cycle on di.iiii — bilingual apply form dual-writing to the organizers' Google Form + serverXR, /admin review board, close-out, and transform-to-exhibition. Use when a linked space needs applications collected, reviewed, or an ended call turned into an exhibition page.
---

# Open call as a platform capability

di.iiii already carries everything an open call needs; this skill is the map.
The reference implementation is **beyond_form** (dob-0/beyond_form), which ran
the full cycle for Gyumri Art Week 2026 and was then transformed into an
exhibition page (commit `314682a`, branch `worktree-bydf-exhibition`).

## The cycle

### 1. Collect — the apply form

- Page-side form: `beyond_form/src/ApplyForm.jsx` is the canonical example.
  It stays in that repo even though the page no longer mounts it — copy it,
  don't reinvent. Key properties:
  - bilingual (hy/en) field labels, one component;
  - **dual-write**: the organizers' Google Form stays canonical (they own the
    sheet), serverXR gets a copy for the admin board;
  - custom radio targets, not `accent-color` (invisible-when-selected on dark);
  - thank-you flow swaps the form out (`onDone`).
- Platform-side: open-call submit endpoints are covered by
  `PUBLIC_CORS_ROUTES` in serverXR (added in `7bfb260` together with project
  asset GETs) — sandboxed-iframe pages POST cross-origin, so any new route the
  form needs must be listed there, with contract tests.

### 2. Review — the admin board

`/admin → Open Call` lists submissions with statuses, notes, filters and CSV
export. It reuses the `preferences-*` design system (see
`reference_canonical_admin_ui` — never invent parallel styling).

### 3. Close and transform to exhibition

When the call ends (beyond_form pattern, keep the page's existing design):

- hero glass label `Բաց կանչ — Open call` → `Ցուցադրություն — Exhibition`;
  CTA, floating pill and marquees repoint `#apply` → `#works`;
- the apply section is removed from the page; `ApplyForm.jsx` remains in the
  repo as the reusable reference;
- a bilingual Works section carries each artist (hy + en columns; on a
  two-column `.work` grid, give `.work-title` and `.work-text` an explicit
  `grid-column: 2` or titled entries collapse into the narrow name column);
- about/facts copy flips to past tense; title/meta and footer follow;
- artists without material get a visible `tba` row, not silence.

### 4. Deploy

`node scripts/sync-space.mjs --tier staging` from the page repo (token:
`LIVE_API_TOKEN` from di.iiii `serverXR/.env.local` via the repo's
`.env.local` — the script only reads its own repo root). Verify on
staging.di-studio.xyz with real screenshots at device DPR, then `--tier prod`.
Keep `projectId` stable across the transform — it anchors the published URL.

## Rules that bit us

- Never scale unseen: screenshot every visual change at DPR 2–3 before
  reporting it done.
- Off-screen canvas pausing (`frameloop:"demand"` + IntersectionObserver)
  breaks inside di.iiii's sandboxed srcdoc iframes — keep `frameloop:"always"`.
- Space edits for linked projects happen Studio-first; repo-side sync is
  push-only.

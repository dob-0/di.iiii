# Resources: one list of what we can run work on

**Date:** 2026-11-01 · **Asked by:** the owner, 01:0x: *"i want to add all what we have in di.iiii … i mean resources all kind of"* ·
**Rule served:** "Best for the case, advised" (2026-10-29) and the cheapest-resource rule (ledger N1494).

## Decision

di.iiii gets a **resources file** contract and a page for it, as a platform feature with no team's data in it:

- `shared/resources/resourceModel.mjs` — the shape (`di.resources/1`), the checks (`validateResources`) and the pick
  per job (`bestFor`). Six kinds: machines, cloud GPUs, model credits, local models, services, show devices.
- `scripts/resources/render-resources.mjs <file.json> -o page.html` — refuses a bad file, renders one page in the
  di.iiii frame (top bar, back path, title line, credits), light and dark, square corners, stacked at phone width.
- `shared/resources/example.resources.json` — made up; feeds the tests and the screenshots.

## Why the data is not in this repo

`dob-0/di.iiii` is **public** (`gh repo view --json visibility` → PUBLIC, 2026-11-01). A team's list of machines,
logins, keys and balances is private estate data, so a team keeps its own file in a private place (ours: the private
di-atlas repo, `resources/resources.json`). The platform holds the contract and the view; the space or repo holds the data.

## What each row must carry

- `state` is what the check found: **works** only when the resource was USED in the check (a real call, a command run on
  it); **spent** / **down** need the answer that said so; **unchecked** needs a `why`. `works`, `spent` and `down` need a
  `proof` with `text`, `source` (the command, file or URL) and `date`; every `fact` too.
- `use` says who may use it: `ours` (our own work only, e.g. a plan login that cannot be shared), `shared` (may serve
  others), `owner` (a person's own device, with their word), `venue` (a place's or a production's).
- `bestFor` names jobs from the file's `tasks`; `order` ranks cheapest first. `bestFor(doc, job, { who })` returns only
  what works today, and never gives `others` anything but `shared`.
- **No secret values.** A row names where a sign-in lives (`secretsAt`), never the value. The check fails a file with
  anything shaped like a key, token, password or private key (`SECRET_PATTERNS`).

## Method

An asset register in the ITIL 4 IT-asset-management sense (one record per asset: owner, state, evidence), with this
repo's agent rule that a state is a tool result with a source and a date, never a memory.

## Owed

- A space door for the page: `space-code-push.mjs` reads only `spaces/<id>/code/` in this public repo, so publishing a
  private file into a private space needs a `--from <dir>` option (or the `di` CLI). Until then the page is a file.
- A re-check job that refreshes the states on a timer (the probes are one script today, in the check's report).
- Earlier list it replaces: the agent report `resources-and-routes.html` of 2026-10-28 (kept as an archive there).

## 2026-08-19 — install-matrix was the last workflow still on actions/checkout@v4

- Every other workflow in `.github/workflows/` already pins
  `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` — nine call sites
  across ci, release, browser-checks, both deploys, both publish jobs, deploy-space-code
  and auto-pr. `install-matrix.yml` alone still floated on `@v4`, in six jobs.
- This pins those six the same way, by hash with the version in a trailing comment, so
  the repo has exactly one checkout version and no floating tags. `actions/checkout@v` no
  longer appears anywhere in the tree.
- Verified: the file still parses as YAML and all six jobs (`pack`, `linux`, `update`,
  `offline`, `windows`, `docker-mode`) survive the edit. Nothing else in the workflow
  changed, and no application code is touched, so there is nothing to look at in a
  browser.
- Supersedes Dependabot PR #143, which proposed the same bump as a floating `@v7` tag
  and conflicts on current `dev`.
- Still unproven, and it is the reason to watch this one: the windows install-test job
  in this matrix was already failing before the pin. Pinning checkout does not fix it and
  was never meant to — if that job is still red after this lands, it is the pre-existing
  failure, not the pin.

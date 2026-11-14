## 2026-11-10 — least-privilege tokens in the GitHub workflows, plus a security policy

- Every workflow now starts from `contents: read`; the write scopes (packages, contents, issues) moved from the top of the file to the one job that uses them.
- `install-matrix.yml` had no permissions block at all; it now has `contents: read`, and its actions are pinned to a full commit hash.
- `tag-on-promotion.yml` no longer pastes the manually typed version into the shell; it goes through an environment variable.
- Added `SECURITY.md` at the repo root (private reporting route, supported versions).
- Left on purpose: `tag-on-promotion.yml` still checks out the commit that the main deploy built (flagged by OpenSSF Scorecard as Dangerous-Workflow); changing it would change which commit is tagged.

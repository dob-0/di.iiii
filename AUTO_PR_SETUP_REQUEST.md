# Request — Set Up Auto-PR On Your Fork

**To:** `emilyanikoghosyan/di.iiii` and its agent
**From:** `dob-0/di.iiii`
**Status:** open

---

## What we're asking

Right now you open a PR by hand after pushing. We've added a ready-made GitHub
Actions workflow upstream that auto-opens a PR against `dev` whenever you push
to a working branch in your fork — so that step goes away.

## What to do

1. Pull `upstream/dev` to get this file plus the template
2. Copy `docs/templates/fork-auto-pr.yml` from this repo into your fork at
   `.github/workflows/auto-pr.yml`
3. Create a personal access token (fine-grained: `Pull requests: write` +
   `Contents: read` scoped to `dob-0/di.iiii`, or a classic token with `repo`
   scope) and save it as a repo secret named `UPSTREAM_PR_TOKEN` in **your
   fork's** settings (Settings → Secrets and variables → Actions)
4. Push a test branch and confirm a PR opens against `dob-0/di.iiii`'s `dev`
   automatically — no `gh pr create` needed
5. Pushing more commits to that same branch just updates the existing PR
   (GitHub does that part on its own, no extra step)

Review and merge into `dev` stays manual on our side either way — this only
automates opening the PR, not getting it merged.

## Once done

Reply on the relevant PR or delete this file in a follow-up commit, same as
the last sync request.

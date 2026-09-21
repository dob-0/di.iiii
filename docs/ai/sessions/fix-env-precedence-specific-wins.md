## start-check can see the content line again: the server's own env file wins

`npm run start-check` is the one command meant to say LATEST or NOT LATEST on **both**
lines before anyone works. On the owner's machine it had said `spaces: not checked
(local tier unreachable http://localhost:4000)` for a week — while the install answered
on https://local.thedi.studio the whole time. "not checked" read like a skipped nicety;
it meant the tool was blind to half its job on the machine where that half lives.

Cause: the untracked root `.env` carried a stale `LOCAL_API_URL=http://localhost:4000/serverXR`,
and five scripts merged it AFTER `serverXR/.env.local`, so the stale line won. The other
four env-reading scripts already merged the specific file last — two answers to one
question, in one repo. The earlier empty-value guard could not catch a wrong non-empty value.

Done:
- `start-check`, `local-mirror`, `project-pull`, `space-push`, `space-pull` now merge
  `serverXR/.env.local` last — most specific file wins, same as the rest
- a comment above each block says why, so the order is not "tidied" back
- `local-mirror.test.js` asserts the order in all five
- known-fixes row

Proved on the owner's machine with the stale root `.env` left in place: `start-check`
now prints `code: LATEST` and the full spaces line (13 same · 7 differ · 2 only on dev ·
8 local-only) with no override.

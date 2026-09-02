## 2026-09-02 — GitHub space-sync stops answering itself with 401

When a linked repo pushes, or a space is first connected, `serverXR` pulls the
repo and then writes it back through its own HTTP routes, authenticating with
`config.apiToken` — that is `API_TOKEN`/`SERVERXR_API_TOKEN`. `docker-compose.yml`
passes only `ADMIN_API_TOKEN` into the container (compose env is an allow-list), so
on prod and staging the self-call header was a bare `Bearer ` and every webhook and
every initial sync failed with `internal document GET failed (401)`. Failed closed,
so never a hole — but the feature was dead on both tiers since it shipped.

- `config.internalApiToken` = `API_TOKEN` if set, else the admin-role fallback the
  session secret already trusts (`adminFallbackToken`), never a lower-role token.
  Both self-call sites in `index.js` use it.
- Tests: the Docker case (only `ADMIN_API_TOKEN`) resolves to it; `API_TOKEN` still
  wins when present; an editor-only token yields nothing.
- Not verified end to end against a real GitHub App push — that needs a linked
  repo on staging; the first real webhook after this lands is the proof.

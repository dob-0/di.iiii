## 2026-11-01 — `di open FILE --to URL` opens a saved file on another di.iiii (ledger N1852)

- What: `di open FILE --to https://dev.diiii.xyz [--as ID] [--token -]` posts the saved file to that di.iiii's `/serverXR/api/spaces/bundle` as multipart (field `bundle`, streamed), with the rules of `di move --from`: token from stdin, else DI_TOKEN, else the login `di login --to URL` stored for that address; it says who it is (user-agent). The address is validated like `di login --to` (origin only).
- Why: the owner's words, "fix that gap" — `di open FILE` reached only this install's own server, so a file saved here could not be opened on dev from the terminal's own login.
- Answers (ui.mjs, beside the other open texts): the space's address plus a sign-in line; 401/403 `auth_required`/`not_through_cli` → `di login --to <site>`; 413 → bigger than that di.iiii takes (MAX_UPLOAD_MB), and NO local fallback; anything else → the server's own words. No `--to` = exactly the old path, including the local too-large fallback.
- Tested: scripts/di/openTo.test.js (fake fetch, fake HOME, stored login): URL, Authorization, user-agent, multipart field, `--as`, DI_TOKEN first, no login → sign-in message and no request, 401/403, 413 without fallback, 409 words, bad address. Not tested: a real carry to a real server.

### Opus review of #1242 — what changed (F1–F7)
- F1 `not_through_cli` is matched on `body.error` (the real shape) and prints the server's `reason` + `rule`; sign-in text only for `auth_required`.
- F2 `space_exists` (409) adds `try: di open FILE --to URL --as NEW-ID`; the test mocks the real server line.
- F3 a bare `--token VALUE` is refused in `di open` (nothing sent, secret not echoed); only `--token -` is allowed.
- F4 plain http to any host but localhost/`*.localhost` is refused before a token is sent; the sign-in line names the host that gets DI_TOKEN.
- F5 a dropped connection says the upload cap may be the cause. F6 `--to` / `--token -` without FILE asks "which file?". F7 "sending N MB to HOST…" line and a 30 min timeout (`DI_OPEN_TO_TIMEOUT_MS`) that names the host.
- Tests: openTo.test.js 16 passed. Not tested: a creating carry on a real dev.

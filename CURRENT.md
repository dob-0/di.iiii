# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live) — promote only after staging verify

---

## Last commit

**`dev` is AHEAD of `main`** — staging deployed and verified (`deployEnv:
staging`, running the pushed sha, host key pinned); prod is on the earlier tier.
Several agents share this tree: re-check `git log`, **stage explicit paths**.

## Last session (2026-08-04, third — algovrithm front door)

- **`/algovrithm` is public and in Studio** — the space row didn't exist on
  staging or prod; created, `isPublic`, and given a real captured frame as its
  card preview.
- **The page is the artist's statement and nothing else.** Three rounds of
  cutting removed three vocabularies (repo paths → timeline/timecodes → the beat
  names themselves, which are techniques). Costs stated in the file's header.
- **The piece is now the page's ground** — canvas fixed full-viewport behind the
  text, scrim 0.62 → 0.9 once the statement is on screen (two beats are WHITE);
  measured ink 15.53:1, dim 4.71:1 across the whole 53s loop.
- **Four defects only a human pass found:** the page never scrolled (`#root` is
  `position: fixed`); the canvas painted into 66% of its frame at DPR 1.5
  (`paintFrame` reset the transform); Space Mono had no `@font-face` anywhere,
  so nobody had ever seen the page in its typeface; reduced-motion opened on a
  black frame (hold now 11.5s, scored across every frame).
- **Two `--avl-*` tokens failed the piece's own `paletteWarning()`** under a
  comment claiming they passed. Fixed; a guard now reads every token through it.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie,
roles, OAuth-first) + open-space/sandbox grants; Open Jam and vanity links live;
deploy via `git push origin dev|main`; nightly VPS backups + daily off-box pull.

## Open

- **Generate the GitHub App secrets** (`docs/ops/ROTATE_GITHUB_APP_SECRETS.md`
  1–3, App `4178187`). Wiring is live; the values are not, so sync stays off.
- **`LIVE_API_TOKEN` (staging) is stale** — 401; staging's br_id_ge is older.
- **`dev → main` promotion owed** — `/algovrithm` is live on staging only.
- **algovrithm's WebGL hero is written but never run** (`heroField.js`, ports
  the piece's shaders). One movement at a time at DPR 1.5; owner's go awaited.
- **Reel globe's world `#04050A` fails the purple-gap check in the piece itself**
  (`sequences/index.js`) — artist's call. Keyboard scroll is dead app-wide
  (`/wcc` too); only `/algovrithm` was fixed.
- **The `br_id_ge ▾` chip covers the field's Armenian letter-row**; narrow
  phones also collide the bottom links. Owner's call — published-project layout.
- Privacy calls owed: no account-deletion, export or session revocation; backups
  unencrypted. §7 sign-off blocks Stage 2. `docs/ai/INBOX.md`.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```

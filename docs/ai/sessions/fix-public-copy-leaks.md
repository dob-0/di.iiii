## 2026-09-28 — two public-copy leaks from "the kit" audit: /support's own logistics, and a stranger reading the server's machine name

Source: the 2026-09-28 "kit" catalogue audit (`di-atlas/audits/2026-09-28-kit/AUDIT.md`,
a sibling repo, not this one) — its "rule breaks" section ("COPY AND RULES on dev today"),
scoped to two of its findings, both live on `dev.diiii.xyz` today, both seen by a signed-out
visitor.

### 1. `/support` prints a progress count and names payment platforms + fees — DATA, not code

Checked first: `grep -rn "of 5 open|WAYS TO GIVE|RAILS" src/ serverXR/ scripts/` — no match.
Confirmed by rendering `https://dev.diiii.xyz/support` with a headless browser: the page is a
`srcdoc` iframe whose entire HTML (including an inline `<script>` with a `RAILS` array) is
project content stored in space `support` / project `support` on the tier's own database — not
a file in this git repo. Per this branch's instructions, that means **no write to any tier**:
the exact location and the exact text change are reported to the owner directly rather than
edited here. Summary of what's live and wrong today, for the record:

- The "Ways to give" section header prints `<span id="railCount">3 of 5 open</span>` — a
  progress count of our own build-out, computed from the `RAILS` array's `live` flags.
- Two rows are shown as `NOT OPEN YET` (GitHub Sponsors, "From Armenia" / Idram·Telcell) — a
  row that doesn't work should not be on the page at all.
- The three working rows are named by supplier, not by verb, and carry fee/processor
  disclosure: Whydonate's row says "no platform fee" and "paid out to Armenia"; Polar's row
  says "card or Apple Pay"; GitHub Sponsors' (not-live) row explains that GitHub "covers the
  card fees, so the whole amount arrives" — all of it publishes our own arrangement, not what
  the visitor can do.
- The footer adds "The ways that are not open yet are applied for, and appear here when they
  open." — a promise with no date, and a sentence about our own process.
- Open call for the owner: Whydonate (live, 0% fee, EUR/Armenia payout) and Polar (live, one-off
  + $5/month, USD) both currently do "give once" — the rule says one link per verb, so which
  processor backs "Give once" (and whether Whydonate is dropped or kept as a second unlabeled
  channel) is a product decision, not something this session picked silently.

### 2. Projection's "Machines" panel named the serving machine to a stranger

`serverXR/src/machines/routes.js`'s three routes (`POST .../machines/hello`,
`GET .../machines`, `POST .../machines/sync`) are editor-only on the space, but a signed-out
visitor to a public space is auto-issued a guest session with editor rights — that is how a
stranger reaches Nodes/Raw at all, and it is by design. The routes answered any editor,
guest included, with the real `machine.name` and every peer's `machineName` — the name a
person picked for their own box.

Fix: redact both to `null` when the caller is a guest (`type === 'guest'` or a `guest:`-prefixed
subject — the same test used everywhere else in this server for exactly this distinction,
not invented here). The client already falls back to the honest "this machine" / an id
fragment when given no name, so nothing on the client needed to change to make the redaction
land — except one polish in `describeMachine` (`src/map/mapMachines.js`) so a redacted self
reads "this machine", not "this machine · this machine". A real (non-guest) account and a
local install with auth off are unaffected on every tier.

Left for the owner: `/api/config`'s public `machine` field carries the same name to anyone
who queries it directly (the audit's own "does too") — not fixed here, because nothing in the
web app renders it (a UI-visible leak was the scoped ask) and it needs its own call on whether
a fully public, unauthenticated endpoint should ever answer a real chosen name at all.

**Guards added:** `serverXR/src/machines/routes.test.js` — "hides the machine name from a
guest, and shows it to everyone else" (guest by type, guest by subject prefix, real account,
local install — four cases, red on the old routes). `src/map/mapMachines.test.js` — "names
itself plainly when it has no chosen name to show — no doubled suffix".

**Validation:** `npm run lint` (0 errors, pre-existing warnings only) · targeted vitest
(`serverXR/src/machines/`, `src/map/mapMachines.test.js`) 31/31 · `npm run test:server-contracts`
174/174 · full `npm run test` 6311 passed / 4 failed — the 4 are `sdk/door.test.js`,
`sdk/sdk.test.js`, `scripts/di/openFile.test.js`, all real-stdio child-process spawns unrelated
to this change; reproduced the same timeout on a clean `origin/dev` checkout with no edits, so
pre-existing/environmental, not from this diff.

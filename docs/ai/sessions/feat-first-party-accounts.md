## 2026-09-11 — di.iiii gets accounts of its own

- Every door into the platform belonged to somebody else — Google, GitHub,
  Telegram — so a person had to already belong somewhere to belong here. Now:
  an email and a password, a one-time link in your mail instead of a password,
  or a plain username on an install with no mail at all.
- The username case is not a lesser mode, it is the camp: a laptop with no mail
  and five kids. It ships with its honest limit said out loud, in the UI and in
  the API answer — nobody can prove such an account is theirs, so only an admin
  can recover it.
- `passwordHash.js` — scrypt at N=2^16 (~64 MB per hash), the whole verifier in
  one string so the cost can be raised later without a migration, and a
  `needsRehash` that quietly rewrites an old row on the next sign-in.
  **Its test caught a real hole the day it was written:** `scrypt$$$$$` parsed
  into six parts, `Number('')` is 0 and therefore finite, and the empty-vs-empty
  comparison made that row accept EVERY password. Parameters must be positive
  and salt and hash non-empty.
- `authTokenStore.js` — verify, reset and magic in one table, holding the three
  rules that make a token in an inbox safe: only the SHA-256 is stored, verify
  and consume are one step, and every failure answers null so unknown, expired,
  spent and forged cannot be told apart.
- The refusals are the substance: registration never grants a role or a space;
  "is this address registered?" is unanswerable (forgot and magic answer the
  same either way, and a taken address is refused in the same words as an
  invalid one); a wrong password and an unknown account take the same path,
  hash cost included, so the clock says nothing either.
- `mailer.js` — nodemailer over SMTP, and **unconfigured is a first-class
  state**. `/api/auth/providers` reports `mail: false`, the UI stops offering
  the two doors that end in an email, and the endpoints refuse honestly instead
  of promising a message that can never arrive.
- **Seen**, against the built app on the local server: registered, signed in,
  duplicate address refused without admitting it was taken, wrong password and
  unknown person answered identically, a username-only account created with its
  note. Screenshots of both modes of the card looked at, phone width.
- Two things the looking caught that the tests could not: a disabled submit
  button that read as broken on the near-black ground, and "email me a link"
  offered on an install with no mailer.
- **Not done:** the reset form is reached by `?auth=reset` and renders inside
  the sign-in card; there is no route of its own yet. No SMTP is configured on
  any tier, so the mail half is untested against a real server — only against a
  stub. That is the first thing to do before this is offered to anybody.

## 2026-09-11 — and the session stops throwing you out mid-afternoon

- The owner's complaint, in his words: *"about the sign to not every time google
  lala bla bla."* Measured rather than guessed — prod runs the default
  `AUTH_SESSION_TTL_MS`, **twelve hours**, fixed at issue time. Sign in at nine,
  get asked for Google again at nine that evening, every day.
- A session that is being USED no longer expires: past halfway through its life,
  any authenticated request re-issues the cookie with a fresh clock. Activity
  keeps you in; absence still signs you out, which is the point.
- Only past halfway (an ordinary page load must not re-sign a cookie on every
  request), only for real session cookies (an API token has none), and never
  once a response has started — a convenience must not become an
  ERR_HTTP_HEADERS_SENT on a streaming route.
- **`GET /api/auth/session` needed it passed in by hand.** That route is
  registered ABOVE the middleware that refreshes everything else, so the one
  endpoint an idle tab actually polls would have been the only one that never
  extended a session. Measured both ways: `/api/spaces` re-signs, and the
  session endpoint did not until it was threaded through.
- **Seen**, against the running server with the TTL turned down to six seconds:
  no `Set-Cookie` at four seconds into a twelve-hour session (correct — still
  fresh), and a new one at four seconds into a six-second session.
- The app's name is `iiii` now, in both manifests — the Android launcher label
  and the web manifest, or a browser install would still have said "Studio chat"
  under the same icon. The mark is unchanged.
- `scripts/build-chat-apk.mjs` is the recipe as one command: it refuses to build
  without the signing key, raises the version code with `--bump` (an APK that
  repeats a code cannot install over the one people have), checks the built APK
  actually carries the version asked for, and `--deliver` copies it to the host
  di.net hands it out from.

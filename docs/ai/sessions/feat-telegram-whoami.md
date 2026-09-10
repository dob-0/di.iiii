## 2026-09-10 — di.bo can finally say which spaces are yours

- `POST /api/auth/telegram/whoami` — bot-only (the same shared secret and the
  same numeric-id refusal as the sign-in link), and a READ. Given a Telegram id
  it answers with that person's own display name and the spaces their account
  already reaches. It mints nothing: there is no token in the response, so there
  is nothing in it to steal.
- Until now the bot could mint a sign-in link and then had no idea what happened
  next. Every answer it gave about "your spaces" was a guess or a question back.
- `bound: false` is a plain 200, not a 404 — "nobody has signed in from this
  chat" is an ordinary true answer, and the bot's reply to it is `/login`.
- An unrestricted account answers `everything: true` with an empty list rather
  than printing the estate into a chat message.
- `findUser` and `listSpaces` are injected, like the session helpers: a route
  that reaches into a module-level database cannot be tested without one.
- **Deliberately stops here.** A lookup is not a login. Any WRITE from a chat —
  the owner's "everyone registered can work on their spaces" — needs its own
  decision about scope, audit and what a bot may never do, not this endpoint
  quietly growing one.

## 2026-09-13 — programs sign the guest book: /for-apps, llms.txt, and a bouncer for anonymous scripts

- The owner's ask: "if someone searches about di.iiii — some app or AI — they will also fill the mail, so we know who reaches us, and protect us." Modelled on MusicBrainz's etiquette: a program names itself and a contact in its User-Agent.
- Door sign: `/for-apps` (React page on the legal shell, reserved segment — `/serverXR/api/spaces/for-apps` 404s on prod and staging), `public/llms.txt` (nginx gets an exact-match block like robots.txt), and robots.txt now says in words that every crawler, AI training included, is welcome. No Disallow added.
- Guest book: `serverXR/src/appVisitors.js` sorts every request that reaches the router into browser / crawler / app / anonymous; `appVisitorStore.js` keeps daily aggregates only (no IP, no URL), buffered and flushed every 30 s, 500 names a day, 90 days. Ops Graph → Visitors lists them with a block toggle.
- Bouncer: API reads (GET/HEAD) from anonymous programs get 30 a minute per address, identified apps and crawlers 300; browsers and signed-in callers (session, token, sync key) untouched. The 429 carries a `hint` on how to identify (new optional `hint` on `createRateLimiter`; every existing limiter's body is unchanged). Blocked names get 403 pointing at /for-apps.
- Skipped entirely on `di up` (`DI_LOCAL=1`) and for loopback callers with no X-Forwarded-For (healthcheck, contract tests).
- The User-Agent is honour-system: it can be faked, so this is courtesy and a list, not a wall. The per-address limiters stay the real floor.
- Not covered: routes registered before the auth-state middleware (`/api/auth/*`, password sign-in, logout) are counted but not bounced — they already carry their own limiters.

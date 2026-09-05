## 2026-09-06 — the Telegram secret reaches the container

- PR #282 added `TELEGRAM_LOGIN_SECRET` and `TELEGRAM_BOT_USERNAME` to `.env.example` but
  not to either compose file, so a value written to the host `.env` never entered the
  server container and `/api/auth/providers` kept answering `telegram:false`. Found when
  the owner set the secret on prod and nothing changed. Both compose files now pass the
  pair through; staging reads `STAGING_TELEGRAM_*`, a separate bot and secret by design.
- `docker compose up -d server` only recreates when the compose config changes, so the
  deploy workflow's own `up -d` after this lands is what applies it.

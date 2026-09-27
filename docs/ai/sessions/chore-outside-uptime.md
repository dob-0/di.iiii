## 2026-09-27 — an uptime check from outside the building that serves the site

- New `.github/workflows/uptime.yml`: every 10 min GitHub's runners open the front page and
  `/serverXR/api/health` on both public names (health must answer JSON — a bare `/api` path answers the
  app's HTML with 200, a false green). Three tries over ~90 s per address, so a line blip is not an outage.
- Alerts only on a change of state (previous state = the previous scheduled run's conclusion), to
  Telegram when `UPTIME_TELEGRAM_TOKEN` + `UPTIME_TELEGRAM_CHAT` secrets are set; a failed run also sends
  GitHub's own failure email. Without the secrets it warns and relies on the email.
- Why: the watcher on the serving machine goes dark with that machine or its line and can never report it.
- Tested locally: the probe step read all three addresses up; pointed at `/api/health` it reported DOWN
  (200 text/html) and wrote `state=down`. Not yet run on GitHub — first real run after merge.

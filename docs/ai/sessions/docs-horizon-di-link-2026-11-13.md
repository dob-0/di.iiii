## 2026-11-13 — Horizon: di link (a machine joins through di.iiii and is reachable)

- New `docs/roadmaps/HORIZON_di_link.md`: the first "horizon" (a platform layer written ahead of its build). Goal: one login through di.iiii, then the machine is in the Monitor, reachable by ssh, viewable, and synced.
- Advised pick: di issues a tagged, expiring Tailscale key at the four-word join; runner-up Headscale with di as sign-in. Docs only, no code.
- Owed: the tailnet plan limits (devices, tags, key lifetime) are unchecked; step 1 (show status over di) waits on where the door's status is read from.

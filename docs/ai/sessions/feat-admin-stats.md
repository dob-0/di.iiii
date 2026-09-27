## 2026-09-28 — an admin can see the site's own traffic

- Ops Graph → Manage → Traffic reads GET /api/stats: 30-day views, sign-ups, busiest day (UTC), top pages,
  referrers. Walked against real page_events on a test stack; numbers match the table.

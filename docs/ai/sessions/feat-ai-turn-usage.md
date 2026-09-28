## 2026-09-28 — an agent's chat comes back on reload, and shows what each answer cost

- Found while adding the token line: an agent node's chat opened empty after every reload (the load was
  skipped by a guard meant for new chats). Fixed, and made robust to an interrupted load (StrictMode).
- Each paid answer shows "N in · M out tokens"; a local model's answer shows nothing. Walked on a seeded chat.

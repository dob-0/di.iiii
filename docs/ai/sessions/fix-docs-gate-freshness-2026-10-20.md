## 2026-10-20 — the CURRENT.md freshness gate runs only where CURRENT.md may be written

- The pre-push docs gate refused every feature branch while dev's `CURRENT.md` recap was 4 days older than its code: a branch may not touch `CURRENT.md`, so it could never pass (owner ledger N885).
- Freshness now runs on `dev` and fold branches only (`ownsCurrentMdFreshness`); feature branches still must keep dev's `CURRENT.md` unchanged and still need their session note.
- The fold that refreshes dev's recap is a separate PR (chore/fold-notes-after-1025) and still owed.

## 2026-08-07 — five people's personal details come out of the public deck

- `docs/deck/di.ii XR studio_network .pdf` was tracked here, on `main` and `dev`, and
  downloadable from `raw.githubusercontent.com` (verified, HTTP 200). Its pages 85–89
  are CV pages for **five named people** — Gevorg, Emilya, Syuzanna, Taron, Yeva —
  each carrying a **date of birth, a personal mobile number, a personal email address
  and a photograph**. Found while reading the deck to identify a di.iiii admin account
  nobody had written down.
- No scan would ever have caught it. The repo has no tracked credentials and the
  secret scan looks for secrets; this is not a secret, it is somebody's phone number.
  A deck is a document you hand to a specific person, and four of the five did not
  choose to publish theirs.
- **What changed here:** the public copy is now the same deck with pages 85–89 removed
  — 90 pages instead of 95. The complete file moved to the private `di.iiii-ops`
  (`deck/`), whose README carries the regeneration command and the verification.
  `docs/deck/README.md` says which build this is and adds "anyone's personal data" to
  the do-not-put-here list, because portfolio material arrives with contact details
  baked in and this folder is world-readable under AGPL.
- Verified by **text, not page count**: `gs -sDEVICE=txtwrite` over the new build finds
  zero hits for all five phone numbers, all five emails, all five dates of birth and
  the string "Date of birth" — and the same search over the original finds them, so the
  check can actually fail. The seam (page 84 divider → 85 network list) was looked at.
- **This does NOT undo the disclosure, and nobody should read it as if it does.**
  `git rm` removes a file from `HEAD` and from nothing else. The full deck remains in
  this repo's history, and — the part that makes a history rewrite insufficient on its
  own — **in two public forks**, `emilyanikoghosyan/di.iiii` and `normal22194/di.iiii`,
  both of which served the PDF when checked. Forks are separate repositories; a
  force-push here reaches neither.
- **Still to do, deliberately not done here:** tell the four people whose details these
  are; ask the two fork owners to clean or delete their forks; then, and only then,
  consider a history rewrite with GitHub Support in the loop (their cached blob views
  survive a force-push and need a support request quoting the SHAs). A rewrite today
  would also invalidate 10 open PRs and 25 remote branches with several sessions
  actively pushing — real disruption, and the data would still be at two URLs.
- A full mirror backup of the public repo was taken first:
  `/home/nooo/di-backups/di.iiii-mirror-20260807.git` — 1204 commits, 145 refs, 450 MB,
  deck confirmed present in it.

# chore/deck-forks-record

Follow-up to `chore/deck-privacy`. No code changed here — this note exists because
three lines in CURRENT.md's **Open** section are now false, and a stale Open line is
worse than a missing one: an agent reads it and redoes finished work.

## Corrections to CURRENT.md → Open (verified today, not assumed)

- **"8 prod spaces still ownerless"** — they are all owned. Queried prod with
  `PROD_API_TOKEN`: `main`, `open`, `azd`, `algovrithm`, `br-id-ge`,
  `platform-recordar` → `33d8ad04-…` (Gevorg, GitHub account); `wcc`, `beyond-form`
  → `f2d566f6-…` (Emilya). Matches what the user chose. The second half of that
  line still stands: releasing ownership does **not** revoke the scope grant it
  created, which is deliberate — losing a space shouldn't lock you out of it.
- **"Mesh gate INERT in prod"** — armed and verified on both tiers by a parallel
  session today. The robot's own client secret is still unset, so the keeper half
  is not finished; the gate itself is.
- **"leaked GitHub PAT + staging Google OAuth secret still live"** — the classic PAT
  is inferred-closed (its prefix matches nothing stored on any machine, and the only
  classic tokens GitHub still listed were two expired ones, since deleted). The
  staging Google OAuth secret is the one item genuinely still owed, and the user
  explicitly parked it today.

## The deck exposure — where it actually stands

The public repo is clean on **both** `dev` and `main`, verified against what GitHub
serves rather than against the working tree: 16.6 MB CV-free build, zero hits for
date-of-birth / cell phone / gmail in the extracted text.

What is **not** clean, and is the part worth carrying forward:

> A fork is a separate repository, and the file sits on **every branch** of it.

`emilyanikoghosyan/di.iiii` serves the original 68 MB deck on all ten of its
branches; `normal22194/di.iiii` on both of its. Nothing done upstream — including a
history rewrite — reaches either. This is why "clean the fork instead of deleting
it" is advice nobody should follow, and why the rewrite stays queued behind fork
cleanup rather than in front of it.

Order of operations, unchanged: both forks cleaned → quiet window in branch traffic
→ GitHub Support with the blob SHAs, because a force-push does not purge their
cached views. Doing the rewrite first achieves nothing and invalidates every open
PR and remote branch in flight.

## Owed to people, not to code

Emilya has been approached (she owns a fork, so the thread had a reason to exist).
**Syuzanna, Taron and Yeva have not been told** their date of birth, personal
mobile, personal email and photograph were publicly downloadable for about seven
weeks. They own no repo, so no cleanup task will ever surface them — they have to
be raised deliberately or they get skipped.

Record of what was sent and to whom: `di.iiii-ops/deck/fork-owner-messages.md`.

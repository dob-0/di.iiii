# Decision — the share door (2026-10-21)

## Context

Owner (N1171, N1171.2): posting should happen from the chat, not by hand on each network — "max auto like we check here and post".
Until now only Telegram (di.bo) and Instagram by hand existed.

## Decision

A **feature of di.iiii**, not a script: `serverXR/src/share/` (store, channel contract, adapters), admin-gated routes, a preview
page, and `di post`. Phase 1 channels: Telegram channel, Bluesky, Mastodon.

- **Why a feature:** owner rule "nothing is left behind" — a posting script written for one show dies with it; a door with a
  contract is reused by every space and every later agent, and a new channel is one file (publishing.md).
- **Why the door has a preview and an approval:** posts are outward-facing and cannot be unsent. Draft → his word → send is the
  existing rule for outward actions; the page shows what each channel will really show.
- **Why tokens come from the environment, on the Mac:** the always-on machine holds every credential (rule "every credit on
  hand"); a token in the database or a repo is a leak. `status()` says connected / missing and never prints a value; errors are redacted.
- **Why these three first:** each has a documented, free, token-based API with no app review. Telegram is already ours (di.bo).
- **Retry rule:** a result per channel is kept; a retry sends only channels that have not posted (no double posts). Mastodon also
  gets an `Idempotency-Key`.

## Phase 2 (not built, owed)

- Instagram and Threads: a Meta app + review, business account, container/publish flow, public media URLs.
- YouTube: Data API `videos.insert`, OAuth consent and quota audit.
- Video on Bluesky (video upload service flow); edit of a draft over HTTP (the store supports it); scheduling.
- A Studio/space-bar control for the same door (data in the space, per rule 1 of "nothing is left behind").
- The first real send per channel (needs the owner's tokens in the Mac's environment).

## Limits

Verified only against a fake server (see publishing.md "Not tested here").

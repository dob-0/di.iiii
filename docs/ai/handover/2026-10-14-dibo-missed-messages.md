# di.bo did not save the owner's texts (ledger N650) — findings, stopped early (aylmo power-off 15:40)

## Root cause: FOUND (in code, live build confirmed)
- The Mac runs di-bo e0c5113 (/usr/local/di-bo/deploy/current.provenance, verified 2026-10-02). bot.mjs/lib/ are byte-identical between e0c5113 and origin/master b47ed68.
- bot.mjs handleUpdate (door, KEEP_FILES=1): only messages that carry a FILE are saved (`keepsThis` requires `fileOf(msg)`). An owner TEXT on the door goes to: command? no → relayAllowed? no (relay is on the console) → publicAskAllowed excludes the owner → the "I keep the field from here — the relay is not on this door" nudge, at most once an hour, and the text is DROPPED. Nothing is written anywhere except observe.jsonl.
- Evidence on 10-14 10:57Z: the bot sent that nudge, which only fires on an owner private text, so the texts WERE received (rules out "never delivered by Telegram / poll down"; log shows only one getUpdates Bad Gateway at 01:11Z that day). manifest.jsonl n=126 holds only video_note-1082.
- Second defect: `edited_message` updates are never handled (`msg = u.message || u.channel_post`) — edits are lost too.
- Third defect: the forward origin is NOT kept for files: manifest n=126 says sender "dob", nothing about "Никита". observe.jsonl records fwd {type, chat_id, message_id} only, no user name/id/date.
- Stickers, locations, contacts, polls are also dropped on the door (fileOf excludes stickers).
- aylmo pull (sync/pull-inbox.sh) rsyncs the whole inbox -rt (excludes only .*.part, *.tmp, *.mismatch-*) and verifies every `saved` manifest line with a path + sha256 — so text files written into the inbox WITH manifest rows will be pulled and verified with no change to the pull.

## Other causes tested
- H: Telegram did not deliver / poll down — RULED OUT (nudge reply proves receipt; log clean at 10:57Z).
- H: a second consumer of the token (conflict) — not seen in the log at that time (no 409 lines in tail); not fully counted.
- H: pull drops texts — n/a (texts never reached the Mac inbox); pull would carry them.

## Counts — OPEN
- /usr/local/var/di-bo/observe.jsonl and state.json are _dibo-only (dir mode denies non); reading them needs the Mac password (sudo is NOPASSWD only for launchctl). So the count of owner text-only messages lost since 09-29 is NOT measured. The fix below recovers and counts them by itself (boot backfill runs as _dibo, KEEP_BACKFILL_HOURS=168 on the Mac → the 10-14 texts are recoverable if deployed before 2026-10-21 10:57Z).

## Fix — designed, NOT written (no code committed)
Branch: fix/keep-every-message in worktree ~/work/di-bo-texts (from origin/master b47ed68), pushed with no commits yet.
1. lib/fetch.mjs: `textOf(msg)` (text / sticker / location / contact / poll / dice / other), `originOf(msg)` (forward_origin: type, name, user id/username, chat title, original date, message id); `keepText(msg,{edited})` writes `<yyyy-mm-dd of sent>/text-<message_id>.txt` (edits `-edit`), 0600 in 0700 dir via freePath+safeName, header (from, forwarded from, sent, message id, reply to) + body, sha256, index entry with `text_key` (chat:mid:m, or chat:mid:e:<sha16> for edits) and a manifest row with status saved, path, sha256, text, fwd, reply_to, edited. `sameFile` and backfill `held` must skip entries with text_key. keep() and record() also carry fwd + reply_to for files.
2. `backfillTextsSince` from observe.jsonl (text rows, edit rows, sticker rows; private; KEEP_FROM senders; commands skipped).
3. keepReply: "saved 1 file + 3 texts" (files-only wording unchanged: ":: got it — saved 3 files.").
4. bot.mjs: `keepsText(msg)`; in handleUpdate save owner/KEEP_FROM texts before the nudge path, non-file non-text kinds in the !msg.text branch, and handle `u.edited_message` (save as edit); keepBackfill also runs the text backfill; observe() fwd gains sender user id/name and date.
5. Tests: extend tests/keep-e2e.test.mjs with the 10-14 shape (forwarded video note + 3 forwarded texts + 1 edit) → 1 file + 3 texts + 1 edit on disk, manifest rows, ONE reply "saved 1 file + 3 texts"; unit tests in lib/fetch.test.mjs.
6. r-di rehearsal: run `node test.mjs` (the e2e is the real bot vs a fake Telegram, no token) on r-di — NOT done.
7. Mac: after merge, di-atlas PIN bump + `tools/dibo-mac-deploy.sh install` (no password needed once root half ran; undo = SHA=e0c5113… install) — NOT done. Note ~/work/di-atlas is another job's checkout (feat/aylmo-android, uncommitted files): use its own worktree.

## State
- Nothing deployed, nothing changed on the Mac, nothing running. PRs: none yet.
- Cost: ~20 tool calls, stopped by the coordinator at the aylmo power-off.
- Sterile: worktree ~/work/di-bo-texts kept (the fix continues there); no processes started.

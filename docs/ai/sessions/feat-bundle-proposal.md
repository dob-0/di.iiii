## 2026-09-17 — a file for an existing space is a proposal: summary, Apply/Reject in the inner bot, restore point first

Phase 2 of "Two lines, one safe way in", the bundle door only.

- **`serverXR/src/contentProposals.js` + `POST /api/spaces/:id/proposals`** (multipart `bundle`;
  fields `mode=auto|propose`, `from`, `dryRun`, `overwriteNewer`). The server reads the `.diiii`
  itself — the server image ships `src/` only, so `scripts/space-bundle.mjs` is not there to spawn
  on dev.diiii.xyz or production (the existing "open a file" routes answer "the bundle tool is not
  part of this build" there today). Tar members with `/` or `..` are refused before unpacking;
  only regular files with asset-id names are copied.
- **Summary** per project (changed/added/unchanged, item counts before → after, what the file's own
  op log did past this space's version, via `spaceHistory.countOp/describeCounts`), projects only
  in the space ("stay as they are"), scene object counts, new files, and what would be
  overwritten: ops newer than the file's `exportedAt` (`summarizeChanges`) **and** a fast-forward
  check — the newest op here must be in the file's history, which catches an edit made after the
  sender pulled but before they exported. Either refuses (409 `target_newer`) unless
  `overwriteNewer`.
- **Trusted** (admin, unrestricted, the owner, own sandbox, or the `isTrustedExtra(state, meta)`
  seam for the per-space trusted list that does not exist yet) → applied now. Everyone else →
  `approvalGate.gateOrApply({ kind: 'content.apply', requireApproval: true, ttlMs })`. New gate
  options: `requireApproval` never takes the "gate off → apply" path (no bot URL/secret = 503,
  never an apply); `ttlMs` per kind (`CONTENT_PROPOSAL_TTL_MS`, default 3 days). The file is kept
  at `<data>/proposals/<sha256>.diiii`; the intent hash binds the sha.
- **Apply** = the restore path, not the import path: `spaceHistory.beforeChange(reason
  'before-proposal-apply')`, blobs/manifests copied only when missing (nothing removed, so the
  restore point's images survive), changed projects through `restoreSpaceProjectDocuments`, scene
  through `replaceSceneAndBroadcast`, live broadcasts. The space row (owner, slug, public, label)
  and project slugs are untouched; versions only go up; ops carry the proposer. Apply refuses if
  the space changed after the proposal was made. Nothing is ever deleted by a proposal.
- **`APPROVAL_CALLBACK_URL`** → `server` on every approval and change notice, so the one console
  answers the right tier (di-bo side: `lib/proposals.mjs`, `DII_SERVERS` allow-list, PR on
  `feat/notices-undo-v2`). Compose now passes `CONTENT_CHANGE_NOTICES_ENABLED` (never passed
  before — setting it in a tier's `.env` did nothing), `APPROVAL_CALLBACK_URL`,
  `CONTENT_PROPOSAL_TTL_MS` (`DEV_*` on the dev tier).
- **CLI:** `node scripts/space-bundle.mjs propose <file> --tier dev [--dry-run] [--from Emilya]
  [--direct] [--overwrite-newer]` (`scripts/space-proposal.mjs`; always a proposal unless
  `--direct`, since the tier tokens are admin).
- Tests: `serverXR/src/proposalContracts.test.js` (real servers, a real exported bundle, fake bot,
  signed decisions: 503 without a bot, dry run + CLI summary, 202 + one bot message with `server`,
  Apply writes docs/new project/bytes and keeps the label + a `before-proposal-apply` point,
  stale file 409, moved-after-proposal Apply refuses, Reject writes nothing, fast-forward 409,
  trusted direct apply, nothing_to_apply). Wiki `space-history` extended.

### Not done

- Nothing is enabled on any tier; the runbook is in the PR body.
- No Studio UI for proposals (the Spaces page "open a file" still refuses an existing id).
- Projects only in the space are never removed by a proposal; a project added by an applied
  proposal is not removed by History → Restore (restore writes documents, it does not delete).
- The per-space trusted list itself (only the seam).

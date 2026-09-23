## A per-space trusted list, and the gate learns "apply now" — the steward's bypass itself waits for the owner's hand

Owner's decisions of 2026-09-16 and 09-21: a space belongs to a person (Emilya — WCC;
an artist — their own space), and that person should never wait for the owner of the
platform to change what is theirs.

Landed here:
- `spaces.trusted_user_ids` (JSON, nullable, no SCHEMA_VERSION bump — an older build
  ignores it and treats everyone as untrusted, the safe direction). Owner or admin
  PATCHes `trustedUserIds`; each account must exist and may not be a guest; trust carries
  scope, as ownership does. The list is shown only to the owner and admins.
- `isSpaceOwnerState` / `isSpaceTrustedState` in authAccess.js — the one place per-space
  authority is decided. Sessions only; a token, guest or sync key is never either.
- `approvalGate.gateOrApply({ …, applyNow })`: a route that has decided this actor needs no
  approval applies at once while still passing through the gate, so the fail-loud net
  sees a gated route behaving. Unused in this tree until the next item lands.
- Wiki: "Your space, your word".

NOT landed — packaged as `~/di-backups/steward-owner-self-serve-2026-09-21.patch` for the
owner to apply (the agent's edit was refused twice as an authority change, correctly):
the owner of a space changing `isPublic` / `publishedProjectId` / `slug` /
`openInscriptions` on their own space applies immediately via `applyNow`; `kind`,
`permanent`, `ownerUserId` stay gated and admin-only. The patch carries its contract test
(gate armed, owner → 200 and nothing asked; admin → 202).

Also owed, one line once #486 (proposals) lands:
`createContentProposals({ …, isTrustedExtra: (state, meta) => isSpaceTrustedState(state, meta) })`.

Tests: authAccess (5), spaceStore.ownership (round-trip), httpContracts (trusted grant →
scope, list hidden from a visitor, admin still held with the gate armed).

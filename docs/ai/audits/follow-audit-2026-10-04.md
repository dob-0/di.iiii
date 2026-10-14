# Follow audit, 2026-10-04

Read-only audit of the follow line (one space on two installs). Base: `origin/fix/follow-wake-after-carry-2026-10-04`
(ae8930a3). No code was changed. Scope: `serverXR/src/follow/*`, the ops and document routes it uses, the sync-key
mint/check, `scripts/di/{follow,follows,share}.mjs`. Spec read: `SPEC_follow.md`, `SPEC_follow_files.md`,
`SPEC_space_sync_keys.md`.

Already known and NOT repeated here: ~20 s park after a carry (fixed on the base), whole-document ops in history stall a
project's follow, empty projects do not travel, deletes / slug renames / visibility / shelf membership / space meta not
carried.

Method and limits. CONFIRMED = shown by a throwaway vitest run against two real serverXR processes (the harness of
`followIntegration.test.js`) or against the pure modules, or an unambiguous code trace with file:line. PLAUSIBLE = the
trace says it can happen but it needs a specific interleaving or an auth-on host to prove. Probes were run once each
(machine at 64 to 78 C, under the 85 C limit); the throwaway test file was deleted, its code is in the appendix. Nothing
was run against `~/.di`, `~/.local/share/di.iiii` or dev.diiii.xyz. Nothing here is a measurement of frequency: it says
whether a thing CAN happen, not how often.

## Summary

| id | severity | status | one line | where |
| --- | --- | --- | --- | --- |
| F1 | HIGH | CONFIRMED (test) | A project id that also exists in ANOTHER local space is wired to the host's project of that id: both ways, private work leaks to the host, host edits land in unrelated work | follower.js:277-289, 375-378 |
| F2 | HIGH | CONFIRMED (test) | A project made (and edited) on the follower never reaches the host; the stream is skipped on every tick, status says "following" | follower.js:263-290, 351-355 |
| F3 | HIGH | CONFIRMED (test) | Batches are capped by count (200), not bytes: two accepted 6 MB edits can never cross together (413), the stream stalls forever and everything behind them with it | followPlan.js:32,72-77; index.js:526; follower.js:183 |
| F4 | HIGH | CONFIRMED (unit) | "Host wins" has no check that the follower is AHEAD: a stale non-empty host overwrites a newer local copy on first follow and on every resume | followConverge.js:87-103; follower.js:219,402 |
| F5 | MEDIUM | CONFIRMED (trace) | `di follow` on an existing local space (e.g. `main`) while the install is stopped skips the "merge" refusal; the host then overwrites that space | follow.mjs:50 |
| F6 | MEDIUM | CONFIRMED (test) | A corrupt or half-written `follows.json` reads as "follows nothing"; the next `di follow` rewrites the file with only the new follow, dropping every other follow and its key. Writes are not temp+rename | follows.mjs:94-112; followStore.js:23-40 |
| F7 | MEDIUM | CONFIRMED (trace) | A converge refusal ("host copy is empty") shows for one tick, then vanishes; the copies stay different and `di follows` says "following" | follower.js:404,478-480 |
| F8 | MEDIUM | CONFIRMED (trace) | A sync key can rename or delete shelves in OTHER spaces on the host: `/api/collections/:id` has no space gate and a scoped key passes the null-space check | index.js:1369-1384; authAccess.js:70-76; projectRoutes.js:501-522 |
| F9 | MEDIUM | PLAUSIBLE | `latestVersion` is read AFTER the ops in the scene ops route; a write in between with an empty read makes the follower's cursor jump over an op, for good | spaceRoutes.js:804-837; followPlan.js:121 |
| F10 | MEDIUM | PLAUSIBLE | Files: each project's document is reconciled once per process; files named only by a converged document (host history older than its window) are never fetched | assets.js:157-161,279-285,315-322 |
| F11 | MEDIUM | PLAUSIBLE | `di follow` accepts a wrong, revoked or missing key on a public space (the check is a read); outbound then fails forever with a bare "401" | share.mjs:163-172 |
| F12 | MEDIUM | PLAUSIBLE | Converge can overwrite a local edit made between the ops read and the document read, and the follower then never converges that edit back | follower.js:333-343,298-322,396-405 |
| F13 | LOW-MED | PLAUSIBLE | Cursors carry no epoch: a host restored from an older backup that then passes the old version number makes the follower skip the overlap | follower.js:362-372 |
| F14 | LOW-MED | PLAUSIBLE | After state loss, the whole retained window of each side is re-sent; the receiver's dedupe covers only its own window, so an old edit can land again over newer ones (the host then wins the converge with the reverted value) | follower.js:199-210; followStore.js:77-84 |
| F15 | LOW | CONFIRMED (test) | `follows.json` is 0600 only when created; an existing 0644 file stays readable, key included | followStore.js:38; follows.mjs:106-110 |
| F16 | LOW | CONFIRMED (trace) | Status lags: `state` is set once per tick and a tick runs every stream in turn (8 s per stream on a blackholed link); `di follows` shows "starting" for the first park, and "waiting" only after the whole sweep | follower.js:446-486,507 |
| F17 | LOW | CONFIRMED (trace) | A failed write is reported as the bare status number (`401`, `413`), not in words | follower.js:183,478; ui.mjs:224 |
| F18 | LOW | PLAUSIBLE | Hostile or odd project ids from a host: `.` and `..` survive `encodeURIComponent` and are dot-normalised by `new URL`; an unbounded project list means one POST per id per tick | follower.js:276-288; streams.js:119-126 |
| F19 | LOW | CONFIRMED (trace) | `di unfollow` (CLI) leaves `follow-state/<space>.json`; the running server's follower may re-save state after the file was removed. A later follow resumes from stale cursors | cli.mjs:1064-1072; followStore.js:57-64 |
| F20 | LOW | PLAUSIBLE | Interrupted transfers leave `follow-*.part` in the uploads dir (no sweep); key sent in clear if `--from` is `http://` to a non-loopback host | assets.js:214-272; follows.mjs |

Checked and found sound (so the next reader need not): the 409 path does not mark ops seen (follower.js:168-181); the
`seen` set is bounded and eviction only costs a pointless resend while the cursor is ahead of the op; per-stream cursors
advance only through accounted ops (followPlan.js:115-122); state file is written temp+rename (followStore.js:86-92);
the sync key is scoped to one space on the host for all project and space routes (index.js:1778-1795 sets
`requiredSpaceId` from the project's space), cannot mint keys (index.js:2137-2150), is stored as sha256 with a constant
time compare and fail-closed expiry (syncKeyStore.js:56-78), and cascades on space delete (db.js:96-107). httpClient
does not follow redirects, so the key is not forwarded to another host. SSRF: `--from` is typed by the person at the
machine, and `follows.json` is not writable through any route; no finding. Asset ids are sha256-validated before they
reach a path, bytes are hashed before offer and again by the hash-pinned PUT.

---

## F1  HIGH, CONFIRMED. Same project id, different space: cross-wired both ways

What happens. Project ids are global per install. `refreshStreams` (follower.js:263-290) lists the projects of the
followed space on both sides, tries to create a missing one locally, treats a 409 ("that slug exists") as fine
(follower.js:285), and then builds a stream for every id in the union (streams.js:150-153). The stream URL is
`/api/projects/<id>/ops`, a route that knows the id and nothing about the space. If the id already exists here in
ANOTHER space, the 409 is swallowed and the follower carries ops between the host's project and this install's
unrelated project. The local calls use the internal token, which is not confined to a space, so nothing refuses.
Generic slugs (`notes`, `untitled`, `main`) make this a realistic collision, not only a hostile one. The same id also
feeds the file chase (assets.js uses `projectId` for every download and PUT), so files move too.

Evidence. Test F-B in the appendix: follower has space `other-space` with project `notes` containing entity
`secret-local`; host has project `notes` in the followed space containing `from-host`. After a 8 s follow:
`local other-space notes entities [ 'secret-local', 'from-host' ]`, `host notes entities [ 'from-host', 'secret-local' ]`.
Private local work reached the host, and host work landed in an unrelated local project.

Suggested fix. After the create attempt, a 409 must be checked: `GET /api/projects/<id>/meta` (or the space project
list) on the local side and only keep the stream if that project's `spaceId` is the followed space; otherwise log it and
drop the stream. Also validate every id with the local project-id normaliser (see F18).

Guard test. F-B, inverted: the follower's `notes` in `other-space` must stay exactly as it was and the host must not
receive `secret-local`; and `di follows` must say which id was refused.

## F2  HIGH, CONFIRMED. A project made on the follower never reaches the host

What happens. `refreshStreams` only creates projects on the LOCAL side (follower.js:277-288). A project that exists
only here gets a stream, the remote read of it answers 404, and `runStream` treats that as `skipped`
(follower.js:353-355), silently, on every tick. The spec ("a project made on either appears on both") and the code
comment at follower.js:272 say otherwise. This is separate from the known "empty projects do not travel": here the
project has content and edits, and none of it travels. For the owner's rule (local install and dev stay one) this is
the main gap: anything made locally in a project that dev has not seen stays local.

Evidence. Test F-A: project `made-here` created and edited on the follower; after 6 s of follow the host answers 404
for `/api/projects/made-here/document`, and the follower reports `status: starting` / no error (and stays "following" in
later ticks since `skipped` streams are dropped from the result, follower.js:455).

Suggested fix. Mirror the creation: when a project exists locally and the remote list lacks it, POST it to the remote
(born private if private here, tolerate 409 with the F1 ownership check), then carry its ops. Count `skipped` streams
and say "N projects not on the other side" in `lastError` until they exist.

Guard test. F-A inverted, plus a state assertion that a persistently skipped stream is visible in `di follows`.

## F3  HIGH, CONFIRMED. Byte-blind batches stall a stream forever (413)

What happens. `BATCH = 200` ops (followPlan.js:32,72-77) with no byte limit; the receiving server caps a JSON body at
10 MB (index.js:526). Each op was accepted alone by the host (each request under 10 MB) but two of 6 MB cannot go in
one POST. `carry` returns `failed: 413` (follower.js:183); nothing marks the ops seen, the cursor does not move
(followPlan.js:115-122), so the identical batch is retried every tick for ever and every op behind it in that stream
waits. A single op over 10 MB is unreachable by any batch size. Realistic carriers: a text node with pasted content, an
inline data URL, a large mapping or timeline payload.

Evidence. Test F-C: two `addObject` ops with 6 MB names written on the host; follower after 25 s holds neither,
`state.status = waiting`, `lastError = 413`. Unit F-batch: `planDirection` builds a 12 MB body from three 4 MB ops.

Suggested fix. Split a batch by serialised size (target about 4 MB), carry at least one op per batch, and for a single
op that still gets 413 mark it seen, count it as `refused: too large`, and say so in `di follows`, so one op cannot
block a stream.

Guard test. F-C and F-batch inverted (the second op arrives; a single 11 MB op is reported, not retried for ever).

## F4  HIGH, CONFIRMED. Host wins even when the follower is ahead

What happens. `planConverge` refuses only one case: empty host and non-empty follower (followConverge.js:95). Any other
difference becomes a `replaceDocument` / `replaceScene` of the host's copy over the local one. `moves` starts as
`{in:true, out:true}` (follower.js:219), so on the FIRST quiet tick after every start the copies are compared. Work
that exists only in the local document, because it came through a whole-document write (a restore, `di sync`, a PUT),
or whose ops are older than the host's retained window, is not carried (whole-work ops are refused, followPlan.js:48)
and is then erased by the converge. A restore point is taken (route-side `beforeChange`), so it is recoverable by
hand, but nothing tells the person; the log line is `info`. If the owner's local install is the more current one and dev
is stale (the exact situation after a night on a train), starting the follow makes dev win.

Evidence. Unit F-converge: local has three entities, host (older version) one; `planConverge` returns a
`replaceDocument` carrying the host's one-entity document.

Suggested fix. Compare ahead/behind before overwriting: refuse (say it out loud) when the local document contains
entities, nodes or assets the host lacks AND the local version is greater than the version last agreed with the host
(persist that per stream). Offer the explicit direction (`di follow --take-mine`) rather than silently choosing. At
minimum raise the log to `warn` and put it in `lastError`.

Guard test. F-converge as an integration test: local newer content from a PUT survives a follow start, and the refusal
is visible.

## F5  MEDIUM, CONFIRMED (trace). The merge refusal only exists while the install runs

follow.mjs:50 guards `localSpaceExists` with `running &&`. With the install stopped, `di follow main --from <host>`
writes the follow without the "merge" refusal and without `--into`. On the next start `ensureSpace` leaves the existing
space alone and the follower converges it to the host's copy (F4). The same blind spot skips the "follows itself" check
(follow.mjs:40). Fix: when the install is not running, look at `<data>/spaces/<id>` (or require `--into`), and refuse the
same way. Guard: a CLI test that `followSpace` with `running=false` and an existing space dir returns `merge`.

## F6  MEDIUM, CONFIRMED (test). One bad write of follows.json drops every follow and its key

`writeFollows` uses `writeFile` straight onto the target (follows.mjs:104-112, followStore.js:35-40), not temp+rename,
while the follow-state file next to it does it properly (followStore.js:86-92). A crash or power cut mid-write leaves a
truncated file; `readFollows` swallows the parse error and returns `{}` (follows.mjs:94-102, followStore.js:23-33), so
the install follows nothing, silently. Worse, the next `di follow` reads `{}`, adds one entry and writes it, which
destroys the other follows and their sync keys for good (the keys are shown once). Test F-store shows exactly this.
Fix: temp+rename (and fsync) in both writers; on a parse failure rename the bad file to `follows.json.corrupt-<time>`,
refuse to write over it, and say so in `di follows`. Guard: F-store inverted.

## F7  MEDIUM, CONFIRMED (trace). A refused converge disappears from the report

When `planConverge` refuses (host copy empty), `converge` returns `{done:true, refused}` and the caller resets both
move flags (follower.js:404). `convergeRefused` is read from that one tick only (follower.js:464,478-480). On the next
tick no converge runs, `lastError` is null, and `di follows` prints "following" while the two copies differ. Fix: keep
the last refusal in `state` per stream until a converge succeeds; do not reset the flags on `refused`. Guard: refusal
still shown after two further ticks.

## F8  MEDIUM, CONFIRMED (trace). A sync key reaches shelves outside its one space

`requireWriteRole` passes any scoped identity when `requiredSpaceId` is null (index.js:1378-1384 with
authAccess.js:70-76: no space means allowed). `PATCH` and `DELETE /api/collections/:collectionId`
(projectRoutes.js:501-522) have no `:spaceId` or `:projectId`, no middleware sets `requiredSpaceId` for them, and the
handler checks only `ensureSpaceWritable`. So a leaked sync key for space A (editor) can rename or delete a shelf in
space B when it knows or reads the shelf id (public spaces list them). Deleting a shelf loosens its projects, so work
is not destroyed, but the spec's claim "scoped to exactly ONE space" is false for this route. Not proven against an
auth-on server in this audit (the harness runs auth off): treat as CONFIRMED by trace, with a run still owed. Fix: add
a `router.use('/api/collections/:collectionId')` gate that resolves the shelf's space into `requiredSpaceId`, like
`/api/projects/:projectId`; then sweep every non-`:spaceId` write route for the same hole. Guard: a contract test that a
sync key of space A gets 403 on a shelf of space B.

## F9  MEDIUM, PLAUSIBLE. A cursor can jump over an op

`GET /api/spaces/:id/ops` reads the ops (spaceRoutes.js:804) and then, separately, the version (spaceRoutes.js:807 and
again at :833 after a wake). A write that lands between the two reads makes `latestVersion` newer than the ops
returned. When the ops list was empty the follower sets its cursor to `latestVersion` (followPlan.js:121:
`ops.length ? ... : fallback`), so the op that landed in the gap is never read, by either side. The follower reads its
OWN log the same way, so a person's edit at that instant is never carried out. The window is microseconds per read, so
rare; the cost is a permanent silent divergence that the converge only repairs if both sides are flagged moved
(restart sets both). The project route is the safe way round (it uses the version read before the ops,
projectRoutes.js:685,705, except in its wait branch at :701). Fix: read the version first or inside one lock, and
return it with the ops from one snapshot; a follower should only trust `latestVersion` as a cursor when it equals the
last op's version. Guard: a unit test where the route's ops and version come from different moments, cursor stays put.

## F10  MEDIUM, PLAUSIBLE. A file named only by a converged document is never fetched

The chase learns names from ops (`noteOps`, assets.js:148-154: only `upsertAsset` / `deleteAsset`) and from each
project's document ONCE per process (`reconciled`, assets.js:157-161,315-322). When the follower was away longer than
the host's retained window, the missing `upsertAsset` ops are gone; the converge brings in the host's document naming
the files, but the project is already `reconciled`, so nothing asks for the bytes: a dead frame with no word. A
restart repairs it. Fix: after a converge that changed a project, clear it from `reconciled`. Guard: assets test where a
document names a file with no op.

## F11  MEDIUM, PLAUSIBLE. A dead key is accepted on a public space

`checkFollowable` (share.mjs:163-172) proves the key with `GET .../ops?since=0` and treats 200 as good. On a public
space a read needs no key, and an invalid `dii_sync_...` token resolves to "unauthenticated" (index.js:769-780), so the
check passes. The follow is written; inbound works; every outbound write is 401 and is shown as `401` (F17). Fix: probe
the write path with a request that must fail on auth before anything else, e.g. a POST of one op with a deliberately
stale `baseVersion` (401/403 means refused, 409 means the key works). Not run (needs an auth-on host). Guard: CLI test
with a bogus key on a public space returns `denied`.

## F12  MEDIUM, PLAUSIBLE. Converge can erase a local edit and then not heal it

Order inside a tick: read our ops (follower.js:333), park on theirs, carry, then `converge` reads both documents
(follower.js:299-302). A local edit committed after the ops read but before the document read is in the local document,
not yet carried, and `quiet` was decided without it. The documents differ, so the host's copy is written over ours;
the edit's op is then carried out next tick and applied on the host. The follower's document no longer has the edit,
the host has it. Because the flags were reset by that converge (follower.js:404) and `in` is only set by an inbound
write, the next converge never runs: the two copies stay different until a restart. Fix: take the document read and the
`ours` version in one step and skip the converge if `ours.latestVersion` changed since the ops read; do not reset the
flags unless the compared versions are the ones just carried. Guard: an edit injected between the two reads (the harness
`io` seam).

## F13  LOW-MED, PLAUSIBLE. No epoch on cursors

The follower detects a rebuilt log only when its cursor is greater than the log's latest version
(follower.js:362-372). A host restored from an older backup that then makes more edits than the gap passes the old
cursor again, and the overlap (its new ops 701 to 900 in the example) is skipped, no error. Versions are per install
counters with no identity. Fix: the host's ops answer carries a log epoch (random id minted when the log is created or
restored); the follower stores it with the cursor and resets on a change. Guard: restore the host from an old copy,
edit past the cursor, assert all ops arrive.

## F14  LOW-MED, PLAUSIBLE. State loss re-sends whole windows with no age guard

`readFollowState` returns null on any read or format problem (followStore.js:77-84) and the follower starts with empty
cursors and an empty `seen` (follower.js:199-210). Every op in both retained windows (500 per stream) is then offered
to the other side. The receiver only recognises opIds inside ITS window (projectRoutes.js:774,
spaceRoutes.js:901), so an edit that fell out of the receiver's window but is still in the sender's is applied
again over newer values; the converge then makes the follower agree with the host, which holds the reverted value.
Reachable by: deleting `follow-state/`, restoring a data dir from backup without it, or the server-side `removeFollow`
followed by a new follow. The spec says "an old edit is never re-sent past the receiver's 500-op dedupe window"; that
is true only while the state survives. Fix: when state is missing, do not replay; start both cursors at the current
latest versions and let the converge (F4 rules) bring the copies together. Guard: follow, carry 600 ops, delete the
state, restart, assert no op count changes.

## F15  LOW, CONFIRMED (test). Token file mode is only set at creation

`writeFile(..., { mode: 0o600 })` (followStore.js:38, follows.mjs:106-110) applies the mode only when the file is
created. An existing `follows.json` at 0644 (from a copy, a restore, an editor) keeps it, and every later write leaves
the sync keys readable by other users. Test F-store shows `644` after an `addFollow`. Fix: `chmod 0600` after every
write (or write temp 0600 then rename, which fixes F6 too) and have `di follows` warn when the mode is looser.

## F16  LOW, CONFIRMED (trace). Status lags and is coarse

`state` is replaced once at the end of a tick (follower.js:473-486) and `onState` is called after it (:507). A tick
visits every stream one after another (:446-465), the last one parks up to 20 s, and a stream on a blackholed link costs
the 8 s read timeout each. `di follows` therefore shows `starting` (seen in the F-A probe at 6 s) until the first park
ends, and on a dead link with N projects reports "waiting" only after about 8 s times N. Also `skipped` streams (F2) and
a failed project list (follower.js:266-269, which falls back to an empty list without a word) never reach the status.
Fix: publish state per stream result, and count skipped and list failures.

## F17  LOW, CONFIRMED (trace). Failures read as numbers

`carry` returns `failed: answer.status || answer.error` (follower.js:183), `lastError` is that value (:478) and
ui.mjs:224 prints it. A person sees `401` or `413` where the follower knows it is "the key was refused" or "this edit
is too large". A sync key also expires after 1 year by default (index.js:2158, `ttlMs`); that day arrives as `401`.
Fix: map status to a sentence (the asset chase already has `whyFromStatus`, assets.js:87-93).

## F18  LOW, PLAUSIBLE. Ids from the other side are not validated

Project ids come from the host's list (streams.js:135-141) and go into URLs through `encodeURIComponent`, which leaves
`.` and `..` untouched; `new URL` (httpClient.js:51) then normalises `/api/projects/../ops` to `/api/ops`. Impact is
small (a read or an unrelated route on the local server with the internal token), but it is path logic driven by a
remote. There is also no cap on the number of ids: a host listing 100 000 projects makes the follower POST 100 000
creates, sequentially, each tick (follower.js:277-288). Fix: validate each id with the local `normalizeProjectId`
and cap the list per tick; log refusals.

## F19  LOW, CONFIRMED (trace). Unfollow and state

The CLI's `removeFollow` (follows.mjs:141-147) removes only the entry; the state file the server wrote stays
(`followStore.removeFollow` removes it, but the CLI does not use it). The running follower keeps ticking for up to 2 s
(the `watchFile` poll, index.js:2850) and `save()` can write the state again after any removal. A later follow of the
same remote resumes from stale cursors and a stale `seen`. Fix: the CLI removes `follow-state/<space>.json`, and the
server removes it after it has stopped the follower, not before.

## F20  LOW, PLAUSIBLE. Leftovers and cleartext

Downloads rest in `follow-<uuid>.part` in the uploads dir and are removed in a `finally` (assets.js:214-272); a killed
process leaves them and nothing sweeps them. And nothing stops `--from http://host` for a non-loopback host, so the
sync key and the ops travel in clear; say so in the CLI, or refuse unless `--insecure`.

---

## Ranking by harm to the owner's work

1. F2 and F1 (the two directions of "projects are one": local projects never go up; a same-id project is joined to
   the wrong work, with a leak of private local work to dev).
2. F4 and F5 (who wins on first contact; the safest-looking command can overwrite a space).
3. F3 (a single large edit freezes a project's follow with only a number to say why).
4. F6 (loses every follow and key) and F8 (a key's reach).
5. F7, F9, F12, F13, F14 (silent divergence or reversion, each needing an interleaving).
6. The rest.

## What is owed

- Runs on an auth-on host: F8, F11 (the harness here runs auth off).
- A run between aylmo and dev.diiii.xyz after fixes; none of this was measured there (the spec already says so).
- F9, F12, F13, F14 each need a controlled interleaving (the harness `io` seam) to move from PLAUSIBLE to CONFIRMED.

## Appendix: the throwaway probes

Kept here, not committed as tests. Harness: copy the `startServer` / `createSpace` helpers from
`serverXR/src/follow/followIntegration.test.js`; run with `npx vitest run <file>` from the repo root.

```js
// units (pure modules)
const { planConverge } = require('./followConverge.js')
const { planDirection } = require('./followPlan.js')
const store = require('./followStore.js')

it('F4: follower ahead of a stale non-empty host is overwritten', () => {
    const local = { version: 9, body: { entities: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], nodes: [], assets: [] } }
    const remote = { version: 3, body: { entities: [{ id: 'a' }], nodes: [], assets: [] } }
    const plan = planConverge({ kind: 'project', projectId: 'p', local, remote })
    expect(plan.op.type).toBe('replaceDocument')
    expect(plan.op.payload.document.entities).toHaveLength(1)
})

it('F3: batch is by count only', () => {
    const big = (i) => ({ opId: `o${i}`, type: 'x', payload: { s: 'x'.repeat(4_000_000) } })
    const plan = planDirection({ ops: [big(1), big(2), big(3)], seen: new Set(), targetVersion: 1 })
    expect(Buffer.byteLength(JSON.stringify(plan))).toBeGreaterThan(10 * 1024 * 1024)
})

it('F6 and F15: corrupt file drops every follow; mode not tightened', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'zz-store-'))
    await store.addFollow(dir, 'one-space', { remote: 'https://a', token: 'dii_sync_x.y' })
    await store.addFollow(dir, 'two-space', { remote: 'https://b', token: 'dii_sync_z.w' })
    const raw = await readFile(store.filePath(dir), 'utf8')
    await writeFile(store.filePath(dir), raw.slice(0, raw.length - 40))       // a crash mid-write
    expect(store.readFollows(dir)).toEqual({})
    await store.addFollow(dir, 'three-space', { remote: 'https://c', token: 'k' })
    expect(Object.keys(store.readFollows(dir))).toEqual(['three-space'])       // one and two are gone, with their keys
    await chmod(store.filePath(dir), 0o644)
    await store.addFollow(dir, 'four-space', { remote: 'https://d', token: 'k' })
    expect(((await stat(store.filePath(dir))).mode & 0o777).toString(8)).toBe('644')
})
```

```js
// two real servers: `host`, `mine`, both with space 'shared-room' (createSpace); api(server, path, method, body) = fetch with the bearer token
const follow = () => startFollowing({
    local: side({ base: mine.baseUrl, spaceId: 'shared-room', token: TOKEN }),
    remote: side({ base: host.baseUrl, spaceId: 'shared-room', token: TOKEN }),
    log: { warn() {}, info() {} }
})

it('F2: a project made on the follower never reaches the host', async () => {
    await api(mine, '/api/spaces/shared-room/projects', 'POST', { slug: 'made-here', title: 'made-here' })
    const v = (await api(mine, '/api/projects/made-here/ops')).body.latestVersion
    await api(mine, '/api/projects/made-here/ops', 'POST', { baseVersion: v, ops: [{ opId: 'op-mh-1', type: 'createEntity', payload: { entity: { id: 'e1', type: 'box' } } }] })
    const f = follow(); await wait(6000); f.stop()
    expect((await api(host, '/api/projects/made-here/document')).status).toBe(404)   // passes today: the bug
})

it('F1: an id in ANOTHER space here is wired to the host project of the same id', async () => {
    await api(mine, '/api/spaces', 'POST', { slug: 'other-space', label: 'o', permanent: true })
    await api(mine, '/api/spaces/other-space/projects', 'POST', { slug: 'notes', title: 'private notes' })
    await api(host, '/api/spaces/shared-room/projects', 'POST', { slug: 'notes', title: 'notes' })
    // one createEntity op on each side ('from-host' on the host, 'secret-local' on mine), then:
    const f = follow(); await wait(8000); f.stop()
    // observed: local other-space notes entities [ 'secret-local', 'from-host' ]
    //           host notes entities              [ 'from-host', 'secret-local' ]
})

it('F3: two 6 MB edits, each accepted by the host, never cross', async () => {
    const op = (i) => ({ opId: `op-big-${i}`, type: 'addObject', payload: { object: { id: `big-${i}`, type: 'box', name: 'x'.repeat(6_000_000) } } })
    for (const i of [1, 2]) {
        const v = (await api(host, '/api/spaces/shared-room/ops')).body.latestVersion
        await api(host, '/api/spaces/shared-room/ops', 'POST', { baseVersion: v, ops: [op(i)] })   // 200 each
    }
    const f = follow(); await wait(25000); const state = f.state; f.stop()
    // observed: follower holds neither op; state.status 'waiting', state.lastError 413
})
```

Results of the single run: the pure-module probes and F1, F2, F3 all behaved as described above (the assertions that
encode the bug passed; F1 printed the two entity lists quoted in the finding; F3 printed `waiting 413`).

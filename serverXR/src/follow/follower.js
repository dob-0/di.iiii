/**
 * A space that lives on two di.iiii at once.
 *
 * One artist hosts the space; another follows it from their own install. Both
 * hold the whole work on their own disk — this is replication, not a viewer —
 * and edits made on either side appear on the other.
 *
 * The transport is the op log over plain HTTP, in both directions, with the
 * receiving server's own opId dedupe as the safety net (see followPlan.js for
 * why that is enough). Socket.IO is deliberately NOT used: its handshake
 * resolves instance tokens only, a per-space sync key is the credential a
 * follower should hold, and a poll that backs off to twice a minute when the
 * room is quiet costs less than a socket that must be kept alive through a
 * venue's wifi.
 *
 * Everything this file does is refusable and repeatable. A follower that
 * cannot reach the other side does nothing and says so; it never invents state,
 * never deletes, and never writes a version it did not read.
 */

const { httpRequest } = require('../httpClient')
const { accountedThrough, moreToCarry, unseen, planDirection, planAfterConflict, nextInterval, refusedWholeWork, WHOLE_WORK_OPS } = require('./followPlan')
const { projectIdsFrom, sceneStream, streamsFor } = require('./streams')
const { createAssetChase } = require('./assets')
const { CONVERGE_CLIENT, DIRECTIONS, describeCounts, planConverge, readDocument } = require('./followConverge')
const { planSettings, readSettings } = require('./followSettings')
const { planProjects } = require('./followProjects')

const FLOOR_MS = 700
// Five seconds, not thirty. A followed space is a room with someone else in
// it: the cost of asking is one small GET, and the cost of not asking is the
// other person waiting half a minute to see what you just did. A local edit
// wakes the loop immediately (see wake()); only the OTHER side's edits ever
// wait this long.
const CEILING_MS = 5000
const TIMEOUT_MS = 8000
// How long the other side may hold our read open. Long enough that a quiet room
// costs almost nothing, short enough that a dropped wifi is noticed and said
// out loud rather than hanging forever.
const WAIT_SECONDS = 20
// How often the space's own settings (label, visibility, front door) are compared.
const SETTINGS_EVERY_MS = 5000
// Enough opIds to cover any batch several times over. Bounded because a room
// runs for days: the set is a courtesy to keep the wire quiet, and the servers'
// own dedupe is the correctness.
const SEEN_LIMIT = 5000

const rememberSeen = (seen, ops = []) => {
    for (const op of ops) {
        if (op?.opId) seen.add(op.opId)
    }
    if (seen.size > SEEN_LIMIT) {
        const excess = seen.size - SEEN_LIMIT
        let dropped = 0
        for (const id of seen) {
            seen.delete(id)
            if (++dropped >= excess) break
        }
    }
}

// Through httpClient (node:http/https), never global fetch: undici's WASM
// parser OOMs under the memory limits of the shared hosting the live site runs
// on, and that bug class has shipped here twice. httpContracts.test.js keeps it
// at zero, and this file is no exception for being new.
const request = async (url, { method = 'GET', token = null, body = null, timeoutMs = TIMEOUT_MS, signal = null, servername = null, address = null } = {}) => {
    const payloadBody = body ? JSON.stringify(body) : null
    try {
        const response = await httpRequest(url, {
            method,
            timeoutMs,
            signal,
            servername,
            address,
            headers: {
                Accept: 'application/json',
                ...(payloadBody ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payloadBody) } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: payloadBody
        })
        return { ok: response.ok, status: response.status, payload: response.json() }
    } catch (error) {
        return { ok: false, status: 0, payload: null, error: String(error?.message || error) }
    }
}

/**
 * One side of a followed space, addressed the same way whether it is across the
 * room or across the internet: a base URL, a space id, and a token.
 */
const side = ({ base, spaceId, token = null, servername = null, address = null }) => ({
    base: String(base || '').replace(/\/$/, ''),
    spaceId,
    token,
    servername,
    // The ADDRESS PIN, from a follow's `address` field (see followStore.js) —
    // the name in `base` stays, the socket goes here instead.
    address,
    url(path) { return `${this.base}${path}` },
    opsUrl(stream, since) {
        const url = this.url(stream.opsPath)
        return since === null || since === undefined ? url : `${url}?since=${encodeURIComponent(since)}`
    },
    writeUrl(stream) { return this.url(stream.writePath) }
})

/**
 * Read the other side's new ops, holding the request open when there are none.
 *
 * `wait` is what makes a followed room feel like one room: instead of asking
 * again in a few seconds, the request parks on the other server and comes back
 * the instant someone there moves something. A server too old to know the
 * parameter simply answers straight away, and the loop falls back to its own
 * timing — so this is an improvement, never a requirement.
 */
const readOps = async (from, stream, since, { waitSeconds = 0, signal = null, mark = null } = {}) => {
    const plain = from.opsUrl(stream, since)
    // `mark`: the space's change mark from the last answer (follow/waiters.js) —
    // the other server ends the wait at once if anything in the space was
    // written since. A server that does not know it ignores it.
    const url = waitSeconds > 0
        ? `${plain}${plain.includes('?') ? '&' : '?'}wait=${waitSeconds}${mark ? `&mark=${encodeURIComponent(mark)}` : ''}`
        : plain
    const answer = await request(url, {
        token: from.token,
        servername: from.servername,
        address: from.address,
        timeoutMs: (waitSeconds ? waitSeconds * 1000 : 0) + TIMEOUT_MS,
        signal
    })
    if (!answer.ok) return { reachable: false, ops: [], latestVersion: null, status: answer.status }
    return {
        reachable: true,
        ops: Array.isArray(answer.payload?.ops) ? answer.payload.ops : [],
        latestVersion: Number.isFinite(answer.payload?.latestVersion) ? answer.payload.latestVersion : null,
        changeMark: typeof answer.payload?.changeMark === 'string' ? answer.payload.changeMark : null
    }
}

/**
 * Carry ops one way. Returns what happened, in the caller's words rather than
 * HTTP's: how many landed, whether the target moved, and whether we are still
 * in step with it.
 */
const carry = async ({ to, stream, ops, seen, targetVersion, send = request }) => {
    const plan = planDirection({ ops, seen, targetVersion })
    if (!plan) return { wrote: 0, targetVersion, moved: false }

    const answer = await send(to.writeUrl(stream), { method: 'POST', token: to.token, servername: to.servername, address: to.address, body: plan })
    if (answer.ok) {
        rememberSeen(seen, plan.ops)
        const newVersion = Number.isFinite(answer.payload?.newVersion) ? answer.payload.newVersion : targetVersion
        // A write that landed but changed nothing (every op already known — the
        // receiving server dedupes by opId) is not movement. Counting it as
        // movement pinned the loop at its floor forever and made `di follows`
        // report work being carried when none was.
        const landed = Array.isArray(answer.payload?.ops) ? answer.payload.ops.length : plan.ops.length
        return {
            wrote: landed,
            targetVersion: newVersion,
            moved: landed > 0,
            // The version of the last op we actually took from the SOURCE. The
            // source cursor may only advance this far: a batch is capped, and
            // advancing to "everything that existed when we read" would skip
            // every op past the cap — permanently, silently, and on the very
            // first tick of a follow with history.
            carriedThrough: plan.ops[plan.ops.length - 1]?.version ?? null
        }
    }

    if (answer.status === 409) {
        // Not an error: the target moved since we read it (someone there just
        // edited). Come back on the next tick with the new floor.
        //
        // The ops in the refusal are the TARGET's own new edits. They must NOT
        // be marked seen here: they have not been carried anywhere yet — they
        // still have to travel the other way. Marking them seen (as this did
        // until 2026-10-01) made the next tick skip them as already carried and
        // move the cursor past them, so an edit made at exactly the wrong
        // moment never reached the other machine. The next tick reads them from
        // the target's log like any other edit.
        const { apply, retryAt } = planAfterConflict(answer.payload)
        return { wrote: 0, targetVersion: retryAt ?? targetVersion, moved: apply.length > 0, caughtUp: apply, carriedThrough: null }
    }

    return { wrote: 0, targetVersion, moved: false, carriedThrough: null, failed: answer.status || answer.error || 'unreachable' }
}

/**
 * Follow one space, both ways, until stopped.
 *
 * `onState` is called after every tick with a plain object a person could read:
 * this is what `di follows` prints and what the interface will show.
 */
// How far back the first pass looks for ops made after the follow started.
const START_LOOKBACK = 200

/**
 * Where a from-now cursor starts on one side: just before the first op stamped
 * at or after `at`, else the latest version. Reads the latest version, then the
 * last START_LOOKBACK ops — never the whole log.
 */
const startCursorAt = async (side, stream, at) => {
    const now = await readOps(side, stream, Number.MAX_SAFE_INTEGER)
    if (!now.reachable || !Number.isFinite(now.latestVersion)) return now
    const recent = await readOps(side, stream, Math.max(0, now.latestVersion - START_LOOKBACK))
    if (!recent.reachable) return recent
    const firstAfter = recent.ops.find(op => Number(op?.timestamp) >= at && Number.isFinite(op?.version))
    return { reachable: true, latestVersion: firstAfter ? Math.min(firstAfter.version - 1, now.latestVersion) : now.latestVersion }
}

// `sameHostFollows(spaceId)`: does this install follow that (local) space from
// the same host as this follow? Only then is a project the host moved between
// the two moved here too (followProjects.js; index.js answers it).
const startFollowing = ({ local, remote, log = console, onState = () => {}, files = {}, saved = null, onSave = null, start = 'now', direction = null, onDirectionDone = null, sameHostFollows = () => false }) => {
    // Where this follower had got to, kept on disk between runs (index.js,
    // followStore.js). Without it a restart forgot both cursors and every opId
    // it had carried, re-read both retained windows and re-sent whatever it no
    // longer recognised — and the receiving server's dedupe only looks inside
    // ITS retained window, so an old edit could be applied a second time over
    // newer ones. Ignored when it belongs to another remote or another space.
    const resume = saved && saved.remote === remote.base && saved.spaceId === local.spaceId ? saved : null
    const seen = new Set(Array.isArray(resume?.seen) ? resume.seen : [])
    // Streams whose copy on the HOST this follow made empty itself (a project
    // that existed only here). Its first comparison fills that copy from this
    // one instead of refusing because the host's copy is empty (gap 5, 2026-10-05).
    // Saved, so a restart between the making and the filling does not forget.
    const seeded = new Set(Array.isArray(resume?.seeded) ? resume.seeded : [])
    // A project's life (followProjects.js): the last state both sides agreed on
    // per project (the base), the ids seen in both trashes, and the ids that
    // left one side's space with no trash row. Saved, so a restart still knows
    // which side changed.
    let projectBase = resume?.projectBase && typeof resume.projectBase === 'object' ? resume.projectBase : null
    let trashedBoth = Array.isArray(resume?.trashedBoth) ? resume.trashedBoth : []
    let departed = resume?.departed && typeof resume.departed === 'object' ? resume.departed : {}
    let projectNotes = []
    let projectsCarried = 0
    const projectSaid = new Set()
    // A stream that starts from now part-way through a follow (a project the
    // host moved into this space and this install moved after it): both copies
    // already hold the same ops, carried under the other space's follow.
    const fromNowAt = new Map()
    // START FROM NOW (audit F4, owner 2026-10-04). A follow with nothing saved
    // used to start both cursors at null, which reads each side's WHOLE log:
    // this install's years of history were replayed onto the host, and the
    // host's onto this one. Now each stream starts at the latest version on both
    // sides and only what happens after is carried; the documents are compared
    // once instead (converge). `start: 'replay'` is the old behaviour, kept only
    // for a follow that is meant to carry a history the other side never saw.
    // Decided once, at the first tick of a follow with nothing saved, and only
    // for a stream that exists on BOTH sides then: a project that is on one
    // side only has history the other side has never seen.
    const fromNow = start !== 'replay' && !resume
    // "Now" is the moment the follow was started, not the moment its first pass
    // reaches a stream: that pass can come seconds later, and an edit made in
    // between used to be folded into the history and never carried (CI,
    // 2026-10-04/05: three PRs, three different integration tests). Both
    // sides are compared with no margin: a margin would replay ops made just
    // BEFORE the start, which is the history a from-now follow must not carry.
    // Installs keep NTP time; an edit made within the two clocks' skew of the
    // start is the one window left (an op carried twice is dropped by its opId).
    const startedAt = Date.now()
    let fromNowPending = null
    // `take-host` / `take-mine`: the person's answer to a refusal, applied to
    // each stream's first comparison and then dropped (onDirectionDone clears it
    // from follows.json). Anything else is no direction.
    let activeDirection = DIRECTIONS.includes(direction) ? direction : null
    const directionDone = new Set()
    // A refusal stays said until that stream is compared again and agrees (F7).
    const refusals = new Map()
    // The files the projects name (follow/assets.js). Its own task, beside the
    // op loop and never inside it: the loop hands it what it read and walks on,
    // so ops keep crossing while a two-gigabyte video is still on its way.
    const chase = createAssetChase({ local, remote, log, ...files })
    let stopped = false
    let interval = FLOOR_MS
    // One cursor pair per stream — the room's own log and every project in it.
    // Keyed by stream, because a project's version counter has nothing to do
    // with the room's, and both have nothing to do with the other machine's.
    const cursors = new Map(Object.entries(resume?.cursors || {}))
    let streams = [sceneStream(local.spaceId)]
    let state = { status: 'starting', carriedIn: 0, carriedOut: 0, streams: 1, lastError: null, lastMoveAt: null, converged: 0, lastConvergeAt: null, resumed: Boolean(resume) }
    // Per stream: has each side moved since the copies were last compared?
    // Copies can only disagree after BOTH sides edited (followConverge.js), so
    // a stream is compared once it is quiet again after both moved — and once
    // at the start, so a follow resumed after a gap checks it agrees.
    const moves = new Map()
    // Streams where a whole-work op sat in a log and the two copies were found
    // to DIFFER — stream key -> why. A whole-work op is never carried
    // (followPlan.js), and the cursor steps past it like any op it has
    // accounted for, so the log stops saying anything about it. What stays is
    // this: the copies are compared again every tick until they agree, and the
    // follow says so out loud for as long as they do not. Nothing is ever
    // overwritten here — that is `di sync`'s job, with a restore point.
    const disagree = new Map()
    const movesFor = (stream) => {
        if (!moves.has(stream.key)) moves.set(stream.key, { in: true, out: true })
        return moves.get(stream.key)
    }
    // Saved only when it changed — a follow that cannot reach the other side
    // writes nothing — and never after stop(), so a stopped follow leaves its
    // directory alone.
    const lifeKey = () => JSON.stringify([projectBase, trashedBoth, departed])
    let lastSaved = JSON.stringify(Object.fromEntries(cursors)) + seen.size + [...seeded].join() + lifeKey()
    const save = () => {
        if (!onSave || stopped) return
        const snapshot = { remote: remote.base, spaceId: local.spaceId, cursors: Object.fromEntries(cursors), seen: [...seen], seeded: [...seeded], projectBase, trashedBoth, departed }
        const key = JSON.stringify(snapshot.cursors) + seen.size + snapshot.seeded.join() + lifeKey()
        if (key === lastSaved) return
        lastSaved = key
        Promise.resolve(onSave(snapshot)).catch((error) => log.warn?.(`[follow] ${local.spaceId}: could not save where it got to (${error?.message || error})`))
    }

    // Woken by this install's own writes, so an edit made here leaves at once
    // instead of waiting out whatever backoff the quiet had earned.
    let wakeNow = null
    // The request currently parked on the other machine, if any — abandoned the
    // moment this install writes something of its own.
    let parking = null
    // A wake is LATCHED, not just fired. Between reading a project's log and
    // parking on the scene's, the loop is neither asleep nor parked — and a
    // wake that arrived then (an edit made here right after something was
    // carried, which is exactly when a person edits) found nothing to end, was
    // dropped, and the edit sat out the whole park behind it. Measured
    // 2026-10-04: 21s. Cleared when a tick starts, because that tick reads
    // every log afresh; set at any point after, it keeps the tick from parking
    // and sends the loop straight round again.
    let woken = false
    // The same latch on the other machine's side: the space's change mark from
    // its last answer (follow/waiters.js). Parking with it means an edit made
    // there after we read the projects ends the park at once, instead of being
    // missed because it landed before we were parked.
    let spaceMark = null
    const sleep = (ms) => new Promise((resolve) => {
        const timer = setTimeout(resolve, ms)
        wakeNow = () => { clearTimeout(timer); wakeNow = null; resolve() }
    })

    const cursorFor = (stream) => cursors.get(stream.key) || { localVersion: null, remoteVersion: null }

    const refusedMake = new Set()

    /** The projects on both sides, so a project made on either appears on both. */
    const refreshStreams = async () => {
        const path = `/api/spaces/${encodeURIComponent(local.spaceId)}/projects`
        const trashPath = `/api/trash?space=${encodeURIComponent(local.spaceId)}`
        const readHere = () => Promise.all([
            request(local.url(path), { token: local.token, servername: local.servername, address: local.address }),
            request(local.url(trashPath), { token: local.token, servername: local.servername, address: local.address })
        ])
        let [[here, hereTrash], [there, thereTrash]] = await Promise.all([readHere(), Promise.all([
            request(remote.url(path), { token: remote.token, servername: remote.servername, address: remote.address }),
            request(remote.url(trashPath), { token: remote.token, servername: remote.servername, address: remote.address })
        ])])
        // A project's trash, restore, rename and visibility (followProjects.js).
        // Guard 2: only when all four lists answered as lists — a list that could
        // not be read is never taken for an empty one.
        if (await carryProjectLife({ here, hereTrash, there, thereTrash })) {
            [here, hereTrash] = await readHere()
        }
        const localProjects = projectIdsFrom(here.payload)
        const remoteProjects = projectIdsFrom(there.payload)
        if (fromNow && fromNowPending === null && here.ok && there.ok) {
            fromNowPending = new Set([sceneStream(local.spaceId).key, ...localProjects.filter(id => remoteProjects.includes(id)).map(id => `project:${id}`)])
        }

        // A project that exists on only one side has to exist on the other
        // before its ops can land — and an EMPTY one has no ops to make it
        // exist, so it is made from the listing, in both directions (seen
        // 2026-10-04: six projects made empty on the follower never reached
        // the host). Made through the receiving server's own route, with the
        // same id: ids are global in di.iiii, so the same project is the same
        // project on both machines. Title as made; born private when private
        // at the source — never public for a moment. Deletions are not carried.
        const makeMissing = async (from, toProjects, toSide, toTrash) => {
            // A project deleted on a side is still in that side's trash, and a
            // create there would take it out again (ensureProject restores a
            // trashed id). Deletion is not carried, so it must not be undone
            // either. A trash that cannot be read makes nothing this tick.
            if (!toTrash.ok) {
                // Said once, never silently: nothing is made there until the trash can be read.
                const unread = `${toSide.base}|trash-unread`
                if (!refusedMake.has(unread)) {
                    refusedMake.add(unread)
                    log.warn?.(`[follow] ${local.spaceId}: cannot read the trash on ${toSide === local ? 'this install' : 'the other di.iiii'} (${toTrash.status || toTrash.error || 'no answer'}) — projects missing there are not made`)
                }
                return
            }
            const trashed = new Set(projectIdsFrom(toTrash.payload))
            const rows = Array.isArray(from.payload?.projects) ? from.payload.projects : []
            for (const projectId of projectIdsFrom(from.payload)) {
                if (toProjects.includes(projectId)) continue
                // Left one side's space with no trash row (moved, or purged):
                // never made again on the other side (guard 4).
                if (departed[projectId]) continue
                if (trashed.has(projectId)) {
                    if (!refusedMake.has(`${toSide.base}|${projectId}|trash`)) {
                        refusedMake.add(`${toSide.base}|${projectId}|trash`)
                        log.warn?.(`[follow] ${local.spaceId}: ${projectId} is in the trash on ${toSide === local ? 'this install' : 'the other di.iiii'} — not re-made`)
                    }
                    continue
                }
                const row = rows.find(candidate => candidate?.id === projectId)
                const title = typeof row?.title === 'string' && row.title.trim() ? row.title.trim() : projectId
                const made = await request(toSide.url(path), {
                    method: 'POST', token: toSide.token, servername: toSide.servername, address: toSide.address,
                    body: { slug: projectId, title, ...(row?.visibility === 'private' ? { visibility: 'private' } : {}) }
                })
                // Made EMPTY on the host from this side's listing: its content has to
                // follow by comparison, whatever ops there are or are not.
                if (made.ok && toSide === remote) seeded.add(`project:${projectId}`)
                // Taken here: ids are global on an install, so the project is here
                // already, in another space. The host moved it into this one.
                if (made.status === 409 && toSide === local) {
                    await moveHere(projectId)
                    continue
                }
                if (made.status === 409 && toSide === remote) {
                    sayProjectOnce(`${projectId}|taken-there`, `${projectId} is here and the host has that id in another space — not made there (a follow cannot move a project on the host)`)
                    continue
                }
                if (!made.ok && made.status !== 409 && !refusedMake.has(`${toSide.base}|${projectId}`)) {
                    // Once, not every tick: a refusal repeats until someone fixes it.
                    refusedMake.add(`${toSide.base}|${projectId}`)
                    log.warn?.(`[follow] ${local.spaceId}: could not make room for ${projectId} (${made.status})`)
                }
            }
        }
        await makeMissing(there, localProjects, local, hereTrash)
        await makeMissing(here, remoteProjects, remote, thereTrash)
        // A departed project's log is not read: the host answers 403 for a
        // project moved to a space the key cannot see, which used to fail the
        // follow on every pass.
        const kept = (id) => !departed[id]
        streams = streamsFor({ spaceId: local.spaceId, localProjects: localProjects.filter(kept), remoteProjects: remoteProjects.filter(kept) })
    }

    /** Said once per distinct thing, in the log; `di follows` carries the current notes. */
    const sayProjectOnce = (key, message) => {
        if (projectSaid.has(key)) return
        projectSaid.add(key)
        log.warn?.(`[follow] ${local.spaceId}: ${message}`)
    }

    const listOf = (answer) => (answer.ok && Array.isArray(answer.payload?.projects) ? answer.payload.projects : null)

    /**
     * Carry what happened TO projects since the base (followProjects.js), each
     * through the receiving install's own route. Returns true when this install
     * changed, so the caller reads its lists again.
     */
    const carryProjectLife = async ({ here, hereTrash, there, thereTrash }) => {
        const lists = { hereLive: listOf(here), hereTrash: listOf(hereTrash), thereLive: listOf(there), thereTrash: listOf(thereTrash) }
        if (Object.values(lists).some(list => list === null)) return false
        // A follow with no base yet (new, or older than this) starts from what is
        // live on both sides now: nothing in the past is read as a change.
        const first = projectBase === null
        const plan = planProjects({
            spaceId: local.spaceId,
            base: projectBase || {},
            trashedBoth,
            departed,
            here: { live: lists.hereLive, trash: lists.hereTrash },
            there: { live: lists.thereLive, trash: lists.thereTrash }
        })
        const nextBase = plan.base
        let changedHere = false
        const keepOld = (id) => {
            if (projectBase?.[id]) nextBase[id] = projectBase[id]
            else delete nextBase[id]
        }
        const send = (to, url, method, body = null) => request(url, { method, token: to.token, servername: to.servername, address: to.address, ...(body ? { body } : {}) })
        const failed = (answer) => `${answer.status || 'no answer'}: ${answer.payload?.error || answer.error || 'refused'}`

        for (const id of plan.restoreHere) {
            const answer = await send(local, local.url(`/api/projects/${encodeURIComponent(id)}/restore`), 'POST')
            if (answer.ok) { changedHere = true; projectsCarried += 1; log.info?.(`[follow] ${local.spaceId}: ${id} was taken out of the host's trash — restored here`) }
            else sayProjectOnce(`${id}|restore|${answer.status}`, `could not restore ${id} here (${failed(answer)})`)
        }
        for (const id of plan.trashHere) {
            // The soft delete: the project goes to this install's trash, with its
            // files and its log, for 30 days. Never a purge.
            const answer = await send(local, local.url(`/api/projects/${encodeURIComponent(id)}`), 'DELETE')
            if (answer.ok) { changedHere = true; projectsCarried += 1; log.info?.(`[follow] ${local.spaceId}: ${id} was trashed on the host — moved to the trash here (restorable)`) }
            else {
                keepOld(id)
                sayProjectOnce(`${id}|trash|${answer.status}`, `could not move ${id} to the trash here (${failed(answer)})`)
            }
        }
        for (const [to, list] of [[local, plan.patchHere], [remote, plan.patchThere]]) {
            for (const { id, patch } of list) {
                const answer = await send(to, to.url(`/api/projects/${encodeURIComponent(id)}`), 'PATCH', patch)
                if (answer.ok) {
                    if (to === local) changedHere = true
                    projectsCarried += 1
                    log.info?.(`[follow] ${local.spaceId}: ${id} — took ${to === local ? "the host's" : "this install's"} ${Object.keys(patch).join(', ')} ${to === local ? 'here' : 'to the host'}`)
                } else {
                    keepOld(id)
                    sayProjectOnce(`${id}|patch|${to.base}|${JSON.stringify(patch)}`, `could not set ${id}'s ${Object.keys(patch).join(', ')} ${to === local ? 'here' : 'on the host'} (${failed(answer)})`)
                }
            }
        }
        if (plan.refused) sayProjectOnce(`refused|${plan.refused}`, plan.refused)
        else projectSaid.forEach(key => { if (key.startsWith('refused|')) projectSaid.delete(key) })
        for (const note of plan.notes) sayProjectOnce(`note|${note}`, note)
        projectNotes = plan.notes
        projectBase = nextBase
        trashedBoth = plan.trashedBoth
        departed = plan.departed
        if (first) log.info?.(`[follow] ${local.spaceId}: ${Object.keys(nextBase).length} projects on both sides — their trash, renames and moves are carried from now`)
        return changedHere
    }

    /**
     * The host has this project in this space; here it is in another. If that
     * other space is followed from the same host, the host moved it (it left
     * there and arrived here), so it moves here the same way, through this
     * install's own move route. Otherwise it is left where it is, and said.
     */
    const moveHere = async (projectId) => {
        const found = await request(local.url(`/api/projects/${encodeURIComponent(projectId)}`), { token: local.token, servername: local.servername, address: local.address })
        const from = found.ok ? found.payload?.project?.spaceId : null
        if (!from || from === local.spaceId) {
            sayProjectOnce(`${projectId}|taken-here`, `could not make room for ${projectId} here (that id is taken on this install)`)
            return
        }
        if (!sameHostFollows(from)) {
            sayProjectOnce(`${projectId}|unfollowed|${from}`, `${projectId} is in this space on the host, and here it is in ${from}, which is not followed from the same host — not moved`)
            return
        }
        const moved = await request(local.url(`/api/projects/${encodeURIComponent(projectId)}/move`), {
            method: 'POST', token: local.token, servername: local.servername, address: local.address, body: { toSpace: local.spaceId }
        })
        if (!moved.ok) {
            // A front door here waits for the host's front door to reach that space.
            sayProjectOnce(`${projectId}|move|${moved.status}|${moved.payload?.code || ''}`, `could not move ${projectId} here from ${from} (${moved.status || 'no answer'}: ${moved.payload?.error || moved.error || 'refused'})`)
            return
        }
        projectsCarried += 1
        // Both copies already hold its ops (carried under the other space's
        // follow): start its log from now, never replay it (the receivers'
        // dedupe window is 500 ops).
        const key = `project:${projectId}`
        cursors.delete(key)
        fromNowAt.set(key, Date.now())
        if (!fromNowPending) fromNowPending = new Set()
        fromNowPending.add(key)
        log.info?.(`[follow] ${local.spaceId}: ${projectId} was moved here from ${from} on the host — moved here the same way`)
    }

    // The space's own settings, host to this install (followSettings.js). Never
    // fails the follow: a refusal is said once, in the log and in `di follows`.
    let settingsAt = 0
    // Set when the other side said its space changed, or a local write woke the
    // loop: look at the settings on the very next pass, whatever the interval.
    let settingsForce = false
    let settingsNotes = []
    let settingsCarried = 0
    const settingsAttempted = new Set()
    const syncSettings = async () => {
        if (!settingsForce && Date.now() - settingsAt < SETTINGS_EVERY_MS) return
        settingsForce = false
        settingsAt = Date.now()
        const path = `/api/spaces/${encodeURIComponent(local.spaceId)}`
        const [there, here, mine] = await Promise.all([
            request(remote.url(path), { token: remote.token, servername: remote.servername, address: remote.address }),
            request(local.url(path), { token: local.token, servername: local.servername, address: local.address }),
            request(local.url(`${path}/projects`), { token: local.token, servername: local.servername, address: local.address })
        ])
        if (!there.ok || !here.ok) return
        const { patch, notes } = planSettings({
            host: readSettings(there.payload),
            local: readSettings(here.payload),
            localProjects: Array.isArray(mine.payload?.projects) ? mine.payload.projects : []
        })
        settingsNotes = notes
        if (!Object.keys(patch).length) return
        // The same change asked twice in a row and refused is said once.
        const attempt = JSON.stringify(patch)
        const answer = await request(local.url(path), { method: 'PATCH', token: local.token, servername: local.servername, address: local.address, body: patch })
        if (answer.ok && answer.status === 200) {
            settingsAttempted.delete(attempt)
            settingsCarried += 1
            log.info?.(`[follow] ${local.spaceId}: took the host's space settings (${Object.keys(patch).join(', ')})`)
            return
        }
        if (!settingsAttempted.has(attempt)) {
            settingsAttempted.add(attempt)
            const why = answer.status === 202 ? 'it waits for approval here' : `${answer.status || 'no answer'}: ${answer.payload?.error || answer.error || 'refused'}`
            log.warn?.(`[follow] ${local.spaceId}: could not take the host's space settings (${Object.keys(patch).join(', ')}) — ${why}`)
        }
        settingsNotes = [...notes, `the host's ${Object.keys(patch).join(', ')} could not be set here`]
    }

    // Both copies of one stream, read and compared (followConverge.js).
    const compare = async (stream, direction = null, { seedHost = false } = {}) => {
        const [here, there] = await Promise.all([
            request(local.url(stream.documentPath), { token: local.token, servername: local.servername, address: local.address }),
            request(remote.url(stream.documentPath), { token: remote.token, servername: remote.servername, address: remote.address })
        ])
        if (!here.ok || !there.ok) return null
        return planConverge({
            kind: stream.kind,
            projectId: stream.projectId || null,
            local: readDocument(stream.kind, here.payload),
            remote: readDocument(stream.kind, there.payload),
            direction,
            seedHost
        })
    }

    /**
     * Make this side agree with the host (followConverge.js): read both copies,
     * and if they differ write the host's over this one through this server's
     * own write route — same version check, same restore point, same broadcast.
     * A 409 means someone here just edited: leave it for the next quiet pass.
     */
    const converge = async (stream) => {
        const plan = await compare(stream, activeDirection, { seedHost: seeded.has(stream.key) })
        if (!plan) return { done: false }
        // Once the host's copy is no longer the empty one this follow made, the
        // ordinary rules apply to it.
        if (!plan.seeded && !plan.refused?.includes('no version')) seeded.delete(stream.key)
        if (plan.same) { refusals.delete(stream.key); return { done: true } }
        if (plan.refused) {
            // Said out loud, once per refusal, naming the work: a refusal that
            // only lived in the next status line is one nobody saw (audit F4/F7).
            const message = `${stream.key}: ${plan.refused}`
            if (refusals.get(stream.key) !== message) {
                log.warn?.(`[follow] ${local.spaceId}: ${message}${plan.localOnly ? ` (${describeCounts(plan.localOnly)} only here)` : ''}. Choose: di follow ${local.spaceId} --take-host (host wins) or --take-mine (this copy wins)`)
            }
            refusals.set(stream.key, message)
            return { done: true, refused: message }
        }
        refusals.delete(stream.key)
        const opId = `${CONVERGE_CLIENT}-${stream.key}-${Date.now().toString(36)}`
        // take-mine writes THIS copy to the host; everything else writes the
        // host's copy here. Either way the receiving server's own write route
        // takes the restore point (spaceHistory.beforeChange) before it changes.
        const target = plan.target === 'remote' ? remote : local
        const answer = await request(target.writeUrl(stream), {
            method: 'POST', token: target.token, servername: target.servername, address: target.address,
            body: { baseVersion: plan.baseVersion, ops: [{ ...plan.op, opId }] }
        })
        if (!answer.ok) return { done: false }
        // Ours, and already the host's state: never carried back.
        rememberSeen(seen, [{ opId }])
        // Come back at once and look again: whatever was said about this stream
        // before the write (a whole-work op, a difference) is true or untrue now.
        woken = true
        if (plan.seeded) {
            seeded.delete(stream.key)
            log.info?.(`[follow] ${local.spaceId}: ${stream.key} existed only here — filled the host's new copy with it`)
        } else if (plan.direction) {
            const restore = await latestRestorePoint(target)
            log.warn?.(`[follow] ${local.spaceId}: ${stream.key} --${plan.direction}: ${plan.target === 'remote' ? 'wrote this copy over the host' : "took the host's copy over this one"}${plan.localOnly ? ` (${describeCounts(plan.localOnly) || 'nothing'} only on this side)` : ''}; restore point on ${plan.target === 'remote' ? 'the host' : 'this install'}: ${restore || 'taken by the write route (id not readable with this key)'}`)
        } else {
            log.info?.(`[follow] ${local.spaceId}: ${stream.key} disagreed with the host — took the host's copy`)
        }
        return { done: true, converged: true }
    }

    /** The newest restore point of the space on one side, for the log — null when this key cannot read them. */
    const latestRestorePoint = async (target) => {
        const answer = await request(target.url(`/api/spaces/${encodeURIComponent(local.spaceId)}/snapshots`), { token: target.token, servername: target.servername, address: target.address })
        const first = Array.isArray(answer.payload?.snapshots) ? answer.payload.snapshots[0] : null
        return answer.ok && first?.id ? String(first.id) : null
    }

    /** Carry one stream, both ways. */
    const runStream = async (stream, { wait = false } = {}) => {
        // First start: begin at the latest version on both sides, replay nothing.
        if (fromNowPending?.has(stream.key) && !cursors.has(stream.key)) {
            const at = fromNowAt.get(stream.key) ?? startedAt
            const [mine, theirsNow] = await Promise.all([
                startCursorAt(local, stream, at),
                startCursorAt(remote, stream, at)
            ])
            if (!mine.reachable || !theirsNow.reachable) {
                const status = !mine.reachable ? mine.status : theirsNow.status
                return status === 404 ? { moved: false, skipped: true } : { moved: false, failed: `could not read where the logs are now (${status || 'no route'})` }
            }
            if (Number.isFinite(mine.latestVersion) && Number.isFinite(theirsNow.latestVersion)) {
                cursors.set(stream.key, { localVersion: mine.latestVersion, remoteVersion: theirsNow.latestVersion })
            }
            fromNowPending.delete(stream.key)
            fromNowAt.delete(stream.key)
        }
        const cursor = cursorFor(stream)

        // OUR side first, always. A read parked on the other machine can be
        // held for twenty seconds, and an edit made here while it is parked
        // would wait out someone else's silence — the one thing the whole
        // design is against. Read ours, then park, and let a local write abort
        // the park (see wake()).
        const ours = await readOps(local, stream, cursor.localVersion)
        const parkable = wait && !woken && ours.reachable && !unseen(ours.ops, seen).length
        parking = parkable ? new AbortController() : null
        const theirs = await readOps(remote, stream, cursor.remoteVersion, {
            waitSeconds: parkable ? WAIT_SECONDS : 0,
            signal: parking?.signal || null,
            mark: parkable ? spaceMark : null
        })
        const abandoned = Boolean(parking?.signal.aborted)
        parking = null
        // Only the stream that parks reads the mark: it is the whole space's.
        // An answer without one (an older server) leaves the last one standing.
        const markBefore = spaceMark
        if (wait && theirs.changeMark) spaceMark = theirs.changeMark
        // A park this install abandoned for its own edit is not the other side
        // failing — say nothing, and let the next tick read everything.
        if (abandoned) return { moved: false, skipped: true }

        // A project one side does not have yet is a 404 on that stream, not a
        // failure of the follow: it will exist on the next pass.
        if (!theirs.reachable) {
            if (theirs.status === 404) return { moved: false, skipped: true }
            return { moved: false, failed: `the other di.iiii is not answering (${theirs.status || 'no route'})` }
        }
        if (!ours.reachable) {
            if (ours.status === 404) return { moved: false, skipped: true }
            return { moved: false, failed: 'this install is not answering its own op log' }
        }

        // A saved cursor past the end of a log means that log started again
        // (a restored or rebuilt install). Read it from its start; the opId
        // dedupe on each side keeps that safe.
        const behind = (at, latest) => Number.isFinite(at) && Number.isFinite(latest) && at > latest
        if (behind(cursor.remoteVersion, theirs.latestVersion) || behind(cursor.localVersion, ours.latestVersion)) {
            cursors.set(stream.key, {
                localVersion: behind(cursor.localVersion, ours.latestVersion) ? null : cursor.localVersion,
                remoteVersion: behind(cursor.remoteVersion, theirs.latestVersion) ? null : cursor.remoteVersion
            })
            return { moved: false, more: true }
        }

        // Any file these ops name is chased separately; this only takes a note.
        if (stream.kind === 'project') chase.noteOps(stream.projectId, [...theirs.ops, ...ours.ops])

        const inbound = await carry({ to: local, stream, ops: theirs.ops, seen, targetVersion: ours.latestVersion })
        const outbound = await carry({ to: remote, stream, ops: ours.ops, seen, targetVersion: theirs.latestVersion })
        // Anything a whole-work op blocked is still accounted for: it was seen,
        // considered, and deliberately left where it is.
        rememberSeen(seen, [...theirs.ops, ...ours.ops].filter(op => WHOLE_WORK_OPS.has(op?.type)))

        // Each cursor advances through the ops that side has ACCOUNTED for —
        // carried now, or already known from carrying them the other way — and
        // stops dead at the first it has not. Advancing further would skip the
        // ops past a capped batch; advancing less would re-read the same ops
        // forever, which is exactly what happened when the cursor only followed
        // what a write had carried.
        const more = moreToCarry(theirs.ops, seen) || moreToCarry(ours.ops, seen)
        cursors.set(stream.key, {
            localVersion: accountedThrough(ours.ops, seen, ours.latestVersion) ?? cursor.localVersion,
            remoteVersion: accountedThrough(theirs.ops, seen, theirs.latestVersion) ?? cursor.remoteVersion
        })

        // A whole-work op was left where it is. If the copies already agree
        // (both sides were given the same replacement, or the follower
        // converged on the host's) there is nothing to report and nothing owed;
        // if they differ, say which work, and keep saying it.
        if (stream.documentPath && (refusedWholeWork(theirs.ops) || refusedWholeWork(ours.ops) || disagree.has(stream.key))) {
            const verdict = await compare(stream)
            if (verdict?.same) disagree.delete(stream.key)
            else if (verdict) disagree.set(stream.key, verdict.refused || 'the two copies differ')
            else if (!disagree.has(stream.key)) disagree.set(stream.key, 'could not read both copies to compare them')
        }

        // Did the copies get a chance to disagree, and are they quiet now?
        const flags = movesFor(stream)
        if (inbound.wrote > 0 || inbound.caughtUp?.length) flags.in = true
        if (outbound.wrote > 0 || outbound.caughtUp?.length) flags.out = true
        const quiet = !more && !inbound.wrote && !outbound.wrote && !inbound.caughtUp?.length && !outbound.caughtUp?.length
            && !unseen(theirs.ops, seen).length && !unseen(ours.ops, seen).length
        let agreed = null
        if (quiet && flags.in && flags.out && stream.documentPath) {
            agreed = await converge(stream)
            if (agreed.done) { flags.in = false; flags.out = false; directionDone.add(stream.key) }
        }

        return {
            // The other side said its space changed since we last looked —
            // something there may still be unread in a project's log.
            changedThere: Boolean(wait && markBefore && theirs.changeMark && theirs.changeMark !== markBefore),
            converged: Boolean(agreed?.converged),
            convergeRefused: agreed?.refused || null,
            moved: inbound.moved || outbound.moved || Boolean(agreed?.converged),
            more,
            carriedIn: inbound.wrote,
            carriedOut: outbound.wrote,
            // A whole-work op sat in the log and was left there deliberately.
            // Said out loud, because silence would look like everything crossed.
            refused: disagree.has(stream.key) ? stream.key : null,
            failed: inbound.failed || outbound.failed || null
        }
    }

    const tick = async () => {
        // Everything from here on is read afresh, so a wake from before now has
        // been answered; one from after this line keeps the tick from parking.
        woken = false
        await refreshStreams()
        await syncSettings().catch(() => {})

        // The files the documents list are looked at NOW, before this tick reads
        // the room's log and parks on the other machine for up to 20 s. They used to
        // be looked at after the park, so a restarted follow on a quiet space
        // owed every unfinished file for 20 s more — and a di restarted twice in
        // that time never got to them (gap 3, di.laser, 2026-10-05).
        chase.noteProjects(streams.filter(stream => stream.kind === 'project').map(stream => stream.projectId))
        chase.run()

        let parked = false
        let changedThere = false
        let moved = false
        let more = false
        let refused = []
        let carriedIn = 0
        let carriedOut = 0
        let failed = null
        let converged = 0
        let convergeRefused = null

        // What `di follows` shows. Built before the room's read parks as well as
        // after it: that read can hold the tick for twenty seconds, and a
        // disagreement found in a project a moment ago must not wait that long
        // to be said — or, once the copies agree, to be unsaid.
        const started = state
        const report = () => {
            state = {
                status: failed ? 'waiting' : (more ? 'catching up' : 'following'),
                carriedIn: started.carriedIn + carriedIn,
                carriedOut: started.carriedOut + carriedOut,
                streams: streams.length,
                lastError: failed
                    || (refusals.size ? `${[...refusals.values()].join('; ')}. Choose: di follow ${local.spaceId} --take-host or --take-mine` : null)
                    || convergeRefused
                    || (refused.length ? `${refused.join(', ')}: one side replaced the whole work and the two copies differ — a follow does not carry that; use di sync` : null),
                lastMoveAt: moved ? Date.now() : started.lastMoveAt,
                converged: started.converged + converged,
                lastConvergeAt: converged ? Date.now() : started.lastConvergeAt,
                resumed: started.resumed,
                settings: { carried: settingsCarried, notes: settingsNotes },
                projects: { carried: projectsCarried, notes: projectNotes }
            }
        }

        // The room's own log parks on the other side (that is what makes a
        // followed room feel like one room); the project logs are asked
        // straight out, so one quiet project cannot hold up the rest.
        // Projects first, the room last: the last stream is the one that parks.
        const ordered = [...streams.slice(1), streams[0]]
        for (const [index, stream] of ordered.entries()) {
            if (stopped) break
            // The room's own log parks on the other side — that is what makes
            // a followed room feel like one room. It is read LAST so the
            // projects, which never park, are already carried when we settle
            // into the wait.
            const willPark = index === ordered.length - 1
            if (willPark) report()
            const result = await runStream(stream, { wait: willPark })
            if (willPark) parked = true
            if (result.skipped) continue
            changedThere = changedThere || result.changedThere
            moved = moved || result.moved
            more = more || result.more
            if (result.refused) refused.push(result.refused)
            carriedIn += result.carriedIn || 0
            carriedOut += result.carriedOut || 0
            failed = failed || result.failed
            if (result.converged) converged += 1
            convergeRefused = convergeRefused || result.convergeRefused || null
        }

        // Every project's document is read once for the files it already
        // named before this follow began; after that the ops say what is new.
        // Kicked, not awaited.
        chase.noteProjects(streams.filter(stream => stream.kind === 'project').map(stream => stream.projectId))
        chase.run()

        report()
        save()
        // The direction was the answer to the FIRST comparison of each stream;
        // once every stream has had one, it is spent (follows.json is cleared,
        // so the next edits sync the ordinary way).
        if (activeDirection && streams.length && streams.every(stream => directionDone.has(stream.key) || !stream.documentPath)) {
            const spent = activeDirection
            activeDirection = null
            Promise.resolve(onDirectionDone?.(spent)).catch((error) => log.warn?.(`[follow] ${local.spaceId}: could not clear --${spent} from follows.json (${error?.message || error})`))
        }
        // Still behind: go round again at once. A capped batch that slept would
        // trickle a long history across at one batch per tick.
        // Woken while this tick ran, or told the other side changed after its
        // projects were read: go round again at once, never into a sleep.
        if (woken || changedThere) settingsForce = true
        return { moved, parked: parked && !more, more, again: woken || changedThere }
    }

    const loop = async () => {
        while (!stopped) {
            let moved = false
            let parked = false
            let again = false
            const startedAt = Date.now()
            try {
                ({ moved, parked, again } = await tick())
            } catch (error) {
                // A follower must never take the server down with it.
                state = { ...state, status: 'waiting', lastError: String(error?.message || error) }
                log.warn?.(`[follow] ${local.spaceId}: ${state.lastError}`)
            }
            onState({ spaceId: local.spaceId, remote: remote.base, ...state, files: chase.files })
            // A tick that PARKED has already done its waiting on the other
            // machine, and came back because something moved there — go round
            // again at once rather than sleeping through the thing we were
            // woken for. The elapsed check keeps a server that answers a park
            // instantly (an old one that ignores `wait`) from becoming a spin.
            const elapsed = Date.now() - startedAt
            interval = again || (parked && elapsed > 200)
                ? 0
                : nextInterval({ moved, current: interval, floor: FLOOR_MS, ceiling: CEILING_MS })
            if (interval > 0) await sleep(interval)
        }
    }

    loop()
    return {
        stop() { stopped = true; chase.stop() },
        wake() {
            interval = FLOOR_MS
            woken = true
            // Both: end the sleep between ticks, AND abandon a read parked on
            // the other machine. Without the second, `di follow`'s own promise —
            // that an edit leaves at once — was true only when the loop happened
            // to be between ticks.
            parking?.abort()
            wakeNow?.()
        },
        get state() { return { spaceId: local.spaceId, remote: remote.base, ...state, files: chase.files } }
    }
}

module.exports = { side, readOps, carry, startFollowing, startCursorAt, FLOOR_MS, CEILING_MS }

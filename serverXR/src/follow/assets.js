/**
 * The files a followed space is made of.
 *
 * The op log carries the WORK — which video hangs on which surface — and an
 * `upsertAsset` op names the file by the sha256 of its bytes. It never carried
 * the bytes. So a video placed on the calling machine arrived on the stage
 * machine as a name with nothing behind it: a dead frame, and no word about why.
 *
 * This is the chase: for every file a project names, ask both machines whether
 * they hold it, and where exactly one does, bring it to the other. Either way
 * round — a file added on the following side has to reach the host too.
 *
 * Rules it keeps:
 *  - PROJECT files only. A space's own scene has no asset op at all, so its
 *    manifest never travels and there is nothing here to chase
 *    (docs/architecture/SPEC_follow_files.md).
 *  - sha256 ids only. A legacy uuid id proves nothing about the bytes behind
 *    it, so it is counted as not carried and said out loud, never guessed at.
 *  - The bytes are checked against their name BEFORE they are offered to the
 *    other machine, and that machine checks again (the hash-pinned PUT in
 *    routes/projectRoutes.js). A file that fails is thrown away and reported.
 *  - One file at a time, through a temp file, never through memory, and never
 *    inside the op loop: ops keep flowing while a 2 GB video crosses.
 *  - An other di.iiii that is not answering is one fact, not one per file: it
 *    is said once, waited out as one, and asked about once per wait (below).
 *  - Through httpClient (node:http), as httpContracts.test.js requires of every file here.
 */

const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const fsp = require('node:fs/promises')
const { httpRequest, httpDownloadToFile, httpUploadFile } = require('../httpClient')
const { failureDelay, FAILURE_FLOOR_MS, FAILURE_CEILING_MS } = require('./followPlan')

const SHA256 = /^[a-f0-9]{64}$/i
const PROBE_TIMEOUT_MS = 8000
// Socket-idle, not whole-transfer: a slow venue uplink may take an hour over a
// big file and that is fine as long as it keeps moving.
const TRANSFER_IDLE_MS = 60_000
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024
const DEFAULT_BACKOFF_MS = [2000, 10_000, 30_000]
// A file that ran out of tries is looked at again after this long — the other
// machine may simply have been switched off for the afternoon.
const DEFAULT_RETRY_FAILED_AFTER_MS = 5 * 60_000
// What the documents list is compared with what each machine can serve again
// this often, for as long as the follow runs (not only once after a start): a
// transfer that was interrupted, or a file lost from one disk, is found and
// carried again instead of being owed in silence (gap 3, 2026-10-05, di.laser).
const DEFAULT_RECONCILE_EVERY_MS = 10 * 60_000
// A .part a killed install left behind (the `finally` that removes it does not
// run on a kill). Another follower in the same process may own a younger one.
const STALE_PART_MS = 60 * 60_000

// THE OTHER DI.IIII AS A WHOLE. When it stops answering — switched off, the
// link down, or a tunnel in front of it answering in its place — no file can
// cross, and asking about each one on its own turned one outage into thousands
// of asks and lines a minute (aylmo, 2026-10-09: Cloudflare answered 530 for
// dev.diiii.xyz for hours while it moved house; 1,400 "could not be carried"
// lines and 5,100 asks on this install's own file routes a minute). So once
// this many asks in a row get no answer of their own, the chase stops, says so
// once, and asks one small question (GET /api/health) after 5 s, then 10, 20 …
// at most every 5 minutes — the op loop's numbers for a refused write
// (followPlan.js failureDelay). Three, not one: a single lost answer on venue
// wifi is that file's retry, not an outage with two lines in the log. The op
// loop hearing the other side again ends the wait at once (noteAnswered), so
// the 5-minute cap is never waited out after it is back. Method: a circuit
// breaker with a consecutive-failure threshold (M. Nygard, Release It!, 2nd
// ed., 2018, ch. 5) and capped exponential back-off.
const MISSES_BEFORE_WAITING = 3

// No answer of its own: none at all (refused, reset, timed out — status 0), or
// a gateway in front of it answering for it: 502, 503, 504 (RFC 9110 §15.6) and
// the 52x Cloudflare sends when it cannot reach the machine — 530 while its
// tunnel is down. A 500 is the machine itself answering about one request, and
// stays that request's trouble: on 2026-10-02 one project's writes answered
// 500 for hours while the rest of the space was fine (followPlan.js).
const notAnswering = (answer) => {
    if (answer?.ok) return false
    const status = Number(answer?.status) || 0
    return !status || status === 502 || status === 503 || status === 504 || (status >= 520 && status <= 530)
}

const howLong = (ms) => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(1)} h`)

const isCarriableId = (id) => SHA256.test(String(id || ''))

const assetRef = (asset) => {
    const id = String(asset?.id || '').trim()
    if (!id) return null
    return {
        id: isCarriableId(id) ? id.toLowerCase() : id,
        name: typeof asset.name === 'string' && asset.name ? asset.name : id.slice(0, 12),
        size: Number.isFinite(asset.size) && asset.size > 0 ? asset.size : 0
    }
}

/**
 * What a batch of project ops says about files, in order: which were named and
 * which were taken away again. Whole-work ops are not read — a follow refuses
 * to carry them (followPlan.js), so whatever they name is not ours to chase.
 */
const assetChangesFromOps = (ops = []) => {
    const changes = []
    for (const op of Array.isArray(ops) ? ops : []) {
        if (op?.type === 'upsertAsset') {
            const ref = assetRef(op.payload?.asset)
            if (ref) changes.push({ kind: 'named', ...ref })
        } else if (op?.type === 'deleteAsset') {
            const id = String(op.payload?.assetId || '').trim()
            if (id) changes.push({ kind: 'removed', id: isCarriableId(id) ? id.toLowerCase() : id })
        }
    }
    return changes
}

/** Every file a project document names. */
const assetsFromDocument = (document) => (Array.isArray(document?.assets) ? document.assets : [])
    .map(assetRef)
    .filter(Boolean)

const assetPath = (projectId, id) => `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(id)}`

const bearer = (side) => (side.token ? { Authorization: `Bearer ${side.token}` } : {})

// Answers that will be the same however often we ask.
const FINAL_STATUSES = new Set([400, 401, 403, 413, 415, 422])

const whyFromStatus = (status, where) => {
    if (status === 401 || status === 403) return `${where} refused the key`
    if (status === 413) return `${where} does not accept a file this large`
    if (status === 415) return `${where} does not accept this kind of file`
    if (status === 404) return `${where} has no such project yet`
    return `${where} answered ${status || 'nothing'}`
}

/**
 * @param {object} options
 * @param {object} options.local   a follower `side` — this install
 * @param {object} options.remote  a follower `side` — the other di.iiii
 * @param {number} [options.maxBytes]  the largest file this install accepts
 * @param {string} [options.tmpDir]    where a file rests between the two machines
 * @param {object} [options.io]        { request, download, upload } — the tests' seam
 * @param {number} [options.waitFirstMs]  the first wait once the other di.iiii is not answering
 * @param {number} [options.waitMostMs]   the longest; each wait doubles the last until it gets here
 */
const createAssetChase = ({
    local,
    remote,
    maxBytes = DEFAULT_MAX_BYTES,
    tmpDir = os.tmpdir(),
    backoffMs = DEFAULT_BACKOFF_MS,
    retryFailedAfterMs = DEFAULT_RETRY_FAILED_AFTER_MS,
    reconcileEveryMs = DEFAULT_RECONCILE_EVERY_MS,
    waitFirstMs = FAILURE_FLOOR_MS,
    waitMostMs = FAILURE_CEILING_MS,
    io = { request: httpRequest, download: httpDownloadToFile, upload: httpUploadFile },
    now = () => Date.now(),
    log = console
} = {}) => {
    const pending = new Map()     // key → { projectId, id, name, size, attempts, notBefore }
    const failed = new Map()      // key → { projectId, id, name, why, final, at }
    const settled = new Set()     // keys both machines are known to hold
    const notCarried = new Set()  // legacy ids — named, never chased
    const toReconcile = new Set() // projects whose document has not been read yet
    const reconciled = new Map()   // projectId → when its documents were last compared with what each side holds
    const known = new Set()        // keys of every file a document or an op has named, carriable or not
    let carried = 0
    let stopped = false
    let running = null
    let timer = null
    const abort = new AbortController()
    // While the other di.iiii is not answering: since when, what came back in
    // its place, how many waits in a row, and when to ask again. Null otherwise.
    let down = null
    let misses = 0                 // asks in a row that got no answer of its own

    const waiting = () => Boolean(down) && now() < down.at

    /** An ask of the other di.iiii came back with an answer of its own. */
    const heard = () => {
        misses = 0
        if (!down) return
        log.info?.(`[follow] ${local.spaceId}: the other di.iiii answers again after ${howLong(now() - down.since)} — files carry`)
        down = null
    }

    /** An ask of the other di.iiii came back with none (notAnswering). */
    const missed = (status, error = null) => {
        if (stopped) return
        const why = status ? String(status) : String(error?.message || error || 'no answer')
        if (down) {
            // Asked again after a wait, and still nothing: a longer wait, and
            // nothing new to say.
            down.waits += 1
            down.why = why
            down.at = now() + failureDelay(down.waits, { floor: waitFirstMs, ceiling: waitMostMs })
            return
        }
        misses += 1
        if (misses < MISSES_BEFORE_WAITING) return
        down = { since: now(), why, waits: 1, at: now() + waitFirstMs }
        log.warn?.(`[follow] ${local.spaceId}: the other di.iiii is not answering (${why}) — files wait; asking again in ${howLong(waitFirstMs)}, then less often, at most every ${howLong(waitMostMs)}`)
    }

    // The one small question asked once a wait is over: on every di.iiii, no
    // key needed, nothing read from disk. Any answer of its own will do; what
    // the files themselves get is for the asks that follow it to find out.
    const probe = async () => {
        const answer = await io.request(remote.url('/api/health'), {
            headers: { Accept: 'application/json' },
            timeoutMs: PROBE_TIMEOUT_MS,
            signal: abort.signal,
            servername: remote.servername,
            address: remote.address
        }).catch((error) => ({ ok: false, status: 0, error }))
        if (!notAnswering(answer)) return true
        missed(answer.status, answer.error)
        return false
    }

    // A killed install leaves its half-received files behind; they are not
    // resumed (a file is checked whole against its name), only cleared.
    fsp.readdir(tmpDir).then(async (names) => {
        for (const entry of names.filter(entry => /^follow-[0-9a-f-]+\.part$/.test(entry))) {
            const file = path.join(tmpDir, entry)
            const stat = await fsp.stat(file).catch(() => null)
            if (stat && Date.now() - stat.mtimeMs > STALE_PART_MS) await fsp.rm(file, { force: true }).catch(() => {})
        }
    }).catch(() => {})

    const keyOf = (projectId, id) => `${projectId}:${id}`

    const name = (projectId, ref) => {
        known.add(keyOf(projectId, ref.id))
        if (!isCarriableId(ref.id)) {
            notCarried.add(keyOf(projectId, ref.id))
            return
        }
        const key = keyOf(projectId, ref.id)
        if (settled.has(key) || pending.has(key)) return
        failed.delete(key)
        pending.set(key, { projectId, id: ref.id, name: ref.name, size: ref.size, attempts: 0, notBefore: 0 })
    }

    const forget = (projectId, id) => {
        const key = keyOf(projectId, id)
        pending.delete(key)
        failed.delete(key)
        settled.delete(key)
        notCarried.delete(key)
        known.delete(key)
    }

    /** Ops seen on a project's stream, from either machine. */
    const noteOps = (projectId, ops) => {
        if (!projectId) return
        for (const change of assetChangesFromOps(ops)) {
            if (change.kind === 'named') name(projectId, change)
            else forget(projectId, change.id)
        }
    }

    /** The projects in the followed space; each document is read once. */
    const noteProjects = (projectIds = []) => {
        for (const projectId of projectIds) {
            const last = reconciled.get(projectId)
            if (last === undefined || now() - last >= reconcileEveryMs) toReconcile.add(projectId)
        }
    }

    const holds = async (side, item) => {
        const answer = await io.request(side.url(`${assetPath(item.projectId, item.id)}/meta`), {
            headers: { Accept: 'application/json', ...bearer(side) },
            timeoutMs: PROBE_TIMEOUT_MS,
            signal: abort.signal,
            servername: side.servername,
            address: side.address
        }).catch((error) => {
            if (side === remote) missed(0, error)
            throw error
        })
        if (side === remote) {
            if (notAnswering(answer)) missed(answer.status)
            else heard()
        }
        if (answer.ok) return { held: true, meta: answer.json()?.asset || null }
        if (answer.status === 404) return { held: false, meta: null }
        throw Object.assign(new Error(whyFromStatus(answer.status, side === local ? 'this install' : 'the other di.iiii')), {
            final: FINAL_STATUSES.has(answer.status)
        })
    }

    const readDocument = (side, projectId) => io.request(side.url(`/api/projects/${encodeURIComponent(projectId)}/document`), {
        headers: { Accept: 'application/json', ...bearer(side) },
        timeoutMs: PROBE_TIMEOUT_MS,
        signal: abort.signal,
        servername: side.servername,
        address: side.address
    })

    const stillNamedHere = async (item) => {
        const answer = await readDocument(local, item.projectId)
        if (!answer.ok) return true // cannot tell — keep saying it is missing
        return assetsFromDocument(answer.json()?.document).some(ref => ref.id === item.id)
    }

    /** One file, one attempt. Resolves 'carried' | 'settled' | 'dropped'; throws with `.final` otherwise. */
    const carryOne = async (item) => {
        const [here, there] = await Promise.all([holds(local, item), holds(remote, item)])
        if (here.held && there.held) return 'settled'
        if (!here.held && !there.held) {
            // Named and then taken away again, with the ops read out of order:
            // nothing to chase, and not worth a line in anybody's terminal.
            if (!(await stillNamedHere(item))) return 'dropped'
            throw Object.assign(new Error('neither machine holds this file'), { final: false })
        }
        const from = here.held ? local : remote
        const to = here.held ? remote : local
        const meta = (here.held ? here.meta : there.meta) || {}
        const fromName = from === local ? 'this install' : 'the other di.iiii'
        const toName = to === local ? 'this install' : 'the other di.iiii'

        const size = Number(meta.size) || item.size || 0
        if (size > maxBytes) {
            throw Object.assign(new Error(`larger than a follow carries (${Math.round(size / 1024 / 1024)} MB, limit ${Math.round(maxBytes / 1024 / 1024)} MB)`), { final: true })
        }

        await fsp.mkdir(tmpDir, { recursive: true })
        const tempPath = path.join(tmpDir, `follow-${crypto.randomUUID()}.part`)
        try {
            let got
            try {
                got = await io.download(from.url(assetPath(item.projectId, item.id)), {
                    destPath: tempPath,
                    headers: bearer(from),
                    maxBytes,
                    timeoutMs: TRANSFER_IDLE_MS,
                    signal: abort.signal,
                    servername: from.servername,
                    address: from.address
                })
            } catch (error) {
                if (error?.code === 'TOO_LARGE') {
                    throw Object.assign(new Error(`larger than a follow carries (limit ${Math.round(maxBytes / 1024 / 1024)} MB)`), { final: true })
                }
                throw error
            }
            if (!got.ok) {
                throw Object.assign(new Error(whyFromStatus(got.status, fromName)), { final: FINAL_STATUSES.has(got.status) })
            }
            // The name IS the hash. Bytes that do not match it are not this
            // file, whatever the machine that sent them believes — they go no
            // further than this temp path.
            if (String(got.sha256 || '').toLowerCase() !== item.id) {
                throw Object.assign(new Error(`what ${fromName} sent is not the file its name says (damaged on the way, or on its disk)`), { final: false, unverified: true })
            }

            const query = new URLSearchParams({
                name: String(meta.name || item.name || ''),
                mimeType: String(meta.mimeType || 'application/octet-stream'),
                ...(Number(meta.width) > 0 && Number(meta.height) > 0 ? { width: String(meta.width), height: String(meta.height) } : {})
            })
            const put = await io.upload(`${to.url(assetPath(item.projectId, item.id))}?${query}`, {
                filePath: tempPath,
                method: 'PUT',
                headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': got.size, Accept: 'application/json', ...bearer(to) },
                timeoutMs: TRANSFER_IDLE_MS,
                signal: abort.signal,
                servername: to.servername,
                address: to.address
            })
            // No such ROUTE, as opposed to no such project: the install on the
            // other end predates the verbatim PUT. Asking again will not teach
            // it, so this is final and said in words a person can act on. (Our
            // own route's 404 names the project, and that one IS worth a retry —
            // the project is made on the next pass of the op loop.)
            const noSuchProject = put.status === 404 && /project not found/i.test(String(put.json?.()?.error || ''))
            if ((put.status === 404 || put.status === 405) && !noSuchProject) {
                throw Object.assign(new Error(`${toName} is older and cannot receive files — update it`), { final: true })
            }
            if (!put.ok) {
                throw Object.assign(new Error(whyFromStatus(put.status, toName)), { final: FINAL_STATUSES.has(put.status) })
            }
            return 'carried'
        } finally {
            await fsp.rm(tempPath, { force: true }).catch(() => {})
        }
    }

    // Both documents, not just ours: on the first pass of a new follow this
    // side may not have received a single op yet, and the other machine's
    // document already names everything. Done only when BOTH have answered (a
    // project one side has not made yet is an answer: 404).
    const reconcileOne = async (projectId) => {
        const [here, there] = await Promise.all([local, remote].map(side => readDocument(side, projectId).catch(error => ({ ok: false, status: 0, error }))))
        if (notAnswering(there)) {
            missed(there.status, there.error)
            return false
        }
        heard()
        // Half a comparison is not one: until both have answered, nothing is
        // named and nothing settled is asked about again. Until 2026-10-09 a
        // pass that could not read one side did both anyway — every 2 s for as
        // long as that side was away — and name() took every file that had run
        // out of tries straight back into the line, so its 5-minute rest never
        // came: four asks of each machine and one "could not be carried" line
        // per file every ~44 s, for every project of every followed space.
        const answered = (answer) => answer.ok || answer.status === 404
        if (!answered(here) || !answered(there)) return false
        // A file settled earlier is asked about again: this comparison exists to
        // find what has stopped being true since.
        for (const key of [...settled]) if (key.startsWith(`${projectId}:`)) settled.delete(key)
        for (const answer of [here, there]) {
            if (answer.ok) for (const ref of assetsFromDocument(answer.json()?.document)) name(projectId, ref)
        }
        return true
    }

    const nextDue = () => {
        const at = now()
        for (const [key, item] of pending) {
            if (item.notBefore <= at) return [key, item]
        }
        return null
    }

    const schedule = () => {
        if (stopped || timer) return
        let soonest = Infinity
        if (down) {
            // Not answering: its next small question is the only thing due.
            soonest = down.at
        } else {
            for (const item of pending.values()) soonest = Math.min(soonest, item.notBefore)
            for (const entry of failed.values()) {
                if (!entry.final) soonest = Math.min(soonest, entry.at + retryFailedAfterMs)
            }
            if (toReconcile.size) soonest = Math.min(soonest, now() + (backoffMs[0] || 1000))
        }
        if (soonest === Infinity) return
        timer = setTimeout(() => { timer = null; run() }, Math.max(50, soonest - now()))
        timer.unref?.()
    }

    const work = async () => {
        if (down) {
            // Waiting out the other side's silence: nothing is asked, read or
            // downloaded, however often the op loop kicks. When the wait is
            // over, one small question before any of the work.
            if (waiting() || !(await probe())) return
        }
        // Files that ran out of tries a while ago get another look.
        for (const [key, entry] of failed) {
            if (entry.final || now() - entry.at < retryFailedAfterMs) continue
            failed.delete(key)
            pending.set(key, { projectId: entry.projectId, id: entry.id, name: entry.name, size: entry.size || 0, attempts: 0, notBefore: 0 })
        }
        for (const projectId of [...toReconcile]) {
            if (stopped || waiting()) return
            try {
                if (await reconcileOne(projectId)) {
                    toReconcile.delete(projectId)
                    reconciled.set(projectId, now())
                }
            } catch { /* this install not answering — asked again next time */ }
        }
        while (!stopped && !waiting()) {
            const due = nextDue()
            if (!due) break
            const [key, item] = due
            try {
                const outcome = await carryOne(item)
                pending.delete(key)
                if (outcome === 'carried') carried += 1
                if (outcome !== 'dropped') settled.add(key)
            } catch (error) {
                if (stopped) return
                // The other side not answering is not this file's doing: it
                // keeps its place in the line and every try it has left.
                if (waiting()) return
                item.attempts += 1
                const why = String(error?.message || error)
                if (error?.final || item.attempts > backoffMs.length) {
                    pending.delete(key)
                    failed.set(key, { projectId: item.projectId, id: item.id, name: item.name, size: item.size, why, final: Boolean(error?.final), at: now() })
                    log.warn?.(`[follow] ${local.spaceId}: ${item.name} could not be carried — ${why}`)
                } else {
                    item.notBefore = now() + backoffMs[item.attempts - 1]
                    // to the back of the line: one stubborn file must not hold the rest
                    pending.delete(key)
                    pending.set(key, item)
                }
            }
        }
        // Asked again after a wait, and nothing in this pass needed the other
        // side: its answer to the small question is enough to say it is back.
        if (down && !stopped && !waiting()) heard()
    }

    /** Start working if not already. Never awaited by the op loop. */
    function run() {
        if (stopped || running) return running
        running = work()
            .catch((error) => { log.warn?.(`[follow] ${local.spaceId}: files: ${error?.message || error}`) })
            .finally(() => { running = null; schedule() })
        return running
    }

    return {
        noteOps,
        noteProjects,
        /**
         * The op loop has just had an answer from the other di.iiii. Files
         * waiting out its silence go now, not at the end of a wait that may be
         * five minutes long — after the small question, as always.
         */
        noteAnswered() {
            if (stopped || !down || down.at <= now()) return
            down.at = now()
            if (timer) clearTimeout(timer)
            timer = null
            run()
        },
        run,
        /** Resolves when the current pass is over — for tests; the follower never waits. */
        idle: () => running || Promise.resolve(),
        stop() {
            stopped = true
            if (timer) clearTimeout(timer)
            timer = null
            abort.abort()
        },
        get files() {
            let bytesPending = 0
            for (const item of pending.values()) bytesPending += item.size || 0
            return {
                carried,
                // How many files the documents and ops have named, and how many of
                // those a machine is known to lack (pending, or tried and failed):
                // what `di follows` says after a restart while the rest is still owed.
                listed: known.size,
                missing: pending.size + failed.size,
                pending: pending.size,
                failed: failed.size,
                // who and why, for a person: `di follows` prints these
                failures: [...failed.values()].map(({ id, name: fileName, why }) => ({ id, name: fileName, why })),
                notCarried: notCarried.size,
                bytesPending
            }
        }
    }
}

module.exports = { createAssetChase, assetChangesFromOps, assetsFromDocument, isCarriableId }

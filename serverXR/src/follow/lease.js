/**
 * Which server on a data folder carries its follows.
 *
 * A data folder can be opened by more than one serverXR at once, and on the
 * owner's machine it is, on purpose: the installed di (port 443) and a dev
 * stack (`npm run dev`, port 4000) share ~/.local/share/di.iiii/data. Both read
 * the same follows.json, so before this both ran a follower for the same space
 * into the same database — and on 2026-10-02 the two of them broke project
 * `test` (docs/ai/known-fixes.md, "two servers on one data folder"). Machine
 * links (machines/link.js) start from the same file and doubled the same way.
 *
 * One server holds a LEASE: `follows.lock` in the data folder, a small JSON
 * record of who carries the follows — pid, port, host — and when it last said
 * so (heartbeat). The holder refreshes it every few seconds. Every other
 * server on the folder starts no follower and no machine link, says once in its
 * log which server carries them, and takes over when that server is gone: its
 * pid no longer exists on this host, or its heartbeat is older than `staleMs`.
 *
 * Reading and replacing the record is itself guarded by proper-lockfile
 * (`follows.lock.guard`, an atomic mkdir with stale detection — the same
 * established cross-process lock projectWrite.js uses), so two servers that
 * both see a dead holder cannot both take its place. The record is written to
 * a temporary file and renamed, so a reader never sees half of one.
 */

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const lockfile = require('proper-lockfile')

const FILE = 'follows.lock'
const FORMAT = 'di.follows-lease'
const HEARTBEAT_MS = 5000
const STALE_MS = 20_000

const leasePath = (dataDir) => path.join(dataDir, FILE)

// "Is that process still there?" — signal 0 checks without sending anything.
// EPERM means it exists and belongs to someone else: alive.
const pidAlive = (pid) => {
    if (!Number.isInteger(pid) || pid <= 0) return false
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        return error?.code === 'EPERM'
    }
}

const readLease = (dataDir) => {
    try {
        const parsed = JSON.parse(fs.readFileSync(leasePath(dataDir), 'utf8'))
        return parsed?.format === FORMAT ? parsed : null
    } catch {
        return null
    }
}

/**
 * Why a lease no longer binds anyone, or null while it does. A pid is only
 * checked on the host that wrote it — on another host the same number is a
 * different process, so only the heartbeat speaks there.
 */
const whyGone = (lease, { now, staleMs, hostname, isAlive }) => {
    if (!lease) return 'no lease'
    if (lease.hostname === hostname && !isAlive(lease.pid)) return `pid ${lease.pid} is gone`
    const age = now - Number(lease.heartbeatAt || 0)
    if (!(age <= staleMs)) return `no heartbeat for ${Math.round(age / 1000)} s`
    return null
}

/** A sentence for the log and for GET /api/follows on a server that is not carrying. */
const describeHolder = (lease) => lease
    ? `another di.iiii server on this data folder carries the follows (pid ${lease.pid}, port ${lease.port}${lease.hostname ? `, ${lease.hostname}` : ''}) — this one starts none, and takes over if that one stops`
    : 'no server on this data folder is carrying the follows yet'

/**
 * @param {object} options
 * @param {string} options.dataDir   the data folder (where follows.json lives)
 * @param {number} options.port      this server's port, written into the lease for people to read
 */
const createFollowLease = ({
    dataDir,
    port = null,
    pid = process.pid,
    hostname = os.hostname(),
    heartbeatMs = HEARTBEAT_MS,
    staleMs = STALE_MS,
    now = Date.now,
    isAlive = pidAlive,
    log = console
} = {}) => {
    const startedAt = new Date(now()).toISOString()
    let held = false
    let timer = null
    let lastSaid = null
    const mine = (lease) => Boolean(lease) && lease.pid === pid && lease.hostname === hostname && lease.startedAt === startedAt

    const write = async () => {
        const file = leasePath(dataDir)
        const body = { format: FORMAT, pid, port, hostname, startedAt, heartbeatAt: now() }
        const tmp = `${file}.${pid}.tmp`
        await fsp.writeFile(tmp, `${JSON.stringify(body)}\n`, { mode: 0o600 })
        await fsp.rename(tmp, file)
    }

    // Everything that reads-then-writes the record does it under the guard.
    const guarded = async (fn) => {
        await fsp.mkdir(dataDir, { recursive: true })
        const release = await lockfile.lock(leasePath(dataDir), {
            realpath: false,
            lockfilePath: `${leasePath(dataDir)}.guard`,
            stale: 5000,
            retries: { retries: 20, factor: 1.3, minTimeout: 20, maxTimeout: 250 },
            onCompromised: () => { /* the guard is held for milliseconds; the heartbeat corrects anything */ }
        })
        try { return await fn() } finally { try { await release() } catch { /* already gone */ } }
    }

    /**
     * Take the lease if it is free, ours, or its holder is gone; refresh it if
     * we hold it. Returns { held, holder } — holder is the record in force.
     */
    const claim = async () => guarded(async () => {
        const current = readLease(dataDir)
        if (mine(current)) {
            await write()
            held = true
            return { held, holder: readLease(dataDir) }
        }
        const gone = whyGone(current, { now: now(), staleMs, hostname, isAlive })
        if (gone) {
            await write()
            if (current) log.warn?.(`[follow] took over the follows for this data folder from pid ${current.pid} (port ${current.port}): ${gone}`)
            held = true
            return { held, holder: readLease(dataDir) }
        }
        held = false
        return { held, holder: current }
    })

    /** One beat: refresh, take over, or step down. Calls back on a change. */
    const beat = async ({ onGain, onLose } = {}) => {
        const was = held
        let answer
        try {
            answer = await claim()
        } catch (error) {
            // The guard could not be had: keep what we had and try next beat.
            log.warn?.(`[follow] could not check who carries the follows (${error?.message || error})`)
            return { held, holder: readLease(dataDir) }
        }
        if (!answer.held) {
            const said = `${answer.holder?.pid}:${answer.holder?.port}:${answer.holder?.startedAt}`
            if (said !== lastSaid) {
                lastSaid = said
                log.info?.(`[follow] ${describeHolder(answer.holder)}`)
            }
        } else {
            lastSaid = null
        }
        if (answer.held && !was) await onGain?.()
        if (!answer.held && was) {
            log.warn?.(`[follow] stopped carrying the follows: pid ${answer.holder?.pid} (port ${answer.holder?.port}) holds them now`)
            await onLose?.()
        }
        return answer
    }

    return {
        claim,
        beat,
        /** Beat now and then every heartbeatMs until stop(). */
        start({ onGain, onLose } = {}) {
            const tick = async () => {
                // A beat that throws (a start or stop that failed) must not end
                // the heartbeat — a holder that stops beating loses its lease.
                try { await beat({ onGain, onLose }) } catch (error) { log.warn?.(`[follow] lease beat: ${error?.message || error}`) }
                if (timer !== false) {
                    timer = setTimeout(tick, heartbeatMs)
                    timer.unref?.()
                }
            }
            timer = null
            return tick()
        },
        /** Stop beating; give the lease up if it is ours, so the next server need not wait. */
        stop() {
            if (timer) clearTimeout(timer)
            timer = false
            if (!held) return
            held = false
            try {
                if (mine(readLease(dataDir))) fs.rmSync(leasePath(dataDir), { force: true })
            } catch { /* the next server will see a dead pid or a stale beat */ }
        },
        get held() { return held },
        /** The record in force, for GET /api/follows. */
        holder: () => readLease(dataDir),
        describe: () => (held ? null : describeHolder(readLease(dataDir)))
    }
}

module.exports = { createFollowLease, readLease, whyGone, describeHolder, pidAlive, leasePath, FILE, HEARTBEAT_MS, STALE_MS }

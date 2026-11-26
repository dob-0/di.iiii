/**
 * One update at a time per install (2026-11-26 review of the updater guard).
 *
 * The timer and a hand `di update` both read the running version at the start and flip `current`
 * at the end, minutes later. Without a lock a `--from` install that lands in that window is
 * overwritten by the hub's build, and pruneVersions then deletes the file build it replaced.
 *
 * The lock `~/.di/update.lock` is made whole and then link()ed into place, so no other process
 * ever sees it half written; link() fails with EEXIST when a lock exists. A lock records the
 * holder's pid AND that process's start time (/proc/<pid>/stat), so a leftover lock whose pid was
 * reused by an unrelated program is stale at once, not after 3 hours. A lock older than 3 hours is
 * stale too. An unreadable lock younger than a minute is held (someone is mid-write). Taking over
 * a stale lock goes through a second short lock (`update.lock.reclaim`), so two processes cannot
 * both delete it and both win.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { paths } from './paths.mjs'

export const lockFile = (home) => path.join(paths(home).home, 'update.lock')
const STALE_MS = 3 * 60 * 60 * 1000
const YOUNG_MS = 60 * 1000

const pidAlive = (pid) => {
    try { process.kill(pid, 0); return true } catch (error) { return error?.code === 'EPERM' }
}

/** Start time of a process (field 22 of /proc/<pid>/stat, in clock ticks since boot) or null. */
export const startOf = (pid) => {
    try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
        return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] || null
    } catch { return null }
}

const readHolder = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

const ageOf = (file, now) => {
    try { return now - fs.statSync(file).mtimeMs } catch { return Infinity }
}

/** Why a lock is stale, or null when it is held. */
const staleReason = (holder, file, now) => {
    if (!holder) return ageOf(file, now) < YOUNG_MS ? null : 'unreadable'
    if (!Number.isInteger(holder.pid)) return 'no pid'
    if (now - Date.parse(holder.at || 0) > STALE_MS) return 'older than 3 hours'
    if (!pidAlive(holder.pid)) return 'its process is gone'
    const running = startOf(holder.pid)
    if (running !== null && running !== holder.start) return 'its pid belongs to another process now'
    return null
}

// Make `file` from a fully written temp file; false when it already exists.
const linkNew = async (file, body) => {
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}`
    await fsp.writeFile(tmp, body)
    try {
        await fsp.link(tmp, file)
        return true
    } catch (error) {
        if (error?.code === 'EEXIST') return false
        throw error
    } finally {
        await fsp.rm(tmp, { force: true })
    }
}

/** `{ ok: true, release }` or `{ ok: false, holder, file }`. */
export const takeUpdateLock = async ({ home, now = () => Date.now(), pid = process.pid }) => {
    const file = lockFile(home)
    await fsp.mkdir(path.dirname(file), { recursive: true })
    const body = `${JSON.stringify({ pid, start: startOf(pid), at: new Date(now()).toISOString() })}\n`
    const mine = { ok: true, release: async () => { if (readHolder(file)?.pid === pid) await fsp.rm(file, { force: true }) } }
    if (await linkNew(file, body)) return mine
    const reclaim = `${file}.reclaim`
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const holder = readHolder(file)
        if (staleReason(holder, file, now()) === null) return { ok: false, holder, file }
        // Only one process at a time may remove a stale lock; a dead taker's guard ages out.
        if (!(await linkNew(reclaim, body))) {
            if (ageOf(reclaim, now()) > YOUNG_MS) await fsp.rm(reclaim, { force: true })
            continue
        }
        try {
            const again = readHolder(file)
            if (staleReason(again, file, now()) !== null) await fsp.rm(file, { force: true })
            if (await linkNew(file, body)) return mine
        } finally {
            await fsp.rm(reclaim, { force: true })
        }
    }
    return { ok: false, holder: readHolder(file), file }
}

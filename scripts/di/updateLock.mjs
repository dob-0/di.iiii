/**
 * One update at a time per install (2026-11-26 review of the updater guard).
 *
 * The timer and a hand `di update` both read the running version at the start and flip `current`
 * at the end, minutes later. Without a lock a `--from` install that lands in that window is
 * overwritten by the hub's build, and pruneVersions then deletes the file build it replaced.
 * The lock is a file made with O_EXCL (`wx`); a holder that is gone (dead pid) or older than
 * 3 hours is stale and taken over.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { paths } from './paths.mjs'

export const lockFile = (home) => path.join(paths(home).home, 'update.lock')
const STALE_MS = 3 * 60 * 60 * 1000

const pidAlive = (pid) => {
    try { process.kill(pid, 0); return true } catch (error) { return error?.code === 'EPERM' }
}

const readHolder = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

const stale = (holder, now) => {
    if (!holder || !Number.isInteger(holder.pid)) return true
    if (now - Date.parse(holder.at || 0) > STALE_MS) return true
    return !pidAlive(holder.pid)
}

/** `{ ok: true, release }` or `{ ok: false, holder }`. */
export const takeUpdateLock = async ({ home, now = () => Date.now(), pid = process.pid }) => {
    const file = lockFile(home)
    await fsp.mkdir(path.dirname(file), { recursive: true })
    const body = () => `${JSON.stringify({ pid, at: new Date(now()).toISOString() })}\n`
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            await fsp.writeFile(file, body(), { flag: 'wx' })
            return { ok: true, release: async () => { if (readHolder(file)?.pid === pid) await fsp.rm(file, { force: true }) } }
        } catch (error) {
            if (error?.code !== 'EEXIST') throw error
            const holder = readHolder(file)
            if (!stale(holder, now())) return { ok: false, holder }
            await fsp.rm(file, { force: true })
        }
    }
    return { ok: false, holder: readHolder(file) }
}

/**
 * `<DATA_ROOT>/follows.json` — the spaces this install follows on another
 * di.iiii, written by `di follow` and read by the server's follower engine.
 *
 * The FORMAT is defined once, in serverXR/src/follow/followStore.js, which is
 * the reader that matters at runtime; this is the writer, and the two are kept
 * in step by scripts/di/follows.test.js, which reads a file written here with
 * that module. The CLI cannot simply import it: the packed artifact puts the
 * CLI at `cli/` and the server at `serverXR/`, so the relative path that works
 * in the repo does not exist in an install.
 *
 * It lives inside DATA_ROOT because a follow belongs to the work — `di backup`
 * carries it, an update does not lose it — and it carries a per-space sync key,
 * so it is written 0600 and a backup of it is a backup of that key.
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

export const FORMAT = 'di.follows'

const filePath = (dataDir) => path.join(dataDir, 'follows.json')

/**
 * The file is there but is not a follows file (a crash mid-write, a hand edit).
 * Reading it as "follows nothing" is fine for `di follows`; WRITING over it is
 * not — that would drop every other follow and its key, which is shown once.
 */
export class FollowsCorruptError extends Error {
    constructor(file, copy) {
        super(`${file} is not readable as a follows file; kept as it is (copy: ${copy || 'none'})`)
        this.code = 'FOLLOWS_CORRUPT'
        this.file = file
        this.copy = copy
    }
}

/** 'absent' | 'ok' | 'corrupt', with the follows when ok. */
export const inspectFollows = (dataDir) => {
    let raw
    try { raw = fs.readFileSync(filePath(dataDir), 'utf8') } catch { return { state: 'absent', follows: {} } }
    try {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.format === FORMAT && parsed.follows && typeof parsed.follows === 'object') {
            return { state: 'ok', follows: parsed.follows }
        }
    } catch { /* fall through */ }
    return { state: 'corrupt', follows: {} }
}

/** The follows to change, or a refusal that leaves the bad file and a .corrupt copy. */
const followsForWrite = (dataDir) => {
    const found = inspectFollows(dataDir)
    if (found.state !== 'corrupt') return found.follows
    const copy = `${filePath(dataDir)}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
    let kept = null
    try { fs.copyFileSync(filePath(dataDir), copy); fs.chmodSync(copy, 0o600); kept = copy } catch { /* the original is still there */ }
    throw new FollowsCorruptError(filePath(dataDir), kept)
}

export const readFollows = (dataDir) => {
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath(dataDir), 'utf8'))
        if (!parsed || parsed.format !== FORMAT || !parsed.follows) return {}
        return parsed.follows
    } catch {
        return {}
    }
}

const writeFollows = async (dataDir, follows) => {
    await fsp.mkdir(dataDir, { recursive: true })
    const file = filePath(dataDir)
    const tmp = `${file}.${process.pid}.tmp`
    const handle = await fsp.open(tmp, 'w', 0o600)
    try {
        await handle.writeFile(`${JSON.stringify({ format: FORMAT, version: 1, follows }, null, 2)}
`)
        await handle.chmod(0o600)
        await handle.sync()
    } finally {
        await handle.close()
    }
    await fsp.rename(tmp, file)
    return follows
}

export const addFollow = async (dataDir, spaceId, { remote, token, label = null, address = null, direction = null, start = null }) => {
    const follows = followsForWrite(dataDir)
    follows[spaceId] = {
        remote: String(remote || '').replace(/\/$/, ''),
        token: token || null,
        label,
        followedAt: new Date().toISOString(),
        // The ADDRESS PIN — "the name stays, the socket goes to this IP". Left
        // out entirely when there is none, not written as null: a record with
        // no pin must serialise byte-identically to one from before this
        // existed (scripts/di/follows.test.js holds that line).
        ...(address ? { address } : {}),
        // `--take-host` / `--take-mine`: spent by the server on the first
        // comparison of each stream, then cleared. `start: 'replay'` is the
        // explicit `--replay`; absent means start from now. Both absent when
        // unset (serverXR/src/follow/followStore.js keeps the same shape).
        ...(direction ? { direction } : {}),
        ...(start === 'replay' ? { start } : {})
    }
    return writeFollows(dataDir, follows)
}

/**
 * Put a follow back EXACTLY as it was — the same keys, in the same order, with
 * the same `followedAt`. `addFollow` would stamp a new one, and `di stage
 * leave` promises the file it hands back is the file it found.
 */
export const setFollow = async (dataDir, spaceId, entry) => {
    const follows = followsForWrite(dataDir)
    follows[spaceId] = entry
    return writeFollows(dataDir, follows)
}

export const removeFollow = async (dataDir, spaceId) => {
    const follows = followsForWrite(dataDir)
    // The follower's cursors go with the follow: a later follow of the same
    // space must start from nothing, not resume from where it stopped.
    // (The server refuses to re-save them once the follow is gone.)
    await fsp.rm(path.join(dataDir, 'follow-state', `${encodeURIComponent(spaceId)}.json`), { force: true })
    if (!follows[spaceId]) return { follows, removed: false }
    delete follows[spaceId]
    await writeFollows(dataDir, follows)
    return { follows, removed: true }
}

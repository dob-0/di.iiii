/**
 * Which spaces this install follows, and where from.
 *
 * A small JSON file inside DATA_ROOT, because a follow belongs to the WORK, not
 * to the program: `di backup` should carry it, an update must not lose it, and
 * a machine that is restored from a backup should pick the room up again.
 *
 * The token is the exception and lives here too, which is a deliberate trade —
 * a per-space sync key is editor-scoped to one space and revocable by its owner
 * in a keystroke, and a follow that cannot survive a restart is not a follow.
 * `di backup` carries it; say so where a person can read it.
 */

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const FILE = 'follows.json'
const FORMAT = 'di.follows'

const filePath = (dataDir) => path.join(dataDir, FILE)

const readFollows = (dataDir) => {
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath(dataDir), 'utf8'))
        if (!parsed || parsed.format !== FORMAT || !parsed.follows) return {}
        return parsed.follows
    } catch {
        // Absent or corrupt means "this install follows nothing" — never a
        // crash, on the same terms as every other state file here.
        return {}
    }
}

// A file that is there but unreadable must not be written over: reading it as
// {} and saving would drop every other follow and its key. Keep it, keep a copy.
const followsForWrite = (dataDir) => {
    let raw
    try { raw = fs.readFileSync(filePath(dataDir), 'utf8') } catch { return {} }
    try {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.format === FORMAT && parsed.follows && typeof parsed.follows === 'object') return parsed.follows
    } catch { /* fall through */ }
    const copy = `${filePath(dataDir)}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
    try { fs.copyFileSync(filePath(dataDir), copy); fs.chmodSync(copy, 0o600) } catch { /* original stays */ }
    const error = new Error(`${filePath(dataDir)} is not readable as a follows file; kept as it is`)
    error.code = 'FOLLOWS_CORRUPT'
    throw error
}

// Temp + fsync + rename, mode 0600 on every write (an older 0644 file is replaced).
const writeFileAtomic = async (file, text) => {
    const tmp = `${file}.${process.pid}.tmp`
    const handle = await fsp.open(tmp, 'w', 0o600)
    try {
        await handle.writeFile(text)
        await handle.chmod(0o600)
        await handle.sync()
    } finally {
        await handle.close()
    }
    await fsp.rename(tmp, file)
}

const writeFollows = async (dataDir, follows) => {
    await fsp.mkdir(dataDir, { recursive: true })
    const body = { format: FORMAT, version: 1, follows }
    await writeFileAtomic(filePath(dataDir), `${JSON.stringify(body, null, 2)}\n`)
    return follows
}

const addFollow = async (dataDir, spaceId, { remote, token, label = null, address = null }) => {
    const follows = followsForWrite(dataDir)
    follows[spaceId] = {
        remote: String(remote || '').replace(/\/$/, ''),
        token: token || null,
        label,
        followedAt: new Date().toISOString(),
        // The ADDRESS PIN, kept in step with scripts/di/follows.mjs — absent
        // entirely rather than null, so a record with no pin serialises
        // byte-identically to one written before this existed.
        ...(address ? { address } : {})
    }
    return writeFollows(dataDir, follows)
}

const removeFollow = async (dataDir, spaceId) => {
    const follows = followsForWrite(dataDir)
    if (!follows[spaceId]) return { follows, removed: false }
    delete follows[spaceId]
    await writeFollows(dataDir, follows)
    await fsp.rm(statePath(dataDir, spaceId), { force: true })
    return { follows, removed: true }
}

/*
 * Where a follower had got to: its two cursors per stream and the opIds it has
 * already carried (follower.js `saved` / `onSave`). One small file per space,
 * beside follows.json, so a restart resumes instead of re-reading and re-sending
 * both retained windows. Written whole to a temporary file and renamed, so a
 * crash mid-write leaves the previous state, never half of one.
 */
const STATE_DIR = 'follow-state'
const STATE_FORMAT = 'di.follow-state'
const statePath = (dataDir, spaceId) => path.join(dataDir, STATE_DIR, `${encodeURIComponent(spaceId)}.json`)

const readFollowState = (dataDir, spaceId) => {
    try {
        const parsed = JSON.parse(fs.readFileSync(statePath(dataDir, spaceId), 'utf8'))
        return parsed?.format === STATE_FORMAT ? parsed.state : null
    } catch {
        return null
    }
}

const writeFollowState = async (dataDir, spaceId, state) => {
    // An unfollowed space has no state to keep: the running follower may still
    // tick for a moment after `di unfollow` removed the file, and a save then
    // would bring the old cursors back for the next follow to resume from.
    if (!readFollows(dataDir)[spaceId]) return
    const file = statePath(dataDir, spaceId)
    await fsp.mkdir(path.dirname(file), { recursive: true })
    await writeFileAtomic(file, JSON.stringify({ format: STATE_FORMAT, version: 1, savedAt: new Date().toISOString(), state }))
}

module.exports = { readFollows, writeFollows, addFollow, removeFollow, readFollowState, writeFollowState, filePath, statePath, FORMAT }

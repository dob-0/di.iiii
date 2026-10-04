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

const writeFollows = async (dataDir, follows) => {
    await fsp.mkdir(dataDir, { recursive: true })
    const body = { format: FORMAT, version: 1, follows }
    await fsp.writeFile(filePath(dataDir), `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 })
    return follows
}

const addFollow = async (dataDir, spaceId, { remote, token, label = null, address = null, direction = null, start = null }) => {
    const follows = readFollows(dataDir)
    follows[spaceId] = {
        remote: String(remote || '').replace(/\/$/, ''),
        token: token || null,
        label,
        followedAt: new Date().toISOString(),
        // The ADDRESS PIN, kept in step with scripts/di/follows.mjs — absent
        // entirely rather than null, so a record with no pin serialises
        // byte-identically to one written before this existed.
        ...(address ? { address } : {}),
        // `di follow --take-host | --take-mine`: the answer to a refusal, spent
        // on the first comparison of each stream and then cleared by the
        // server (clearDirection). `start: 'replay'` is the explicit opt-in to
        // the old first start; absent means start from now. Absent entirely
        // when unset, like `address`.
        ...(direction ? { direction } : {}),
        ...(start === 'replay' ? { start } : {})
    }
    return writeFollows(dataDir, follows)
}

/** Spend a direction: the first comparison happened, later edits sync the ordinary way. */
const clearDirection = async (dataDir, spaceId) => {
    const follows = readFollows(dataDir)
    if (!follows[spaceId]?.direction) return false
    delete follows[spaceId].direction
    await writeFollows(dataDir, follows)
    return true
}

const removeFollow = async (dataDir, spaceId) => {
    const follows = readFollows(dataDir)
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
    const file = statePath(dataDir, spaceId)
    await fsp.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await fsp.writeFile(tmp, JSON.stringify({ format: STATE_FORMAT, version: 1, savedAt: new Date().toISOString(), state }), { mode: 0o600 })
    await fsp.rename(tmp, file)
}

module.exports = { readFollows, writeFollows, addFollow, clearDirection, removeFollow, readFollowState, writeFollowState, filePath, statePath, FORMAT }

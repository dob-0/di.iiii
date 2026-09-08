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

const addFollow = async (dataDir, spaceId, { remote, token, label = null }) => {
    const follows = readFollows(dataDir)
    follows[spaceId] = {
        remote: String(remote || '').replace(/\/$/, ''),
        token: token || null,
        label,
        followedAt: new Date().toISOString()
    }
    return writeFollows(dataDir, follows)
}

const removeFollow = async (dataDir, spaceId) => {
    const follows = readFollows(dataDir)
    if (!follows[spaceId]) return { follows, removed: false }
    delete follows[spaceId]
    await writeFollows(dataDir, follows)
    return { follows, removed: true }
}

module.exports = { readFollows, writeFollows, addFollow, removeFollow, filePath, FORMAT }

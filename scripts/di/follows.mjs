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
    await fsp.writeFile(
        filePath(dataDir),
        `${JSON.stringify({ format: FORMAT, version: 1, follows }, null, 2)}\n`,
        { mode: 0o600 }
    )
    return follows
}

export const addFollow = async (dataDir, spaceId, { remote, token, label = null }) => {
    const follows = readFollows(dataDir)
    follows[spaceId] = {
        remote: String(remote || '').replace(/\/$/, ''),
        token: token || null,
        label,
        followedAt: new Date().toISOString()
    }
    return writeFollows(dataDir, follows)
}

export const removeFollow = async (dataDir, spaceId) => {
    const follows = readFollows(dataDir)
    if (!follows[spaceId]) return { follows, removed: false }
    delete follows[spaceId]
    await writeFollows(dataDir, follows)
    return { follows, removed: true }
}

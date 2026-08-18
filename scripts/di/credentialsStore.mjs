// ~/.di/credentials.json — the sync keys `di link` stores, one per space.
//
// The path has been declared in paths.mjs since the installer landed and was
// populated by nothing; this is the module that finally writes it. Mode 0600
// because the file holds bearer secrets (`dii_sync_<keyId>.<secret>`, editor
// role scoped to one space). It lives OUTSIDE data/ on purpose: `di backup`
// must carry the artist's work to any machine, and a backup that carries live
// credentials turns a shared tarball into a shared editor key.
//
// Shape: { links: { [spaceId]: { remote, key, linkedAt } } }
// `remote` is the API base including its mount path (…/serverXR), the same
// convention di-spaces' lib uses, so callers only ever append /api/….
import fs from 'node:fs'
import path from 'node:path'
import { paths } from './paths.mjs'

export const readCredentials = (home) => {
    try {
        return JSON.parse(fs.readFileSync(paths(home).credentials, 'utf8'))
    } catch {
        // corrupt or absent degrades to "nothing linked", never a crash —
        // same contract as state.mjs
        return {}
    }
}

export const readLink = (home, spaceId) => readCredentials(home)?.links?.[spaceId] || null

export const writeLink = (home, spaceId, { remote, key }) => {
    const file = paths(home).credentials
    const current = readCredentials(home)
    const next = {
        ...current,
        links: {
            ...(current.links || {}),
            [spaceId]: { remote, key, linkedAt: new Date().toISOString() }
        }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
    // writeFileSync's mode only applies on create — an existing file keeps
    // whatever it had, so tighten explicitly every time
    fs.chmodSync(file, 0o600)
    return next.links[spaceId]
}

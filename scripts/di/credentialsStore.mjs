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
import { writeFileAtomicSync } from './atomicWrite.mjs'
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

// readCredentials degrades an unreadable file to "nothing linked", and the write below would then save that nothing over
// it — taking every other space's key with it (a key is shown once; the host cannot hand it back). Keep what was there.
const keepUnreadable = (file) => {
    let raw
    try { raw = fs.readFileSync(file, 'utf8') } catch { return }
    if (!raw.trim()) return
    try { JSON.parse(raw); return } catch { /* unreadable: keep a copy */ }
    const copy = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
    try { fs.copyFileSync(file, copy); fs.chmodSync(copy, 0o600) } catch { /* the original stays until the write replaces it */ }
}

export const writeLink = (home, spaceId, { remote, key }) => {
    const file = paths(home).credentials
    keepUnreadable(file)
    const current = readCredentials(home)
    const next = {
        ...current,
        links: {
            ...(current.links || {}),
            [spaceId]: { remote, key, linkedAt: new Date().toISOString() }
        }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // 0600 on every rewrite (a plain write's mode only applies on create, so an old 0644 file kept its mode), and
    // atomic: a freeze half-way through must leave the previous keys whole.
    writeFileAtomicSync(file, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
    return next.links[spaceId]
}

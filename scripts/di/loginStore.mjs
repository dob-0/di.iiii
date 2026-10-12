// ~/.config/di/credentials.json — the logins `di login` keeps on this machine.
//
// The SAME file the SDK reads (sdk/credentials.js: `store[tier]?.token`, and
// by origin for a host that is not one of the three it knows by name). The
// format is shared by contract and NOT by import: an install lays cli/ and
// sdk/ side by side and a checkout does not, so neither side can reach the
// other by a relative path. scripts/di/loginStore.test.js reads a file written
// here with the SDK's own resolver, which is what keeps the two honest.
//
// Shape: { "<key>": { token, base, site, user: { id, name }, expiresAt, savedAt } }
//   <key>  dev | prod | local   for the three servers the SDK calls by name
//          the server's origin   (https://example.org) for any other host
//
// A secret file, so:
//   - folder 0700, file 0600, tightened on EVERY write (a folder or file that
//     already existed keeps whatever mode it had; writeFileSync's mode only
//     applies on create). Windows has no such modes: chmod errors are ignored
//     there and only there.
//   - written to a temp file in the same folder, synced, renamed over: a crash
//     leaves the old file or the new one, never half of either (the same
//     method scripts/di/follows.mjs uses for its keys).
//   - reading never throws: absent, empty or unreadable is "no login". A file
//     that is not a credentials file is copied to credentials.json.corrupt-<time>
//     (0600) before it is replaced, and is NOT replaced if the copy fails.

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The three servers the SDK calls by name — `site` of sdk/credentials.js TIERS,
// copied, not imported. loginStore.test.js fails if the two ever differ.
export const SITES = {
    local: 'http://localhost:4000',
    dev: 'https://dev.diiii.xyz',
    prod: 'https://di-studio.xyz'
}

export const credentialsFile = (home = os.homedir()) => path.join(home, '.config', 'di', 'credentials.json')

/** `https://Example.org:443/serverXR/x` → `https://example.org`; anything that is not http(s) → null. */
export const originOf = (url) => {
    try {
        const parsed = new URL(String(url))
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
    } catch {
        return null
    }
}

/** The tier whose site is exactly this origin, or null. */
export const tierOfOrigin = (origin) => Object.keys(SITES).find((tier) => SITES[tier] === origin) || null

/**
 * Where a login is filed. A tier names its own key; `--to URL` names the tier
 * whose site is that origin, or else the origin itself. Null when neither is
 * something a login can be filed under (an unknown tier, a string that is not
 * an http(s) address).
 */
export const loginKeyFor = ({ tier = null, to = null } = {}) => {
    if (tier) return Object.hasOwn(SITES, tier) ? tier : null
    const origin = originOf(to)
    return origin ? (tierOfOrigin(origin) || origin) : null
}

const isKey = (key) => typeof key === 'string' && (Object.hasOwn(SITES, key) || /^https?:\/\/[^/\s]+$/.test(key))

const tighten = (fsImpl, target, mode, platform) => {
    try {
        fsImpl.chmodSync(target, mode)
    } catch (error) {
        if (platform !== 'win32') throw error
    }
}

/** { state: 'absent' | 'ok' | 'corrupt', store } — never throws. */
const inspect = (fsImpl, file) => {
    let raw
    try { raw = fsImpl.readFileSync(file, 'utf8') } catch { return { state: 'absent', store: {} } }
    if (raw.trim() === '') return { state: 'absent', store: {} }
    try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { state: 'ok', store: parsed }
    } catch { /* falls through: corrupt */ }
    return { state: 'corrupt', store: {} }
}

export const readLogin = ({ home = os.homedir(), key, fsImpl = fs } = {}) => {
    if (!isKey(key)) return null
    const { store } = inspect(fsImpl, credentialsFile(home))
    const entry = Object.hasOwn(store, key) ? store[key] : null
    return entry && typeof entry === 'object' && typeof entry.token === 'string' && entry.token ? entry : null
}

const replaceFile = (fsImpl, file, text, platform) => {
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
    let fd = null
    try {
        fd = fsImpl.openSync(tmp, 'wx', 0o600)
        fsImpl.writeSync(fd, text)
        try { fsImpl.fchmodSync(fd, 0o600) } catch (error) { if (platform !== 'win32') throw error }
        fsImpl.fsyncSync(fd)
        fsImpl.closeSync(fd)
        fd = null
        fsImpl.renameSync(tmp, file)
    } catch (error) {
        if (fd !== null) { try { fsImpl.closeSync(fd) } catch { /* already failing */ } }
        try { fsImpl.unlinkSync(tmp) } catch { /* nothing to clean */ }
        throw error
    }
}

const keepCorrupt = (fsImpl, file, now, platform) => {
    const copy = `${file}.corrupt-${new Date(now()).toISOString().replace(/[:.]/g, '-')}`
    try {
        fsImpl.copyFileSync(file, copy)
        tighten(fsImpl, copy, 0o600, platform)
    } catch (cause) {
        // Cannot keep what is there, so do not replace it.
        const error = new Error('credentials.json cannot be read, and a copy of it could not be kept — left as it is')
        error.code = 'CREDENTIALS_CORRUPT'
        error.cause = cause
        throw error
    }
    return copy
}

const writeStore = ({ home, fsImpl, now, platform, change }) => {
    const file = credentialsFile(home)
    const dir = path.dirname(file)
    fsImpl.mkdirSync(dir, { recursive: true, mode: 0o700 })
    tighten(fsImpl, dir, 0o700, platform)
    const { state, store } = inspect(fsImpl, file)
    if (state === 'corrupt') keepCorrupt(fsImpl, file, now, platform)
    const next = change({ ...store })
    replaceFile(fsImpl, file, `${JSON.stringify(next, null, 2)}\n`, platform)
    return file
}

/** File this login under `key` (loginKeyFor), keeping every other entry. Throws only when it could not write. */
export const writeLogin = ({ home = os.homedir(), key, entry, now = Date.now, fsImpl = fs, platform = process.platform } = {}) => {
    if (!isKey(key)) throw new Error(`a login cannot be filed under "${key}"`)
    if (!entry || typeof entry.token !== 'string' || !entry.token) throw new Error('a login needs a token')
    return writeStore({ home, fsImpl, now, platform, change: (store) => ({ ...store, [key]: entry }) })
}

/** Forget this login. True if there was one to forget. Never touches a file it cannot read. */
export const removeLogin = ({ home = os.homedir(), key, now = Date.now, fsImpl = fs, platform = process.platform } = {}) => {
    if (!readLogin({ home, key, fsImpl })) return false
    writeStore({
        home, fsImpl, now, platform,
        change: (store) => {
            const rest = { ...store }
            delete rest[key]
            return rest
        }
    })
    return true
}

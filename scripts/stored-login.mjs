/**
 * stored-login.mjs — the session `di login` keeps for a tier, for scripts that talk to that tier.
 *
 * The owner logs in once (`di login`); the CLI keeps the session in ~/.config/di/credentials.json
 * (mode 600, keys `dev` / `prod`, each { token, base, expiresAt }). Owner 2026-11-02: "I don't want to
 * login every time" — a script that carries to DEV reads that session instead of asking for a token.
 *
 * Contract: the token is returned to the caller and never printed, logged or put in argv. Only the
 * DEV tier is served here; production keeps its window (PROD_API_TOKEN, di-ask). Returns null when
 * the file is missing, unreadable, world-readable, has no such tier, or the session has expired —
 * the caller then says so once (see describeStoredLogin) and falls back to the env token.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const credentialsFile = () => process.env.DI_CREDENTIALS_FILE || path.join(os.homedir(), '.config', 'di', 'credentials.json')

/** Hosts the stored dev token may be sent to: dev.diiii.xyz over https, or loopback / diiii.localhost (an ssh forward, a local stack). */
// Same rule as scripts/di/syncPush.mjs (the CLI is packed apart from scripts/, so it keeps its own copy; a test pins them equal).
export const devHostAllowed = (url) => {
    let u
    try { u = new URL(String(url)) } catch { return false }
    if (u.username || u.password) return false
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (host === 'dev.diiii.xyz') return u.protocol === 'https:'
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === 'diiii.localhost' || host.endsWith('.diiii.localhost')
}

export const assertDevHost = (url) => {
    if (!devHostAllowed(url)) throw new Error(`refusing dev base ${String(url).replace(/\/\/[^/@]*@/, '//')}: the dev login is only sent to dev.diiii.xyz, loopback or diiii.localhost`)
    return url
}

export const storedLogin = (tier, now = Date.now()) => {
    if (tier !== 'dev') return { token: null, why: 'only the dev tier reads the stored login' }
    const file = credentialsFile()
    let stat
    try {
        stat = fs.statSync(file)
    } catch {
        return { token: null, why: `no stored login (${file} is missing) — run \`di login\` once` }
    }
    if (stat.mode & 0o077) return { token: null, why: `${file} is readable by others (mode ${(stat.mode & 0o777).toString(8)}); refusing to use it` }
    let entry
    try {
        entry = JSON.parse(fs.readFileSync(file, 'utf8'))?.[tier]
    } catch {
        return { token: null, why: `${file} is not valid JSON` }
    }
    if (!entry?.token) return { token: null, why: `no ${tier} session in the stored login — run \`di login\` once` }
    if (Number(entry.expiresAt) && Number(entry.expiresAt) <= now) return { token: null, why: `the stored ${tier} login expired — run \`di login\` once` }
    return { token: String(entry.token), base: entry.base ? String(entry.base) : null, why: null, user: entry.user?.name || null }
}

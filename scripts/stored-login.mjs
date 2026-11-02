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
    return { token: String(entry.token), why: null, user: entry.user?.name || null }
}

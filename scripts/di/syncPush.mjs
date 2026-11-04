/**
 * syncPush.mjs — `di sync <space> --push [--apply]`: the owner's flow "work on local, push to dev, sync all in dev, then main"
 * (2026-11-02). Local → dev only; dev → main stays the existing release path. Writes nothing without --apply: the default
 * is a dry-run that LISTS the projects it would write. The copy itself is scripts/tier-sync.mjs (staleness and overwrite
 * checks, asset remap, visibility); this file only builds its argv/env and runs it. The dev side is reached with the
 * session `di login` keeps (scripts/stored-login.mjs); the token never appears in argv, output or logs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

// Same rule as scripts/stored-login.mjs (packed apart from the CLI, so a copy; a test pins them equal).
/** Hosts the stored dev token may be sent to: dev.diiii.xyz over https, or loopback / diiii.localhost (an ssh forward, a local stack). */
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

export const DEFAULT_REMOTE = 'https://dev.diiii.xyz'

/** The serverXR base tier-sync wants, from a remote like https://dev.diiii.xyz or https://dev.diiii.xyz/serverXR/. */
export const devBase = (remote) => assertDevHost(`${String(remote || DEFAULT_REMOTE).replace(/\/+$/, '').replace(/\/serverXR$/i, '')}/serverXR`)

/** Dry-run unless apply. `skip` is space/project[,..]; a bare project id is refused by tier-sync itself. */
export const pushArgs = ({ spaceId, apply = false, skip = '' }) => [
    '--from', 'local', '--to', 'dev', '--space', spaceId,
    ...(skip ? ['--skip', skip] : []),
    ...(apply ? [] : ['--dry-run'])
]

/** The local admin token this install keeps in <home>/di.env (never printed). */
export const readAdminToken = (home) => {
    try {
        const line = fs.readFileSync(path.join(home, 'di.env'), 'utf8').split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
        return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : null
    } catch { return null }
}

export const pushEnv = ({ env = process.env, home, localBase, remote }) => {
    const token = readAdminToken(home)
    return {
        ...env,
        LOCAL_API_URL: localBase,
        ...(token ? { API_TOKEN: token } : {}),
        DI_DEV_BASE: env.DI_DEV_BASE ? assertDevHost(env.DI_DEV_BASE) : devBase(remote)
    }
}

/** The installed copy first, then beside cli/ (an install run another way), then a checkout. */
export const findTierSync = ({ here, installedDir }) => [
    installedDir ? path.join(installedDir, 'scripts', 'tier-sync.mjs') : null,
    path.join(here, '..', 'scripts', 'tier-sync.mjs'),
    path.join(here, '..', 'tier-sync.mjs')
].filter(Boolean).find((p) => fs.existsSync(p)) || null

export const runSyncPush = ({ entry, spaceId, apply, skip, home, localBase, remote, spawnFn = spawn }) => new Promise((resolve) => {
    let env
    try { env = pushEnv({ home, localBase, remote }) } catch (err) { process.stderr.write(`${err.message}\n`); resolve(1); return }
    const child = spawnFn(process.execPath, [entry, ...pushArgs({ spaceId, apply, skip })], {
        stdio: 'inherit',
        env
    })
    child.on('error', (err) => {
        process.stderr.write(`could not start the sync tool: ${err.message}\n`)
        resolve(1)
    })
    child.on('exit', (code) => resolve(code ?? 1))
})

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

export const DEFAULT_REMOTE = 'https://dev.diiii.xyz'

/** The serverXR base tier-sync wants, from a remote like https://dev.diiii.xyz or https://dev.diiii.xyz/serverXR/. */
export const devBase = (remote) => `${String(remote || DEFAULT_REMOTE).replace(/\/+$/, '').replace(/\/serverXR$/i, '')}/serverXR`

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
        DI_DEV_BASE: env.DI_DEV_BASE || devBase(remote)
    }
}

/** The installed copy first, then beside cli/ (an install run another way), then a checkout. */
export const findTierSync = ({ here, installedDir }) => [
    installedDir ? path.join(installedDir, 'scripts', 'tier-sync.mjs') : null,
    path.join(here, '..', 'scripts', 'tier-sync.mjs'),
    path.join(here, '..', 'tier-sync.mjs')
].filter(Boolean).find((p) => fs.existsSync(p)) || null

export const runSyncPush = ({ entry, spaceId, apply, skip, home, localBase, remote }) => new Promise((resolve) => {
    const child = spawn(process.execPath, [entry, ...pushArgs({ spaceId, apply, skip })], {
        stdio: 'inherit',
        env: pushEnv({ home, localBase, remote })
    })
    child.on('exit', (code) => resolve(code ?? 1))
})

/**
 * The two update guards (2026-11-26, the Reika desk went back a version).
 *
 * Why: a build was installed from a file ahead of the hub; the 5-minute
 * auto-updater then followed the hub (still on the older commit) and stepped the
 * desk BACK. Dev builds are `0.4.4-dev.<sha8>`, so the version string cannot say
 * which is newer: the order is the commit order on the branch, asked of GitHub's
 * compare endpoint (one GET, only when the two commits differ).
 *
 *   decideDevUpdate      the auto-updater never installs an older (or unrelated) commit
 *                        than the one running, unless `--allow-downgrade` is given
 *                        (that is logged). `di update --rollback` is another door and
 *                        is not touched by this file.
 *   fileUpdateWarning    `di update --from <file>` says loudly when automatic updates
 *                        are on and the hub serves another commit than the file: the
 *                        next tick would undo the file install.
 *
 * Pure: the network and the clock come in as arguments, so the tests need neither.
 */
import fs from 'node:fs'
import path from 'node:path'

import { REPO, hubCommit } from './channels.mjs'
import { paths } from './paths.mjs'

export const DEV_VERSION = /-dev\.([0-9a-f]{8})$/

/** `0.4.4-dev.66bec814` -> `66bec814`; anything else (a release) -> null. */
export const devCommitOf = (version) => DEV_VERSION.exec(String(version || ''))?.[1] || null

/**
 * Where `target` stands against `installed` on the branch: 'same' | 'ahead' (target is newer)
 * | 'behind' (target is older) | 'diverged' | 'unknown' (could not ask).
 */
export const commitOrder = async ({ installed, target, fetchImpl = fetch, timeoutMs = 10000 }) => {
    if (installed === target) return 'same'
    try {
        const url = `https://api.github.com/repos/${REPO}/compare/${installed}...${target}`
        const response = await fetchImpl(url, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'di-updater-guard' },
            signal: AbortSignal.timeout(timeoutMs)
        })
        if (!response.ok) return 'unknown'
        const status = String((await response.json())?.status || '')
        return ['identical', 'ahead', 'behind', 'diverged'].includes(status) ? (status === 'identical' ? 'same' : status) : 'unknown'
    } catch {
        return 'unknown'
    }
}

/** The running build's own commit, from `current/release.json` (null when it cannot be read). */
export const runningCommitOf = (home) => {
    try {
        const release = JSON.parse(fs.readFileSync(path.join(paths(home).current, 'release.json'), 'utf8'))
        const commit = String(release?.gitCommit || '').trim().toLowerCase()
        return /^[0-9a-f]{8,40}$/.test(commit) ? commit : null
    } catch {
        return null
    }
}

/**
 * `commitOrder` with an answer kept per (installed, target) pair: a held tick would otherwise ask
 * GitHub every 5 minutes (60 unauthenticated calls per hour per IP, shared). A pair of commits has
 * one order for ever, so a real answer is kept for good. 'unknown' (an unpushed local commit gets a
 * compare 404 every time) is kept for an hour, then asked again.
 */
export const cachedOrder = ({ read, write, inner = commitOrder, max = 20, now = () => Date.now(), unknownMs = 60 * 60 * 1000 }) => async ({ installed, target }) => {
    if (installed === target) return 'same'
    const key = `${installed}...${target}`
    const cache = (await read()) || {}
    const hit = cache[key]
    if (hit && !String(hit).startsWith('unknown@')) return hit
    if (hit && now() - Number(String(hit).slice(8)) < unknownMs) return 'unknown'
    const where = await inner({ installed, target })
    const next = {}
    for (const k of Object.keys(cache).filter((k) => k !== key).slice(-(max - 1))) next[k] = cache[k]
    next[key] = where === 'unknown' ? `unknown@${now()}` : where
    await write(next)
    return where
}

const heldNote = (reason) => `held: ${reason} — not stepping back. Step back on purpose with: di update --channel dev --allow-downgrade (logged), or di update --rollback`

/**
 * The whole dev-channel decision, pure: what `di update` does with the hub's build.
 *   { action: 'install' | 'hold', note, stepsBack }
 * `auto` is the timer: it holds whenever it cannot prove the target is the same or newer
 * (older, diverged, unordered, running commit unreadable). A hand `di update` goes on and says
 * it steps back. `stepsBack` = the install will move to a commit that is not newer (log it).
 * Holding is the safe answer: a held tick is retried in 5 minutes, a wrong step back on a live rig is not.
 */
export const decideDevUpdate = async ({ installedVersion, runningCommit, targetVersion, auto = false, allowDowngrade = false, order = commitOrder }) => {
    const fromFile = /^[0-9a-f]{8,40}$/.test(String(runningCommit || '')) ? String(runningCommit).slice(0, 8) : null
    const installed = fromFile || (auto ? null : devCommitOf(installedVersion))
    const target = devCommitOf(targetVersion)
    const stepNote = (where) => `${installedVersion} -> ${targetVersion} (commit order: ${where})`
    if (!installed || !target) {
        if (allowDowngrade) return { action: 'install', stepsBack: true, note: `downgrade allowed by flag: ${stepNote('not known')}` }
        if (!auto) return { action: 'install', stepsBack: false, note: null }
        return { action: 'hold', stepsBack: false, note: heldNote(!installed ? 'the running build does not say which commit it is' : "the hub's build does not name a commit") }
    }
    const where = await order({ installed, target })
    if (where === 'same' || where === 'ahead') return { action: 'install', stepsBack: false, note: null }
    if (allowDowngrade) return { action: 'install', stepsBack: true, note: `downgrade allowed by flag: ${stepNote(where)}` }
    const reason = where === 'unknown'
        ? 'could not tell which commit is newer'
        : `the hub serves ${target}, ${where === 'behind' ? 'older than' : 'not a descendant of'} the running ${installed}`
    if (auto) return { action: 'hold', stepsBack: false, note: heldNote(reason) }
    return { action: 'install', stepsBack: true, note: `this steps back: ${reason}; stepping back anyway (hand update)` }
}

/**
 * Text for `di update --from <file>`, or null when nothing needs saying.
 * `autoOn` = the timer is active; `hubReader` returns the hub's commit or throws.
 */
export const fileUpdateWarning = async ({ fileVersion, autoOn, channel, hubReader = () => hubCommit({ timeoutMs: 8000 }) }) => {
    if (!autoOn) return null
    const mine = devCommitOf(fileVersion)
    let hub
    try { hub = await hubReader() } catch (error) {
        return `!! automatic updates are ON and the hub could not be read (${String(error?.message || error)}): if it serves another commit than ${fileVersion}, the next tick (within 5 minutes) may replace this install. Safer first: di autoupdate off`
    }
    if (channel !== 'dev' && !mine) return null // a release file on stable: the hub commit is not what the updater follows
    if (mine && hub.startsWith(mine)) return null
    return `!! automatic updates are ON and the hub serves ${hub.slice(0, 8)}, not ${mine || fileVersion}: the next tick (within 5 minutes) may replace this install with the hub's build (it replaces this install only when the hub's commit is newer than this file's). Run first: di autoupdate off (turn it on again when the hub serves this commit)`
}

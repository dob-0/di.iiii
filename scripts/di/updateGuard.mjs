/**
 * The two update guards (2026-11-26, the Reika desk went back a version).
 *
 * Why: a build was installed from a file ahead of the hub; the 5-minute
 * auto-updater then followed the hub (still on the older commit) and stepped the
 * desk BACK. Dev builds are `0.4.4-dev.<sha8>`, so the version string cannot say
 * which is newer: the order is the commit order on the branch, asked of GitHub's
 * compare endpoint (one GET, only when the two commits differ).
 *
 *   guardAutoDowngrade   the auto-updater never installs an older (or unrelated) commit
 *                        than the one running, unless `--allow-downgrade` is given
 *                        (that is logged). `di update --rollback` is another door and
 *                        is not touched by this file.
 *   fileUpdateWarning    `di update --from <file>` says loudly when automatic updates
 *                        are on and the hub serves another commit than the file: the
 *                        next tick would undo the file install.
 *
 * Pure: the network and the clock come in as arguments, so the tests need neither.
 */
import { REPO, hubCommit } from './channels.mjs'

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

/**
 * Decide for the auto-updater. `target` is the release it is about to install.
 * Returns { allow, why }. Holding is the safe answer: a held tick is retried in 5 minutes,
 * a wrong step back on a live rig is not.
 */
export const guardAutoDowngrade = async ({ installedVersion, targetVersion, allowDowngrade = false, order = commitOrder }) => {
    const installed = devCommitOf(installedVersion)
    const target = devCommitOf(targetVersion)
    if (!installed || !target) return { allow: true, why: 'not a pair of dev builds' } // stable releases are ordered by isNewerVersion
    const where = await order({ installed, target })
    if (where === 'same' || where === 'ahead') return { allow: true, why: where }
    if (allowDowngrade) return { allow: true, why: where, downgrade: true, note: `downgrade allowed by flag: ${installedVersion} -> ${targetVersion} (commit order: ${where})` }
    const reason = where === 'unknown'
        ? 'could not tell which commit is newer'
        : `the hub serves ${target}, ${where === 'behind' ? 'older than' : 'not a descendant of'} the running ${installed}`
    return {
        allow: false,
        why: where,
        note: `held: ${reason} — not stepping back. Step back on purpose with: di update --channel dev --allow-downgrade (logged), or di update --rollback`
    }
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
    return `!! automatic updates are ON and the hub serves ${hub.slice(0, 8)}, not ${mine || fileVersion}: the next tick (within 5 minutes) will move this install to the hub's build, undoing this file. Run first: di autoupdate off (turn it on again when the hub serves this commit)`
}

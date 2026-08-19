/**
 * How di.iiii should run on this machine — decided from probe results alone.
 *
 * Deliberately pure: no spawning, no fs, no network. probe.mjs does all of
 * that and hands the answers in. Every branch below is therefore reachable
 * from a test with a plain object, which is the point — the branch an artist
 * hits is the one nobody can reproduce on their own laptop.
 */

/**
 * The floor is not serverXR's package.json `engines` field (">=22.5.0").
 * node:sqlite landed in 22.5 behind --experimental-sqlite and was only
 * unflagged later in the 22 line, so an artist on 22.6 would meet a crash
 * about an unknown module rather than a sentence they can act on. 22.15 is
 * the first version we are willing to promise.
 */
export const NODE_FLOOR = '22.15.0'

/** "22.15.0" / "v22.15.0" → [22, 15, 0]. Junk sorts as [0,0,0]. */
export const parseVersion = (value) => {
    const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/)
    if (!match) return [0, 0, 0]
    return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export const satisfiesFloor = (version, floor = NODE_FLOOR) => {
    const [aMajor, aMinor, aPatch] = parseVersion(version)
    const [bMajor, bMinor, bPatch] = parseVersion(floor)
    if (aMajor !== bMajor) return aMajor > bMajor
    if (aMinor !== bMinor) return aMinor > bMinor
    return aPatch >= bPatch
}

/**
 * @param {object} probes
 * @param {boolean} probes.dockerRunning   `docker info` succeeded — the daemon
 *   is up, not merely installed. Docker Desktop present but not launched is the
 *   branch that is easiest to get wrong and most common in real life.
 * @param {boolean} probes.imagesPullable  an anonymous GHCR manifest request
 *   returned 200. False while the packages are private, which is why Docker can
 *   never be chosen and then 403 halfway through an install.
 * @param {string|null} probes.systemNode   version of `node` on PATH, if any
 * @param {string|null} probes.vendoredNode version of the Node under DI_HOME
 * @param {boolean} probes.canReachNodeOrg  nodejs.org is reachable, so a
 *   missing/old Node is a download rather than a dead end
 * @param {string} [probes.forcedMode]      DI_MODE, or --docker / --node
 *
 * @returns {{mode: 'docker'|'node'|'none', nodeSource: 'system'|'vendored'|'download'|null, reason: string}}
 */
export const decideMode = (probes = {}) => {
    const {
        dockerRunning = false,
        imagesPullable = false,
        systemNode = null,
        vendoredNode = null,
        canReachNodeOrg = false,
        forcedMode = null
    } = probes

    const nodeSource = () => {
        if (satisfiesFloor(systemNode)) return 'system'
        if (satisfiesFloor(vendoredNode)) return 'vendored'
        if (canReachNodeOrg) return 'download'
        return null
    }

    // An explicit choice is obeyed without probing. Someone who typed --docker
    // wants to know that Docker failed, not to be quietly moved to Node.
    if (forcedMode === 'docker') {
        return { mode: 'docker', nodeSource: null, reason: 'asked for docker' }
    }
    if (forcedMode === 'node') {
        return { mode: 'node', nodeSource: nodeSource(), reason: 'asked for node' }
    }

    // Node first, docker only when node isn't viable (or asked for by name).
    // It used to be the other way around: Docker Desktop merely being open
    // silently landed an artist in the mode with no DI_LOCAL, a non-loopback
    // remoteAddress and no reachable claude binary — every local operator
    // surface (agent board, local Claude chat) 404s there while the wiki
    // promises it works. The container mode is real and kept, but it is the
    // deliberate choice (--docker / DI_MODE=docker), never the accident.
    const source = nodeSource()
    if (source) {
        const why = dockerRunning && imagesPullable
            ? 'node is available — docker stays opt-in (--docker), local surfaces need the host'
            : dockerRunning && !imagesPullable
                ? 'docker is running but the images are not public yet'
                : 'no usable docker'
        return { mode: 'node', nodeSource: source, reason: why }
    }

    if (dockerRunning && imagesPullable) {
        return { mode: 'docker', nodeSource: null, reason: 'no usable node, and docker is running with pullable images' }
    }

    return {
        mode: 'none',
        nodeSource: null,
        reason: dockerRunning
            ? 'docker is running but the images are not pullable, and no node is available'
            : 'neither docker nor node is available'
    }
}

/**
 * What to call the command. `di` is the root the family already implies
 * (di-sync, di-dev-browser had no parent), but it is also a real if obscure
 * packaged utility on Debian and Fedora. Shadowing someone's system tool
 * silently is not ours to do — so if a foreign `di` is on PATH we say so and
 * take `dii`, which the identifier namespace already uses anyway.
 */
export const decideCommandName = ({ foreignDiOnPath = false } = {}) => (
    foreignDiOnPath
        ? { primary: 'dii', alias: null, shadowed: true }
        : { primary: 'di', alias: 'dii', shadowed: false }
)

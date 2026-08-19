// Pure decisions for `di sync` — every refusal is decided here, with no I/O,
// so the semantics are unit-testable without a server (the same reason
// serverXR/src/spaceSyncPlan.js exists for the webhook path).
//
// v1 is an AUDIT: it compares two per-install histories that share no origin
// field and refuses every case it cannot prove. The ledger (see ledger.mjs)
// is the only source of "these two sides once agreed"; without cursors the
// honest relation is `unknown`, and `unknown` blocks both directions. That
// refusal is the feature — the sync this replaces reported "in sync" whenever
// two object COUNTS matched.

// A side, as gathered by sync.mjs:
// { reachable, exists, verbatim, version, objectCount, assetIds, missingAssetIds,
//   projectIds, opsFloor, opsLatest }
// opsFloor = version of the oldest retained op (null when none) — the
// retention wall: anything older than it can only move as a bundle.

export const RELATIONS = Object.freeze({
    UNKNOWN: 'unknown',
    IN_SYNC: 'in-sync-as-of-last-sync',
    LOCAL_AHEAD: 'local-ahead',
    REMOTE_AHEAD: 'remote-ahead',
    DIVERGED: 'diverged'
})

const refusal = (code, message) => ({ code, message })

// Map a local asset id to the id the remote knows it by (EXIF scrub remap),
// falling back to identity — the remap only ever exists for re-encoded images.
const toRemoteId = (assetIdRemap, id) => assetIdRemap?.[id] || id

export const buildSyncAudit = ({ local, remote, ledger }) => {
    const refusals = []

    if (!ledger) {
        refusals.push(refusal('unlinked', 'this space is not linked — di link first'))
    }
    if (!local?.reachable) {
        refusals.push(refusal('local-down', 'the local server is not answering'))
    } else if (!local.exists) {
        refusals.push(refusal('local-missing', 'the space does not exist locally'))
    } else if (local.denied) {
        refusals.push(refusal('local-denied', 'the local server refused to show this space'))
    } else if (!local.verbatim) {
        refusals.push(refusal('local-no-verbatim', 'the local server cannot serve a verbatim scene — update it'))
    }
    if (!remote?.reachable) {
        refusals.push(refusal('remote-down', 'the remote is not answering'))
    } else if (!remote.exists) {
        refusals.push(refusal('remote-missing', 'the space does not exist on the remote'))
    } else if (remote.denied) {
        refusals.push(refusal('remote-denied', 'the remote refused the key — mint a fresh one in the space settings online'))
    } else if (!remote.verbatim) {
        // an older server ignores ?verbatim=1 and answers with its filtered,
        // URL-rewritten rendering — copying that is the manifest-erasure bug
        refusals.push(refusal('remote-no-verbatim', 'the remote cannot serve a verbatim scene, so nothing it returns is safe to copy'))
    }

    // Relation: only the ledger's cursors can anchor it. version is a
    // per-install counter, so cross-side comparison is meaningless — the only
    // provable statements are "this side moved since the last sync" per side.
    let relation = RELATIONS.UNKNOWN
    const cursors = ledger?.cursors || null
    if (cursors && local?.reachable && remote?.reachable && local.exists && remote.exists) {
        const localMoved = local.version !== cursors.localVersion
        const remoteMoved = remote.version !== cursors.remoteVersion
        relation = localMoved && remoteMoved ? RELATIONS.DIVERGED
            : localMoved ? RELATIONS.LOCAL_AHEAD
            : remoteMoved ? RELATIONS.REMOTE_AHEAD
            : RELATIONS.IN_SYNC
    }

    // The retention wall, per direction: ops can carry a side's changes only
    // if the retained window still reaches back to the cursor. opsFloor is
    // the oldest retained op's version; a gap means bundle-only (PR 5).
    const opsCover = (side, cursorVersion) => {
        if (!side?.reachable || !side.exists) return false
        if (cursorVersion === null || cursorVersion === undefined) return false
        if (side.version === cursorVersion) return true // nothing to carry
        if (side.opsFloor === null || side.opsFloor === undefined) return false
        return side.opsFloor <= cursorVersion + 1
    }

    const push = { allowed: false, reasons: [] }
    const pull = { allowed: false, reasons: [] }
    for (const r of refusals) {
        push.reasons.push(r.message)
        pull.reasons.push(r.message)
    }
    if (!refusals.length) {
        if (!cursors) {
            const msg = 'never synced — no baseline to prove against (a first --push or --pull will establish one)'
            push.reasons.push(msg)
            pull.reasons.push(msg)
        } else {
            if (relation === RELATIONS.DIVERGED) {
                push.reasons.push('both sides changed since the last sync — nothing can prove whose history wins')
                pull.reasons.push('both sides changed since the last sync — nothing can prove whose history wins')
            } else {
                if (relation === RELATIONS.REMOTE_AHEAD || relation === RELATIONS.IN_SYNC) {
                    push.reasons.push(relation === RELATIONS.IN_SYNC ? 'nothing to push' : 'the remote is ahead — pull first')
                } else if (!opsCover(local, cursors.localVersion)) {
                    push.reasons.push('the local op window no longer reaches the last sync — only a bundle can carry this (retention wall)')
                } else {
                    push.allowed = true
                }
                if (relation === RELATIONS.LOCAL_AHEAD || relation === RELATIONS.IN_SYNC) {
                    pull.reasons.push(relation === RELATIONS.IN_SYNC ? 'nothing to pull' : 'local is ahead — push first')
                } else if (!opsCover(remote, cursors.remoteVersion)) {
                    pull.reasons.push('the remote op window no longer reaches the last sync — only a bundle can carry this (retention wall)')
                } else {
                    pull.allowed = true
                }
            }
        }
    }

    // Asset diff, in the remote's id space (the remap direction the pushes
    // establish). "missing" per side = manifest entries whose bytes that side
    // does not hold — exactly what ?verbatim=1's missingAssetIds proves.
    const remap = ledger?.assetIdRemap || {}
    const localIds = new Set((local?.assetIds || []).map((id) => toRemoteId(remap, id)))
    const remoteIds = new Set(remote?.assetIds || [])
    const assets = {
        onlyLocal: [...localIds].filter((id) => !remoteIds.has(id)),
        onlyRemote: [...remoteIds].filter((id) => !localIds.has(id)),
        common: [...localIds].filter((id) => remoteIds.has(id)),
        missingLocal: local?.missingAssetIds || [],
        missingRemote: remote?.missingAssetIds || []
    }

    const localProjects = new Set(local?.projectIds || [])
    const remoteProjects = new Set(remote?.projectIds || [])
    const projects = {
        onlyLocal: [...localProjects].filter((id) => !remoteProjects.has(id)),
        onlyRemote: [...remoteProjects].filter((id) => !localProjects.has(id)),
        common: [...localProjects].filter((id) => remoteProjects.has(id))
    }

    return { relation, refusals, push, pull, assets, projects }
}

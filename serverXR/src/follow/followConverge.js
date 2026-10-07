/**
 * When the two copies of a followed work disagree, the host's copy wins.
 *
 * Both sides end up holding the same ops (followPlan.js), but not always in the
 * same ORDER: an edit made here and an edit made there at the same moment land
 * mine-then-yours on one machine and yours-then-mine on the other. Where they
 * touch the same thing — two people moving one box — the last one applied wins,
 * and "last" is different on each side. Nothing is lost from either log, yet the
 * two rooms show different things, quietly and for good.
 *
 * The rule here is the one a server-ordered multiplayer editor uses (Figma,
 * "How Figma's multiplayer technology works", E. Wallace, 2019: the server's
 * order is the order, and the last value it received wins). In a follow the
 * server that orders is the HOST — the install whose space is followed. When a
 * stream has gone quiet after both sides moved, the follower compares the two
 * copies, and if they differ it writes the host's copy over its own, as one
 * `replaceDocument` / `replaceScene` op through its own write route: the same
 * version check, the same restore point before a change, the same broadcast to
 * every open browser.
 *
 * What that costs, stated plainly: of two edits to the SAME thing at the same
 * moment, the follower's is the one that is undone. Edits to different things
 * are never touched — they were already in both copies. A merge that keeps both
 * people's intent (an op-based CRDT, Kleppmann et al., "Local-first software",
 * Onward! 2019) is the next step, not this one.
 *
 * Pure: no I/O. follower.js reads the two documents and writes the op.
 */

/** Ops this follower writes to make the copies agree — never carried, never reported as a refusal. */
const CONVERGE_CLIENT = 'di-follow-converge'

/** Key-order-independent JSON, so two equal documents compare equal however they were built. */
const stable = (value) => {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    }
    return JSON.stringify(value ?? null)
}

/**
 * The part of a document both machines must agree on. Left out: what each
 * install stamps for itself (its version counter, its own timestamps) and the
 * asset URL a GET fills in when the stored one is empty.
 */
const comparableProject = (document, projectId) => {
    if (!document || typeof document !== 'object') return null
    const { projectMeta, version, ...rest } = document
    const filled = `/api/projects/${projectId}/assets/`
    return {
        ...rest,
        title: projectMeta?.title ?? null,
        assets: (Array.isArray(rest.assets) ? rest.assets : []).map((asset) => (
            asset && typeof asset.url === 'string' && asset.url === `${filled}${asset.id}` ? { ...asset, url: '' } : asset
        ))
    }
}

const comparableScene = (scene) => {
    if (!scene || typeof scene !== 'object') return null
    const { version, updatedAt, lastModified, ...rest } = scene
    return rest
}

/** What one side's document GET answered, as { body, version } — or null when it cannot be read. */
const readDocument = (kind, payload) => {
    if (!payload || typeof payload !== 'object') return null
    const body = kind === 'scene' ? payload.scene : payload.document
    if (!body || typeof body !== 'object') return null
    return { body, version: Number.isFinite(payload.version) ? payload.version : null }
}

/** A copy with nothing in it — the one thing the host's copy may never overwrite a full one with. */
const isBlank = (kind, body) => {
    const count = (list) => (Array.isArray(list) ? list.length : 0)
    if (kind === 'scene') return count(body?.objects) === 0
    return count(body?.entities) + count(body?.nodes) + count(body?.assets) === 0
}

/** The ids in `a` that `b` does not hold, for the lists a copy is made of. An item with no id counts by its content. */
const missingFrom = (a, b) => {
    const key = (item) => (item && typeof item === 'object' && item.id !== undefined ? `id:${item.id}` : `v:${stable(item)}`)
    const there = new Set((Array.isArray(b) ? b : []).map(key))
    return (Array.isArray(a) ? a : []).filter((item) => !there.has(key(item))).length
}

/**
 * What the local copy holds that the host's does not — the work a host-wins
 * overwrite would erase (audit F4). Counts by id, so a changed field is not
 * "ahead" (that is the ordinary disagreement the host wins) but an added
 * entity, node, asset or scene object is.
 */
const localOnly = (kind, local, remote) => (kind === 'scene'
    ? { objects: missingFrom(local?.objects, remote?.objects) }
    : {
        entities: missingFrom(local?.entities, remote?.entities),
        nodes: missingFrom(local?.nodes, remote?.nodes),
        assets: missingFrom(local?.assets, remote?.assets)
    })

const total = (counts) => Object.values(counts).reduce((sum, n) => sum + n, 0)

const SINGULAR = { entities: 'entity', nodes: 'node', assets: 'asset', objects: 'object' }
/** "3 entities, 1 asset" — nothing for zero. */
const describeCounts = (counts) => Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${n} ${n === 1 ? SINGULAR[name] || name : name}`)
    .join(', ')

const DIRECTIONS = ['take-host', 'take-mine']

/**
 * The op that makes `local` equal `remote` (the host), or why not.
 *   { same: true }                        — the copies already agree
 *   { refused: '…', localOnly }           — they differ, and overwriting would be wrong
 *   { op, baseVersion }                   — write this to the local side
 *   { op, baseVersion, target: 'remote' } — `take-mine`: write this to the host
 *
 * `direction` is the person's answer to a refusal (`di follow --take-host` /
 * `--take-mine`), never a default: without one, a difference where this copy
 * holds something the host lacks is refused, so work that exists only here is
 * never erased by a follow start (audit F4).
 */
const planConverge = ({ kind, projectId = null, local, remote, direction = null, seedHost = false }) => {
    if (!local || !remote) return { refused: 'could not read both copies' }
    const a = kind === 'scene' ? comparableScene(local.body) : comparableProject(local.body, projectId)
    const b = kind === 'scene' ? comparableScene(remote.body) : comparableProject(remote.body, projectId)
    if (stable(a) === stable(b)) return { same: true }
    const ahead = localOnly(kind, local.body, remote.body)
    // The host's copy is empty BECAUSE this follow just made it (a project that
    // existed only here — followPlan's makeMissing — whose content was never an
    // op a follow carries: an import, a restored document). That is not a host
    // that lost its disk, and it is not a disagreement: the new copy is waiting
    // for this one. Fill it, once, with no refusal and no person asked.
    if (seedHost && !direction && isBlank(kind, remote.body) && !isBlank(kind, local.body)) {
        if (!Number.isFinite(remote.version)) return { refused: "the host's new copy has no version to write against" }
        const mine = kind === 'scene'
            ? { type: 'replaceScene', payload: { scene: local.body } }
            : { type: 'replaceDocument', payload: { document: local.body } }
        return { op: { ...mine, clientId: CONVERGE_CLIENT }, baseVersion: remote.version, target: 'remote', direction: null, seeded: true, localOnly: ahead }
    }
    // An empty host and a full follower is not a disagreement about an edit:
    // it is a host that lost its disk, or was never filled. Overwriting would
    // erase the only copy of the work. Said out loud, never done.
    if (isBlank(kind, remote.body) && !isBlank(kind, local.body) && direction !== 'take-mine') {
        return { refused: "the host's copy is empty and this one is not — not overwriting it; check the host" }
    }
    if (direction === 'take-mine') {
        if (!Number.isFinite(remote.version)) return { refused: "the host's copy has no version to write against" }
        const mine = kind === 'scene'
            ? { type: 'replaceScene', payload: { scene: local.body } }
            : { type: 'replaceDocument', payload: { document: local.body } }
        return { op: { ...mine, clientId: CONVERGE_CLIENT }, baseVersion: remote.version, target: 'remote', direction, localOnly: ahead }
    }
    if (!direction && total(ahead) > 0) {
        return {
            refused: `this copy holds ${describeCounts(ahead)} the host lacks — not overwriting it`,
            localOnly: ahead
        }
    }
    if (!Number.isFinite(local.version)) return { refused: 'this copy has no version to write against' }
    const op = kind === 'scene'
        ? { type: 'replaceScene', payload: { scene: remote.body } }
        : { type: 'replaceDocument', payload: { document: remote.body } }
    return { op: { ...op, clientId: CONVERGE_CLIENT }, baseVersion: local.version, direction, localOnly: ahead }
}

module.exports = { CONVERGE_CLIENT, DIRECTIONS, localOnly, describeCounts, stable, comparableProject, comparableScene, readDocument, isBlank, planConverge }
